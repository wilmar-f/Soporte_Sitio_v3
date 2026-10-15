const bcrypt = require('bcrypt');
const { getPool } = require('./pgPool');
const { normalizeCedula, normalizeRol } = require('./readTecnicos');

const SALT_ROUNDS = 10;

function throwCoded(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function publicUser(row) {
  return {
    cedula: row.cedula,
    nombreCompleto: row.nombre_completo,
    cargo: row.cargo || '',
    rol: row.rol,
  };
}

function wrapPg(err) {
  if (err.code === 'DB_NOT_CONFIGURED') throw err;
  if (err.code === '23505') throwCoded('DUPLICATE', 'Ya existe un usuario con esa cédula');
  const wrapped = new Error(err.message || 'Error de base de datos');
  wrapped.code = 'DB_UNAVAILABLE';
  wrapped.cause = err;
  throw wrapped;
}

async function findTecnicoForLogin(cedulaInput, password) {
  const cedula = normalizeCedula(cedulaInput);
  if (!cedula || !password) return null;
  let rows;
  try {
    ({ rows } = await getPool().query(
      `SELECT cedula, nombre_completo, cargo, rol, password_hash
       FROM tecnicos WHERE cedula = $1`,
      [cedula]
    ));
  } catch (err) {
    wrapPg(err);
  }
  const row = rows[0];
  if (!row || !row.password_hash) return null;
  const ok = await bcrypt.compare(String(password), row.password_hash);
  if (!ok) return null;
  return publicUser(row);
}

async function listTecnicosSeguro() {
  try {
    const { rows } = await getPool().query(
      `SELECT cedula, nombre_completo, cargo, rol
       FROM tecnicos
       ORDER BY nombre_completo`
    );
    return rows.map(publicUser);
  } catch (err) {
    wrapPg(err);
  }
}

async function countOtherAdmins(excludeCedula) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM tecnicos
     WHERE rol = 'administrador' AND cedula <> $1`,
    [excludeCedula || '']
  );
  return rows[0].n;
}

async function crearTecnico({ cedula, nombreCompleto, cargo, rol, contrasena }) {
  const ced = normalizeCedula(cedula);
  const nombre = String(nombreCompleto ?? '').trim();
  const cargoVal = String(cargo ?? '').trim();
  const rolVal = normalizeRol(rol);
  const pass = String(contrasena ?? '');

  if (!ced || !nombre || !pass) {
    throwCoded('VALIDATION', 'Cédula, nombre y contraseña son requeridos');
  }

  const hash = await bcrypt.hash(pass, SALT_ROUNDS);
  try {
    const { rows } = await getPool().query(
      `INSERT INTO tecnicos (cedula, nombre_completo, cargo, rol, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING cedula, nombre_completo, cargo, rol`,
      [ced, nombre, cargoVal, rolVal, hash]
    );
    return publicUser(rows[0]);
  } catch (err) {
    wrapPg(err);
  }
}

async function actualizarTecnico(cedulaActual, { cedula, nombreCompleto, cargo, rol, contrasena }) {
  const actual = normalizeCedula(cedulaActual);
  if (!actual) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');

  const nuevaCedula = normalizeCedula(cedula);
  const nombre = String(nombreCompleto ?? '').trim();
  const cargoVal = String(cargo ?? '').trim();
  const rolVal = normalizeRol(rol);
  const pass = String(contrasena ?? '').trim();

  if (!nuevaCedula || !nombre) {
    throwCoded('VALIDATION', 'Cédula y nombre son requeridos');
  }

  let existing;
  try {
    const found = await getPool().query(
      `SELECT cedula, rol FROM tecnicos WHERE cedula = $1`,
      [actual]
    );
    existing = found.rows[0];
  } catch (err) {
    wrapPg(err);
  }
  if (!existing) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');

  if (existing.rol === 'administrador' && rolVal !== 'administrador') {
    const others = await countOtherAdmins(actual);
    if (others === 0) {
      throwCoded('LAST_ADMIN', 'No se puede quitar el rol al último administrador');
    }
  }

  const sets = [
    'cedula = $1',
    'nombre_completo = $2',
    'cargo = $3',
    'rol = $4',
    'updated_at = NOW()',
  ];
  const params = [nuevaCedula, nombre, cargoVal, rolVal];
  if (pass) {
    sets.push(`password_hash = $${params.length + 1}`);
    params.push(await bcrypt.hash(pass, SALT_ROUNDS));
  }
  params.push(actual);

  try {
    const { rowCount } = await getPool().query(
      `UPDATE tecnicos SET ${sets.join(', ')} WHERE cedula = $${params.length}`,
      params
    );
    if (!rowCount) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND' || err.code === 'LAST_ADMIN') throw err;
    wrapPg(err);
  }

  return {
    cedula: nuevaCedula,
    nombreCompleto: nombre,
    cargo: cargoVal,
    rol: rolVal,
    contrasenaActualizada: Boolean(pass),
  };
}

async function eliminarTecnico(cedulaInput) {
  const ced = normalizeCedula(cedulaInput);
  if (!ced) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');

  let existing;
  try {
    const found = await getPool().query(
      `SELECT cedula, rol FROM tecnicos WHERE cedula = $1`,
      [ced]
    );
    existing = found.rows[0];
  } catch (err) {
    wrapPg(err);
  }
  if (!existing) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');

  if (existing.rol === 'administrador') {
    const others = await countOtherAdmins(ced);
    if (others === 0) {
      throwCoded('LAST_ADMIN', 'No se puede eliminar al último administrador');
    }
  }

  try {
    await getPool().query(`DELETE FROM tecnicos WHERE cedula = $1`, [ced]);
  } catch (err) {
    wrapPg(err);
  }
  return { ok: true };
}

async function adminResetContrasena(cedulaInput, contrasenaNueva) {
  const ced = normalizeCedula(cedulaInput);
  if (!ced) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');
  const hash = await bcrypt.hash(String(contrasenaNueva), SALT_ROUNDS);
  try {
    const result = await getPool().query(
      `UPDATE tecnicos SET password_hash = $1, updated_at = NOW() WHERE cedula = $2`,
      [hash, ced]
    );
    if (!result.rowCount) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND') throw err;
    wrapPg(err);
  }
  return { ok: true };
}

async function cambiarContrasenaPropia(cedulaInput, contrasenaActual, contrasenaNueva) {
  const ced = normalizeCedula(cedulaInput);
  if (!ced) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');
  let row;
  try {
    const found = await getPool().query(
      `SELECT cedula, password_hash FROM tecnicos WHERE cedula = $1`,
      [ced]
    );
    row = found.rows[0];
  } catch (err) {
    wrapPg(err);
  }
  if (!row) throwCoded('USER_NOT_FOUND', 'Usuario no encontrado');
  const ok = await bcrypt.compare(String(contrasenaActual), row.password_hash);
  if (!ok) throwCoded('INVALID_PASSWORD', 'La contraseña actual es incorrecta');
  const hash = await bcrypt.hash(String(contrasenaNueva), SALT_ROUNDS);
  try {
    await getPool().query(
      `UPDATE tecnicos SET password_hash = $1, updated_at = NOW() WHERE cedula = $2`,
      [hash, ced]
    );
  } catch (err) {
    wrapPg(err);
  }
  return { ok: true };
}

module.exports = {
  findTecnicoForLogin,
  listTecnicosSeguro,
  crearTecnico,
  actualizarTecnico,
  eliminarTecnico,
  adminResetContrasena,
  cambiarContrasenaPropia,
};
