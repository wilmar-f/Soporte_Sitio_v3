/**
 * usuario.js — Lógica principal del panel de usuario
 * Incluye: verificación de sesión, carga de datos CSV, formulario dinámico,
 * autocompletado, validaciones y generación de PDF vía Puppeteer en el servidor.
 *
 * NOTA FUTURA: Si se requiere subir el PDF automáticamente a OneDrive/SharePoint,
 * se deberá implementar Microsoft Graph API con una app registrada en Azure AD.
 * Esto queda fuera del alcance actual de esta aplicación.
 */
import { renderBanner }      from './banner.js';
import { toast }             from './toast.js';
import {
  resolverSesion,
  leer as leerSesion,
  cerrar as cerrarSesionStorage,
  escucharCierreEnOtrasPestanas,
  iniciarVigilanciaInactividad,
} from './sesion.js';
import {
  renderDiagnosticoInteractivo,
  initDiagnosticoInteractivo,
  validarDiagnosticoInteractivo,
  resetDiagnosticoInteractivo,
} from './diagnostico-logica.js';
import { formatearUltimoAcceso } from './ultimo-acceso.js';
import { esRolAdministrador, renderPanelNoticias } from './noticias.js';
import { renderPanelUsuarios } from './admin-usuarios.js';
import { initCambiarClave } from './cambiar-clave.js';

const MAX_EVIDENCIAS = 3;
let evidenciasAdjuntas = [];

/* ══════════════════════════════════════════════════════
   1. VERIFICACIÓN DE SESIÓN
   ══════════════════════════════════════════════════════ */
const { token: tokenGuardado, usuario: usuarioGuardado } = await resolverSesion();

const sesionValida = Boolean(tokenGuardado && usuarioGuardado);

if (!sesionValida) {
  window.location.replace('/pages/index.html');
} else {
  escucharCierreEnOtrasPestanas();
  iniciarVigilanciaInactividad();
}

function parseJsonSeguro(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function usuarioDesdeSesion(sesion) {
  const admin = parseJsonSeguro(sesion?.usuario, {}) || {};
  return {
    cedula: admin.cedula || '',
    nombreCompleto: admin.nombreCompleto || admin.nombre || '',
    cargo: admin.cargo || '',
    rol: admin.rol || '',
    loginType: 'admin',
  };
}

let usuarioActual = usuarioDesdeSesion({
  usuario: usuarioGuardado,
});

function esAdministrador() {
  return esRolAdministrador(usuarioActual.rol);
}

function setSidebarBtnVisible(btn, visible) {
  if (!btn) return;
  btn.hidden = !visible;
  btn.style.display = visible ? '' : 'none';
}

/* ══════════════════════════════════════════════════════
   2. DATOS MAESTROS: SEDES ↔ CÓDIGOS DE UBICACIÓN
   ══════════════════════════════════════════════════════ */
const SEDES_CODIGOS = [
  { sede: 'ADMON CENTRAL ALKOSTO AV 68', codigo: 'AKB68' },
  { sede: 'ALKOMPRAR AKT 1RA MAYO #2', codigo: 'ALK2M' },
  { sede: 'ALKOMPRAR AKT LA 72', codigo: 'ALK72' },
  { sede: 'ALKOMPRAR BOGOTA CENTRO', codigo: 'ALCEN' },
  { sede: 'ALKOMPRAR MOTOS ROYALL BOGOTA', codigo: 'ALRO2' },
  { sede: 'ALKOSTO VENECIA', codigo: 'AKVEN' },
  { sede: 'ALKOSTO 170', codigo: 'AK170' },
  { sede: 'ALKOSTO AV 68', codigo: 'AKB30' },
  { sede: 'ALKOSTO CRA 30', codigo: 'AKEDE' },
  { sede: 'ALKOSTO EL EDEN', codigo: 'ALVEN' },
  { sede: 'ALKOMPRAR VENECIA', codigo: 'ALVE1' },
  { sede: 'ALKOMPRAR VENECIA ALMACEN REPUESTOS', codigo: 'AKOVE' },
  { sede: 'ALKOSTO OUTLET VENECIA', codigo: 'AKOUT' },
  { sede: 'CENTRO DE SERVICIOS COLOMBIANITA', codigo: 'CENTR' },
  { sede: 'DISTRIBUCIONES BOGOTA', codigo: 'DIBOG' },
  { sede: 'FOTON AV 68', codigo: 'FOA68' },
  { sede: 'FOTON BOYACA', codigo: 'FOBOY' },
  { sede: 'FOTON FATIMA', codigo: 'FOFAT' },
  { sede: 'FOTON FONTIBON', codigo: 'FOFON' },
  { sede: 'KALLEY', codigo: 'KALLEY' },
  { sede: 'K-TRONIX 94', codigo: 'KTB94' },
  { sede: 'K-TRONIX INTERNET', codigo: 'KTINT' },
  { sede: 'K-TRONIX SALITRE', codigo: 'KTSAL' },
  { sede: 'K-TRONIX TITAN', codigo: 'KTTIT' },
  { sede: 'K-TRONIX UNICENTRO', codigo: 'KTUNI' },
  { sede: 'MOTOS BOGOTA NUBE', codigo: 'MOBON' },
  { sede: 'NUBE AKT ÉXITO SOGAMOSO', codigo: 'RKBOG' },
  { sede: 'REPUESTOS KALLEY BOGOTA', codigo: 'VWFON' },
  { sede: 'VOLKSWAGEN FONTIBÓN', codigo: 'DIFLO' },
  { sede: 'DISTRIBUCIONES FLORENCIA', codigo: 'AKCED' },
  { sede: 'CEDI ALKOSTO', codigo: 'AKCE2' },
  { sede: 'CEDI ALKOSTO 2', codigo: 'AKCE3' },
  { sede: 'CEDI ALKOSTO 3', codigo: 'AKCE4' },
  { sede: 'CEDI ALKOSTO 4', codigo: 'CEBOG' },
  { sede: 'CEDI BOGOTA', codigo: 'MOCEB' },
  { sede: 'CEDI MOTOS FUNZA', codigo: 'KTFUS' },
  { sede: 'K-TRONIX FUSA', codigo: 'KTGIR' },
  { sede: 'K-TRONIX GIRARDOT', codigo: 'KTMOS' },
  { sede: 'K-TRONIX MOSQUERA', codigo: 'ALKAU' },
  { sede: 'ALKOMPRAR AKT BAJAJ SOACHA', codigo: 'ALSOA' },
  { sede: 'ALKOMPRAR AKT SOACHA', codigo: 'KTTUN' },
  { sede: 'K-TRONIX TUNJA', codigo: 'MOTOS' },
  { sede: 'NUBE AKT EXITO TUNJA', codigo: 'ALVIL' },
  { sede: 'ALKOMPRAR AKT VILLAVICENCIO', codigo: 'ALVI2' },
  { sede: 'ALKOMPRAR VILLAVICENCIO #2', codigo: 'AKVIL' },
  { sede: 'ALKOSTO VILLAVICENCIO', codigo: 'FOVIL' },
  { sede: 'FOTON VILLAVICENCIO', codigo: 'KTVIL' },
  { sede: 'K-TRONIX VILLAVICENCIO', codigo: 'AKYOP' },
  { sede: 'ALKOSTO YOPAL', codigo: 'AKIPI' },
  { sede: 'ALKOSTO IPIALES', codigo: 'AKIGP' },
  { sede: 'ALKOSTO IPIALES GRAN PLAZA', codigo: 'AKBOL' },
  { sede: 'ALKOSTO AV BOLIVAR', codigo: 'AKPAS' },
  { sede: 'ALKOSTO PASTO', codigo: 'DIPAS' },
  { sede: 'DISTRIBUCIONES PASTO', codigo: 'FOPAS' },
  { sede: 'FOTON PASTO', codigo: 'AKTUQ' },
  { sede: 'ALKOSTO TUQUERRES', codigo: 'ALARM' },
  { sede: 'ALKOMPRAR ARMENIA', codigo: 'ALBA3' },
  { sede: 'REPUESTOS MOTOS EJE CAFETERO', codigo: 'ALBA4' },
  { sede: 'ALKOMPRAR AKT BARRANQUILLA #3', codigo: 'ALBAR' },
  { sede: 'ALKOMPRAR AKT BARRANQUILLA #4', codigo: 'ALBA5' },
  { sede: 'ALKOMPRAR BARRANQUILLA', codigo: 'AKBAR' },
  { sede: 'ALKOMPRAR BARRANQUILLA UNICO', codigo: 'DIBAR' },
  { sede: 'ALKOSTO BARRANQUILLA', codigo: 'KTBAR' },
  { sede: 'DISTRIBUCIONES BARRANQUILLA', codigo: 'ALRUS' },
  { sede: 'K-TRONIX BARRANQUILLA', codigo: 'ALCAL' },
  { sede: 'NUBE AKT SURTIMAX MACARENA', codigo: 'ALCA4' },
  { sede: 'NUBE AKT EXITO BUENAVENTURA', codigo: 'ALRO3' },
  { sede: 'ALKOMPRAR AKT AV ROOSVELT', codigo: 'ALKUN' },
  { sede: 'ALKOMPRAR CALI', codigo: 'AKCAL' },
  { sede: 'ALKOMPRAR CALI #4', codigo: 'AKCAN' },
  { sede: 'ALKOMPRAR MOTOS ROYAL CALI', codigo: 'DICAL' },
  { sede: 'ALKOMPRAR UNICO', codigo: 'FOCAL' },
  { sede: 'ALKOSTO CALI', codigo: 'KTCAL' },
  { sede: 'ALKOSTO CALI NORTE', codigo: 'MOCAN' },
  { sede: 'CST MOTOS CALI 1', codigo: 'VWCAL' },
  { sede: 'DISTRIBUCIONES CALI', codigo: 'ALIBA' },
  { sede: 'FOTON CALI', codigo: 'KTMAN' },
  { sede: 'K-TRONIX CALI CHIPICHAPE', codigo: 'ALMO1' },
  { sede: 'NUBE AKT ÉXITO SAN FERNANDO CALI', codigo: 'ALNUE' },
  { sede: 'VOLKSWAGEN CALI', codigo: 'DIMON' },
  { sede: 'ALKOMPRAR IBAGUE', codigo: 'ALNEI' },
  { sede: 'K-TRONIX MANIZALES', codigo: 'ALPER' },
  { sede: 'ALKOMPRAR AKT MONTERIA #1', codigo: 'AKPER' },
  { sede: 'ALKOMPRAR CC NUESTRO MONTERIA', codigo: 'AKCEP' },
  { sede: 'DISTRIBUCIONES MONTERIA', codigo: 'ALSIN' },
  { sede: 'NUBE AKT EXITO MONTERIA', codigo: 'AKSIN' },
  { sede: 'ALKOMPRAR NEIVA', codigo: 'ALVAL' },
  { sede: 'ALKOMPRAR DOSQUEBRADAS PEREIRA', codigo: 'ALVA2' },
  { sede: 'ALKOSTO PEREIRA', codigo: 'ALAPA' },
  { sede: 'CENTRO DISTRIBUCIÓN PEREIRA AKCEP', codigo: 'DIAPA' },
  { sede: 'NUBE AKT EXITO SABANALARGA', codigo: 'ALBAC' },
  { sede: 'ALKOMPRAR SINCELEJO', codigo: 'ALBEL' },
  { sede: 'ALKOSTO SINCELEJO', codigo: 'ALBE2' },
  { sede: 'ALKOMPRAR VALLEDUPAR', codigo: 'ALNI5' },
  { sede: 'ALKOMPRAR VALLEDUPAR #2', codigo: 'ALBUK' },
  { sede: 'ALKOMPRAR APARTADO', codigo: 'ALBN2' },
  { sede: 'DISTRIBUCIONES APARTADO', codigo: 'ALBN3' },
  { sede: 'ALKOMPRAR BARRANCABERMEJA', codigo: 'ALBUC' },
  { sede: 'NUBE AKT EXITO BARRANCABERMEJA', codigo: 'ALBU2' },
  { sede: 'NUBE AKT VICTOR MOTOS BARRANCABERMEJA', codigo: 'KTBUC' },
  { sede: 'ALKOMPRAR BELLO', codigo: 'DIMED' },
  { sede: 'ALKOMPRAR BELLO #2', codigo: 'FOCOP' },
  { sede: 'ALKOMPRAR NIHLO NO 5', codigo: 'ALCUC' },
  { sede: 'ALKOMPRAR AKT BUCARAMANGA', codigo: 'AKFLO' },
  { sede: 'ALKOMPRAR AKT BUCARAMANGA #2', codigo: 'AKGIR' },
  { sede: 'ALKOMPRAR AKT BUCARAMANGA #3', codigo: 'FOITA' },
  { sede: 'ALKOMPRAR BUCARAMANGA', codigo: 'VWITA' },
  { sede: 'ALKOMPRAR BUCARAMANGA #2', codigo: 'TEDAF' },
  { sede: 'K-TRONIX BUCARAMANGA', codigo: 'ALCED' },
  { sede: 'NUBE AKT EXITO CENTRO BUCARAMANGA', codigo: 'AL332' },
  { sede: 'CENTRO LOGISTICO ENTRADA NORTE', codigo: 'AL333' },
  { sede: 'FOTON COPACABANA', codigo: 'ALAVE' },
  { sede: 'ALKOMPRAR CUCUTA', codigo: 'ALK33' },
  { sede: 'NUBE AKT EXITO AVENIDA QUINTA CUCUTA', codigo: 'ALFLO' },
  { sede: 'ALKOSTO FLORIDABLANCA', codigo: 'ALKA1' },
  { sede: 'CEDI ALKOSTO GIRON', codigo: 'ALBAS' },
  { sede: 'FOTON ITAGUI', codigo: 'ALMAY' },
  { sede: 'VOLKSWAGEN ITAGUI', codigo: 'ALMOL' },
  { sede: 'TEXTILES DAFITI', codigo: 'ALRO1' },
  { sede: 'ADMON CENTRAL ALKOMPRAR', codigo: 'ALNI1' },
  { sede: 'ALKOMPRAR AKT LA 33 #2', codigo: 'ALNIB' },
  { sede: 'ALKOMPRAR AKT LA 33 #3', codigo: 'ALNI2' },
  { sede: 'ALKOMPRAR AVENTURA', codigo: 'ALPRO' },
  { sede: 'ALKOMPRAR DE LA 33', codigo: 'ALDIE' },
  { sede: 'ALKOMPRAR FLORIDA', codigo: 'ALSAN' },
  { sede: 'ALKOMPRAR KALLEY MEDELLIN', codigo: 'CPPAL' },
  { sede: 'ALKOMPRAR LA BASTILLA', codigo: 'DISMD' },
  { sede: 'ALKOMPRAR MAYORCA', codigo: 'MFORD' },
  { sede: 'ALKOMPRAR MOLINOS', codigo: 'FOMED' },
  { sede: 'ALKOMPRAR MOTOS ROYAL MEDELLIN', codigo: 'KALEY' },
  { sede: 'ALKOMPRAR NIHLO', codigo: 'KTARK' },
  { sede: 'ALKOMPRAR NIHLO BODEGA', codigo: 'KTTES' },
  { sede: 'ALKOMPRAR NIHLO NO 2', codigo: 'KTPOB' },
  { sede: 'ALKOMPRAR PROYECTOS', codigo: 'MOMEN' },
  { sede: 'ALKOMPRAR SAN DIEGO', codigo: 'REPME' },
  { sede: 'ALKOMPRAR SAN JUAN', codigo: 'REPMD' },
  { sede: 'CASA PRINCIPAL', codigo: 'TEXTI' },
  { sede: 'DISTRIBUCIONES MEDELLÍN', codigo: 'TXTIL' },
  { sede: 'DISTRIBUCIONES OUTLET MEDELLÍN', codigo: 'TEMEV' },
  { sede: 'ENSAMBLADORA DE MOTOS', codigo: 'TEMEC' },
  { sede: 'FORD MEDELLIN', codigo: 'TERIO' },
  { sede: 'FOTON MEDELLIN', codigo: 'VWMED' },
  { sede: 'KALLEY(DIMED)', codigo: 'ALPIE' },
  { sede: 'K-TRONIX ARKADIA', codigo: 'ALPOL' },
  { sede: 'K-TRONIX EL TESORO', codigo: 'ALRIO' },
  { sede: 'K-TRONIX POBLADO', codigo: 'ALRIO' },
  { sede: 'NUBE AKT EXITO POBLADO', codigo: 'ALRIO' },
  { sede: 'REPUESTOS MOTOS', codigo: 'ALRIO' },
  { sede: 'REPUESTOS OUTLET MEDELLÍN', codigo: 'ALRIO' },
  { sede: 'TEXTILES', codigo: 'ALRIO' },
  { sede: 'TEXTILES GLOKAL MEDELLIN 3 VIAS', codigo: 'ALRIO' },
  { sede: 'TEXTILES GLOKAL MEDELLIN CENTRO', codigo: 'ALRIO' },
  { sede: 'TEXTILES RIONEGRO', codigo: 'ALRIO' },
  { sede: 'VOLKSWAGEN MEDELLIN', codigo: 'VWMED' },
  { sede: 'ALKOMPRAR PIEDECUESTA', codigo: 'ALPIE' },
  { sede: 'ALKOMPRAR AKT RIONEGRO LA POLA', codigo: 'ALPOL' },
  { sede: 'ALKOMPRAR RIONEGRO', codigo: 'ALRIO' },
  { sede: 'NUBE AKT VICTOR MOTOS SAN ALBERTO', codigo: 'ALRIO' },
];

/* ══════════════════════════════════════════════════════
   3. DATOS EN MEMORIA (cargados desde backend)
   ══════════════════════════════════════════════════════ */
let datosUsuarios   = [];  // [{cedula, nombreUsuario}]
let datosInventario = [];  // [{serial, etiqueta, fabricante, modelo}]
let inventarioListo = Promise.resolve();
let recargaInventarioEnVuelo = null;
let busquedaSerialGen = 0;
let modoFormulario = 'clasico';

/* ══════════════════════════════════════════════════════
   4. INICIALIZACIÓN
   ══════════════════════════════════════════════════════ */
renderBanner();
renderInfoUsuario();
inventarioListo = cargarDatosIniciales();
registrarEventosSidebar();
initCambiarClave(() => tokenGuardado);
abrirPanelDesdeQuery();

/* ── Renderiza datos del usuario en el sidebar ─────── */
function toTitleCase(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function obtenerCargoUsuario() {
  return usuarioActual.cargo || usuarioActual.rol || '';
}

function renderUltimoAccesoSidebar() {
  const el = document.getElementById('user-ultimo-acceso');
  if (!el) return;

  const anterior = sessionStorage.getItem('ultimoAccesoAnterior');
  if (!anterior) {
    el.textContent = 'Primer ingreso en este equipo';
    return;
  }

  const fmt = formatearUltimoAcceso(anterior);
  el.textContent = fmt ? `Último acceso: ${fmt}` : '';
}

function renderInfoUsuario() {
  const { nombreCompleto, correo } = usuarioActual;
  const cargo = toTitleCase(obtenerCargoUsuario());

  document.getElementById('user-nombre').textContent = nombreCompleto || '—';
  document.getElementById('user-correo').textContent = correo || usuarioActual.cedula || '—';
  document.getElementById('user-rol').textContent    = cargo || '—';
  renderUltimoAccesoSidebar();

  const avatarEl = document.getElementById('user-avatar');
  avatarEl.textContent = (nombreCompleto || 'U').charAt(0).toUpperCase();

  document.documentElement.classList.toggle('rol-admin', esAdministrador());
}

/* ── Carga datos maestros al iniciar ───────────────── */
async function recargarInventario() {
  if (recargaInventarioEnVuelo) return recargaInventarioEnVuelo;

  recargaInventarioEnVuelo = (async () => {
    try {
      const res = await fetch('/api/inventario', {
        headers: { Authorization: `Bearer ${tokenGuardado}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          datosInventario = data;
          return true;
        }
      }
      console.error('Error recargando inventario:', res.status);
      return false;
    } catch (err) {
      console.error('Error recargando inventario:', err);
      return false;
    } finally {
      recargaInventarioEnVuelo = null;
    }
  })();

  return recargaInventarioEnVuelo;
}

async function cargarDatosIniciales() {
  try {
    const [resUsuarios, okInventario] = await Promise.all([
      fetch('/api/usuarios', { headers: { Authorization: `Bearer ${tokenGuardado}` } }),
      recargarInventario(),
    ]);

    if (resUsuarios.ok) datosUsuarios = await resUsuarios.json();

    if (!okInventario || datosInventario.length === 0) {
      toast('No se pudo cargar el inventario.', 'advertencia');
    }

    console.log(`Cargados: ${datosUsuarios.length} usuarios, ${datosInventario.length} equipos de inventario`);
  } catch (err) {
    console.error('Error cargando datos iniciales:', err);
    toast('No se pudieron cargar algunos datos maestros. Revisa la conexión.', 'advertencia');
  }
}

/* ══════════════════════════════════════════════════════
   5. EVENTOS DEL SIDEBAR
   ══════════════════════════════════════════════════════ */
function registrarEventosSidebar() {
  document.getElementById('btn-diagnostico').addEventListener('click', (e) => {
    e.preventDefault();
    activarBotonSidebar('btn-diagnostico');
    setPanelActivo('diagnostico');
    renderFormularioDiagnostico();
  });

  const btnDiagnosticoBeta = document.getElementById('btn-diagnostico-beta');
  if (btnDiagnosticoBeta) {
    btnDiagnosticoBeta.addEventListener('click', (e) => {
      e.preventDefault();
      activarBotonSidebar('btn-diagnostico-beta');
      setPanelActivo('diagnostico-beta');
      renderFormularioDiagnostico('beta');
    });
  }

  const btnUsuarios = document.getElementById('btn-usuarios');
  if (btnUsuarios && esAdministrador()) {
    btnUsuarios.addEventListener('click', () => {
      activarBotonSidebar('btn-usuarios');
      setPanelActivo('usuarios');
      renderPanelUsuarios(tokenGuardado);
    });
  }

  const btnReportes = document.getElementById('btn-reportes');
  if (btnReportes && esAdministrador()) {
    btnReportes.addEventListener('click', () => {
      activarBotonSidebar('btn-reportes');
      setPanelActivo('reportes');
      renderPanelNoticias(tokenGuardado);
    });
  }

  const btnActas = document.getElementById('btn-actas');
  if (btnActas) {
    btnActas.addEventListener('click', () => {
      window.location.href = '/pages/actas.html';
    });
  }

  const btnVideoconferencia = document.getElementById('btn-videoconferencia');
  if (btnVideoconferencia) {
    btnVideoconferencia.addEventListener('click', () => {
      window.location.href = '/pages/conferencia.html';
    });
  }

  document.getElementById('btn-cerrar-sesion').addEventListener('click', cerrarSesion);
}

function abrirPanelDesdeQuery() {
  const panel = new URLSearchParams(window.location.search).get('panel');
  if (!panel) return;

  history.replaceState(null, '', window.location.pathname);

  if (panel === 'diagnostico') {
    activarBotonSidebar('btn-diagnostico');
    setPanelActivo('diagnostico');
    renderFormularioDiagnostico();
    return;
  }

  if (panel === 'diagnostico-beta') {
    activarBotonSidebar('btn-diagnostico-beta');
    setPanelActivo('diagnostico-beta');
    renderFormularioDiagnostico('beta');
    return;
  }

  if (panel === 'usuarios' && esAdministrador()) {
    activarBotonSidebar('btn-usuarios');
    setPanelActivo('usuarios');
    renderPanelUsuarios(tokenGuardado);
    return;
  }

  if (panel === 'reportes' && esAdministrador()) {
    activarBotonSidebar('btn-reportes');
    setPanelActivo('reportes');
    renderPanelNoticias(tokenGuardado);
  }
}

function setPanelActivo(nombre) {
  const panel = document.getElementById('panel-principal');
  if (panel) panel.dataset.panelActivo = nombre;
}

function mostrarPantallaBienvenida() {
  evidenciasAdjuntas = [];
  modoFormulario = 'clasico';
  const panel = document.getElementById('panel-principal');
  if (!panel) return;
  panel.innerHTML = `
      <div class="panel-bienvenida" id="panel-bienvenida">
        <div class="panel-bienvenida__icono">📋</div>
        <h2>Panel de Diagnóstico</h2>
        <p>Haz clic en <strong>Diagnóstico</strong> en el menú lateral para abrir el formulario.</p>
      </div>
  `;
  setPanelActivo('bienvenida');
  document.getElementById('btn-diagnostico')?.classList.remove('sidebar__btn--activo');
  document.getElementById('btn-diagnostico-beta')?.classList.remove('sidebar__btn--activo');
}

function activarBotonSidebar(idActivo) {
  document.querySelectorAll('.sidebar__btn:not(.sidebar__btn--peligro):not(.sidebar__btn--secundario)').forEach(btn => {
    btn.classList.toggle('sidebar__btn--activo', btn.id === idActivo);
  });
}

function cerrarSesion() {
  cerrarSesionStorage();
  toast('Su sesión ha sido cerrada con éxito.', 'exito');
  setTimeout(() => window.location.replace('/pages/index.html'), 1400);
}

/* ══════════════════════════════════════════════════════
   6. FUNCIONES DE BÚSQUEDA / AUTOCOMPLETADO
   ══════════════════════════════════════════════════════ */

/** Busca nombre de usuario por cédula (comparación exacta como string) */
function buscarPorCedula(cedula) {
  const limpio = String(cedula).trim();
  const encontrado = datosUsuarios.find(u => String(u.cedula).trim() === limpio);
  return encontrado ? encontrado.nombreUsuario : null;
}

function normalizarSerialBusqueda(value) {
  let s = String(value ?? '').replace(/\s+/g, '').trim();
  if (/^[+-]?\d*\.?\d+[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && Number.isSafeInteger(n)) s = String(n);
  }
  return s.toLowerCase();
}

/** Busca equipo por serial (comparación case-insensitive). Retorna objeto o null. */
function buscarEquipoPorSerial(serial) {
  const limpio = normalizarSerialBusqueda(serial);
  if (!limpio) return null;
  const encontrado = datosInventario.find(
    e => normalizarSerialBusqueda(e.serial) === limpio
  );
  return encontrado || null;
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

/** Marca inputs de equipo como solo lectura (autocompletados por serial). */
const CAMPOS_EQUIPO_SERIAL = [
  'marca', 'modelo', 'etiqueta',
  'procesador', 'version-so', 'ram', 'nombre-equipo', 'sistema-operativo', 'hd',
];

function valorONoAplica(value) {
  const s = String(value ?? '').trim();
  return s || 'No Aplica';
}

function bloquearCamposEquipo() {
  CAMPOS_EQUIPO_SERIAL.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.readOnly = true;
    el.style.background = 'var(--color-gris-fondo, #f0f4ff)';
    el.style.cursor = 'default';
  });
}

/** Limpia Marca, Modelo y Etiqueta tras cambio o serial no encontrado. */
function limpiarCamposEquipo() {
  ['serial', ...CAMPOS_EQUIPO_SERIAL].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function aplicarEquipoEnFormulario(equipo) {
  const serialEl = document.getElementById('serial');
  if (serialEl) serialEl.value = String(equipo.serial || '').toUpperCase();
  document.getElementById('marca').value    = (equipo.fabricante || '').toUpperCase();
  document.getElementById('modelo').value   = (equipo.modelo || '').toUpperCase();
  document.getElementById('etiqueta').value = equipo.etiqueta || '';
  document.getElementById('procesador').value = valorONoAplica(equipo.procesador);
  document.getElementById('version-so').value = valorONoAplica(equipo.versionSO);
  document.getElementById('ram').value = valorONoAplica(equipo.ram);
  document.getElementById('nombre-equipo').value = valorONoAplica(equipo.nombreEquipo);
  document.getElementById('sistema-operativo').value = valorONoAplica(equipo.sistemaOperativo);
  document.getElementById('hd').value = valorONoAplica(equipo.hd);

  ['busqueda-equipo', 'marca', 'modelo', 'etiqueta', 'serial', ...CAMPOS_EQUIPO_SERIAL].forEach(id => {
    const el = document.getElementById(id);
    if (el) limpiarInvalido(el);
  });
}

/**
 * Autocompleta el equipo según serial o etiqueta del buscador.
 * @returns {Promise<boolean>}
 */
async function autocompletarEquipoPorSerial(consulta, { reintentar = true } = {}) {
  const gen = ++busquedaSerialGen;
  const inputBusqueda = document.getElementById('busqueda-equipo');
  await inventarioListo;
  if (gen !== busquedaSerialGen) return false;

  if (datosInventario.length === 0) {
    await recargarInventario();
    if (gen !== busquedaSerialGen) return false;
    if (datosInventario.length === 0) {
      toast('No se pudo cargar el inventario.', 'error');
      return false;
    }
  }

  let resultado = buscarEquipoEnInventario(consulta);

  if (resultado.motivo === 'no-encontrado' && reintentar) {
    await recargarInventario();
    if (gen !== busquedaSerialGen) return false;
    resultado = buscarEquipoEnInventario(consulta);
  }

  if (gen !== busquedaSerialGen) return false;

  if (!resultado.ok) {
    limpiarCamposEquipo();
    if (inputBusqueda) marcarInvalido(inputBusqueda);
    if (resultado.motivo === 'vacio') {
      toast('Escribe el serial o la etiqueta para buscar.', 'advertencia');
    } else if (resultado.motivo === 'ambiguo') {
      toast('Hay más de un equipo con ese dato. Usa un serial o etiqueta único.', 'advertencia');
    } else {
      toast('No se encontró ese serial o etiqueta en el inventario.', 'error');
    }
    return false;
  }

  if (gen !== busquedaSerialGen) return false;
  aplicarEquipoEnFormulario(resultado.equipo);
  return true;
}

async function ejecutarBusquedaEquipo() {
  const inputBusqueda = document.getElementById('busqueda-equipo');
  const consulta = inputBusqueda ? inputBusqueda.value.trim() : '';
  if (!consulta) {
    busquedaSerialGen += 1;
    limpiarCamposEquipo();
    if (inputBusqueda) marcarInvalido(inputBusqueda);
    toast('Escribe el serial o la etiqueta para buscar.', 'advertencia');
    return;
  }
  await autocompletarEquipoPorSerial(consulta);
}

function borrarBusquedaEquipo() {
  busquedaSerialGen += 1;
  const inputBusqueda = document.getElementById('busqueda-equipo');
  if (inputBusqueda) {
    inputBusqueda.value = '';
    limpiarInvalido(inputBusqueda);
  }
  limpiarCamposEquipo();
  ['serial', ...CAMPOS_EQUIPO_SERIAL].forEach((id) => {
    const el = document.getElementById(id);
    if (el) limpiarInvalido(el);
  });
}

/* ══════════════════════════════════════════════════════
   7. RENDERIZADO DEL FORMULARIO DINÁMICO
   ══════════════════════════════════════════════════════ */

function seccionDiagnosticoClasico() {
  return `
      <fieldset class="seccion">
        <legend>Diagnóstico</legend>
        ${renderDiagnosticoInteractivo()}
      </fieldset>
  `;
}

function bloqueTextareaConIA({ textareaId, previewId, label, name, placeholder, contexto }) {
  return `
        <div class="campo campo-full">
          <label for="${textareaId}">${label} *</label>
          <textarea id="${textareaId}" name="${name}" rows="4" required
            placeholder="${placeholder}"></textarea>
          <button type="button" class="btn btn--outline btn-mejorar-ia"
            data-textarea="${textareaId}" data-preview="${previewId}" data-contexto="${esc(contexto)}">
            Mejorar con IA
          </button>
          <p class="ia-preview-label">Vista previa</p>
          <div class="ia-preview" id="${previewId}" data-ia-ready="0" aria-live="polite"></div>
        </div>
  `;
}

function seccionDiagnosticoBeta() {
  return `
      <fieldset class="seccion">
        <legend>DESCRIBA LA FALLA QUE PRESENTA EL EQUIPO</legend>
        ${bloqueTextareaConIA({
          textareaId: 'descripcion-falla',
          previewId: 'ia-preview-descripcion-falla',
          label: 'Descripción de la falla',
          name: 'descripcionFalla',
          placeholder: 'Describa la falla que presenta el equipo',
          contexto: 'DESCRIBA LA FALLA QUE PRESENTA EL EQUIPO',
        })}
      </fieldset>

      <fieldset class="seccion">
        <legend>ACCIONES REALIZADAS PARA TRATAR DE SOLUCIONAR LA FALLA</legend>
        ${bloqueTextareaConIA({
          textareaId: 'acciones-realizadas',
          previewId: 'ia-preview-acciones-realizadas',
          label: 'Acciones realizadas',
          name: 'accionesRealizadas',
          placeholder: 'Describa las acciones realizadas para tratar de solucionar la falla',
          contexto: 'ACCIONES REALIZADAS PARA TRATAR DE SOLUCIONAR LA FALLA',
        })}
      </fieldset>

      <fieldset class="seccion">
        <legend>DESCRIBA EL DIAGNOSTICO LUEGO DE LAS ACCIONES REALIZADAS</legend>
        ${bloqueTextareaConIA({
          textareaId: 'diagnostico-final',
          previewId: 'ia-preview-diagnostico-final',
          label: 'Diagnóstico',
          name: 'diagnosticoFinal',
          placeholder: 'Describa el diagnóstico luego de las acciones realizadas',
          contexto: 'DESCRIBA EL DIAGNOSTICO LUEGO DE LAS ACCIONES REALIZADAS',
        })}
      </fieldset>
  `;
}

function renderFormularioDiagnostico(modo = 'clasico') {
  modoFormulario = modo === 'beta' ? 'beta' : 'clasico';
  const panel = document.getElementById('panel-principal');
  setPanelActivo(modoFormulario === 'beta' ? 'diagnostico-beta' : 'diagnostico');

  const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const cmpEs = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });
  const opsSedes = [...SEDES_CODIGOS]
    .sort((a, b) => cmpEs(a.sede, b.sede))
    .map(s => `<option value="${esc(s.sede)}">${esc(s.sede)}</option>`)
    .join('');
  const opsCodigos = [...SEDES_CODIGOS]
    .sort((a, b) => cmpEs(a.codigo, b.codigo))
    .map(s => `<option value="${esc(s.codigo)}">${esc(s.codigo)}</option>`)
    .join('');

  panel.innerHTML = `
    <form id="form-diagnostico" class="formulario-diagnostico" novalidate>
      <h2>${modoFormulario === 'beta' ? 'Formulario de Diagnóstico IA' : 'Formulario de Diagnóstico - Soporte en Sitio'}</h2>

      <!-- ═══════════ SECCIÓN: INFORMACIÓN GENERAL ═════════════ -->
      <fieldset class="seccion">
        <legend>Información General</legend>
        <div class="campos-grid">
          <div class="campo">
            <label for="sede">Sede *</label>
            <select id="sede" name="sede" required>
              <option value="">— Selecciona —</option>
              ${opsSedes}
            </select>
          </div>
          <div class="campo">
            <label for="fecha">Fecha *</label>
            <input type="date" id="fecha" name="fecha" value="${hoy}" readonly required>
          </div>
          <div class="campo">
            <label for="cedula-usuario">Cédula usuario *</label>
            <input type="number" id="cedula-usuario" name="cedulaUsuario" placeholder="Ej: 12345678" required>
          </div>
          <div class="campo">
            <label for="nombre-usuario">Nombre usuario *</label>
            <input type="text" id="nombre-usuario" name="nombreUsuario" placeholder="Se autocompleta por cédula" readonly required>
          </div>
          <div class="campo campo-full">
            <label for="area-usuario">Área del usuario *</label>
            <input type="text" id="area-usuario" name="areaUsuario" placeholder="Ej: Sistemas, Contabilidad…" required>
          </div>
        </div>
      </fieldset>

      <!-- ═══════════ SECCIÓN: INFORMACIÓN DEL EQUIPO ═══════════ -->
      <fieldset class="seccion">
        <legend>Información del Equipo</legend>
        <div class="campos-grid">
          <div class="campo campo-full campo-busqueda-equipo">
            <label for="busqueda-equipo">Buscar equipo *</label>
            <div class="campo-busqueda-equipo__fila">
              <input type="text" id="busqueda-equipo" name="busquedaEquipo"
                placeholder="Serial o etiqueta" autocomplete="off">
              <button type="button" class="btn btn--primario" id="btn-buscar-equipo">Buscar</button>
              <button type="button" class="btn btn--outline" id="btn-borrar-equipo">Borrar</button>
            </div>
          </div>
          <div class="campo">
            <label for="marca">Marca *</label>
            <input type="text" id="marca" name="marca" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="serial">Serial *</label>
            <input type="text" id="serial" name="serial" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="modelo">Modelo *</label>
            <input type="text" id="modelo" name="modelo" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="etiqueta">Etiqueta o Placa *</label>
            <input type="text" id="etiqueta" name="etiqueta" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="procesador">Procesador *</label>
            <input type="text" id="procesador" name="procesador" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="version-so">Versión SO *</label>
            <input type="text" id="version-so" name="versionSO" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="ram">RAM *</label>
            <input type="text" id="ram" name="ram" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="nombre-equipo">Nombre del equipo *</label>
            <input type="text" id="nombre-equipo" name="nombreEquipo" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="sistema-operativo">Sistema Operativo *</label>
            <input type="text" id="sistema-operativo" name="sistemaOperativo" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="hd">HD *</label>
            <input type="text" id="hd" name="hd" placeholder="Se autocompleta por serial" readonly required>
          </div>
          <div class="campo">
            <label for="version-office">Versión de Office *</label>
            <select id="version-office" name="versionOffice" required>
              <option value="">— Selecciona —</option>
              <option>Office 365</option>
              <option>No Aplica</option>
            </select>
          </div>
          <div class="campo">
            <label for="ubicacion-fisica">Ubicación física *</label>
            <select id="ubicacion-fisica" name="ubicacionFisica" required>
              <option value="">— Selecciona código —</option>
              ${opsCodigos}
            </select>
          </div>
        </div>
      </fieldset>

      <!-- ═══════════ SECCIÓN: APLICACIONES ════════════════════ -->
      <fieldset class="seccion">
        <legend>Aplicaciones</legend>
        <div class="campos-grid">
          <div class="campo">
            <label for="apps-mayor-uso">Aplicaciones de mayor uso *</label>
            <input type="text" id="apps-mayor-uso" name="appsMayorUso" placeholder="Ej: SAP, Chrome, Office…" required>
          </div>
          <div class="campo">
            <label for="apps-fuera-estandar">Aplicaciones Fuera del Estandar *</label>
            <input type="text" id="apps-fuera-estandar" name="appsFueraEstandar" placeholder="Ej: Dropbox, TeamViewer…" required>
          </div>
        </div>
      </fieldset>

      ${modoFormulario === 'beta' ? seccionDiagnosticoBeta() : seccionDiagnosticoClasico()}

      <!-- ═══════════ SECCIÓN: EVIDENCIAS (opcional) ═══════════ -->
      <fieldset class="seccion">
        <legend>Evidencias de falla (opcional)</legend>
        <div class="campo campo-full">
          <label for="evidencias-input">Adjuntar imágenes (máx. 3)</label>
          <input type="file" id="evidencias-input" accept="image/*" multiple>
          <p class="evidencias-ayuda">Se redimensionan a 1600px y aparecen en una página adicional del PDF.</p>
          <div class="evidencias-preview" id="evidencias-preview"></div>
        </div>
      </fieldset>

      <!-- ═══════════ SECCIÓN: DATOS DEL TÉCNICO ════════════════ -->
      <fieldset class="seccion">
        <legend>Datos del Técnico</legend>
        <div class="campos-grid">
          <div class="campo">
            <label for="nombre-tecnico">Nombre técnico *</label>
            <input type="text" id="nombre-tecnico" name="nombreTecnico" placeholder="Nombre completo del técnico" required>
          </div>
          <div class="campo">
            <label for="cedula-tecnico">Cédula técnico *</label>
            <input type="number" id="cedula-tecnico" name="cedulaTecnico" placeholder="Número de cédula" required>
          </div>
          <div class="campo campo-full">
            <label for="cargo-tecnico">Cargo técnico *</label>
            <input type="text" id="cargo-tecnico" name="cargoTecnico" placeholder="Ej: Técnico de Soporte" required>
          </div>
          <div class="campo campo-full" id="firma-bloque">
            <label>Firma * <small style="font-weight:400;text-transform:none;">(dibuja con mouse/dedo <strong>o</strong> carga una imagen)</small></label>
            <div class="firma-tabs">
              <button type="button" class="firma-tab firma-tab--activo" id="tab-dibujar">Dibujar firma</button>
              <button type="button" class="firma-tab" id="tab-cargar">Cargar imagen</button>
            </div>
            <!-- Panel: dibujar -->
            <div class="firma-panel" id="panel-dibujar">
              <canvas id="firma-canvas" width="400" height="110"
                style="border:1.5px solid var(--color-gris-borde);border-radius:4px;background:#fff;cursor:crosshair;touch-action:none;display:block;"></canvas>
              <div style="display:flex;gap:8px;margin-top:6px;">
                <button type="button" class="btn btn--outline" id="btn-limpiar-canvas" style="padding:5px 12px;font-size:12px;">Limpiar</button>
                <span style="font-size:11px;color:var(--color-gris-medio);align-self:center;">Dibuja tu firma arriba</span>
              </div>
            </div>
            <!-- Panel: cargar imagen -->
            <div class="firma-panel" id="panel-cargar" style="display:none;">
              <input type="file" id="firma-archivo" accept="image/*">
              <img id="firma-preview" class="firma-preview-img" src="" alt="Vista previa de la firma">
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ═══════════ BOTONES ═══════════════════════════════════ -->
      <div class="formulario-diagnostico__footer">
        <button type="submit" class="btn btn--primario" id="btn-generar">
          Generar PDF
        </button>
        <button type="button" class="btn btn--outline" id="btn-limpiar">
          Limpiar formulario
        </button>
      </div>
    </form>
  `;

  // Registrar todos los eventos del formulario
  registrarEventosFormulario();
  bloquearCamposEquipo();
  initEvidenciasInput();
  autocompletarDatosTecnico();
  setTimeout(() => autocompletarDatosTecnico(), 0);
}

const CAMPOS_IA_BETA = [
  { textareaId: 'descripcion-falla', previewId: 'ia-preview-descripcion-falla', nombre: 'Vista previa de la falla' },
  { textareaId: 'acciones-realizadas', previewId: 'ia-preview-acciones-realizadas', nombre: 'Vista previa de las acciones' },
  { textareaId: 'diagnostico-final', previewId: 'ia-preview-diagnostico-final', nombre: 'Vista previa del diagnóstico' },
];

const iaRequests = new Map();

function limpiarPreviewIA(preview) {
  if (!preview) return;
  preview.textContent = '';
  preview.dataset.iaReady = '0';
  preview.classList.remove('invalido');
}

function limpiarPreviewsIA() {
  CAMPOS_IA_BETA.forEach(({ previewId }) => {
    limpiarPreviewIA(document.getElementById(previewId));
  });
}

function textoPreviewIA(previewId) {
  const el = document.getElementById(previewId);
  if (!el || el.dataset.iaReady !== '1') return '';
  return (el.textContent || '').trim();
}

async function mejorarConIA({ textareaId, previewId, contexto }) {
  const textarea = document.getElementById(textareaId);
  const preview = document.getElementById(previewId);
  if (!textarea || !preview) return;

  const borrador = textarea.value.trim();
  if (!borrador) {
    toast('Escribe el texto de esta sección antes de mejorar con IA.', 'advertencia');
    marcarInvalido(textarea);
    return;
  }

  const previo = iaRequests.get(previewId);
  previo?.controller.abort();
  const controller = new AbortController();
  const gen = (previo?.gen || 0) + 1;
  iaRequests.set(previewId, { controller, gen });

  preview.dataset.iaReady = '0';
  preview.classList.remove('invalido');
  preview.textContent = '⏳ Redactando diagnóstico profesional...';

  const btn = document.querySelector(`.btn-mejorar-ia[data-preview="${previewId}"]`);
  if (btn) btn.disabled = true;

  const esActual = () => iaRequests.get(previewId)?.gen === gen;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (tokenGuardado) headers.Authorization = `Bearer ${tokenGuardado}`;

    const res = await fetch('/api/redactar', {
      method: 'POST',
      headers,
      body: JSON.stringify({ contexto, borrador }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!esActual()) return;
    if (!res.ok) {
      throw new Error(data.error || `Error ${res.status}`);
    }
    preview.textContent = String(data.texto || '').trim();
    preview.dataset.iaReady = '1';
  } catch (err) {
    if (err?.name === 'AbortError') return;
    if (!esActual()) return;
    limpiarPreviewIA(preview);
    toast(err.message || 'No se pudo mejorar el texto con IA.', 'error');
  } finally {
    if (esActual() && btn) btn.disabled = false;
  }
}

function registrarEventosIA() {
  CAMPOS_IA_BETA.forEach(({ textareaId, previewId }) => {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    ta.addEventListener('input', () => {
      const inflight = iaRequests.get(previewId);
      inflight?.controller.abort();
      limpiarPreviewIA(document.getElementById(previewId));
      const btn = document.querySelector(`.btn-mejorar-ia[data-preview="${previewId}"]`);
      if (btn) btn.disabled = false;
    });
  });

  document.querySelectorAll('.btn-mejorar-ia').forEach((btn) => {
    btn.addEventListener('click', () => {
      mejorarConIA({
        textareaId: btn.dataset.textarea,
        previewId: btn.dataset.preview,
        contexto: btn.dataset.contexto || '',
      });
    });
  });
}

/* ══════════════════════════════════════════════════════
   8. EVENTOS DEL FORMULARIO
   ══════════════════════════════════════════════════════ */
function registrarEventosFormulario() {
  // Auto-resize de textareas
  document.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => autoResizeTextarea(ta));
  });

  // Autocompletado: nombre usuario por cédula
  const inputCedula = document.getElementById('cedula-usuario');
  inputCedula.addEventListener('blur', () => {
    const cedula = inputCedula.value.trim();
    if (!cedula) return;

    const nombre = buscarPorCedula(cedula);
    const campoNombre = document.getElementById('nombre-usuario');
    if (nombre) {
      campoNombre.value = nombre;
    } else {
      campoNombre.value = '';
      toast('No se encontró usuario con esa cédula en el directorio.', 'info');
    }
  });

  const formDiag = document.getElementById('form-diagnostico');
  formDiag?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !formDiag.contains(btn)) return;
    if (btn.id === 'btn-buscar-equipo') {
      e.preventDefault();
      e.stopPropagation();
      ejecutarBusquedaEquipo();
    }
    if (btn.id === 'btn-borrar-equipo') {
      e.preventDefault();
      e.stopPropagation();
      borrarBusquedaEquipo();
    }
  });
  formDiag?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target?.id !== 'busqueda-equipo') return;
    e.preventDefault();
    ejecutarBusquedaEquipo();
  });

  if (modoFormulario === 'clasico') {
    initDiagnosticoInteractivo();
  } else {
    registrarEventosIA();
  }
  autocompletarDatosTecnico();

  // ── Tabs firma ────────────────────────────────────
  document.getElementById('tab-dibujar').addEventListener('click', () => {
    document.getElementById('panel-dibujar').style.display = '';
    document.getElementById('panel-cargar').style.display = 'none';
    document.getElementById('tab-dibujar').classList.add('firma-tab--activo');
    document.getElementById('tab-cargar').classList.remove('firma-tab--activo');
  });
  document.getElementById('tab-cargar').addEventListener('click', () => {
    document.getElementById('panel-cargar').style.display = '';
    document.getElementById('panel-dibujar').style.display = 'none';
    document.getElementById('tab-cargar').classList.add('firma-tab--activo');
    document.getElementById('tab-dibujar').classList.remove('firma-tab--activo');
  });

  // ── Canvas de firma (mouse + touch) ──────────────
  iniciarCanvasFirma();

  // ── Preview de firma desde archivo ───────────────
  document.getElementById('firma-archivo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = document.getElementById('firma-preview');
      preview.src = ev.target.result;
      preview.classList.add('visible');
    };
    reader.readAsDataURL(file);
  });

  // ── Limpiar canvas ────────────────────────────────
  document.getElementById('btn-limpiar-canvas').addEventListener('click', () => {
    const canvas = document.getElementById('firma-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  });

  // Limpiar formulario completo
  document.getElementById('btn-limpiar').addEventListener('click', () => {
    document.getElementById('form-diagnostico').reset();
    const preview = document.getElementById('firma-preview');
    if (preview) preview.classList.remove('visible');
    const canvas = document.getElementById('firma-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    document.querySelectorAll('.invalido').forEach(el => el.classList.remove('invalido'));
    document.getElementById('fecha').value = new Date().toISOString().split('T')[0];
    limpiarCamposEquipo();
    bloquearCamposEquipo();
    if (modoFormulario === 'clasico') {
      resetDiagnosticoInteractivo();
    } else {
      limpiarPreviewsIA();
    }
    evidenciasAdjuntas = [];
    renderEvidenciasPreview();
    autocompletarDatosTecnico();
    toast('Formulario limpiado.', 'info');
  });

  // Submit → generar PDF
  document.getElementById('form-diagnostico').addEventListener('submit', (e) => {
    e.preventDefault();
    generarPDF();
  });
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/** Inicializa el canvas de firma con soporte mouse y touch */
function iniciarCanvasFirma() {
  const canvas = document.getElementById('firma-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let dibujando = false;

  function getPunto(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function iniciar(e) {
    e.preventDefault();
    dibujando = true;
    const p = getPunto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function dibujar(e) {
    if (!dibujando) return;
    e.preventDefault();
    const p = getPunto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function terminar(e) {
    e.preventDefault();
    dibujando = false;
  }

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', dibujar);
  canvas.addEventListener('mouseup', terminar);
  canvas.addEventListener('mouseleave', terminar);
  canvas.addEventListener('touchstart', iniciar, { passive: false });
  canvas.addEventListener('touchmove', dibujar, { passive: false });
  canvas.addEventListener('touchend', terminar, { passive: false });
}

function marcarInvalido(el) {
  el.classList.add('invalido');
}
function limpiarInvalido(el) {
  el.classList.remove('invalido');
}

/* ══════════════════════════════════════════════════════
   AUTOCOMPLETADO DATOS TÉCNICO
   ══════════════════════════════════════════════════════ */

function bloquearCampoTecnico(id, valor, bloquear) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = valor ?? '';
  if (bloquear) {
    el.readOnly = true;
    el.style.background = 'var(--color-gris-fondo, #f5f5f5)';
    el.style.cursor = 'default';
  }
}

/**
 * Autocompleta y bloquea nombre, cédula y cargo del técnico según sesión.
 */
function autocompletarDatosTecnico() {
  const fresco = usuarioDesdeSesion(leerSesion());
  if (fresco.nombreCompleto || fresco.cedula || fresco.cargo || fresco.rol) {
    usuarioActual = {
      ...usuarioActual,
      ...fresco,
      nombreCompleto: fresco.nombreCompleto || usuarioActual.nombreCompleto || '',
      cedula: fresco.cedula || usuarioActual.cedula || '',
      cargo: fresco.cargo || fresco.rol || usuarioActual.cargo || usuarioActual.rol || '',
      rol: fresco.rol || usuarioActual.rol || '',
    };
  }

  const cargo = usuarioActual.cargo || usuarioActual.rol || '';
  bloquearCampoTecnico('nombre-tecnico', usuarioActual.nombreCompleto || '', true);
  bloquearCampoTecnico('cedula-tecnico', usuarioActual.cedula || '', true);
  bloquearCampoTecnico('cargo-tecnico', cargo, true);
}

/* ══════════════════════════════════════════════════════
   EVIDENCIAS DE FALLA (opcional)
   ══════════════════════════════════════════════════════ */

function redimensionarImagen(file, maxSize = 1600) {
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
      resolve(canvas.toDataURL('image/jpeg', 0.9));
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
      <img src="${ev.dataUrl}" alt="${ev.name}">
      <button type="button" class="evidencia-quitar" data-idx="${i}" aria-label="Quitar imagen">×</button>
    </div>
  `).join('');

  container.querySelectorAll('.evidencia-quitar').forEach(btn => {
    btn.addEventListener('click', () => {
      evidenciasAdjuntas.splice(Number(btn.dataset.idx), 1);
      renderEvidenciasPreview();
    });
  });
}

function initEvidenciasInput() {
  const input = document.getElementById('evidencias-input');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;

    const espacio = MAX_EVIDENCIAS - evidenciasAdjuntas.length;
    if (espacio <= 0) {
      toast('Máximo 3 imágenes de evidencia.', 'advertencia');
      return;
    }

    const aProcesar = files.slice(0, espacio);
    if (files.length > espacio) {
      toast(`Solo se agregaron ${espacio} imagen(es). Máximo 3.`, 'advertencia');
    }

    for (const file of aProcesar) {
      if (!file.type.startsWith('image/')) {
        toast(`${file.name} no es una imagen válida.`, 'advertencia');
        continue;
      }
      try {
        const dataUrl = await redimensionarImagen(file);
        evidenciasAdjuntas.push({ name: file.name, dataUrl });
      } catch {
        toast(`No se pudo procesar ${file.name}.`, 'error');
      }
    }
    renderEvidenciasPreview();
  });
}

/* ══════════════════════════════════════════════════════
   9. VALIDACIÓN DEL FORMULARIO
   ══════════════════════════════════════════════════════ */
async function validarFormulario() {
  let valido = true;
  const errores = [];

  // Limpiar estado previo
  document.querySelectorAll('.invalido').forEach(el => el.classList.remove('invalido'));

  const requeridos = [
    { id: 'sede',              nombre: 'Sede' },
    { id: 'cedula-usuario',    nombre: 'Cédula usuario' },
    { id: 'nombre-usuario',    nombre: 'Nombre usuario' },
    { id: 'area-usuario',      nombre: 'Área del usuario' },
    { id: 'ubicacion-fisica',  nombre: 'Ubicación física' },
    { id: 'marca',             nombre: 'Marca' },
    { id: 'serial',            nombre: 'Serial' },
    { id: 'modelo',            nombre: 'Modelo' },
    { id: 'etiqueta',          nombre: 'Etiqueta' },
    { id: 'procesador',        nombre: 'Procesador' },
    { id: 'version-so',        nombre: 'Versión SO' },
    { id: 'ram',               nombre: 'RAM' },
    { id: 'nombre-equipo',     nombre: 'Nombre del equipo' },
    { id: 'sistema-operativo', nombre: 'Sistema Operativo' },
    { id: 'version-office',    nombre: 'Versión de Office' },
    { id: 'hd',                nombre: 'HD' },
    { id: 'apps-mayor-uso',    nombre: 'Aplicaciones de mayor uso' },
    { id: 'apps-fuera-estandar', nombre: 'Aplicaciones fuera del estándar' },
    { id: 'nombre-tecnico',    nombre: 'Nombre técnico' },
    { id: 'cedula-tecnico',    nombre: 'Cédula técnico' },
    { id: 'cargo-tecnico',     nombre: 'Cargo técnico' },
  ];

  if (modoFormulario === 'beta') {
    requeridos.push(
      { id: 'descripcion-falla', nombre: 'Descripción de la falla' },
      { id: 'acciones-realizadas', nombre: 'Acciones realizadas' },
      { id: 'diagnostico-final', nombre: 'Diagnóstico' },
    );
  }

  requeridos.forEach(({ id, nombre }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value.trim();
    if (!val) {
      marcarInvalido(el);
      if (id === 'serial') {
        const busqueda = document.getElementById('busqueda-equipo');
        if (busqueda) marcarInvalido(busqueda);
      }
      errores.push(nombre);
      valido = false;
    }
  });

  if (modoFormulario === 'beta') {
    const faltanIA = [];
    CAMPOS_IA_BETA.forEach(({ previewId, nombre }) => {
      const preview = document.getElementById(previewId);
      if (!textoPreviewIA(previewId)) {
        if (preview) preview.classList.add('invalido');
        faltanIA.push(nombre);
        valido = false;
      }
    });
    if (faltanIA.length) {
      toast('Usa «Mejorar con IA» en las tres secciones. El PDF usa solo esa vista previa.', 'error');
    }
  }

  // Validar que el serial exista en inventario (bloquea PDF si no existe)
  const serialEl = document.getElementById('serial');
  const serialVal = serialEl.value.trim();
  if (serialVal) {
    await inventarioListo;
    let equipoSerial = buscarEquipoPorSerial(serialVal);
    if (!equipoSerial && datosInventario.length === 0) {
      await recargarInventario();
      equipoSerial = buscarEquipoPorSerial(serialVal);
    }
    if (!equipoSerial) {
      marcarInvalido(serialEl);
      const busqueda = document.getElementById('busqueda-equipo');
      if (busqueda) marcarInvalido(busqueda);
      toast('El serial no existe en el inventario. No se puede generar el PDF.', 'error');
      valido = false;
    }
  }

  if (modoFormulario === 'clasico') {
    const diagVal = validarDiagnosticoInteractivo();
    if (!diagVal.valido) {
      const bloques = ['diag-bloque-descripcion'];
      if (document.getElementById('diag-tipo')?.value === 'DAAS') {
        bloques.push('diag-bloque-daas');
      } else {
        bloques.push('diag-bloque-acciones');
      }
      bloques.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('invalido');
      });
      toast(diagVal.mensaje, 'error');
      valido = false;
    }
  }

  if (!obtenerFirmaBase64()) {
    const bloqueFirma = document.getElementById('firma-bloque');
    if (bloqueFirma) bloqueFirma.classList.add('invalido');
    toast('La firma es obligatoria: dibújala o carga una imagen.', 'error');
    valido = false;
  }

  if (!valido && errores.length > 0) {
    toast(
      `Completa los campos obligatorios: ${errores.slice(0, 3).join(', ')}${errores.length > 3 ? '…' : ''}.`,
      'error'
    );
  }
  return valido;
}

/* ══════════════════════════════════════════════════════
   10. RECOPILAR VALORES DEL FORMULARIO
   ══════════════════════════════════════════════════════ */
function obtenerFirmaBase64() {
  const canvas = document.getElementById('firma-canvas');
  if (canvas) {
    const panelDibujar = document.getElementById('panel-dibujar');
    const esPanelDibujar = panelDibujar && panelDibujar.style.display !== 'none';
    if (esPanelDibujar) {
      const pixeles = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const tieneTrazo = pixeles.some((v, i) => i % 4 === 3 && v > 0);
      if (tieneTrazo) return canvas.toDataURL('image/png');
    }
  }
  const firmaPreview = document.getElementById('firma-preview');
  if (firmaPreview && firmaPreview.classList.contains('visible') && firmaPreview.src) {
    return firmaPreview.src;
  }
  return '';
}

function esNoAplicaDato(val) {
  const s = String(val ?? '').trim();
  return !s || /^no\s*aplica$/i.test(s);
}

function parseNumeroDato(val) {
  const n = parseFloat(String(val ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function formatearRamPdf(val) {
  const raw = String(val ?? '').trim();
  if (esNoAplicaDato(raw)) return raw || 'No Aplica';
  const n = parseNumeroDato(raw);
  if (!Number.isFinite(n)) return raw;
  if (/gb/i.test(raw) || n < 256) return `${Math.round(n)} GB`;
  return `${Math.round(n / 1024)} GB`;
}

function formatearHdPdf(val) {
  const raw = String(val ?? '').trim();
  if (esNoAplicaDato(raw)) return raw || 'No Aplica';
  const n = parseNumeroDato(raw);
  if (!Number.isFinite(n)) return raw;
  return `${Math.round(n)} GB`;
}

function recopilarValores() {
  const get = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  const firmaBase64 = obtenerFirmaBase64();

  return {
    sede:              get('sede'),
    fecha:             get('fecha'),
    nombreUsuario:     get('nombre-usuario'),
    areaUsuario:       get('area-usuario'),
    cedula:            get('cedula-usuario'),
    ubicacionFisica:   get('ubicacion-fisica'),
    marca:             get('marca').toUpperCase(),
    serial:            get('serial').toUpperCase(),
    modelo:            get('modelo').toUpperCase(),
    etiqueta:          get('etiqueta'),
    procesador:        get('procesador'),
    versionSO:         get('version-so'),
    ram:               formatearRamPdf(get('ram')),
    nombreEquipo:      get('nombre-equipo'),
    sistemaOperativo:  get('sistema-operativo'),
    versionOffice:     get('version-office'),
    hd:                formatearHdPdf(get('hd')),
    appsMayorUso:      get('apps-mayor-uso'),
    appsFueraEstandar: get('apps-fuera-estandar'),
    descripcionFalla:  modoFormulario === 'beta'
      ? textoPreviewIA('ia-preview-descripcion-falla')
      : get('descripcion-falla'),
    accionesRealizadas: modoFormulario === 'beta'
      ? textoPreviewIA('ia-preview-acciones-realizadas')
      : get('acciones-realizadas'),
    diagnosticoFinal:  modoFormulario === 'beta'
      ? textoPreviewIA('ia-preview-diagnostico-final')
      : get('diagnostico-final'),
    nombreTecnico:     get('nombre-tecnico'),
    cedulaTecnico:     get('cedula-tecnico'),
    cargoTecnico:      get('cargo-tecnico'),
    tipoDiagnostico:   modoFormulario === 'beta' ? 'BETA' : get('diag-tipo'),
    sedeCodigo:        SEDES_CODIGOS.find(s => s.sede === get('sede'))?.codigo || '',
    firmaBase64,
    // Campos del test de fabricante no capturados en este formulario
    testFabricanteRealizado: '',
    testFabricanteVersion:   '',
    testFabricanteResultado: '',
    intercambioPartes:       '',
    razonSolicitud:          '',
    evidencias: evidenciasAdjuntas.map(ev => ev.dataUrl),
  };
}

/* ══════════════════════════════════════════════════════
   11. GENERACIÓN DE PDF (servidor — Puppeteer + Handlebars)
   ══════════════════════════════════════════════════════ */

async function generarPDF() {
  if (!(await validarFormulario())) return;

  const btnGenerar = document.getElementById('btn-generar');
  btnGenerar.disabled = true;
  btnGenerar.textContent = 'Generando PDF…';

  try {
    const valores = recopilarValores();
    const headers = { 'Content-Type': 'application/json' };
    if (tokenGuardado) {
      headers.Authorization = `Bearer ${tokenGuardado}`;
    }

    const res = await fetch('/api/generar-pdf', {
      method: 'POST',
      headers,
      body: JSON.stringify(valores),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const blob = await res.blob();
    const fechaStr = valores.fecha.replace(/-/g, '');
    const filename = `diagnostico_${valores.cedula || 'sin_cedula'}_${fechaStr}.pdf`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast('PDF generado y descargado correctamente.', 'exito');
    mostrarPantallaBienvenida();
  } catch (err) {
    console.error('Error generando PDF:', err);
    toast(`Error al generar el PDF: ${err.message || 'Intenta de nuevo.'}`, 'error');
  } finally {
    if (btnGenerar?.isConnected) {
      btnGenerar.disabled = false;
      btnGenerar.textContent = 'Generar PDF';
    }
  }
}

/* ── Escapa HTML para valores en elementos del DOM (opciones de select) ── */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
