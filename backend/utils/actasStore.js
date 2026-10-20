const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataDir } = require('./dataPaths');
const { getPool } = require('./pgPool');
const {
  inRango,
  matchesTecnico,
  countBy,
  countByMes,
  topLabel,
  paginate,
  collectTecnicos,
  mesBogota,
} = require('./dashboardStats');

function getStorePath() {
  return path.join(getDataDir(), 'actas.json');
}

function ensureStore() {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, '[]', 'utf8');
  }
}

function readAll() {
  ensureStore();
  try {
    const data = JSON.parse(fs.readFileSync(getStorePath(), 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(records) {
  ensureStore();
  fs.writeFileSync(getStorePath(), JSON.stringify(records, null, 2), 'utf8');
}

function anioBogota(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
  }).format(date);
}

function formatNumero(year, n) {
  return `${year}-${String(n).padStart(6, '0')}`;
}

function maxConsecutivo(records, year) {
  const re = new RegExp(`^${year}-(\\d{6})$`);
  let max = 0;
  for (const row of records) {
    const m = String(row.numeroActa || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function peekSiguienteNumero() {
  const year = anioBogota();
  return formatNumero(year, maxConsecutivo(readAll(), year) + 1);
}

async function ensureActasTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS actas (
      id UUID PRIMARY KEY,
      numero_acta TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fecha_novedad TEXT NOT NULL DEFAULT '',
      tipo_novedad TEXT NOT NULL DEFAULT '',
      nombre_tecnico TEXT NOT NULL DEFAULT '',
      cedula_tecnico TEXT NOT NULL DEFAULT '',
      unidad_negocio TEXT NOT NULL DEFAULT '',
      entregado JSONB NOT NULL DEFAULT '{}'::jsonb,
      recibido JSONB NOT NULL DEFAULT '{}'::jsonb,
      activos JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `);
}

async function maxConsecutivoPg(pool, year) {
  const { rows } = await pool.query(
    `SELECT numero_acta FROM actas WHERE numero_acta LIKE $1`,
    [`${year}-______`]
  );
  return maxConsecutivo(rows.map((r) => ({ numeroActa: r.numero_acta })), year);
}

async function insertActaPg(entry) {
  const pool = getPool();
  await ensureActasTable(pool);
  const year = anioBogota();
  let n = Math.max(maxConsecutivo(readAll(), year), await maxConsecutivoPg(pool, year)) + 1;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const numeroActa = formatNumero(year, n);
    try {
      await pool.query(
        `INSERT INTO actas (
          id, numero_acta, created_at, fecha_novedad, tipo_novedad,
          nombre_tecnico, cedula_tecnico, unidad_negocio, entregado, recibido, activos
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
        [
          entry.id,
          numeroActa,
          entry.createdAt,
          entry.fechaNovedad,
          entry.tipoNovedad,
          entry.nombreTecnico,
          entry.cedulaTecnico,
          entry.unidadNegocio,
          JSON.stringify(entry.entregado || {}),
          JSON.stringify(entry.recibido || {}),
          JSON.stringify(entry.activos || []),
        ]
      );
      return numeroActa;
    } catch (err) {
      if (err.code === '23505') {
        n += 1;
        continue;
      }
      throw err;
    }
  }
  throw new Error('No se pudo asignar el Nº de acta interno.');
}

function extractAnio(fecha) {
  const match = String(fecha ?? '').match(/^(\d{4})/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function labelUn(row) {
  return String(
    row.unidadNegocio
    || row.recibido?.unidadNegocio
    || row.entregado?.unidadNegocio
    || ''
  ).trim();
}

function serialesDe(row) {
  const activos = Array.isArray(row.activos) ? row.activos : [];
  return activos.map((a) => String(a.serie || '').trim()).filter(Boolean);
}

function etiquetasDe(row) {
  const activos = Array.isArray(row.activos) ? row.activos : [];
  return activos.map((a) => String(a.etiqueta || '').trim()).filter(Boolean);
}

function personaTxt(p) {
  if (!p) return '';
  return [p.nombre, p.cedula, p.cargo, p.departamento, p.unidadNegocio, p.ubicacion]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ');
}

async function appendActa(record) {
  const records = readAll();
  const activos = Array.isArray(record.activos)
    ? record.activos.map((a) => ({
      tipo: String(a.tipo ?? '').trim(),
      marca: String(a.marca ?? '').trim(),
      modelo: String(a.modelo ?? '').trim(),
      serie: String(a.serie ?? '').trim(),
      etiqueta: String(a.etiqueta ?? '').trim(),
    }))
    : [];
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    numeroActa: '',
    fechaNovedad: String(record.fechaNovedad ?? '').trim(),
    tipoNovedad: String(record.tipoNovedad ?? '').trim(),
    nombreTecnico: String(record.nombreTecnico ?? '').trim(),
    cedulaTecnico: String(record.cedulaTecnico ?? '').trim(),
    entregado: record.entregado || {},
    recibido: record.recibido || {},
    unidadNegocio: String(
      record.recibido?.unidadNegocio || record.entregado?.unidadNegocio || ''
    ).trim(),
    activos,
  };
  entry.numeroActa = await insertActaPg(entry);
  records.push(entry);
  writeAll(records);
  return entry;
}

function filterActas({
  q = '',
  anio = '',
  tipo = '',
  desde = '',
  hasta = '',
  sede = '',
  tecnico = '',
} = {}) {
  let items = readAll();
  const query = String(q).trim().toLowerCase();
  if (query) {
    items = items.filter((row) => {
      const hay = [
        row.numeroActa,
        ...serialesDe(row),
        ...etiquetasDe(row),
        personaTxt(row.recibido),
        personaTxt(row.entregado),
        row.nombreTecnico,
        row.cedulaTecnico,
      ].join(' ').toLowerCase();
      return hay.includes(query);
    });
  }

  if (anio) {
    const year = parseInt(String(anio), 10);
    if (!Number.isNaN(year)) {
      items = items.filter((row) => extractAnio(row.fechaNovedad || row.numeroActa) === year);
    }
  }

  if (tipo) {
    const tipoNorm = String(tipo).trim().toUpperCase();
    items = items.filter((row) => String(row.tipoNovedad ?? '').toUpperCase() === tipoNorm);
  }

  const unFiltro = String(sede || '').trim().toLowerCase();
  items = items.filter((row) =>
    inRango(row.fechaNovedad || row.createdAt, desde, hasta)
    && (!unFiltro || labelUn(row).toLowerCase() === unFiltro)
    && matchesTecnico(row, tecnico)
  );

  items.sort((a, b) => new Date(b.createdAt || b.fechaNovedad) - new Date(a.createdAt || a.fechaNovedad));

  const porTipo = countBy(items, (r) => r.tipoNovedad || 'Sin tipo');
  const porSede = countBy(items, (r) => labelUn(r));
  const porTecnico = countBy(items, (r) => r.nombreTecnico || r.cedulaTecnico);
  const porMes = countByMes(items, (r) => mesBogota(r.fechaNovedad || r.createdAt));

  const universe = readAll();
  const sedes = [...new Set(universe.map((r) => labelUn(r)).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'es'));

  return {
    items,
    filtros: {
      sedes,
      tecnicos: collectTecnicos(universe),
    },
    agregados: {
      kpis: {
        total: items.length,
        sedeTop: topLabel(porSede),
        tecnicoTop: topLabel(porTecnico),
        tipoTop: topLabel(porTipo),
      },
      porTipo,
      porSede,
      porTecnico,
      porMes,
    },
  };
}

function listActas({
  q = '',
  anio = '',
  tipo = '',
  desde = '',
  hasta = '',
  sede = '',
  tecnico = '',
  page = 1,
  limit = 10,
} = {}) {
  const filtered = filterActas({ q, anio, tipo, desde, hasta, sede, tecnico });
  return {
    ...paginate(filtered.items, page, limit),
    filtros: filtered.filtros,
    agregados: filtered.agregados,
  };
}

function getAniosDisponibles() {
  const years = new Set();
  for (const row of readAll()) {
    const y = extractAnio(row.fechaNovedad || row.numeroActa);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

module.exports = {
  peekSiguienteNumero,
  appendActa,
  listActas,
  filterActas,
  getAniosDisponibles,
  readAll,
};
