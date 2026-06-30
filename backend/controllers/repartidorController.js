const db = require('../config/db');

const obtenerRepartidores = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, nombre, estatus FROM repartidores ORDER BY id");
        res.json(rows);
    } catch (e) {
        res.status(500).json({ mensaje: 'Error al obtener repartidores' });
    }
};

const crearRepartidor = async (req, res) => {
    const { nombre, pin } = req.body;
    if (!nombre || !pin) return res.status(400).json({ mensaje: 'Nombre y PIN son obligatorios' });
    try {
        await db.query("INSERT INTO repartidores (nombre, pin, estatus) VALUES (?, ?, 'activo')", [nombre, pin]);
        res.status(201).json({ mensaje: 'Repartidor agregado con éxito' });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ mensaje: 'Ese PIN ya está en uso' });
        res.status(500).json({ mensaje: 'Error al crear repartidor' });
    }
};

const editarRepartidor = async (req, res) => {
    const { id } = req.params;
    const { nombre, pin } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    try {
        const campos = pin
            ? 'UPDATE repartidores SET nombre=?, pin=? WHERE id=?'
            : 'UPDATE repartidores SET nombre=? WHERE id=?';
        const valores = pin ? [nombre, pin, id] : [nombre, id];
        await db.query(campos, valores);
        res.json({ mensaje: 'Repartidor actualizado' });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ mensaje: 'Ese PIN ya está en uso' });
        res.status(500).json({ mensaje: 'Error al editar repartidor' });
    }
};

const toggleRepartidor = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT estatus FROM repartidores WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ mensaje: 'No encontrado' });
        const nuevo = rows[0].estatus === 'activo' ? 'inactivo' : 'activo';
        await db.query('UPDATE repartidores SET estatus = ? WHERE id = ?', [nuevo, id]);
        res.json({ mensaje: `Repartidor ${nuevo}`, estatus: nuevo });
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno' });
    }
};

const autenticarRepartidor = async (req, res) => {
    const { pin } = req.body;
    try {
        const [rows] = await db.query(
            "SELECT id, nombre FROM repartidores WHERE pin = ? AND estatus = 'activo'", [pin]
        );
        if (!rows.length) return res.status(401).json({ mensaje: 'PIN incorrecto o repartidor inactivo' });
        res.json({ mensaje: 'Login exitoso', repartidor: rows[0] });
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

module.exports = { obtenerRepartidores, crearRepartidor, editarRepartidor, toggleRepartidor, autenticarRepartidor };
