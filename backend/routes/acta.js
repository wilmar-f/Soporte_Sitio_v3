const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { generarPdfActa, getActasPersonas } = require('../controllers/actaPdfController');
const { siguienteNumero, listar, exportar } = require('../controllers/actasHistorialController');

router.get('/actas-personas', authMiddleware, getActasPersonas);
router.get('/actas/siguiente-numero', authMiddleware, siguienteNumero);
router.get('/actas/export', adminMiddleware, exportar);
router.get('/actas', adminMiddleware, listar);
router.post('/generar-pdf-acta', authMiddleware, generarPdfActa);

module.exports = router;
