const jwt = require('jsonwebtoken');
const { findTecnicoForLogin, cambiarContrasenaPropia } = require('../utils/tecnicosDb');
const { validarComplejidadContrasena } = require('../utils/passwordPolicy');

exports.login = async (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Cédula y contraseña son requeridos' });
  }

  try {
    const tecnico = await findTecnicoForLogin(usuario, contrasena);
    if (!tecnico) {
      return res.status(401).json({ error: 'Cédula o contraseña incorrectos' });
    }

    const secret = process.env.JWT_SECRET || 'secret_dev_fallback';
    const token = jwt.sign(
      { cedula: tecnico.cedula, rol: tecnico.rol },
      secret,
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      usuario: {
        cedula: tecnico.cedula,
        nombreCompleto: tecnico.nombreCompleto,
        cargo: tecnico.cargo,
        rol: tecnico.rol,
      },
    });
  } catch (err) {
    if (err.code === 'DB_NOT_CONFIGURED' || err.code === 'DB_UNAVAILABLE') {
      console.error('Login sin Postgres:', err.message);
      return res.status(503).json({
        error: 'No hay conexión a la base de datos. No se puede iniciar sesión.',
      });
    }
    console.error('Error en login:', err.message);
    return res.status(500).json({ error: 'Error interno al validar técnicos' });
  }
};

exports.cambiarClave = async (req, res) => {
  const { contrasenaActual, contrasenaNueva, contrasenaConfirmacion } = req.body || {};
  if (!contrasenaActual || !contrasenaNueva || !contrasenaConfirmacion) {
    return res.status(400).json({ error: 'Complete contraseña actual, nueva y confirmación' });
  }
  if (contrasenaNueva !== contrasenaConfirmacion) {
    return res.status(400).json({ error: 'La nueva contraseña y la confirmación no coinciden' });
  }
  const complejidad = validarComplejidadContrasena(contrasenaNueva);
  if (!complejidad.ok) {
    return res.status(400).json({ error: complejidad.error });
  }

  try {
    await cambiarContrasenaPropia(req.user?.cedula, contrasenaActual, contrasenaNueva);
    return res.json({ ok: true, mensaje: 'Contraseña actualizada.' });
  } catch (err) {
    if (err.code === 'INVALID_PASSWORD') {
      return res.status(401).json({ error: err.message });
    }
    if (err.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === 'DB_NOT_CONFIGURED' || err.code === 'DB_UNAVAILABLE') {
      return res.status(503).json({ error: 'No hay conexión a Postgres. No se cambió la clave.' });
    }
    console.error('Error cambiando clave:', err.message);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
  }
};

