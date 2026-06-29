const express = require('express');
const router = express.Router();
const { obtenerBalanceDashboard } = require('../controllers/balanceController');

// Ruta: GET /api/balance/dashboard (Resumen financiero del día)
router.get('/dashboard', obtenerBalanceDashboard);

module.exports = router;