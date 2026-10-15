const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const {
  listarTecnicos,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  resetContrasena,
  estadoDb,
  importarUsuarios,
} = require('../controllers/adminUsersController');

router.get('/admin/db-status', adminMiddleware, estadoDb);
router.get('/admin/tecnicos', adminMiddleware, listarTecnicos);
router.post('/admin/tecnicos/import', adminMiddleware, importarUsuarios);
router.post('/admin/tecnicos', adminMiddleware, crearUsuario);
router.put('/admin/tecnicos/:cedula', adminMiddleware, actualizarUsuario);
router.delete('/admin/tecnicos/:cedula', adminMiddleware, eliminarUsuario);
router.post('/admin/tecnicos/reset-password', adminMiddleware, resetContrasena);

module.exports = router;
