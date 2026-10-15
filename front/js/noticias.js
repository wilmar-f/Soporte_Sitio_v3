/**
 * noticias.js — Dashboard Diagnósticos (solo administrador).
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

let state = {
  q: '',
  anio: '',
  tipo: '',
  desde: '',
  hasta: '',
  sede: '',
  tecnico: '',
  flujo: 'clasico',
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

function buildTipoOptions(selected) {
  const opts = [
    { value: '', label: 'Todos los tipos' },
    { value: 'ESTANDAR', label: 'DIAGNOSTICO CON ACTIVOS' },
    { value: 'GESTOR_GARANTIAS', label: 'DIAGNOSTICO CON GESTOR GARANTIAS' },
    { value: 'RENOVACION', label: 'DIAGNOSTICO RENOVACION' },
    { value: 'DAAS', label: 'DAAS' },
  ];
  return opts.map(o =>
    `<option value="${o.value}" ${selected === o.value ? 'selected' : ''}>${o.label}</option>`
  ).join('');
}

function renderTableRows(items) {
  if (!items.length) {
    return '<tr><td colspan="6" class="noticias-empty">No hay diagnósticos que coincidan con los filtros.</td></tr>';
  }
  return items.map(row => `
    <tr>
      <td>${esc(formatFecha(row.fecha))}</td>
      <td>${esc(row.ubicacionFisica || row.sedeCodigo || row.sede || '—')}</td>
      <td>${esc(row.nombreTecnico || '—')}</td>
      <td>${esc(labelTipo(row.tipoDiagnostico))}</td>
      <td>${esc(row.serial || '—')}</td>
      <td>${esc(row.etiqueta || '—')}</td>
    </tr>
  `).join('');
}

function renderCharts(data) {
  const agg = data.agregados || { kpis: {}, porTipo: [], porSede: [], porTecnico: [], porMes: [] };
  const k = agg.kpis || {};
  const kpiEl = document.getElementById('dash-diag-kpi');
  if (kpiEl) {
    kpiEl.innerHTML = renderKpis([
      { value: k.total ?? 0, label: 'Total diagnósticos', hint: 'En el filtro actual' },
      { value: k.sedeTop || '—', label: 'UN con más casos' },
      { value: k.tecnicoTop || '—', label: 'Técnico más activo' },
      { value: k.tipoTop || '—', label: 'Diagnóstico más frecuente' },
    ]);
  }
  const empty = 'Sin diagnósticos en el filtro.';
  const mes = document.getElementById('dash-diag-mes');
  const tipo = document.getElementById('dash-diag-tipo');
  const sede = document.getElementById('dash-diag-sede');
  const tec = document.getElementById('dash-diag-tec');
  if (mes) mes.innerHTML = renderMonthBars(agg.porMes, empty);
  if (tipo) tipo.innerHTML = renderPie(agg.porTipo, empty, 'Por tipo de diagnóstico');
  if (sede) sede.innerHTML = renderBars(agg.porSede, 'Sin UN en los registros (los PDF anteriores no guardaban ubicación física).');
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
      ? `Mostrando ${from}–${to} de ${total} diagnóstico${total === 1 ? '' : 's'}`
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
    (data.filtros?.sedes || []).map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join(''),
    state.sede,
    'Todas las UN'
  );
  fillSelect(
    'noticias-filtro-tecnico',
    (data.filtros?.tecnicos || []).map(t =>
      `<option value="${esc(t.cedula)}">${esc(t.nombre)} (${esc(t.cedula)})</option>`
    ).join(''),
    state.tecnico,
    'Todos los técnicos'
  );

  renderCharts(data);
}

async function fetchDiagnosticos() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(PAGE_SIZE),
  });
  if (state.q) params.set('q', state.q);
  if (state.anio) params.set('anio', state.anio);
  if (state.tipo) params.set('tipo', state.tipo);
  if (state.desde) params.set('desde', state.desde);
  if (state.hasta) params.set('hasta', state.hasta);
  if (state.sede) params.set('sede', state.sede);
  if (state.tecnico) params.set('tecnico', state.tecnico);
  if (state.flujo) params.set('flujo', state.flujo);

  const res = await fetch(`/api/diagnosticos?${params}`, {
    headers: { Authorization: `Bearer ${state.token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}

function panelSigueNoticias() {
  const panel = document.getElementById('panel-principal');
  return panel && panel.dataset.panelActivo === 'reportes';
}

async function loadAndRender() {
  if (!panelSigueNoticias()) return;
  const tbody = document.getElementById('noticias-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" class="noticias-empty">Cargando…</td></tr>';
  }

  try {
    const data = await fetchDiagnosticos();
    if (!panelSigueNoticias()) return;
    renderPanelContent(data);
  } catch (err) {
    console.error('Error cargando dashboard diagnósticos:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="noticias-empty noticias-empty--error">${esc(err.message)}</td></tr>`;
    }
    toast('No se pudo cargar el historial de diagnósticos.', 'error');
  }
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
      if (flujo === state.flujo) return;
      state.flujo = flujo;
      state.tipo = '';
      state.page = 1;
      panel.querySelectorAll('[data-flujo]').forEach((b) => {
        b.classList.toggle('reportes-tab--activo', b.dataset.flujo === flujo);
      });
      const tipoWrap = document.getElementById('noticias-filtro-tipo-wrap');
      if (tipoWrap) tipoWrap.hidden = flujo === 'ia';
      const tipoSel = document.getElementById('noticias-filtro-tipo');
      if (tipoSel) tipoSel.value = '';
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

async function exportarExcel() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.anio) params.set('anio', state.anio);
  if (state.tipo) params.set('tipo', state.tipo);
  if (state.desde) params.set('desde', state.desde);
  if (state.hasta) params.set('hasta', state.hasta);
  if (state.sede) params.set('sede', state.sede);
  if (state.tecnico) params.set('tecnico', state.tecnico);
  if (state.flujo) params.set('flujo', state.flujo);
  try {
    const res = await fetch(`/api/diagnosticos/export?${params}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.flujo === 'ia' ? 'reportes-diagnostico-ia.xlsx' : 'reportes-diagnosticos.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    toast('Excel descargado.', 'exito');
  } catch (err) {
    toast(err.message || 'No se pudo exportar.', 'error');
  }
}

export async function renderPanelNoticias(token) {
  state = {
    q: '', anio: '', tipo: '', desde: '', hasta: '', sede: '', tecnico: '',
    flujo: 'clasico', page: 1, token: token || '',
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
            <label for="noticias-busqueda" class="noticias-busqueda-label">Buscar por serial o placa</label>
            <input type="search" id="noticias-busqueda" class="noticias-busqueda" placeholder="Serial o etiqueta…" autocomplete="off">
          </div>
          <button type="button" class="btn" id="noticias-exportar">Exportar Excel</button>
        </div>
      </div>

      <div class="reportes-tabs" role="tablist">
        <button type="button" class="reportes-tab reportes-tab--activo" data-flujo="clasico">Diagnósticos</button>
        <button type="button" class="reportes-tab" data-flujo="ia">Diagnóstico IA</button>
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
        <table class="noticias-table" aria-label="Historial de diagnósticos">
          <thead>
            <tr>
              <th>
                Fecha
                <select id="noticias-filtro-anio" class="noticias-filtro" aria-label="Filtrar por año">
                  <option value="">Todos los años</option>
                </select>
              </th>
              <th>UN</th>
              <th>Técnico</th>
              <th>Tipo diagnóstico</th>
              <th>Serial</th>
              <th>Placa</th>
            </tr>
          </thead>
          <tbody id="noticias-tbody">
            <tr><td colspan="6" class="noticias-empty">Cargando…</td></tr>
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
