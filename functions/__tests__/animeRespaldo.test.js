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
