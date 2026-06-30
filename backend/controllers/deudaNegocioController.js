const db = require('../config/db');

const obtenerDeudas = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT *, (monto_total - monto_pagado) AS saldo_pendiente
             FROM deudas_negocio ORDER BY estatus ASC, fecha_vencimiento ASC`
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ mensaje: 'Error al obtener deudas' }); }
};

const crearDeuda = async (req, res) => {
    const { proveedor, concepto, monto_total, fecha, fecha_vencimiento, notas } = req.body;
    if (!proveedor || !concepto || !monto_total || !fecha)
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    try {
        await db.query(
            `INSERT INTO deudas_negocio (proveedor, concepto, monto_total, fecha, fecha_vencimiento, notas)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [proveedor, concepto, monto_total, fecha, fecha_vencimiento || null, notas || null]
        );
        res.status(201).json({ mensaje: 'Deuda registrada' });
    } catch (e) { res.status(500).json({ mensaje: 'Error al registrar deuda' }); }
};

const registrarAbono = async (req, res) => {
    const { id } = req.params;
    const { monto_abono } = req.body;
    const abono = parseFloat(monto_abono);
    if (!abono || abono <= 0) return res.status(400).json({ mensaje: 'Monto inválido' });
    try {
        const [rows] = await db.query('SELECT monto_total, monto_pagado FROM deudas_negocio WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ mensaje: 'Deuda no encontrada' });
        const nuevo_pagado = Math.min(parseFloat(rows[0].monto_total), parseFloat(rows[0].monto_pagado) + abono);
        const estatus = nuevo_pagado >= parseFloat(rows[0].monto_total) ? 'pagada'
                      : nuevo_pagado > 0 ? 'parcial' : 'pendiente';
        await db.query(
            'UPDATE deudas_negocio SET monto_pagado = ?, estatus = ? WHERE id = ?',
            [nuevo_pagado, estatus, id]
        );
        res.json({ mensaje: 'Abono registrado' });
    } catch (e) { res.status(500).json({ mensaje: 'Error al registrar abono' }); }
};

module.exports = { obtenerDeudas, crearDeuda, registrarAbono };
