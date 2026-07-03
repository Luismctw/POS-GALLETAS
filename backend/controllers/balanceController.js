const db = require('../config/db');

// Devuelve la cláusula WHERE de fecha según el periodo solicitado
function filtroPeriodo(periodo, columna = 'fecha') {
    switch (periodo) {
        case 'semana':
            // Semana en curso (lunes a domingo)
            return `YEARWEEK(${columna}, 1) = YEARWEEK(CURDATE(), 1)`;
        case 'mes':
            return `YEAR(${columna}) = YEAR(CURDATE()) AND MONTH(${columna}) = MONTH(CURDATE())`;
        case 'dia':
        default:
            return `${columna} = CURDATE()`;
    }
}

// Balance del día (se mantiene para la tarjeta rápida del dashboard)
const obtenerBalanceDashboard = async (req, res) => {
    return obtenerBalancePeriodo({ query: { periodo: 'dia' } }, res);
};

// Balance por periodo: diario, semanal o mensual
// Ingresos = pedidos entregados.
// Egresos  = gastos de repartidores + compras de materia prima.
const obtenerBalancePeriodo = async (req, res) => {
    const periodo = (req.query.periodo || 'dia').toLowerCase();
    try {
        const [ventas] = await db.query(
            `SELECT IFNULL(SUM(total), 0) AS ingresos
             FROM pedidos
             WHERE estatus = 'entregado' AND ${filtroPeriodo(periodo)}`
        );
        const [gastos] = await db.query(
            `SELECT IFNULL(SUM(monto), 0) AS gastos_repartidores
             FROM gastos WHERE ${filtroPeriodo(periodo)}`
        );
        const [compras] = await db.query(
            `SELECT IFNULL(SUM(costo_total), 0) AS gastos_compras
             FROM compras_insumo WHERE ${filtroPeriodo(periodo)}`
        );

        const ingresos = parseFloat(ventas[0].ingresos);
        const gastosRep = parseFloat(gastos[0].gastos_repartidores);
        const gastosCompras = parseFloat(compras[0].gastos_compras);
        const egresos = gastosRep + gastosCompras;
        const utilidad = ingresos - egresos;

        res.json({
            periodo,
            ingresos: ingresos.toFixed(2),
            gastos_repartidores: gastosRep.toFixed(2),
            gastos_compras: gastosCompras.toFixed(2),
            egresos: egresos.toFixed(2),
            utilidad: utilidad.toFixed(2)
        });
    } catch (error) {
        console.error("Error al generar balance:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Tickets que componen el balance del periodo (compras + gastos repartidores)
const obtenerTicketsBalance = async (req, res) => {
    const periodo = (req.query.periodo || 'dia').toLowerCase();
    try {
        const [compras] = await db.query(
            `SELECT c.fecha, i.nombre AS concepto, c.proveedor AS detalle, c.costo_total AS monto
             FROM compras_insumo c JOIN insumos i ON c.insumo_id = i.id
             WHERE ${filtroPeriodo(periodo, 'c.fecha')}`
        );
        const [gastos] = await db.query(
            `SELECT g.fecha, g.categoria AS concepto, r.nombre AS detalle, g.monto, g.foto_ticket
             FROM gastos g JOIN repartidores r ON g.repartidor_id = r.id
             WHERE ${filtroPeriodo(periodo, 'g.fecha')}`
        );

        const tickets = [
            ...compras.map(c => ({ tipo: 'Compra materia prima', ...c, foto_ticket: null })),
            ...gastos.map(g => ({ tipo: 'Gasto repartidor', ...g }))
        ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        res.json(tickets);
    } catch (error) {
        console.error("Error al obtener tickets de balance:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Contabilidad de la producción: cuánto costó producir por periodo y por producto
const obtenerBalanceProduccion = async (req, res) => {
    const periodo = (req.query.periodo || 'mes').toLowerCase();
    try {
        const [resumen] = await db.query(
            `SELECT IFNULL(SUM(cantidad_cajas),0) AS cajas_producidas,
                    IFNULL(SUM(costo_total),0)    AS costo_total,
                    COUNT(*) AS lotes
             FROM produccion WHERE ${filtroPeriodo(periodo)}`
        );
        const [porProducto] = await db.query(
            `SELECT p.nombre AS producto,
                    SUM(pr.cantidad_cajas) AS cajas,
                    SUM(pr.costo_total)    AS costo
             FROM produccion pr JOIN productos p ON pr.producto_id = p.id
             WHERE ${filtroPeriodo(periodo, 'pr.fecha')}
             GROUP BY pr.producto_id
             ORDER BY costo DESC`
        );
        const cajas = Number(resumen[0].cajas_producidas) || 0;
        const costo = Number(resumen[0].costo_total) || 0;
        resumen[0].costo_promedio_caja = cajas > 0 ? (costo / cajas).toFixed(2) : '0.00';
        res.json({ periodo, resumen: resumen[0], porProducto });
    } catch (error) {
        console.error("Error en contabilidad de producción:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = {
    obtenerBalanceDashboard,
    obtenerBalancePeriodo,
    obtenerTicketsBalance,
    obtenerBalanceProduccion
};
