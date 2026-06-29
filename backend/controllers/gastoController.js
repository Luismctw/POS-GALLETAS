const db = require('../config/db');

// Registrar un nuevo gasto
const registrarGasto = async (req, res) => {
    // req.body contiene los datos de texto
    const { repartidor_id, fecha, categoria, monto } = req.body;
    
    // req.file contiene la imagen (si el repartidor adjuntó una)
    const foto_ticket = req.file ? req.file.filename : null;

    try {
        const query = `
            INSERT INTO gastos (repartidor_id, fecha, categoria, monto, foto_ticket)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        await db.query(query, [repartidor_id, fecha, categoria, monto, foto_ticket]);
        
        res.json({ mensaje: 'Gasto registrado correctamente' });
    } catch (error) {
        console.error('Error al registrar gasto:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

module.exports = { registrarGasto };