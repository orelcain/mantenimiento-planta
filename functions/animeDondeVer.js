/**
 * «¿Dónde ver?» de AnimeTracker sin depender de AniList.
 *
 * Cadena: id de AniList → ARM (arm.haglund.dev) → ids de TMDB / MyAnimeList / Kitsu / Simkl.
 *   - TMDB (JustWatch) da las plataformas por país: la op mediaApi/titulo ya las trae.
 *   - Kitsu (streaming-links) y Jikan (/anime/{mal}/streaming) dan enlaces directos oficiales.
 *   - Los enlaces a fichas externas (MyAnimeList, Kitsu, Simkl, AniList) sirven de alternativa
 *     cuando AniList web está en mantenimiento.
 *
 * Todo el acceso a red entra por `fetchJson` (inyectado), así se prueba sin red
 * (functions/__tests__/animeDondeVer.test.js).
 */

const ARM = 'https://arm.haglund.dev/api/v2/ids';
const KITSU = 'https://kitsu.app/api/edge';
const JIKAN = 'https://api.jikan.moe/v4';
const TIMEOUT_ARM = 8000;
const TIMEOUT_STREAMING = 6000;

// Plataformas que reconocemos por proveedor de TMDB (id → clave de claveSitio) y su nombre para mostrar.
const PROV_CLAVE = { 8: 'netflix', 119: 'prime', 337: 'disney', 283: 'crunchyroll', 1899: 'max', 384: 'max', 350: 'appletv', 2: 'appletv', 192: 'youtube' };
const NOMBRE_PLAT = { crunchyroll: 'Crunchyroll', netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', max: 'Max', appletv: 'Apple TV', youtube: 'YouTube' };
const PLAN_DEFECTO = ['crunchyroll', 'netflix', 'prime', 'disney']; // lo que paga el usuario, si cine/datos no dice otra cosa

/**
 * Canales de YouTube oficiales que suben anime completo con licencia. Se usan SOLO como sugerencia
 * (búsqueda dentro del canal): sin la API de YouTube no se puede confirmar que el título esté ni que
 * se vea en Chile (muchos están limitados a Asia). Verificado el 2026-10-22 en la página de cada canal.
 * No se agregan canales sin licencia comprobable.
 */
const CANALES_YOUTUBE = [
  { nombre: 'Crunchyroll en Español', handle: 'CrunchyrollEnEspanol', idioma: 'es', fuente: 'https://www.youtube.com/@CrunchyrollEnEspanol/about', nota: 'Cuenta oficial de Crunchyroll en español (insignia de canal verificado).' },
  { nombre: 'Crunchyroll', handle: 'Crunchyroll', idioma: 'en', fuente: 'https://www.youtube.com/@Crunchyroll/about', nota: 'Canal oficial de Crunchyroll: episodios completos, clips y tráilers (verificado).' },
  { nombre: 'Muse Asia', handle: 'MuseAsia', idioma: 'en', fuente: 'https://www.youtube.com/@MuseAsia/about', nota: 'Muse Communication, agente autorizado de más de 30 titulares de derechos; subtítulos en inglés, región Asia.' },
  { nombre: 'Ani-One Asia', handle: 'AniOneAsia', idioma: 'en', fuente: 'https://www.youtube.com/@AniOneAsia/about', nota: 'Canal del grupo Medialink, que declara tener los derechos de todo lo que publica (verificado); región Asia.' },
];

/** Enlaces de búsqueda dentro de cada canal oficial. Son sugerencias, nunca datos confirmados. */
function sugerenciasYoutube(titulo) {
  const q = String(titulo || '').trim().slice(0, 100);
  if (!q) return [];
  return CANALES_YOUTUBE.map((c) => ({
    canal: c.nombre,
    idioma: c.idioma,
    url: `https://www.youtube.com/@${c.handle}/search?query=${encodeURIComponent(q)}`,
    fuente: c.fuente,
    nota: c.nota,
  }));
}

function planDeProveedores(ids) {
  const cl = [...new Set((Array.isArray(ids) ? ids : []).map((i) => PROV_CLAVE[i]).filter(Boolean))];
  return cl.length ? cl : PLAN_DEFECTO;
}

// Búsqueda directa dentro de cada plataforma (id de proveedor de TMDB). Misma tabla que anime-cine.js.
const BUSCAR_EN = {
  8: (q) => `https://www.netflix.com/search?q=${q}`,
  119: (q) => `https://www.primevideo.com/search?phrase=${q}`,
  337: (q) => `https://www.disneyplus.com/search?q=${q}`,
  1899: (q) => `https://play.max.com/search?q=${q}`,
  384: (q) => `https://play.max.com/search?q=${q}`,
  283: (q) => `https://www.crunchyroll.com/search?q=${q}`,
  350: (q) => `https://tv.apple.com/search?term=${q}`,
  2: (q) => `https://tv.apple.com/search?term=${q}`,
  192: (q) => `https://www.youtube.com/results?search_query=${q}`,
  3: (q) => `https://play.google.com/store/search?q=${q}&c=movies`,
};

/** URL de búsqueda del título dentro de la plataforma; si no la conocemos, el enlace de TMDB/JustWatch. */
function urlPlataforma(proveedorId, titulo, link) {
  const f = BUSCAR_EN[proveedorId];
  if (f && titulo) return f(encodeURIComponent(String(titulo).slice(0, 120)));
  return link && /^https:\/\//.test(link) ? link : null;
}

/**
 * Clave común para reconocer la misma plataforma venga de AniList («Amazon Prime Video»),
 * Kitsu («Prime Video»), Jikan («Amazon») o TMDB («Amazon Prime Video»).
 */
function claveSitio(nombre) {
  const t = String(nombre || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!t) return '';
  if (t.includes('crunchyroll')) return 'crunchyroll';
  if (t.includes('netflix')) return 'netflix';
  if (t.includes('prime') || t === 'amazon') return 'prime';
  if (t.includes('disney')) return 'disney';
  if (t === 'max' || t.includes('hbomax')) return 'max';
  if (t.includes('hidive')) return 'hidive';
  if (t.includes('youtube')) return 'youtube';
  if (t.includes('hulu')) return 'hulu';
  if (t.includes('bilibili')) return 'bilibili';
  if (t.includes('appletv')) return 'appletv';
  return t;
}

function https(url) {
  const s = String(url || '').trim();
  if (/^http:\/\//i.test(s)) return 'https://' + s.slice(7);
  return /^https:\/\/[^\s"'<>]{3,490}$/.test(s) ? s : '';
}

/** Respuesta de ARM (un elemento) → ids útiles. */
function normIds(r) {
  if (!r || typeof r !== 'object') return null;
  const n = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const media = String(r.media || '').toLowerCase();
  return {
    anilist: n(r.anilist),
    mal: n(r.myanimelist),
    kitsu: n(r.kitsu),
    simkl: n(r.simkl),
    tmdb: n(r.themoviedb),
    tmdbTipo: media === 'movie' ? 'movie' : 'tv',
    animePlanet: typeof r['anime-planet'] === 'string' && /^[a-z0-9-]{1,120}$/i.test(r['anime-planet']) ? r['anime-planet'] : null,
  };
}

async function idsDeAnilist(fetchJson, anilistId) {
  const id = Number(anilistId);
  if (!Number.isInteger(id) || id <= 0 || id > 50000000) throw new Error('id inválido');
  const resp = await fetchJson(ARM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ anilist: id }]),
    timeout: TIMEOUT_ARM,
  });
  const ids = Array.isArray(resp) ? normIds(resp[0]) : null;
  // ARM devuelve null para títulos que no conoce: sin mapeo, igual hay enlace a AniList.
  return ids || { anilist: id, mal: null, kitsu: null, simkl: null, tmdb: null, tmdbTipo: 'tv', animePlanet: null };
}

/**
 * Enlaces a las fichas del título en sitios que sirven si AniList está caído.
 * Orden: los que hoy responden mejor primero; AniList al final (a veces en mantenimiento).
 */
function enlacesFicha(ids) {
  const out = [];
  if (ids.mal) out.push({ sitio: 'MyAnimeList', url: `https://myanimelist.net/anime/${ids.mal}` });
  if (ids.kitsu) out.push({ sitio: 'Kitsu', url: `https://kitsu.app/anime/${ids.kitsu}` });
  if (ids.simkl) out.push({ sitio: 'Simkl', url: `https://simkl.com/anime/${ids.simkl}` });
  if (ids.animePlanet) out.push({ sitio: 'Anime-Planet', url: `https://www.anime-planet.com/anime/${ids.animePlanet}` });
  if (ids.anilist) out.push({ sitio: 'AniList', url: `https://anilist.co/anime/${ids.anilist}` });
  return out;
}

const IDIOMA_OK = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;
const idiomas = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter((x) => typeof x === 'string' && IDIOMA_OK.test(x)))].slice(0, 6);

/** Kitsu /anime/{id}/streaming-links?include=streamer (JSON:API) → [{sitio,url,fuente,subs,dubs}]. */
function normStreamingKitsu(json) {
  const nombres = new Map();
  for (const inc of (json && json.included) || []) {
    if (inc && inc.type === 'streamers' && inc.attributes) nombres.set(String(inc.id), inc.attributes.siteName);
  }
  const out = [];
  for (const d of (json && json.data) || []) {
    const a = d && d.attributes;
    const rel = d && d.relationships && d.relationships.streamer && d.relationships.streamer.data;
    const url = https(a && a.url);
    const sitio = (rel && nombres.get(String(rel.id))) || '';
    if (!url || !sitio) continue;
    out.push({ sitio, url, fuente: 'kitsu', subs: idiomas(a.subs), dubs: idiomas(a.dubs) });
  }
  return out;
}

/** Jikan /anime/{id}/streaming → [{sitio,url,fuente}]. */
function normStreamingJikan(json) {
  const out = [];
  for (const d of (json && json.data) || []) {
    const url = https(d && d.url);
    const sitio = String((d && d.name) || '').trim();
    if (!url || !sitio) continue;
    out.push({ sitio, url, fuente: 'jikan' });
  }
  return out;
}

/** Une listas de enlaces sin repetir plataforma (gana la primera que llega). */
function unirEnlaces(...listas) {
  const porClave = new Map();
  for (const lista of listas) {
    for (const e of lista || []) {
      const k = claveSitio(e.sitio);
      if (!k) continue;
      const previo = porClave.get(k);
      if (!previo) { porClave.set(k, { ...e }); continue; }
      // Mismo sitio en otra fuente: el enlace de la primera gana, pero no se pierden los idiomas.
      if (!(previo.subs && previo.subs.length) && e.subs && e.subs.length) previo.subs = e.subs;
      if (!(previo.dubs && previo.dubs.length) && e.dubs && e.dubs.length) previo.dubs = e.dubs;
    }
  }
  return [...porClave.values()];
}

async function streamingKitsu(fetchJson, kitsuId) {
  const j = await fetchJson(`${KITSU}/anime/${kitsuId}/streaming-links?include=streamer`, {
    headers: { Accept: 'application/vnd.api+json' }, timeout: TIMEOUT_STREAMING,
  });
  return normStreamingKitsu(j);
}
async function streamingJikan(fetchJson, malId) {
  const j = await fetchJson(`${JIKAN}/anime/${malId}/streaming`, { timeout: TIMEOUT_STREAMING });
  return normStreamingJikan(j);
}

/**
 * Proveedores de un país (salida de mediaApi/titulo.dondeVer[pais]) → filas con URL de búsqueda.
 * tipo: suscripcion | gratis | arriendo | compra.
 */
function filasPais(bloque, titulo) {
  if (!bloque) return [];
  const out = [];
  for (const [tipo, lista] of [['suscripcion', bloque.suscripcion], ['gratis', bloque.gratis], ['arriendo', bloque.arriendo], ['compra', bloque.compra]]) {
    for (const p of lista || []) {
      out.push({ id: p.id, nombre: p.nombre, logo: p.logo || null, tipo, url: urlPlataforma(p.id, titulo, bloque.link) });
    }
  }
  return out;
}

/** Otros países con suscripción o gratis: [{pais, plataformas:[nombre…]}], sin el país base. */
function otrosPaises(dondeVer, paisBase) {
  return Object.entries(dondeVer || {})
    .filter(([c, b]) => c !== paisBase && b && ((b.suscripcion || []).length || (b.gratis || []).length))
    .map(([c, b]) => ({
      pais: c,
      plataformas: [...b.suscripcion.map((p) => p.nombre), ...b.gratis.map((p) => `${p.nombre} (gratis)`)],
      ids: [...b.suscripcion.map((p) => p.id)],
    }));
}

/**
 * Orquesta todo. `tmdbTitulo({tipo,id})` es mediaApi/titulo (inyectado, con su caché).
 * Nunca lanza por una fuente caída: cada parte que falla queda en `fallos`.
 */
async function dondeVerAnime({ fetchJson, tmdbTitulo, anilistId, titulo, region }) {
  const ids = await idsDeAnilist(fetchJson, anilistId);
  const fallos = [];

  const tareaTmdb = (async () => {
    if (!ids.tmdb) return null;
    const orden = ids.tmdbTipo === 'movie' ? ['movie', 'tv'] : ['tv', 'movie'];
    for (const tipo of orden) {
      try { return await tmdbTitulo({ tipo, id: ids.tmdb }); } catch (e) {
        if (e && e.status !== 404) { fallos.push(`tmdb: ${e.message}`); return null; }
      }
    }
    return null;
  })();
  const tareaKitsu = ids.kitsu ? streamingKitsu(fetchJson, ids.kitsu).catch((e) => { fallos.push(`kitsu: ${e.message}`); return []; }) : Promise.resolve([]);
  const tareaJikan = ids.mal ? streamingJikan(fetchJson, ids.mal).catch((e) => { fallos.push(`jikan: ${e.message}`); return []; }) : Promise.resolve([]);

  const [t, kitsu, jikan] = await Promise.all([tareaTmdb, tareaKitsu, tareaJikan]);
  const nombreBusqueda = titulo || (t && (t.titulo || t.original)) || '';
  return {
    ids,
    enlaces: enlacesFicha(ids),
    oficiales: unirEnlaces(kitsu, jikan),
    tmdb: t ? { id: t.id, tipo: t.tipo, titulo: t.titulo } : null,
    region,
    paisBase: filasPais(t && t.dondeVer && t.dondeVer[region], nombreBusqueda),
    otros: t ? otrosPaises(t.dondeVer, region) : [],
    youtube: sugerenciasYoutube(nombreBusqueda),
    fallos,
  };
}

/**
 * Plataforma para el botón «Ver ahora» del aviso: SOLO si TMDB confirma suscripción o gratis en Chile.
 * Orden: la recordada por serie (si sigue disponible) y si no la primera del plan del usuario.
 * Enlace directo a la serie si Kitsu/Jikan lo dan; si no, la búsqueda del título en la plataforma.
 * Devuelve null cuando no hay nada seguro: mejor sin botón que un botón a un lugar equivocado.
 */
function elegirVerAhora(datos, { recordada, plan } = {}) {
  const cand = new Map();
  for (const f of (datos && datos.paisBase) || []) {
    if (f.tipo !== 'suscripcion' && f.tipo !== 'gratis') continue;
    const k = claveSitio(f.nombre);
    if (!k) continue;
    if (!cand.has(k)) cand.set(k, { clave: k, nombre: NOMBRE_PLAT[k] || f.nombre, url: f.url, directo: false, gratis: false, suscripcion: false });
    const c = cand.get(k);
    if (f.tipo === 'gratis') c.gratis = true; else c.suscripcion = true;
  }
  for (const o of (datos && datos.oficiales) || []) {
    const c = cand.get(claveSitio(o.sitio));
    if (c && o.url) { c.url = o.url; c.directo = true; }
  }
  // Sin ninguna del plan, una plataforma gratis (con anuncios) que sea solo gratis en Chile.
  const soloGratis = [...cand.values()].find((c) => c.gratis && !c.suscripcion);
  const elegido = (recordada && cand.get(recordada)) || (plan || PLAN_DEFECTO).map((k) => cand.get(k)).find(Boolean) || soloGratis;
  if (!elegido || !/^https:\/\//.test(elegido.url || '')) return null;
  return { clave: elegido.clave, nombre: elegido.nombre, url: elegido.url, directo: elegido.directo, gratis: elegido.gratis && !elegido.suscripcion };
}

module.exports = {
  PROV_CLAVE, NOMBRE_PLAT, PLAN_DEFECTO, CANALES_YOUTUBE, sugerenciasYoutube, planDeProveedores, elegirVerAhora,
  urlPlataforma, claveSitio, normIds, idsDeAnilist, enlacesFicha, normStreamingKitsu, normStreamingJikan,
  unirEnlaces, filasPais, otrosPaises, dondeVerAnime,
};
