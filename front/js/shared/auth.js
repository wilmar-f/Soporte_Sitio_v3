import {
  resolverSesion,
  escucharCierreEnOtrasPestanas,
  iniciarVigilanciaInactividad,
} from '../sesion.js';
import { esRolAdministrador } from '../noticias.js';

export const MAPA_PANEL = {
  reportes: '/pages/reporte.html',
  usuarios: '/pages/usuario.html',
  diagnostico: '/pages/diagnostico.html',
  'diagnostico-beta': '/pages/diagnostico-ia.html',
};

export function redirigirQueryPanel() {
  const panel = new URLSearchParams(window.location.search).get('panel');
  if (!panel || !MAPA_PANEL[panel]) return false;
  window.location.replace(MAPA_PANEL[panel]);
  return true;
}

export function destinoTrasLogin(rol) {
  if (window.DiagnosticoSession) {
    return window.DiagnosticoSession.destinoTrasLogin(rol);
  }
  return esRolAdministrador(rol) ? '/pages/reporte.html' : '/pages/diagnostico-ia.html';
}

export async function exigirSesion() {
  const { token, usuario } = await resolverSesion();
  if (!token || !usuario) {
    window.location.replace('/pages/index.html');
    return null;
  }
  escucharCierreEnOtrasPestanas();
  iniciarVigilanciaInactividad();
  return { token, usuario: JSON.parse(usuario) };
}

export async function exigirAdmin() {
  const sesion = await exigirSesion();
  if (!sesion) return null;
  if (!esRolAdministrador(sesion.usuario.rol)) {
    window.location.replace('/pages/diagnostico-ia.html');
    return null;
  }
  return sesion;
}
