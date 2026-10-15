const fs = require('fs');
const path = require('path');

const SEED_DATA_DIR = path.join(__dirname, '../data');

function getDataDir() {
  return process.env.DATA_DIR || SEED_DATA_DIR;
}

/** Aviso si en producción no hay disco persistente (plan Free: el Excel es el de Git). */
function assertProductionDataDir() {
  if (process.env.NODE_ENV !== 'production') return;
  const configured = String(process.env.DATA_DIR || '').trim();
  if (!configured) {
    console.warn(
      'Aviso: DATA_DIR no está definido. Se usa el tecnicos.xlsx del repositorio. Los cambios de técnicos aplican con commit + push.'
    );
  }
}

function syncExcelFromRepo(filename, dataDir) {
  const seed = path.join(SEED_DATA_DIR, filename);
  const target = path.join(dataDir, filename);
  if (!fs.existsSync(seed)) {
    console.warn(`Bootstrap: no está ${filename} en el repositorio (${seed})`);
    return;
  }
  if (path.resolve(seed) === path.resolve(target)) {
    console.log(`Bootstrap: ${filename} se lee del repositorio (${target})`);
    return;
  }
  fs.copyFileSync(seed, target);
  console.log(`Bootstrap: ${filename} actualizado desde el repositorio → ${target}`);
}

/** Copia catálogos Excel del repo a DATA_DIR y crea JSON de historial si faltan. */
function bootstrapDataFiles() {
  assertProductionDataDir();

  const dataDir = getDataDir();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log(`Datos: DATA_DIR=${dataDir}`);
  syncExcelFromRepo('tecnicos.xlsx', dataDir);
  syncExcelFromRepo('inventario.xlsx', dataDir);
  syncExcelFromRepo('usuarios.xlsx', dataDir);
  syncExcelFromRepo('videoconferencia.xlsx', dataDir);
  syncExcelFromRepo('Actas.xlsx', dataDir);

  const targetDiagnosticos = path.join(dataDir, 'diagnosticos.json');
  if (!fs.existsSync(targetDiagnosticos)) {
    const seedDiagnosticos = path.join(SEED_DATA_DIR, 'diagnosticos.json');
    if (fs.existsSync(seedDiagnosticos)) {
      fs.copyFileSync(seedDiagnosticos, targetDiagnosticos);
    } else {
      fs.writeFileSync(targetDiagnosticos, '[]', 'utf8');
    }
  }

  const targetVcLog = path.join(dataDir, 'videoconferencia-log.json');
  if (!fs.existsSync(targetVcLog)) {
    fs.writeFileSync(targetVcLog, '[]', 'utf8');
  }

  const targetActas = path.join(dataDir, 'actas.json');
  if (!fs.existsSync(targetActas)) {
    fs.writeFileSync(targetActas, '[]', 'utf8');
  }
}

module.exports = {
  getDataDir,
  assertProductionDataDir,
  bootstrapDataFiles,
  SEED_DATA_DIR,
};
