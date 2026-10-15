/**
 * noticias.js — Dashboard Reportes (solo administrador).
 */
import { toast } from './toast.js';
import {
  esc,
  renderBars,
  renderPie,
  renderMonthBars,
  renderKpis,
  buildPagination,
  fillSelect,
} from './dashboard-charts.js';

const TIPOS_LABEL = {
  ESTANDAR: 'DIAGNOSTICO CON ACTIVOS',
  GESTOR_GARANTIAS: 'DIAGNOSTICO CON GESTOR GARANTIAS',
  RENOVACION: 'DIAGNOSTICO RENOVACION',
  DAAS: 'DAAS',
  BETA: 'DIAGNOSTICO BETA',
};

const PAGE_SIZE = 10;
const FETCH_LIMIT = 200;

let state = {
  q: '',
  anio: '',
  tipo: '',
  desde: '',
  hasta: '',
  sede: '',
  tecnico: '',
  tab: 'clasico',
  fuentes: { clasico: true, ia: false, actas: false },
  page: 1,
  token: '',
};

function labelTipo(value) {
  const key = String(value ?? '').toUpperCase();
  return TIPOS_LABEL[key] || key || '—';
}

function formatFecha(value) {
  const s = String(value ?? '').trim();
  if (!s) return '—';
  const parts = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) return `${parts[3]}/${parts[2]}/${parts[1]}`;
  return s;
}

function formatHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

function fuentesActivas() {
  return ['clasico', 'ia', 'actas'].filter((k) => state.fuentes[k]);
}

function buildTipoOptions(selected) {
  const opts = [
    { value: '', label: 'Todos los tipos' },
    { value: 'ESTANDAR', label: 'DIAGNOSTICO CON ACTIVOS' },
    { value: 'GESTOR_GARANTIAS', label: 'DIAGNOSTICO CON GESTOR GARANTIAS' },
    { value: 'RENOVACION', label: 'DIAGNOSTICO RENOVACION' },
    { value: 'DAAS', label: 'DAAS' },
  ];
  return opts.map((o) =>
    `<option value="${o.value}" ${selected === o.value ? 'selected' : ''}>${o.label}</option>`
  ).join('');
}

function mapDiagRow(row) {
  const esIa = String(row.tipoDiagnostico ?? '').toUpperCase() === 'BETA';
  return {
    createdAt: row.createdAt,
    fecha: row.fecha,
    hora: formatHora(row.createdAt),
    fuente: esIa ? 'Diagnóstico IA' : 'Diagnósticos',
    un: row.ubicacionFisica || row.sedeCodigo || row.sede || '—',
    tecnico: row.nombreTecnico || '—',
    tipo: labelTipo(row.tipoDiagnostico),
    numeroActa: '—',
    serial: row.serial || '—',
    titular: '—',
    detalle: row.etiqueta || '—',
  };
}

function mapActaRow(row) {
  const seriales = (row.activos || []).map((a) => a.serie).filter(Boolean).join(', ') || '—';
  const recibido = row.recibido?.nombre
    ? `${row.recibido.nombre} (${row.recibido.cedula || ''})`.trim()
    : '—';
  return {
    createdAt: row.createdAt,
    fecha: row.fechaNovedad,
    hora: formatHora(row.createdAt),
    fuente: 'Actas',
    un: row.unidadNegocio || row.recibido?.unidadNegocio || row.entregado?.unidadNegocio || '—',
    tecnico: row.nombreTecnico || '—',
    tipo: row.tipoNovedad || '—',
    numeroActa: row.numeroActa || '—',
    serial: seriales,
    titular: recibido,
    detalle: row.entregado?.nombre || '—',
  };
}

function mergeCounts(...lists) {
  const map = new Map();
  let total = 0;
  for (const list of lists) {
    for (const row of list || []) {
      map.set(row.label, (map.get(row.label) || 0) + (row.count || 0));
      total += row.count || 0;
    }
  }
  return [...map.entries()]
    .map(([label, count]) => ({
      label,
      count,
      porcentaje: total ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), 'es'));
}

function mergeMes(...lists) {
  const map = new Map();
  let total = 0;
  for (const list of lists) {
    for (const row of list || []) {
      map.set(row.label, (map.get(row.label) || 0) + (row.count || 0));
      total += row.count || 0;
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({
      label,
      count,
      porcentaje: total ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

function renderTableRows(items) {
  if (!items.length) {
    return '<tr><td colspan="9" class="noticias-empty">No hay registros que coincidan con los filtros.</td></tr>';
  }
  return items.map((row) => `
    <tr>
      <td>${esc(formatFecha(row.fecha))}<br><small>${esc(row.hora)}</small></td>
      <td>${esc(row.fuente)}</td>
      <td>${esc(row.un)}</td>
      <td>${esc(row.tecnico)}</td>
      <td>${esc(row.tipo)}</td>
      <td>${esc(row.numeroActa)}</td>
      <td>${esc(row.serial)}</td>
      <td>${esc(row.titular)}</td>
      <td>${esc(row.detalle)}</td>
    </tr>
  `).join('');
}

function renderCharts(agg, totalLabel) {
  const k = agg.kpis || {};
  const kpiEl = document.getElementById('dash-diag-kpi');
  if (kpiEl) {
    kpiEl.innerHTML = renderKpis([
      { value: k.total ?? 0, label: totalLabel, hint: 'En el filtro actual' },
      { value: k.sedeTop || '—', label: 'UN con más casos' },
      { value: k.tecnicoTop || '—', label: 'Técnico más activo' },
      { value: k.tipoTop || '—', label: 'Tipo más frecuente' },
    ]);
  }
  const empty = 'Sin datos en el filtro.';
  const mes = document.getElementById('dash-diag-mes');
  const tipo = document.getElementById('dash-diag-tipo');
  const sede = document.getElementById('dash-diag-sede');
  const tec = document.getElementById('dash-diag-tec');
  if (mes) mes.innerHTML = renderMonthBars(agg.porMes, empty);
  if (tipo) tipo.innerHTML = renderPie(agg.porTipo, empty, 'Por tipo');
  if (sede) sede.innerHTML = renderBars(agg.porSede, 'Sin UN en los registros.');
  if (tec) tec.innerHTML = renderBars(agg.porTecnico, empty);
}

function renderPanelContent(data) {
  const { items, total, page, totalPages, anios = [] } = data;
  const tbody = document.getElementById('noticias-tbody');
  const meta = document.getElementById('noticias-meta');
  const pagination = document.getElementById('noticias-pagination');

  if (tbody) tbody.innerHTML = renderTableRows(items);
  if (meta) {
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    meta.textContent = total
      ? `Mostrando ${from}–${to} de ${total}`
      : 'Sin resultados';
  }
  if (pagination) pagination.innerHTML = buildPagination(page, totalPages);

  const anioSelect = document.getElementById('noticias-filtro-anio');
  if (anioSelect) {
    const opts = ['<option value="">Todos los años</option>'];
    for (const y of anios) {
      opts.push(`<option value="${y}">${y}</option>`);
    }
    anioSelect.innerHTML = opts.join('');
    anioSelect.value = state.anio;
  }

  fillSelect(
    'noticias-filtro-sede',
    (data.filtros?.sedes || []).map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join(''),
    state.sede,
    'Todas las UN'
  );
  fillSelect(
    'noticias-filtro-tecnico',
    (data.filtros?.tecnicos || []).map((t) =>
      `<option value="${esc(t.cedula)}">${esc(t.nombre)} (${esc(t.cedula)})</option>`
    ).join(''),
    state.tecnico,
    'Todos los técnicos'
  );

  const soloActas = fuentesActivas().length === 1 && state.fuentes.actas;
  renderCharts(data.agregados, soloActas ? 'Total actas' : 'Total registros');
}

function commonParams(extra = {}) {
  const params = new URLSearchParams({
    page: extra.page || String(state.page),
    limit: extra.limit || String(PAGE_SIZE),
  });
  if (state.q) params.set('q', state.q);
  if (state.anio) params.set('anio', state.anio);
  if (state.tipo && (state.fuentes.clasico || state.fuentes.ia) && extra.incluirTipo) {
    params.set('tipo', state.tipo);
  }
  if (state.desde) params.set('desde', state.desde);
  if (state.hasta) params.set('hasta', state.hasta);
  if (state.sede) params.set('sede', state.sede);
  if (state.tecnico) params.set('tecnico', state.tecnico);
  return params;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

function paginar(items, page, limit) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    page: safePage,
    totalPages,
  };
}

async function loadCombined() {
  const activas = fuentesActivas();
  if (!activas.length) {
    return {
      items: [],
      total: 0,
      page: 1,
      totalPages: 1,
      anios: [],
      filtros: { sedes: [], tecnicos: [] },
      agregados: { kpis: {}, porTipo: [], porSede: [], porTecnico: [], porMes: [] },
    };
  }

  const mergeMode = activas.length > 1;
  const needDiag = state.fuentes.clasico || state.fuentes.ia;
  const needActas = state.fuentes.actas;
  const flujo = ['clasico', 'ia'].filter((k) => state.fuentes[k]).join(',');

  let diag = { items: [], total: 0, anios: [], filtros: { sedes: [], tecnicos: [] }, agregados: { kpis: {}, porTipo: [], porSede: [], porTecnico: [], porMes: [] } };
  let actas = { ...diag };

  if (needDiag) {
    const params = commonParams({
      page: mergeMode ? '1' : String(state.page),
      limit: mergeMode ? String(FETCH_LIMIT) : String(PAGE_SIZE),
      incluirTipo: !state.fuentes.actas || state.fuentes.clasico,
    });
    params.set('flujo', flujo);
    diag = await fetchJson(`/api/diagnosticos?${params}`);
  }
  if (needActas) {
    const params = commonParams({
      page: mergeMode ? '1' : String(state.page),
      limit: mergeMode ? String(FETCH_LIMIT) : String(PAGE_SIZE),
      incluirTipo: false,
    });
    actas = await fetchJson(`/api/actas?${params}`);
  }

  if (!mergeMode) {
    const src = needActas ? actas : diag;
    const items = needActas ? src.items.map(mapActaRow) : src.items.map(mapDiagRow);
    return { ...src, items };
  }

  const mapped = [
    ...diag.items.map(mapDiagRow),
    ...actas.items.map(mapActaRow),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const pageData = paginar(mapped, state.page, PAGE_SIZE);
  const porTipo = mergeCounts(diag.agregados?.porTipo, actas.agregados?.porTipo);
  const porSede = mergeCounts(diag.agregados?.porSede, actas.agregados?.porSede);
  const porTecnico = mergeCounts(diag.agregados?.porTecnico, actas.agregados?.porTecnico);
  const porMes = mergeMes(diag.agregados?.porMes, actas.agregados?.porMes);
  const tecnicosMap = new Map();
  for (const t of [...(diag.filtros?.tecnicos || []), ...(actas.filtros?.tecnicos || [])]) {
    if (t.cedula && !tecnicosMap.has(t.cedula)) tecnicosMap.set(t.cedula, t);
  }
  const sedes = [...new Set([...(diag.filtros?.sedes || []), ...(actas.filtros?.sedes || [])])]
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'es'));
  const anios = [...new Set([...(diag.anios || []), ...(actas.anios || [])])].sort((a, b) => b - a);
  const total = (diag.agregados?.kpis?.total || 0) + (actas.agregados?.kpis?.total || 0);

  return {
    ...pageData,
    anios,
    filtros: { sedes, tecnicos: [...tecnicosMap.values()] },
    agregados: {
      kpis: {
        total,
        sedeTop: porSede[0]?.label || '—',
        tecnicoTop: porTecnico[0]?.label || '—',
        tipoTop: porTipo[0]?.label || '—',
      },
      porTipo,
      porSede,
      porTecnico,
      porMes,
    },
  };
}

function panelSigueNoticias() {
  const panel = document.getElementById('panel-principal');
  return panel && panel.dataset.panelActivo === 'reportes';
}

async function loadAndRender() {
  if (!panelSigueNoticias()) return;
  const tbody = document.getElementById('noticias-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="9" class="noticias-empty">Cargando…</td></tr>';
  }
  try {
    const data = await loadCombined();
    if (!panelSigueNoticias()) return;
    renderPanelContent(data);
  } catch (err) {
    console.error('Error cargando reportes:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="noticias-empty noticias-empty--error">${esc(err.message)}</td></tr>`;
    }
    toast('No se pudo cargar el historial.', 'error');
  }
}

async function exportarExcel() {
  const activas = fuentesActivas();
  if (!activas.length) {
    toast('Marca al menos una fuente para exportar.', 'advertencia');
    return;
  }
  try {
    if (activas.length === 1 && state.fuentes.actas) {
      const params = commonParams({ page: '1', limit: '10', incluirTipo: false });
      const res = await fetch(`/api/actas/export?${params}`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reportes-actas.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast('Excel descargado.', 'exito');
      return;
    }
    if (!state.fuentes.actas) {
      const params = commonParams({ page: '1', limit: '10', incluirTipo: true });
      params.set('flujo', ['clasico', 'ia'].filter((k) => state.fuentes[k]).join(','));
      const res = await fetch(`/api/diagnosticos/export?${params}`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reportes-diagnosticos.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast('Excel descargado.', 'exito');
      return;
    }
    toast('Exporta cada fuente por separado o deja una sola casilla marcada.', 'info');
  } catch (err) {
    toast(err.message || 'No se pudo exportar.', 'error');
  }
}

function syncFuenteUi() {
  const panel = document.getElementById('panel-principal');
  if (!panel) return;
  panel.querySelectorAll('[data-flujo]').forEach((b) => {
    b.classList.toggle('reportes-tab--activo', b.dataset.flujo === state.tab);
  });
  panel.querySelectorAll('[data-fuente]').forEach((box) => {
    box.checked = Boolean(state.fuentes[box.dataset.fuente]);
  });
  const tipoWrap = document.getElementById('noticias-filtro-tipo-wrap');
  if (tipoWrap) tipoWrap.hidden = !state.fuentes.clasico;
}

function bindPanelEvents() {
  const panel = document.getElementById('panel-principal');
  if (!panel || panel.dataset.noticiasBound === '1') return;
  panel.dataset.noticiasBound = '1';

  let debounceTimer;
  panel.addEventListener('input', (e) => {
    if (e.target.id !== 'noticias-busqueda') return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      state.page = 1;
      loadAndRender();
    }, 300);
  });

  panel.addEventListener('change', (e) => {
    if (e.target.matches('[data-fuente]')) {
      const key = e.target.dataset.fuente;
      state.fuentes[key] = e.target.checked;
      if (!fuentesActivas().length) {
        e.target.checked = true;
        state.fuentes[key] = true;
        toast('Deja al menos una fuente marcada.', 'advertencia');
        return;
      }
      state.page = 1;
      syncFuenteUi();
      loadAndRender();
      return;
    }
    const map = {
      'noticias-filtro-anio': 'anio',
      'noticias-filtro-tipo': 'tipo',
      'noticias-filtro-sede': 'sede',
      'noticias-filtro-tecnico': 'tecnico',
      'noticias-filtro-desde': 'desde',
      'noticias-filtro-hasta': 'hasta',
    };
    const key = map[e.target.id];
    if (!key) return;
    state[key] = e.target.value;
    state.page = 1;
    loadAndRender();
  });

  panel.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-flujo]');
    if (tab) {
      const flujo = tab.dataset.flujo;
      state.tab = flujo;
      state.fuentes = { clasico: flujo === 'clasico', ia: flujo === 'ia', actas: flujo === 'actas' };
      state.tipo = '';
      state.page = 1;
      const tipoSel = document.getElementById('noticias-filtro-tipo');
      if (tipoSel) tipoSel.value = '';
      syncFuenteUi();
      loadAndRender();
      return;
    }
    if (e.target.id === 'noticias-exportar') {
      exportarExcel();
      return;
    }
    const btn = e.target.closest('.noticias-page-btn');
    if (!btn || btn.disabled) return;
    const page = parseInt(btn.dataset.page, 10);
    if (!Number.isNaN(page) && page >= 1) {
      state.page = page;
      loadAndRender();
    }
  });
}

export async function renderPanelNoticias(token) {
  state = {
    q: '', anio: '', tipo: '', desde: '', hasta: '', sede: '', tecnico: '',
    tab: 'clasico',
    fuentes: { clasico: true, ia: false, actas: false },
    page: 1,
    token: token || '',
  };

  const panel = document.getElementById('panel-principal');
  panel.dataset.panelActivo = 'reportes';
  panel.innerHTML = `
    <div class="noticias-panel dash-panel">
      <div class="noticias-header">
        <div>
          <h2 class="noticias-titulo">Reportes</h2>
          <p class="noticias-subtitulo">Estadísticas de diagnósticos (solo administrador)</p>
        </div>
        <div class="noticias-busqueda-wrap admin-usuarios-toolbar">
          <div>
            <label for="noticias-busqueda" class="noticias-busqueda-label">Buscar por serial, placa o Nº acta</label>
            <input type="search" id="noticias-busqueda" class="noticias-busqueda" placeholder="Serial, etiqueta o acta…" autocomplete="off">
          </div>
          <button type="button" class="btn" id="noticias-exportar">Exportar Excel</button>
        </div>
      </div>

      <div class="reportes-tabs" role="tablist">
        <button type="button" class="reportes-tab reportes-tab--activo" data-flujo="clasico">Diagnósticos</button>
        <button type="button" class="reportes-tab" data-flujo="ia">Diagnóstico IA</button>
        <button type="button" class="reportes-tab" data-flujo="actas">Actas</button>
      </div>
      <div class="reportes-fuentes">
        <label><input type="checkbox" data-fuente="clasico" checked> Diagnósticos</label>
        <label><input type="checkbox" data-fuente="ia"> Diagnóstico IA</label>
        <label><input type="checkbox" data-fuente="actas"> Actas</label>
      </div>

      <div class="stats-filters">
        <label class="stats-filter">
          Desde
          <input type="date" id="noticias-filtro-desde">
        </label>
        <label class="stats-filter">
          Hasta
          <input type="date" id="noticias-filtro-hasta">
        </label>
        <label class="stats-filter">
          UN
          <select id="noticias-filtro-sede"><option value="">Todas las UN</option></select>
        </label>
        <label class="stats-filter">
          Técnico
          <select id="noticias-filtro-tecnico"><option value="">Todos los técnicos</option></select>
        </label>
        <label class="stats-filter" id="noticias-filtro-tipo-wrap">
          Tipo
          <select id="noticias-filtro-tipo">${buildTipoOptions('')}</select>
        </label>
      </div>

      <div class="noticias-table-wrap">
        <table class="noticias-table" aria-label="Historial de reportes">
          <thead>
            <tr>
              <th>
                Fecha
                <select id="noticias-filtro-anio" class="noticias-filtro" aria-label="Filtrar por año">
                  <option value="">Todos los años</option>
                </select>
              </th>
              <th>Fuente</th>
              <th>UN</th>
              <th>Técnico</th>
              <th>Tipo</th>
              <th>Nº acta</th>
              <th>Serial</th>
              <th>Recibido / titular</th>
              <th>Entrega / placa</th>
            </tr>
          </thead>
          <tbody id="noticias-tbody">
            <tr><td colspan="9" class="noticias-empty">Cargando…</td></tr>
          </tbody>
        </table>
      </div>

      <div class="noticias-footer">
        <p class="noticias-meta" id="noticias-meta"></p>
        <div id="noticias-pagination"></div>
      </div>

      <div class="stats-kpi" id="dash-diag-kpi"></div>

      <section class="stats-block">
        <h3>Gráficos</h3>
        <div class="stats-grid">
          <div class="stats-span">
            <h4>Evolución por mes</h4>
            <div id="dash-diag-mes"></div>
          </div>
          <div>
            <h4>Por tipo</h4>
            <div id="dash-diag-tipo"></div>
          </div>
          <div>
            <h4>Por UN</h4>
            <div id="dash-diag-sede"></div>
          </div>
          <div class="stats-span">
            <h4>Por técnico</h4>
            <div id="dash-diag-tec"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  panel.dataset.noticiasBound = '0';
  bindPanelEvents();
  await loadAndRender();
}

export function esRolAdministrador(rol) {
  return String(rol ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') === 'administrador';
}
