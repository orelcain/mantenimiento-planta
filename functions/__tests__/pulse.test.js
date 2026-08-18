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
