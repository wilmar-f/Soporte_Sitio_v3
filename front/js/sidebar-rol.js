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

  try {
    const raw = sessionStorage.getItem('usuario');
    if (!raw) return;
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
  } catch {
    /* sin sesión o JSON inválido: menú de técnico */
  }
})();
