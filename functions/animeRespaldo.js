/**
 * Respaldo de AnimeTracker cuando AniList no responde (21-10-2026: 403 «temporarily disabled»).
 *
 * Fuentes, en este orden: Jikan (MyAnimeList, timeout corto), Simkl (calendario público, trae número de
 * episodio y hora) y Kitsu (solo ~6 títulos con próxima emisión; último recurso). Los IDs se
 * traducen a AniList con ARM (arm.haglund.dev), porque las listas del usuario guardan
 * IDs de AniList. Sin mapeo, el título igual se devuelve (id: null + idRespaldo).
 *
 * Todo el acceso a red y a caché entra por parámetros (fetchJson, cache), así los
 * normalizadores y la lógica se prueban sin red (functions/__tests__/animeRespaldo.test.js).
 * La salida de estrenosDia() es EXACTAMENTE el formato que arma el front en fetchDay:
 *   { id, title, cover, score(0-100), format, status, genres, siteUrl, episode|null, airingAt(s), fuente }
 */

const JIKAN = 'https://api.jikan.moe/v4';
const KITSU = 'https://kitsu.app/api/edge';
const ARM = 'https://arm.haglund.dev/api/v2/ids';
const SIMKL_CAL = 'https://data.simkl.in/calendar/anime.json';
const SIMKL_POSTER = 'https://simkl.in/posters/';

const HORA_MS = 3600 * 1000;
const DIA_MS = 24 * HORA_MS;
const TIMEOUT_JIKAN = 6000;
const TIMEOUT_KITSU = 10000;
const TTL_DIA_MS = HORA_MS;
const TTL_SNAPSHOT_MS = 25 * 60 * 1000;
const REINTENTO_SIN_MAPEO_DIAS = 2;
const HIST_DIAS = 10;

// Jikan caído: no se vuelve a intentar durante 5 min (por instancia) para no sumar 6 s a cada consulta.
let _jikanCaidoHasta = 0;

// ── Normalizadores puros ─────────────────────────────────────────────────────

const FORMATO_JIKAN = {
  tv: 'TV', movie: 'MOVIE', ova: 'OVA', ona: 'ONA', special: 'SPECIAL', 'tv special': 'SPECIAL',
  music: 'MUSIC', 'tv short': 'TV_SHORT', cm: 'SPECIAL', pv: 'SPECIAL',
};
const FORMATO_KITSU = { tv: 'TV', movie: 'MOVIE', ova: 'OVA', ona: 'ONA', special: 'SPECIAL', music: 'MUSIC' };

function formatoJikan(t) { return FORMATO_JIKAN[String(t || '').toLowerCase()] || 'TV'; }
function formatoKitsu(t) { return FORMATO_KITSU[String(t || '').toLowerCase()] || 'TV'; }

function estadoJikan(s) {
  const t = String(s || '').toLowerCase();
  if (t.includes('currently')) return 'RELEASING';
  if (t.includes('finished')) return 'FINISHED';
  if (t.includes('not yet')) return 'NOT_YET_RELEASED';
  return null;
}
function estadoKitsu(s) {
  switch (String(s || '').toLowerCase()) {
    case 'current': return 'RELEASING';
    case 'finished': return 'FINISHED';
    case 'upcoming': case 'unreleased': case 'tba': return 'NOT_YET_RELEASED';
    default: return null;
  }
}

function nota100(v, escala) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(escala === 10 ? n * 10 : n);
}

/** Jikan: «Mondays» + «01:00» + Asia/Tokyo → instantes (s) dentro de [from,to]. JST es UTC+9 fijo (sin horario de verano). */
const DIAS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function diaJikan(b) {
  const t = String((b && b.day) || '').toLowerCase().replace(/s$/, '');
  return DIAS_EN.indexOf(t);
}
function instantesJikan(broadcast, from, to) {
  const dow = diaJikan(broadcast);
  const m = /^(\d{1,2}):(\d{2})$/.exec(String((broadcast && broadcast.time) || ''));
  if (dow < 0 || !m) return [];
  if (broadcast.timezone && broadcast.timezone !== 'Asia/Tokyo') return [];
  const JST = 9 * 3600;
  const out = [];
  const d0 = Math.floor((from + JST) / 86400) - 1;
  const d1 = Math.floor((to + JST) / 86400) + 1;
  for (let d = d0; d <= d1; d++) {
    if ((new Date(d * 86400000).getUTCDay()) !== dow) continue;
    const t = d * 86400 + Number(m[1]) * 3600 + Number(m[2]) * 60 - JST;
    if (t >= from && t <= to) out.push(t);
  }
  return out;
}
/** Días de la semana (JST) que cubre [from,to], para pedir solo esos a Jikan. */
function diasJstDelRango(from, to) {
  const JST = 9 * 3600;
  const set = new Set();
  for (let d = Math.floor((from + JST) / 86400); d <= Math.floor((to + JST) / 86400); d++) {
    set.add(DIAS_EN[new Date(d * 86400000).getUTCDay()]);
  }
  return [...set];
}

/** Anime de Jikan → ficha base común (sin id de AniList todavía). */
function normJikan(d) {
  if (!d || !d.mal_id) return null;
  const rating = String(d.rating || '');
  const adulto = /^rx/i.test(rating) || /hentai/i.test(rating);
  const img = d.images && d.images.jpg;
  return {
    fuente: 'jikan',
    malId: Number(d.mal_id),
    kitsuId: null,
    title: d.title_english || d.title || '?',
    romaji: d.title || null,
    cover: (img && (img.large_image_url || img.image_url)) || null,
    score: nota100(d.score, 10),
    format: formatoJikan(d.type),
    status: estadoJikan(d.status),
    genres: (d.genres || []).map((g) => g.name).filter(Boolean).slice(0, 3),
    siteUrl: d.url || null,
    episodes: Number(d.episodes) || null,
    duration: Number((/(\d+)\s*min/i.exec(d.duration || '') || [])[1]) || null,
    descripcion: d.synopsis || null,
    startDate: (d.aired && d.aired.from) ? String(d.aired.from).slice(0, 10) : null,
    season: d.season && d.year ? `${String(d.season).toUpperCase()} ${d.year}` : null,
    broadcast: d.broadcast || null,
    airingAt: null,
    adulto,
  };
}

/** Anime de Kitsu (JSON:API) → ficha base común. */
function normKitsu(d) {
  if (!d || !d.id || !d.attributes) return null;
  const a = d.attributes;
  const t = a.titles || {};
  const poster = a.posterImage || {};
  const prox = a.nextRelease ? Date.parse(a.nextRelease) : NaN;
  return {
    fuente: 'kitsu',
    malId: null,
    kitsuId: Number(d.id),
    title: t.en || t.en_us || t.en_jp || a.canonicalTitle || '?',
    romaji: t.en_jp || a.canonicalTitle || null,
    cover: poster.large || poster.medium || poster.small || poster.original || null,
    score: nota100(a.averageRating, 100),
    format: formatoKitsu(a.subtype),
    status: estadoKitsu(a.status),
    genres: [],
    siteUrl: a.slug ? `https://kitsu.app/anime/${a.slug}` : null,
    episodes: Number(a.episodeCount) || null,
    duration: Number(a.episodeLength) || null,
    descripcion: a.synopsis || null,
    startDate: a.startDate || null,
    season: null,
    airingAt: Number.isFinite(prox) ? Math.floor(prox / 1000) : null,
    adulto: a.nsfw === true || a.ageRating === 'R18',
  };
}

function idRespaldoDe(base) {
  if (base.malId) return `mal:${base.malId}`;
  if (base.simklId) return `simkl:${base.simklId}`;
  return `kitsu:${base.kitsuId}`;
}

/**
 * Entrada del calendario de Simkl → ficha base + episodio y hora. Simkl marca «solo fecha»
 * con 00:00 JST: ahí la hora es desconocida (sinHora) y el front no debe mostrarla.
 */
function normSimkl(d) {
  if (!d || !d.ids || !d.ids.simkl_id || !d.date) return null;
  const at = Date.parse(d.date);
  if (!Number.isFinite(at)) return null;
  const mal = Number(d.ids.mal);
  const ep = d.episode && Number(d.episode.episode);
  const nota = d.ratings && d.ratings.simkl && Number(d.ratings.simkl.votes) >= 3 ? d.ratings.simkl.rating : null;
  return {
    fuente: 'simkl',
    malId: Number.isInteger(mal) && mal > 0 ? mal : null,
    simklId: Number(d.ids.simkl_id),
    kitsuId: null,
    title: d.title || '?',
    romaji: null,
    cover: d.poster ? `${SIMKL_POSTER}${d.poster}_m.jpg` : null,
    score: nota100(nota, 10),
    format: formatoJikan(d.anime_type),
    status: 'RELEASING',
    genres: [],
    siteUrl: d.url || null,
    episodes: null,
    airingAt: Math.floor(at / 1000),
    episodio: Number.isInteger(ep) && ep > 0 ? ep : null,
    sinHora: /T00:00:00[+-]09:00$/.test(String(d.date)),
    adulto: false,
  };
}

/** Ficha base + id de AniList (o null) → misma forma que arma fetchDay. */
function aFormatoDia(base, anilistId, airingAt, episode) {
  const id = Number.isInteger(anilistId) && anilistId > 0 ? anilistId : null;
  return {
    id,
    idRespaldo: id ? null : idRespaldoDe(base),
    title: base.title,
    cover: base.cover,
    score: base.score,
    format: base.format || 'TV',
    status: base.status,
    genres: base.genres || [],
    siteUrl: id ? `https://anilist.co/anime/${id}` : base.siteUrl,
    episode: Number.isInteger(episode) ? episode : null,
    airingAt,
    ...(base.sinHora ? { sinHora: true } : {}),
    fuente: base.fuente,
  };
}

/** Ficha base → forma de un resultado de búsqueda (doSearch del front). */
function aFormatoBusqueda(base, anilistId) {
  const id = Number.isInteger(anilistId) && anilistId > 0 ? anilistId : null;
  return {
    id,
    idRespaldo: id ? null : idRespaldoDe(base),
    title: base.title,
    romaji: base.romaji,
    status: base.status,
    format: base.format,
    score: base.score,
    episodes: base.episodes,
    duration: base.duration,
    season: base.season,
    genres: base.genres || [],
    cover: base.cover,
    siteUrl: id ? `https://anilist.co/anime/${id}` : base.siteUrl,
    description: base.descripcion ? String(base.descripcion).replace(/\n\n+/g, '\n').trim().slice(0, 600) : null,
    startDate: base.startDate,
    nextEp: base.airingAt
      ? { ep: null, airingAt: new Date(base.airingAt * 1000).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) }
      : null,
    fuente: base.fuente,
  };
}

// ── Mapeo de IDs hacia AniList (ARM) con caché ───────────────────────────────

/**
 * Valor guardado por id: >0 = id de AniList; <0 = «sin mapeo» el día -valor (se reintenta
 * pasados REINTENTO_SIN_MAPEO_DIAS días, porque ARM suma títulos nuevos con retraso).
 */
function claveMapeoVigente(v, hoyDia) {
  if (!Number.isFinite(v)) return false;
  if (v > 0) return true;
  return hoyDia - (-v) < REINTENTO_SIN_MAPEO_DIAS;
}

async function mapearIds(ctx, fuente, ids) {
  const resultado = new Map();
  const unicos = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 50000000))];
  if (!unicos.length) return resultado;
  const docId = `ids_${fuente}`;
  const hoyDia = Math.floor(ctx.ahora() / DIA_MS);
  let doc = null;
  try { doc = await ctx.cache.get(docId); } catch { doc = null; }
  const mapa = Object.assign({}, doc && doc.mapa);
  const faltan = [];
  for (const id of unicos) {
    const v = mapa[id];
    if (claveMapeoVigente(v, hoyDia)) { if (v > 0) resultado.set(id, v); } else faltan.push(id);
  }
  let cambio = false;
  for (let i = 0; i < faltan.length; i += 100) {
    const lote = faltan.slice(i, i + 100);
    let resp;
    try {
      resp = await ctx.fetchJson(ARM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lote.map((id) => ({ [fuente]: id }))),
        timeout: TIMEOUT_KITSU,
      });
    } catch { continue; } // ARM caído: no se cachea nada, se reintenta luego
    if (!Array.isArray(resp) || resp.length !== lote.length) continue;
    lote.forEach((id, k) => {
      const al = resp[k] && Number(resp[k].anilist);
      if (Number.isInteger(al) && al > 0) { mapa[id] = al; resultado.set(id, al); } else mapa[id] = -hoyDia;
      cambio = true;
    });
  }
  if (cambio) { try { await ctx.cache.set(docId, { mapa, ts: ctx.ahora() }); } catch { /* caché opcional */ } }
  return resultado;
}

/** Inverso de mapearIds: ids de AniList → ids de MyAnimeList (ARM), con la misma caché y reintento. */
async function malDeAnilist(ctx, ids) {
  const resultado = new Map();
  const unicos = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 50000000))];
  if (!unicos.length) return resultado;
  const docId = 'ids_anilist_mal';
  const hoyDia = Math.floor(ctx.ahora() / DIA_MS);
  let doc = null;
  try { doc = await ctx.cache.get(docId); } catch { doc = null; }
  const mapa = Object.assign({}, doc && doc.mapa);
  const faltan = [];
  for (const id of unicos) {
    const v = mapa[id];
    if (claveMapeoVigente(v, hoyDia)) { if (v > 0) resultado.set(id, v); } else faltan.push(id);
  }
  let cambio = false;
  for (let i = 0; i < faltan.length; i += 100) {
    const lote = faltan.slice(i, i + 100);
    let resp;
    try {
      resp = await ctx.fetchJson(ARM, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lote.map((id) => ({ anilist: id }))), timeout: TIMEOUT_KITSU });
    } catch { continue; }
    if (!Array.isArray(resp) || resp.length !== lote.length) continue;
    lote.forEach((id, k) => {
      const mal = resp[k] && Number(resp[k].myanimelist);
      if (Number.isInteger(mal) && mal > 0) { mapa[id] = mal; resultado.set(id, mal); } else mapa[id] = -hoyDia;
      cambio = true;
    });
  }
  if (cambio) { try { await ctx.cache.set(docId, { mapa, ts: ctx.ahora() }); } catch { /* caché opcional */ } }
  return resultado;
}

/**
 * Cuántos episodios ya salieron según el calendario de Simkl (ayer…+30 días, con número de episodio).
 * Por serie: emitidos = max(último episodio con hora ya pasada, primer episodio futuro − 1).
 * Un episodio «solo fecha» (00:00 JST) cuenta como salido recién al terminar ese día JST.
 * Sin entradas de la serie en el calendario no hay dato: no se devuelve nada (nunca un 0 inventado).
 * items: salida de normSimkl; malPorAnilist: Map anilistId → malId; ahoraS: epoch en segundos.
 */
function emitidosDeCalendario(items, malPorAnilist, ahoraS) {
  const porMal = new Map();
  for (const b of items) {
    if (!b || !b.malId || !Number.isInteger(b.episodio) || !b.airingAt) continue;
    if (!porMal.has(b.malId)) porMal.set(b.malId, []);
    porMal.get(b.malId).push(b);
  }
  const out = {};
  for (const [anilist, mal] of malPorAnilist) {
    const lista = porMal.get(mal);
    if (!lista || !lista.length) continue;
    const salio = (b) => (b.sinHora ? b.airingAt + 86400 : b.airingAt) <= ahoraS;
    const pasados = lista.filter(salio).map((b) => b.episodio);
    const futuros = lista.filter((b) => !salio(b));
    const proximo = futuros.sort((x, y) => x.airingAt - y.airingAt)[0] || null;
    const desdePasado = pasados.length ? Math.max(...pasados) : 0;
    const desdeFuturo = proximo ? proximo.episodio - 1 : 0;
    const emitidos = Math.max(desdePasado, desdeFuturo);
    if (emitidos < 1) continue;
    out[anilist] = { emitidos, proximo: proximo ? { ep: proximo.episodio, at: proximo.airingAt } : null };
  }
  return out;
}

// ── Segunda fuente: TMDB (/tv) para lo que el calendario de Simkl no trae ─────

const TTL_EMITIDOS_TMDB_MS = 6 * HORA_MS;

/**
 * Episodios emitidos según TMDB, en la numeración de la ENTRADA DE AniList. Pura (sin red).
 *   tv:        respuesta de TMDB /tv/{id} (last/next_episode_to_air, seasons[].episode_count)
 *   temporada: themoviedb-season de ARM (null = ARM no la sabe, p. ej. One Piece)
 *   aniEps:    episodios de la entrada de AniList (0/null = no se sabe)
 *   vistos:    episodios vistos (evidencia de numeración absoluta en los long-runners)
 * Reglas (si no se puede decidir → null = «sin dato», nunca un número a ojo):
 *  - ARM da temporada: número relativo a esa temporada. Si AniList tiene MENOS episodios que la
 *    temporada de TMDB, la entrada es solo parte de ella (cour) y la numeración es ambigua → null.
 *  - ARM sin temporada: con una sola temporada (o la última es la 1) absoluto = relativo. Con varias:
 *    absoluto (suma de episode_count de las anteriores) si AniList o lo visto superan la última
 *    temporada; relativo si AniList cabe en ella; sin evidencia o con evidencia contradictoria → null.
 */
function emitidosTmdb(tv, { temporada, aniEps, vistos } = {}) {
  const last = tv && tv.last_episode_to_air;
  if (!last || !Number.isInteger(last.season_number) || !Number.isInteger(last.episode_number)) return null;
  const regulares = (tv.seasons || []).filter((s) => s && s.season_number >= 1 && s.episode_count > 0);
  const cuenta = (n) => { const s = regulares.find((x) => x.season_number === n); return s ? s.episode_count : 0; };
  const sL = last.season_number;
  const eL = last.episode_number;
  const next = tv.next_episode_to_air;
  const mismoNext = next && next.season_number === sL && Number.isInteger(next.episode_number);
  const enSL = mismoNext ? Math.max(eL, next.episode_number - 1) : eL;
  const aniE = Number(aniEps) || 0;
  const w = Number(vistos) || 0;
  let n;
  let offset = 0;
  if (Number.isInteger(temporada) && temporada >= 1) {
    const c = cuenta(temporada);
    if (!c || sL < temporada) return null;
    if (aniE && aniE < c) return null;
    // ARM a veces apunta a la temporada 1 de una serie que ya va en la 3 (visto con Re:ZERO): si TMDB ya
    // emitió una temporada posterior, solo sirve si la entrada de AniList es justo esa temporada completa.
    if (sL > temporada && aniE !== c) return null;
    n = sL > temporada ? c : enSL;
  } else if (regulares.length <= 1 || sL === 1) {
    n = enSL;
  } else {
    const cL = cuenta(sL);
    const absoluta = (aniE > 0 && aniE > cL) || w > cL;
    const relativa = aniE > 0 && aniE <= cL;
    if (absoluta === relativa) return null; // sin evidencia, o contradictoria
    if (absoluta) offset = regulares.filter((s) => s.season_number < sL).reduce((t, s) => t + s.episode_count, 0);
    n = offset + enSL;
  }
  if (aniE) n = Math.min(n, aniE);
  if (!(n >= 1)) return null;
  let proximo = null;
  if (mismoNext && next.air_date) {
    const at = Date.parse(next.air_date);
    if (Number.isFinite(at)) proximo = { ep: offset + next.episode_number, at: Math.floor(at / 1000) };
  }
  return { emitidos: n, proximo };
}

/** ARM: ids de AniList → { tmdb, temporada } (cacheado; los sin mapeo se reintentan a los 2 días). */
async function tmdbDeAnilist(ctx, ids) {
  const resultado = new Map();
  const unicos = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 50000000))];
  if (!unicos.length) return resultado;
  const docId = 'ids_anilist_tmdb';
  const hoyDia = Math.floor(ctx.ahora() / DIA_MS);
  let doc = null;
  try { doc = await ctx.cache.get(docId); } catch { doc = null; }
  const mapa = Object.assign({}, doc && doc.mapa);
  const faltan = [];
  for (const id of unicos) {
    const v = mapa[id];
    if (v && typeof v === 'object') resultado.set(id, v);
    else if (Number.isFinite(v) && v < 0 && hoyDia - (-v) < REINTENTO_SIN_MAPEO_DIAS) continue;
    else faltan.push(id);
  }
  let cambio = false;
  for (let i = 0; i < faltan.length; i += 100) {
    const lote = faltan.slice(i, i + 100);
    let resp;
    try {
      resp = await ctx.fetchJson(ARM, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lote.map((id) => ({ anilist: id }))), timeout: TIMEOUT_KITSU });
    } catch { continue; }
    if (!Array.isArray(resp) || resp.length !== lote.length) continue;
    lote.forEach((id, k) => {
      const r = resp[k];
      const t = r && Number(r.themoviedb);
      const s = r && Number(r['themoviedb-season']);
      const solo = r && String(r.media || '').toLowerCase() === 'movie';
      if (Number.isInteger(t) && t > 0 && !solo) {
        const v = { t, s: Number.isInteger(s) && s >= 1 ? s : null };
        mapa[id] = v; resultado.set(id, v);
      } else mapa[id] = -hoyDia;
      cambio = true;
    });
  }
  if (cambio) { try { await ctx.cache.set(docId, { mapa, ts: ctx.ahora() }); } catch { /* caché opcional */ } }
  return resultado;
}

/** Corre `fn` sobre `lista` con a lo más `n` a la vez. */
async function enParalelo(lista, n, fn) {
  const cola = [...lista];
  await Promise.all(Array.from({ length: Math.min(n, cola.length) }, async () => {
    while (cola.length) { const x = cola.shift(); await fn(x); }
  }));
}

/** Completa con TMDB los ids que Simkl no trae. Cachea el cálculo por id ~6 h (clave = datos de entrada). */
async function emitidosPorTmdb(ctx, ids, info) {
  const out = {};
  if (!ctx.tmdbTv || !ids.length) return out;
  const mapa = await tmdbDeAnilist(ctx, ids);
  let doc = null;
  try { doc = await ctx.cache.get('emitidos_tmdb'); } catch { doc = null; }
  const guardado = Object.assign({}, doc && doc.items);
  const ahora = ctx.ahora();
  let cambio = false;
  await enParalelo(ids.filter((id) => mapa.has(id)), 8, async (id) => {
    const m = mapa.get(id);
    const inf = (info && info[id]) || {};
    const k = `${m.t}|${m.s}|${inf.eps || 0}|${inf.vistos || 0}`;
    const g = guardado[id];
    if (g && g.k === k && ahora - g.ts < TTL_EMITIDOS_TMDB_MS) { if (g.res) out[id] = g.res; return; }
    let tv;
    try { tv = await ctx.tmdbTv(m.t); } catch { return; } // TMDB caído para esta serie: sin dato, sin cachear
    const r = emitidosTmdb(tv, { temporada: m.s, aniEps: inf.eps, vistos: inf.vistos });
    guardado[id] = { k, ts: ahora, res: r };
    cambio = true;
    if (r) out[id] = r;
  });
  if (cambio) { try { await ctx.cache.set('emitidos_tmdb', { items: guardado, ts: ahora }); } catch { /* caché opcional */ } }
  return out;
}

// ── Jikan ────────────────────────────────────────────────────────────────────

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function jikanDia(ctx, from, to) {
  if (ctx.ahora() < _jikanCaidoHasta) throw new Error('Jikan en pausa');
  const bases = new Map(); // malId → { base, instantes }
  try {
    for (const dia of diasJstDelRango(from, to)) {
      for (let p = 1; p <= 4; p++) {
        const j = await ctx.fetchJson(`${JIKAN}/schedules?filter=${dia}&sfw=true&limit=25&page=${p}`, { timeout: TIMEOUT_JIKAN });
        if (!j || !Array.isArray(j.data)) throw new Error('Jikan: respuesta inválida');
        for (const d of j.data) {
          const b = normJikan(d);
          if (!b || b.adulto || bases.has(b.malId)) continue;
          const t = instantesJikan(b.broadcast, from, to);
          if (t.length) bases.set(b.malId, { base: b, instantes: t });
        }
        if (!(j.pagination && j.pagination.has_next_page)) break;
        await pausa(ctx.pausaJikanMs); // límite público de Jikan: 3 req/s
      }
    }
  } catch (e) {
    _jikanCaidoHasta = ctx.ahora() + 5 * 60 * 1000;
    throw e;
  }
  const mapa = await mapearIds(ctx, 'myanimelist', [...bases.keys()]);
  const items = [];
  for (const { base, instantes } of bases.values()) {
    for (const t of instantes) items.push(aFormatoDia(base, mapa.get(base.malId), t, null));
  }
  return items;
}

async function jikanBuscar(ctx, texto) {
  if (ctx.ahora() < _jikanCaidoHasta) throw new Error('Jikan en pausa');
  let j;
  try {
    j = await ctx.fetchJson(`${JIKAN}/anime?q=${encodeURIComponent(texto)}&sfw=true&limit=20&order_by=popularity`, { timeout: TIMEOUT_JIKAN });
  } catch (e) { _jikanCaidoHasta = ctx.ahora() + 5 * 60 * 1000; throw e; }
  if (!j || !Array.isArray(j.data)) throw new Error('Jikan: respuesta inválida');
  const bases = j.data.map(normJikan).filter((b) => b && !b.adulto);
  const mapa = await mapearIds(ctx, 'myanimelist', bases.map((b) => b.malId));
  return bases.map((b) => aFormatoBusqueda(b, mapa.get(b.malId)));
}

// ── Simkl ────────────────────────────────────────────────────────────────────

/** Calendario público de Simkl (~560 emisiones, de ayer a +30 días), cacheado 25 min. */
async function simklCalendario(ctx) {
  let previo = null;
  try { previo = await ctx.cache.get('simkl_cal'); } catch { previo = null; }
  if (previo && previo.ts && ctx.ahora() - previo.ts < TTL_SNAPSHOT_MS && Array.isArray(previo.items)) return previo;
  const j = await ctx.fetchJson(SIMKL_CAL, { timeout: TIMEOUT_KITSU });
  if (!Array.isArray(j)) throw new Error('Simkl: respuesta inválida');
  const items = j.map(normSimkl).filter((b) => b && !b.adulto);
  if (!items.length) throw new Error('Simkl: calendario vacío');
  const snap = { ts: ctx.ahora(), items };
  try { await ctx.cache.set('simkl_cal', snap); } catch { /* caché opcional */ }
  return snap;
}

async function simklDia(ctx, from, to) {
  const snap = await simklCalendario(ctx);
  const enRango = snap.items.filter((b) => b.airingAt >= from && b.airingAt <= to);
  // Si el rango es anterior a lo que cubre el calendario, no hay datos: que pruebe otra fuente.
  const primero = Math.min(...snap.items.map((b) => b.airingAt));
  if (!enRango.length && from < primero) throw new Error('Simkl: rango fuera del calendario');
  const mapa = await mapearIds(ctx, 'myanimelist', enRango.map((b) => b.malId));
  return enRango.map((b) => aFormatoDia(b, mapa.get(b.malId), b.airingAt, b.episodio));
}

// ── Kitsu ────────────────────────────────────────────────────────────────────

const CAMPOS_KITSU = 'canonicalTitle,titles,nextRelease,subtype,posterImage,averageRating,episodeCount,episodeLength,slug,ageRating,nsfw,status,startDate';

function urlKitsu(params) {
  const qs = new URLSearchParams(params).toString();
  return `${KITSU}/anime?${qs}`;
}
const CABECERA_KITSU = { Accept: 'application/vnd.api+json' };

/**
 * Foto de lo que está en emisión en Kitsu (~430 títulos, 22 páginas de 20), cacheada 25 min.
 * Kitsu solo publica el PRÓXIMO episodio (nextRelease); para poder responder «qué salió hoy»
 * se guarda en `hist` cada nextRelease que ya pasó y cambió entre una foto y la siguiente.
 */
async function kitsuSnapshot(ctx) {
  let previo = null;
  try { previo = await ctx.cache.get('kitsu_emision'); } catch { previo = null; }
  const ahora = ctx.ahora();
  if (previo && previo.ts && ahora - previo.ts < TTL_SNAPSHOT_MS && Array.isArray(previo.items)) return previo;

  const base = { 'filter[status]': 'current', sort: '-userCount', 'page[limit]': '20', 'fields[anime]': CAMPOS_KITSU };
  const pagina = (off) => ctx.fetchJson(urlKitsu({ ...base, 'page[offset]': String(off) }), { headers: CABECERA_KITSU, timeout: TIMEOUT_KITSU });
  const primera = await pagina(0);
  if (!primera || !Array.isArray(primera.data)) throw new Error('Kitsu: respuesta inválida');
  const total = Math.min(Number(primera.meta && primera.meta.count) || primera.data.length, 600);
  const datos = [...primera.data];
  const offsets = [];
  for (let o = 20; o < total; o += 20) offsets.push(o);
  for (let i = 0; i < offsets.length; i += 4) {
    const lote = await Promise.all(offsets.slice(i, i + 4).map(pagina));
    for (const r of lote) if (r && Array.isArray(r.data)) datos.push(...r.data);
  }
  const items = [];
  const vistos = new Set();
  for (const d of datos) {
    const b = normKitsu(d);
    if (!b || b.adulto || vistos.has(b.kitsuId)) continue;
    vistos.add(b.kitsuId);
    items.push({ k: b.kitsuId, t: b.title, r: b.romaji, c: b.cover, s: b.score, f: b.format, st: b.status, n: b.airingAt, e: b.episodes, u: b.siteUrl });
  }

  // Historial de emisiones ya ocurridas.
  const hist = {};
  const corte = Math.floor(ahora / 1000) - HIST_DIAS * 86400;
  if (previo && previo.hist) {
    for (const [k, arr] of Object.entries(previo.hist)) {
      const v = (arr || []).filter((t) => t >= corte);
      if (v.length) hist[k] = v;
    }
  }
  if (previo && Array.isArray(previo.items)) {
    const ahoraS = Math.floor(ahora / 1000);
    for (const p of previo.items) {
      if (!p.n || p.n > ahoraS || p.n < corte) continue;
      const lista = hist[p.k] || (hist[p.k] = []);
      if (!lista.includes(p.n)) lista.push(p.n);
    }
  }
  const snap = { ts: ahora, items, hist };
  try { await ctx.cache.set('kitsu_emision', snap); } catch { /* caché opcional */ }
  return snap;
}

function baseDeSnapshot(it) {
  return {
    fuente: 'kitsu', malId: null, kitsuId: it.k, title: it.t, romaji: it.r, cover: it.c, score: it.s,
    format: it.f, status: it.st, genres: [], siteUrl: it.u, episodes: it.e,
  };
}

/** Emisiones de la foto de Kitsu dentro de [from,to] (próximas por nextRelease + pasadas por historial). */
function emisionesEnRango(snap, from, to) {
  const out = [];
  const vistos = new Set();
  for (const it of snap.items) {
    const ts = [];
    if (it.n && it.n >= from && it.n <= to) ts.push(it.n);
    for (const t of (snap.hist && snap.hist[it.k]) || []) if (t >= from && t <= to) ts.push(t);
    for (const t of ts) {
      const clave = `${it.k}_${t}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      out.push({ it, t });
    }
  }
  return out;
}

async function kitsuDia(ctx, from, to) {
  const snap = await kitsuSnapshot(ctx);
  const emis = emisionesEnRango(snap, from, to);
  const mapa = await mapearIds(ctx, 'kitsu', emis.map((x) => x.it.k));
  return emis.map(({ it, t }) => aFormatoDia(baseDeSnapshot(it), mapa.get(it.k), t, null));
}

async function kitsuBuscar(ctx, texto) {
  const j = await ctx.fetchJson(urlKitsu({ 'filter[text]': texto, 'page[limit]': '20', 'fields[anime]': `${CAMPOS_KITSU},synopsis` }),
    { headers: CABECERA_KITSU, timeout: TIMEOUT_KITSU });
  if (!j || !Array.isArray(j.data)) throw new Error('Kitsu: respuesta inválida');
  const bases = j.data.map(normKitsu).filter((b) => b && !b.adulto);
  const mapa = await mapearIds(ctx, 'kitsu', bases.map((b) => b.kitsuId));
  return bases.map((b) => aFormatoBusqueda(b, mapa.get(b.kitsuId)));
}

// ── API pública ──────────────────────────────────────────────────────────────

function ordenar(items) {
  return items.sort((a, b) => (a.airingAt || 0) - (b.airingAt || 0) || String(a.title).localeCompare(String(b.title)));
}

/**
 * ctx = { fetchJson(url, {method,headers,body,timeout}) → json, cache: {get(id), set(id,obj)},
 *         ahora?: () => ms, pausaJikanMs?: number }
 */
function crearRespaldo(opciones) {
  const ctx = Object.assign({ ahora: () => Date.now(), pausaJikanMs: 400 }, opciones);

  async function conCacheDia(clave, calcular) {
    const hit = await ctx.cache.get(clave).catch(() => null);
    if (hit && hit.ts && ctx.ahora() - hit.ts < TTL_DIA_MS && Array.isArray(hit.items)) return { items: hit.items, fuente: hit.fuente, cache: true };
    const r = await calcular();
    await ctx.cache.set(clave, { ts: ctx.ahora(), items: r.items, fuente: r.fuente, expiraEn: ctx.ahora() + 2 * DIA_MS }).catch(() => {});
    return r;
  }

  async function primeroQueResponda(intentos) {
    const errores = [];
    for (const [fuente, fn] of intentos) {
      try { return { items: await fn(), fuente }; } catch (e) { errores.push(`${fuente}: ${e.message}`); }
    }
    throw new Error(`Sin respaldo disponible (${errores.join(' | ')})`);
  }

  return {
    /** Estrenos con hora dentro de [from,to] (segundos epoch). */
    async estrenosDia(from, to, { cachear = true } = {}) {
      const calcular = async () => {
        const r = await primeroQueResponda([['simkl', () => simklDia(ctx, from, to)], ['jikan', () => jikanDia(ctx, from, to)], ['kitsu', () => kitsuDia(ctx, from, to)]]);
        return { items: ordenar(r.items), fuente: r.fuente };
      };
      return cachear ? conCacheDia(`dia_${from}_${to}`, calcular) : calcular();
    },
    async buscar(texto) {
      const t = String(texto || '').trim().slice(0, 100);
      if (!t) return { items: [], fuente: null };
      return primeroQueResponda([['jikan', () => jikanBuscar(ctx, t)], ['kitsu', () => kitsuBuscar(ctx, t)]]);
    },
    /** Episodios ya emitidos de los ids de AniList dados, según Simkl: { fuente, items:{id:{emitidos,proximo}} }. */
    async emitidos(anilistIds, info) {
      const ids = [...new Set((anilistIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
      if (!ids.length) return { fuente: 'simkl', items: {} };
      // Simkl primero (calendario cacheado); TMDB solo para los ids que Simkl no trae. Si Simkl cae, TMDB sigue.
      let simkl = {};
      try {
        const [snap, mal] = await Promise.all([simklCalendario(ctx), malDeAnilist(ctx, ids)]);
        simkl = emitidosDeCalendario(snap.items, mal, Math.floor(ctx.ahora() / 1000));
      } catch (e) { if (!ctx.tmdbTv) throw e; }
      const tmdb = await emitidosPorTmdb(ctx, ids.filter((id) => !simkl[id]), info).catch(() => ({}));
      const items = {};
      for (const id of ids) {
        if (simkl[id]) items[id] = { ...simkl[id], fuente: 'simkl' };
        else if (tmdb[id]) items[id] = { ...tmdb[id], fuente: 'tmdb' };
      }
      return { fuente: 'simkl', items };
    },
    /** Para los crons: emisiones recientes sin caché de día. */
    episodiosEntre(desde, hasta) { return this.estrenosDia(desde, hasta, { cachear: false }); },
  };
}

/** Clave estable de aviso cuando no se conoce el número de episodio: id + día de emisión en Santiago. */
function claveAvisoEpisodio(id, episodio, airingAt) {
  if (Number.isInteger(episodio)) return `ep_${id}_${episodio}`;
  const dia = new Date(airingAt * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }).replace(/-/g, '');
  return `ep_${id}_f${dia}`;
}

module.exports = {
  crearRespaldo, claveAvisoEpisodio,
  // exportados para pruebas
  normJikan, normKitsu, normSimkl, simklCalendario, aFormatoDia, aFormatoBusqueda, instantesJikan, diasJstDelRango,
  mapearIds, malDeAnilist, emitidosDeCalendario, emitidosTmdb, tmdbDeAnilist, emisionesEnRango, kitsuSnapshot, claveMapeoVigente,
  _reiniciarJikan() { _jikanCaidoHasta = 0; },
};
