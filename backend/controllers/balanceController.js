const db = require('../config/db');

// Obtener el balance financiero del día actual
const obtenerBalanceDashboard = async (req, res) => {
    try {
        // 1. Sumar todo lo cobrado hoy (pedidos entregados)
        const [ventas] = await db.query(
            "SELECT IFNULL(SUM(total), 0) as ingresos FROM pedidos WHERE estatus = 'entregado' AND fecha = CURDATE()"
        );
        
        // 2. Sumar todos los gastos operativos de hoy
        const [gastos] = await db.query(
            "SELECT IFNULL(SUM(monto), 0) as egresos FROM gastos WHERE fecha = CURDATE()"
        );

        const ingresos = parseFloat(ventas[0].ingresos);
        const egresos = parseFloat(gastos[0].egresos);
        const utilidad = ingresos - egresos;

        res.json({
            ingresos: ingresos.toFixed(2),
            egresos: egresos.toFixed(2),
            utilidad: utilidad.toFixed(2)
        });
    } catch (error) {
        console.error("Error al generar balance:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = { obtenerBalanceDashboard };