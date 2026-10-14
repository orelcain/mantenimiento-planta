/*
 * embed-tema.js — contrato de tema para los iframes de la app (HMI Knuro, Grader, Bombeo…).
 *
 * El padre (la PWA) resuelve los colores del tema con getComputedStyle y los manda por postMessage:
 *   { type: 'app:tema', oscuro: boolean,
 *     colores: { fondo, superficie, tinta, tinta2, linea, acento } }
 * Se envía al cargar el iframe, cuando el embed avisa `app:tema-listo` y cada vez que cambia el
 * tema o la intensidad (ver hooks/useTemaEmbed.ts y lib/temaEmbed.ts).
 *
 * Este script, cargado en el <head> del embed:
 *  - valida que el mensaje venga del padre y del mismo origen (e.origin / e.source);
 *  - acepta solo colores #hex o rgb()/rgba() (nada que pueda inyectar CSS);
 *  - los deja como variables en <html>: --tema-fondo, --tema-superficie, --tema-tinta,
 *    --tema-tinta2, --tema-linea, --tema-acento; pone data-tema="dark|light" y la clase `tema-app`;
 *  - avisa a la página con el evento 'app:tema' (detail = el mensaje) por si necesita repintar.
 * Cada embed decide QUÉ pinta con esas variables, siempre bajo `html.tema-app` (sin mensaje, el
 * embed conserva su aspecto propio: abrirlo suelto sigue funcionando).
 */
(function () {
  'use strict';
  var CLAVES = ['fondo', 'superficie', 'tinta', 'tinta2', 'linea', 'acento'];
  var COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}(?:\s*,\s*|\s+)\d{1,3}(?:\s*,\s*|\s+)\d{1,3}(?:\s*[,/]\s*[\d.]+%?)?\s*\))$/i;

  function aplicar(d) {
    var c = d && d.colores;
    if (!c || typeof c !== 'object') return false;
    for (var i = 0; i < CLAVES.length; i++) {
      var v = c[CLAVES[i]];
      if (typeof v !== 'string' || v.length > 40 || !COLOR.test(v.trim())) return false;
    }
    var root = document.documentElement;
    for (var j = 0; j < CLAVES.length; j++) {
      root.style.setProperty('--tema-' + CLAVES[j], c[CLAVES[j]].trim());
    }
    var oscuro = d.oscuro === true;
    root.setAttribute('data-tema', oscuro ? 'dark' : 'light');
    root.style.colorScheme = oscuro ? 'dark' : 'light';
    root.classList.add('tema-app');
    try {
      window.dispatchEvent(new CustomEvent('app:tema', { detail: { oscuro: oscuro, colores: c } }));
    } catch (_) { /* navegador sin CustomEvent */ }
    return true;
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return;
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || d.type !== 'app:tema') return;
    aplicar(d);
  });

  // Pedir el tema de inmediato: evita el parpadeo del aspecto propio antes del primer pintado.
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'app:tema-listo' }, window.location.origin);
    }
  } catch (_) { /* sin padre accesible */ }
})();
