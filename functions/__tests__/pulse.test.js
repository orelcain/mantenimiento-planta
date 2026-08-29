/**
 * El pulso: contador vivo cada minuto y el ritmo instantáneo que sale de él.
 *
 * Es lo que contesta «¿la línea está corriendo AHORA?» sin esperar a que cierre
 * un bucket de 5 minutos.
 */
const test = require('node:test')
const assert = require('node:assert')
const { componerPulso, ritmoDeVentana, MAX_LECTURAS } = require('../shoplogix/pulse')

const lec = (min, n) => ({ at: new Date(Date.UTC(2026, 7, 18, 3, min)).toISOString(), totalCycles: n })

test('pulse: la primera lectura no tiene con qué calcular ritmo', () => {
  const p = componerPulso(null, lec(0, 100))
  assert.equal(p.totalCycles, 100)
  assert.equal(p.cpm, null)
  assert.equal(p.lecturas.length, 1)
})

test('pulse: el ritmo sale de la ventana, no de las dos últimas', () => {
  let p = componerPulso(null, lec(0, 100))
  p = componerPulso(p, lec(2, 124))          // 24 piezas en 2 minutos
  assert.equal(p.cpm, 12)
  assert.equal(p.totalCycles, 124)
})

test('pulse: la línea parada da ritmo 0, no null', () => {
  // Cero es información: la línea está detenida AHORA. Pero se necesita una
  // ventana de verdad para afirmarlo, no dos lecturas pegadas.
  let p = null
  for (let i = 0; i <= 4; i++) p = componerPulso(p, lec(i, 500))
  assert.equal(p.cpm, 0)
})

test('⚠ pulse: dos lecturas muy juntas NO publican ritmo', () => {
  // Bajo el minuto y medio, el refresco de Shoplogix (cada 2 min) hace saltar
  // el número entre 0 y valores enormes; mejor no decir nada.
  let p = componerPulso(null, lec(0, 100))
  const casi = { at: new Date(Date.UTC(2026, 7, 18, 3, 0, 10)).toISOString(), totalCycles: 103 }
  p = componerPulso(p, casi)
  assert.equal(p.cpm, null)
})

test('⚠ pulse: un acumulado que BAJA es cambio de turno, no ritmo negativo', () => {
  let p = componerPulso(null, lec(0, 4000))
  p = componerPulso(p, lec(2, 30))           // arrancó el turno siguiente
  assert.equal(p.cpm, null)
  assert.equal(p.totalCycles, 30)            // el acumulado sí se actualiza
})

test('pulse: conserva solo las últimas lecturas', () => {
  let p = null
  for (let i = 0; i <= MAX_LECTURAS + 5; i++) p = componerPulso(p, lec(i, i * 10))
  assert.equal(p.lecturas.length, MAX_LECTURAS)
})

test('pulse: sin lectura nueva conserva el pulso anterior', () => {
  const p = componerPulso(null, lec(0, 100))
  assert.deepEqual(componerPulso(p, null), p)
})

/*
 * ⚠⚠ EL ERROR QUE ESTE TEST HABRÍA ATRAPADO: la primera versión de
 * `shoplogixPulseWakeup` hacía `admin.firestore()`, pero `index.js` importa
 * `firebase-admin/firestore` por piezas y NO tiene un `admin` en scope. La
 * función se desplegó "con éxito" y falló en cada corrida con «admin is not
 * defined» — invisible hasta mirar los logs, porque un scheduler que revienta
 * no rompe nada más.
 *
 * Acá se comprueba que todo lo que la función necesita EXISTE y es del tipo
 * esperado. No reemplaza a mirar los logs tras un deploy, pero corta la clase
 * de error más tonta antes de que llegue a producción.
 */
test('pulse: las piezas que usa la función programada existen', () => {
  const { toShoplogixTime } = require('../shoplogix/time')
  const { queryShoplogix, queryShoplogixBearer } = require('../shoplogix/client')
  const { PLANT_AREA_ID } = require('../shoplogix/machines')
  const { leerPulso } = require('../shoplogix/pulse')

  assert.equal(typeof toShoplogixTime, 'function')
  assert.equal(typeof queryShoplogix, 'function')
  assert.equal(typeof queryShoplogixBearer, 'function')
  assert.equal(typeof leerPulso, 'function')
  // Las tres plantas tienen área: sin ella `leerPulso` devuelve null en silencio.
  for (const slug of ['chonchi', 'yal', 'filete']) {
    assert.ok(PLANT_AREA_ID[slug], `falta el areaId de ${slug}`)
  }
})

test('pulse: leerPulso no revienta si Shoplogix falla — devuelve null', async () => {
  const { leerPulso } = require('../shoplogix/pulse')
  const { toShoplogixTime } = require('../shoplogix/time')
  const r = await leerPulso({
    query: async () => { throw new Error('502 del proxy') },
    plantSlug: 'filete',
    toShoplogixTime,
    logger: { warn() {} },
  })
  assert.equal(r, null)
})

/*
 * ⚠⚠ EL CASO MEDIDO EN PRODUCCIÓN (18-08, turno noche de Filete): aunque
 * preguntemos cada minuto, el contador de Shoplogix se refresca cada DOS. Las
 * lecturas reales fueron 1453 → 1476 → 1476 → 1495 → 1495.
 */
test('⚠ pulse: el refresco de 2 min de Shoplogix NO hace parpadear el ritmo', () => {
  const reales = [1453, 1476, 1476, 1495, 1495]
  let p = null
  reales.forEach((n, i) => { p = componerPulso(p, lec(i, n)) })
  // Entre las dos últimas la diferencia es 0; sobre la ventana de 4 min son
  // 42 piezas → 10,5 pz/min, que es el ritmo de verdad.
  assert.equal(p.cpm, 10.5)
})

test('ritmoDeVentana: sin dos lecturas no inventa un número', () => {
  assert.equal(ritmoDeVentana([]), null)
  assert.equal(ritmoDeVentana([{ at: new Date().toISOString(), totalCycles: 10 }]), null)
})

// ── El pulso POR MÁQUINA (pedido de Orel, 27-08) ─────────────────────────────

const lecM = (min, porMaquina) => ({
  at: new Date(Date.UTC(2026, 7, 27, 13, min)).toISOString(),
  totalCycles: Object.values(porMaquina).reduce((a, v) => a + v, 0),
  porMaquina,
})

test('pulse: los ritmos por máquina SUMAN el de la línea — misma ventana', () => {
  let p = componerPulso(null, lecM(0, { a: 100, b: 200, c: 50 }))
  p = componerPulso(p, lecM(2, { a: 120, b: 224, c: 50 }))
  // Línea: 44 pz en 2 min = 22. Por máquina: 10 + 12 + 0.
  assert.equal(p.cpm, 22)
  const suma = p.porMaquina.reduce((a, m) => a + m.cpm, 0)
  assert.ok(Math.abs(suma - p.cpm) < 1e-9)
  assert.equal(p.porMaquina.find((m) => m.id === 'c').cpm, 0)
})

test('pulse: un contador por máquina que BAJA no publica reparto (no sumaría)', () => {
  let p = componerPulso(null, lecM(0, { a: 100, b: 200 }))
  p = componerPulso(p, { ...lecM(2, { a: 90, b: 224 }), totalCycles: 314 })
  assert.equal(p.porMaquina ?? null, null)
})

test('pulse: lecturas viejas sin desglose no publican reparto, pero el de línea sigue', () => {
  const vieja = (min, n) => ({ at: new Date(Date.UTC(2026, 7, 27, 13, min)).toISOString(), totalCycles: n })
  let p = componerPulso(null, vieja(0, 100))
  p = componerPulso(p, lecM(2, { a: 80, b: 44 }))
  assert.equal(p.cpm, 12)
  assert.equal(p.porMaquina ?? null, null)
})

// ── Techo físico por planta (bug del 29-08: «60-69 pz/min» en pantalla) ──────

test('pulse: un ritmo sobre el techo FÍSICO de la planta no se publica', () => {
  // Chonchi da 51 nominal: 65 pz/min no es un ritmo, es el contador
  // reconciliando piezas de golpe. Con el genérico de 120 pasaba el corte.
  const { PLANT_MAX_CPM } = require('../shoplogix/pulse')
  let p = componerPulso(null, lec(0, 1000), PLANT_MAX_CPM.chonchi)
  p = componerPulso(p, lec(2, 1130), PLANT_MAX_CPM.chonchi)   // 130 pz en 2 min = 65
  assert.equal(p.cpm, null)
  assert.equal(p.porMaquina ?? null, null)
})

test('pulse: un ritmo alto pero físicamente posible SÍ se publica', () => {
  const { PLANT_MAX_CPM } = require('../shoplogix/pulse')
  let p = componerPulso(null, lec(0, 1000), PLANT_MAX_CPM.chonchi)
  p = componerPulso(p, lec(2, 1090), PLANT_MAX_CPM.chonchi)   // 45 pz/min: fuerte, real
  assert.equal(p.cpm, 45)
})

// ── El último VIVO durante los silencios (Orel lo cazó en vivo, 29-08) ───────
// Cuando el contador hace una discontinuidad el cpm queda mudo unos minutos y
// la pantalla caía a la media de 15 min: mostraba 33 con la línea goteando a
// 12. El pulso ahora arrastra el último ritmo vivo con su hora para que el
// «Ahora» siga siendo el ahora, aunque con edad.

test('pulse: un contador que BAJA reinicia la ventana — habla de nuevo en ~2 min', () => {
  let p = null
  for (let i = 0; i <= 4; i++) p = componerPulso(p, lec(i, 1000 + i * 20))
  assert.equal(p.cpm, 20)
  p = componerPulso(p, lec(5, 900))            // reconciliación: bajó
  assert.equal(p.cpm, null)
  assert.equal(p.lecturas.length, 1)           // ventana limpia, no envenenada
  p = componerPulso(p, lec(6, 915))
  p = componerPulso(p, lec(7, 930))            // 30 pz en 2 min sobre ventana nueva
  assert.equal(p.cpm, 15)
})

test('pulse: mientras el cpm esta mudo se publica el ultimo vivo, con su hora', () => {
  let p = null
  for (let i = 0; i <= 4; i++) p = componerPulso(p, lecM(i, { a: 500 + i * 10, b: 300 + i * 10 }))
  assert.equal(p.cpm, 20)
  const horaViva = p.at
  p = componerPulso(p, lecM(5, { a: 100, b: 50 }))  // discontinuidad
  assert.equal(p.cpm, null)
  assert.equal(p.vivoPrevio.cpm, 20)
  assert.equal(p.vivoPrevio.at, horaViva)
  assert.equal(p.vivoPrevio.porMaquina.length, 2)
  // El silencio sigue un minuto mas: el vivo se ARRASTRA, no se pierde.
  p = componerPulso(p, lecM(6, { a: 110, b: 55 }))  // 2 lecturas a 1 min: aun mudo
  assert.equal(p.cpm, null)
  assert.equal(p.vivoPrevio.cpm, 20)
  assert.equal(p.vivoPrevio.at, horaViva)
})

test('pulse: al volver el cpm, el vivo arrastrado desaparece', () => {
  let p = null
  for (let i = 0; i <= 4; i++) p = componerPulso(p, lec(i, 1000 + i * 20))
  p = componerPulso(p, lec(5, 900))
  assert.ok(p.vivoPrevio)
  p = componerPulso(p, lec(6, 915))
  p = componerPulso(p, lec(7, 930))
  assert.equal(p.cpm, 15)
  assert.equal(p.vivoPrevio ?? null, null)
})

test('pulse: un vivo de hace mas de 10 min ya caduco — no se arrastra', () => {
  const { VIVO_MAX_EDAD_MIN } = require('../shoplogix/pulse')
  let p = null
  for (let i = 0; i <= 4; i++) p = componerPulso(p, lec(i, 1000 + i * 20))
  // Discontinuidades encadenadas: cada lectura baja respecto de la anterior,
  // el cpm nunca vuelve y el vivo envejece hasta caducar.
  let base = 900
  for (let i = 5; i <= 5 + VIVO_MAX_EDAD_MIN + 1; i++) {
    p = componerPulso(p, lec(i, base))
    base -= 10
  }
  assert.equal(p.cpm, null)
  assert.equal(p.vivoPrevio ?? null, null)
})
