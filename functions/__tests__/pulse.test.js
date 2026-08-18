/**
 * El pulso: contador vivo cada minuto y el ritmo instantáneo que sale de él.
 *
 * Es lo que contesta «¿la línea está corriendo AHORA?» sin esperar a que cierre
 * un bucket de 5 minutos.
 */
const test = require('node:test')
const assert = require('node:assert')
const { componerPulso, MAX_LECTURAS } = require('../shoplogix/pulse')

const lec = (min, n) => ({ at: new Date(Date.UTC(2026, 7, 18, 3, min)).toISOString(), totalCycles: n })

test('pulse: la primera lectura no tiene con qué calcular ritmo', () => {
  const p = componerPulso(null, lec(0, 100))
  assert.equal(p.totalCycles, 100)
  assert.equal(p.cpm, null)
  assert.equal(p.lecturas.length, 1)
})

test('pulse: el ritmo sale de la diferencia entre dos lecturas', () => {
  let p = componerPulso(null, lec(0, 100))
  p = componerPulso(p, lec(1, 112))          // 12 piezas en 1 minuto
  assert.equal(p.cpm, 12)
  assert.equal(p.totalCycles, 112)
})

test('pulse: la línea parada da ritmo 0, no null', () => {
  // Cero es información: la línea está detenida AHORA.
  let p = componerPulso(null, lec(0, 500))
  p = componerPulso(p, lec(2, 500))
  assert.equal(p.cpm, 0)
})

test('⚠ pulse: dos lecturas muy juntas NO publican ritmo', () => {
  // Con menos de 30 s el redondeo del tiempo hace saltar el número entre 0 y
  // valores enormes; mejor no decir nada que decir cualquier cosa.
  let p = componerPulso(null, lec(0, 100))
  const casi = { at: new Date(Date.UTC(2026, 7, 18, 3, 0, 10)).toISOString(), totalCycles: 103 }
  p = componerPulso(p, casi)
  assert.equal(p.cpm, null)
})

test('⚠ pulse: un acumulado que BAJA es cambio de turno, no ritmo negativo', () => {
  let p = componerPulso(null, lec(0, 4000))
  p = componerPulso(p, lec(1, 30))           // arrancó el turno siguiente
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
