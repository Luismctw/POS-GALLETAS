const express = require('express');
const router = express.Router();
const {
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
    producirComboPorPorcentaje
} = require('../controllers/produccionController');

// Bodegas dinámicas
router.get('/bodegas', obtenerBodegas);
router.post('/bodegas', crearBodega);
router.delete('/bodegas/:id', eliminarBodega);

// Almacén de materia prima
router.get('/insumos', obtenerInsumos);
router.post('/insumos', crearInsumo);
router.patch('/insumos/:id/bodega', actualizarBodegaInsumo);
router.put('/insumos/:id', editarInsumo);
router.delete('/insumos/:id', eliminarInsumo);

// Almacén de producto terminado
router.get('/productos', obtenerProductos);
router.get('/recetas', obtenerProductosConReceta);
router.post('/nuevo-producto', crearProductoConReceta);
router.put('/productos/:id', editarProducto);
router.delete('/productos/:id', eliminarProducto);

// Producir por receta (descuenta materia prima y suma producto terminado)
router.post('/producir', producirPorReceta);

// #11 · Producir caja combinada por porcentajes (sabores individuales)
router.post('/producir-combo', producirComboPorPorcentaje);

// Entrada de stock para productos de terceros (reventa)
router.post('/terceros/entrada', registrarEntradaTerceros);

module.exports = router;
