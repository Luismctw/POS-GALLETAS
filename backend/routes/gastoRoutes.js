const express = require('express');
const router = express.Router();
const multer = require('multer');
const { registrarGasto } = require('../controllers/gastoController');

// Configuración de multer para guardar los archivos en la carpeta 'uploads'
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Le agregamos la fecha al nombre para que no haya archivos duplicados
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Ruta: POST /api/gastos (Esperamos un archivo con el campo llamado 'foto')
router.post('/', upload.single('foto'), registrarGasto);

module.exports = router;