/**
 * admin-usuarios.js — CRUD de técnicos (administrador, Postgres).
 */
import { toast } from './toast.js';

let state = { q: '', token: '', dbOk: false };

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelRol(rol) {
  return String(rol ?? '').toLowerCase() === 'administrador' ? 'Administrador' : 'Técnico';
}

function authHeaders() {
  return { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' };
}

function setDbBadge(ping) {
  const el = document.getElementById('admin-db-status');
  if (!el) return;
  state.dbOk = Boolean(ping?.ok);
  el.classList.toggle('admin-db-status--ok', state.dbOk);
  el.classList.toggle('admin-db-status--bad', !state.dbOk);
  if (state.dbOk) {
    el.textContent = `Postgres conectado (${ping.latencyMs} ms)`;
  } else {
    el.textContent = `Sin Postgres: ${ping?.error || 'no hay conexión'}`;
  }
  const crear = document.getElementById('admin-usuarios-crear');
  if (crear) crear.disabled = !state.dbOk;
  const cargar = document.getElementById('admin-usuarios-importar');
  if (cargar) cargar.disabled = !state.dbOk;
}

async function refreshDbStatus() {
  try {
    const res = await fetch('/api/admin/db-status', { headers: authHeaders() });
    const ping = await res.json().catch(() => ({}));
    setDbBadge(ping);
  } catch (err) {
    setDbBadge({ ok: false, error: err.message });
  }
}

function renderRows(tecnicos) {
  if (!tecnicos.length) {
    return '<tr><td colspan="5" class="noticias-empty">No hay usuarios que coincidan con la búsqueda.</td></tr>';
  }

  return tecnicos.map((t) => `
    <tr>
      <td>${esc(t.cedula)}</td>
      <td>${esc(t.nombreCompleto)}</td>
      <td>${esc(t.cargo || '—')}</td>
      <td>${esc(labelRol(t.rol))}</td>
      <td class="admin-usuarios-acciones">
        <button type="button" class="btn btn--sm" data-editar="${esc(t.cedula)}">Editar</button>
        <button type="button" class="btn btn--sm" data-reset="${esc(t.cedula)}">Clave</button>
        <button type="button" class="btn btn--sm btn--peligro" data-eliminar="${esc(t.cedula)}">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function panelSigueUsuarios() {
  const panel = document.getElementById('panel-principal');
  return panel && panel.dataset.panelActivo === 'usuarios';
}

function closeModal() {
  const modal = document.getElementById('admin-usuario-modal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
}

function openModal(mode, tecnico) {
  const modal = document.getElementById('admin-usuario-modal');
  const titulo = document.getElementById('admin-modal-titulo');
  const cedula = document.getElementById('admin-form-cedula');
  const nombre = document.getElementById('admin-form-nombre');
  const cargo = document.getElementById('admin-form-cargo');
  const rol = document.getElementById('admin-form-rol');
  const pass = document.getElementById('admin-form-pass');
  const pass2 = document.getElementById('admin-form-pass2');
  const ayuda = document.getElementById('admin-form-pass-ayuda');
  if (!modal) return;

  modal.dataset.mode = mode;
  modal.dataset.cedulaOriginal = tecnico?.cedula || '';
  cedula.value = tecnico?.cedula || '';
  nombre.value = tecnico?.nombreCompleto || '';
  cargo.value = tecnico?.cargo || '';
  rol.value = String(tecnico?.rol || 'tecnico').toLowerCase() === 'administrador'
    ? 'administrador'
    : 'tecnico';
  pass.value = '';
  pass2.value = '';

  if (mode === 'crear') {
    titulo.textContent = 'Nuevo usuario';
    cedula.readOnly = false;
    ayuda.textContent = 'Contraseña obligatoria (mín. 6, mayúscula, número y . * + -).';
  } else if (mode === 'editar') {
    titulo.textContent = 'Editar usuario';
    cedula.readOnly = false;
    ayuda.textContent = 'Deje la contraseña en blanco para no cambiarla.';
  } else {
    titulo.textContent = 'Restablecer contraseña';
    cedula.readOnly = true;
    ayuda.textContent = 'Nueva contraseña obligatoria.';
  }

  const extras = mode === 'reset';
  document.getElementById('admin-form-nombre-wrap').hidden = extras;
  document.getElementById('admin-form-cargo-wrap').hidden = extras;
  document.getElementById('admin-form-rol-wrap').hidden = extras;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

async function loadAndRender() {
  if (!panelSigueUsuarios()) return;
  const tbody = document.getElementById('admin-usuarios-tbody');
  const meta = document.getElementById('admin-usuarios-meta');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="noticias-empty">Cargando…</td></tr>';
  await refreshDbStatus();

  try {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);

    const res = await fetch(`/api/admin/tecnicos?${params}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo cargar la lista de usuarios');
    }

    const tecnicos = data.tecnicos || [];
    tbody.innerHTML = renderRows(tecnicos);
    tbody.dataset.tecnicos = JSON.stringify(tecnicos);
    if (meta) {
      meta.textContent = tecnicos.length
        ? `${tecnicos.length} usuario${tecnicos.length === 1 ? '' : 's'} mostrado${tecnicos.length === 1 ? '' : 's'}`
        : 'Sin resultados';
    }
  } catch (err) {
    console.error('Error cargando usuarios:', err);
    tbody.innerHTML = `<tr><td colspan="5" class="noticias-empty noticias-empty--error">${esc(err.message)}</td></tr>`;
    if (meta) meta.textContent = '';
    toast('No se pudo cargar la lista de usuarios.', 'error');
  }
}

function tecnicosEnTabla() {
  const tbody = document.getElementById('admin-usuarios-tbody');
  try {
    return JSON.parse(tbody?.dataset.tecnicos || '[]');
  } catch {
    return [];
  }
}

async function submitModal(ev) {
  ev.preventDefault();
  if (!state.dbOk) {
    toast('No hay conexión a Postgres. No se guardó nada.', 'error');
    return;
  }
  const modal = document.getElementById('admin-usuario-modal');
  const mode = modal.dataset.mode;
  const original = modal.dataset.cedulaOriginal;
  const payload = {
    cedula: document.getElementById('admin-form-cedula').value,
    nombreCompleto: document.getElementById('admin-form-nombre').value,
    cargo: document.getElementById('admin-form-cargo').value,
    rol: document.getElementById('admin-form-rol').value,
    contrasenaNueva: document.getElementById('admin-form-pass').value,
    contrasenaConfirmacion: document.getElementById('admin-form-pass2').value,
  };

  let res;
  if (mode === 'crear') {
    res = await fetch('/api/admin/tecnicos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  } else if (mode === 'editar') {
    res = await fetch(`/api/admin/tecnicos/${encodeURIComponent(original)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  } else {
    res = await fetch('/api/admin/tecnicos/reset-password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        cedula: payload.cedula,
        contrasenaNueva: payload.contrasenaNueva,
        contrasenaConfirmacion: payload.contrasenaConfirmacion,
      }),
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error || 'No se pudo guardar', 'error');
    return;
  }
  toast(data.mensaje || 'Guardado', 'exito');
  closeModal();
  await loadAndRender();
}

async function eliminarUsuario(cedula) {
  if (!state.dbOk) {
    toast('No hay conexión a Postgres. No se eliminó nada.', 'error');
    return;
  }
  if (!window.confirm(`¿Eliminar el usuario ${cedula}?`)) return;
  const res = await fetch(`/api/admin/tecnicos/${encodeURIComponent(cedula)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error || 'No se pudo eliminar', 'error');
    return;
  }
  toast(data.mensaje || 'Eliminado', 'exito');
  await loadAndRender();
}

async function importarArchivo(file) {
  const nombre = String(file.name || '').toLowerCase();
  if (!nombre.endsWith('.txt') && !nombre.endsWith('.csv')) {
    toast('Solo se admiten archivos .txt o .csv.', 'advertencia');
    return;
  }
  const texto = await file.text();
  const res = await fetch('/api/admin/tecnicos/import', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ texto }),
  });
  const data = await res.json().catch(() => ({}));
  const out = document.getElementById('admin-import-resultado');
  if (!res.ok) {
    if (out) out.textContent = data.error || 'No se pudo importar';
    toast(data.error || 'No se pudo importar', 'error');
    return;
  }
  const omit = (data.omitidos || [])
    .slice(0, 15)
    .map((o) => `L${o.linea} ${o.cedula}: ${o.motivo}`)
    .join(' · ');
  if (out) {
    out.textContent = `${data.mensaje}${omit ? ` | ${omit}` : ''}`
      + ((data.omitidos || []).length > 15 ? ' …' : '');
  }
  toast(data.mensaje || 'Importación lista', 'exito');
  await loadAndRender();
}

function bindPanelEvents() {
  const panel = document.getElementById('panel-principal');
  if (!panel || panel.dataset.adminUsuariosBound === '1') return;
  panel.dataset.adminUsuariosBound = '1';

  let debounceTimer;
  panel.addEventListener('input', (e) => {
    if (e.target.id !== 'admin-usuarios-busqueda') return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      loadAndRender();
    }, 300);
  });

  panel.addEventListener('click', (e) => {
    const crear = e.target.closest('#admin-usuarios-crear');
    if (crear) {
      if (!state.dbOk) {
        toast('Postgres no está conectado.', 'error');
        return;
      }
      openModal('crear', null);
      return;
    }
    const importar = e.target.closest('#admin-usuarios-importar');
    if (importar) {
      if (!state.dbOk) {
        toast('Postgres no está conectado.', 'error');
        return;
      }
      document.getElementById('admin-usuarios-archivo')?.click();
      return;
    }
    const editar = e.target.closest('[data-editar]');
    if (editar) {
      const t = tecnicosEnTabla().find((x) => x.cedula === editar.dataset.editar);
      openModal('editar', t || { cedula: editar.dataset.editar });
      return;
    }
    const reset = e.target.closest('[data-reset]');
    if (reset) {
      const t = tecnicosEnTabla().find((x) => x.cedula === reset.dataset.reset);
      openModal('reset', t || { cedula: reset.dataset.reset });
      return;
    }
    const eliminar = e.target.closest('[data-eliminar]');
    if (eliminar) {
      eliminarUsuario(eliminar.dataset.eliminar);
    }
  });

  panel.addEventListener('change', (e) => {
    if (e.target.id !== 'admin-usuarios-archivo') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    importarArchivo(file);
  });

  panel.addEventListener('submit', (e) => {
    if (e.target.id === 'admin-usuario-form') submitModal(e);
  });
  panel.addEventListener('click', (e) => {
    if (e.target.id === 'admin-modal-cancelar' || e.target.id === 'admin-modal-backdrop') {
      closeModal();
    }
  });
}

export async function renderPanelUsuarios(token) {
  state = { q: '', token: token || '', dbOk: false };

  const panel = document.getElementById('panel-principal');
  panel.dataset.panelActivo = 'usuarios';
  panel.innerHTML = `
    <div class="noticias-panel admin-usuarios-panel">
      <div class="noticias-header">
        <div>
          <h2 class="noticias-titulo">Usuarios</h2>
          <p class="noticias-subtitulo">CRUD de técnicos en Postgres</p>
          <p id="admin-db-status" class="admin-db-status admin-db-status--bad">Comprobando Postgres…</p>
        </div>
        <div class="admin-usuarios-toolbar">
          <div class="noticias-busqueda-wrap">
            <label for="admin-usuarios-busqueda" class="noticias-busqueda-label">Buscar por cédula o nombre</label>
            <input type="search" id="admin-usuarios-busqueda" class="noticias-busqueda" placeholder="Cédula o nombre…" autocomplete="off">
          </div>
          <button type="button" class="btn" id="admin-usuarios-crear">Nuevo usuario</button>
          <button type="button" class="btn" id="admin-usuarios-importar">Cargar archivo</button>
          <input type="file" id="admin-usuarios-archivo" accept=".txt,.csv,text/plain,text/csv" hidden>
        </div>
      </div>
      <p class="modal-clave__ayuda" id="admin-import-ayuda">Archivo .txt o .csv UTF-8, una línea por técnico: <code>cedula;nombre_completo;cargo;rol;contrasena</code> (cabecera opcional). Máx. 200 filas. Si falta la contraseña, esa fila se omite.</p>
      <p class="noticias-meta" id="admin-import-resultado"></p>

      <div class="noticias-table-wrap">
        <table class="noticias-table" aria-label="Lista de usuarios">
          <thead>
            <tr>
              <th>Cédula</th>
              <th>Nombre</th>
              <th>Cargo</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="admin-usuarios-tbody">
            <tr><td colspan="5" class="noticias-empty">Cargando…</td></tr>
          </tbody>
        </table>
      </div>

      <div class="noticias-footer">
        <p class="noticias-meta" id="admin-usuarios-meta"></p>
      </div>

      <div class="modal-clave" id="admin-usuario-modal" hidden aria-hidden="true">
        <div class="modal-clave__backdrop" id="admin-modal-backdrop"></div>
        <div class="modal-clave__dialog" role="dialog" aria-labelledby="admin-modal-titulo" aria-modal="true">
          <h2 class="modal-clave__titulo" id="admin-modal-titulo">Usuario</h2>
          <form class="modal-clave__form" id="admin-usuario-form">
            <div class="campo">
              <label for="admin-form-cedula">Cédula</label>
              <input id="admin-form-cedula" required autocomplete="off">
            </div>
            <div class="campo" id="admin-form-nombre-wrap">
              <label for="admin-form-nombre">Nombre</label>
              <input id="admin-form-nombre" autocomplete="off">
            </div>
            <div class="campo" id="admin-form-cargo-wrap">
              <label for="admin-form-cargo">Cargo</label>
              <input id="admin-form-cargo" autocomplete="off">
            </div>
            <div class="campo" id="admin-form-rol-wrap">
              <label for="admin-form-rol">Rol</label>
              <select id="admin-form-rol">
                <option value="tecnico">Técnico</option>
                <option value="administrador">Administrador</option>
              </select>
            </div>
            <div class="campo">
              <label for="admin-form-pass">Contraseña</label>
              <input id="admin-form-pass" type="password" autocomplete="new-password">
              <p class="modal-clave__ayuda" id="admin-form-pass-ayuda"></p>
            </div>
            <div class="campo">
              <label for="admin-form-pass2">Confirmar contraseña</label>
              <input id="admin-form-pass2" type="password" autocomplete="new-password">
            </div>
            <div class="modal-clave__acciones">
              <button type="button" class="btn" id="admin-modal-cancelar">Cancelar</button>
              <button type="submit" class="btn btn--primario">Guardar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  panel.dataset.adminUsuariosBound = '0';
  panel.dataset.noticiasBound = '0';
  bindPanelEvents();
  await loadAndRender();
}
