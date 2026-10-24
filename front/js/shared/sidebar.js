(function pintarSidebarCompartido() {
  var S = window.DiagnosticoSession || {};
  var SCROLL_KEY = 'sidebarScrollTop';

  function archivoActual() {
    var path = String(window.location.pathname || '').replace(/\\/g, '/');
    var parts = path.split('/');
    return parts[parts.length - 1] || '';
  }

  function marcarActivo() {
    var file = archivoActual();
    var mapa = {
      'reporte.html': 'btn-reportes',
      'usuario.html': 'btn-usuarios',
      'diagnostico-ia.html': 'btn-diagnostico-beta',
      'diagnostico.html': 'btn-diagnostico',
      'acta.html': 'btn-actas',
      'actas.html': 'btn-actas',
      'conferencia.html': 'btn-videoconferencia',
    };
    var idActivo = mapa[file];
    document.querySelectorAll('.sidebar__btn:not(.sidebar__btn--peligro):not(.sidebar__btn--secundario)').forEach(function (btn) {
      btn.classList.toggle('sidebar__btn--activo', btn.id === idActivo);
    });
  }

  function persistirScroll() {
    var el = document.getElementById('sidebar');
    if (!el) return;
    var y = sessionStorage.getItem(SCROLL_KEY);
    if (y != null) el.scrollTop = Number(y) || 0;
    el.addEventListener('scroll', function () {
      sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
    });
    document.querySelectorAll('.sidebar a.sidebar__btn').forEach(function (a) {
      a.addEventListener('click', function (e) {
        sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
        var href = a.getAttribute('href') || '';
        var dest = href.split('/').pop() || '';
        if (dest && dest === archivoActual()) {
          e.preventDefault();
        }
      });
    });
  }

  function enlazarSalida() {
    var salir = document.getElementById('btn-cerrar-sesion');
    if (!salir || salir.dataset.sidebarLogout === '1') return;
    salir.dataset.sidebarLogout = '1';
    salir.addEventListener('click', function () {
      ['token', 'usuario', 'loginType', 'o365session', 'ultimoAccesoAnterior', 'ultimoAccesoTexto'].forEach(function (k) {
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
      });
      window.location.href = '/pages/index.html';
    });
  }

  try {
    var usuario = typeof S.leerUsuario === 'function' ? S.leerUsuario() : null;
    if (usuario) {
      var esAdmin = S.esRolAdministrador(usuario.rol);
      if (esAdmin) {
        document.documentElement.classList.add('rol-admin');
      } else {
        ['btn-reportes', 'btn-usuarios'].forEach(function (id) {
          var nodo = document.getElementById(id);
          if (nodo) nodo.remove();
        });
      }

      var nombre = S.titleCase(usuario.nombreCompleto || '');
      var nombreEl = document.getElementById('user-nombre');
      var correoEl = document.getElementById('user-correo');
      var rolEl = document.getElementById('user-rol');
      var avatarEl = document.getElementById('user-avatar');
      var accesoEl = document.getElementById('user-ultimo-acceso');
      if (nombreEl) nombreEl.textContent = nombre || '—';
      if (correoEl) correoEl.textContent = usuario.correo || usuario.cedula || '—';
      if (rolEl) rolEl.textContent = S.titleCase(usuario.cargo || usuario.rol || '') || '—';
      if (avatarEl) avatarEl.textContent = (nombre || 'U').charAt(0).toUpperCase();
      if (accesoEl) {
        var textoAcceso = sessionStorage.getItem('ultimoAccesoTexto');
        if (!textoAcceso && typeof S.congelarTextoUltimoAcceso === 'function') {
          textoAcceso = S.congelarTextoUltimoAcceso();
        }
        accesoEl.textContent = textoAcceso || '';
      }
    }
  } catch {
    /* menú de técnico */
  }

  marcarActivo();
  persistirScroll();
  enlazarSalida();
})();
