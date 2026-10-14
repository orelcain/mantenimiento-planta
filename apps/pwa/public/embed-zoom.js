/*
 * embed-zoom.js — zoom táctil del panel de un equipo dentro de un iframe de la app
 * (HMI Knuro, Grader, Bombeo…). Regla del marco de herramientas: en el celular el panel se
 * escala COMPLETO y se amplía con pellizco; los botones del panel nunca se encogen ni se
 * agrandan por separado (se conserva la fidelidad con el equipo).
 *
 *   EmbedZoom.init({
 *     layer,                 // elemento que se transforma (el panel)
 *     stage,                 // quien recibe los gestos (por defecto, layer.parentElement)
 *     view,                  // () => {left, top, width, height} del área visible (por defecto, stage)
 *     max, doble,            // zoom máximo (3) y zoom del doble toque (2)
 *     esControl,             // (target) => true si es un botón/válvula del equipo (por defecto: cursor:pointer)
 *     onCambio,              // (zoom) => void
 *   }) → { reiniciar(), refit(), zoom() }
 *
 * Gestos (solo toque o lápiz; el mouse no cambia nada):
 *   pellizco con dos dedos (pointer events) · arrastre con un dedo cuando está ampliado ·
 *   doble toque alterna 1× / 2× (sobre un control del equipo NO amplía: serían dos
 *   accionamientos que se anulan) · botón «1×» de 48 px vuelve al tamaño inicial · Ctrl+0.
 * `touch-action: none` SOLO en el panel (layer). Un arrastre o pellizco no acciona controles
 * (se traga el clic que le sigue).
 */
(function (w) {
  'use strict';

  var CSS =
    '#btn-zoom1{position:fixed;top:10px;right:10px;z-index:2147483000;display:none;align-items:center;' +
    'justify-content:center;gap:6px;height:48px;min-width:48px;padding:0 16px;border:0;border-radius:999px;' +
    'background:rgba(30,30,30,.82);color:#fff;font:600 15px/1 Arial,Helvetica,sans-serif;cursor:pointer;' +
    '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);touch-action:manipulation}' +
    '#btn-zoom1.visible{display:inline-flex}#btn-zoom1 svg{width:18px;height:18px;flex:none}' +
    '#btn-zoom1:focus-visible{outline:2px solid #7ec8ff;outline-offset:2px}' +
    '';

  function boton() {
    var b = document.getElementById('btn-zoom1');
    if (b) return b;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    b = document.createElement('button');
    b.id = 'btn-zoom1';
    b.type = 'button';
    b.setAttribute('aria-label', 'Volver al tamaño inicial (1×)');
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>1×';
    document.body.appendChild(b);
    return b;
  }

  function init(o) {
    var layer = o && o.layer;
    if (!layer) return null;
    var stage = o.stage || layer.parentElement;
    var MAX = o.max || 3;
    var DOBLE = o.doble || 2;
    var btn = boton();
    var z = 1, tx = 0, ty = 0;
    var base = null;
    var ptrs = new Map();
    var gesto = null, pan = null, ini = null, ultimo = null;
    var suprimir = false;

    layer.style.transformOrigin = '0 0';
    layer.style.touchAction = 'none';
    // Sin rebote ni encadenado de scroll desde el panel; el scroll del documento NO se bloquea.
    layer.style.overscrollBehavior = 'contain';

    function vista() {
      if (o.view) return o.view();
      var r = stage.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    // Caja del panel SIN zoom, relativa a la vista (se cachea; refit() la invalida).
    function medirBase() {
      var prev = layer.style.transform;
      layer.style.transform = 'none';
      var r = layer.getBoundingClientRect();
      layer.style.transform = prev;
      var v = vista();
      base = { left: r.left - v.left, top: r.top - v.top, w: r.width, h: r.height };
      return base;
    }
    function aplicar() {
      var v = vista();
      var b = base || medirBase();
      z = Math.min(MAX, Math.max(1, z));
      if (b.w * z <= v.width) tx = 0;
      else tx = Math.min(-b.left, Math.max(v.width - b.w * z - b.left, tx));
      if (b.h * z <= v.height) ty = 0;
      else ty = Math.min(-b.top, Math.max(v.height - b.h * z - b.top, ty));
      var activo = z > 1.001;
      layer.style.transform = activo ? 'translate(' + tx + 'px,' + ty + 'px) scale(' + z + ')' : '';
      btn.classList.toggle('visible', activo);
      if (o.onCambio) o.onCambio(z);
    }
    // Mantiene bajo (cx, cy) el mismo punto del panel al cambiar de zoom.
    function zoomEn(cx, cy, nz) {
      var v = vista();
      var b = base || medirBase();
      var x = cx - v.left, y = cy - v.top;
      var ux = (x - b.left - tx) / z, uy = (y - b.top - ty) / z;
      z = Math.min(MAX, Math.max(1, nz));
      tx = x - b.left - z * ux;
      ty = y - b.top - z * uy;
      aplicar();
    }
    function reiniciar() { z = 1; tx = 0; ty = 0; aplicar(); }
    // Tamaño de la vista en el último ajuste: si gira o cambia mucho de ancho, el zoom no se conserva.
    var ultimaVista = null;
    function cambioFuerte(v) {
      if (!ultimaVista) return false;
      var antes = ultimaVista.width > ultimaVista.height, ahora = v.width > v.height;
      if (antes !== ahora) return true;
      return Math.abs(v.width - ultimaVista.width) > ultimaVista.width * 0.15;
    }
    function refit() {
      var v = vista();
      var reset = cambioFuerte(v);
      ultimaVista = { width: v.width, height: v.height };
      base = null;
      if (reset) { z = 1; tx = 0; ty = 0; }
      aplicar();
    }
    ultimaVista = (function () { var v = vista(); return { width: v.width, height: v.height }; })();

    function esControl(t) {
      if (o.esControl) return !!o.esControl(t);
      for (var e = t; e && e !== layer.parentElement && e.nodeType === 1; e = e.parentElement) {
        if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(e.tagName)) return true;
        if (w.getComputedStyle(e).cursor === 'pointer') return true;
        if (e === layer) break;
      }
      return false;
    }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || document.body.classList.contains('edit')) return;
      if (!layer.contains(e.target)) return; // solo gestos que empiezan sobre el panel
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) {
        base = base || medirBase();
        ini = { t: e.timeStamp, x: e.clientX, y: e.clientY, movido: false, objetivo: e.target };
        pan = z > 1 ? { x: e.clientX, y: e.clientY, tx: tx, ty: ty } : null;
      } else if (ptrs.size === 2) {
        var p = Array.from(ptrs.values());
        gesto = { d: dist(p[0], p[1]) || 1, z: z };
        pan = null;
        if (ini) ini.movido = true;
        suprimir = true;
      }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ini && Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > 10) {
        ini.movido = true;
        suprimir = true; // un arrastre (aun a 1×) no debe accionar la válvula/botón donde termine
      }
      if (ptrs.size === 2 && gesto) {
        var p = Array.from(ptrs.values());
        zoomEn((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, gesto.z * dist(p[0], p[1]) / gesto.d);
      } else if (ptrs.size === 1 && pan && ini && ini.movido) {
        tx = pan.tx + (e.clientX - pan.x);
        ty = pan.ty + (e.clientY - pan.y);
        aplicar();
        suprimir = true;
      }
    });
    function fin(e) {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) gesto = null;
      if (ptrs.size === 0) {
        var i0 = ini; ini = null; pan = null;
        var toque = e.type === 'pointerup' && i0 && !i0.movido && (e.timeStamp - i0.t) < 350;
        if (toque) {
          if (ultimo && (e.timeStamp - ultimo.t) < 320 && Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y) < 40) {
            ultimo = null;
            if (!esControl(i0.objetivo)) {
              if (z > 1.001) reiniciar(); else zoomEn(e.clientX, e.clientY, DOBLE);
            }
          } else {
            ultimo = { t: e.timeStamp, x: e.clientX, y: e.clientY };
          }
        }
        if (suprimir) setTimeout(function () { suprimir = false; }, 60);
      } else if (ptrs.size === 1) {
        // Quedó un dedo tras el pellizco: sigue como arrastre, sin saltos.
        var q = Array.from(ptrs.values())[0];
        pan = z > 1 ? { x: q.x, y: q.y, tx: tx, ty: ty } : null;
        if (ini) ini.movido = true;
      }
    }
    stage.addEventListener('pointerup', fin);
    stage.addEventListener('pointercancel', fin);
    // El clic que sigue a un arrastre o pellizco no debe accionar controles del equipo.
    stage.addEventListener('click', function (e) {
      if (suprimir) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    btn.addEventListener('click', reiniciar);
    w.addEventListener('resize', refit);
    w.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === '0') reiniciar();
    });

    return { reiniciar: reiniciar, refit: refit, zoom: function () { return z; }, estado: function () { return { z: z, tx: tx, ty: ty }; } };
  }

  w.EmbedZoom = { init: init };
})(window);
