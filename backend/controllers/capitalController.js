const db = require('../config/db');

// Saldo de capital disponible:
//   entradas manuales - salidas manuales - gastos de repartidores - compras de materia prima
// Devuelve además la lista unificada de movimientos (manuales + gastos + compras).
const obtenerCapital = async (req, res) => {
    try {
        const [[cap]] = await db.query(
            "SELECT IFNULL(SUM(CASE WHEN tipo='entrada' THEN monto ELSE -monto END),0) AS neto FROM capital_movimientos"
        );
        const [[g]] = await db.query("SELECT IFNULL(SUM(monto),0) AS total FROM gastos");
        const [[c]] = await db.query("SELECT IFNULL(SUM(costo_total),0) AS total FROM compras_insumo");

        const neto = Number(cap.neto);        // entradas - salidas manuales
        const gastos = Number(g.total);
        const compras = Number(c.total);
        const disponible = neto - gastos - compras;

        // Movimientos unificados para el historial
        const [manuales] = await db.query(
            "SELECT id, tipo, monto, concepto, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha, 'manual' AS origen FROM capital_movimientos ORDER BY fecha DESC, id DESC"
        );
        const [gastosMov] = await db.query(
            `SELECT g.id, 'salida' AS tipo, g.monto,
                    CONCAT('Gasto: ', g.categoria, COALESCE(CONCAT(' (', g.descripcion, ')'), '')) AS concepto,
                    DATE_FORMAT(g.fecha,'%Y-%m-%d') AS fecha, 'gasto' AS origen
             FROM gastos g ORDER BY g.fecha DESC, g.id DESC LIMIT 100`
        );
        const [comprasMov] = await db.query(
            `SELECT c.id, 'salida' AS tipo, c.costo_total AS monto,
                    CONCAT('Compra: ', i.nombre) AS concepto,
                    DATE_FORMAT(c.fecha,'%Y-%m-%d') AS fecha, 'compra' AS origen
             FROM compras_insumo c JOIN insumos i ON c.insumo_id = i.id
             ORDER BY c.fecha DESC, c.id DESC LIMIT 100`
        );
        const movimientos = [...manuales, ...gastosMov, ...comprasMov]
            .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

        res.json({
            disponible: disponible.toFixed(2),
            entradas: neto.toFixed(2),
            gastos: gastos.toFixed(2),
            compras: compras.toFixed(2),
            movimientos
        });
    } catch (e) {
        console.error('Error al obtener capital:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Registrar una entrada (meter capital) o salida manual
const agregarMovimiento = async (req, res) => {
    const { tipo, monto, concepto } = req.body;
    if (!['entrada', 'salida'].includes(tipo)) return res.status(400).json({ mensaje: 'Tipo inválido' });
    const m = parseFloat(monto);
    if (!m || m <= 0) return res.status(400).json({ mensaje: 'El monto debe ser mayor a 0' });
    try {
        await db.query(
            "INSERT INTO capital_movimientos (tipo, monto, concepto, fecha) VALUES (?, ?, ?, CURDATE())",
            [tipo, m, concepto || null]
        );
        res.status(201).json({ mensaje: tipo === 'entrada' ? 'Capital agregado' : 'Salida registrada' });
    } catch (e) {
        console.error('Error al agregar movimiento de capital:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Eliminar un movimiento manual de capital
const eliminarMovimiento = async (req, res) => {
    const { id } = req.params;
    try {
        const [r] = await db.query("DELETE FROM capital_movimientos WHERE id = ?", [id]);
        if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'Movimiento no encontrado' });
        res.json({ mensaje: 'Movimiento eliminado' });
    } catch (e) {
        console.error('Error al eliminar movimiento de capital:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

module.exports = { obtenerCapital, agregarMovimiento, eliminarMovimiento };
