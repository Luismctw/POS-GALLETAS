const db = require('../config/db');

// =====================================================================
//  ALMACÉN DE MATERIA PRIMA (insumos)
// =====================================================================

// Stock actual de toda la materia prima (con alerta de stock bajo y costo)
const obtenerInsumos = async (req, res) => {
    try {
        const [insumos] = await db.query(
            `SELECT id, nombre, stock_actual, unidad_medida, stock_minimo, ubicacion, costo_unitario,
                    (stock_actual <= stock_minimo) AS stock_bajo
             FROM insumos ORDER BY nombre`
        );
        res.json(insumos);
    } catch (error) {
        console.error("Error al obtener insumos:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Crear un nuevo insumo / materia prima
const UNIDADES_VALIDAS = ['kg', 'g', 'lt', 'ml', 'pza', 'ton'];

const crearInsumo = async (req, res) => {
    const { nombre, unidad_medida, stock_minimo, ubicacion } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: "El nombre del insumo es obligatorio" });
    const unidad = UNIDADES_VALIDAS.includes(unidad_medida) ? unidad_medida : 'kg';
    try {
        await db.query(
            "INSERT INTO insumos (nombre, stock_actual, unidad_medida, stock_minimo, ubicacion) VALUES (?, 0, ?, ?, ?)",
            [nombre, unidad, stock_minimo || 0, ubicacion || 'Bodega Materia Prima']
        );
        res.status(201).json({ mensaje: "Materia prima registrada en el almacén" });
    } catch (error) {
        console.error("Error al crear insumo:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// =====================================================================
//  ALMACÉN DE PRODUCTO TERMINADO (productos)
// =====================================================================

// Lista de productos terminados con su bodega, tipo y stock disponible
const obtenerProductos = async (req, res) => {
    try {
        const [productos] = await db.query(
            `SELECT id, nombre, precio_caja, tipo, bodega_asignada, stock_actual
             FROM productos ORDER BY bodega_asignada, nombre`
        );
        res.json(productos);
    } catch (error) {
        console.error("Error al obtener productos:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Productos PROPIOS con su receta cargada (para la pantalla "Producir")
const obtenerProductosConReceta = async (req, res) => {
    try {
        const [productos] = await db.query(
            "SELECT id, nombre, precio_caja, stock_actual FROM productos WHERE tipo = 'propio'"
        );
        for (const p of productos) {
            const [receta] = await db.query(
                `SELECT pi.insumo_id, i.nombre, pi.cantidad_necesaria, i.unidad_medida, i.stock_actual
                 FROM producto_insumo pi
                 JOIN insumos i ON pi.insumo_id = i.id
                 WHERE pi.producto_id = ?`,
                [p.id]
            );
            p.receta = receta;
        }
        res.json(productos);
    } catch (error) {
        console.error("Error al obtener recetas:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Crear un nuevo producto + su receta (materia prima total por caja)
const crearProductoConReceta = async (req, res) => {
    const { nombre, precio_caja, receta, tipo, bodega_asignada, stock_inicial } = req.body;

    if (!nombre || !precio_caja || !tipo || !bodega_asignada) {
        return res.status(400).json({ mensaje: "Faltan datos del producto" });
    }
    if (tipo === 'propio' && (!receta || receta.length === 0)) {
        return res.status(400).json({ mensaje: "Un producto propio debe tener al menos un ingrediente en la receta" });
    }

    try {
        await db.query("START TRANSACTION");

        const [resultadoProducto] = await db.query(
            "INSERT INTO productos (nombre, precio_caja, tipo, bodega_asignada, stock_actual) VALUES (?, ?, ?, ?, ?)",
            [nombre, precio_caja, tipo, bodega_asignada, tipo === 'tercero' ? (stock_inicial || 0) : 0]
        );
        const nuevoProductoId = resultadoProducto.insertId;

        if (receta && receta.length > 0) {
            for (const ing of receta) {
                await db.query(
                    "INSERT INTO producto_insumo (producto_id, insumo_id, cantidad_necesaria) VALUES (?, ?, ?)",
                    [nuevoProductoId, ing.insumo_id, ing.cantidad_necesaria]
                );
            }
        }

        await db.query("COMMIT");
        res.status(201).json({ mensaje: "¡Producto guardado en el almacén exitosamente!" });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error al crear producto:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// =====================================================================
//  PRODUCCIÓN POR RECETA
//  Selecciona un producto (receta) + cantidad de cajas:
//  - descuenta la materia prima (receta x cantidad)
//  - calcula el costo de producción (materia prima usada x costo_unitario)
//  - suma las cajas al stock de producto terminado
// =====================================================================
const producirPorReceta = async (req, res) => {
    const { producto_id, cantidad } = req.body;
    const cajas = parseInt(cantidad);

    if (!producto_id || !cajas || cajas <= 0) {
        return res.status(400).json({ mensaje: "Selecciona un producto e indica cuántas cajas vas a producir" });
    }

    try {
        await db.query("START TRANSACTION");

        const [receta] = await db.query(
            `SELECT pi.insumo_id, pi.cantidad_necesaria, i.nombre, i.stock_actual, i.costo_unitario
             FROM producto_insumo pi
             JOIN insumos i ON pi.insumo_id = i.id
             WHERE pi.producto_id = ?`,
            [producto_id]
        );

        if (receta.length === 0) {
            await db.query("ROLLBACK");
            return res.status(400).json({ mensaje: "Este producto no tiene receta registrada" });
        }

        // 1. Verificar que haya suficiente materia prima para todo el lote
        let costo_total = 0;
        for (const ing of receta) {
            const requerido = parseFloat(ing.cantidad_necesaria) * cajas;
            if (parseFloat(ing.stock_actual) < requerido) {
                await db.query("ROLLBACK");
                return res.status(400).json({
                    mensaje: `Materia prima insuficiente: ${ing.nombre}. Necesitas ${requerido.toFixed(2)} y solo hay ${ing.stock_actual}.`
                });
            }
            costo_total += requerido * parseFloat(ing.costo_unitario);
        }

        // 2. Descontar la materia prima
        for (const ing of receta) {
            const requerido = parseFloat(ing.cantidad_necesaria) * cajas;
            await db.query("UPDATE insumos SET stock_actual = stock_actual - ? WHERE id = ?", [requerido, ing.insumo_id]);
        }

        // 3. Registrar el lote de producción con su costo
        await db.query(
            "INSERT INTO produccion (producto_id, cantidad_cajas, costo_total, fecha) VALUES (?, ?, ?, CURDATE())",
            [producto_id, cajas, costo_total.toFixed(2)]
        );

        // 4. Sumar las cajas al almacén de producto terminado
        await db.query("UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?", [cajas, producto_id]);

        await db.query("COMMIT");
        res.json({
            mensaje: `¡Producción registrada! ${cajas} cajas. Costo de materia prima: $${costo_total.toFixed(2)}`
        });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error en producción:", error);
        res.status(500).json({ mensaje: "Error al registrar la producción" });
    }
};

// Registrar entrada de stock para un producto de terceros
const registrarEntradaTerceros = async (req, res) => {
    const { producto_id, cantidad } = req.body;
    const cajas = parseInt(cantidad);

    if (!producto_id || !cajas || cajas <= 0) {
        return res.status(400).json({ mensaje: "Selecciona un producto e indica la cantidad de cajas" });
    }

    try {
        const [prod] = await db.query("SELECT tipo, nombre FROM productos WHERE id = ?", [producto_id]);
        if (prod.length === 0) return res.status(404).json({ mensaje: "Producto no encontrado" });
        if (prod[0].tipo !== 'tercero') return res.status(400).json({ mensaje: "Solo se puede registrar entrada para productos de terceros" });

        await db.query("UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?", [cajas, producto_id]);
        res.json({ mensaje: `✅ Se ingresaron ${cajas} cajas de ${prod[0].nombre} al almacén` });
    } catch (error) {
        console.error("Error al registrar entrada de terceros:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = {
    obtenerInsumos,
    crearInsumo,
    obtenerProductos,
    obtenerProductosConReceta,
    crearProductoConReceta,
    producirPorReceta,
    registrarEntradaTerceros
};
