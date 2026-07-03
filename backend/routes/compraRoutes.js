const express = require('express');
const router = express.Router();
const { registrarCompra, obtenerCompras, obtenerAnalisisCompras, eliminarCompra } = require('../controllers/compraController');

router.post('/', registrarCompra);
router.get('/', obtenerCompras);
router.get('/analisis', obtenerAnalisisCompras);
router.delete('/:id', eliminarCompra);

module.exports = router;
