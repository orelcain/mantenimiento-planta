/**
 * La HORA EXTRA del turno: cuando la línea sigue produciendo pasado el horario
 * declarado, Shoplogix etiqueta esos minutos como `Unscheduled`.
 *
 * ⚠ El bug que estos tests cierran (Chonchi, 31-08 07:31): el pulso tomaba el
 * turno del último minuto —ya `Unscheduled`— y filtraba TODO el acumulado por
 * él, así que el número grande del monitor cayó de 13.226 pz a 508 (solo la
 * hora extra) y la meta pasó a «faltan 14.492». Regla del proyecto: el
 * `Unscheduled` se atribuye al turno, nunca queda suelto ni pasa por turno.
 */
const test = require('node:test')
const assert = require('node:assert')
const { lecturaDesdeProduccion } = require('../shoplogix/pulse')

/** Un bucket de 1 min cerrado. `min` son minutos desde las 07:00. */
const bucket = (min, cycles, shift) => {
  const d = new Date(Date.UTC(2026, 7, 31, 7, min))
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return {
    start: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T`
      + `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000`,
    totalDuration: 60_000,
    cycles,
    expectedCycles: 19,
    shift,
  }
}

/** Una máquina con los buckets dados. */
const maquina = (id, buckets) => ({ machineId: id, machineProduction: buckets })

test('la hora extra SUMA al turno en vez de reemplazarlo', () => {
  /* Tres minutos del turno (10+10+10) y dos de hora extra (4+3): el acumulado
     son 37, no 7. Antes del fix el último minuto (Unscheduled) definía el
     filtro y el total quedaba en 7. */
  const data = {
    machines: [maquina('a', [
      bucket(0, 10, 'Turno 1'), bucket(1, 10, 'Turno 1'), bucket(2, 10, 'Turno 1'),
      bucket(3, 4, 'Unscheduled'), bucket(4, 3, 'Unscheduled'),
    ])],
  }
  const r = lecturaDesdeProduccion(data)
  assert.equal(r.totalCycles, 37)
  assert.equal(r.porMaquina.a, 37)
})

test('el minuto repetido en los dos buckets se cuenta UNA vez, y manda el del turno', () => {
  /* Shoplogix duplica los minutos del borde. Sumarlos contaría esas piezas dos
     veces — el mismo gotcha ya resuelto del lado del doc del turno. */
  const data = {
    machines: [maquina('a', [
      bucket(0, 10, 'Turno 1'),
      bucket(1, 10, 'Turno 1'),
      bucket(1, 99, 'Unscheduled'), // el MISMO minuto, repetido
      bucket(2, 5, 'Unscheduled'),
    ])],
  }
  assert.equal(lecturaDesdeProduccion(data).totalCycles, 25)
})

test('un Unscheduled ANTERIOR al turno no se le atribuye (es de otro turno)', () => {
  /* La ventana del pulso trae ~12 h: el cajón de la madrugada anterior no es
     hora extra de este turno. */
  const data = {
    machines: [maquina('a', [
      bucket(0, 500, 'Unscheduled'), // antes de que arranque el turno
      bucket(5, 10, 'Turno 1'),
      bucket(6, 10, 'Turno 1'),
      bucket(7, 4, 'Unscheduled'), // hora extra: sí
    ])],
  }
  assert.equal(lecturaDesdeProduccion(data).totalCycles, 24)
})

test('las barras del minuto tampoco se cortan al entrar en hora extra', () => {
  const data = {
    machines: [maquina('a', [
      bucket(0, 10, 'Turno 1'), bucket(1, 10, 'Turno 1'),
      bucket(2, 4, 'Unscheduled'), bucket(3, 3, 'Unscheduled'),
    ])],
  }
  const r = lecturaDesdeProduccion(data)
  assert.deepEqual(r.duro.serieMinuto.maquinas[0].cycles, [10, 10, 4, 3])
})

test('sin hora extra nada cambia: el turno se filtra igual que siempre', () => {
  const data = {
    machines: [maquina('a', [
      bucket(0, 9, 'Turno 2'), bucket(1, 11, 'Turno 2'),
      bucket(2, 7, 'Turno 1'), // otro turno: fuera
    ])],
  }
  /* El último minuto es «Turno 1», así que ESE es el turno vigente y los de
     «Turno 2» quedan fuera. */
  assert.equal(lecturaDesdeProduccion(data).totalCycles, 7)
})

test('un bucket con timestamp ilegible se ignora al atribuir, no tumba la lectura', () => {
  /* Solo cubre la atribución: si el ILEGIBLE fuera el último minuto, el pulso
     revienta antes de llegar acá — eso es de siempre y no lo toca este fix. */
  const roto = { ...bucket(1, 999, 'Unscheduled'), start: 'no-es-una-fecha' }
  const data = {
    machines: [maquina('a', [
      bucket(0, 10, 'Turno 1'), roto, bucket(2, 10, 'Turno 1'), bucket(3, 4, 'Unscheduled'),
    ])],
  }
  assert.equal(lecturaDesdeProduccion(data).totalCycles, 24)
})
