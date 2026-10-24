/**
 * index.js — Lógica de la página de login
 */
import { renderBanner }       from './banner.js';
import { toast }              from './toast.js';
import { registrarUltimoAcceso } from './ultimo-acceso.js';
import { haySesion, guardar, resolverSesion } from './sesion.js';

function destinoPorSesion(usuarioRaw) {
  try {
    const usuario = typeof usuarioRaw === 'string' ? JSON.parse(usuarioRaw) : usuarioRaw;
    return window.DiagnosticoSession.destinoTrasLogin(usuario?.rol);
  } catch {
    return '/pages/diagnostico-ia.html';
  }
}

// Inicializar banner
renderBanner();

if (haySesion()) {
  window.location.replace(destinoPorSesion(sessionStorage.getItem('usuario')));
} else {
  resolverSesion().then((s) => {
    const ok = Boolean(s.token && s.usuario);
    if (ok) window.location.replace(destinoPorSesion(s.usuario));
  });
}

const form        = document.getElementById('login-form');
const btnIngresar = document.getElementById('btn-ingresar');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const usuario   = document.getElementById('usuario').value.trim();
  const contrasena = document.getElementById('contrasena').value;

  if (!usuario || !contrasena) {
    toast('Por favor completa cédula y contraseña.', 'advertencia');
    return;
  }

  if (!/^\d+$/.test(usuario)) {
    toast('La cédula debe contener solo números.', 'advertencia');
    return;
  }

  btnIngresar.disabled = true;
  btnIngresar.textContent = 'Ingresando…';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasena }),
    });

    const data = await res.json();

    if (!res.ok) {
      toast(data.error || 'Credenciales incorrectas. Intenta de nuevo.', 'error');
      return;
    }

    guardar({
      loginType: 'admin',
      token: data.token,
      usuario: JSON.stringify(data.usuario),
    });
    registrarUltimoAcceso(data.usuario?.cedula);

    toast('Acceso correcto. Redirigiendo…', 'exito');

    setTimeout(() => {
      window.location.href = destinoPorSesion(data.usuario);
    }, 800);

  } catch (err) {
    console.error(err);
    toast('Error de conexión con el servidor. Intenta de nuevo.', 'error');
  } finally {
    btnIngresar.disabled = false;
    btnIngresar.textContent = 'Ingresar';
  }
});
