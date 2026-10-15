const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataDir } = require('./dataPaths');
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

const TIPOS_LABEL = {
  ESTANDAR: 'DIAGNOSTICO CON ACTIVOS',
  GESTOR_GARANTIAS: 'DIAGNOSTICO CON GESTOR GARANTIAS',
  RENOVACION: 'DIAGNOSTICO RENOVACION',
  DAAS: 'DAAS',
};

function getStorePath() {
  return path.join(getDataDir(), 'diagnosticos.json');
}

function ensureStore() {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, '[]', 'utf8');
  }
}

function readAll() {
  ensureStore();
  const storePath = getStorePath();
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(records) {
  ensureStore();
  const storePath = getStorePath();
  fs.writeFileSync(storePath, JSON.stringify(records, null, 2), 'utf8');
}

function labelUn(row) {
  return String(row.ubicacionFisica || row.sedeCodigo || row.sede || '').trim();
}

function extractAnio(fecha) {
  const match = String(fecha ?? '').match(/^(\d{4})/);
  if (match) return parseInt(match[1], 10);
  const d = new Date(fecha);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

function appendDiagnostico(record) {
  const records = readAll();
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    fecha: String(record.fecha ?? '').trim(),
    sede: String(record.sede ?? '').trim(),
    sedeCodigo: String(record.sedeCodigo ?? '').trim(),
    ubicacionFisica: String(record.ubicacionFisica ?? '').trim(),
    nombreTecnico: String(record.nombreTecnico ?? '').trim(),
    cedulaTecnico: String(record.cedulaTecnico ?? '').trim(),
    tipoDiagnostico: String(record.tipoDiagnostico ?? '').trim().toUpperCase(),
    serial: String(record.serial ?? '').trim(),
    etiqueta: String(record.etiqueta ?? '').trim(),
  };
  records.push(entry);
  writeAll(records);
  return entry;
}

function filterDiagnosticos({
  q = '',
  anio = '',
  tipo = '',
  desde = '',
  hasta = '',
  sede = '',
  tecnico = '',
  flujo = '',
} = {}) {
  const all = readAll();
  const flujos = new Set(
    String(flujo || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const quiereClasico = flujos.has('clasico');
  const quiereIa = flujos.has('ia');
  let items = all;
  if (quiereClasico && !quiereIa) {
    items = items.filter((row) => String(row.tipoDiagnostico ?? '').toUpperCase() !== 'BETA');
  } else if (quiereIa && !quiereClasico) {
    items = items.filter((row) => String(row.tipoDiagnostico ?? '').toUpperCase() === 'BETA');
  } else if (!quiereClasico && !quiereIa && flujos.size) {
    items = [];
  }

  const query = String(q).trim().toLowerCase();
  if (query) {
    items = items.filter(row =>
      String(row.serial ?? '').toLowerCase().includes(query) ||
      String(row.etiqueta ?? '').toLowerCase().includes(query)
    );
  }

  if (anio) {
    const year = parseInt(String(anio), 10);
    if (!Number.isNaN(year)) {
      items = items.filter(row => extractAnio(row.fecha) === year);
    }
  }

  if (tipo) {
    const tipoNorm = String(tipo).trim().toUpperCase();
    items = items.filter(row => String(row.tipoDiagnostico ?? '').toUpperCase() === tipoNorm);
  }

  const unFiltro = String(sede || '').trim().toLowerCase();
  items = items.filter(row =>
    inRango(row.fecha || row.createdAt, desde, hasta) &&
    (!unFiltro || labelUn(row).toLowerCase() === unFiltro) &&
    matchesTecnico(row, tecnico)
  );

  items.sort((a, b) => new Date(b.createdAt || b.fecha) - new Date(a.createdAt || a.fecha));

  const porTipo = countBy(items, r => TIPOS_LABEL[r.tipoDiagnostico] || r.tipoDiagnostico || 'Sin tipo');
  const porSede = countBy(items, r => labelUn(r));
  const porTecnico = countBy(items, r => r.nombreTecnico || r.cedulaTecnico);
  const porMes = countByMes(items, r => mesBogota(r.fecha || r.createdAt));

  const universe = (quiereClasico && quiereIa) || !flujos.size
    ? all
    : quiereIa
      ? all.filter((row) => String(row.tipoDiagnostico ?? '').toUpperCase() === 'BETA')
      : quiereClasico
        ? all.filter((row) => String(row.tipoDiagnostico ?? '').toUpperCase() !== 'BETA')
        : [];

  const sedes = [...new Set(universe.map(r => labelUn(r)).filter(Boolean))]
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

function listDiagnosticos({
  q = '',
  anio = '',
  tipo = '',
  desde = '',
  hasta = '',
  sede = '',
  tecnico = '',
  flujo = '',
  page = 1,
  limit = 10,
} = {}) {
  const filtered = filterDiagnosticos({ q, anio, tipo, desde, hasta, sede, tecnico, flujo });
  return {
    ...paginate(filtered.items, page, limit),
    filtros: filtered.filtros,
    agregados: filtered.agregados,
  };
}

function getAniosDisponibles() {
  const years = new Set();
  for (const row of readAll()) {
    const y = extractAnio(row.fecha);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

module.exports = {
  appendDiagnostico,
  listDiagnosticos,
  filterDiagnosticos,
  getAniosDisponibles,
  readAll,
};
