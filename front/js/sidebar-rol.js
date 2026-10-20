(function pintarSidebarInmediato() {
  function titleCase(str) {
    return String(str ?? '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function esAdmin(rol) {
    return String(rol ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') === 'administrador';
  }

  function formatearAcceso(timestamp) {
    const d = new Date(Number(timestamp));
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function enlazarMenu() {
    const rutas = {
      'btn-usuarios': '/pages/usuario.html?panel=usuarios',
      'btn-reportes': '/pages/usuario.html?panel=reportes',
      'btn-diagnostico': '/pages/usuario.html?panel=diagnostico',
      'btn-diagnostico-beta': '/pages/usuario.html?panel=diagnostico-beta',
      'btn-actas': '/pages/actas.html',
      'btn-videoconferencia': '/pages/conferencia.html',
    };
    Object.keys(rutas).forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.sidebarNav === '1') return;
      el.dataset.sidebarNav = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = rutas[id];
      });
    });
    const salir = document.getElementById('btn-cerrar-sesion');
    if (salir && salir.dataset.sidebarNav !== '1') {
      salir.dataset.sidebarNav = '1';
      salir.addEventListener('click', () => {
        ['token', 'usuario', 'loginType', 'o365session'].forEach((k) => {
          sessionStorage.removeItem(k);
          localStorage.removeItem(k);
        });
        window.location.href = '/pages/index.html';
      });
    }
  }

  try {
    const raw = sessionStorage.getItem('usuario');
    if (raw) {
      const usuario = JSON.parse(raw);
      if (esAdmin(usuario.rol)) {
        document.documentElement.classList.add('rol-admin');
      }

      const nombre = titleCase(usuario.nombreCompleto || '');
      const nombreEl = document.getElementById('user-nombre');
      const correoEl = document.getElementById('user-correo');
      const rolEl = document.getElementById('user-rol');
      const avatarEl = document.getElementById('user-avatar');
      const accesoEl = document.getElementById('user-ultimo-acceso');
      if (nombreEl) nombreEl.textContent = nombre || '—';
      if (correoEl) correoEl.textContent = usuario.correo || usuario.cedula || '—';
      if (rolEl) rolEl.textContent = titleCase(usuario.cargo || usuario.rol || '') || '—';
      if (avatarEl) avatarEl.textContent = (nombre || 'U').charAt(0).toUpperCase();
      if (accesoEl) {
        const anterior = sessionStorage.getItem('ultimoAccesoAnterior');
        accesoEl.textContent = anterior
          ? `Último acceso: ${formatearAcceso(anterior)}`
          : 'Primer ingreso en este equipo';
      }
    }
  } catch {
    /* sin sesión o JSON inválido: menú de técnico */
  }

  enlazarMenu();
})();
