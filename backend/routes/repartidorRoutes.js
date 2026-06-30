const express = require('express');
const router = express.Router();
const { obtenerRepartidores, crearRepartidor, editarRepartidor, toggleRepartidor, autenticarRepartidor } = require('../controllers/repartidorController');

router.get('/',                 obtenerRepartidores);
router.post('/',                crearRepartidor);
router.put('/:id',              editarRepartidor);
router.patch('/:id/toggle',     toggleRepartidor);
router.post('/auth',            autenticarRepartidor);

module.exports = router;
