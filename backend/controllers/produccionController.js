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

const actualizarBodegaInsumo = async (req, res) => {
    const { id } = req.params;
    const { ubicacion } = req.body;
    if (!ubicacion) return res.status(400).json({ mensaje: 'Bodega requerida' });
    try {
        await db.query('UPDATE insumos SET ubicacion = ? WHERE id = ?', [ubicacion, id]);
        res.json({ mensaje: 'Bodega actualizada' });
    } catch (e) {
        res.status(500).json({ mensaje: 'Error interno' });
    }
};

// =====================================================================
//  BODEGAS (dinámicas)
// =====================================================================
const obtenerBodegas = async (req, res) => {
    try {
        const [bodegas] = await db.query("SELECT id, nombre FROM bodegas WHERE activa = 1 ORDER BY id");
        res.json(bodegas);
    } catch (error) {
        console.error("Error al obtener bodegas:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

const crearBodega = async (req, res) => {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ mensaje: "El nombre de la bodega es obligatorio" });
    try {
        // Si existía pero estaba desactivada, reactivarla
        const [existe] = await db.query("SELECT id, activa FROM bodegas WHERE nombre = ?", [nombre]);
        if (existe.length) {
            if (existe[0].activa) return res.status(409).json({ mensaje: "Ya existe una bodega con ese nombre" });
            await db.query("UPDATE bodegas SET activa = 1 WHERE id = ?", [existe[0].id]);
            return res.status(201).json({ mensaje: "Bodega reactivada" });
        }
        await db.query("INSERT INTO bodegas (nombre) VALUES (?)", [nombre]);
        res.status(201).json({ mensaje: "Bodega agregada" });
    } catch (error) {
        console.error("Error al crear bodega:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

const eliminarBodega = async (req, res) => {
    const { id } = req.params;
    try {
        const [bod] = await db.query("SELECT nombre FROM bodegas WHERE id = ?", [id]);
        if (!bod.length) return res.status(404).json({ mensaje: "Bodega no encontrada" });
        const nombre = bod[0].nombre;
        const [[{ ci }]] = await db.query("SELECT COUNT(*) AS ci FROM insumos WHERE ubicacion = ?", [nombre]);
        const [[{ cp }]] = await db.query("SELECT COUNT(*) AS cp FROM productos WHERE bodega_asignada = ?", [nombre]);
        if (ci > 0 || cp > 0) {
            return res.status(409).json({ mensaje: `No se puede eliminar: la bodega tiene ${ci} materia(s) prima(s) y ${cp} producto(s). Muévelos primero.` });
        }
        await db.query("UPDATE bodegas SET activa = 0 WHERE id = ?", [id]);
        res.json({ mensaje: "Bodega eliminada" });
    } catch (error) {
        console.error("Error al eliminar bodega:", error);
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
    const { producto_id, cantidad, receta_override } = req.body;
    const cajas = parseInt(cantidad);

    if (!producto_id || !cajas || cajas <= 0) {
        return res.status(400).json({ mensaje: "Selecciona un producto e indica cuántas cajas vas a producir" });
    }

    // Ajustes de receta SOLO para este lote (producir con menos/más materia prima ese día).
    // No modifica la receta guardada. Mapa insumo_id -> cantidad por caja.
    const overrideMap = {};
    if (Array.isArray(receta_override)) {
        for (const o of receta_override) {
            const c = parseFloat(o.cantidad_necesaria);
            if (o.insumo_id != null && !isNaN(c) && c >= 0) overrideMap[o.insumo_id] = c;
        }
    }
    const porCajaDe = (ing) => overrideMap[ing.insumo_id] !== undefined
        ? overrideMap[ing.insumo_id]
        : parseFloat(ing.cantidad_necesaria);

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
            const requerido = porCajaDe(ing) * cajas;
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
            const requerido = porCajaDe(ing) * cajas;
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

// =====================================================================
//  #11 · PRODUCIR CAJA COMBINADA POR PORCENTAJES
//  Recibe varios "sabores" (productos propios con receta individual).
//  Cada sabor aporta 1/N de su receta por caja combinada.
//  Descuenta materia prima proporcional, calcula el costo, y guarda las
//  cajas en un producto tipo 'combinada' (lo crea o reutiliza por nombre).
//  El precio de venta lo define el usuario a mano.
// =====================================================================
const producirComboPorPorcentaje = async (req, res) => {
    const { sabores, cantidad, precio_caja, bodega_asignada } = req.body;
    const cajas = parseInt(cantidad);

    if (!Array.isArray(sabores) || sabores.length < 2) {
        return res.status(400).json({ mensaje: "Selecciona al menos 2 sabores para la caja combinada" });
    }
    if (!cajas || cajas <= 0) {
        return res.status(400).json({ mensaje: "Indica cuántas cajas vas a producir" });
    }
    if (precio_caja === undefined || precio_caja === '' || isNaN(parseFloat(precio_caja))) {
        return res.status(400).json({ mensaje: "Indica el precio de venta de la caja combinada" });
    }

    const N = sabores.length;
    try {
        await db.query("START TRANSACTION");

        // Acumular la materia prima por insumo: por caja combinada, cada sabor aporta 1/N de su receta
        const acumulado = {}; // insumo_id -> { porCaja, nombre, stock_actual, costo_unitario }
        const nombresSabores = [];

        for (const sid of sabores) {
            const [prod] = await db.query("SELECT nombre FROM productos WHERE id = ?", [sid]);
            if (!prod.length) { await db.query("ROLLBACK"); return res.status(404).json({ mensaje: `Sabor no encontrado (id ${sid})` }); }
            nombresSabores.push(prod[0].nombre);

            const [receta] = await db.query(
                `SELECT pi.insumo_id, pi.cantidad_necesaria, i.nombre, i.stock_actual, i.costo_unitario
                 FROM producto_insumo pi JOIN insumos i ON pi.insumo_id = i.id WHERE pi.producto_id = ?`,
                [sid]
            );
            if (receta.length === 0) {
                await db.query("ROLLBACK");
                return res.status(400).json({ mensaje: `El sabor "${prod[0].nombre}" no tiene receta individual registrada.` });
            }
            for (const ing of receta) {
                const contrib = parseFloat(ing.cantidad_necesaria) / N; // porción de este sabor por caja combinada
                if (!acumulado[ing.insumo_id]) {
                    acumulado[ing.insumo_id] = {
                        porCaja: 0, nombre: ing.nombre,
                        stock_actual: parseFloat(ing.stock_actual),
                        costo_unitario: parseFloat(ing.costo_unitario)
                    };
                }
                acumulado[ing.insumo_id].porCaja += contrib;
            }
        }

        // Validar stock y calcular costo
        let costo_total = 0;
        for (const id in acumulado) {
            const a = acumulado[id];
            const requerido = a.porCaja * cajas;
            if (a.stock_actual < requerido) {
                await db.query("ROLLBACK");
                return res.status(400).json({ mensaje: `Materia prima insuficiente: ${a.nombre}. Necesitas ${requerido.toFixed(2)} y solo hay ${a.stock_actual}.` });
            }
            costo_total += requerido * a.costo_unitario;
        }

        // Descontar materia prima
        for (const id in acumulado) {
            const requerido = acumulado[id].porCaja * cajas;
            await db.query("UPDATE insumos SET stock_actual = stock_actual - ? WHERE id = ?", [requerido, id]);
        }

        // Producto combinado: nombre ordenado para reutilizar la misma combinación
        const nombreCombo = "Combinada: " + [...nombresSabores].sort((a, b) => a.localeCompare(b)).join(" + ");
        const bodega = bodega_asignada || 'Bodega 1';

        const [existe] = await db.query("SELECT id FROM productos WHERE nombre = ? AND tipo = 'combinada'", [nombreCombo]);
        let productoId;
        if (existe.length) {
            productoId = existe[0].id;
            await db.query("UPDATE productos SET stock_actual = stock_actual + ?, precio_caja = ?, bodega_asignada = ? WHERE id = ?", [cajas, precio_caja, bodega, productoId]);
        } else {
            const [ins] = await db.query(
                "INSERT INTO productos (nombre, precio_caja, tipo, bodega_asignada, stock_actual) VALUES (?, ?, 'combinada', ?, ?)",
                [nombreCombo, precio_caja, bodega, cajas]
            );
            productoId = ins.insertId;
        }

        await db.query("INSERT INTO produccion (producto_id, cantidad_cajas, costo_total, fecha) VALUES (?, ?, ?, CURDATE())", [productoId, cajas, costo_total.toFixed(2)]);

        await db.query("COMMIT");
        res.json({ mensaje: `¡Caja combinada producida! ${cajas} caja(s) de "${nombreCombo}". Costo de materia prima: $${costo_total.toFixed(2)}` });
    } catch (e) {
        await db.query("ROLLBACK");
        console.error("Error al producir caja combinada:", e);
        res.status(500).json({ mensaje: "Error interno del servidor" });
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

// Editar un producto (nombre, precio, bodega, y stock para terceros)
const editarProducto = async (req, res) => {
    const { id } = req.params;
    const { nombre, precio_caja, bodega_asignada, stock_actual } = req.body;
    if (!nombre || precio_caja === undefined) {
        return res.status(400).json({ mensaje: "Nombre y precio son obligatorios" });
    }
    try {
        const [prod] = await db.query("SELECT tipo FROM productos WHERE id = ?", [id]);
        if (prod.length === 0) return res.status(404).json({ mensaje: "Producto no encontrado" });

        // El stock se puede corregir directamente en productos de tercero o combinada.
        // En productos propios el stock lo maneja la producción por receta.
        if (prod[0].tipo !== 'propio' && stock_actual !== undefined) {
            await db.query(
                "UPDATE productos SET nombre = ?, precio_caja = ?, bodega_asignada = ?, stock_actual = ? WHERE id = ?",
                [nombre, precio_caja, bodega_asignada || 'Bodega Central', stock_actual, id]
            );
        } else {
            await db.query(
                "UPDATE productos SET nombre = ?, precio_caja = ?, bodega_asignada = ? WHERE id = ?",
                [nombre, precio_caja, bodega_asignada || 'Bodega Central', id]
            );
        }
        res.json({ mensaje: "Producto actualizado" });
    } catch (error) {
        console.error("Error al editar producto:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// #3 · Traspasar un producto a otra bodega (mueve todo su stock)
const actualizarBodegaProducto = async (req, res) => {
    const { id } = req.params;
    const { bodega_asignada } = req.body;
    if (!bodega_asignada) return res.status(400).json({ mensaje: 'Bodega requerida' });
    try {
        const [r] = await db.query("UPDATE productos SET bodega_asignada = ? WHERE id = ?", [bodega_asignada, id]);
        if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'Producto no encontrado' });
        res.json({ mensaje: 'Producto trasladado de bodega' });
    } catch (e) {
        console.error('Error al trasladar producto:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// #5 · Editar una receta (nombre, precio, bodega y sus ingredientes)
const editarReceta = async (req, res) => {
    const { id } = req.params;
    const { nombre, precio_caja, bodega_asignada, receta } = req.body;
    if (!nombre || precio_caja === undefined) return res.status(400).json({ mensaje: 'Nombre y precio son obligatorios' });
    if (!Array.isArray(receta) || receta.length === 0) return res.status(400).json({ mensaje: 'La receta debe tener al menos un ingrediente' });
    try {
        await db.query("START TRANSACTION");
        const [r] = await db.query(
            "UPDATE productos SET nombre = ?, precio_caja = ?, bodega_asignada = COALESCE(?, bodega_asignada) WHERE id = ? AND tipo = 'propio'",
            [nombre, precio_caja, bodega_asignada || null, id]
        );
        if (r.affectedRows === 0) { await db.query("ROLLBACK"); return res.status(404).json({ mensaje: 'Receta no encontrada' }); }
        await db.query("DELETE FROM producto_insumo WHERE producto_id = ?", [id]);
        for (const ing of receta) {
            await db.query("INSERT INTO producto_insumo (producto_id, insumo_id, cantidad_necesaria) VALUES (?, ?, ?)", [id, ing.insumo_id, ing.cantidad_necesaria]);
        }
        await db.query("COMMIT");
        res.json({ mensaje: 'Receta actualizada' });
    } catch (e) {
        await db.query("ROLLBACK");
        console.error('Error al editar receta:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Eliminar un producto (y su receta si la tiene)
const eliminarProducto = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("START TRANSACTION");
        await db.query("DELETE FROM producto_insumo WHERE producto_id = ?", [id]);
        const [result] = await db.query("DELETE FROM productos WHERE id = ?", [id]);
        await db.query("COMMIT");
        if (result.affectedRows === 0) return res.status(404).json({ mensaje: "Producto no encontrado" });
        res.json({ mensaje: "Producto eliminado" });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Editar materia prima completa (nombre, unidad, mínimo, stock, costo, bodega)
const editarInsumo = async (req, res) => {
    const { id } = req.params;
    const { nombre, unidad_medida, stock_minimo, stock_actual, costo_unitario, ubicacion } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    const unidad = UNIDADES_VALIDAS.includes(unidad_medida) ? unidad_medida : null;
    try {
        const [r] = await db.query(
            `UPDATE insumos SET
                nombre = ?,
                unidad_medida = COALESCE(?, unidad_medida),
                stock_minimo = COALESCE(?, stock_minimo),
                stock_actual = COALESCE(?, stock_actual),
                costo_unitario = COALESCE(?, costo_unitario),
                ubicacion = COALESCE(?, ubicacion)
             WHERE id = ?`,
            [
                nombre, unidad,
                stock_minimo != null && stock_minimo !== '' ? stock_minimo : null,
                stock_actual != null && stock_actual !== '' ? stock_actual : null,
                costo_unitario != null && costo_unitario !== '' ? costo_unitario : null,
                ubicacion || null, id
            ]
        );
        if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'Materia prima no encontrada' });
        res.json({ mensaje: 'Materia prima actualizada' });
    } catch (e) {
        console.error('Error al editar insumo:', e);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Eliminar una materia prima (insumo). Se bloquea si está en uso en alguna receta.
const eliminarInsumo = async (req, res) => {
    const { id } = req.params;
    try {
        const [usos] = await db.query(
            `SELECT COUNT(*) AS n FROM producto_insumo WHERE insumo_id = ?`, [id]
        );
        if (usos[0].n > 0) {
            return res.status(409).json({
                mensaje: `No se puede eliminar: esta materia prima se usa en ${usos[0].n} receta(s). Quítala de las recetas primero.`
            });
        }
        const [result] = await db.query("DELETE FROM insumos WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ mensaje: "Materia prima no encontrada" });
        res.json({ mensaje: "Materia prima eliminada" });
    } catch (error) {
        console.error("Error al eliminar insumo:", error);
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
    registrarEntradaTerceros,
    actualizarBodegaInsumo,
    editarProducto,
    eliminarProducto,
    eliminarInsumo,
    editarInsumo,
    obtenerBodegas,
    crearBodega,
    eliminarBodega,
    producirComboPorPorcentaje,
    actualizarBodegaProducto,
    editarReceta
};
