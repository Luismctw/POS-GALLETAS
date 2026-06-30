const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { registrarGasto, obtenerGastosRepartidor } = require('../controllers/gastoController');

// Ruta absoluta para uploads (funciona igual en local y en Hostinger)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.get('/',  obtenerGastosRepartidor);
router.post('/', upload.single('foto'), registrarGasto);

module.exports = router;
