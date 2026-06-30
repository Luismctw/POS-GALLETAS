const db = require('../config/db');

const obtenerClientes = async (req, res) => {
    try {
        const [clientes] = await db.query("SELECT * FROM clientes ORDER BY nombre");
        res.json(clientes);
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

const obtenerDeudas = async (req, res) => {
    try {
        const [deudas] = await db.query(
            `SELECT id, nombre, telefono, limite_credito, saldo_deudor,
                    (limite_credito - saldo_deudor) AS credito_disponible
             FROM clientes WHERE saldo_deudor > 0 ORDER BY saldo_deudor DESC`
        );
        const [tot] = await db.query("SELECT IFNULL(SUM(saldo_deudor),0) AS total_por_cobrar FROM clientes");
        res.json({ total_por_cobrar: parseFloat(tot[0].total_por_cobrar).toFixed(2), deudas });
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

const registrarCobro = async (req, res) => {
    const { id } = req.params;
    const { monto_abono, notas } = req.body;
    if (!monto_abono || monto_abono <= 0)
        return res.status(400).json({ mensaje: 'El monto debe ser mayor a 0' });
    try {
        await db.query('START TRANSACTION');
        const [cli] = await db.query('SELECT saldo_deudor FROM clientes WHERE id = ?', [id]);
        if (!cli.length) { await db.query('ROLLBACK'); return res.status(404).json({ mensaje: 'Cliente no encontrado' }); }

        const nuevo = Math.max(0, parseFloat(cli[0].saldo_deudor) - parseFloat(monto_abono));
        await db.query('UPDATE clientes SET saldo_deudor = ? WHERE id = ?', [nuevo, id]);
        await db.query(
            'INSERT INTO historial_cobros (cliente_id, monto, tipo, notas) VALUES (?, ?, "abono_admin", ?)',
            [id, monto_abono, notas || null]
        );
        await db.query('COMMIT');
        res.json({ mensaje: 'Abono registrado exitosamente', saldo_nuevo: nuevo });
    } catch (e) {
        await db.query('ROLLBACK');
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

const crearCliente = async (req, res) => {
    const { nombre, direccion, telefono, limite_credito } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    try {
        await db.query(
            "INSERT INTO clientes (nombre, direccion, telefono, limite_credito, saldo_deudor, estatus) VALUES (?, ?, ?, ?, 0.00, 'activo')",
            [nombre, direccion || '', telefono || '', limite_credito || 0]
        );
        res.status(201).json({ mensaje: 'Cliente guardado exitosamente' });
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

const editarCliente = async (req, res) => {
    const { id } = req.params;
    const { nombre, direccion, telefono, limite_credito } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    try {
        await db.query(
            'UPDATE clientes SET nombre=?, direccion=?, telefono=?, limite_credito=? WHERE id=?',
            [nombre, direccion || '', telefono || '', limite_credito || 0, id]
        );
        res.json({ mensaje: 'Cliente actualizado' });
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

const toggleBloqueo = async (req, res) => {
    const { id } = req.params;
    try {
        const [cli] = await db.query('SELECT estatus FROM clientes WHERE id = ?', [id]);
        if (!cli.length) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
        const nuevo = cli[0].estatus === 'activo' ? 'bloqueado' : 'activo';
        await db.query('UPDATE clientes SET estatus = ? WHERE id = ?', [nuevo, id]);
        res.json({ mensaje: `Cliente ${nuevo === 'bloqueado' ? 'bloqueado' : 'desbloqueado'}`, estatus: nuevo });
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

const obtenerHistorialCobros = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            `SELECT h.id, h.monto, h.tipo, h.notas,
                    DATE_FORMAT(h.fecha, '%Y-%m-%d %H:%i') AS fecha
             FROM historial_cobros h WHERE h.cliente_id = ? ORDER BY h.fecha DESC LIMIT 30`,
            [id]
        );
        res.json(rows);
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

module.exports = { obtenerClientes, obtenerDeudas, registrarCobro, crearCliente, editarCliente, toggleBloqueo, obtenerHistorialCobros };
