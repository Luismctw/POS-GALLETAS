const express = require('express');
const router = express.Router();
const {
    obtenerInsumos,
    crearInsumo,
    obtenerProductos,
    obtenerProductosConReceta,
    crearProductoConReceta,
    producirPorReceta,
    registrarEntradaTerceros
} = require('../controllers/produccionController');

// Almacén de materia prima
router.get('/insumos', obtenerInsumos);
router.post('/insumos', crearInsumo);

// Almacén de producto terminado
router.get('/productos', obtenerProductos);
router.get('/recetas', obtenerProductosConReceta);
router.post('/nuevo-producto', crearProductoConReceta);

// Producir por receta (descuenta materia prima y suma producto terminado)
router.post('/producir', producirPorReceta);

// Entrada de stock para productos de terceros (reventa)
router.post('/terceros/entrada', registrarEntradaTerceros);

module.exports = router;
