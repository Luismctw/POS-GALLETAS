const db = require('../config/db');

// =====================================================================
//  1. CREAR PEDIDO  (en el área de Producción)
//  Contenido + cliente + piezas + precio. Queda en estatus 'creado'
//  (todavía SIN repartidor). Valida crédito del cliente.
// =====================================================================
const crearPedido = async (req, res) => {
    const { cliente_id, contenido, piezas, total } = req.body;

    if (!cliente_id || !contenido || !total) {
        return res.status(400).json({ mensaje: "Faltan datos del pedido (cliente, contenido y precio)" });
    }

    try {
        const [clientes] = await db.query(
            "SELECT limite_credito, saldo_deudor, estatus FROM clientes WHERE id = ?",
            [cliente_id]
        );
        if (clientes.length === 0) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

        const cliente = clientes[0];
        if (cliente.estatus === 'bloqueado') {
            return res.status(400).json({ mensaje: 'El cliente está bloqueado en el sistema.' });
        }

        const nuevoSaldo = parseFloat(cliente.saldo_deudor) + parseFloat(total);
        if (nuevoSaldo > parseFloat(cliente.limite_credito)) {
            const disponible = parseFloat(cliente.limite_credito) - parseFloat(cliente.saldo_deudor);
            return res.status(400).json({ mensaje: `Límite de crédito excedido. Disponible: $${disponible.toFixed(2)}` });
        }

        const [resultado] = await db.query(
            `INSERT INTO pedidos (cliente_id, contenido, piezas, total, estatus, fecha, fecha_creacion)
             VALUES (?, ?, ?, ?, 'creado', CURDATE(), CURDATE())`,
            [cliente_id, contenido, piezas || 0, total]
        );

        await db.query("UPDATE clientes SET saldo_deudor = ? WHERE id = ?", [nuevoSaldo, cliente_id]);

        res.status(201).json({ mensaje: 'Pedido creado. Ya puede asignarse a un repartidor.', pedido_id: resultado.insertId });
    } catch (error) {
        console.error('Error al crear el pedido:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// =====================================================================
//  2. ASIGNAR PEDIDO  (en el área de Asignar Pedidos)
//  Toma un pedido 'creado' y le asigna un repartidor -> 'pendiente'
// =====================================================================
const asignarPedido = async (req, res) => {
    const { id } = req.params;
    const { repartidor_id, fecha } = req.body;

    if (!repartidor_id) return res.status(400).json({ mensaje: "Selecciona un repartidor" });

    try {
        const [resultado] = await db.query(
            `UPDATE pedidos
             SET repartidor_id = ?, estatus = 'pendiente', fecha = ?
             WHERE id = ? AND estatus = 'creado'`,
            [repartidor_id, fecha || new Date().toISOString().split('T')[0], id]
        );
        if (resultado.affectedRows === 0) {
            return res.status(400).json({ mensaje: "El pedido no existe o ya fue asignado" });
        }
        res.json({ mensaje: "Pedido asignado al repartidor correctamente" });
    } catch (error) {
        console.error("Error al asignar pedido:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Pedidos creados que todavía NO tienen repartidor (para la pantalla Asignar)
const obtenerPedidosCreados = async (req, res) => {
    try {
        const [pedidos] = await db.query(
            `SELECT p.id, p.contenido, p.piezas, p.total, c.nombre AS cliente, c.direccion,
                    DATE_FORMAT(p.fecha_creacion, '%Y-%m-%d') AS fecha_creacion
             FROM pedidos p JOIN clientes c ON p.cliente_id = c.id
             WHERE p.estatus = 'creado'
             ORDER BY p.fecha_creacion ASC, p.id ASC`
        );
        res.json(pedidos);
    } catch (error) {
        console.error("Error al obtener pedidos creados:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// =====================================================================
//  3. MONITOR: todos los pedidos (panel admin)
// =====================================================================
const obtenerPedidos = async (req, res) => {
    try {
        const [pedidos] = await db.query(`
            SELECT p.id, c.nombre AS cliente, IFNULL(r.nombre, 'Sin asignar') AS repartidor,
                   p.contenido, p.piezas, p.total, p.estatus, p.veces_reagendado,
                   DATE_FORMAT(p.fecha, '%Y-%m-%d') AS fecha,
                   DATEDIFF(CURDATE(), p.fecha_creacion) AS dias_antiguedad
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN repartidores r ON p.repartidor_id = r.id
            ORDER BY p.fecha DESC, p.id DESC
        `);
        res.json(pedidos);
    } catch (error) {
        console.error("Error al obtener pedidos:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// =====================================================================
//  4. PEDIDOS PRIORITARIOS  (reagendados / atrasados hace días)
// =====================================================================
const obtenerPedidosPrioritarios = async (req, res) => {
    try {
        const [pedidos] = await db.query(`
            SELECT p.id, c.nombre AS cliente, c.direccion, c.telefono,
                   IFNULL(r.nombre, 'Sin asignar') AS repartidor,
                   p.contenido, p.piezas, p.total, p.estatus, p.veces_reagendado,
                   DATEDIFF(CURDATE(), p.fecha_creacion) AS dias_atraso
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN repartidores r ON p.repartidor_id = r.id
            WHERE p.estatus IN ('creado','pendiente','reagendado')
              AND DATEDIFF(CURDATE(), p.fecha_creacion) >= 1
            ORDER BY dias_atraso DESC, p.veces_reagendado DESC
        `);
        // Etiqueta de prioridad según antigüedad
        pedidos.forEach(p => {
            if (p.dias_atraso >= 30) p.prioridad = 'CRÍTICA (meses)';
            else if (p.dias_atraso >= 7) p.prioridad = 'ALTA (semanas)';
            else p.prioridad = 'MEDIA (días)';
        });
        res.json(pedidos);
    } catch (error) {
        console.error("Error al obtener pedidos prioritarios:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// =====================================================================
//  5. APP MÓVIL: ruta del día de un repartidor (con datos del cliente)
// =====================================================================
const obtenerRutaDelDia = async (req, res) => {
    const { repId, fecha } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT p.id, DATE_FORMAT(p.fecha, '%Y-%m-%d') AS fecha, p.total, p.estatus,
                   p.contenido, p.piezas, p.veces_reagendado,
                   c.nombre AS cliente_nombre, c.direccion, c.telefono,
                   c.saldo_deudor, c.limite_credito
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            WHERE p.repartidor_id = ? AND p.fecha = ?
            ORDER BY p.veces_reagendado DESC, p.id ASC
        `, [repId, fecha]);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener la ruta:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Resumen del día para un repartidor
const obtenerResumenRepartidor = async (req, res) => {
    const { repId, fecha } = req.params;
    try {
        const [pedidos] = await db.query(
            "SELECT COUNT(id) AS total_entregados, IFNULL(SUM(total), 0) AS total_cobrado FROM pedidos WHERE repartidor_id = ? AND fecha = ? AND estatus = 'entregado'",
            [repId, fecha]
        );
        const [gastos] = await db.query(
            "SELECT IFNULL(SUM(monto), 0) AS total_gastos FROM gastos WHERE repartidor_id = ? AND fecha = ?",
            [repId, fecha]
        );
        res.json({
            entregados: pedidos[0].total_entregados,
            cobrado: pedidos[0].total_cobrado,
            gastos: gastos[0].total_gastos
        });
    } catch (error) {
        console.error('Error al generar resumen:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Marcar pedido como entregado y registrar cobro
const entregarPedido = async (req, res) => {
    const { id } = req.params;
    const { monto_cobrado } = req.body;
    const cobrado = parseFloat(monto_cobrado) || 0;

    try {
        await db.query("START TRANSACTION");

        const [pedido] = await db.query("SELECT cliente_id, total FROM pedidos WHERE id = ?", [id]);
        if (!pedido.length) {
            await db.query("ROLLBACK");
            return res.status(404).json({ mensaje: 'Pedido no encontrado' });
        }

        await db.query(
            "UPDATE pedidos SET estatus = 'entregado', monto_cobrado = ? WHERE id = ?",
            [cobrado, id]
        );

        // Reducir la deuda del cliente por lo que pagó
        if (cobrado > 0) {
            await db.query(
                "UPDATE clientes SET saldo_deudor = GREATEST(0, saldo_deudor - ?) WHERE id = ?",
                [cobrado, pedido[0].cliente_id]
            );
        }

        await db.query("COMMIT");
        res.json({ mensaje: 'Pedido entregado y cobro registrado' });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error('Error al entregar:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Reagendar pedido para el día siguiente (conserva antigüedad y suma reagendado)
const reagendarPedido = async (req, res) => {
    const { id } = req.params;
    try {
        const [pedido] = await db.query(
            "SELECT cliente_id, repartidor_id, contenido, piezas, total, fecha_creacion, veces_reagendado FROM pedidos WHERE id = ?",
            [id]
        );
        if (pedido.length === 0) return res.status(404).json({ mensaje: 'Pedido no encontrado' });

        const p = pedido[0];
        await db.query("UPDATE pedidos SET estatus = 'reagendado' WHERE id = ?", [id]);
        await db.query(
            `INSERT INTO pedidos (cliente_id, repartidor_id, contenido, piezas, total, estatus, fecha, fecha_creacion, reagendado_de, veces_reagendado)
             VALUES (?, ?, ?, ?, ?, 'pendiente', DATE_ADD(CURDATE(), INTERVAL 1 DAY), ?, ?, ?)`,
            [p.cliente_id, p.repartidor_id, p.contenido, p.piezas, p.total, p.fecha_creacion, id, (p.veces_reagendado || 0) + 1]
        );
        res.json({ mensaje: 'Pedido reagendado para mañana exitosamente' });
    } catch (error) {
        console.error('Error al reagendar:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// =====================================================================
//  6. ANALÍTICA: frecuencia de compra y productos que compran
// =====================================================================
const obtenerFrecuenciaCompra = async (req, res) => {
    try {
        const [porCliente] = await db.query(`
            SELECT c.id, c.nombre AS cliente,
                   COUNT(p.id) AS total_pedidos,
                   DATE_FORMAT(MIN(p.fecha_creacion), '%Y-%m-%d') AS primera_compra,
                   DATE_FORMAT(MAX(p.fecha_creacion), '%Y-%m-%d') AS ultima_compra,
                   ROUND(DATEDIFF(MAX(p.fecha_creacion), MIN(p.fecha_creacion)) / NULLIF(COUNT(p.id) - 1, 0), 1) AS dias_entre_compras
            FROM clientes c
            JOIN pedidos p ON p.cliente_id = c.id
            GROUP BY c.id
            ORDER BY total_pedidos DESC
        `);

        const [productos] = await db.query(`
            SELECT contenido AS producto,
                   COUNT(*) AS veces_pedido,
                   SUM(piezas) AS total_piezas
            FROM pedidos
            WHERE contenido IS NOT NULL AND contenido <> ''
            GROUP BY contenido
            ORDER BY veces_pedido DESC
            LIMIT 20
        `);

        res.json({ porCliente, productos });
    } catch (error) {
        console.error("Error en frecuencia de compra:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Control de carga del día por repartidor
const obtenerControlCarga = async (req, res) => {
    const fecha = req.params.fecha || new Date().toISOString().split('T')[0];
    try {
        const [resumen] = await db.query(`
            SELECT
                r.id, r.nombre AS repartidor,
                IFNULL(SUM(p.piezas), 0) AS piezas_salida,
                IFNULL(SUM(CASE WHEN p.estatus='entregado' THEN p.piezas ELSE 0 END), 0) AS piezas_entregadas,
                IFNULL(ret.piezas_regresadas, 0) AS piezas_regresadas,
                ret.notas AS notas_retorno
            FROM repartidores r
            LEFT JOIN pedidos p ON p.repartidor_id = r.id AND p.fecha = ?
            LEFT JOIN retornos_repartidor ret ON ret.repartidor_id = r.id AND ret.fecha = ?
            WHERE r.estatus = 'activo'
            GROUP BY r.id, r.nombre, ret.piezas_regresadas, ret.notas
            ORDER BY piezas_salida DESC
        `, [fecha, fecha]);

        // Calcular diferencia (piezas perdidas)
        resumen.forEach(r => {
            r.piezas_salida     = Number(r.piezas_salida);
            r.piezas_entregadas = Number(r.piezas_entregadas);
            r.piezas_regresadas = Number(r.piezas_regresadas);
            r.retorno_registrado = r.notas !== null || r.piezas_regresadas > 0;
            // Lo que debería regresar = salida - entregadas
            r.esperado_regreso  = r.piezas_salida - r.piezas_entregadas;
            // Diferencia: si regresó menos de lo esperado, hay cajas sin cuenta
            r.diferencia        = r.esperado_regreso - r.piezas_regresadas;
        });

        res.json({ fecha, resumen });
    } catch (e) {
        console.error('Error control carga:', e);
        res.status(500).json({ mensaje: 'Error interno' });
    }
};

const registrarRetorno = async (req, res) => {
    const { repartidor_id, fecha, piezas_regresadas, notas } = req.body;
    if (!repartidor_id || !fecha || piezas_regresadas === undefined)
        return res.status(400).json({ mensaje: 'Faltan datos' });
    try {
        await db.query(`
            INSERT INTO retornos_repartidor (repartidor_id, fecha, piezas_regresadas, notas)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE piezas_regresadas = VALUES(piezas_regresadas), notas = VALUES(notas)
        `, [repartidor_id, fecha, piezas_regresadas, notas || null]);
        res.json({ mensaje: 'Retorno registrado correctamente' });
    } catch (e) {
        console.error('Error retorno:', e);
        res.status(500).json({ mensaje: 'Error interno' });
    }
};

// Cancelar un pedido y revertir el saldo del cliente
const cancelarPedido = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('START TRANSACTION');
        const [pedido] = await db.query(
            "SELECT cliente_id, total, estatus FROM pedidos WHERE id = ?", [id]
        );
        if (!pedido.length) {
            await db.query('ROLLBACK');
            return res.status(404).json({ mensaje: 'Pedido no encontrado' });
        }
        if (pedido[0].estatus === 'entregado') {
            await db.query('ROLLBACK');
            return res.status(400).json({ mensaje: 'No se puede cancelar un pedido ya entregado' });
        }
        await db.query("UPDATE pedidos SET estatus = 'cancelado' WHERE id = ?", [id]);
        // Revertir el cargo en el saldo del cliente
        await db.query(
            "UPDATE clientes SET saldo_deudor = GREATEST(0, saldo_deudor - ?) WHERE id = ?",
            [pedido[0].total, pedido[0].cliente_id]
        );
        await db.query('COMMIT');
        res.json({ mensaje: 'Pedido cancelado y saldo del cliente revertido' });
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Error al cancelar:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

module.exports = {
    crearPedido,
    asignarPedido,
    obtenerPedidosCreados,
    obtenerPedidos,
    obtenerPedidosPrioritarios,
    obtenerRutaDelDia,
    obtenerResumenRepartidor,
    entregarPedido,
    reagendarPedido,
    obtenerFrecuenciaCompra,
    obtenerControlCarga,
    registrarRetorno,
    cancelarPedido
};
