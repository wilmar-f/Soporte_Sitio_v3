import { renderBanner } from './banner.js';
import { initCambiarClave } from './cambiar-clave.js';
import { renderPanelUsuarios } from './admin-usuarios.js';
import { exigirAdmin, redirigirQueryPanel } from './shared/auth.js';

function mostrarErrorCarga() {
  const panel = document.getElementById('panel-principal');
  if (panel) panel.innerHTML = '<p class="panel-error">No se pudo cargar esta pantalla.</p>';
}

if (!redirigirQueryPanel()) {
  const sesion = await exigirAdmin();
  if (sesion) {
    try {
      renderBanner();
      initCambiarClave(() => sesion.token);
      renderPanelUsuarios(sesion.token);
    } catch {
      mostrarErrorCarga();
    }
  }
}
