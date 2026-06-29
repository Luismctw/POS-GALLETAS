const express = require('express');
const router = express.Router();
const { obtenerRepartidores, crearRepartidor, autenticarRepartidor } = require('../controllers/repartidorController');

// Rutas del Panel Admin
router.get('/', obtenerRepartidores);
router.post('/', crearRepartidor);

// Ruta de la App Móvil (Login)
router.post('/auth', autenticarRepartidor);

module.exports = router;