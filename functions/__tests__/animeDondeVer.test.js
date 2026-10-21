/**
 * «¿Dónde ver?» de anime sin AniList — node:test nativo, sin red.
 * Las muestras de ARM y Kitsu son recortes de respuestas reales del 21-10-2026
 * (Attack on Titan: AniList 16498, MAL 16498, Kitsu 7442, TMDB tv 1429).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const D = require('../animeDondeVer')

const ARM_SNK = {
  anilist: 16498, myanimelist: 16498, kitsu: 7442, simkl: 39687, themoviedb: 1429, media: 'TV',
  'anime-planet': 'attack-on-titan', imdb: 'tt2560140',
}
const KITSU_STREAMING = {
  data: [
    { id: '100', type: 'streamingLinks', attributes: { url: 'https://www.netflix.com/title/70299043' }, relationships: { streamer: { data: { type: 'streamers', id: '6' } } } },
    { id: '101', type: 'streamingLinks', attributes: { url: 'http://www.crunchyroll.com/attack-on-titan' }, relationships: { streamer: { data: { type: 'streamers', id: '3' } } } },
    { id: '102', type: 'streamingLinks', attributes: { url: 'javascript:alert(1)' }, relationships: { streamer: { data: { type: 'streamers', id: '1' } } } },
  ],
  included: [
    { id: '6', type: 'streamers', attributes: { siteName: 'Netflix' } },
    { id: '3', type: 'streamers', attributes: { siteName: 'Crunchyroll' } },
    { id: '1', type: 'streamers', attributes: { siteName: 'Hulu' } },
  ],
}
const TMDB_TITULO = {
  id: 1429, tipo: 'tv', titulo: 'Ataque a los titanes', original: '進撃の巨人',
  dondeVer: {
    CL: {
      link: 'https://www.themoviedb.org/tv/1429/watch?locale=CL',
      suscripcion: [{ id: 8, nombre: 'Netflix', logo: '/n.jpg' }, { id: 283, nombre: 'Crunchyroll', logo: '/c.jpg' }, { id: 999, nombre: 'Otra', logo: null }],
      gratis: [], arriendo: [{ id: 2, nombre: 'Apple TV', logo: '/a.jpg' }], compra: [],
    },
    JP: { link: 'x', suscripcion: [{ id: 8, nombre: 'Netflix', logo: null }], gratis: [{ id: 5, nombre: 'Tubi', logo: null }], arriendo: [], compra: [] },
    US: { link: 'x', suscripcion: [], gratis: [], arriendo: [{ id: 2, nombre: 'Apple TV', logo: null }], compra: [] },
  },
}

test('normIds: ids de ARM, tipo TMDB por «media» y slug de Anime-Planet validado', () => {
  const ids = D.normIds(ARM_SNK)
  assert.deepStrictEqual([ids.anilist, ids.mal, ids.kitsu, ids.simkl, ids.tmdb, ids.tmdbTipo], [16498, 16498, 7442, 39687, 1429, 'tv'])
  assert.strictEqual(ids.animePlanet, 'attack-on-titan')
  assert.strictEqual(D.normIds({ ...ARM_SNK, media: 'Movie' }).tmdbTipo, 'movie')
  assert.strictEqual(D.normIds({ ...ARM_SNK, 'anime-planet': '../x?y' }).animePlanet, null)
  assert.strictEqual(D.normIds(null), null)
})

test('enlacesFicha: MyAnimeList primero y AniList al final; omite lo que no hay', () => {
  const e = D.enlacesFicha(D.normIds(ARM_SNK))
  assert.deepStrictEqual(e.map((x) => x.sitio), ['MyAnimeList', 'Kitsu', 'Simkl', 'Anime-Planet', 'AniList'])
  assert.strictEqual(e[0].url, 'https://myanimelist.net/anime/16498')
  assert.strictEqual(e[4].url, 'https://anilist.co/anime/16498')
  const solo = D.enlacesFicha(D.normIds({ anilist: 5 }))
  assert.deepStrictEqual(solo.map((x) => x.sitio), ['AniList'])
})

test('claveSitio: la misma plataforma con nombres distintos da la misma clave', () => {
  assert.strictEqual(D.claveSitio('Amazon Prime Video'), D.claveSitio('Prime Video'))
  assert.strictEqual(D.claveSitio('Amazon'), 'prime')
  assert.strictEqual(D.claveSitio('Disney Plus'), D.claveSitio('Disney+'))
  assert.strictEqual(D.claveSitio('HBO Max'), 'max')
  assert.strictEqual(D.claveSitio('Crunchyroll'), 'crunchyroll')
  assert.strictEqual(D.claveSitio(''), '')
})

test('normStreamingKitsu: nombra con el streamer, sube http a https y descarta lo inseguro', () => {
  const s = D.normStreamingKitsu(KITSU_STREAMING)
  assert.deepStrictEqual(s.map((x) => x.sitio), ['Netflix', 'Crunchyroll'])
  assert.strictEqual(s[1].url, 'https://www.crunchyroll.com/attack-on-titan')
  assert.deepStrictEqual(D.normStreamingKitsu(null), [])
})

test('normStreamingJikan: name + url, sin entradas incompletas', () => {
  const s = D.normStreamingJikan({ data: [{ name: 'Crunchyroll', url: 'http://www.crunchyroll.com/x' }, { name: '', url: 'https://a.cl' }, { name: 'X', url: 'ftp://x' }] })
  assert.deepStrictEqual(s, [{ sitio: 'Crunchyroll', url: 'https://www.crunchyroll.com/x', fuente: 'jikan' }])
})

test('unirEnlaces: no repite plataforma aunque cambie el nombre; gana la primera lista', () => {
  const u = D.unirEnlaces(
    [{ sitio: 'Amazon Prime Video', url: 'https://a/1' }],
    [{ sitio: 'Prime Video', url: 'https://a/2' }, { sitio: 'Crunchyroll', url: 'https://c/1' }],
    null,
  )
  assert.deepStrictEqual(u.map((x) => x.url), ['https://a/1', 'https://c/1'])
})

test('urlPlataforma: búsqueda dentro de la plataforma con el título codificado; si no, el enlace de TMDB', () => {
  assert.strictEqual(D.urlPlataforma(8, 'Ataque a los titanes', null), 'https://www.netflix.com/search?q=Ataque%20a%20los%20titanes')
  assert.strictEqual(D.urlPlataforma(999, 'x', 'https://www.themoviedb.org/tv/1/watch'), 'https://www.themoviedb.org/tv/1/watch')
  assert.strictEqual(D.urlPlataforma(999, 'x', 'http://inseguro'), null)
  assert.strictEqual(D.urlPlataforma(999, 'x', null), null)
})

test('filasPais / otrosPaises: Chile con tipo y URL; el resto solo suscripción o gratis', () => {
  const f = D.filasPais(TMDB_TITULO.dondeVer.CL, 'Shingeki')
  assert.deepStrictEqual(f.map((x) => `${x.nombre}:${x.tipo}`), ['Netflix:suscripcion', 'Crunchyroll:suscripcion', 'Otra:suscripcion', 'Apple TV:arriendo'])
  assert.match(f[0].url, /netflix\.com\/search\?q=Shingeki/)
  assert.strictEqual(f[2].url, 'https://www.themoviedb.org/tv/1429/watch?locale=CL')
  assert.deepStrictEqual(D.filasPais(null, 'x'), [])
  const o = D.otrosPaises(TMDB_TITULO.dondeVer, 'CL')
  assert.deepStrictEqual(o.map((x) => x.pais), ['JP'])
  assert.deepStrictEqual(o[0].plataformas, ['Netflix', 'Tubi (gratis)'])
})

function fetchFalso(rutas) {
  const llamadas = []
  const fn = async (url, opt) => {
    llamadas.push(url)
    for (const [patron, resp] of rutas) {
      if (url.includes(patron)) { if (resp instanceof Error) throw resp; return resp }
    }
    throw new Error('HTTP 404')
  }
  fn.llamadas = llamadas
  return fn
}

test('dondeVerAnime: junta ARM + TMDB + Kitsu y tolera que Jikan esté caído', async () => {
  const fetchJson = fetchFalso([
    ['arm.haglund.dev', [ARM_SNK]],
    ['kitsu.app/api/edge/anime/7442/streaming-links', KITSU_STREAMING],
    ['api.jikan.moe', new Error('timeout')],
  ])
  const r = await D.dondeVerAnime({ fetchJson, tmdbTitulo: async (p) => { assert.deepStrictEqual(p, { tipo: 'tv', id: 1429 }); return TMDB_TITULO }, anilistId: 16498, titulo: 'Attack on Titan', region: 'CL' })
  assert.strictEqual(r.tmdb.id, 1429)
  assert.strictEqual(r.paisBase.length, 4)
  assert.match(r.paisBase[0].url, /q=Attack%20on%20Titan/)
  assert.deepStrictEqual(r.oficiales.map((x) => x.sitio), ['Netflix', 'Crunchyroll'])
  assert.deepStrictEqual(r.otros.map((x) => x.pais), ['JP'])
  assert.deepStrictEqual(r.fallos, ['jikan: timeout'])
  assert.strictEqual(r.enlaces[0].sitio, 'MyAnimeList')
})

test('dondeVerAnime: ARM sin ese título → solo enlace a AniList, sin romper', async () => {
  const fetchJson = fetchFalso([['arm.haglund.dev', [null]]])
  const r = await D.dondeVerAnime({ fetchJson, tmdbTitulo: async () => { throw new Error('no debe llamarse') }, anilistId: 99999, titulo: '', region: 'CL' })
  assert.deepStrictEqual(r.enlaces.map((x) => x.sitio), ['AniList'])
  assert.strictEqual(r.tmdb, null)
  assert.deepStrictEqual(r.paisBase, [])
})

test('dondeVerAnime: película que TMDB tiene como tv → reintenta con el otro tipo en 404', async () => {
  const fetchJson = fetchFalso([['arm.haglund.dev', [{ anilist: 1, themoviedb: 55, media: 'Movie' }]]])
  const pedidos = []
  const r = await D.dondeVerAnime({
    fetchJson,
    tmdbTitulo: async (p) => { pedidos.push(p.tipo); if (p.tipo === 'movie') { const e = new Error('TMDB 404'); e.status = 404; throw e } return { ...TMDB_TITULO, id: 55 } },
    anilistId: 1, titulo: 'X', region: 'CL',
  })
  assert.deepStrictEqual(pedidos, ['movie', 'tv'])
  assert.strictEqual(r.tmdb.id, 55)
})

test('dondeVerAnime: id inválido o ARM caído lanzan (la op responde 502 limpio)', async () => {
  await assert.rejects(() => D.dondeVerAnime({ fetchJson: fetchFalso([]), tmdbTitulo: async () => null, anilistId: 'abc', region: 'CL' }), /id inválido/)
  await assert.rejects(() => D.dondeVerAnime({ fetchJson: fetchFalso([['arm', new Error('HTTP 500')]]), tmdbTitulo: async () => null, anilistId: 5, region: 'CL' }), /HTTP 500/)
})

test('normStreamingKitsu: guarda audio (dubs) y subtítulos (subs) y descarta códigos raros', () => {
  const s = D.normStreamingKitsu({
    data: [{ attributes: { url: 'https://www.netflix.com/title/1', subs: ['en', 'es-419', '<x>'], dubs: ['ja'] }, relationships: { streamer: { data: { id: '6' } } } },
      { attributes: { url: 'https://www.hulu.com/x' }, relationships: { streamer: { data: { id: '1' } } } }],
    included: [{ id: '6', type: 'streamers', attributes: { siteName: 'Netflix' } }, { id: '1', type: 'streamers', attributes: { siteName: 'Hulu' } }],
  })
  assert.deepStrictEqual(s[0].subs, ['en', 'es-419'])
  assert.deepStrictEqual(s[0].dubs, ['ja'])
  assert.deepStrictEqual([s[1].subs, s[1].dubs], [[], []]) // sin dato: vacío, nada inventado
})

test('unirEnlaces: el enlace de Kitsu y sus idiomas sobreviven aunque Jikan traiga el mismo sitio', () => {
  const u = D.unirEnlaces(
    [{ sitio: 'Crunchyroll', url: 'https://k', fuente: 'kitsu', subs: ['en'], dubs: ['ja'] }],
    [{ sitio: 'Crunchyroll', url: 'https://j', fuente: 'jikan' }],
  )
  assert.strictEqual(u.length, 1)
  assert.strictEqual(u[0].url, 'https://k')
  assert.deepStrictEqual(u[0].dubs, ['ja'])
  // al revés: Jikan primero (sin idiomas) y Kitsu después → conserva el enlace de Jikan pero toma los idiomas
  const v = D.unirEnlaces([{ sitio: 'Netflix', url: 'https://j', fuente: 'jikan' }], [{ sitio: 'Netflix', url: 'https://k', subs: ['en'], dubs: ['ja'] }])
  assert.strictEqual(v[0].url, 'https://j')
  assert.deepStrictEqual(v[0].subs, ['en'])
})

test('planDeProveedores: ids de TMDB → claves; sin datos usa Crunchyroll, Netflix, Prime y Disney+', () => {
  assert.deepStrictEqual(D.planDeProveedores([283, 8, 8, 5555]), ['crunchyroll', 'netflix'])
  assert.deepStrictEqual(D.planDeProveedores([]), D.PLAN_DEFECTO)
  assert.deepStrictEqual(D.planDeProveedores(undefined), D.PLAN_DEFECTO)
})

const DATOS_VER = {
  paisBase: D.filasPais(TMDB_TITULO.dondeVer.CL, 'Shingeki'),
  oficiales: [{ sitio: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GR3/shingeki', fuente: 'kitsu' }],
}

test('elegirVerAhora: primera del plan con suscripción en Chile; enlace directo si Kitsu lo da, si no búsqueda', () => {
  const plan = ['netflix', 'crunchyroll']
  const e = D.elegirVerAhora(DATOS_VER, { plan })
  assert.strictEqual(e.clave, 'netflix')
  assert.match(e.url, /netflix\.com\/search\?q=Shingeki/)
  assert.strictEqual(e.directo, false)
  const c = D.elegirVerAhora(DATOS_VER, { plan: ['crunchyroll'] })
  assert.strictEqual(c.url, 'https://www.crunchyroll.com/series/GR3/shingeki')
  assert.strictEqual(c.directo, true)
})

test('elegirVerAhora: la plataforma recordada manda mientras siga en Chile', () => {
  assert.strictEqual(D.elegirVerAhora(DATOS_VER, { recordada: 'crunchyroll', plan: ['netflix'] }).clave, 'crunchyroll')
  // recordada que ya no está en Chile → vuelve al plan
  assert.strictEqual(D.elegirVerAhora(DATOS_VER, { recordada: 'disney', plan: ['netflix'] }).clave, 'netflix')
})

test('elegirVerAhora: arriendo/compra, otra plataforma o sin datos de TMDB → null (sin botón)', () => {
  assert.strictEqual(D.elegirVerAhora(DATOS_VER, { plan: ['appletv'] }), null) // Apple TV solo arriendo
  assert.strictEqual(D.elegirVerAhora(DATOS_VER, { plan: ['disney'] }), null)
  assert.strictEqual(D.elegirVerAhora({ paisBase: [], oficiales: DATOS_VER.oficiales }, { plan: ['crunchyroll'] }), null)
  assert.strictEqual(D.elegirVerAhora(null, {}), null)
})
