const express = require('express');
const router = express.Router();
const { obtenerRutaDelDia, obtenerResumenRepartidor, entregarPedido, reagendarPedido, crearPedido, obtenerPedidos } = require('../controllers/pedidoController');


//NUEVA RUTA PARA EL MONITOR
router.get('/', obtenerPedidos); 


// Rutas GET (Lectura)
router.get('/ruta/:repId/:fecha', obtenerRutaDelDia);
router.get('/resumen/:repId/:fecha', obtenerResumenRepartidor);

// Rutas POST/PATCH (Acciones)
router.post('/', crearPedido); // <--- NUEVA RUTA PARA ASIGNAR PEDIDOS
router.patch('/:id/entregar', entregarPedido);
router.patch('/:id/reagendar', reagendarPedido);

module.exports = router;