const express = require('express');
const router = express.Router();
const { obtenerCapital, agregarMovimiento, eliminarMovimiento } = require('../controllers/capitalController');

router.get('/', obtenerCapital);
router.post('/', agregarMovimiento);
router.delete('/:id', eliminarMovimiento);

module.exports = router;
