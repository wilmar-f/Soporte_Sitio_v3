import { renderBanner } from './banner.js';
import { toast } from './toast.js';
import { formatearUltimoAcceso } from './ultimo-acceso.js';
import { esRolAdministrador } from './noticias.js';
import { initCambiarClave } from './cambiar-clave.js';
import {
  resolverSesion,
  cerrar as cerrarSesionStorage,
  escucharCierreEnOtrasPestanas,
  iniciarVigilanciaInactividad,
} from './sesion.js';

const { token: tokenGuardado, usuario: usuarioGuardado } = await resolverSesion();
const sesionValida = Boolean(tokenGuardado && usuarioGuardado);

if (!sesionValida) {
  window.location.replace('/pages/index.html');
} else {
  escucharCierreEnOtrasPestanas();
  iniciarVigilanciaInactividad();
}

const usuarioActual = usuarioGuardado ? { ...JSON.parse(usuarioGuardado) } : {};

const MAX_EVIDENCIAS = 3;
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
const TIPOS_EQUIPO = [
  'DESKTOP',
  'ESCANER',
  'ESCANER BALANZA',
  'IMPRESORA LASER',
  'IMPRESORA TERMICA',
  'LAPTOP',
  'LECTOR CODIGOS',
  'PDA',
  'SUREPOS',
  'TABLET',
  'VERIFICADOR PRECIOS',
];
const TIPOS_EQUIPO_NORM = new Map(
  TIPOS_EQUIPO.map((t) => [t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), t])
);
const HEADER_TXT_ACTIVO = {
  tipo: ['tipo', 'tipo de equipo', 'tipo equipo'],
  serie: ['serie', 'serial'],
  marca: ['marca', 'fabricante'],
  modelo: ['modelo'],
  etiqueta: ['etiqueta', 'no etiqueta', 'n etiqueta'],
  otros: ['otros', 'ip'],
  software: ['software'],
};

let activos = [];
let evidenciasAdjuntas = [];
let datosInventario = [];
let inventarioListo = Promise.resolve();
let recargaInventarioEnVuelo = null;
let serieInventarioOk = false;
let busquedaActivoGen = 0;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toTitleCase(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function setSidebarBtnVisible(btn, visible) {
  if (!btn) return;
  btn.hidden = !visible;
  btn.style.display = visible ? '' : 'none';
}

function get(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function getTipoNovedad() {
  return document.querySelector('input[name="tipo-novedad"]:checked')?.value || '';
}

function marcarInvalido(el) {
  if (el) el.classList.add('invalido');
}

function hoyISO() {
  return new Date().toISOString().split('T')[0];
}

function authHeaders() {
  const headers = {};
  if (tokenGuardado) headers.Authorization = `Bearer ${tokenGuardado}`;
  return headers;
}

function normalizarSerialBusqueda(serial) {
  return String(serial ?? '').replace(/\s+/g, '').trim().toUpperCase();
}

async function recargarInventario() {
  if (recargaInventarioEnVuelo) return recargaInventarioEnVuelo;
  recargaInventarioEnVuelo = (async () => {
    try {
      const res = await fetch('/api/inventario', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          datosInventario = data;
          return true;
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      recargaInventarioEnVuelo = null;
    }
  })();
  return recargaInventarioEnVuelo;
}

function buscarEquipoPorSerial(serial) {
  const limpio = normalizarSerialBusqueda(serial);
  if (!limpio) return null;
  return datosInventario.find((e) => normalizarSerialBusqueda(e.serial) === limpio) || null;
}

function buscarEquipoEnInventario(valor) {
  const limpio = normalizarSerialBusqueda(valor);
  if (!limpio) return { ok: false, motivo: 'vacio' };

  const equipos = [];
  const vistos = new Set();
  const agregar = (e) => {
    const key = normalizarSerialBusqueda(e.serial);
    if (!key || vistos.has(key)) return;
    vistos.add(key);
    equipos.push(e);
  };

  datosInventario.forEach((e) => {
    if (normalizarSerialBusqueda(e.serial) === limpio) agregar(e);
  });
  datosInventario.forEach((e) => {
    if (normalizarSerialBusqueda(e.etiqueta) === limpio) agregar(e);
  });

  if (equipos.length === 0) return { ok: false, motivo: 'no-encontrado' };
  if (equipos.length > 1) return { ok: false, motivo: 'ambiguo' };
  return { ok: true, equipo: equipos[0] };
}

function normTipoEquipo(val) {
  return String(val ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolverTipoEquipo(val) {
  return TIPOS_EQUIPO_NORM.get(normTipoEquipo(val)) || '';
}

function normHeaderTxt(val) {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ');
}

function esCabeceraTxt(celdas) {
  const n = celdas.map(normHeaderTxt);
  return n.some((c) => HEADER_TXT_ACTIVO.tipo.includes(c) || HEADER_TXT_ACTIVO.serie.includes(c));
}

function mapaColumnasTxt(celdas) {
  const map = {};
  celdas.forEach((celda, i) => {
    const n = normHeaderTxt(celda);
    for (const [campo, alias] of Object.entries(HEADER_TXT_ACTIVO)) {
      if (alias.includes(n) && map[campo] === undefined) map[campo] = i;
    }
  });
  return map;
}

function parsearLineasTxtActivos(texto) {
  const raw = String(texto ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lineas = raw.split('\n');
  let colMap = null;
  const filas = [];
  lineas.forEach((linea, idx) => {
    const trimmed = linea.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const sep = trimmed.includes(';') ? ';' : ',';
    const celdas = trimmed.split(sep).map((c) => c.trim());
    if (!colMap && esCabeceraTxt(celdas)) {
      colMap = mapaColumnasTxt(celdas);
      return;
    }
    const getCol = (campo, fallbackIdx) => {
      const i = colMap && colMap[campo] !== undefined ? colMap[campo] : fallbackIdx;
      return i >= 0 && celdas[i] !== undefined ? celdas[i] : '';
    };
    filas.push({
      linea: idx + 1,
      tipo: getCol('tipo', 0),
      serie: getCol('serie', 1),
      otros: getCol('otros', 5),
      software: getCol('software', 6),
    });
  });
  return filas;
}

async function importarActivosDesdeTxt(texto) {
  await inventarioListo;
  if (!datosInventario.length) {
    const ok = await recargarInventario();
    if (!ok || !datosInventario.length) {
      toast('No se pudo cargar el inventario.', 'error');
      return;
    }
  }
  const filas = parsearLineasTxtActivos(texto);
  if (!filas.length) {
    toast('El archivo no tiene líneas de activos (tipo;serie).', 'advertencia');
    return;
  }
  const seriesYa = new Set(activos.map((a) => normalizarSerialBusqueda(a.serie)).filter(Boolean));
  const errores = [];
  let agregados = 0;
  filas.forEach((fila) => {
    const tipo = resolverTipoEquipo(fila.tipo);
    const serie = String(fila.serie || '').trim();
    const serieKey = normalizarSerialBusqueda(serie);
    if (!tipo) {
      errores.push(`Línea ${fila.linea}: tipo inválido${fila.tipo ? ` (${fila.tipo})` : ''}`);
      return;
    }
    if (!serieKey) {
      errores.push(`Línea ${fila.linea}: falta serie`);
      return;
    }
    if (seriesYa.has(serieKey)) {
      errores.push(`Línea ${fila.linea}: serie duplicada (${serie})`);
      return;
    }
    const equipo = buscarEquipoPorSerial(serie);
    if (!equipo) {
      errores.push(`Línea ${fila.linea}: serie no está en inventario (${serie})`);
      return;
    }
    seriesYa.add(serieKey);
    activos.push({
      tipo,
      marca: equipo.fabricante || '',
      modelo: equipo.modelo || '',
      serie: String(equipo.serial || serie).toUpperCase(),
      etiqueta: equipo.etiqueta || '',
      otros: fila.otros || '',
      software: fila.software || '',
      inventarioOk: true,
    });
    agregados += 1;
  });
  renderPreviewActivos();
  renderErroresTxt(errores);
  if (agregados && errores.length) {
    toast(`Se agregaron ${agregados} activo(s). ${errores.length} línea(s) no se cargaron.`, 'advertencia');
  } else if (agregados) {
    toast(`Se agregaron ${agregados} activo(s) desde el archivo.`, 'exito');
  } else {
    toast(errores[0] || 'No se pudo cargar ningún activo.', 'error');
  }
}

function renderErroresTxt(errores) {
  const box = document.getElementById('activos-txt-errores');
  if (!box) return;
  if (!errores.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <p class="actas-txt-errores__titulo">Líneas no cargadas (${errores.length})</p>
    <ul class="actas-txt-errores__lista">
      ${errores.map((msg) => `<li>${esc(msg)}</li>`).join('')}
    </ul>
  `;
}

function setCamposEquipoReadonly(readonly) {
  ['act-serie', 'act-marca', 'act-modelo', 'act-etiqueta'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.readOnly = readonly;
  });
}

function limpiarCamposEquipoInventario() {
  ['act-serie', 'act-marca', 'act-modelo', 'act-etiqueta'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.classList.remove('invalido');
    }
  });
  setCamposEquipoReadonly(true);
  serieInventarioOk = false;
}

function borrarBusquedaActivo() {
  busquedaActivoGen += 1;
  const busqueda = document.getElementById('act-busqueda-equipo');
  if (busqueda) {
    busqueda.value = '';
    busqueda.classList.remove('invalido');
  }
  limpiarCamposEquipoInventario();
}

async function autocompletarEquipoPorSerie(consulta, { reintentar = true } = {}) {
  const gen = ++busquedaActivoGen;
  const inputBusqueda = document.getElementById('act-busqueda-equipo');
  await inventarioListo;
  if (gen !== busquedaActivoGen) return false;
  if (!String(consulta || '').trim()) {
    limpiarCamposEquipoInventario();
    if (inputBusqueda) marcarInvalido(inputBusqueda);
    toast('Escribe el serial o la etiqueta para buscar.', 'advertencia');
    return false;
  }
  if (!datosInventario.length && reintentar) {
    const ok = await recargarInventario();
    if (gen !== busquedaActivoGen) return false;
    if (!ok) {
      toast('No se pudo cargar el inventario.', 'error');
      limpiarCamposEquipoInventario();
      return false;
    }
  }
  let resultado = buscarEquipoEnInventario(consulta);
  if (resultado.motivo === 'no-encontrado' && reintentar) {
    await recargarInventario();
    if (gen !== busquedaActivoGen) return false;
    resultado = buscarEquipoEnInventario(consulta);
  }
  if (gen !== busquedaActivoGen) return false;
  if (!resultado.ok) {
    limpiarCamposEquipoInventario();
    if (inputBusqueda) marcarInvalido(inputBusqueda);
    if (resultado.motivo === 'ambiguo') {
      toast('Hay más de un equipo con ese dato. Usa un serial o etiqueta único.', 'advertencia');
    } else {
      toast('No se encontró ese serial o etiqueta en el inventario.', 'error');
    }
    return false;
  }
  if (gen !== busquedaActivoGen) return false;
  const equipo = resultado.equipo;
  const serie = document.getElementById('act-serie');
  const marca = document.getElementById('act-marca');
  const modelo = document.getElementById('act-modelo');
  const etiqueta = document.getElementById('act-etiqueta');
  if (serie) serie.value = String(equipo.serial || '').toUpperCase();
  if (marca) marca.value = equipo.fabricante || '';
  if (modelo) modelo.value = equipo.modelo || '';
  if (etiqueta) etiqueta.value = equipo.etiqueta || '';
  setCamposEquipoReadonly(true);
  serieInventarioOk = true;
  inputBusqueda?.classList.remove('invalido');
  serie?.classList.remove('invalido');
  return true;
}

async function ejecutarBusquedaActivo() {
  const consulta = get('act-busqueda-equipo');
  await autocompletarEquipoPorSerie(consulta);
}

function normalizarCedulaBusqueda(cedula) {
  const raw = String(cedula ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  return digits || raw;
}

function camposPersona(prefijo) {
  return [
    `${prefijo}-nombre`,
    `${prefijo}-cargo`,
    `${prefijo}-depto`,
    `${prefijo}-un`,
    `${prefijo}-ubicacion`,
  ];
}

function limpiarCamposPersona(prefijo) {
  camposPersona(prefijo).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.readOnly = true;
      el.classList.remove('invalido');
    }
  });
  sincronizarFirmasCabecera();
}

function aplicarPersona(prefijo, persona) {
  const map = [
    [`${prefijo}-nombre`, persona.nombres],
    [`${prefijo}-cargo`, persona.cargo],
    [`${prefijo}-depto`, persona.departamento],
    [`${prefijo}-un`, persona.unidadNegocio],
    [`${prefijo}-ubicacion`, persona.ubicacion],
  ];
  map.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = val || '';
      el.readOnly = true;
    }
  });
  sincronizarFirmasCabecera();
}

async function autocompletarPersonaPorCedula(prefijo) {
  const cedula = get(`${prefijo}-cedula`);
  if (!cedula) {
    limpiarCamposPersona(prefijo);
    return;
  }
  try {
    const qs = encodeURIComponent(normalizarCedulaBusqueda(cedula));
    const res = await fetch(`/api/actas-personas?cedula=${qs}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const persona = await res.json();
    if (!persona || !persona.cedula) {
      limpiarCamposPersona(prefijo);
      toast('La cédula no está en Actas.xlsx.', 'advertencia');
      return;
    }
    aplicarPersona(prefijo, persona);
  } catch {
    toast('No se pudo consultar las personas de actas.', 'error');
  }
}

function renderInfoUsuario() {
  const nombre = toTitleCase(usuarioActual.nombreCompleto || '');
  document.getElementById('user-nombre').textContent = nombre || '—';
  document.getElementById('user-correo').textContent = usuarioActual.correo || usuarioActual.cedula || '—';
  document.getElementById('user-rol').textContent = usuarioActual.rol || usuarioActual.cargo || '—';
  const elAcceso = document.getElementById('user-ultimo-acceso');
  if (elAcceso) {
    const anterior = sessionStorage.getItem('ultimoAccesoAnterior');
    elAcceso.textContent = formatearUltimoAcceso(anterior) || '';
  }
  document.getElementById('user-avatar').textContent = (nombre || 'U').charAt(0).toUpperCase();
  const esAdmin = esRolAdministrador(usuarioActual.rol);
  setSidebarBtnVisible(document.getElementById('btn-usuarios'), esAdmin);
  setSidebarBtnVisible(document.getElementById('btn-reportes'), esAdmin);
}

function mostrarBienvenida() {
  activos = [];
  evidenciasAdjuntas = [];
  const panel = document.getElementById('panel-principal');
  panel.innerHTML = `
    <div class="panel-bienvenida" id="panel-bienvenida">
      <div class="panel-bienvenida__icono">📄</div>
      <h2>Actas de novedades</h2>
      <p>Haz clic en <strong>Actas Activos</strong> en el menú lateral para abrir el formulario.</p>
    </div>
  `;
}

function renderFormularioActas() {
  serieInventarioOk = false;
  const panel = document.getElementById('panel-principal');
  const radios = TIPOS_NOVEDAD.map((t) => `
    <label class="actas-radio">
      <input type="radio" name="tipo-novedad" value="${esc(t)}" required>
      <span>${esc(t)}</span>
    </label>
  `).join('');
  panel.innerHTML = `
    <form id="form-acta" class="formulario-diagnostico" novalidate>
      <h2>Acta de novedades — Activos HW &amp; SW</h2>

      <fieldset class="seccion">
        <legend>Encabezado</legend>
        <div class="campos-grid">
          <div class="campo">
            <label for="fecha-novedad">Fecha novedad *</label>
            <input type="date" id="fecha-novedad" value="${hoyISO()}" readonly required>
          </div>
          <div class="campo">
            <label for="numero-acta">Nº acta interno *</label>
            <input type="text" id="numero-acta" maxlength="11" readonly required>
          </div>
          <div class="campo campo-full" id="tipo-novedad-bloque">
            <label>Tipo de novedad *</label>
            <div class="actas-radios">${radios}</div>
          </div>
        </div>
      </fieldset>

      <fieldset class="seccion">
        <legend>Entregado o realizado por</legend>
        <div class="campos-grid">
          <div class="campo"><label for="ent-cedula">Cédula *</label><input type="text" id="ent-cedula" required></div>
          <div class="campo"><label for="ent-nombre">Nombre *</label><input type="text" id="ent-nombre" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="ent-cargo">Cargo *</label><input type="text" id="ent-cargo" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="ent-depto">Departamento *</label><input type="text" id="ent-depto" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="ent-un">Unidad de negocio *</label><input type="text" id="ent-un" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="ent-ubicacion">Ubicación física *</label><input type="text" id="ent-ubicacion" placeholder="Se autocompleta por cedula" readonly required></div>
        </div>
      </fieldset>

      <fieldset class="seccion">
        <legend>Recibido por</legend>
        <div class="campos-grid">
          <div class="campo"><label for="rec-cedula">Cédula *</label><input type="text" id="rec-cedula" required></div>
          <div class="campo"><label for="rec-nombre">Nombre *</label><input type="text" id="rec-nombre" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="rec-cargo">Cargo *</label><input type="text" id="rec-cargo" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="rec-depto">Departamento *</label><input type="text" id="rec-depto" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="rec-un">Unidad de negocio *</label><input type="text" id="rec-un" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="rec-ubicacion">Ubicación *</label><input type="text" id="rec-ubicacion" placeholder="Se autocompleta por cedula" readonly required></div>
          <div class="campo"><label for="ubicacion-contable">Ubicación contable (nómina)</label><input type="text" id="ubicacion-contable"></div>
          <div class="campo"><label for="usuario-red">Usuario de red</label><input type="text" id="usuario-red"></div>
        </div>
      </fieldset>

      <fieldset class="seccion">
        <legend>Datos del activo</legend>
        <div class="campos-grid">
          <div class="campo campo-full campo-busqueda-equipo">
            <label for="act-busqueda-equipo">Buscar activo *</label>
            <div class="campo-busqueda-equipo__fila">
              <input type="text" id="act-busqueda-equipo" placeholder="Serial o etiqueta" autocomplete="off">
              <button type="button" class="btn btn--primario" id="btn-buscar-activo">Buscar</button>
              <button type="button" class="btn btn--outline" id="btn-borrar-activo">Borrar</button>
            </div>
          </div>
          <div class="campo">
            <label for="act-tipo">Tipo de equipo *</label>
            <select id="act-tipo" required>
              <option value="">Selecciona…</option>
              ${TIPOS_EQUIPO.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label for="act-serie">Serie *</label><input type="text" id="act-serie" placeholder="Se autocompleta por serial" readonly required></div>
          <div class="campo"><label for="act-marca">Marca *</label><input type="text" id="act-marca" placeholder="Se autocompleta por serial" readonly required></div>
          <div class="campo"><label for="act-modelo">Modelo *</label><input type="text" id="act-modelo" placeholder="Se autocompleta por serial" readonly required></div>
          <div class="campo"><label for="act-etiqueta">Nº etiqueta *</label><input type="text" id="act-etiqueta" placeholder="Se autocompleta por serial" readonly required></div>
          <div class="campo"><label for="act-otros">Otros (IP / # puertos / etc.)</label><input type="text" id="act-otros"></div>
          <div class="campo campo-full"><label for="act-software">Relación de software fuera del inventario</label><input type="text" id="act-software"></div>
        </div>
        <div class="actas-activo-acciones">
          <button type="button" class="btn btn--outline" id="btn-agregar-activo">Agregar otro</button>
          <label class="btn btn--outline actas-btn-archivo" for="activos-txt-input">Cargar desde archivo</label>
          <input type="file" id="activos-txt-input" accept=".txt,.csv,text/plain,text/csv" hidden>
        </div>
        <p class="evidencias-ayuda">Archivo .txt o .csv UTF-8, una línea por activo: <code>tipo;serie</code> o <code>tipo,serie</code> (opcional cabecera). Marca, modelo y etiqueta salen del inventario.</p>
        <div class="actas-preview" id="activos-preview"></div>
        <div class="actas-txt-errores" id="activos-txt-errores" hidden></div>
      </fieldset>

      <fieldset class="seccion">
        <legend>Estado / observaciones (opcional)</legend>
        <div class="campo campo-full">
          <label for="config-hw">Configuración del hardware</label>
          <textarea id="config-hw" rows="3"></textarea>
        </div>
        <div class="campo campo-full">
          <label for="modificaciones">Relación de modificaciones, actualizaciones y/o adiciones</label>
          <textarea id="modificaciones" rows="3"></textarea>
        </div>
        <div class="campo campo-full">
          <label for="observaciones">Observaciones</label>
          <textarea id="observaciones" rows="3"></textarea>
        </div>
      </fieldset>

      <fieldset class="seccion">
        <legend>Evidencias (opcional)</legend>
        <div class="campo campo-full">
          <label for="evidencias-input">Adjuntar imágenes (máx. 3)</label>
          <input type="file" id="evidencias-input" accept="image/*" multiple>
          <p class="evidencias-ayuda">Se redimensionan a 400px y aparecen en una página adicional del PDF.</p>
          <div class="evidencias-preview" id="evidencias-preview"></div>
        </div>
      </fieldset>

      <fieldset class="seccion">
        <legend>Firmas</legend>
        <p class="evidencias-ayuda">Nombre, cédula y cargo se toman de la primera sección.</p>
        <div class="campos-grid">
          <div class="campo"><label>Entrega — nombre</label><input type="text" id="fir-ent-nombre" readonly></div>
          <div class="campo"><label>Entrega — cédula</label><input type="text" id="fir-ent-cedula" readonly></div>
          <div class="campo"><label>Entrega — cargo</label><input type="text" id="fir-ent-cargo" readonly></div>
        </div>
        ${bloqueFirma('entrega', 'Firma de quien entrega')}
        <div class="campos-grid" style="margin-top:18px">
          <div class="campo"><label>Recibe — nombre</label><input type="text" id="fir-rec-nombre" readonly></div>
          <div class="campo"><label>Recibe — cédula</label><input type="text" id="fir-rec-cedula" readonly></div>
          <div class="campo"><label>Recibe — cargo</label><input type="text" id="fir-rec-cargo" readonly></div>
        </div>
        ${bloqueFirma('recibe', 'Firma de quien recibe')}
      </fieldset>

      <div class="formulario-diagnostico__footer">
        <button type="submit" class="btn btn--primario" id="btn-generar-acta">Generar PDF</button>
        <button type="button" class="btn btn--outline" id="btn-limpiar-acta">Limpiar formulario</button>
      </div>
    </form>
  `;
  registrarEventosFormulario();
}

function bloqueFirma(id, titulo) {
  return `
    <div class="campo campo-full" id="firma-bloque-${id}">
      <label>${titulo} <small style="font-weight:400;text-transform:none;">(opcional: dibuja, carga imagen o firma a mano en el PDF)</small></label>
      <div class="firma-tabs">
        <button type="button" class="firma-tab firma-tab--activo" data-firma="${id}" data-modo="dibujar">Dibujar firma</button>
        <button type="button" class="firma-tab" data-firma="${id}" data-modo="cargar">Cargar imagen</button>
      </div>
      <div class="firma-panel" id="panel-dibujar-${id}">
        <canvas id="firma-canvas-${id}" width="400" height="110"
          style="border:1.5px solid var(--color-gris-borde);border-radius:4px;background:#fff;cursor:crosshair;touch-action:none;display:block;"></canvas>
        <button type="button" class="btn btn--outline" data-limpiar-canvas="${id}" style="margin-top:6px;padding:5px 12px;font-size:12px;">Limpiar</button>
      </div>
      <div class="firma-panel" id="panel-cargar-${id}" style="display:none;">
        <input type="file" id="firma-archivo-${id}" accept="image/*">
        <img id="firma-preview-${id}" class="firma-preview-img" src="" alt="Vista previa">
      </div>
    </div>
  `;
}

function leerActivoDelForm() {
  return {
    tipo: get('act-tipo'),
    marca: get('act-marca'),
    modelo: get('act-modelo'),
    serie: get('act-serie'),
    etiqueta: get('act-etiqueta'),
    otros: get('act-otros'),
    software: get('act-software'),
  };
}

function activoCompleto(a) {
  return Boolean(a.tipo && a.marca && a.modelo && a.serie && a.etiqueta);
}

function limpiarBloqueActivo() {
  ['act-busqueda-equipo', 'act-tipo', 'act-marca', 'act-modelo', 'act-serie', 'act-etiqueta', 'act-otros', 'act-software']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        el.classList.remove('invalido');
      }
    });
  setCamposEquipoReadonly(true);
  serieInventarioOk = false;
}

function renderPreviewActivos() {
  const box = document.getElementById('activos-preview');
  if (!box) return;
  if (!activos.length) {
    box.innerHTML = `
      <p class="actas-preview__titulo">Vista previa de activos</p>
      <p class="actas-preview__vacio">Aún no hay activos. Completa el primer equipo y pulsa Agregar otro, o genera el PDF si ya está diligenciado (se tomará el bloque actual).</p>
    `;
    return;
  }
  box.innerHTML = `
    <p class="actas-preview__titulo">Vista previa de activos (${activos.length})</p>
    <ul class="actas-preview__lista">
      ${activos.map((a, i) => `
        <li class="actas-preview__item">
          <p><strong>${esc(a.tipo)}</strong> · ${esc(a.marca)} ${esc(a.modelo)} · Serie ${esc(a.serie)} · Etiqueta ${esc(a.etiqueta)}</p>
          <button type="button" class="btn btn--outline" data-quitar-activo="${i}">Quitar</button>
        </li>
      `).join('')}
    </ul>
  `;
  box.querySelectorAll('[data-quitar-activo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activos.splice(Number(btn.dataset.quitarActivo), 1);
      renderPreviewActivos();
    });
  });
}

async function agregarActivoDesdeForm() {
  const a = leerActivoDelForm();
  if (!activoCompleto(a)) {
    ['act-busqueda-equipo', 'act-tipo', 'act-marca', 'act-modelo', 'act-serie', 'act-etiqueta'].forEach((id) => {
      if (!get(id) && id !== 'act-busqueda-equipo') marcarInvalido(document.getElementById(id));
    });
    if (!get('act-serie')) marcarInvalido(document.getElementById('act-busqueda-equipo'));
    toast('Completa tipo, marca, modelo, serie y etiqueta para agregar el activo.', 'advertencia');
    return false;
  }
  if (!serieInventarioOk) {
    const ok = await autocompletarEquipoPorSerie(get('act-busqueda-equipo') || a.serie);
    if (!ok) return false;
  }
  activos.push({ ...leerActivoDelForm(), inventarioOk: true });
  limpiarBloqueActivo();
  renderPreviewActivos();
  return true;
}

function activosParaPdf() {
  const lista = [...activos];
  const draft = leerActivoDelForm();
  if (activoCompleto(draft)) lista.push(draft);
  return lista;
}

function sincronizarFirmasCabecera() {
  const map = [
    ['ent-nombre', 'fir-ent-nombre'],
    ['ent-cedula', 'fir-ent-cedula'],
    ['ent-cargo', 'fir-ent-cargo'],
    ['rec-nombre', 'fir-rec-nombre'],
    ['rec-cedula', 'fir-rec-cedula'],
    ['rec-cargo', 'fir-rec-cargo'],
  ];
  map.forEach(([src, dest]) => {
    const d = document.getElementById(dest);
    if (d) d.value = get(src);
  });
}

function iniciarCanvasFirma(id) {
  const canvas = document.getElementById(`firma-canvas-${id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let dibujando = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e) => {
    e.preventDefault();
    dibujando = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!dibujando) return;
    e.preventDefault();
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => { dibujando = false; };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

function obtenerFirmaBase64(id) {
  const canvas = document.getElementById(`firma-canvas-${id}`);
  const panelDibujar = document.getElementById(`panel-dibujar-${id}`);
  if (canvas && panelDibujar && panelDibujar.style.display !== 'none') {
    const pixeles = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const tieneTrazo = pixeles.some((v, i) => i % 4 === 3 && v > 0);
    if (tieneTrazo) return canvas.toDataURL('image/png');
  }
  const preview = document.getElementById(`firma-preview-${id}`);
  if (preview && preview.classList.contains('visible') && preview.src) return preview.src;
  return '';
}

function redimensionarImagen(file, maxSize = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ratio = Math.min(maxSize / width, maxSize / height, 1);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagen_invalida'));
    };
    img.src = url;
  });
}

function renderEvidenciasPreview() {
  const container = document.getElementById('evidencias-preview');
  if (!container) return;
  if (!evidenciasAdjuntas.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = evidenciasAdjuntas.map((ev, i) => `
    <div class="evidencia-thumb">
      <img src="${ev.dataUrl}" alt="${esc(ev.name)}">
      <button type="button" class="evidencia-quitar" data-idx="${i}" aria-label="Quitar imagen">×</button>
    </div>
  `).join('');
  container.querySelectorAll('.evidencia-quitar').forEach((btn) => {
    btn.addEventListener('click', () => {
      evidenciasAdjuntas.splice(Number(btn.dataset.idx), 1);
      renderEvidenciasPreview();
    });
  });
}

function validarFormulario() {
  document.querySelectorAll('.invalido').forEach((el) => el.classList.remove('invalido'));
  const requeridos = [
    'numero-acta',
    'ent-nombre', 'ent-cedula', 'ent-cargo', 'ent-depto', 'ent-un', 'ent-ubicacion',
    'rec-nombre', 'rec-cedula', 'rec-cargo', 'rec-depto', 'rec-un', 'rec-ubicacion',
  ];
  let ok = true;
  requeridos.forEach((id) => {
    const el = document.getElementById(id);
    if (!get(id)) {
      marcarInvalido(el);
      ok = false;
    }
  });
  if (!getTipoNovedad()) {
    document.getElementById('tipo-novedad-bloque')?.classList.add('invalido');
    toast('Selecciona un tipo de novedad.', 'error');
    ok = false;
  }
  const numero = get('numero-acta');
  if (!RE_ACTA.test(numero)) {
    marcarInvalido(document.getElementById('numero-acta'));
    toast('El Nº de acta interno aún no está asignado. Recarga el formulario.', 'error');
    ok = false;
  }
  const listaActivos = activosParaPdf();
  if (!listaActivos.length) {
    toast('Agrega al menos un activo (tipo, marca, modelo, serie y etiqueta).', 'error');
    ok = false;
  } else if (!serieInventarioOk && activoCompleto(leerActivoDelForm())) {
    marcarInvalido(document.getElementById('act-serie'));
    marcarInvalido(document.getElementById('act-busqueda-equipo'));
    toast('La serie del activo debe existir en el inventario.', 'error');
    ok = false;
  }
  if (!ok && requeridos.some((id) => !get(id))) {
    toast('Completa los campos obligatorios del acta.', 'error');
  }
  return ok;
}

function recopilarValores() {
  return {
    fechaNovedad: get('fecha-novedad'),
    tipoNovedad: getTipoNovedad(),
    numeroActa: get('numero-acta'),
    nombreTecnico: usuarioActual.nombreCompleto || '',
    cedulaTecnico: usuarioActual.cedula || '',
    entregado: {
      nombre: get('ent-nombre'),
      cedula: get('ent-cedula'),
      cargo: get('ent-cargo'),
      departamento: get('ent-depto'),
      unidadNegocio: get('ent-un'),
      ubicacion: get('ent-ubicacion'),
    },
    recibido: {
      nombre: get('rec-nombre'),
      cedula: get('rec-cedula'),
      cargo: get('rec-cargo'),
      departamento: get('rec-depto'),
      unidadNegocio: get('rec-un'),
      ubicacion: get('rec-ubicacion'),
    },
    ubicacionContable: get('ubicacion-contable'),
    usuarioRed: get('usuario-red'),
    activos: activosParaPdf(),
    configHardware: get('config-hw'),
    modificaciones: get('modificaciones'),
    observaciones: get('observaciones'),
    firmaEntrega: obtenerFirmaBase64('entrega'),
    firmaRecibe: obtenerFirmaBase64('recibe'),
    evidencias: evidenciasAdjuntas.map((ev) => ev.dataUrl),
  };
}

async function generarPDF() {
  const draft = leerActivoDelForm();
  if (activoCompleto(draft) && !serieInventarioOk) {
    const okSerie = await autocompletarEquipoPorSerie(get('act-busqueda-equipo') || draft.serie);
    if (!okSerie) return;
  }
  if (!validarFormulario()) return;
  const btn = document.getElementById('btn-generar-acta');
  btn.disabled = true;
  btn.textContent = 'Generando PDF…';
  try {
    const valores = recopilarValores();
    const headers = { 'Content-Type': 'application/json' };
    if (tokenGuardado) headers.Authorization = `Bearer ${tokenGuardado}`;
    const res = await fetch('/api/generar-pdf-acta', {
      method: 'POST',
      headers,
      body: JSON.stringify(valores),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') || '';
    const match = disp.match(/filename="?([^"]+)"?/i);
    const fechaStr = String(valores.fechaNovedad || '').replace(/-/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = match?.[1] || `acta_${valores.numeroActa}_${fechaStr}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast('PDF del acta generado y descargado correctamente.', 'exito');
    mostrarBienvenida();
  } catch (err) {
    toast(`Error al generar el PDF: ${err.message || 'Intenta de nuevo.'}`, 'error');
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.textContent = 'Generar PDF';
    }
  }
}

function registrarEventosFormulario() {
  renderPreviewActivos();
  iniciarCanvasFirma('entrega');
  iniciarCanvasFirma('recibe');
  ['ent-nombre', 'ent-cedula', 'ent-cargo', 'rec-nombre', 'rec-cedula', 'rec-cargo'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', sincronizarFirmasCabecera);
  });
  document.getElementById('btn-agregar-activo')?.addEventListener('click', () => {
    agregarActivoDesdeForm();
  });
  document.getElementById('activos-txt-input')?.addEventListener('change', async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const nombre = String(file.name || '').toLowerCase();
    if (!nombre.endsWith('.txt') && !nombre.endsWith('.csv')) {
      toast('Solo se admiten archivos .txt o .csv.', 'advertencia');
      return;
    }
    try {
      const texto = await file.text();
      await importarActivosDesdeTxt(texto);
    } catch {
      toast('No se pudo leer el archivo.', 'error');
    }
  });
  const formActa = document.getElementById('form-acta');
  formActa?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !formActa.contains(btn)) return;
    if (btn.id === 'btn-buscar-activo') {
      e.preventDefault();
      e.stopPropagation();
      ejecutarBusquedaActivo();
    }
    if (btn.id === 'btn-borrar-activo') {
      e.preventDefault();
      e.stopPropagation();
      borrarBusquedaActivo();
    }
  });
  formActa?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target?.id !== 'act-busqueda-equipo') return;
    e.preventDefault();
    ejecutarBusquedaActivo();
  });
  document.getElementById('ent-cedula')?.addEventListener('input', () => {
    limpiarCamposPersona('ent');
  });
  document.getElementById('rec-cedula')?.addEventListener('input', () => {
    limpiarCamposPersona('rec');
  });
  document.getElementById('ent-cedula')?.addEventListener('blur', () => {
    autocompletarPersonaPorCedula('ent');
  });
  document.getElementById('rec-cedula')?.addEventListener('blur', () => {
    autocompletarPersonaPorCedula('rec');
  });
  document.querySelectorAll('.firma-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.firma;
      const modo = tab.dataset.modo;
      document.querySelectorAll(`.firma-tab[data-firma="${id}"]`).forEach((t) => {
        t.classList.toggle('firma-tab--activo', t === tab);
      });
      document.getElementById(`panel-dibujar-${id}`).style.display = modo === 'dibujar' ? '' : 'none';
      document.getElementById(`panel-cargar-${id}`).style.display = modo === 'cargar' ? '' : 'none';
    });
  });
  document.querySelectorAll('[data-limpiar-canvas]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.limpiarCanvas;
      const canvas = document.getElementById(`firma-canvas-${id}`);
      canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    });
  });
  ['entrega', 'recibe'].forEach((id) => {
    document.getElementById(`firma-archivo-${id}`)?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById(`firma-preview-${id}`);
        preview.src = ev.target.result;
        preview.classList.add('visible');
      };
      reader.readAsDataURL(file);
    });
  });
  document.getElementById('evidencias-input')?.addEventListener('change', async (e) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = '';
    const espacio = MAX_EVIDENCIAS - evidenciasAdjuntas.length;
    if (espacio <= 0) {
      toast('Máximo 3 imágenes de evidencia.', 'advertencia');
      return;
    }
    const aProcesar = files.slice(0, espacio);
    if (files.length > espacio) toast(`Solo se agregaron ${espacio} imagen(es). Máximo 3.`, 'advertencia');
    for (const file of aProcesar) {
      if (!file.type.startsWith('image/')) {
        toast(`${file.name} no es una imagen válida.`, 'advertencia');
        continue;
      }
      try {
        evidenciasAdjuntas.push({ name: file.name, dataUrl: await redimensionarImagen(file) });
      } catch {
        toast(`No se pudo procesar ${file.name}.`, 'error');
      }
    }
    renderEvidenciasPreview();
  });
  document.getElementById('btn-limpiar-acta')?.addEventListener('click', () => {
    activos = [];
    evidenciasAdjuntas = [];
    renderFormularioActas();
    toast('Formulario limpiado.', 'info');
  });
  document.getElementById('form-acta')?.addEventListener('submit', (e) => {
    e.preventDefault();
    generarPDF();
  });
  cargarSiguienteNumeroActa();
}

async function cargarSiguienteNumeroActa() {
  const input = document.getElementById('numero-acta');
  if (!input) return;
  try {
    const headers = {};
    if (tokenGuardado) headers.Authorization = `Bearer ${tokenGuardado}`;
    const res = await fetch('/api/actas/siguiente-numero', { headers });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    if (data.numeroActa) input.value = data.numeroActa;
  } catch {
    toast('No se pudo obtener el consecutivo de acta.', 'advertencia');
  }
}

function registrarSidebar() {
  document.getElementById('btn-actas')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderFormularioActas();
  });
  document.getElementById('btn-diagnostico')?.addEventListener('click', () => {
    window.location.href = '/pages/usuario.html?panel=diagnostico';
  });
  document.getElementById('btn-diagnostico-beta')?.addEventListener('click', () => {
    window.location.href = '/pages/usuario.html?panel=diagnostico-beta';
  });
  document.getElementById('btn-usuarios')?.addEventListener('click', () => {
    window.location.href = '/pages/usuario.html?panel=usuarios';
  });
  document.getElementById('btn-reportes')?.addEventListener('click', () => {
    window.location.href = '/pages/usuario.html?panel=reportes';
  });
  document.getElementById('btn-videoconferencia')?.addEventListener('click', () => {
    window.location.href = '/pages/conferencia.html';
  });
  document.getElementById('btn-cerrar-sesion')?.addEventListener('click', () => {
    cerrarSesionStorage();
    toast('Su sesión ha sido cerrada con éxito.', 'exito');
    setTimeout(() => window.location.replace('/pages/index.html'), 1400);
  });
}

renderBanner();
renderInfoUsuario();
registrarSidebar();
initCambiarClave(() => tokenGuardado);
inventarioListo = recargarInventario();
