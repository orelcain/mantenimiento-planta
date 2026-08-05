/**
 * Red de seguridad de la ventana de consulta y el agrupamiento en turnos.
 *
 * Estas cuatro funciones —`fullDayWindow`, `deriveShiftGroups`,
 * `shiftDateKeyFromStart`, `currentDateKey`— son el corazón del sync y hasta
 * hoy (2026-08-05) NO tenían un solo test, pese a haber provocado ya un
 * pisotón de datos en producción (ver `truncatedTail.test.js`).
 *
 * Se escriben ANTES de tocarlas. Los casos salen de docs reales de Firestore y
 * de respuestas reales del probe de Shoplogix, no de suposiciones.
 *
 * Correr: node --test functions/shoplogix/__tests__/
 */
const test = require('node:test')
const assert = require('node:assert')

const {
  fullDayWindow,
  deriveShiftGroups,
  shiftDateKeyFromStart,
  currentDateKey,
} = require('../sync')

/** Un interval de `whiteboardproduction` como los que devuelve la API. */
function iv(shift, start, end, cycles = 100) {
  return { shift, start, end, cycles, expectedCycles: 200, total: 0, expectedTotal: 0, totalDuration: 300000 }
}

/** Respuesta de una máquina, que es lo que consume `deriveShiftGroups`. */
function machine(intervals) {
  return [{ machineProduction: intervals }]
}

/** "20260805T071500.000" → Date wall-clock-as-UTC, para comparar. */
const at = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.000Z`)

// ── fullDayWindow ────────────────────────────────────────────────────────────

test('fullDayWindow: la ventana termina a las 08:00 del día siguiente', () => {
  const w = fullDayWindow('2026-08-05')
  assert.strictEqual(w.end, '20260806T080000.000')
})

test('fullDayWindow: cruza fin de mes sin romperse', () => {
  const w = fullDayWindow('2026-07-31')
  assert.strictEqual(w.end, '20260801T080000.000')
})

test('fullDayWindow: cruza fin de año sin romperse', () => {
  const w = fullDayWindow('2026-12-31')
  assert.strictEqual(w.end, '20270101T080000.000')
})

test('fullDayWindow: la ventana empieza ANTES de las 08:00 para captar el arranque', () => {
  // El turno de estas plantas arranca antes de las 08:00 de forma habitual
  // (Chonchi 07:15, Filete 07:30, Yal 07:45). Con la ventana anclada en 08:00
  // esos minutos caían en la consulta del día ANTERIOR y se le sumaban a ESE
  // doc: `2026-08-04_Turno 2` quedó con 16.398 ciclos incluyendo 45 min del 05.
  const w = fullDayWindow('2026-08-05')
  const startH = Number(w.start.slice(9, 11))
  assert.ok(startH < 8, `la ventana debe empezar antes de las 08:00, empieza a las ${startH}`)
  assert.strictEqual(w.start.slice(0, 8), '20260805', 'debe empezar el MISMO día, no el anterior')
})

test('fullDayWindow: no se estira tanto como para tragarse el turno nocturno anterior', () => {
  // El nocturno de Chonchi termina 05:00 (`2026-08-04_Turno 1`: 21:15 → 05:00).
  // Si la ventana arrancara antes de esa hora, su cola entraría en la consulta
  // del día siguiente y volvería el problema, con el signo cambiado.
  const w = fullDayWindow('2026-08-05')
  const startH = Number(w.start.slice(9, 11))
  assert.ok(startH >= 5, `no debe empezar antes de las 05:00, empieza a las ${startH}`)
})

// ── shiftDateKeyFromStart ────────────────────────────────────────────────────

test('shiftDateKeyFromStart: el turno se archiva el día en que ARRANCÓ', () => {
  assert.strictEqual(shiftDateKeyFromStart(at('20260805T071500.000')), '2026-08-05')
  // Nocturno que cruza medianoche: pertenece al día en que empezó.
  assert.strictEqual(shiftDateKeyFromStart(at('20260804T211500.000')), '2026-08-04')
  // Nocturno que arranca a las 00:00: pertenece a ESE día, no al anterior.
  assert.strictEqual(shiftDateKeyFromStart(at('20260805T000000.000')), '2026-08-05')
})

test('shiftDateKeyFromStart: lee en UTC — el huso local no corre la fecha', () => {
  // Con getFullYear()/getDate() en vez de getUTC*, en Chile (UTC-4) un turno de
  // las 02:00 caería en el día anterior.
  assert.strictEqual(shiftDateKeyFromStart(at('20260805T020000.000')), '2026-08-05')
})

// ── currentDateKey ───────────────────────────────────────────────────────────

test('currentDateKey: antes de las 08:00 el "día de sync" sigue siendo el anterior', () => {
  // Ancla del día de PRODUCCIÓN, distinta de la ventana de consulta: a las
  // 06:30 de Chile todavía se está sincronizando el día que arrancó ayer.
  assert.strictEqual(currentDateKey(new Date('2026-08-05T10:30:00Z')), '2026-08-04')  // 06:30 Chile
  assert.strictEqual(currentDateKey(new Date('2026-08-05T13:00:00Z')), '2026-08-05')  // 09:00 Chile
})

// ── deriveShiftGroups ────────────────────────────────────────────────────────

test('deriveShiftGroups: un turno simple sale con su ventana real', () => {
  const groups = deriveShiftGroups(machine([
    iv('Turno 2', '20260805T071500.000', '20260805T072000.000'),
    iv('Turno 2', '20260805T072000.000', '20260805T072500.000'),
    iv('Turno 2', '20260805T145500.000', '20260805T150000.000'),
  ]), 'chonchi')

  assert.strictEqual(groups.length, 1)
  assert.strictEqual(groups[0].shiftId, 'Turno 2')
  assert.deepStrictEqual(groups[0].scheduledStart, at('20260805T071500.000'))
  assert.deepStrictEqual(groups[0].scheduledEnd, at('20260805T150000.000'))
})

test('deriveShiftGroups: descarta los intervals sin etiqueta de turno', () => {
  const groups = deriveShiftGroups(machine([
    iv(null, '20260805T060000.000', '20260805T060500.000'),
    iv('Turno 2', '20260805T071500.000', '20260805T072000.000'),
  ]), 'chonchi')
  assert.strictEqual(groups.length, 1)
})

test('deriveShiftGroups: NO parte un turno que cruza medianoche', () => {
  // Yal Turno 2 va 14:45 → 00:00. Agrupar por hora del interval lo rompería en
  // dos; por eso se agrupa por la etiqueta que manda Shoplogix.
  const groups = deriveShiftGroups(machine([
    iv('Turno 2', '20260802T144500.000', '20260802T145000.000'),
    iv('Turno 2', '20260802T235500.000', '20260803T000000.000'),
  ]), 'yal')
  assert.strictEqual(groups.length, 1)
  assert.deepStrictEqual(groups[0].scheduledEnd, at('20260803T000000.000'))
})

test('deriveShiftGroups: devuelve los turnos ordenados por hora de inicio', () => {
  const groups = deriveShiftGroups(machine([
    iv('Turno 1', '20260805T211500.000', '20260805T212000.000'),
    iv('Turno 2', '20260805T080000.000', '20260805T080500.000'),
  ]), 'chonchi')
  assert.deepStrictEqual(groups.map(g => g.shiftId), ['Turno 2', 'Turno 1'])
})

test('deriveShiftGroups: usa la primera máquina que tenga intervals', () => {
  const groups = deriveShiftGroups([
    { machineProduction: [] },
    { machineProduction: [iv('Turno 2', '20260805T080000.000', '20260805T080500.000')] },
  ], 'chonchi')
  assert.strictEqual(groups.length, 1)
})

test('deriveShiftGroups: sin intervals en ninguna máquina devuelve lista vacía', () => {
  assert.deepStrictEqual(deriveShiftGroups([{ machineProduction: [] }], 'chonchi'), [])
  assert.deepStrictEqual(deriveShiftGroups([], 'chonchi'), [])
})

test('deriveShiftGroups: DOS turnos con el mismo nombre en días distintos NO se fusionan', () => {
  // El caso que rompe todo. Con la ventana ensanchada, una misma consulta ve el
  // "Turno 2" de ayer (que terminó a las 15:00) y el "Turno 2" de hoy (que
  // arrancó a las 07:15). Agrupando solo por el string del nombre, el grupo
  // resultante iba de 08:00 de ayer a 08:00 de hoy — 24 h — y el doc de ayer se
  // quedaba con los ciclos de hoy. Es exactamente lo que se leyó en producción
  // en `2026-08-04_Turno 2`.
  const groups = deriveShiftGroups(machine([
    iv('Turno 2', '20260804T080000.000', '20260804T080500.000'),
    iv('Turno 2', '20260804T145500.000', '20260804T150000.000'),
    // …16 h de hueco…
    iv('Turno 2', '20260805T071500.000', '20260805T072000.000'),
    iv('Turno 2', '20260805T075500.000', '20260805T080000.000'),
  ]), 'chonchi')

  assert.strictEqual(groups.length, 2, 'deben ser DOS turnos, no uno de 24 h')

  const [ayer, hoy] = groups
  assert.deepStrictEqual(ayer.scheduledStart, at('20260804T080000.000'))
  assert.deepStrictEqual(ayer.scheduledEnd, at('20260804T150000.000'))
  assert.deepStrictEqual(hoy.scheduledStart, at('20260805T071500.000'))
  assert.deepStrictEqual(hoy.scheduledEnd, at('20260805T080000.000'))

  // Y cada uno se archiva en SU día.
  assert.strictEqual(shiftDateKeyFromStart(ayer.scheduledStart), '2026-08-04')
  assert.strictEqual(shiftDateKeyFromStart(hoy.scheduledStart), '2026-08-05')
})

test('deriveShiftGroups: una parada larga DENTRO del turno no lo parte en dos', () => {
  // Shoplogix emite intervals también cuando no hay producción (el bloque
  // `Unscheduled` del 04-ago traía 102 intervals con 0 ciclos), así que un
  // turno con la línea parada sigue siendo continuo. El corte debe exigir un
  // hueco mucho mayor que cualquier parada real.
  const groups = deriveShiftGroups(machine([
    iv('Turno 2', '20260805T080000.000', '20260805T080500.000', 100),
    iv('Turno 2', '20260805T100000.000', '20260805T100500.000', 0),
    iv('Turno 2', '20260805T140000.000', '20260805T140500.000', 100),
  ]), 'chonchi')
  assert.strictEqual(groups.length, 1, 'una parada de 4 h no es un turno nuevo')
})

test('deriveShiftGroups: el bloque Unscheduled largo sigue siendo uno solo', () => {
  // Caso real 04-ago: Unscheduled de 15:00 a 07:15 del día siguiente (16 h 15).
  const groups = deriveShiftGroups(machine([
    iv('Unscheduled', '20260804T150000.000', '20260804T150500.000', 0),
    iv('Unscheduled', '20260804T235500.000', '20260805T000000.000', 0),
    iv('Unscheduled', '20260805T071000.000', '20260805T071500.000', 0),
  ]), 'chonchi')
  assert.strictEqual(groups.length, 1)
  assert.deepStrictEqual(groups[0].scheduledEnd, at('20260805T071500.000'))
})
