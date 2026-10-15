const XLSX = require('xlsx');
const { listDiagnosticos, filterDiagnosticos, getAniosDisponibles } = require('../utils/diagnosticosStore');

const TIPOS_LABEL = {
  ESTANDAR: 'DIAGNOSTICO CON ACTIVOS',
  GESTOR_GARANTIAS: 'DIAGNOSTICO CON GESTOR GARANTIAS',
  RENOVACION: 'DIAGNOSTICO RENOVACION',
  DAAS: 'DAAS',
};

function labelTipo(value) {
  const key = String(value ?? '').toUpperCase();
  return TIPOS_LABEL[key] || key || '';
}

function filtrosDeQuery(query) {
  const { q, anio, tipo, page, limit, desde, hasta, sede, tecnico, flujo } = query;
  return { q, anio, tipo, page, limit, desde, hasta, sede, tecnico, flujo };
}

exports.listar = (req, res) => {
  try {
    const result = listDiagnosticos(filtrosDeQuery(req.query));
    const anios = getAniosDisponibles();
    res.json({ ...result, anios });
  } catch (err) {
    console.error('Error listando diagnósticos:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el historial de diagnósticos' });
  }
};

exports.exportar = (req, res) => {
  try {
    const filtered = filterDiagnosticos(filtrosDeQuery(req.query));
    const rows = filtered.items.map((row) => ({
      Fecha: row.fecha || '',
      UN: row.ubicacionFisica || row.sedeCodigo || row.sede || '',
      Tecnico: row.nombreTecnico || '',
      Cedula_tecnico: row.cedulaTecnico || '',
      Tipo: labelTipo(row.tipoDiagnostico),
      Serial: row.serial || '',
      Placa: row.etiqueta || '',
    }));

    const k = filtered.agregados.kpis || {};
    const resumen = [
      { Indicador: 'Total diagnósticos', Valor: k.total ?? 0 },
      { Indicador: 'UN con más casos', Valor: k.sedeTop || '' },
      { Indicador: 'Técnico más activo', Valor: k.tecnicoTop || '' },
      { Indicador: 'Diagnóstico más frecuente', Valor: k.tipoTop || '' },
      {},
      { Indicador: 'Por tipo', Valor: 'Cantidad' },
      ...filtered.agregados.porTipo.map((r) => ({ Indicador: r.label, Valor: r.count })),
      {},
      { Indicador: 'Por UN', Valor: 'Cantidad' },
      ...filtered.agregados.porSede.map((r) => ({ Indicador: r.label, Valor: r.count })),
      {},
      { Indicador: 'Por técnico', Valor: 'Cantidad' },
      ...filtered.agregados.porTecnico.map((r) => ({ Indicador: r.label, Valor: r.count })),
      {},
      { Indicador: 'Por mes', Valor: 'Cantidad' },
      ...filtered.agregados.porMes.map((r) => ({ Indicador: r.label, Valor: r.count })),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Diagnosticos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="diagnosticos-dashboard.xlsx"');
    res.send(buf);
  } catch (err) {
    console.error('Error exportando diagnósticos:', err.message);
    res.status(500).json({ error: 'No se pudo exportar el Excel' });
  }
};
