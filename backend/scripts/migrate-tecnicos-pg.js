/**
 * Importa backend/data/tecnicos.xlsx a Postgres (una vez).
 * Requiere DATABASE_URL. No pisa filas ya existentes (ON CONFLICT DO NOTHING).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { getPool } = require('../utils/pgPool');
const { getTecnicos } = require('../utils/readTecnicos');

const SALT_ROUNDS = 10;

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tecnicos (
      cedula TEXT PRIMARY KEY,
      nombre_completo TEXT NOT NULL,
      cargo TEXT NOT NULL DEFAULT '',
      rol TEXT NOT NULL DEFAULT 'tecnico',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function main() {
  const pool = getPool();
  await ensureTable(pool);
  const tecnicos = getTecnicos();
  let inserted = 0;
  let skipped = 0;
  for (const t of tecnicos) {
    if (!t.cedula) continue;
    const plain = String(t.contraseña ?? '');
    if (!plain) {
      console.warn(`Sin contraseña, se omite cédula ${t.cedula}`);
      skipped += 1;
      continue;
    }
    const hash = await bcrypt.hash(plain, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO tecnicos (cedula, nombre_completo, cargo, rol, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cedula) DO NOTHING`,
      [t.cedula, t.nombreCompleto || '', t.cargo || '', t.rol || 'tecnico', hash]
    );
    if (result.rowCount) inserted += 1;
    else skipped += 1;
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM tecnicos');
  console.log(`Migración listo. insertados=${inserted} omitidos=${skipped} total_tabla=${rows[0].n}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
