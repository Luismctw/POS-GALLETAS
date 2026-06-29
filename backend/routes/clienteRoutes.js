const express = require('express');
const router = express.Router();
const { obtenerClientes, registrarCobro, crearCliente } = require('../controllers/clienteController');

router.get('/', obtenerClientes);
router.post('/', crearCliente);
router.post('/:id/cobro', registrarCobro);

module.exports = router;