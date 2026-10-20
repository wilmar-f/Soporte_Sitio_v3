const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { PDFDocument } = require('pdf-lib');
const { renderDiagnosticoHtml } = require('../utils/renderDiagnostico');
const { renderEvidenciasHtml } = require('../utils/renderEvidencias');
const { renderActaHtml } = require('../utils/renderActa');

let browserPromise = null;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

/** Carta US a 96 dpi */
const LETTER_WIDTH_PX = 816;
const LETTER_HEIGHT_PX = 1056;
const DPI = 96;

/** Márgenes alineados con formato FR-BAI09.11 */
const PDF_MARGINS = {
  top: '0.5in',
  right: '0.55in',
  bottom: '0.35in',
  left: '0.55in',
};

function marginInchesToPx(margin) {
  const match = String(margin).match(/^([\d.]+)in$/);
  return match ? parseFloat(match[1]) * DPI : 0;
}

function getContentWidthPx() {
  const left = marginInchesToPx(PDF_MARGINS.left);
  const right = marginInchesToPx(PDF_MARGINS.right);
  return Math.round(LETTER_WIDTH_PX - left - right);
}

function getAvailableHeightPx() {
  const top = marginInchesToPx(PDF_MARGINS.top);
  const bottom = marginInchesToPx(PDF_MARGINS.bottom);
  return LETTER_HEIGHT_PX - top - bottom;
}

function isProductionEnv() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
}

function findLocalChrome() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  const candidates = [
    fromEnv,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || '';
}

async function launchBrowser() {
  if (isProductionEnv()) {
    const chromium = require('@sparticuz/chromium');
    chromium.setGraphicsMode = false;

    return puppeteer.launch({
      args: [...chromium.args, ...LAUNCH_ARGS],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  try {
    const puppeteerFull = require('puppeteer');
    return puppeteerFull.launch({
      headless: true,
      args: LAUNCH_ARGS,
    });
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }

  const executablePath = findLocalChrome();
  if (!executablePath) {
    throw new Error(
      'No se encontró Chrome/Edge para generar el PDF. Instala Google Chrome o define PUPPETEER_EXECUTABLE_PATH.'
    );
  }
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: LAUNCH_ARGS,
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

process.on('SIGTERM', () => { closeBrowser().catch(() => {}); });
process.on('SIGINT', () => { closeBrowser().catch(() => {}); });

async function htmlToPdfBuffer(html, { autoScale = false } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const contentWidth = getContentWidthPx();

  try {
    await page.setViewport({
      width: contentWidth,
      height: LETTER_HEIGHT_PX,
      deviceScaleFactor: 1,
    });

    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 60000,
    });

    let scale = 1;
    if (autoScale) {
      const contentHeight = await page.evaluate(() => document.body.scrollHeight);
      scale = Math.min(1, getAvailableHeightPx() / contentHeight);
    }

    const pdfBuffer = await page.pdf({
      format: 'letter',
      printBackground: true,
      preferCSSPageSize: false,
      margin: PDF_MARGINS,
      scale,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

async function mergePdfBuffers(buffers) {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf);
    const indices = doc.getPageIndices();
    const pages = await merged.copyPages(doc, indices);
    pages.forEach(page => merged.addPage(page));
  }
  return Buffer.from(await merged.save());
}

/**
 * Genera PDF carta con texto seleccionable desde datos del formulario.
 * Si hay evidencias, agrega una segunda página con imágenes.
 * @param {object} datos — mismos campos que recopilarValores() en el front
 * @returns {Promise<Buffer>}
 */
async function generarPdfDiagnostico(datos) {
  const mainBuffer = await htmlToPdfBuffer(renderDiagnosticoHtml(datos), { autoScale: true });

  const evidencias = Array.isArray(datos.evidencias)
    ? datos.evidencias.filter(src => typeof src === 'string' && src.startsWith('data:'))
    : [];

  if (!evidencias.length) {
    return mainBuffer;
  }

  const evBuffer = await htmlToPdfBuffer(renderEvidenciasHtml(evidencias), { autoScale: false });
  return mergePdfBuffers([mainBuffer, evBuffer]);
}

const FILAS_ACTA = 16;

function paginarActivos(activos) {
  const list = Array.isArray(activos) ? activos : [];
  const pages = [];
  for (let i = 0; i < Math.max(list.length, 1); i += FILAS_ACTA) {
    const slice = list.slice(i, i + FILAS_ACTA);
    while (slice.length < FILAS_ACTA) slice.push({});
    pages.push(slice);
  }
  return pages;
}

async function generarPdfActa(datos) {
  const paginas = paginarActivos(datos.activos);
  const buffers = [];
  for (let i = 0; i < paginas.length; i += 1) {
    const html = renderActaHtml({
      ...datos,
      filas: paginas[i],
      pagina: i + 1,
      totalPaginas: paginas.length,
    });
    buffers.push(await htmlToPdfBuffer(html, { autoScale: true }));
  }

  const evidencias = Array.isArray(datos.evidencias)
    ? datos.evidencias.filter((src) => typeof src === 'string' && src.startsWith('data:'))
    : [];
  if (evidencias.length) {
    buffers.push(await htmlToPdfBuffer(renderEvidenciasHtml(evidencias), { autoScale: false }));
  }

  if (buffers.length === 1) return buffers[0];
  return mergePdfBuffers(buffers);
}

module.exports = {
  generarPdfDiagnostico,
  generarPdfActa,
  closeBrowser,
  PDF_MARGINS,
  LETTER_WIDTH_PX,
  LETTER_HEIGHT_PX,
  getContentWidthPx,
};
