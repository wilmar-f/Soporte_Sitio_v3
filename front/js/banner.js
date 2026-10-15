/**
 * banner.js — El header de marcas se eliminó.
 * Se mantiene el export para no cambiar los import existentes.
 */
export function renderBanner() {
  const banner = document.getElementById('banner');
  if (!banner) return;
  banner.replaceChildren();
}
