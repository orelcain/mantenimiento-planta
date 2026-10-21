/**
 * Respaldo de AnimeTracker (Jikan / Kitsu / ARM) — node:test nativo, sin red.
 * Las muestras de Kitsu y ARM son recortes de respuestas reales del 21-10-2026.
 * La de Jikan sigue la forma documentada de /v4/schedules (el servicio estaba caído ese día).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const R = require('../animeRespaldo')

// Kitsu real (anime/12, recortado)
const KITSU_ONE_PIECE = {
  id: '12', type: 'anime',
  attributes: {
    canonicalTitle: 'One Piece',
    titles: { en: 'One Piece', en_jp: 'One Piece', ja_jp: 'ONE PIECE' },
    nextRelease: '2026-10-25T09:30:00.000+09:00', subtype: 'TV',
    posterImage: { large: 'https://media.kitsu.app/anime/poster_images/12/large.jpg', small: 'https://media.kitsu.app/anime/poster_images/12/small.jpg' },
    averageRating: '84.0', episodeCount: null, slug: 'one-piece', ageRating: 'PG',
  },
}
const KITSU_ADULTO = { id: '99', attributes: { canonicalTitle: 'X', subtype: 'OVA', ageRating: 'R18', nsfw: true } }

const JIKAN_ITEM = {
  mal_id: 21, url: 'https://myanimelist.net/anime/21/One_Piece', title: 'One Piece', title_english: null,
  images: { jpg: { image_url: 'https://cdn.myanimelist.net/a.jpg', large_image_url: 'https://cdn.myanimelist.net/a_l.jpg' } },
  type: 'TV', episodes: null, status: 'Currently Airing', score: 8.73, rating: 'PG-13 - Teens 13 or older',
  broadcast: { day: 'Sundays', time: '09:30', timezone: 'Asia/Tokyo', string: 'Sundays at 09:30 (JST)' },
  genres: [{ name: 'Action' }, { name: 'Adventure' }, { name: 'Fantasy' }, { name: 'Comedy' }],
}

test('normKitsu: título, portada, nota 0-100, formato y próxima emisión en segundos', () => {
  const b = R.normKitsu(KITSU_ONE_PIECE)
  assert.strictEqual(b.title, 'One Piece')
  assert.strictEqual(b.kitsuId, 12)
  assert.strictEqual(b.cover, 'https://media.kitsu.app/anime/poster_images/12/large.jpg')
  assert.strictEqual(b.score, 84)
  assert.strictEqual(b.format, 'TV')
  assert.strictEqual(b.airingAt, Date.parse('2026-10-25T00:30:00Z') / 1000)
  assert.strictEqual(b.adulto, false)
  assert.strictEqual(R.normKitsu(KITSU_ADULTO).adulto, true)
  assert.strictEqual(R.normKitsu(null), null)
})

test('normJikan: nota 0-10 a 0-100, géneros recortados, adulto por clasificación', () => {
  const b = R.normJikan(JIKAN_ITEM)
  assert.strictEqual(b.malId, 21)
  assert.strictEqual(b.score, 87)
  assert.deepStrictEqual(b.genres, ['Action', 'Adventure', 'Fantasy'])
  assert.strictEqual(b.cover, 'https://cdn.myanimelist.net/a_l.jpg')
  assert.strictEqual(b.status, 'RELEASING')
  assert.strictEqual(R.normJikan({ ...JIKAN_ITEM, rating: 'Rx - Hentai' }).adulto, true)
})

test('instantesJikan: domingo 09:30 JST = domingo 00:30 UTC, solo dentro del rango', () => {
  const from = Date.parse('2026-10-25T00:00:00Z') / 1000
  const to = from + 86399
  assert.deepStrictEqual(R.instantesJikan(JIKAN_ITEM.broadcast, from, to), [Date.parse('2026-10-25T00:30:00Z') / 1000])
  assert.deepStrictEqual(R.instantesJikan(JIKAN_ITEM.broadcast, from - 86400, to - 86400), [])
  // zona distinta de Tokio o sin hora: se descarta (no se inventa)
  assert.deepStrictEqual(R.instantesJikan({ day: 'Sundays', time: '09:30', timezone: 'America/New_York' }, from, to), [])
  assert.deepStrictEqual(R.instantesJikan({ day: 'Sundays', time: null }, from, to), [])
})

test('diasJstDelRango: un día chileno puede tocar dos días JST', () => {
  const from = Date.parse('2026-10-25T03:00:00Z') / 1000
  assert.deepStrictEqual(R.diasJstDelRango(from, from + 86399).sort(), ['monday', 'sunday'])
})

test('aFormatoDia: con mapeo usa id y enlace de AniList; sin mapeo conserva idRespaldo y episodio null', () => {
  const b = R.normKitsu(KITSU_ONE_PIECE)
  const con = R.aFormatoDia(b, 21, b.airingAt, null)
  assert.strictEqual(con.id, 21)
  assert.strictEqual(con.siteUrl, 'https://anilist.co/anime/21')
  assert.strictEqual(con.episode, null)
  assert.strictEqual(con.fuente, 'kitsu')
  assert.deepStrictEqual(Object.keys(con).sort(), ['airingAt', 'cover', 'episode', 'format', 'fuente', 'genres', 'id', 'idRespaldo', 'score', 'siteUrl', 'status', 'title'])
  const sin = R.aFormatoDia(b, undefined, b.airingAt, null)
  assert.strictEqual(sin.id, null)
  assert.strictEqual(sin.idRespaldo, 'kitsu:12')
  assert.strictEqual(sin.siteUrl, 'https://kitsu.app/anime/one-piece')
})

function cacheEnMemoria() {
  const m = new Map()
  return { m, get: async (id) => (m.has(id) ? structuredClone(m.get(id)) : null), set: async (id, o) => { m.set(id, structuredClone(o)) } }
}

// ARM real: POST devuelve un arreglo alineado, null donde no hay mapeo
function armFalso(tabla, llamadas) {
  return async (url, o) => {
    assert.ok(url.startsWith('https://arm.haglund.dev/'))
    const pedidos = JSON.parse(o.body)
    llamadas.push(pedidos)
    return pedidos.map((p) => { const [fuente, id] = Object.entries(p)[0]; return tabla[`${fuente}:${id}`] ? { anilist: tabla[`${fuente}:${id}`] } : null })
  }
}

test('mapearIds: traduce en lote, cachea aciertos y fallos, y no vuelve a pedir lo cacheado', async () => {
  const cache = cacheEnMemoria()
  const llamadas = []
  let t = Date.parse('2026-10-21T12:00:00Z')
  const ctx = { cache, ahora: () => t, fetchJson: armFalso({ 'kitsu:12': 21, 'kitsu:210': 235 }, llamadas) }
  const r1 = await R.mapearIds(ctx, 'kitsu', [12, 210, 777, 12])
  assert.deepStrictEqual([...r1.entries()], [[12, 21], [210, 235]])
  assert.strictEqual(llamadas.length, 1)
  assert.strictEqual(llamadas[0].length, 3) // sin duplicados
  await R.mapearIds(ctx, 'kitsu', [12, 210, 777])
  assert.strictEqual(llamadas.length, 1) // todo desde caché, incluso el sin mapeo
  t += 3 * 86400000 // pasados 2 días se reintenta lo que no tenía mapeo
  await R.mapearIds(ctx, 'kitsu', [12, 777])
  assert.strictEqual(llamadas.length, 2)
  assert.deepStrictEqual(llamadas[1], [{ kitsu: 777 }])
})

test('mapearIds: si ARM falla no lanza ni cachea; ids inválidos ni se envían', async () => {
  const cache = cacheEnMemoria()
  const ctx = { cache, ahora: () => Date.now(), fetchJson: async () => { throw new Error('HTTP 503') } }
  const r = await R.mapearIds(ctx, 'myanimelist', [21])
  assert.strictEqual(r.size, 0)
  assert.strictEqual(cache.m.size, 0)
  const llamadas = []
  await R.mapearIds({ cache, ahora: () => Date.now(), fetchJson: armFalso({}, llamadas) }, 'kitsu', [999999999, -1, 'x'])
  assert.strictEqual(llamadas.length, 0)
})

test('claveAvisoEpisodio: con número es la de siempre; sin número usa el día de emisión en Santiago', () => {
  assert.strictEqual(R.claveAvisoEpisodio(21, 1100, 0), 'ep_21_1100')
  // 2026-10-25 00:30Z = 24-10 21:30 en Chile (UTC-3 en octubre)
  const t = Date.parse('2026-10-25T00:30:00Z') / 1000
  assert.strictEqual(R.claveAvisoEpisodio(21, null, t), 'ep_21_f20261024')
  assert.strictEqual(R.claveAvisoEpisodio(21, null, t + 600), R.claveAvisoEpisodio(21, null, t))
})

function kitsuFalso(filas, contador) {
  return async (url) => {
    contador.n++
    const off = Number(new URL(url).searchParams.get('page[offset]') || 0)
    return { data: filas.slice(off, off + 20), meta: { count: filas.length } }
  }
}
const kd = (id, prox) => ({ id: String(id), attributes: { canonicalTitle: `Serie ${id}`, titles: { en: `Serie ${id}` }, subtype: 'TV', averageRating: '70', nextRelease: prox, slug: `s-${id}`, ageRating: 'PG' } })

test('kitsuSnapshot: pagina, descarta adultos y arma historial de emisiones pasadas', async () => {
  const cache = cacheEnMemoria()
  const n = { n: 0 }
  let t = Date.parse('2026-10-21T10:00:00Z')
  const pasada = '2026-10-21T08:00:00.000Z' // ya salió a las 08:00Z
  const datos1 = Array.from({ length: 45 }, (_, i) => kd(i + 1, i === 0 ? pasada : '2026-10-30T00:00:00.000Z'))
  datos1.push(KITSU_ADULTO)
  const ctx = { cache, ahora: () => t, fetchJson: kitsuFalso(datos1, n) }
  const s1 = await R.kitsuSnapshot(ctx)
  assert.strictEqual(s1.items.length, 45)
  assert.strictEqual(n.n, 3) // 46 filas son 3 páginas de 20
  await R.kitsuSnapshot(ctx)
  assert.strictEqual(n.n, 3) // vigente: sin red

  // 30 min después Kitsu ya movió el nextRelease de la serie 1 a la semana siguiente
  t += 30 * 60 * 1000
  const datos2 = datos1.map((d) => (d.id === '1' ? kd(1, '2026-10-28T08:00:00.000Z') : d))
  const s2 = await R.kitsuSnapshot({ ...ctx, fetchJson: kitsuFalso(datos2, n) })
  assert.deepStrictEqual(s2.hist['1'], [Date.parse(pasada) / 1000])
  // lo que salió hoy aparece por el historial aunque nextRelease ya sea futuro
  const from = Date.parse('2026-10-21T03:00:00Z') / 1000
  const hoy = R.emisionesEnRango(s2, from, from + 86399)
  assert.deepStrictEqual(hoy.map((x) => [x.it.k, x.t]), [[1, Date.parse(pasada) / 1000]])
})

test('estrenosDia: Jikan caído, cae a Kitsu, traduce IDs, marca la fuente y cachea', async () => {
  R._reiniciarJikan()
  const hoyIni = Date.parse('2026-10-25T00:00:00Z') / 1000
  const llamadas = []
  const arm = armFalso({ 'kitsu:1': 111 }, llamadas)
  const urls = []
  const ctx = {
    cache: cacheEnMemoria(), ahora: () => Date.parse('2026-10-24T20:00:00Z'), pausaJikanMs: 0,
    fetchJson: async (url, o) => {
      urls.push(url)
      if (url.includes('api.jikan.moe')) throw new Error('timeout')
      if (url.includes('arm.haglund.dev')) return arm(url, o)
      return { data: [kd(1, '2026-10-25T00:30:00.000Z'), kd(2, '2026-10-26T00:30:00.000Z')], meta: { count: 2 } }
    },
  }
  const r = R.crearRespaldo(ctx)
  const dia = await r.estrenosDia(hoyIni, hoyIni + 86399)
  assert.strictEqual(dia.fuente, 'kitsu')
  assert.strictEqual(dia.items.length, 1)
  assert.strictEqual(dia.items[0].id, 111)
  assert.strictEqual(dia.items[0].airingAt, hoyIni + 1800)
  assert.strictEqual(dia.items[0].episode, null)
  const antes = urls.length
  const otra = await r.estrenosDia(hoyIni, hoyIni + 86399)
  assert.strictEqual(otra.cache, true)
  assert.strictEqual(urls.length, antes)
  // si todo falla, error claro
  R._reiniciarJikan()
  const caido = R.crearRespaldo({ ...ctx, cache: cacheEnMemoria(), fetchJson: async () => { throw new Error('x') } })
  await assert.rejects(() => caido.estrenosDia(hoyIni, hoyIni + 86399), /Sin respaldo disponible/)
})

test('estrenosDia con Jikan vivo: horas desde la emisión semanal, adultos fuera, IDs con ARM', async () => {
  R._reiniciarJikan()
  const hoyIni = Date.parse('2026-10-25T00:00:00Z') / 1000
  const ctx = {
    cache: cacheEnMemoria(), ahora: () => Date.parse('2026-10-24T20:00:00Z'), pausaJikanMs: 0,
    fetchJson: async (url, o) => {
      if (url.includes('api.jikan.moe')) {
        return { data: url.includes('filter=sunday') ? [JIKAN_ITEM, { ...JIKAN_ITEM, mal_id: 5, rating: 'Rx - Hentai' }] : [], pagination: { has_next_page: false } }
      }
      return JSON.parse(o.body).map(() => ({ anilist: 21 }))
    },
  }
  const dia = await R.crearRespaldo(ctx).estrenosDia(hoyIni, hoyIni + 86399)
  assert.strictEqual(dia.fuente, 'jikan')
  assert.strictEqual(dia.items.length, 1)
  assert.strictEqual(dia.items[0].id, 21)
  assert.strictEqual(dia.items[0].score, 87)
  assert.strictEqual(dia.items[0].airingAt, hoyIni + 1800)
})

// Simkl real (calendario del 21-10-2026, recortado)
const SIMKL_A = {
  title: 'Mahou Shoujo Ikusei Keikaku Restart', poster: '20/2082139398f2fd4b46', date: '2026-10-25T02:00:00+09:00', rank: 5474,
  ratings: { simkl: { rating: 7, votes: 4 } }, url: 'https://simkl.com/anime/2086928/mahou-shoujo-ikusei-keikaku-restart',
  ids: { simkl_id: 2086928, slug: 'x', tmdb: '337277', mal: '54344' }, episode: { episode: 3, url: 'u' }, anime_type: 'tv',
}
const SIMKL_SOLO_FECHA = { ...SIMKL_A, title: 'GuAn', date: '2026-10-25T00:00:00+09:00', ids: { simkl_id: 3198578, mal: null }, episode: { episode: 14 }, anime_type: 'ona', ratings: { simkl: { rating: 8.7, votes: 1 } } }

test('normSimkl: episodio, hora real, portada y marca de «solo fecha» (00:00 JST)', () => {
  const b = R.normSimkl(SIMKL_A)
  assert.strictEqual(b.episodio, 3)
  assert.strictEqual(b.malId, 54344)
  assert.strictEqual(b.airingAt, Date.parse('2026-10-24T17:00:00Z') / 1000)
  assert.strictEqual(b.sinHora, false)
  assert.strictEqual(b.cover, 'https://simkl.in/posters/20/2082139398f2fd4b46_m.jpg')
  assert.strictEqual(b.score, 70)
  const g = R.normSimkl(SIMKL_SOLO_FECHA)
  assert.strictEqual(g.sinHora, true)
  assert.strictEqual(g.malId, null)
  assert.strictEqual(g.score, null) // 1 voto no es nota
  assert.strictEqual(g.format, 'ONA')
  const f = R.aFormatoDia(g, undefined, g.airingAt, g.episodio)
  assert.strictEqual(f.id, null)
  assert.strictEqual(f.idRespaldo, 'simkl:3198578')
  assert.strictEqual(f.sinHora, true)
  assert.strictEqual(f.episode, 14)
  assert.strictEqual(R.normSimkl({ ids: {} }), null)
})

test('estrenosDia con Jikan caído usa Simkl (con número de episodio) antes que Kitsu', async () => {
  R._reiniciarJikan()
  const desde = Date.parse('2026-10-24T15:00:00Z') / 1000
  const ctx = {
    cache: cacheEnMemoria(), ahora: () => Date.parse('2026-10-24T20:00:00Z'), pausaJikanMs: 0,
    fetchJson: async (url, o) => {
      if (url.includes('api.jikan.moe')) throw new Error('timeout')
      if (url.includes('data.simkl.in')) return [SIMKL_A, SIMKL_SOLO_FECHA]
      if (url.includes('arm.haglund.dev')) return JSON.parse(o.body).map(() => ({ anilist: 99435 }))
      throw new Error('no debía llamarse: ' + url)
    },
  }
  const dia = await R.crearRespaldo(ctx).estrenosDia(desde, desde + 86399)
  assert.strictEqual(dia.fuente, 'simkl')
  const a = dia.items.find((x) => x.episode === 3)
  assert.strictEqual(a.id, 99435)
  assert.strictEqual(a.title, 'Mahou Shoujo Ikusei Keikaku Restart')
  // un rango anterior al calendario no es «día sin estrenos»: falla para probar otra fuente
  const viejo = Date.parse('2026-09-01T00:00:00Z') / 1000
  await assert.rejects(() => R.crearRespaldo({ ...ctx, cache: cacheEnMemoria() }).estrenosDia(viejo, viejo + 86399), /Sin respaldo disponible/)
})

// ── Episodios emitidos (Qué ver esta noche) ───────────────────────────────────
const S = (mal, ep, iso) => R.normSimkl({ ids: { simkl_id: mal * 10, mal: String(mal) }, date: iso, title: `T${mal}`, episode: { episode: ep }, anime_type: 'tv' })

test('emitidosDeCalendario: último episodio con hora pasada, o el próximo menos uno; sin dato no inventa', () => {
  const ahora = Date.parse('2026-10-22T12:00:00Z') / 1000
  const items = [
    S(1, 3, '2026-10-21T10:00:00+09:00'), S(1, 4, '2026-10-28T10:00:00+09:00'), // pasado 3, futuro 4 → 3
    S(2, 8, '2026-10-29T10:00:00+09:00'),                                       // solo futuro 8 → 7
    S(3, 5, '2026-10-22T00:00:00+09:00'),                                       // «solo fecha» de hoy JST: aún no salió → emitidos 4
    S(4, 2, '2026-10-20T10:00:00+09:00'),                                       // solo pasado → 2
  ]
  const mal = new Map([[101, 1], [102, 2], [103, 3], [104, 4], [105, 99]])
  const r = R.emitidosDeCalendario(items, mal, ahora)
  assert.deepStrictEqual(r[101], { emitidos: 3, proximo: { ep: 4, at: Date.parse('2026-10-28T10:00:00+09:00') / 1000 } })
  assert.strictEqual(r[102].emitidos, 7)
  assert.strictEqual(r[103].emitidos, 4) // ep 5 «solo fecha» de hoy aún no cuenta: el próximo es el 5, salieron 4
  assert.deepStrictEqual(r[104], { emitidos: 2, proximo: null })
  assert.strictEqual(r[105], undefined) // no está en el calendario
})

test('emitidosDeCalendario: «solo fecha» cuenta como salido cuando terminó ese día JST', () => {
  const ahora = Date.parse('2026-10-22T16:00:00Z') / 1000 // 23/10 01:00 JST
  const r = R.emitidosDeCalendario([S(3, 5, '2026-10-22T00:00:00+09:00')], new Map([[103, 3]]), ahora)
  assert.strictEqual(r[103].emitidos, 5)
})

test('respaldo.emitidos: AniList→MAL por ARM (cacheado) + calendario Simkl', async () => {
  const cache = cacheEnMemoria()
  const llamadas = []
  const ctx = {
    cache, ahora: () => Date.parse('2026-10-22T12:00:00Z'), pausaJikanMs: 0,
    fetchJson: async (url, o) => {
      if (url.includes('arm.haglund.dev')) {
        const p = JSON.parse(o.body); llamadas.push(p)
        return p.map((x) => (x.anilist === 101 ? { anilist: 101, myanimelist: 1 } : null))
      }
      return [{ ids: { simkl_id: 10, mal: '1' }, date: '2026-10-21T10:00:00+09:00', title: 'A', episode: { episode: 6 }, anime_type: 'tv' }]
    },
  }
  const r = R.crearRespaldo(ctx)
  const a = await r.emitidos([101, 102, 'x', -4])
  assert.strictEqual(a.fuente, 'simkl')
  assert.deepStrictEqual(Object.keys(a.items), ['101'])
  assert.strictEqual(a.items[101].emitidos, 6)
  await r.emitidos([101, 102])
  assert.strictEqual(llamadas.length, 1) // el segundo pedido sale de la caché de ARM (aciertos y fallos)
})

// ── Emitidos por TMDB (segunda fuente) ────────────────────────────────────────
// Forma de /tv/{id} según la documentación de TMDB. Los conteos son de juguete (sin token local para bajar reales).
const tvLargo = (ultimo, siguiente) => ({
  seasons: [{ season_number: 0, episode_count: 9 }, { season_number: 1, episode_count: 100 }, { season_number: 2, episode_count: 100 }, { season_number: 3, episode_count: 50 }],
  last_episode_to_air: { season_number: 3, episode_number: ultimo },
  next_episode_to_air: siguiente ? { season_number: 3, episode_number: siguiente, air_date: '2026-10-25' } : null,
})
const tvRezero = (sL, eL) => ({
  seasons: [{ season_number: 1, episode_count: 25 }, { season_number: 2, episode_count: 25 }, { season_number: 3, episode_count: 16 }],
  last_episode_to_air: { season_number: sL, episode_number: eL },
  next_episode_to_air: null,
})

test('emitidosTmdb: long-runner sin temporada (One Piece) → numeración ABSOLUTA si lo visto supera la última temporada', () => {
  const r = R.emitidosTmdb(tvLargo(20, 21), { temporada: null, aniEps: 0, vistos: 215 })
  assert.strictEqual(r.emitidos, 220) // 100 + 100 + 20
  assert.deepStrictEqual(r.proximo, { ep: 221, at: Date.parse('2026-10-25') / 1000 })
})

test('emitidosTmdb: long-runner sin evidencia (pocos vistos, AniList sin total) → sin dato, no se inventa', () => {
  assert.strictEqual(R.emitidosTmdb(tvLargo(20), { temporada: null, aniEps: 0, vistos: 10 }), null)
})

test('emitidosTmdb: evidencia contradictoria (AniList cabe en la temporada pero lo visto la supera) → sin dato', () => {
  assert.strictEqual(R.emitidosTmdb(tvLargo(20), { temporada: null, aniEps: 12, vistos: 200 }), null)
})

test('emitidosTmdb: AniList = una temporada entera (cabe en la última) → relativo a la temporada', () => {
  assert.strictEqual(R.emitidosTmdb(tvLargo(20), { temporada: null, aniEps: 50, vistos: 5 }).emitidos, 20)
})

test('emitidosTmdb: Re:ZERO con temporada de ARM → relativo a esa temporada', () => {
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 3, aniEps: 16, vistos: 2 }).emitidos, 8)
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 3, aniEps: 0, vistos: 2 }).emitidos, 8)
  // ARM apunta a la temporada 1 pero TMDB ya va en la 3 y AniList no sabe su total (caso real de Re:ZERO) → sin dato
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 1, aniEps: 0, vistos: 3 }), null)
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 1, aniEps: 16, vistos: 3 }), null)
  // temporada anterior ya terminada → todos sus episodios
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 2, aniEps: 25, vistos: 0 }).emitidos, 25)
})

test('emitidosTmdb: temporada ambigua o inexistente → sin dato', () => {
  // la entrada de AniList (8 eps) es solo parte de la temporada de TMDB (16): numeración ambigua
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 3, aniEps: 8, vistos: 0 }), null)
  // la temporada que dice ARM todavía no empezó en TMDB
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 4, aniEps: 12, vistos: 0 }), null)
  // la temporada no figura
  assert.strictEqual(R.emitidosTmdb(tvRezero(3, 8), { temporada: 9, aniEps: 0, vistos: 0 }), null)
  // TMDB sin episodio emitido
  assert.strictEqual(R.emitidosTmdb({ seasons: [{ season_number: 1, episode_count: 12 }], last_episode_to_air: null }, { temporada: 1 }), null)
  assert.strictEqual(R.emitidosTmdb(null, {}), null)
})

test('emitidosTmdb: serie de una sola temporada → absoluto = relativo; tope por el total de AniList', () => {
  const tv = { seasons: [{ season_number: 1, episode_count: 13 }], last_episode_to_air: { season_number: 1, episode_number: 7 }, next_episode_to_air: { season_number: 1, episode_number: 9, air_date: '2026-10-30' } }
  assert.strictEqual(R.emitidosTmdb(tv, {}).emitidos, 8) // TMDB ya listó el 9 como próximo: salieron al menos 8
  assert.strictEqual(R.emitidosTmdb(tv, { aniEps: 6 }).emitidos, 6)
})

test('emitidos: Simkl primero; TMDB completa lo que Simkl no trae; segunda llamada sale de la caché', async () => {
  const cache = cacheEnMemoria()
  const pedidosTv = []
  const ctx = {
    cache, ahora: () => Date.parse('2026-10-22T12:00:00Z'), pausaJikanMs: 0,
    tmdbTv: async (id) => { pedidosTv.push(id); return id === 500 ? tvLargo(20, 21) : tvRezero(3, 8) },
    fetchJson: async (url, o) => {
      if (url.includes('arm.haglund.dev')) {
        const p = JSON.parse(o.body)
        return p.map((x) => ({ 101: { anilist: 101, myanimelist: 1, themoviedb: 900, 'themoviedb-season': 1 },
          102: { anilist: 102, myanimelist: 2, themoviedb: 500, 'themoviedb-season': null },
          103: { anilist: 103, myanimelist: 3, themoviedb: 600, 'themoviedb-season': 3, media: 'TV' },
          104: { anilist: 104, myanimelist: 4, themoviedb: 77, media: 'Movie' } }[x.anilist] || null))
      }
      return [{ ids: { simkl_id: 10, mal: '1' }, date: '2026-10-21T10:00:00+09:00', title: 'A', episode: { episode: 6 }, anime_type: 'tv' }]
    },
  }
  const r = R.crearRespaldo(ctx)
  const info = { 102: { eps: 0, vistos: 215 }, 103: { eps: 16, vistos: 1 } }
  const a = await r.emitidos([101, 102, 103, 104, 105], info)
  assert.strictEqual(a.items[101].fuente, 'simkl') // Simkl manda; TMDB ni se pide para el 101
  assert.strictEqual(a.items[101].emitidos, 6)
  assert.deepStrictEqual([a.items[102].fuente, a.items[102].emitidos], ['tmdb', 220])
  assert.deepStrictEqual([a.items[103].fuente, a.items[103].emitidos], ['tmdb', 8])
  assert.strictEqual(a.items[104], undefined) // película: no se consulta /tv
  assert.strictEqual(a.items[105], undefined)
  assert.ok(!pedidosTv.includes(900) && !pedidosTv.includes(77))
  const n = pedidosTv.length
  const b = await r.emitidos([102, 103], info)
  assert.strictEqual(pedidosTv.length, n) // cálculo cacheado
  assert.strictEqual(b.items[102].emitidos, 220)
})

test('emitidos: si Simkl cae, TMDB igual responde; si TMDB falla para una serie, esa queda sin dato', async () => {
  const ctx = {
    cache: cacheEnMemoria(), ahora: () => Date.parse('2026-10-22T12:00:00Z'), pausaJikanMs: 0,
    tmdbTv: async (id) => { if (id === 2) throw new Error('TMDB 502'); return tvRezero(3, 8) },
    fetchJson: async (url, o) => {
      if (url.includes('simkl')) throw new Error('HTTP 503')
      const p = JSON.parse(o.body)
      return p.map((x) => ({ anilist: x.anilist, myanimelist: x.anilist, themoviedb: x.anilist === 1 ? 1 : 2, 'themoviedb-season': 3 }))
    },
  }
  const r = await R.crearRespaldo(ctx).emitidos([1, 2], { 1: { eps: 16, vistos: 0 }, 2: { eps: 16, vistos: 0 } })
  assert.deepStrictEqual(Object.keys(r.items), ['1'])
  // y sin TMDB configurado, la caída de Simkl sigue siendo error (comportamiento anterior)
  await assert.rejects(() => R.crearRespaldo({ ...ctx, tmdbTv: undefined, cache: cacheEnMemoria() }).emitidos([1]), /HTTP 503|Simkl/)
})
