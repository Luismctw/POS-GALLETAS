const express = require('express');
const router = express.Router();
const {
    crearPedido,
    asignarPedido,
    obtenerPedidosCreados,
    obtenerPedidos,
    obtenerPedidosPrioritarios,
    obtenerRutaDelDia,
    obtenerResumenRepartidor,
    entregarPedido,
    reagendarPedido,
    obtenerFrecuenciaCompra,
    obtenerControlCarga,
    registrarRetorno,
    cancelarPedido,
    corregirCobro,
    obtenerContenidos
} = require('../controllers/pedidoController');

// Lectura (panel admin)
router.get('/', obtenerPedidos);                       // monitor de todos los pedidos
router.get('/creados', obtenerPedidosCreados);         // pendientes de asignar
router.get('/prioritarios', obtenerPedidosPrioritarios); // reagendados/atrasados
router.get('/frecuencia', obtenerFrecuenciaCompra);
router.get('/contenidos', obtenerContenidos);    // analítica de compra
router.get('/control-carga/:fecha', obtenerControlCarga);
router.post('/retorno', registrarRetorno);

// App móvil
router.get('/ruta/:repId/:fecha', obtenerRutaDelDia);
router.get('/resumen/:repId/:fecha', obtenerResumenRepartidor);

// Acciones
router.post('/', crearPedido);                         // crear pedido (Producción)
router.patch('/:id/asignar', asignarPedido);           // asignar repartidor
router.patch('/:id/entregar', entregarPedido);
router.patch('/:id/reagendar', reagendarPedido);
router.patch('/:id/cancelar', cancelarPedido);
router.patch('/:id/corregir-cobro', corregirCobro);

module.exports = router;
