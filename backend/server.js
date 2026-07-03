const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
// Carga .env desde la carpeta backend/ sin importar desde dónde se inicie el proceso
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const db = require('./config/db');

// ====================== TOKENS ADMIN ======================
const adminTokens = new Set();

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ mensaje: 'Contraseña incorrecta' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.add(token);
    res.json({ token });
});

const adminAuth = (req, res, next) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    if (!adminTokens.has(token)) {
        return res.status(401).json({ mensaje: 'No autorizado. Inicia sesión como administrador.' });
    }
    next();
};

// ====================== RUTAS PÚBLICAS (repartidor) ======================
const pedidoCtrl = require('./controllers/pedidoController');
app.get( '/api/pedidos/ruta/:repId/:fecha',    pedidoCtrl.obtenerRutaDelDia);
app.get( '/api/pedidos/resumen/:repId/:fecha', pedidoCtrl.obtenerResumenRepartidor);
app.patch('/api/pedidos/:id/entregar',         pedidoCtrl.entregarPedido);
app.patch('/api/pedidos/:id/reagendar',        pedidoCtrl.reagendarPedido);
app.get( '/api/pedidos/datos-movil',           pedidoCtrl.datosMovil);          // clientes + repartidores para la app
app.post('/api/pedidos/repartidor',            pedidoCtrl.crearPedidoRepartidor); // #9 repartidor crea pedido
app.patch('/api/pedidos/:id/reasignar',        pedidoCtrl.reasignarPedido);       // #3 reasignar entre repartidores
app.patch('/api/pedidos/:id/editar-movil',     pedidoCtrl.editarPedido);          // #7 repartidor edita pedido desde el cel
app.post('/api/repartidores/auth',             require('./controllers/repartidorController').autenticarRepartidor);
app.use('/api/gastos', require('./routes/gastoRoutes'));

// ====================== RUTAS PROTEGIDAS (admin) ======================
app.use('/api/repartidores', adminAuth, require('./routes/repartidorRoutes'));
app.use('/api/pedidos',      adminAuth, require('./routes/pedidoRoutes'));
app.use('/api/clientes',     adminAuth, require('./routes/clienteRoutes'));
app.use('/api/produccion',   adminAuth, require('./routes/produccionRoutes'));
app.use('/api/compras',      adminAuth, require('./routes/compraRoutes'));
app.use('/api/balance',      adminAuth, require('./routes/balanceRoutes'));
app.use('/api/deudas-negocio', adminAuth, require('./routes/deudaNegocioRoutes'));

// Endpoint manual "Cerrar el día"
app.post('/api/admin/cerrar-dia', adminAuth, async (req, res) => {
    try {
        // Contar pendientes ANTES de cerrar para el resumen
        const [[{ sin_asignar }]] = await db.query(
            "SELECT COUNT(*) AS sin_asignar FROM pedidos WHERE estatus = 'creado'"
        );
        const [[{ ya_reagendados }]] = await db.query(
            "SELECT COUNT(*) AS ya_reagendados FROM pedidos WHERE estatus = 'pendiente' AND veces_reagendado > 0"
        );

        const reagendados = await autoReagendarPendientes();

        res.json({
            reagendados,
            sin_asignar: Number(sin_asignar),
            ya_reagendados: Number(ya_reagendados)
        });
    } catch (e) {
        console.error('Error al cerrar el día:', e);
        res.status(500).json({ mensaje: 'Error al cerrar el día' });
    }
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

// ====================== AUTO-REAGENDAR ======================
async function autoReagendarPendientes() {
    const [pendientes] = await db.query(`
        SELECT id, cliente_id, repartidor_id, contenido, piezas, total, fecha_creacion, veces_reagendado
        FROM pedidos
        WHERE estatus = 'pendiente' AND fecha < CURDATE()
    `);

    for (const p of pendientes) {
        await db.query("UPDATE pedidos SET estatus = 'reagendado' WHERE id = ?", [p.id]);
        await db.query(`
            INSERT INTO pedidos (cliente_id, repartidor_id, contenido, piezas, total, estatus, fecha, fecha_creacion, reagendado_de, veces_reagendado)
            VALUES (?, ?, ?, ?, ?, 'pendiente', CURDATE(), ?, ?, ?)
        `, [p.cliente_id, p.repartidor_id, p.contenido, p.piezas, p.total,
            p.fecha_creacion, p.id, (p.veces_reagendado || 0) + 1]);
    }

    if (pendientes.length > 0) {
        console.log(`🔄 Auto-reagendado: ${pendientes.length} pedido(s) movidos a hoy`);
    }
    return pendientes.length;
}

// Ejecutar al arrancar (recupera pedidos que quedaron del día anterior)
setTimeout(autoReagendarPendientes, 5000);

// Programar a medianoche cada día
function programarMedianoche() {
    const ahora   = new Date();
    const maniana = new Date(ahora);
    maniana.setDate(maniana.getDate() + 1);
    maniana.setHours(0, 5, 0, 0); // 00:05 AM
    const ms = maniana - ahora;
    setTimeout(() => {
        autoReagendarPendientes().catch(console.error);
        hacerBackupDiario();
        programarMedianoche();
    }, ms);
    console.log(`⏰ Auto-reagenda programado en ${Math.round(ms / 3600000)}h`);
}

// ====================== BACKUP DIARIO ======================
function hacerBackupDiario() {
    try {
        const { hacerBackup } = require('./scripts/backup');
        hacerBackup();
    } catch (e) {
        console.error('Error al hacer backup:', e.message);
    }
}

// ====================== INICIO ======================
app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
    console.log(`   Panel admin:  http://localhost:${port}/dashboard.html`);
    console.log(`   App móvil:    http://localhost:${port}/ruta_movil.html`);
    console.log(`   Admin pass:   ${process.env.ADMIN_PASSWORD ? '✓ configurada' : '⚠ no definida'}`);
    programarMedianoche();
});
