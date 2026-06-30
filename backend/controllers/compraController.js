const db = require('../config/db');

// Registrar una compra de materia prima (genera un ticket de compra)
// - guarda el ticket (proveedor, cantidad, costo)
// - suma la cantidad al stock del insumo
// - actualiza el costo unitario del insumo (último costo)
const registrarCompra = async (req, res) => {
    const { insumo_id, proveedor, cantidad, costo_unitario } = req.body;

    if (!insumo_id || !proveedor || !cantidad || costo_unitario === undefined) {
        return res.status(400).json({ mensaje: "Faltan datos de la compra (insumo, proveedor, cantidad y costo)" });
    }

    const cant = parseFloat(cantidad);
    const costoU = parseFloat(costo_unitario);
    const costoTotal = cant * costoU;

    try {
        await db.query("START TRANSACTION");

        await db.query(
            `INSERT INTO compras_insumo (insumo_id, proveedor, cantidad, costo_unitario, costo_total, fecha)
             VALUES (?, ?, ?, ?, ?, CURDATE())`,
            [insumo_id, proveedor, cant, costoU, costoTotal]
        );

        await db.query(
            "UPDATE insumos SET stock_actual = stock_actual + ?, costo_unitario = ? WHERE id = ?",
            [cant, costoU, insumo_id]
        );

        await db.query("COMMIT");
        res.status(201).json({ mensaje: `Compra registrada. Total: $${costoTotal.toFixed(2)} (stock actualizado)` });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error al registrar compra:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Listado de tickets de compra (estilo ticket: dónde, qué, cuánto y costo)
const obtenerCompras = async (req, res) => {
    try {
        const [compras] = await db.query(
            `SELECT c.id, c.fecha, c.proveedor, c.cantidad, c.costo_unitario, c.costo_total,
                    i.nombre AS insumo, i.unidad_medida
             FROM compras_insumo c
             JOIN insumos i ON c.insumo_id = i.id
             ORDER BY c.fecha DESC, c.id DESC`
        );
        res.json(compras);
    } catch (error) {
        console.error("Error al obtener compras:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Análisis de compras: dónde hemos comprado más y qué materia prima compramos más
const obtenerAnalisisCompras = async (req, res) => {
    try {
        const [porProveedor] = await db.query(
            `SELECT proveedor,
                    COUNT(*) AS num_compras,
                    SUM(costo_total) AS total_gastado
             FROM compras_insumo
             GROUP BY proveedor
             ORDER BY total_gastado DESC`
        );

        const [porInsumo] = await db.query(
            `SELECT i.nombre AS insumo, i.unidad_medida,
                    SUM(c.cantidad) AS cantidad_total,
                    SUM(c.costo_total) AS total_gastado
             FROM compras_insumo c
             JOIN insumos i ON c.insumo_id = i.id
             GROUP BY c.insumo_id
             ORDER BY total_gastado DESC`
        );

        res.json({ porProveedor, porInsumo });
    } catch (error) {
        console.error("Error en análisis de compras:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = { registrarCompra, obtenerCompras, obtenerAnalisisCompras };
