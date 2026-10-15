const XLSX = require('xlsx');
const { peekSiguienteNumero, listActas, filterActas, getAniosDisponibles } = require('../utils/actasStore');

function filtrosDeQuery(query) {
  const { q, anio, tipo, page, limit, desde, hasta, sede, tecnico } = query;
  return { q, anio, tipo, page, limit, desde, hasta, sede, tecnico };
}

function formatHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

exports.siguienteNumero = (_req, res) => {
  try {
    res.json({ numeroActa: peekSiguienteNumero() });
  } catch (err) {
    console.error('Error obteniendo Nº de acta:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el consecutivo de acta' });
  }
};

exports.listar = (req, res) => {
  try {
    const result = listActas(filtrosDeQuery(req.query));
    res.json({ ...result, anios: getAniosDisponibles() });
  } catch (err) {
    console.error('Error listando actas:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el historial de actas' });
  }
};

exports.exportar = (req, res) => {
  try {
    const filtered = filterActas(filtrosDeQuery(req.query));
    const rows = filtered.items.map((row) => ({
      Numero_acta: row.numeroActa || '',
      Fecha: row.fechaNovedad || '',
      Hora: formatHora(row.createdAt),
      Tipo: row.tipoNovedad || '',
      Tecnico: row.nombreTecnico || '',
      Cedula_tecnico: row.cedulaTecnico || '',
      Recibido: row.recibido?.nombre || '',
      Cedula_recibido: row.recibido?.cedula || '',
      Entregado: row.entregado?.nombre || '',
      Cedula_entregado: row.entregado?.cedula || '',
      UN: row.unidadNegocio || row.recibido?.unidadNegocio || '',
      Seriales: (row.activos || []).map((a) => a.serie).filter(Boolean).join(', '),
      Etiquetas: (row.activos || []).map((a) => a.etiqueta).filter(Boolean).join(', '),
    }));

    const k = filtered.agregados.kpis || {};
    const resumen = [
      { Indicador: 'Total actas', Valor: k.total ?? 0 },
      { Indicador: 'UN con más casos', Valor: k.sedeTop || '' },
      { Indicador: 'Técnico más activo', Valor: k.tecnicoTop || '' },
      { Indicador: 'Tipo más frecuente', Valor: k.tipoTop || '' },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Actas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="reportes-actas.xlsx"');
    res.send(buf);
  } catch (err) {
    console.error('Error exportando actas:', err.message);
    res.status(500).json({ error: 'No se pudo exportar el Excel de actas' });
  }
};
