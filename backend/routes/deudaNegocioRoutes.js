const express = require('express');
const router = express.Router();
const { obtenerDeudas, crearDeuda, registrarAbono } = require('../controllers/deudaNegocioController');

router.get('/', obtenerDeudas);
router.post('/', crearDeuda);
router.patch('/:id/abono', registrarAbono);

module.exports = router;
