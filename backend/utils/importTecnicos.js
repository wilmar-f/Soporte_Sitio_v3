const { normalizeCedula, normalizeRol } = require('./readTecnicos');
const { validarComplejidadContrasena } = require('./passwordPolicy');

const MAX_FILAS = 200;
const HEADER_ALIASES = {
  cedula: ['cedula', 'cédula', 'documento'],
  nombre: ['nombre', 'nombre_completo', 'nombrecompleto', 'nombre completo'],
  cargo: ['cargo'],
  rol: ['rol'],
  contrasena: ['contrasena', 'contraseña', 'password', 'clave'],
};

function normHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function splitLine(line) {
  if (line.includes(';')) return line.split(';').map((c) => c.trim());
  return line.split(',').map((c) => c.trim());
}

function isHeaderRow(cells) {
  const joined = cells.map(normHeader).join(' ');
  return HEADER_ALIASES.cedula.some((a) => joined.includes(normHeader(a)))
    && HEADER_ALIASES.nombre.some((a) => joined.includes(normHeader(a)));
}

function parseImportText(texto) {
  const raw = String(texto ?? '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    return { filas: [], error: 'El archivo está vacío' };
  }
  if (lines.length > MAX_FILAS + 1) {
    return { filas: [], error: `Máximo ${MAX_FILAS} filas de datos` };
  }

  let start = 0;
  let map = { cedula: 0, nombre: 1, cargo: 2, rol: 3, contrasena: 4 };
  const first = splitLine(lines[0]);
  if (isHeaderRow(first)) {
    map = { cedula: -1, nombre: -1, cargo: -1, rol: -1, contrasena: -1 };
    first.forEach((cell, i) => {
      const n = normHeader(cell);
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some((a) => n === normHeader(a))) map[key] = i;
      }
    });
    start = 1;
    if (map.cedula < 0 || map.nombre < 0 || map.contrasena < 0) {
      return { filas: [], error: 'La cabecera debe incluir cédula, nombre y contraseña' };
    }
  }

  const filas = [];
  for (let i = start; i < lines.length; i++) {
    filas.push({ linea: i + 1, cells: splitLine(lines[i]), map });
  }
  return { filas, error: null };
}

function filaADatos({ linea, cells, map }) {
  const pick = (key) => (map[key] >= 0 ? String(cells[map[key]] ?? '').trim() : '');
  const cedula = normalizeCedula(pick('cedula'));
  const nombreCompleto = pick('nombre');
  const cargo = pick('cargo');
  const rol = normalizeRol(pick('rol'));
  const contrasena = pick('contrasena');
  return { linea, cedula, nombreCompleto, cargo, rol, contrasena };
}

function validarFilaImport(datos) {
  if (!datos.cedula) return 'Cédula inválida o vacía';
  if (!datos.nombreCompleto) return 'Nombre vacío';
  if (!datos.contrasena) return 'Contraseña vacía';
  const cx = validarComplejidadContrasena(datos.contrasena);
  if (!cx.ok) return cx.error;
  return null;
}

module.exports = {
  MAX_FILAS,
  parseImportText,
  filaADatos,
  validarFilaImport,
};
