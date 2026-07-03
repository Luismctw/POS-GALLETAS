const db = require('../config/db');

// Registrar un nuevo gasto de repartidor (con foto opcional del ticket)
const registrarGasto = async (req, res) => {
    const { repartidor_id, fecha, categoria, monto, descripcion } = req.body;
    const foto_ticket = req.file ? req.file.filename : null;

    if (!repartidor_id || !monto) {
        return res.status(400).json({ mensaje: "Faltan datos del gasto" });
    }

    try {
        await db.query(
            `INSERT INTO gastos (repartidor_id, fecha, categoria, monto, foto_ticket, descripcion)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [repartidor_id, fecha || new Date().toISOString().split('T')[0], categoria, monto, foto_ticket, descripcion || null]
        );
        res.json({ mensaje: 'Gasto registrado correctamente' });
    } catch (error) {
        console.error('Error al registrar gasto:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Obtener gastos de un repartidor en una fecha (para la app móvil)
const obtenerGastosRepartidor = async (req, res) => {
    const { repartidor_id, fecha } = req.query;
    if (!repartidor_id) return res.status(400).json({ mensaje: 'Falta repartidor_id' });
    try {
        const [rows] = await db.query(
            `SELECT id, categoria, monto, foto_ticket, descripcion,
                    DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha
             FROM gastos WHERE repartidor_id = ? AND fecha = ?
             ORDER BY id DESC`,
            [repartidor_id, fecha || new Date().toISOString().split('T')[0]]
        );
        res.json(rows);
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno' });
    }
};

module.exports = { registrarGasto, obtenerGastosRepartidor };
