import { renderBanner } from './banner.js';
import { initCambiarClave } from './cambiar-clave.js';
import { renderPanelNoticias } from './noticias.js';
import { exigirAdmin } from './shared/auth.js';

function mostrarErrorCarga() {
  const panel = document.getElementById('panel-principal');
  if (panel) panel.innerHTML = '<p class="panel-error">No se pudo cargar esta pantalla.</p>';
}

const sesion = await exigirAdmin();
if (sesion) {
  try {
    renderBanner();
    initCambiarClave(() => sesion.token);
    await renderPanelNoticias(sesion.token);
  } catch {
    mostrarErrorCarga();
  }
}
