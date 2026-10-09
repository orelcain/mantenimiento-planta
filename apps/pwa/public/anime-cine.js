/* AnimeTracker · modo Cine (películas y series)
   Datos: función mediaApi (TMDB, dónde ver = JustWatch). Guarda en
   animelists/{tgId}/cine/datos — doc aparte porque saveLists() de anime
   reescribe el doc principal completo.
   Depende de globals de anime.html: firebase, db, tg, getUserId, toast, haptic. */
/* global db, tg, getUserId, toast, haptic */
(function () {
  'use strict';

  const API = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/mediaApi';
  const IMG = 'https://image.tmdb.org/t/p/';
  const PAIS = 'CL';
  // Países hispanohablantes primero en «otros países» (VPN).
  const PAISES_PRIMERO = ['MX', 'AR', 'CO', 'ES', 'PE', 'US', 'BR', 'GB', 'CA', 'JP'];
  const FRANQUICIAS = [
    { nombre: 'Marvel', busca: 'Marvel Studios' },
    { nombre: 'DC', busca: 'DC Films' },
    { nombre: 'Star Wars', busca: 'Lucasfilm' },
    { nombre: 'Pixar', busca: 'Pixar' },
    { nombre: 'Studio Ghibli', busca: 'Studio Ghibli' },
    { nombre: 'A24', busca: 'A24' },
  ];
  const COMO = [
    { id: 'flatrate', nombre: 'En suscripción' },
    { id: 'free|ads', nombre: 'Gratis o con anuncios' },
    { id: 'rent|buy', nombre: 'Arriendo o compra' },
  ];

  const est = {
    modo: 'anime',
    tab: 'hoy',
    tipo: 'todo',
    listaVista: 'pendiente',
    datos: { plataformas: [], lista: [], filtros: { generos: [], estudios: [], como: ['flatrate', 'free|ads'] } },
    cargado: false,
    provCL: null,
    generos: null,
    busqueda: '',
    paisesTodos: false,
  };
  const cacheApi = new Map();
  // Tamaño de las tarjetas: c (chico, 4 col.), m (mediano, 3), g (grande, 2).
  const TAMANOS = [['m', 'Mediano'], ['c', 'Chico'], ['g', 'Grande']];
  let tamano = 'm';
  try { tamano = localStorage.getItem('at_tamano') || 'm'; } catch { tamano = 'm'; }
  if (!TAMANOS.some(([k]) => k === tamano)) tamano = 'm';
  const ICON_TAM = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  const btnTamano = () => { const n = (TAMANOS.find(([k]) => k === tamano) || TAMANOS[0])[1]; return `<button type="button" class="c-iconbtn" data-tam="1" aria-label="Tamaño de tarjetas: ${n}" title="Tamaño: ${n}">${ICON_TAM}</button>`; };
  function cambiarTamano() {
    const i = TAMANOS.findIndex(([k]) => k === tamano);
    tamano = TAMANOS[(i + 1) % TAMANOS.length][0];
    try { localStorage.setItem('at_tamano', tamano); } catch { /* sin almacenamiento */ }
    const cine = document.getElementById('cine');
    cine.dataset.tam = tamano;
    cine.querySelectorAll('[data-tam]').forEach((b) => { if (b.tagName === 'BUTTON') b.outerHTML = btnTamano(); });
    avisar(`Tarjetas: ${(TAMANOS.find(([k]) => k === tamano) || TAMANOS[0])[1].toLowerCase()}`);
  }

  // ── Utilidades ──────────────────────────────────────────────────────────
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ruta = (p) => (typeof p === 'string' && /^\/[A-Za-z0-9_.-]+$/.test(p) ? p : null);
  const img = (p, tam) => { const r = ruta(p); return r ? `${IMG}${tam}${r}` : ''; };
  const anio = (f) => (/^\d{4}/.test(f || '') ? f.slice(0, 4) : '');
  const tipoTxt = (t) => (t === 'tv' ? 'Serie' : 'Película');
  // Clave de apertura validada: solo movie|tv y id entero (los datos vienen de Firestore/TMDB).
  const clave = (it) => ((it && (it.tipo === 'movie' || it.tipo === 'tv') && Number.isInteger(it.id) && it.id > 0) ? `${it.tipo}:${it.id}` : '');
  const LISTA_MAX = 1500;
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const nombrePais = (() => {
    let dn = null;
    try { dn = new Intl.DisplayNames(['es'], { type: 'region' }); } catch { dn = null; }
    return (c) => { try { return (dn && dn.of(c)) || c; } catch { return c; } };
  })();
  const avisar = (m) => { if (typeof toast === 'function') toast(m); };
  const vibrar = () => { if (typeof haptic === 'function') haptic('light'); };
  const ICON = {
    hoy: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    buscar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    lista: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    plat: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/></svg>',
    atras: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    chev: '<svg class="c-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lupa: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  };

  async function api(op, params) {
    const qs = new URLSearchParams({ op, ...(params || {}) }).toString();
    const hit = cacheApi.get(qs);
    if (hit && hit.exp > Date.now()) return hit.val;
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Sin sesión');
    const token = await user.getIdToken();
    const r = await fetch(`${API}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    if (cacheApi.size >= 150) cacheApi.delete(cacheApi.keys().next().value);
    cacheApi.set(qs, { val: data, exp: Date.now() + 5 * 60 * 1000 });
    return data;
  }

  // ── Persistencia ────────────────────────────────────────────────────────
  const docRef = () => db.collection('animelists').doc(getUserId()).collection('cine').doc('datos');
  async function cargarDatos() {
    if (est.cargado) return;
    try {
      const snap = await docRef().get();
      if (snap.exists) {
        const d = snap.data() || {};
        est.datos.plataformas = Array.isArray(d.plataformas) ? d.plataformas.filter((x) => Number.isInteger(x)) : [];
        est.datos.lista = (Array.isArray(d.lista) ? d.lista : [])
          .filter((x) => clave(x))
          .map((x) => ({ id: x.id, tipo: x.tipo, titulo: String(x.titulo || '').slice(0, 200), poster: ruta(x.poster), fecha: /^d{4}-d{2}-d{2}$/.test(x.fecha || '') ? x.fecha : '', estado: x.estado === 'visto' ? 'visto' : 'pendiente', agregado: Number(x.agregado) || 0, vistoEn: Number(x.vistoEn) || null }));
        const f = d.filtros || {};
        est.datos.filtros = {
          generos: Array.isArray(f.generos) ? f.generos : [],
          estudios: Array.isArray(f.estudios) ? f.estudios : [],
          como: Array.isArray(f.como) && f.como.length ? f.como : ['flatrate', 'free|ads'],
        };
      }
      est.cargado = true;
    } catch (e) {
      console.error('cine cargarDatos', e);
      avisar('No se pudieron cargar tus datos de cine');
    }
  }
  let guardarTimer = null;
  function guardar() {
    // Sin una lectura exitosa, escribir reemplazaría tus datos reales por vacíos.
    if (!est.cargado) { avisar('Aún no cargan tus datos; intenta de nuevo'); return; }
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(async () => {
      try {
        await docRef().set({
          plataformas: est.datos.plataformas,
          lista: est.datos.lista.slice(0, LISTA_MAX),
          filtros: est.datos.filtros,
          actualizado: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('cine guardar', e);
        avisar('No se pudo guardar');
      }
    }, 400);
  }
  const enLista = (tipo, id) => est.datos.lista.find((x) => x.tipo === tipo && x.id === id);

  // ── Armado de pantalla ─────────────────────────────────────────────────
  function montar() {
    const app = document.getElementById('app');
    const header = app && app.querySelector('header');
    if (!app || !header || document.getElementById('cine')) return;

    const sw = document.createElement('div');
    sw.className = 'modo-switch';
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'Qué ver');
    sw.innerHTML = '<button type="button" data-modo="anime" aria-pressed="true">Anime</button><button type="button" data-modo="cine" aria-pressed="false">Cine y series</button>';
    const logo = header.querySelector('.logo');
    if (logo) logo.insertAdjacentElement('afterend', sw); else header.prepend(sw);
    sw.addEventListener('click', (e) => { const b = e.target.closest('button[data-modo]'); if (b) cambiarModo(b.dataset.modo); });
    montarPantallaCompleta(header);

    const cine = document.createElement('div');
    cine.id = 'cine';
    cine.dataset.tam = tamano;
    const content = document.getElementById('content');
    content.insertAdjacentElement('afterend', cine);

    const tab = document.createElement('nav');
    tab.id = 'cine-tabbar';
    tab.setAttribute('aria-label', 'Cine y series');
    tab.innerHTML = [['hoy', 'Hoy'], ['buscar', 'Buscar'], ['lista', 'Mi lista'], ['plat', 'Plataformas']]
      .map(([k, t]) => `<button type="button" data-tab="${k}">${ICON[k]}${t}</button>`).join('');
    document.body.appendChild(tab);
    tab.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) irA(b.dataset.tab); });

    const ficha = document.createElement('div');
    ficha.id = 'cine-ficha';
    ficha.setAttribute('role', 'dialog');
    ficha.setAttribute('aria-modal', 'true');
    document.body.appendChild(ficha);

    const sheet = document.createElement('div');
    sheet.id = 'cine-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) cerrarFiltros(); });

    // Delegación de clics en todas las superficies del modo cine.
    [cine, ficha, sheet].forEach((el) => el.addEventListener('click', onClick));
    cine.addEventListener('input', onInput);

    aplicarEsquema();
    if (tg && typeof tg.onEvent === 'function') tg.onEvent('themeChanged', aplicarEsquema);

    let modo = 'anime';
    try { modo = localStorage.getItem('at_modo') || 'anime'; } catch { modo = 'anime'; }
    if (modo === 'cine') cambiarModo('cine');
  }

  // ── Pantalla completa (Telegram Desktop / Web, Bot API 8.0+) ───────────
  // Telegram no muestra el botón por su cuenta: la Mini App lo pide con
  // requestFullscreen(). Se recuerda la elección para abrir ampliada la próxima vez.
  const ICON_AMPLIAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  const ICON_REDUCIR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
  function montarPantallaCompleta(header) {
    const escritorio = tg && ['tdesktop', 'macos', 'web', 'weba', 'webk', 'unigram'].includes(tg.platform);
    const soporta = tg && typeof tg.requestFullscreen === 'function' && (typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('8.0'));
    if (!escritorio) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-pantalla';
    const pintar = () => {
      const full = !!tg.isFullscreen;
      b.innerHTML = full ? ICON_REDUCIR : ICON_AMPLIAR;
      b.setAttribute('aria-label', full ? 'Salir de pantalla completa' : 'Pantalla completa');
      b.title = b.getAttribute('aria-label');
    };
    b.addEventListener('click', () => {
      if (!soporta) {
        avisar(`Tu Telegram (${tg.platform}, versión ${tg.version || '?'}) no permite pantalla completa; necesita 8.0 o más. Actualízalo.`);
        return;
      }
      const full = !!tg.isFullscreen;
      try { localStorage.setItem('at_pantalla', full ? '0' : '1'); } catch { /* sin almacenamiento */ }
      try { if (full) tg.exitFullscreen(); else tg.requestFullscreen(); } catch { avisar('Tu Telegram no permite pantalla completa'); }
    });
    if (typeof tg.onEvent === 'function') {
      tg.onEvent('fullscreenChanged', pintar);
      tg.onEvent('fullscreenFailed', () => avisar('Tu Telegram no permite pantalla completa; prueba actualizándolo'));
    }
    header.appendChild(b);
    pintar();
    let pref = '0';
    try { pref = localStorage.getItem('at_pantalla') || '0'; } catch { pref = '0'; }
    if (soporta && pref === '1' && !tg.isFullscreen) { try { tg.requestFullscreen(); } catch { /* el usuario lo pide con el botón */ } }
  }

  function aplicarEsquema() {
    const claro = tg && tg.colorScheme === 'light';
    ['cine', 'cine-ficha', 'cine-sheet', 'cine-tabbar'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.dataset.scheme = claro ? 'light' : 'dark';
    });
  }

  // anime.html inicia la sesión (animeAuth) al arrancar; sin ella no hay datos.
  function esperarSesion(ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      (function mirar() {
        let ok = false;
        try { ok = !!getUserId(); } catch { ok = false; }
        if (ok) return resolve(true);
        if (Date.now() - t0 > (ms || 20000)) return resolve(false);
        setTimeout(mirar, 150);
      })();
    });
  }

  async function cambiarModo(modo) {
    est.modo = modo === 'cine' ? 'cine' : 'anime';
    document.body.classList.toggle('modo-cine', est.modo === 'cine');
    document.querySelectorAll('.modo-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === est.modo)));
    try { localStorage.setItem('at_modo', est.modo); } catch { /* sin almacenamiento */ }
    if (est.modo === 'cine') {
      const badge = document.getElementById('hdr-badge');
      if (badge) badge.style.display = 'none';
      const cine = document.getElementById('cine');
      if (!(await esperarSesion())) { cine.innerHTML = '<p class="c-vacio">Abre AnimeTracker desde Telegram para ver tus datos.</p>'; return; }
      await cargarDatos();
      if (!est.cargado) { cine.innerHTML = '<p class="c-vacio">No se pudieron cargar tus datos de cine. Revisa la conexión y vuelve a tocar «Cine y series».</p>'; return; }
      irA(est.tab);
    } else {
      const badge = document.getElementById('hdr-badge');
      if (badge) badge.style.display = '';
    }
  }

  function irA(tab) {
    est.tab = tab;
    document.querySelectorAll('#cine-tabbar button').forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const cine = document.getElementById('cine');
    cine.scrollTop = 0;
    if (tab === 'hoy') renderHoy();
    else if (tab === 'buscar') renderBuscar();
    else if (tab === 'lista') renderLista();
    else renderPlataformas();
  }

  // ── Tarjetas ───────────────────────────────────────────────────────────
  function tarjeta(it, extra) {
    const p = img(it.poster, 'w342');
    const visto = enLista(it.tipo, it.id);
    const meta = [tipoTxt(it.tipo), anio(it.fecha)].filter(Boolean).join(' · ');
    return `<button type="button" class="c-card" data-abrir="${clave(it)}">
      <div class="c-poster">${p ? `<img src="${esc(p)}" alt="" loading="lazy">` : `<div class="c-noimg">${esc(it.titulo)}</div>`}
        ${extra ? `<span class="c-badge">${esc(extra)}</span>` : ''}
        ${visto ? `<span class="c-check" aria-label="En tu lista">${ICON.check}</span>` : ''}
      </div>
      <span class="c-card-t">${esc(it.titulo)}</span>
      <span class="c-card-s">${esc(meta)}</span>
    </button>`;
  }
  const esqueleto = (n, carrusel) => Array.from({ length: n }, () => `<div class="c-card"${carrusel ? '' : ''}><div class="c-poster c-skel"></div></div>`).join('');

  // ── Hoy ────────────────────────────────────────────────────────────────
  function resumenFiltros() {
    const n = est.datos.plataformas.length;
    const partes = [n ? `${n} plataforma${n === 1 ? '' : 's'}` : 'Todas las plataformas', 'Chile'];
    const f = est.datos.filtros;
    if (f.generos.length) partes.push(`${f.generos.length} género${f.generos.length === 1 ? '' : 's'}`);
    if (f.estudios.length) partes.push(f.estudios.map((x) => x.nombre).join(', '));
    return partes.join(' · ');
  }

  function renderHoy() {
    const cine = document.getElementById('cine');
    const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    const segs = [['todo', 'Todo'], ['tv', 'Series'], ['movie', 'Películas'], ['anime', 'Anime']];
    const sinPlat = !est.datos.plataformas.length;
    cine.innerHTML = `
      <div class="c-top"><div><div class="c-eyebrow">${esc(hoy.charAt(0).toUpperCase() + hoy.slice(1))}</div><h1 class="c-large">Hoy</h1></div>
        <div style="display:flex;gap:8px">${btnTamano()}<button type="button" class="c-iconbtn" data-ir="buscar" aria-label="Buscar">${ICON.lupa}</button></div></div>
      <div class="c-seg" role="group" aria-label="Tipo">${segs.map(([k, t]) => `<button type="button" data-tipo="${k}" aria-pressed="${est.tipo === k}">${t}</button>`).join('')}</div>
      <button type="button" class="c-filtros-row" data-filtros="1"><span>${esc(resumenFiltros())}</span><span>Filtros</span></button>
      ${sinPlat ? `<div class="c-group" style="margin-top:16px"><button type="button" class="c-row" data-ir="plat"><div class="c-row-main"><span class="c-row-t">Elige las plataformas que pagas</span><span class="c-row-s">Así esta pantalla muestra lo nuevo en ellas</span></div>${ICON.chev}</button></div>` : ''}
      <div class="c-h2"><h2>${sinPlat ? 'Lo más reciente en Chile' : 'Nuevo en tus plataformas'}</h2></div>
      <div class="c-grid" id="c-nuevo">${esqueleto(4)}</div>
      <div class="c-h2"><h2>Tendencias de la semana</h2></div>
      <div class="c-carrusel" id="c-tend">${esqueleto(3, true)}</div>
      ${est.tipo === 'todo' || est.tipo === 'movie' ? `<div class="c-h2"><h2>Próximamente en cines</h2></div><div class="c-carrusel" id="c-prox">${esqueleto(3, true)}</div>` : ''}
      <p class="f-credito">Dónde ver: datos de JustWatch vía TMDB. Este producto usa la API de TMDB, pero TMDB no lo respalda ni certifica.</p>`;
    cargarHoy();
  }

  function paramsDescubrir(tipo) {
    const f = est.datos.filtros;
    const p = { tipo, region: PAIS, como: f.como.join('|') || 'flatrate' };
    if (est.datos.plataformas.length) p.plataformas = est.datos.plataformas.join('|');
    if (f.generos.length) p.generos = f.generos.join('|');
    if (f.estudios.length) p.estudios = f.estudios.map((x) => x.id).join('|');
    if (est.tipo === 'anime') { p.idiomaOriginal = 'ja'; p.generos = '16'; p.minVotos = '5'; }
    return p;
  }

  async function cargarHoy() {
    const tipos = est.tipo === 'todo' || est.tipo === 'anime' ? ['movie', 'tv'] : [est.tipo];
    const pintar = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const sel = est.tipo;
    try {
      const res = await Promise.all(tipos.map((t) => api('descubrir', paramsDescubrir(t))));
      if (sel !== est.tipo || est.tab !== 'hoy') return;
      const items = res.flatMap((r) => r.items).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 10);
      pintar('c-nuevo', items.length ? items.map((it) => tarjeta(it)).join('') : '<p class="c-vacio" style="grid-column:1/-1">No hay títulos con estos filtros.</p>');
    } catch (e) { pintar('c-nuevo', `<p class="c-vacio" style="grid-column:1/-1">${esc(e.message)}</p>`); }
    try {
      const t = est.tipo === 'tv' || est.tipo === 'movie' ? est.tipo : 'all';
      const r = await api('tendencias', { tipo: t });
      if (sel !== est.tipo || est.tab !== 'hoy') return;
      let items = r.items;
      if (est.tipo === 'anime') items = items.filter((x) => x.idioma === 'ja');
      pintar('c-tend', items.length ? items.slice(0, 12).map((it) => tarjeta(it)).join('') : '<p class="c-vacio">Sin tendencias para este tipo.</p>');
    } catch (e) { pintar('c-tend', `<p class="c-vacio">${esc(e.message)}</p>`); }
    if (document.getElementById('c-prox')) {
      try {
        const r = await api('proximos', {});
        const hoy = new Date().toISOString().slice(0, 10);
        const items = r.items.filter((x) => (x.fecha || '') >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
        pintar('c-prox', items.length ? items.slice(0, 12).map((it) => tarjeta(it, fechaCorta(it.fecha))).join('') : '<p class="c-vacio">Sin estrenos anunciados.</p>');
      } catch (e) { pintar('c-prox', `<p class="c-vacio">${esc(e.message)}</p>`); }
    }
  }
  const fechaCorta = (f) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return '';
    const d = new Date(`${f}T12:00:00`);
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');
  };

  // ── Buscar ─────────────────────────────────────────────────────────────
  function renderBuscar() {
    const cine = document.getElementById('cine');
    cine.innerHTML = `
      <div class="c-top"><div><h1 class="c-large">Buscar</h1></div>${btnTamano()}</div>
      <div class="c-search">${ICON.lupa}<input type="search" id="c-q" placeholder="Películas y series" value="${esc(est.busqueda)}" autocomplete="off" enterkeyhint="search" aria-label="Buscar películas y series"></div>
      <div id="c-res"></div>`;
    if (est.busqueda) buscar(est.busqueda); else pintarSugerencias();
    setTimeout(() => { const q = document.getElementById('c-q'); if (q && !est.busqueda) q.focus(); }, 50);
  }
  function pintarSugerencias() {
    const el = document.getElementById('c-res');
    if (el) el.innerHTML = '<p class="c-vacio">Escribe el nombre de una película o serie. Te muestro en qué plataforma está en Chile y en otros países.</p>';
  }
  let buscarTimer = null;
  function onInput(e) {
    if (e.target.id !== 'c-q') return;
    est.busqueda = e.target.value;
    clearTimeout(buscarTimer);
    buscarTimer = setTimeout(() => { if (est.busqueda.trim().length >= 2) buscar(est.busqueda); else pintarSugerencias(); }, 400);
  }
  async function buscar(q) {
    const el = document.getElementById('c-res');
    if (!el) return;
    el.innerHTML = '<div class="c-cargando" role="status" aria-label="Buscando"></div>';
    try {
      const r = await api('buscar', { q: q.trim() });
      if (q !== est.busqueda) return;
      el.innerHTML = r.items.length
        ? `<div class="c-grid">${r.items.map((it) => tarjeta(it)).join('')}</div>`
        : '<p class="c-vacio">Sin resultados.</p>';
    } catch (err) { el.innerHTML = `<p class="c-vacio">${esc(err.message)}</p>`; }
  }

  // ── Mi lista ───────────────────────────────────────────────────────────
  function renderLista() {
    const cine = document.getElementById('cine');
    const items = est.datos.lista.filter((x) => (est.listaVista === 'visto' ? x.estado === 'visto' : x.estado !== 'visto'))
      .sort((a, b) => (b.agregado || 0) - (a.agregado || 0));
    const nP = est.datos.lista.filter((x) => x.estado !== 'visto').length;
    const nV = est.datos.lista.length - nP;
    cine.innerHTML = `
      <div class="c-top"><div><h1 class="c-large">Mi lista</h1></div></div>
      <div class="c-seg" role="group" aria-label="Estado">
        <button type="button" data-vista="pendiente" aria-pressed="${est.listaVista !== 'visto'}">Por ver · ${nP}</button>
        <button type="button" data-vista="visto" aria-pressed="${est.listaVista === 'visto'}">Vistos · ${nV}</button>
      </div>
      ${items.length ? `<div class="c-group" style="margin-top:16px;--sep-left:84px">${items.map((it) => `
        <button type="button" class="c-row" data-abrir="${clave(it)}">
          <div class="c-row-thumb">${img(it.poster, 'w185') ? `<img src="${esc(img(it.poster, 'w185'))}" alt="" loading="lazy">` : ''}</div>
          <div class="c-row-main"><span class="c-row-t">${esc(it.titulo)}</span><span class="c-row-s">${esc([tipoTxt(it.tipo), anio(it.fecha)].filter(Boolean).join(' · '))}</span></div>
          ${ICON.chev}
        </button>`).join('')}</div>`
        : `<p class="c-vacio">${est.listaVista === 'visto' ? 'Aún no marcas nada como visto.' : 'Agrega películas y series desde su ficha.'}</p>`}`;
  }

  // ── Plataformas ────────────────────────────────────────────────────────
  async function renderPlataformas() {
    const cine = document.getElementById('cine');
    cine.innerHTML = `
      <div class="c-top"><div><h1 class="c-large">Plataformas</h1><p class="c-sub">Marca las que pagas. Lo nuevo de Hoy se arma con ellas.</p></div></div>
      <div id="c-plat"><div class="c-cargando" role="status" aria-label="Cargando"></div></div>`;
    try {
      if (!est.provCL) est.provCL = (await api('plataformas', { region: PAIS })).items;
      pintarPlataformas();
    } catch (e) {
      const el = document.getElementById('c-plat');
      if (el) el.innerHTML = `<p class="c-vacio">${esc(e.message)}</p>`;
    }
  }
  function filaPlataforma(p) {
    const on = est.datos.plataformas.includes(p.id);
    const logo = img(p.logo, 'w92');
    return `<div class="c-row" style="--sep-left:64px">
      <div class="c-logo">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ''}</div>
      <div class="c-row-main"><span class="c-row-t">${esc(p.nombre)}</span></div>
      <button type="button" class="c-switch" role="switch" aria-checked="${on}" aria-label="${esc(p.nombre)}" data-plat="${p.id}"></button>
    </div>`;
  }
  function pintarPlataformas() {
    const el = document.getElementById('c-plat');
    if (!el || !est.provCL) return;
    const mias = est.provCL.filter((p) => est.datos.plataformas.includes(p.id));
    const otras = est.provCL.filter((p) => !est.datos.plataformas.includes(p.id));
    el.innerHTML = `
      ${mias.length ? `<h2 class="c-hgroup">Las que pagas</h2><div class="c-group">${mias.map(filaPlataforma).join('')}</div>` : ''}
      <h2 class="c-hgroup">Disponibles en Chile</h2>
      <div class="c-group">${otras.map(filaPlataforma).join('')}</div>
      <p class="c-foot">Lista de JustWatch vía TMDB. En cada ficha ves también en qué país está, para usar con VPN.</p>`;
  }

  // ── Ficha ──────────────────────────────────────────────────────────────
  let fichaReq = 0;
  async function abrirFicha(tipo, id) {
    if (!(tipo === 'movie' || tipo === 'tv') || !Number.isInteger(id) || id <= 0) return;
    const yo = ++fichaReq;
    const ficha = document.getElementById('cine-ficha');
    ficha.innerHTML = `<div class="f-fondo"><div class="f-nav"><button type="button" class="c-iconbtn" data-cerrar="1" aria-label="Volver">${ICON.atras}</button></div></div><div class="c-cargando" role="status" aria-label="Cargando"></div>`;
    ficha.classList.add('abierta');
    ficha.scrollTop = 0;
    if (tg && tg.BackButton) { try { tg.BackButton.show(); tg.BackButton.onClick(cerrarFicha); } catch { /* opcional */ } }
    try {
      const t = await api('titulo', { tipo, id });
      if (yo !== fichaReq || !ficha.classList.contains('abierta')) return;
      ficha.innerHTML = htmlFicha(t);
      ficha.dataset.tipo = tipo;
      ficha.dataset.id = String(id);
      est.fichaActual = t;
    } catch (e) {
      if (yo !== fichaReq) return;
      ficha.innerHTML = `<div class="f-fondo"><div class="f-nav"><button type="button" class="c-iconbtn" data-cerrar="1" aria-label="Volver">${ICON.atras}</button></div></div><p class="c-vacio">${esc(e.message)}</p>`;
    }
  }
  function cerrarFicha() {
    fichaReq++;
    const ficha = document.getElementById('cine-ficha');
    ficha.classList.remove('abierta');
    est.fichaActual = null;
    if (tg && tg.BackButton) { try { tg.BackButton.offClick(cerrarFicha); tg.BackButton.hide(); } catch { /* opcional */ } }
    if (est.tab === 'lista') renderLista();
  }

  function filasProveedor(lista, etiqueta, link) {
    return lista.map((p) => {
      const tengo = est.datos.plataformas.includes(p.id);
      const logo = img(p.logo, 'w92');
      return `<div class="c-row" style="--sep-left:64px">
        <div class="c-logo">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ''}</div>
        <div class="c-row-main"><span class="c-row-t">${esc(p.nombre)}</span><span class="c-row-s">${esc(etiqueta)}</span></div>
        ${tengo ? '<span class="c-pill">La tienes</span>' : ''}
        ${link ? `<button type="button" class="c-trail accent" data-link="${esc(link)}" style="background:none;border:0;min-height:44px;padding:0 4px">Ver</button>` : ''}
      </div>`;
    }).join('');
  }

  function htmlFicha(t) {
    const fondo = img(t.fondo, 'w780');
    const poster = img(t.poster, 'w342');
    const guardado = enLista(t.tipo, t.id);
    const meta = [tipoTxt(t.tipo), anio(t.fecha), t.tipo === 'tv' && t.temporadas ? `${t.temporadas} temporada${t.temporadas === 1 ? '' : 's'}` : (t.duracion ? `${Math.floor(t.duracion / 60)} h ${t.duracion % 60} min` : '')].filter(Boolean).join(' · ');
    const cl = t.dondeVer[PAIS];
    const link = cl && cl.link && /^https:\/\/www\.themoviedb\.org\//.test(cl.link) ? cl.link : '';
    let chile = '';
    if (cl) {
      chile = filasProveedor(cl.suscripcion, 'Suscripción', link) + filasProveedor(cl.gratis, 'Gratis o con anuncios', link)
        + filasProveedor(cl.arriendo, 'Arriendo', link) + filasProveedor(cl.compra, 'Compra', link);
    }
    const tengoAlguna = cl && cl.suscripcion.some((p) => est.datos.plataformas.includes(p.id));

    // Otros países: los que tienen suscripción o gratis. Primero donde hay una
    // plataforma que ya pagas (VPN), después los hispanohablantes.
    const otros = Object.entries(t.dondeVer)
      .filter(([c, b]) => c !== PAIS && b && (b.suscripcion.length || b.gratis.length))
      .map(([c, b]) => ({ c, b, mia: b.suscripcion.some((p) => est.datos.plataformas.includes(p.id)) }))
      .sort((x, y) => (y.mia - x.mia) || ((PAISES_PRIMERO.indexOf(x.c) + 1 || 99) - (PAISES_PRIMERO.indexOf(y.c) + 1 || 99)) || nombrePais(x.c).localeCompare(nombrePais(y.c), 'es'));
    const visibles = est.paisesTodos ? otros : otros.slice(0, 8);
    const filasOtros = visibles.map(({ c, b, mia }) => {
      const nombres = [...b.suscripcion.map((p) => p.nombre), ...b.gratis.map((p) => `${p.nombre} (gratis)`)];
      return `<div class="c-row"><div class="c-row-main"><span class="c-row-t">${esc(nombrePais(c))}</span><span class="c-row-s">${esc(nombres.join(', '))}</span></div>${mia ? '<span class="c-pill">La tienes</span>' : ''}</div>`;
    }).join('');

    return `
      <div class="f-fondo">${fondo ? `<img src="${esc(fondo)}" alt="">` : ''}
        <div class="f-nav"><button type="button" class="c-iconbtn" data-cerrar="1" aria-label="Volver">${ICON.atras}</button></div></div>
      <div class="f-cabeza">
        <div class="f-poster">${poster ? `<img src="${esc(poster)}" alt="">` : ''}</div>
        <div style="display:flex;flex-direction:column;gap:4px;padding-bottom:4px;min-width:0">
          <h1 class="f-titulo">${esc(t.titulo)}</h1>
          <span class="f-meta">${esc(meta)}</span>
          ${t.generos.length ? `<span class="f-meta">${esc(t.generos.slice(0, 3).join(' · '))}</span>` : ''}
          ${t.nota ? `<span class="f-meta">TMDB ${esc(t.nota)}</span>` : ''}
        </div>
      </div>
      <div class="c-btns">
        <button type="button" class="c-btn ${guardado ? 'tinted' : 'filled'}" data-guardar="1">${guardado ? 'En tu lista' : 'Agregar'}</button>
        <button type="button" class="c-btn ${guardado && guardado.estado === 'visto' ? 'filled' : 'tinted'}" data-visto="1">${guardado && guardado.estado === 'visto' ? 'Visto' : 'Ya la vi'}</button>
      </div>
      <div class="c-hgroup" style="display:flex;align-items:center;gap:8px">Dónde ver en Chile ${tengoAlguna ? '<span class="c-pill">En tu plan</span>' : ''}</div>
      ${chile ? `<div class="c-group">${chile}</div>` : '<p class="c-foot" style="margin-top:0">No está en plataformas de Chile por ahora.</p>'}
      <p class="c-foot">Audio latino y subtítulos: llegan cuando conectemos Streaming Availability.</p>
      ${otros.length ? `<div class="c-hgroup" style="display:flex;justify-content:space-between">En otros países, con VPN <span style="font-weight:400;color:var(--c-text2)">${otros.length}</span></div>
        <div class="c-group">${filasOtros}</div>
        ${otros.length > 8 ? `<button type="button" class="c-filtros-row" data-paises="1" style="margin-left:32px"><span></span><span>${est.paisesTodos ? 'Ver menos' : `Ver los ${otros.length}`}</span></button>` : ''}` : ''}
      ${t.sinopsis ? `<h2 class="c-hgroup">Sinopsis</h2><p class="f-sinopsis">${esc(t.sinopsis)}</p>` : ''}
      ${t.coleccion ? `<p class="c-foot" style="margin-top:16px">Parte de: ${esc(t.coleccion.nombre)}</p>` : ''}
      <p class="f-credito">Dónde ver: datos de JustWatch vía TMDB. La disponibilidad cambia sin aviso.</p>`;
  }

  function guardarDesdeFicha(marcarVisto) {
    const t = est.fichaActual;
    if (!t) return;
    let it = enLista(t.tipo, t.id);
    if (!est.cargado) { avisar('Aún no cargan tus datos; intenta de nuevo'); return; }
    if (!it && est.datos.lista.length >= LISTA_MAX) { avisar('Tu lista llegó al máximo de 1.500 títulos'); return; }
    if (marcarVisto) {
      if (!it) { it = { id: t.id, tipo: t.tipo, titulo: t.titulo, poster: t.poster, fecha: t.fecha, agregado: Date.now() }; est.datos.lista.push(it); }
      it.estado = it.estado === 'visto' ? 'pendiente' : 'visto';
      it.vistoEn = it.estado === 'visto' ? Date.now() : null;
      avisar(it.estado === 'visto' ? 'Marcado como visto' : 'Vuelve a «Por ver»');
    } else if (it) {
      est.datos.lista = est.datos.lista.filter((x) => x !== it);
      avisar('Quitado de tu lista');
    } else {
      est.datos.lista.push({ id: t.id, tipo: t.tipo, titulo: t.titulo, poster: t.poster, fecha: t.fecha, estado: 'pendiente', agregado: Date.now() });
      avisar('Agregado a Mi lista');
    }
    vibrar();
    guardar();
    const ficha = document.getElementById('cine-ficha');
    const y = ficha.scrollTop;
    ficha.innerHTML = htmlFicha(t);
    ficha.scrollTop = y;
  }

  // ── Filtros (sheet) ────────────────────────────────────────────────────
  async function abrirFiltros() {
    const sheet = document.getElementById('cine-sheet');
    est.borrador = JSON.parse(JSON.stringify(est.datos.filtros));
    sheet.innerHTML = '<div class="s-panel"><div class="s-grabber"></div><div class="c-cargando"></div></div>';
    sheet.classList.add('abierto');
    try {
      if (!est.generos) {
        const [m, t] = await Promise.all([api('generos', { tipo: 'movie' }), api('generos', { tipo: 'tv' })]);
        const mapa = new Map();
        [...m.items, ...t.items].forEach((g) => { if (!mapa.has(g.id)) mapa.set(g.id, g); });
        est.generos = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      }
    } catch { est.generos = est.generos || []; }
    pintarFiltros();
  }
  function pintarFiltros() {
    const sheet = document.getElementById('cine-sheet');
    const b = est.borrador;
    sheet.innerHTML = `<div class="s-panel">
      <div class="s-grabber"></div>
      <div class="s-head"><button type="button" data-flimpiar="1">Limpiar</button><h1>Filtros</h1><button type="button" data-flisto="1">Listo</button></div>
      <h2 class="c-hgroup" style="margin-top:8px">Cómo se ve</h2>
      <div class="c-group">${COMO.map((c) => `<button type="button" class="c-row" data-fcomo="${c.id}"><div class="c-row-main"><span class="c-row-t">${c.nombre}</span></div>${b.como.includes(c.id) ? `<span style="color:var(--c-accent)">${ICON.check}</span>` : ''}</button>`).join('')}</div>
      <h2 class="c-hgroup">Franquicia o estudio</h2>
      <div class="c-chips">${FRANQUICIAS.map((f) => `<button type="button" class="c-chip" data-fest="${esc(f.busca)}" data-fnom="${esc(f.nombre)}" aria-pressed="${b.estudios.some((x) => x.nombre === f.nombre)}">${esc(f.nombre)}</button>`).join('')}</div>
      <h2 class="c-hgroup">Género</h2>
      <div class="c-chips">${(est.generos || []).map((g) => `<button type="button" class="c-chip" data-fgen="${g.id}" aria-pressed="${b.generos.includes(g.id)}">${esc(g.nombre)}</button>`).join('')}</div>
      <h2 class="c-hgroup">Idioma</h2>
      <div class="c-group"><div class="c-row"><div class="c-row-main"><span class="c-row-t" style="color:var(--c-text2)">Audio latino y subtítulos</span><span class="c-row-s">Llega cuando conectemos Streaming Availability</span></div></div></div>
      <div style="padding:32px 16px 0"><button type="button" class="c-btn filled" style="width:100%" data-flisto="1">Ver resultados</button></div>
    </div>`;
  }
  function cerrarFiltros() { document.getElementById('cine-sheet').classList.remove('abierto'); }
  async function toggleEstudio(busca, nombre) {
    const b = est.borrador;
    const i = b.estudios.findIndex((x) => x.nombre === nombre);
    if (i >= 0) { b.estudios.splice(i, 1); pintarFiltros(); return; }
    try {
      const r = await api('estudio', { q: busca });
      const hit = r.items[0];
      if (!hit) { avisar('No encontré ese estudio'); return; }
      b.estudios.push({ nombre, id: hit.id });
    } catch (e) { avisar(e.message); }
    pintarFiltros();
  }

  // ── Eventos ────────────────────────────────────────────────────────────
  function onClick(e) {
    const el = e.target.closest('button, [data-abrir]');
    if (!el) return;
    const d = el.dataset;
    if (d.abrir) { const [tipo, id] = d.abrir.split(':'); abrirFicha(tipo, Number(id)); return; }
    if (d.cerrar) { cerrarFicha(); return; }
    if (d.ir) { irA(d.ir); return; }
    if (d.tam) { cambiarTamano(); return; }
    if (d.tipo) { est.tipo = d.tipo; vibrar(); renderHoy(); return; }
    if (d.vista) { est.listaVista = d.vista; renderLista(); return; }
    if (d.plat) {
      if (!est.cargado) { avisar('Aún no cargan tus datos; intenta de nuevo'); return; }
      const id = Number(d.plat);
      const on = est.datos.plataformas.includes(id);
      est.datos.plataformas = on ? est.datos.plataformas.filter((x) => x !== id) : [...est.datos.plataformas, id];
      vibrar(); guardar(); cacheApi.clear(); pintarPlataformas();
      return;
    }
    if (d.guardar) { guardarDesdeFicha(false); return; }
    if (d.visto) { guardarDesdeFicha(true); return; }
    if (d.paises) { est.paisesTodos = !est.paisesTodos; if (est.fichaActual) { const f = document.getElementById('cine-ficha'); const y = f.scrollTop; f.innerHTML = htmlFicha(est.fichaActual); f.scrollTop = y; } return; }
    if (d.link) { const u = d.link; if (/^https:\/\//.test(u)) { if (tg && tg.openLink) tg.openLink(u); else window.open(u, '_blank', 'noopener'); } return; }
    if (d.filtros) { abrirFiltros(); return; }
    if (d.fcomo) { const b = est.borrador; b.como = b.como.includes(d.fcomo) ? b.como.filter((x) => x !== d.fcomo) : [...b.como, d.fcomo]; if (!b.como.length) b.como = ['flatrate']; pintarFiltros(); return; }
    if (d.fgen) { const b = est.borrador; const g = Number(d.fgen); b.generos = b.generos.includes(g) ? b.generos.filter((x) => x !== g) : [...b.generos, g]; pintarFiltros(); return; }
    if (d.fest) { toggleEstudio(d.fest, d.fnom); return; }
    if (d.flimpiar) { est.borrador = { generos: [], estudios: [], como: ['flatrate', 'free|ads'] }; pintarFiltros(); return; }
    if (d.flisto) { est.datos.filtros = est.borrador; guardar(); cerrarFiltros(); if (est.tab === 'hoy') renderHoy(); }
  }

  // anime.html inicia sesión antes de mostrar datos; esperamos a que exista.
  function iniciar() {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') return;
    montar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
