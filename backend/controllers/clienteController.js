const db = require('../config/db');

// Obtener todos los clientes
const obtenerClientes = async (req, res) => {
    try {
        const [clientes] = await db.query("SELECT * FROM clientes");
        res.json(clientes);
    } catch (error) {
        console.error("Error al obtener clientes:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Registrar un abono/cobro a un cliente
const registrarCobro = async (req, res) => {
    const { id } = req.params;
    const { monto_abono } = req.body;

    if (!monto_abono || monto_abono <= 0) {
        return res.status(400).json({ mensaje: "El monto del abono debe ser mayor a 0" });
    }

    try {
        await db.query("START TRANSACTION");

        // Obtener deuda actual
        const [cliente] = await db.query("SELECT saldo_deudor FROM clientes WHERE id = ?", [id]);
        if (cliente.length === 0) {
            await db.query("ROLLBACK");
            return res.status(404).json({ mensaje: "Cliente no encontrado" });
        }

        const nueva_deuda = cliente[0].saldo_deudor - monto_abono;
        
        // Actualizar saldo
        await db.query(
            "UPDATE clientes SET saldo_deudor = ? WHERE id = ?",
            [nueva_deuda < 0 ? 0 : nueva_deuda, id]
        );

        await db.query("COMMIT");
        res.json({ mensaje: "Abono registrado exitosamente" });

    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error al registrar abono:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

// Crear un nuevo cliente
const crearCliente = async (req, res) => {
    const { nombre, direccion, telefono, limite_credito } = req.body;

    if (!nombre) {
        return res.status(400).json({ mensaje: "El nombre es obligatorio" });
    }

    try {
        await db.query(
            "INSERT INTO clientes (nombre, direccion, telefono, limite_credito, saldo_deudor, estatus) VALUES (?, ?, ?, ?, 0.00, 'activo')",
            [nombre, direccion || '', telefono || '', limite_credito || 0]
        );
        res.status(201).json({ mensaje: "Cliente guardado exitosamente" });
    } catch (error) {
        console.error("Error al crear cliente:", error);
        res.status(500).json({ mensaje: "Error interno del servidor" });
    }
};

module.exports = { obtenerClientes, registrarCobro, crearCliente };