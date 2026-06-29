const db = require('../config/db');

// Obtener el stock actual de todos los insumos (Ahora con Alertas y Ubicación)
const obtenerInsumos = async (req, res) => {
    try {
        const [insumos] = await db.query("SELECT id, nombre, stock_actual, unidad_medida, stock_minimo, ubicacion FROM insumos");
        res.json(insumos);
    } catch (error) {
        console.error("Error al obtener insumos:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Registrar la producción de cajas de galletas
// Registrar producción con descuento MANUAL de ingredientes
const registrarProduccion = async (req, res) => {
    // Ahora recibimos la lista de ingredientes que el empleado dice que usó
    const { producto_id, cantidad_cajas, ingredientes_usados } = req.body; 

    if (!producto_id || !ingredientes_usados || ingredientes_usados.length === 0) {
        return res.status(400).json({ mensaje: "Faltan datos o no se agregaron ingredientes al horneado." });
    }

    try {
        await db.query("START TRANSACTION");

        // 1. Verificamos que haya suficiente stock de lo que el empleado quiere descontar
        for (const ing of ingredientes_usados) {
            const [insumo] = await db.query("SELECT stock_actual, nombre FROM insumos WHERE id = ?", [ing.insumo_id]);
            
            if (insumo[0].stock_actual < ing.cantidad_usada) {
                await db.query("ROLLBACK");
                return res.status(400).json({ mensaje: `Stock insuficiente de ${insumo[0].nombre}. Hay ${insumo[0].stock_actual} pero intentas descontar ${ing.cantidad_usada}` });
            }
        }

        // 2. Si todo está bien, descontamos exactamente lo que el empleado indicó
        for (const ing of ingredientes_usados) {
            await db.query("UPDATE insumos SET stock_actual = stock_actual - ? WHERE id = ?", [ing.cantidad_usada, ing.insumo_id]);
        }

        // 3. Registramos cuántas cajas de galletas salieron
        await db.query("INSERT INTO produccion (producto_id, cantidad_cajas, fecha) VALUES (?, ?, CURDATE())", [producto_id, cantidad_cajas]);

        await db.query("COMMIT");
        res.json({ mensaje: "¡Producción registrada y materia prima descontada exitosamente!" });

    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error en producción:", error);
        res.status(500).json({ mensaje: "Error al registrar la producción" });
    }
};

// Registrar la compra/entrada de un insumo al almacén
const registrarEntradaInsumo = async (req, res) => {
    const { insumo_id, cantidad_comprada } = req.body;
    if (!insumo_id || !cantidad_comprada) return res.status(400).json({ mensaje: "Faltan datos para registrar la compra" });

    try {
        await db.query("UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?", [cantidad_comprada, insumo_id]);
        res.json({ mensaje: "¡Stock actualizado correctamente en el almacén!" });
    } catch (error) {
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Crear un nuevo producto, receta, TIPO y BODEGA
const crearProductoConReceta = async (req, res) => {
    const { nombre, precio_caja, receta, tipo, bodega_asignada } = req.body;
    
    // Validación básica
    if (!nombre || !precio_caja || !tipo || !bodega_asignada) {
        return res.status(400).json({ mensaje: "Faltan datos del producto" });
    }

    try {
        await db.query("START TRANSACTION");
        
        // 1. Guardar el nuevo producto con tipo y bodega
        const [resultadoProducto] = await db.query(
            "INSERT INTO productos (nombre, precio_caja, tipo, bodega_asignada) VALUES (?, ?, ?, ?)", 
            [nombre, precio_caja, tipo, bodega_asignada]
        );
        const nuevoProductoId = resultadoProducto.insertId;

        // 2. Guardar cada ingrediente de la receta (si existe receta)
        if (receta && receta.length > 0) {
            for (const ingrediente of receta) {
                await db.query(
                    "INSERT INTO producto_insumo (producto_id, insumo_id, cantidad_necesaria) VALUES (?, ?, ?)", 
                    [nuevoProductoId, ingrediente.insumo_id, ingrediente.cantidad_necesaria]
                );
            }
        }
        
        await db.query("COMMIT");
        res.status(201).json({ mensaje: "¡Nuevo producto guardado exitosamente!" });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error al crear producto:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = { obtenerInsumos, registrarProduccion, registrarEntradaInsumo, crearProductoConReceta };