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

const usuarioActual = { ...JSON.parse(usuarioGuardado), loginType: 'admin' };

let catalogo = [];
let imagenBase64 = '';
let webcamStream = null;

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (tokenGuardado) headers.Authorization = `Bearer ${tokenGuardado}`;
  return headers;
}

function toTitleCase(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function esMovil() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
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

  const avatarEl = document.getElementById('user-avatar');
  avatarEl.textContent = (nombre || 'U').charAt(0).toUpperCase();

  const esAdmin = esRolAdministrador(usuarioActual.rol);
  setSidebarBtnVisible(document.getElementById('btn-usuarios'), esAdmin);
  setSidebarBtnVisible(document.getElementById('btn-reportes'), esAdmin);
}

function setSidebarBtnVisible(btn, visible) {
  if (!btn) return;
  btn.hidden = !visible;
  btn.style.display = visible ? '' : 'none';
}

function irAPanelUsuario(panel) {
  window.location.href = `/pages/usuario.html?panel=${encodeURIComponent(panel)}`;
}

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
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagen_invalida'));
    };
    img.src = url;
  });
}

function mostrarPreview(dataUrl) {
  imagenBase64 = dataUrl;
  const wrap = document.getElementById('preview-wrap');
  const img = document.getElementById('preview-img');
  img.src = dataUrl;
  wrap.hidden = false;
}

async function procesarArchivo(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('Selecciona una imagen válida.', 'advertencia');
    return;
  }
  try {
    mostrarPreview(await redimensionarImagen(file));
  } catch {
    toast('No se pudo procesar la imagen.', 'error');
  }
}

function llenarSedes() {
  const sel = document.getElementById('sede');
  sel.innerHTML = '<option value="">Seleccione sede</option>';
  catalogo.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.sede;
    opt.textContent = item.sede;
    sel.appendChild(opt);
  });
}

function llenarSalas(sede) {
  const sel = document.getElementById('sala');
  const item = catalogo.find(s => s.sede === sede);
  sel.innerHTML = '<option value="">Seleccione sala</option>';
  if (!item) {
    sel.disabled = true;
    sel.innerHTML = '<option value="">Primero elija la sede</option>';
    return;
  }
  item.salas.forEach(sala => {
    const opt = document.createElement('option');
    opt.value = sala;
    opt.textContent = sala;
    sel.appendChild(opt);
  });
  sel.disabled = false;
}

async function cargarCatalogo() {
  if (!tokenGuardado) {
    toast('Inicia sesión con cédula y contraseña para cargar sedes y subir fotos.', 'advertencia');
    return;
  }
  const res = await fetch('/api/videoconferencia/salas', { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error || 'No se pudo cargar el catálogo de salas.', 'error');
    return;
  }
  const data = await res.json();
  catalogo = data.sedes || [];
  llenarSedes();
  const estado = document.getElementById('onedrive-estado');
  if (!data.onedriveConfigurado) {
    estado.hidden = false;
    estado.textContent = 'OneDrive aún no está configurado en el servidor. Puedes armar la foto, pero la subida fallará hasta autorizar la cuenta Microsoft personal.';
  }
}

async function detenerWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  document.getElementById('webcam-panel').hidden = true;
  const video = document.getElementById('webcam-video');
  video.srcObject = null;
}

async function abrirWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Este navegador no permite usar la webcam.', 'error');
    return;
  }
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      toast('No se pudo activar la cámara. Revisa los permisos del navegador.', 'error');
      return;
    }
  }
  const panel = document.getElementById('webcam-panel');
  const video = document.getElementById('webcam-video');
  video.srcObject = webcamStream;
  panel.hidden = false;
}

function capturarWebcam() {
  const video = document.getElementById('webcam-video');
  if (!video.videoWidth) {
    toast('La cámara aún no está lista.', 'advertencia');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  mostrarPreview(canvas.toDataURL('image/jpeg', 0.85));
  detenerWebcam();
}

function abrirModalReemplazar() {
  const modal = document.getElementById('modal-reemplazar');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function cerrarModalReemplazar() {
  const modal = document.getElementById('modal-reemplazar');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

async function subirFoto(reemplazar = false) {
  const sede = document.getElementById('sede').value.trim();
  const sala = document.getElementById('sala').value.trim();
  if (!sede || !sala) {
    toast('Sede y sala son obligatorias.', 'advertencia');
    return;
  }
  if (!imagenBase64) {
    toast('Toma o adjunta una foto antes de guardar.', 'advertencia');
    return;
  }
  if (!tokenGuardado) {
    toast('Inicia sesión con cédula y contraseña para subir la foto.', 'error');
    return;
  }

  const btn = document.getElementById('btn-subir');
  btn.disabled = true;
  try {
    const res = await fetch('/api/videoconferencia/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        sede,
        sala,
        imagenBase64,
        reemplazar,
        nombreTecnico: usuarioActual.nombreCompleto || '',
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 409 && data.existe) {
      abrirModalReemplazar();
      return;
    }
    if (!res.ok) {
      toast(data.error || 'No se pudo guardar la foto.', 'error');
      return;
    }

    toast('Carga exitosa.', 'exito');
    imagenBase64 = '';
    document.getElementById('preview-wrap').hidden = true;
    document.getElementById('preview-img').src = '';
  } catch {
    toast('Error de conexión al guardar la foto.', 'error');
  } finally {
    btn.disabled = false;
  }
}

function cerrarSesion() {
  cerrarSesionStorage();
  toast('Su sesión ha sido cerrada con éxito.', 'exito');
  setTimeout(() => window.location.replace('/pages/index.html'), 1400);
}

function registrarEventos() {
  document.getElementById('btn-diagnostico').addEventListener('click', () => {
    window.location.href = '/pages/usuario.html?panel=diagnostico';
  });
  document.getElementById('btn-actas')?.addEventListener('click', () => {
    window.location.href = '/pages/actas.html';
  });
  document.getElementById('btn-diagnostico-beta')?.addEventListener('click', () => {
    irAPanelUsuario('diagnostico-beta');
  });
  document.getElementById('btn-usuarios')?.addEventListener('click', () => irAPanelUsuario('usuarios'));
  document.getElementById('btn-reportes')?.addEventListener('click', () => irAPanelUsuario('reportes'));
  document.getElementById('btn-cerrar-sesion').addEventListener('click', cerrarSesion);

  document.getElementById('sede').addEventListener('change', e => {
    llenarSalas(e.target.value);
  });

  document.getElementById('btn-adjuntar').addEventListener('click', () => {
    document.getElementById('input-adjuntar').click();
  });
  document.getElementById('btn-camara').addEventListener('click', () => {
    if (esMovil()) {
      document.getElementById('input-camara').click();
    } else {
      abrirWebcam();
    }
  });

  document.getElementById('input-adjuntar').addEventListener('change', e => {
    procesarArchivo(e.target.files?.[0]);
    e.target.value = '';
  });
  document.getElementById('input-camara').addEventListener('change', e => {
    procesarArchivo(e.target.files?.[0]);
    e.target.value = '';
  });

  document.getElementById('btn-capturar').addEventListener('click', capturarWebcam);
  document.getElementById('btn-cerrar-webcam').addEventListener('click', detenerWebcam);

  document.getElementById('form-conferencia').addEventListener('submit', e => {
    e.preventDefault();
    subirFoto(false);
  });

  document.getElementById('btn-reemplazar-cancelar').addEventListener('click', cerrarModalReemplazar);
  document.getElementById('modal-reemplazar-backdrop').addEventListener('click', cerrarModalReemplazar);
  document.getElementById('btn-reemplazar-enviar').addEventListener('click', () => {
    cerrarModalReemplazar();
    subirFoto(true);
  });

  window.addEventListener('pagehide', detenerWebcam);
}

renderBanner();
renderInfoUsuario();
registrarEventos();
initCambiarClave(() => tokenGuardado);
cargarCatalogo();
