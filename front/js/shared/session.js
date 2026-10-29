(function (g) {
  var TZ = 'America/Bogota';
  var TEXTO_PRIMER = 'Primer ingreso en este equipo';

  function titleCase(str) {
    return String(str ?? '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function esRolAdministrador(rol) {
    return String(rol ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') === 'administrador';
  }

  function formatearUltimoAccesoBogota(timestamp) {
    var d = new Date(Number(timestamp));
    if (Number.isNaN(d.getTime())) return '';
    var parts = new Intl.DateTimeFormat('es-CO', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    function get(type) {
      var found = parts.find(function (p) { return p.type === type; });
      return found ? found.value : '';
    }
    return get('day') + '/' + get('month') + '/' + get('year') + ' ' + get('hour') + ':' + get('minute');
  }

  function armarTextoUltimoAcceso() {
    var anterior = sessionStorage.getItem('ultimoAccesoAnterior');
    if (!anterior) return TEXTO_PRIMER;
    var fmt = formatearUltimoAccesoBogota(anterior);
    return fmt ? ('Último acceso: ' + fmt) : TEXTO_PRIMER;
  }

  function congelarTextoUltimoAcceso() {
    var texto = armarTextoUltimoAcceso();
    sessionStorage.setItem('ultimoAccesoTexto', texto);
    return texto;
  }

  function leerUltimoAccesoTexto() {
    return sessionStorage.getItem('ultimoAccesoTexto') || '';
  }

  function registrarUltimoAcceso(cedula) {
    var id = String(cedula ?? '').replace(/\D/g, '');
    if (!id) return;
    var key = 'ultimoAcceso_' + id;
    var anterior = localStorage.getItem(key);
    if (anterior) sessionStorage.setItem('ultimoAccesoAnterior', anterior);
    else sessionStorage.removeItem('ultimoAccesoAnterior');
    congelarTextoUltimoAcceso();
    localStorage.setItem(key, String(Date.now()));
  }

  function destinoTrasLogin(rol) {
    return esRolAdministrador(rol) ? '/pages/reporte.html' : '/pages/diagnostico-ia.html';
  }

  function irADestinoTrasExito(delayMs) {
    var wait = typeof delayMs === 'number' ? delayMs : 500;
    var usuario = leerUsuario();
    var url = destinoTrasLogin(usuario && usuario.rol);
    setTimeout(function () {
      window.location.replace(url);
    }, wait);
  }

  function leerUsuario() {
    try {
      var raw = sessionStorage.getItem('usuario');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  g.DiagnosticoSession = {
    titleCase: titleCase,
    esRolAdministrador: esRolAdministrador,
    formatearUltimoAccesoBogota: formatearUltimoAccesoBogota,
    textoUltimoAcceso: leerUltimoAccesoTexto,
    leerUltimoAccesoTexto: leerUltimoAccesoTexto,
    congelarTextoUltimoAcceso: congelarTextoUltimoAcceso,
    registrarUltimoAcceso: registrarUltimoAcceso,
    destinoTrasLogin: destinoTrasLogin,
    irADestinoTrasExito: irADestinoTrasExito,
    leerUsuario: leerUsuario,
    TEXTO_PRIMER_INGRESO: TEXTO_PRIMER,
  };
})(window);
