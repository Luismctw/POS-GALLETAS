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

// Editar un gasto (categoría, monto, descripción)
const editarGasto = async (req, res) => {
    const { id } = req.params;
    const { categoria, monto, descripcion } = req.body;
    if (!monto) return res.status(400).json({ mensaje: 'Falta el monto' });
    try {
        const [r] = await db.query(
            "UPDATE gastos SET categoria = COALESCE(?, categoria), monto = ?, descripcion = ? WHERE id = ?",
            [categoria || null, monto, descripcion || null, id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'Gasto no encontrado' });
        res.json({ mensaje: 'Gasto actualizado' });
    } catch (e) {
        console.error('Error al editar gasto:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Eliminar un gasto
const eliminarGasto = async (req, res) => {
    const { id } = req.params;
    try {
        const [r] = await db.query("DELETE FROM gastos WHERE id = ?", [id]);
        if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'Gasto no encontrado' });
        res.json({ mensaje: 'Gasto eliminado' });
    } catch (e) {
        console.error('Error al eliminar gasto:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

module.exports = { registrarGasto, obtenerGastosRepartidor, editarGasto, eliminarGasto };
