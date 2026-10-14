/**
 * Bordes entre turnos pegados: cada tramo de 5 min va a UN solo turno.
 *
 * Caso real, Yal 28-sep-2026 (datos de Shoplogix, Ev1): el Turno 1 cierra 15:00
 * y el Turno 2 arranca 15:00. Con la tolerancia de ±5 min por hora, el Turno 2
 * se quedaba con el tramo 14:55 (etiquetado «Turno 1») y el Turno 1 con 15:00 y
 * 15:05 (etiquetados «Turno 2»): 149 + 119 piezas contadas dos veces entre las
 * tres máquinas. Lo mismo en Chonchi 25-sep (Turno 2 → Unscheduled, +324 pz).
 *
 * Regla: dentro de la ventana manda la hora (Shoplogix a veces etiqueta mal una
 * máquina a mitad de turno, caso 2026-04-29); en los 5 min de tolerancia de
 * cada borde manda la etiqueta.
 */
const test = require('node:test')
const assert = require('node:assert')
const { deriveShiftGroups, intervalsDelTurno } = require('../sync')

const iv = (hhmm, shift, cycles) => {
  const h = Number(hhmm.slice(0, 2)); const m = Number(hhmm.slice(2))
  const end = new Date(Date.UTC(2026, 8, 28, h, m + 5))
  const p = (n) => String(n).padStart(2, '0')
  return {
    start: `20260928T${hhmm}00.000`,
    end: `20260928T${p(end.getUTCHours())}${p(end.getUTCMinutes())}00.000`,
    shift, cycles,
  }
}

// Ev1 de Yal, 28-09-2026, tal como lo devolvió Shoplogix.
const EV1 = [
  iv('1440', 'Turno 1', 81), iv('1445', 'Turno 1', 73), iv('1450', 'Turno 1', 79), iv('1455', 'Turno 1', 74),
  iv('1500', 'Turno 2', 0), iv('1505', 'Turno 2', 42), iv('1510', 'Turno 2', 81), iv('1515', 'Turno 2', 79),
]
const suma = (arr) => arr.reduce((a, b) => a + b.cycles, 0)

test('turnos pegados: ningún tramo queda en los dos turnos', () => {
  const groups = deriveShiftGroups([{ machineProduction: EV1 }], 'yal')
  const t1 = groups.find(g => g.shiftId === 'Turno 1')
  const t2 = groups.find(g => g.shiftId === 'Turno 2')
  const de1 = intervalsDelTurno(EV1, t1)
  const de2 = intervalsDelTurno(EV1, t2)
  assert.deepStrictEqual(de1.map(i => i.start.slice(9, 13)), ['1440', '1445', '1450', '1455'])
  assert.deepStrictEqual(de2.map(i => i.start.slice(9, 13)), ['1500', '1505', '1510', '1515'])
  assert.strictEqual(suma(de1) + suma(de2), suma(EV1), 'la suma de los turnos debe ser la del día, sin repetir')
})

test('turno → Unscheduled (Chonchi 25-09): la cola sin turno no entra al turno', () => {
  const prod = [
    { ...iv('1450', 'Turno 2', 50), start: '20260925T145000.000', end: '20260925T145500.000' },
    { ...iv('1455', 'Turno 2', 65), start: '20260925T145500.000', end: '20260925T150000.000' },
    { ...iv('1500', 'Unscheduled', 63), start: '20260925T150000.000', end: '20260925T150500.000' },
    { ...iv('1505', 'Unscheduled', 50), start: '20260925T150500.000', end: '20260925T151000.000' },
  ]
  const t2 = deriveShiftGroups([{ machineProduction: prod }], 'chonchi').find(g => g.shiftId === 'Turno 2')
  assert.deepStrictEqual(intervalsDelTurno(prod, t2).map(i => i.cycles), [50, 65])
})

test('dentro de la ventana manda la hora aunque otra máquina venga mal etiquetada (2026-04-29)', () => {
  const groups = deriveShiftGroups([{ machineProduction: EV1 }], 'yal')
  const t1 = groups.find(g => g.shiftId === 'Turno 1')
  const m2 = [iv('1440', 'Turno 1', 70), iv('1445', 'Unscheduled', 71), iv('1450', 'Turno 3', 72), iv('1455', 'Turno 1', 73)]
  assert.deepStrictEqual(intervalsDelTurno(m2, t1).map(i => i.cycles), [70, 71, 72, 73])
})

test('en el borde, un tramo con la etiqueta del turno sí entra (máquina desfasada un tramo)', () => {
  const groups = deriveShiftGroups([{ machineProduction: EV1 }], 'yal')
  const t2 = groups.find(g => g.shiftId === 'Turno 2')
  const m3 = [iv('1455', 'Turno 2', 5), iv('1500', 'Turno 2', 32), iv('1505', 'Turno 2', 68)]
  assert.deepStrictEqual(intervalsDelTurno(m3, t2).map(i => i.cycles), [5, 32, 68])
  const t1 = groups.find(g => g.shiftId === 'Turno 1')
  const m3b = [iv('1455', 'Turno 1', 24), iv('1500', 'Turno 1', 9), iv('1505', 'Turno 2', 30)]
  assert.deepStrictEqual(intervalsDelTurno(m3b, t1).map(i => i.cycles), [24, 9])
})

test('turno en curso con cierre oficial alargado (#1191): todo lo de adentro entra', () => {
  const groups = deriveShiftGroups([{ machineProduction: EV1 }], 'yal')
  const t2 = { ...groups.find(g => g.shiftId === 'Turno 2') }
  t2.scheduledEnd = new Date(Date.UTC(2026, 8, 29, 0, 0))
  assert.deepStrictEqual(intervalsDelTurno(EV1, t2).map(i => i.start.slice(9, 13)), ['1500', '1505', '1510', '1515'])
})

test('Unscheduled se sigue filtrando por etiqueta', () => {
  const uns = { shiftId: 'Unscheduled', rawShiftIds: ['Unscheduled'], scheduledStart: new Date(Date.UTC(2026, 8, 28, 6)), scheduledEnd: new Date(Date.UTC(2026, 8, 28, 23)) }
  assert.deepStrictEqual(intervalsDelTurno(EV1, uns), [])
})
