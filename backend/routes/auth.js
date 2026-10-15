const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { login, cambiarClave } = require('../controllers/authController');

router.post('/login', login);
router.post('/auth/cambiar-clave', authMiddleware, cambiarClave);

module.exports = router;
