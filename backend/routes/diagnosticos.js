const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const { listar, exportar } = require('../controllers/diagnosticosController');

router.get('/diagnosticos/export', adminMiddleware, exportar);
router.get('/diagnosticos', adminMiddleware, listar);

module.exports = router;
