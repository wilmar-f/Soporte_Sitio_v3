/**
 * Modal para que cualquier usuario cambie su propia contraseña (Postgres).
 */
import { toast } from './toast.js';

export function initCambiarClave(getToken) {
  if (document.getElementById('btn-cambiar-clave')?.dataset.bound === '1') return;

  const htmlBtn = `
        <button type="button" class="sidebar__btn sidebar__btn--secundario" id="btn-cambiar-clave">
          <span class="sidebar__btn-icono">🔑</span>
          Cambiar contraseña
        </button>`;

  const cerrar = document.getElementById('btn-cerrar-sesion');
  if (cerrar && !document.getElementById('btn-cambiar-clave')) {
    cerrar.insertAdjacentHTML('beforebegin', htmlBtn);
  }

  if (!document.getElementById('modal-cambiar-clave')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-clave" id="modal-cambiar-clave" hidden aria-hidden="true">
        <div class="modal-clave__backdrop" id="modal-cambiar-clave-backdrop"></div>
        <div class="modal-clave__dialog" role="dialog" aria-labelledby="modal-cambiar-clave-titulo" aria-modal="true">
          <h2 class="modal-clave__titulo" id="modal-cambiar-clave-titulo">Cambiar contraseña</h2>
          <form class="modal-clave__form" id="form-cambiar-clave">
            <div class="campo">
              <label for="clave-actual">Contraseña actual</label>
              <input id="clave-actual" type="password" autocomplete="current-password" required>
            </div>
            <div class="campo">
              <label for="clave-nueva">Nueva contraseña</label>
              <input id="clave-nueva" type="password" autocomplete="new-password" required>
              <p class="modal-clave__ayuda">Mín. 6 caracteres, mayúscula, número y . * + -</p>
            </div>
            <div class="campo">
              <label for="clave-confirm">Confirmar nueva</label>
              <input id="clave-confirm" type="password" autocomplete="new-password" required>
            </div>
            <div class="modal-clave__acciones">
              <button type="button" class="btn" id="clave-cancelar">Cancelar</button>
              <button type="submit" class="btn btn--primario">Guardar</button>
            </div>
          </form>
        </div>
      </div>
    `);
  }

  const modal = document.getElementById('modal-cambiar-clave');
  const open = () => {
    document.getElementById('clave-actual').value = '';
    document.getElementById('clave-nueva').value = '';
    document.getElementById('clave-confirm').value = '';
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  };
  const close = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  };

  const btn = document.getElementById('btn-cambiar-clave');
  if (btn) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', open);
  }
  document.getElementById('clave-cancelar')?.addEventListener('click', close);
  document.getElementById('modal-cambiar-clave-backdrop')?.addEventListener('click', close);
  document.getElementById('form-cambiar-clave')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = typeof getToken === 'function' ? getToken() : getToken;
    const res = await fetch('/api/auth/cambiar-clave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contrasenaActual: document.getElementById('clave-actual').value,
        contrasenaNueva: document.getElementById('clave-nueva').value,
        contrasenaConfirmacion: document.getElementById('clave-confirm').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || 'No se pudo cambiar la contraseña', 'error');
      return;
    }
    toast(data.mensaje || 'Contraseña actualizada.', 'exito');
    close();
  });
}
