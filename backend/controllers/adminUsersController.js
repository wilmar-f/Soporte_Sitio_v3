const {
  listTecnicosSeguro,
  adminResetContrasena,
  crearTecnico,
  actualizarTecnico,
  eliminarTecnico,
} = require('../utils/tecnicosDb');
const { parseImportText, filaADatos, validarFilaImport } = require('../utils/importTecnicos');
const { normalizeCedula, normalizeRol } = require('../utils/readTecnicos');
const { pingDb } = require('../utils/pgPool');
const { MIN_PASSWORD_LENGTH, validarComplejidadContrasena } = require('../utils/passwordPolicy');

const MAX_RESULTS = 50;

function normalizeSearch(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function handleCrudError(res, err, fallback) {
  if (err.code === 'USER_NOT_FOUND') {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  if (err.code === 'DUPLICATE') {
    return res.status(409).json({ error: err.message || 'Ya existe un usuario con esa cédula' });
  }
  if (err.code === 'LAST_ADMIN') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'VALIDATION') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'DB_NOT_CONFIGURED' || err.code === 'DB_UNAVAILABLE') {
    console.error(fallback, err.message);
    return res.status(503).json({
      error: 'No hay conexión a Postgres. No se guardó ningún cambio.',
    });
  }
  console.error(fallback, err.message);
  return res.status(500).json({ error: fallback });
}

function validarPasswordOpcional(contrasenaNueva, contrasenaConfirmacion, { requerida }) {
  const nueva = String(contrasenaNueva ?? '');
  const confirmacion = String(contrasenaConfirmacion ?? '');

  if (!nueva && !confirmacion) {
    if (requerida) {
      return { error: 'Complete los campos de contraseña' };
    }
    return { password: '' };
  }

  if (!nueva || !confirmacion) {
    return { error: 'Complete la contraseña y la confirmación' };
  }
  if (nueva !== confirmacion) {
    return { error: 'La nueva contraseña y la confirmación no coinciden' };
  }
  if (nueva.length < MIN_PASSWORD_LENGTH) {
    return { error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` };
  }
  const complejidad = validarComplejidadContrasena(nueva);
  if (!complejidad.ok) {
    return { error: complejidad.error };
  }
  return { password: nueva };
}

function camposUsuario(body) {
  return {
    cedula: normalizeCedula(body?.cedula),
    nombreCompleto: String(body?.nombreCompleto ?? '').trim(),
    cargo: String(body?.cargo ?? '').trim(),
    rol: normalizeRol(body?.rol),
  };
}

exports.estadoDb = async (_req, res) => {
  const ping = await pingDb();
  const status = ping.ok ? 200 : 503;
  return res.status(status).json(ping);
};

exports.listarTecnicos = async (req, res) => {
  const q = normalizeSearch(req.query.q);

  try {
    let tecnicos = await listTecnicosSeguro();

    if (q) {
      const qDigits = q.replace(/\D/g, '');
      tecnicos = tecnicos.filter((t) => {
        const matchNombre = normalizeSearch(t.nombreCompleto).includes(q);
        const matchCedula = qDigits && t.cedula.includes(qDigits);
        return matchNombre || matchCedula;
      });
    }

    tecnicos = tecnicos
      .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'))
      .slice(0, MAX_RESULTS);

    return res.json({ tecnicos, total: tecnicos.length });
  } catch (err) {
    return handleCrudError(res, err, 'Error interno al leer técnicos');
  }
};

exports.crearUsuario = async (req, res) => {
  const datos = camposUsuario(req.body);
  const pass = validarPasswordOpcional(
    req.body?.contrasenaNueva,
    req.body?.contrasenaConfirmacion,
    { requerida: true }
  );

  if (!datos.cedula || !datos.nombreCompleto) {
    return res.status(400).json({ error: 'Cédula y nombre son requeridos' });
  }
  if (pass.error) {
    return res.status(400).json({ error: pass.error });
  }

  try {
    const usuario = await crearTecnico({ ...datos, contrasena: pass.password });
    console.log(`Usuario creado: admin ${req.user?.cedula} → ${usuario.cedula}`);
    return res.status(201).json({
      ok: true,
      usuario,
      mensaje: 'Usuario creado. Comuníquele la contraseña temporal por un canal seguro.',
    });
  } catch (err) {
    return handleCrudError(res, err, 'No se pudo crear el usuario');
  }
};

exports.actualizarUsuario = async (req, res) => {
  const cedulaActual = normalizeCedula(req.params.cedula);
  const datos = camposUsuario(req.body);
  const pass = validarPasswordOpcional(
    req.body?.contrasenaNueva,
    req.body?.contrasenaConfirmacion,
    { requerida: false }
  );

  if (!cedulaActual) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  if (!datos.cedula || !datos.nombreCompleto) {
    return res.status(400).json({ error: 'Cédula y nombre son requeridos' });
  }
  if (pass.error) {
    return res.status(400).json({ error: pass.error });
  }

  try {
    const usuario = await actualizarTecnico(cedulaActual, {
      ...datos,
      contrasena: pass.password,
    });
    console.log(`Usuario actualizado: admin ${req.user?.cedula} → ${cedulaActual}`);
    return res.json({
      ok: true,
      usuario,
      mensaje: usuario.contrasenaActualizada
        ? 'Usuario actualizado. Comuníquele la nueva contraseña por un canal seguro.'
        : 'Usuario actualizado.',
    });
  } catch (err) {
    return handleCrudError(res, err, 'No se pudo actualizar el usuario');
  }
};

exports.eliminarUsuario = async (req, res) => {
  const cedula = normalizeCedula(req.params.cedula);
  const adminCedula = normalizeCedula(req.user?.cedula);

  if (!cedula) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  if (cedula === adminCedula) {
    return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
  }

  try {
    await eliminarTecnico(cedula);
    console.log(`Usuario eliminado: admin ${adminCedula} → ${cedula}`);
    return res.json({ ok: true, mensaje: 'Usuario eliminado.' });
  } catch (err) {
    return handleCrudError(res, err, 'No se pudo eliminar el usuario');
  }
};

exports.resetContrasena = async (req, res) => {
  const adminCedula = req.user?.cedula;
  const { cedula, contrasenaNueva, contrasenaConfirmacion } = req.body || {};

  const pass = validarPasswordOpcional(contrasenaNueva, contrasenaConfirmacion, { requerida: true });
  if (!cedula) {
    return res.status(400).json({ error: 'Complete cédula y campos de contraseña' });
  }
  if (pass.error) {
    return res.status(400).json({ error: pass.error });
  }

  const cedulaNorm = normalizeCedula(cedula);
  if (!cedulaNorm) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  try {
    await adminResetContrasena(cedulaNorm, pass.password);
    console.log(`Reset contraseña: admin ${adminCedula} → usuario ${cedulaNorm}`);
    return res.json({
      ok: true,
      mensaje: 'Contraseña restablecida. Comuníquela al técnico por un canal seguro.',
    });
  } catch (err) {
    return handleCrudError(res, err, 'No se pudo restablecer la contraseña');
  }
};

exports.importarUsuarios = async (req, res) => {
  const parsed = parseImportText(req.body?.texto);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const existentes = new Set((await listTecnicosSeguro()).map((t) => t.cedula));
    const vistos = new Set();
    const creados = [];
    const omitidos = [];

    for (const raw of parsed.filas) {
      const datos = filaADatos(raw);
      const motivo = validarFilaImport(datos);
      if (motivo) {
        omitidos.push({ linea: datos.linea, cedula: datos.cedula || '', motivo });
        continue;
      }
      if (vistos.has(datos.cedula) || existentes.has(datos.cedula)) {
        omitidos.push({
          linea: datos.linea,
          cedula: datos.cedula,
          motivo: 'Cédula duplicada (archivo o ya existe)',
        });
        continue;
      }
      try {
        const usuario = await crearTecnico(datos);
        existentes.add(usuario.cedula);
        vistos.add(usuario.cedula);
        creados.push(usuario.cedula);
      } catch (err) {
        omitidos.push({
          linea: datos.linea,
          cedula: datos.cedula,
          motivo: err.message || 'No se pudo crear',
        });
      }
    }

    console.log(`Import técnicos: admin ${req.user?.cedula} creados=${creados.length} omitidos=${omitidos.length}`);
    return res.json({
      ok: true,
      creados: creados.length,
      omitidos,
      mensaje: `Creados ${creados.length}. Omitidos ${omitidos.length}.`,
    });
  } catch (err) {
    return handleCrudError(res, err, 'No se pudo importar el archivo');
  }
};

