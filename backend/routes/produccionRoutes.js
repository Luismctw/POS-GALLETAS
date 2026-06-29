const express = require('express');
const router = express.Router();
// Aquí en la línea 3 importamos la nueva función del controlador:
const { obtenerInsumos, registrarProduccion, registrarEntradaInsumo, crearProductoConReceta } = require('../controllers/produccionController');

router.get('/insumos', obtenerInsumos);
router.post('/', registrarProduccion);
router.post('/insumos/entrada', registrarEntradaInsumo);
router.post('/nuevo-producto', crearProductoConReceta); // <--- NUEVA RUTA CONECTADA

module.exports = router;