/**
 * Último acceso: solo se congela en el login.
 * El formato (dd/mm/aaaa HH:mm, America/Bogota) vive en js/shared/session.js.
 */
export function registrarUltimoAcceso(cedula) {
  window.DiagnosticoSession?.registrarUltimoAcceso(cedula);
}

export function formatearUltimoAcceso(timestamp) {
  return window.DiagnosticoSession
    ? window.DiagnosticoSession.formatearUltimoAccesoBogota(timestamp)
    : '';
}
