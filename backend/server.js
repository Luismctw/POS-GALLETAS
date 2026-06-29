const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Importar conexión a BD para inicializarla
require('./config/db');

// Health check API
app.get('/health', (req, res) => {
    res.json({ status: 'OK', mensaje: 'Servidor POS Galletas funcionando al 100%' });
});

// Rutas de la API
app.use('/api/repartidores', require('./routes/repartidorRoutes'));
app.use('/api/pedidos', require('./routes/pedidoRoutes'));
app.use('/api/gastos', require('./routes/gastoRoutes'));
app.use('/api/clientes', require('./routes/clienteRoutes'));
app.use('/api/produccion', require('./routes/produccionRoutes')); 
app.use('/api/balance', require('./routes/balanceRoutes'));

// Iniciar servidor
app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});