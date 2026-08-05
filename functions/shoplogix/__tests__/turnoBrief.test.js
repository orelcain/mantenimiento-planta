/**
 * Tests de turnoBrief (node:test — correr con `node --test`).
 * Datos calcados de docs reales de Firestore (Yal 2026-07-16) y del rollup
 * capturado en vivo (chonchi Turno 1: COHO, targets 1109/934/934).
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { componerBriefInicioTurno, componerBriefFinTurno, resumenParos, evaluarDelayCheck, componerMensajeRecuperacion } = require('../turnoBrief')

// wall-clock-as-UTC (convención del proyecto)
const wall = (h, m = 0) => new Date(Date.UTC(2026, 6, 16, h, m))

test('inicio: completo con horario oficial + especie + target (caso chonchi Turno 1 real)', () => {
  const msg = componerBriefInicioTurno({
    plantLabel: 'Chonchi',
    shiftId: 'Turno 1',
    officialSchedule: { start: wall(21, 30), end: new Date(Date.UTC(2026, 6, 17, 5, 45)) },
    currentJob: { name: 'COHO', jobMaxRunRate: 960 },
    officialTargets: {
      '3cbc4c21': 1109.4195, '6f76be97': 934.248, 'ce16a125': 934.248,
    },
  })
  assert.match(msg, /Inicio de turno · Chonchi/)
  assert.match(msg, /Turno 1 ha arrancado/)
  assert.match(msg, /21:30 → 05:45/)
  assert.match(msg, /COHO.*960 pph/)
  assert.match(msg, /2\.978.*ciclos \(3 máquinas\)/) // 1109+934+934 ≈ 2978
})

test('inicio: degrada limpio sin rollup (turno sin enriquecer — caso normal en backfill)', () => {
  const msg = componerBriefInicioTurno({
    plantLabel: 'Yal', shiftId: 'Turno 3',
    officialSchedule: null, currentJob: null, officialTargets: null,
  })
  assert.match(msg, /Inicio de turno · Yal/)
  assert.match(msg, /Turno 3 ha arrancado/)
  assert.ok(!msg.includes('Horario oficial'), 'sin schedule no debe inventar la línea')
  assert.ok(!msg.includes('Especie'))
  assert.ok(!msg.includes('Target'))
})

test('resumenParos separa macro de micro y suma segundos', () => {
  const r = resumenParos([
    { type: 'downtime', name: 'Detencion', reason: 'LOGICA', durationSec: 300 },
    { type: 'downtime', name: 'Micro Detencion', durationSec: 45 },
    { type: 'downtime', name: 'Detencion', reason: 'FALTA MMPP', durationSec: 600 },
    { type: 'uptime', durationSec: 7200 },
    { type: 'break', name: 'COLACION', durationSec: 1800 },
  ])
  assert.deepStrictEqual(r, { macroCount: 2, macroSec: 900, microCount: 1, microSec: 45 })
})

test('fin: piezas por máquina, total, % target, uptime, paros y calidad', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Yal', shiftId: 'Turno 2', dateKey: '2026-07-16',
    machines: [
      { machineName: 'YAL Evisceradora 1', totalCycles: 5576, shiftRuntime: 0.91, states: [{ type: 'downtime', name: 'Detencion', durationSec: 420 }] },
      { machineName: 'YAL Evisceradora 2', totalCycles: 5679, shiftRuntime: 0.93, states: [] },
      { machineName: 'YAL Evisceradora 3', totalCycles: 5949, shiftRuntime: 0.86, states: [{ type: 'downtime', name: 'Micro Detencion', durationSec: 50 }] },
    ],
    officialTargets: { a: 4662.6856, b: 4662.6832, c: 5536.933 },
    currentJob: { name: 'SALAR' },
    grader: { pointZeroPct: 1.87, totalPieces: 16800 },
  })
  assert.match(msg, /Fin de turno · Yal/)
  assert.match(msg, /Turno 2 · 2026-07-16/)
  assert.match(msg, /YAL Evisceradora 1.*5\.576/)
  assert.match(msg, /Total: <b>17\.204<\/b> piezas/)
  assert.match(msg, /✅ 116% del target/) // 17204/14862 ≈ 115.8%
  assert.match(msg, /SALAR/)
  assert.match(msg, /Uptime promedio: <b>90%<\/b>/) // (0.91+0.93+0.86)/3 = 0.90
  assert.match(msg, /⛔ 1 paro \(7m\)/)
  assert.match(msg, /⚡ 1 micro \(50s\)/)
  assert.match(msg, /P0 <b>1\.87%<\/b>.*16\.800 pz/)
})

test('fin: sin target, sin grader, sin paros — degrada limpio (caso Yal hoy)', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Yal', shiftId: 'Turno 3', dateKey: '2026-07-16',
    machines: [
      { machineName: 'YAL Evisceradora 1', totalCycles: 5000, shiftRuntime: 0.8, states: [] },
    ],
    officialTargets: null, currentJob: null, grader: null,
  })
  assert.match(msg, /Total: <b>5\.000<\/b> piezas/)
  assert.ok(!msg.includes('% del target'), 'sin targets no inventa cumplimiento')
  assert.ok(!msg.includes('Calidad'), 'sin Excel no inventa P0')
  assert.match(msg, /✅ Sin paros registrados/)
})

test('fin: cumplimiento bajo marca rojo', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Chonchi', shiftId: 'Turno 2', dateKey: '2026-07-16',
    machines: [{ machineName: 'Ev1', totalCycles: 1000, shiftRuntime: 0.5, states: [] }],
    officialTargets: { a: 5000 }, currentJob: null, grader: null,
  })
  assert.match(msg, /🔴 20% del target/)
})

// ── evaluarDelayCheck ─────────────────────────────────────────────────────────
// Datos calcados del incidente real 2026-07-17: día sin proceso → cada máquina
// con 0 ciclos y UN solo estado idle "Detencion" → la alerta vieja spameaba.

const idleDay = [
  { states: [{ type: 'break', name: 'Detencion' }] },
  { states: [{ type: 'break', name: 'Detencion' }] },
  { states: [{ type: 'downtime', name: 'Detencion' }] },
]

test('delayCheck: día sin proceso (solo estado idle) → wait, no alerta', () => {
  const r = evaluarDelayCheck({
    totalCycles: 0, machines: idleDay,
    checkAt: wall(9, 5), now: wall(10, 0),
  })
  assert.strictEqual(r, 'wait')
})

test('delayCheck: sin proceso y el turno quedó atrás (>12h) → expire silencioso', () => {
  const r = evaluarDelayCheck({
    totalCycles: 0, machines: idleDay,
    checkAt: wall(9, 5), now: new Date(wall(9, 5).getTime() + 13 * 3600 * 1000),
  })
  assert.strictEqual(r, 'expire')
})

test('delayCheck: actividad (uptime) pero 0 piezas → alert', () => {
  const r = evaluarDelayCheck({
    totalCycles: 0,
    machines: [{ states: [{ type: 'uptime', name: 'Produciendo' }] }],
    checkAt: wall(9, 5), now: wall(10, 0),
  })
  assert.strictEqual(r, 'alert')
})

test('delayCheck: estados cambiando (>1 por máquina) sin uptime → alert', () => {
  const r = evaluarDelayCheck({
    totalCycles: 0,
    machines: [{ states: [{ type: 'break', name: 'Detencion' }, { type: 'downtime', name: 'Detencion' }] }],
    checkAt: wall(9, 5), now: wall(10, 0),
  })
  assert.strictEqual(r, 'alert')
})

test('delayCheck: con piezas → ok aunque haya poca actividad', () => {
  const r = evaluarDelayCheck({
    totalCycles: 42, machines: idleDay,
    checkAt: wall(9, 5), now: wall(10, 0),
  })
  assert.strictEqual(r, 'ok')
})

test('delayCheck: sin docs de máquinas todavía → wait (no alertar en vacío)', () => {
  const r = evaluarDelayCheck({
    totalCycles: 0, machines: [],
    checkAt: wall(9, 5), now: wall(10, 0),
  })
  assert.strictEqual(r, 'wait')
})

// ── F3: ciclo de recuperación (alerted:true) ───────────────────────────────────

test('delayCheck: ya alertó y llegan piezas → recovered (no "ok")', () => {
  const r = evaluarDelayCheck({
    totalCycles: 10, machines: idleDay,
    checkAt: wall(9, 5), now: wall(10, 30),
    alerted: true,
  })
  assert.strictEqual(r, 'recovered')
})

test('delayCheck: ya alertó y SIGUE sin piezas → wait, no re-alerta aunque la actividad bajara', () => {
  const r = evaluarDelayCheck({
    totalCycles: 0, machines: idleDay, // sin actividad real, ni importa: ya alertó
    checkAt: wall(9, 5), now: wall(10, 30),
    alerted: true,
  })
  assert.strictEqual(r, 'wait')
})

test('delayCheck: ya alertó y sigue sin piezas pasadas 12h → expire igual (no queda esperando eternamente)', () => {
  const r = evaluarDelayCheck({
    totalCycles: 0, machines: idleDay,
    checkAt: wall(9, 5), now: new Date(wall(9, 5).getTime() + 13 * 3600 * 1000),
    alerted: true,
  })
  assert.strictEqual(r, 'expire')
})

test('componerMensajeRecuperacion: formato con minutos de demora', () => {
  const msg = componerMensajeRecuperacion({ plantLabel: 'Yal', shiftId: 'Turno 2', delayMinutes: 47 })
  assert.match(msg, /✅ <b>Arrancó<\/b> — Yal/)
  assert.match(msg, /Turno 2 · demoró <b>47 min<\/b>/)
})

// ── Brief de fin de turno en lineas cuyo turno NO esta acotado en Shoplogix ──
// Caso real: el area Filete etiqueta "Turno Dia" sobre 24 h, asi que el brief
// decia "Horario real: 08:00 -> 08:00". La ventana efectiva (primera -> ultima
// pieza) es la unica que informa algo.

test('componerBriefFinTurno: con turno de 24h muestra la OPERACION REAL', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Filete', shiftId: 'Turno Dia', dateKey: '2026-07-28',
    machines: [{ machineName: 'Linea 1', totalCycles: 59, shiftRuntime: 0.33, states: [] }],
    officialTargets: null, currentJob: null, grader: null,
    realSchedule:      { start: new Date('2026-07-28T08:00:00Z'), end: new Date('2026-07-29T08:00:00Z') },
    effectiveSchedule: { start: new Date('2026-07-28T09:56:00Z'), end: new Date('2026-07-28T16:11:00Z') },
  })
  assert.ok(msg.includes('Operación real'), 'debe rotular que es la ventana real')
  assert.ok(!msg.includes('08:00 → 08:00'), 'no debe mostrar la ventana de 24 h')
})

test('componerBriefFinTurno: con turno acotado mantiene el horario del turno', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Yal', shiftId: 'Turno 2', dateKey: '2026-05-08',
    machines: [{ machineName: 'YAL Evisceradora 1', totalCycles: 14006, shiftRuntime: 0.8, states: [] }],
    officialTargets: null, currentJob: null, grader: null,
    realSchedule:      { start: new Date('2026-05-08T14:45:00Z'), end: new Date('2026-05-09T00:00:00Z') },
    effectiveSchedule: { start: new Date('2026-05-08T15:00:00Z'), end: new Date('2026-05-08T23:40:00Z') },
  })
  assert.ok(msg.includes('Horario real'), 'la ventana del turno es representativa: se mantiene')
})

test('componerBriefFinTurno: nombra los paros que quedaron sin causa anotada', () => {
  const base = {
    plantLabel: 'Filete', shiftId: 'Turno Dia', dateKey: '2026-07-28',
    machines: [{
      machineName: 'Linea 1', totalCycles: 5000, shiftRuntime: 0.9,
      states: [{ type: 'downtime', name: 'Detencion', reason: '', durationSec: 1368 }],
    }],
    officialTargets: null, currentJob: null, grader: null, realSchedule: null,
  }
  const con = componerBriefFinTurno({ ...base, stopsWithoutCause: { count: 1, minutes: 23 } })
  assert.ok(con.includes('sin causa anotada'))
  assert.ok(con.includes('Análisis de Turno'), 'debe decir dónde anotarla')

  const sin = componerBriefFinTurno({ ...base, stopsWithoutCause: { count: 0, minutes: 0 } })
  assert.ok(!sin.includes('sin causa anotada'), 'si no falta ninguna, no molesta con la linea')

  const nulo = componerBriefFinTurno({ ...base, stopsWithoutCause: null })
  assert.ok(!nulo.includes('sin causa anotada'), 'si no se pudo contar, el brief sale igual sin la linea')
})

// ── Cumplimiento vs lo PLANIFICADO (5.000 pz/turno en Filete) ───────────────
// Shoplogix no manda target oficial en Filete, asi que sin esto el brief no
// tenia contra que medir el turno.

test('componerBriefFinTurno: sin target oficial usa lo planificado y lo rotula asi', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Filete', shiftId: 'Turno Dia', dateKey: '2026-08-01',
    machines: [{ machineName: 'Linea 1', totalCycles: 4200, shiftRuntime: 0.8, states: [] }],
    officialTargets: null, currentJob: null, grader: null, realSchedule: null,
    plannedTargetPieces: 5000,
  })
  assert.ok(msg.includes('84% de lo planificado'), 'debe medir 4.200 sobre 5.000')
  assert.ok(msg.includes('5.000'))
  assert.ok(!msg.includes('del target'), 'no debe llamarlo "target": no es el del sensor')
})

test('componerBriefFinTurno: el target OFICIAL de Shoplogix le gana al planificado', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Filete', shiftId: 'Turno Dia', dateKey: '2026-08-01',
    machines: [{ machineName: 'Linea 1', totalCycles: 4200, shiftRuntime: 0.8, states: [] }],
    officialTargets: { m1: 4000 }, currentJob: null, grader: null, realSchedule: null,
    plannedTargetPieces: 5000,
  })
  assert.ok(msg.includes('del target'), 'con target oficial, ese manda')
  assert.ok(msg.includes('105%'), '4.200 sobre 4.000')
  assert.ok(!msg.includes('de lo planificado'))
})

test('componerBriefFinTurno: sin ningun target no inventa un porcentaje', () => {
  const msg = componerBriefFinTurno({
    plantLabel: 'Yal', shiftId: 'Turno 2', dateKey: '2026-08-01',
    machines: [{ machineName: 'YAL Evisceradora 1', totalCycles: 4200, shiftRuntime: 0.8, states: [] }],
    officialTargets: null, currentJob: null, grader: null, realSchedule: null,
    plannedTargetPieces: null,
  })
  // El uptime lleva su propio % legitimo: lo que NO debe aparecer es una linea
  // de cumplimiento inventada sobre el total de piezas.
  assert.ok(!msg.includes('de lo planificado'))
  assert.ok(!msg.includes('del target'))
  assert.match(msg, /📦 Total: <b>4\.200<\/b> piezas$/m, 'el total va solo, sin porcentaje')
})
