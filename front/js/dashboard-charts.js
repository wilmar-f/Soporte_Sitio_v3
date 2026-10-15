const PIE_COLORS = ['#1E2A78', '#3ED6E5', '#A68CF0', '#8B93B0', '#A8B0C8', '#C5CAD8', '#6B7194', '#4A5280'];

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBars(items, emptyMsg) {
  if (!items?.length) {
    return `<p class="stats-empty">${esc(emptyMsg)}</p>`;
  }
  return items.map(item => `
    <div class="stats-bar-row">
      <span class="stats-bar-label" title="${esc(item.label)}">${esc(item.label)}</span>
      <div class="stats-bar-track" aria-hidden="true">
        <div class="stats-bar-fill" style="width:${Math.min(100, item.porcentaje)}%"></div>
      </div>
      <span class="stats-bar-meta">${item.count} · ${item.porcentaje}%</span>
    </div>
  `).join('');
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

export function renderPie(items, emptyMsg, ariaLabel = 'Distribución') {
  if (!items?.length) {
    return `<p class="stats-empty">${esc(emptyMsg)}</p>`;
  }
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (total <= 0) {
    return `<p class="stats-empty">${esc(emptyMsg)}</p>`;
  }

  let angle = 0;
  const slices = items.map((item, i) => {
    const portion = (Number(item.count) / total) * 360;
    const start = angle;
    const end = angle + portion;
    angle = end;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    return { item, color, d: slicePath(80, 80, 74, start, end) };
  });

  return `
    <div class="stats-pie-wrap">
      <svg class="stats-pie" viewBox="0 0 160 160" role="img" aria-label="${esc(ariaLabel)}">
        ${slices.map(s => `<path d="${s.d}" fill="${s.color}"><title>${esc(s.item.label)}: ${s.item.count} (${s.item.porcentaje}%)</title></path>`).join('')}
      </svg>
      <ul class="stats-pie-legend">
        ${slices.map(s => `
          <li>
            <span class="stats-pie-swatch" style="background:${s.color}"></span>
            <span class="stats-pie-name" title="${esc(s.item.label)}">${esc(s.item.label)}</span>
            <span class="stats-pie-meta">${s.item.count} · ${s.item.porcentaje}%</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

export function renderMonthBars(items, emptyMsg) {
  if (!items?.length) {
    return `<p class="stats-empty">${esc(emptyMsg)}</p>`;
  }
  const max = Math.max(...items.map(h => h.count), 1);
  return `
    <div class="stats-months" role="img" aria-label="Evolución por mes">
      ${items.map(h => `
        <div class="stats-month">
          <div class="stats-month-col" style="height:${Math.round((h.count / max) * 100)}%" title="${esc(h.label)}: ${h.count}"></div>
          <span class="stats-month-tick">${esc(h.label.slice(5))}</span>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderKpis(cards) {
  return cards.map(card => `
    <div class="stats-kpi-card">
      <p class="stats-kpi-num">${esc(card.value)}</p>
      <p class="stats-kpi-lbl">${esc(card.label)}</p>
      ${card.hint ? `<p class="stats-kpi-pct">${esc(card.hint)}</p>` : ''}
    </div>
  `).join('');
}

export function buildPagination(page, totalPages) {
  if (totalPages <= 1) return '';

  const pages = [];
  const addBtn = (p, label = null, disabled = false, active = false) => {
    pages.push(
      `<button type="button" class="noticias-page-btn${active ? ' noticias-page-btn--activo' : ''}" data-page="${p}" ${disabled ? 'disabled' : ''}>${label ?? p}</button>`
    );
  };

  addBtn(page - 1, '‹', page <= 1);

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  if (start > 1) {
    addBtn(1, '1', false, page === 1);
    if (start > 2) pages.push('<span class="noticias-page-ellipsis">…</span>');
  }

  for (let p = start; p <= end; p++) {
    addBtn(p, String(p), false, p === page);
  }

  if (end < totalPages) {
    if (end < totalPages - 1) pages.push('<span class="noticias-page-ellipsis">…</span>');
    addBtn(totalPages, String(totalPages), false, page === totalPages);
  }

  addBtn(page + 1, '›', page >= totalPages);

  return `<div class="noticias-pagination">${pages.join('')}</div>`;
}

export function fillSelect(id, optionsHtml, selected, placeholder) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = `<option value="">${esc(placeholder)}</option>` + optionsHtml;
  sel.value = selected;
}

export function formatFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = type => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}
