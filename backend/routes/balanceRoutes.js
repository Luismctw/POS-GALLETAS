const express = require('express');
const router = express.Router();
const {
    obtenerBalanceDashboard,
    obtenerBalancePeriodo,
    obtenerTicketsBalance,
    obtenerBalanceProduccion
} = require('../controllers/balanceController');

router.get('/dashboard', obtenerBalanceDashboard);          // balance rápido del día
router.get('/', obtenerBalancePeriodo);                     // ?periodo=dia|semana|mes
router.get('/tickets', obtenerTicketsBalance);              // ?periodo=...
router.get('/produccion', obtenerBalanceProduccion);        // contabilidad de producción

module.exports = router;
