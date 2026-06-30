const express = require('express');
const router = express.Router();
const { registrarCompra, obtenerCompras, obtenerAnalisisCompras } = require('../controllers/compraController');

router.post('/', registrarCompra);
router.get('/', obtenerCompras);
router.get('/analisis', obtenerAnalisisCompras);

module.exports = router;
