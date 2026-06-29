const db = require('../config/db');

// 1. Obtener pedidos de un repartidor en una fecha específica
const obtenerRutaDelDia = async (req, res) => {
    const { repId, fecha } = req.params;
    try {
        const query = `
            SELECT 
                p.id, p.fecha, p.total, p.estatus,
                c.nombre AS cliente_nombre, c.saldo_deudor, c.limite_credito
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            WHERE p.repartidor_id = ? AND p.fecha = ?
        `;
        const [rows] = await db.query(query, [repId, fecha]);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener la ruta:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// 2. Obtener el resumen del día para un repartidor
const obtenerResumenRepartidor = async (req, res) => {
    const { repId, fecha } = req.params;
    try {
        const [pedidos] = await db.query(
            "SELECT COUNT(id) as total_entregados, IFNULL(SUM(total), 0) as total_cobrado FROM pedidos WHERE repartidor_id = ? AND fecha = ? AND estatus = 'entregado'",
            [repId, fecha]
        );
        const [gastos] = await db.query(
            "SELECT IFNULL(SUM(monto), 0) as total_gastos FROM gastos WHERE repartidor_id = ? AND fecha = ?",
            [repId, fecha]
        );
        res.json({
            entregados: pedidos[0].total_entregados,
            cobrado: pedidos[0].total_cobrado,
            gastos: gastos[0].total_gastos
        });
    } catch (error) {
        console.error('Error al generar resumen:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// 3. Marcar pedido como entregado
const entregarPedido = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("UPDATE pedidos SET estatus = 'entregado' WHERE id = ?", [id]);
        res.json({ mensaje: 'Pedido entregado correctamente' });
    } catch (error) {
        console.error('Error al entregar:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// 4. Reagendar pedido automáticamente para el día siguiente
const reagendarPedido = async (req, res) => {
    const { id } = req.params;
    try {
        const [pedido] = await db.query("SELECT cliente_id, repartidor_id, total FROM pedidos WHERE id = ?", [id]);
        if (pedido.length === 0) return res.status(404).json({ mensaje: 'Pedido no encontrado' });
        
        const { cliente_id, repartidor_id, total } = pedido[0];
        await db.query("UPDATE pedidos SET estatus = 'reagendado' WHERE id = ?", [id]);
        await db.query(
            "INSERT INTO pedidos (cliente_id, repartidor_id, fecha, total, estatus, reagendado_de) VALUES (?, ?, DATE_ADD(CURDATE(), INTERVAL 1 DAY), ?, 'pendiente', ?)",
            [cliente_id, repartidor_id, total, id]
        );
        res.json({ mensaje: 'Pedido reagendado para mañana exitosamente' });
    } catch (error) {
        console.error('Error al reagendar:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// 5. Crear un nuevo pedido (Asignación desde el Panel Admin)
const crearPedido = async (req, res) => {
    const { cliente_id, repartidor_id, total } = req.body;
    try {
        const [clientes] = await db.query(
            "SELECT limite_credito, saldo_deudor, estatus FROM clientes WHERE id = ?", 
            [cliente_id]
        );
        if (clientes.length === 0) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
        
        const cliente = clientes[0];
        
        // Validación de bloqueo
        if (cliente.estatus === 'bloqueado') {
            return res.status(400).json({ mensaje: 'Error: El cliente está bloqueado en el sistema.' });
        }
        
        // Validación de crédito
        const nuevoSaldoDeudor = parseFloat(cliente.saldo_deudor) + parseFloat(total);
        if (nuevoSaldoDeudor > parseFloat(cliente.limite_credito)) {
            const disponible = parseFloat(cliente.limite_credito) - parseFloat(cliente.saldo_deudor);
            return res.status(400).json({ mensaje: `Límite de crédito excedido. El cliente solo tiene disponible: $${disponible.toFixed(2)}` });
        }

        const [resultado] = await db.query(
            "INSERT INTO pedidos (cliente_id, repartidor_id, fecha, total, estatus) VALUES (?, ?, CURDATE(), ?, 'pendiente')",
            [cliente_id, repartidor_id, total]
        );
        
        await db.query("UPDATE clientes SET saldo_deudor = ? WHERE id = ?", [nuevoSaldoDeudor, cliente_id]);
        
        res.status(201).json({ mensaje: 'Pedido asignado exitosamente al repartidor', pedido_id: resultado.insertId });
    } catch (error) {
        console.error('Error al crear el pedido:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// 6. Obtener todos los pedidos para el monitor del administrador
const obtenerPedidos = async (req, res) => {
    try {
        const [pedidos] = await db.query(`
            SELECT p.id, c.nombre as cliente, r.nombre as repartidor, p.total, p.estatus, DATE_FORMAT(p.fecha, '%Y-%m-%d') as fecha
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            JOIN repartidores r ON p.repartidor_id = r.id
            ORDER BY p.fecha DESC, p.id DESC
        `);
        res.json(pedidos);
    } catch (error) {
        console.error("Error al obtener pedidos:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = { obtenerRutaDelDia, obtenerResumenRepartidor, entregarPedido, reagendarPedido, crearPedido, obtenerPedidos };