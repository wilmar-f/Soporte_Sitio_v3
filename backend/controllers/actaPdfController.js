const { generarPdfActa } = require('../services/pdfService');
const { getActasPersonas, findPersonaPorCedula } = require('../utils/readActasPersonas');
const { appendActa } = require('../utils/actasStore');

const RE_ACTA = /^\d{4}-\d{6}$/;
const TIPOS_NOVEDAD = [
  'CALIDAD PRESTAMO',
  'INGRESO DE ALTA',
  'TRASLADO REUBICACIÓN',
  'MODIFICACIÓN ADICIÓN',
  'RETIRO DE BAJA',
  'VENTA',
  'DESTRUCCIÓN',
  'HURTO',
  'SINIESTRO',
];

function normTipo(val) {
  return String(val ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const TIPOS_NOVEDAD_NORM = new Set(TIPOS_NOVEDAD.map(normTipo));

function txt(val) {
  return String(val ?? '').trim();
}

function personaOk(p) {
  return ['nombre', 'cedula', 'cargo', 'departamento', 'unidadNegocio', 'ubicacion']
    .every((k) => txt(p?.[k]));
}

function activoOk(a) {
  return ['tipo', 'marca', 'modelo', 'serie', 'etiqueta'].every((k) => txt(a?.[k]));
}

exports.getActasPersonas = (req, res) => {
  try {
    const cedula = txt(req.query?.cedula);
    if (cedula) {
      return res.json(findPersonaPorCedula(cedula));
    }
    res.json(getActasPersonas());
  } catch (err) {
    console.error('Error leyendo Actas.xlsx:', err.message);
    res.status(500).json({ error: 'Error al leer datos de personas de actas' });
  }
};

exports.generarPdfActa = async (req, res) => {
  try {
    const body = req.body || {};
    const tipoNovedad = txt(body.tipoNovedad);
    const fechaNovedad = txt(body.fechaNovedad);
    const activos = Array.isArray(body.activos) ? body.activos.filter(activoOk) : [];

    const tipoNorm = tipoNovedad.toUpperCase();
    if (!tipoNovedad || !TIPOS_NOVEDAD_NORM.has(normTipo(tipoNovedad)) || !fechaNovedad) {
      return res.status(400).json({ error: 'Completa fecha y un tipo de novedad válido.' });
    }
    if (!personaOk(body.entregado) || !personaOk(body.recibido)) {
      return res.status(400).json({ error: 'Completa los datos obligatorios de quien entrega y quien recibe.' });
    }
    if (!activos.length) {
      return res.status(400).json({ error: 'Debe haber al menos un activo con tipo, marca, modelo, serie y etiqueta.' });
    }

    const guardada = await appendActa({
      fechaNovedad,
      tipoNovedad: tipoNorm,
      nombreTecnico: txt(body.nombreTecnico) || txt(req.user?.nombreCompleto),
      cedulaTecnico: txt(req.user?.cedula),
      entregado: body.entregado,
      recibido: body.recibido,
      activos,
    });
    const numeroActa = guardada.numeroActa;
    if (!RE_ACTA.test(numeroActa)) {
      return res.status(500).json({ error: 'No se pudo asignar el Nº de acta interno.' });
    }

    const datos = {
      fechaNovedad,
      tipoNovedad: tipoNorm,
      numeroActa,
      entregado: body.entregado,
      recibido: body.recibido,
      ubicacionContable: txt(body.ubicacionContable),
      usuarioRed: txt(body.usuarioRed),
      activos,
      configHardware: txt(body.configHardware),
      modificaciones: txt(body.modificaciones),
      observaciones: txt(body.observaciones),
      firmaEntrega: typeof body.firmaEntrega === 'string' && body.firmaEntrega.startsWith('data:')
        ? body.firmaEntrega
        : '',
      firmaRecibe: typeof body.firmaRecibe === 'string' && body.firmaRecibe.startsWith('data:')
        ? body.firmaRecibe
        : '',
      evidencias: Array.isArray(body.evidencias)
        ? body.evidencias.filter((src) => typeof src === 'string' && src.startsWith('data:'))
        : [],
    };

    const pdfBuffer = await generarPdfActa(datos);
    const fecha = fechaNovedad.replace(/-/g, '') || 'sin_fecha';
    const filename = `acta_${numeroActa}_${fecha}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generando PDF de acta:', err);
    res.status(500).json({
      error: 'No se pudo generar el PDF. Intenta de nuevo en unos segundos.',
    });
  }
};
