const { Pool } = require('pg');

let pool;

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

function throwDb(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function getPool() {
  const url = getDatabaseUrl();
  if (!url) {
    throwDb('DB_NOT_CONFIGURED', 'DATABASE_URL no está configurado');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 8000,
    });
  }
  return pool;
}

async function pingDb() {
  const started = Date.now();
  const url = getDatabaseUrl();
  if (!url) {
    return { ok: false, latencyMs: 0, error: 'DATABASE_URL no está configurado' };
  }
  try {
    await getPool().query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started, error: null };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err.message || 'No se pudo conectar a Postgres',
    };
  }
}

module.exports = {
  getDatabaseUrl,
  getPool,
  pingDb,
};
