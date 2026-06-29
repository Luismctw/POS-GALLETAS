const db = require('../config/db');

// 1. Obtener todos los repartidores (Para el Panel)
const obtenerRepartidores = async (req, res) => {
    try {
        const [repartidores] = await db.query("SELECT id, nombre, estatus FROM repartidores");
        res.json(repartidores);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener repartidores" });
    }
};

// 2. Crear nuevo repartidor (Para el Panel)
const crearRepartidor = async (req, res) => {
    const { nombre, pin } = req.body;
    try {
        await db.query("INSERT INTO repartidores (nombre, pin, estatus) VALUES (?, ?, 'activo')", [nombre, pin]);
        res.status(201).json({ mensaje: "Repartidor agregado con éxito" });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al crear repartidor" });
    }
};

// 3. Autenticar Repartidor (LOGIN PARA LA APP MÓVIL)
const autenticarRepartidor = async (req, res) => {
    const { pin } = req.body;
    try {
        const [repartidores] = await db.query("SELECT id, nombre FROM repartidores WHERE pin = ? AND estatus = 'activo'", [pin]);
        
        if (repartidores.length === 0) {
            return res.status(401).json({ mensaje: "PIN incorrecto o repartidor inactivo" });
        }
        
        res.json({ mensaje: "Login exitoso", repartidor: repartidores[0] });
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = { obtenerRepartidores, crearRepartidor, autenticarRepartidor };