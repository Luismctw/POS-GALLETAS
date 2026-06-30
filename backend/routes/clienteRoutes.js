const express = require('express');
const router = express.Router();
const { obtenerClientes, obtenerDeudas, registrarCobro, crearCliente, editarCliente, toggleBloqueo, obtenerHistorialCobros } = require('../controllers/clienteController');

router.get('/',                   obtenerClientes);
router.get('/deudas',             obtenerDeudas);
router.post('/',                  crearCliente);
router.put('/:id',                editarCliente);
router.post('/:id/cobro',         registrarCobro);
router.patch('/:id/bloqueo',      toggleBloqueo);
router.get('/:id/historial',      obtenerHistorialCobros);

module.exports = router;
