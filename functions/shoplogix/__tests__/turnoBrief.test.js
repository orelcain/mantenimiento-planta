/**
 * Tests de turnoBrief (node:test — correr con `node --test`).
 * Datos calcados de docs reales de Firestore (Yal 2026-07-16) y del rollup
 * capturado en vivo (chonchi Turno 1: COHO, targets 1109/934/934).
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { componerBriefInicioTurno, componerBriefFinTurno, resumenParos, evaluarDelayCheck } = require('../turnoBrief')

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
