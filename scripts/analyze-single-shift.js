#!/usr/bin/env node
/**
 * Corre el detector de pausas contra UN cache file específico y muestra el
 * resultado detallado por pantalla. Útil para inspeccionar un turno puntual
 * antes de correr el backfill completo.
 *
 * Uso:
 *   node scripts/analyze-single-shift.js shift-2026-02-27__Turno_d_a.json
 *   node scripts/analyze-single-shift.js 2026-02-27 dia
 */
const fs = require('fs')
const path = require('path')

// ── Port JS del detector (sync con backfill-pauses.js) ───────────────────

const MICRO_MIN_SEC = 60
const MICRO_MAX_SEC = 300
const PAUSA_MAX_SEC = 1800
const LARGA_MAX_SEC = 3600
const COLACION_MIN_MIN = 45
const COLACION_MAX_MIN = 90
const COLACION_WINDOWS = {
  'Turno día':   { start: 12 * 60 + 30, end: 14 * 60 + 30 },
  'Turno noche': { start:  0 * 60 + 30, end:  3 * 60 + 30 },
}

function tierFor(durSec) {
  if (durSec < PAUSA_MAX_SEC) return 'pausa'
  if (durSec < LARGA_MAX_SEC) return 'larga'
  return 'parada'
}
function isColacionCandidate(startMs, endMs, durSec, shiftId) {
  const durMin = durSec / 60
  if (durMin < COLACION_MIN_MIN || durMin > COLACION_MAX_MIN) return false
  const w = COLACION_WINDOWS[shiftId]
  if (!w) return false
  const s = new Date(startMs), e = new Date(endMs)
  const gapStartMin = s.getUTCHours() * 60 + s.getUTCMinutes()
  const gapEndMin = e.getUTCHours() * 60 + e.getUTCMinutes()
  const gapEndAdj = gapEndMin < gapStartMin ? gapEndMin + 24 * 60 : gapEndMin
  return gapStartMin <= w.end && gapEndAdj >= w.start
}
function makePauseId(startMs, durSec) {
  const d = new Date(startMs)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `p-${hh}${mm}-${Math.round(durSec / 60)}m`
}
function detectPauses(tsSorted, shiftId) {
  const pauses = []
  const microByHour = {}
  let microCount = 0
  let microTotalSec = 0
  let totalDeadTimeSec = 0
  for (let i = 1; i < tsSorted.length; i++) {
    const prev = tsSorted[i - 1], curr = tsSorted[i]
    const prevMs = Date.parse(prev), currMs = Date.parse(curr)
    if (isNaN(prevMs) || isNaN(currMs)) continue
    const gapSec = (currMs - prevMs) / 1000
    if (gapSec < MICRO_MIN_SEC) continue
    totalDeadTimeSec += gapSec
    if (gapSec < MICRO_MAX_SEC) {
      microCount++
      microTotalSec += gapSec
      const hh = String(new Date(prevMs).getUTCHours()).padStart(2, '0')
      microByHour[hh] = (microByHour[hh] ?? 0) + gapSec
      continue
    }
    const tier = tierFor(gapSec)
    const pause = {
      id: makePauseId(prevMs, gapSec),
      startAt: prev,
      endAt: curr,
      durationSec: Math.round(gapSec),
      tier,
    }
    if (isColacionCandidate(prevMs, currMs, gapSec, shiftId)) pause.autoTag = 'colacion'
    pauses.push(pause)
  }
  return {
    pauses,
    microDetentions: {
      count: microCount,
      totalSec: Math.round(microTotalSec),
      byHour: Object.fromEntries(Object.entries(microByHour).map(([h, s]) => [h, Math.round(s)])),
    },
    totalDeadTimeSec: Math.round(totalDeadTimeSec),
  }
}

// ── Resolver archivo ──────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Uso: node scripts/analyze-single-shift.js <filename.json | YYYY-MM-DD dia|noche>')
  process.exit(1)
}
let filename
if (args.length === 1) {
  filename = args[0]
} else {
  const [fecha, horario] = args
  const h = horario === 'dia' ? 'd_a' : 'noche'
  filename = `shift-${fecha}__Turno_${h}.json`
}
const filepath = path.join(__dirname, '.cache', filename)
if (!fs.existsSync(filepath)) {
  console.error(`No existe: ${filepath}`)
  process.exit(1)
}

// Extraer fecha + horario del nombre
const m = filename.match(/shift-(\d{4}-\d{2}-\d{2})__Turno_(d_a|noche)/)
if (!m) {
  console.error('Nombre no esperado:', filename)
  process.exit(1)
}
const fecha = m[1]
const shiftId = m[2] === 'd_a' ? 'Turno día' : 'Turno noche'

// ── Ejecutar ──────────────────────────────────────────────────────────────

console.log(`\n━━━ ${fecha} · ${shiftId} ━━━`)
const raw = fs.readFileSync(filepath, 'utf8')
const data = JSON.parse(raw)
const pp = data.pp || []
console.log(`pieces:        ${pp.length.toLocaleString()}`)

const tsSorted = pp.map(p => p.ts).filter(Boolean).sort()
const firstTs = tsSorted[0]
const lastTs = tsSorted[tsSorted.length - 1]

function fmt(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const dow = ['dom','lun','mar','mié','jue','vie','sáb'][d.getUTCDay()]
  return `${dow} ${ts.slice(0, 10)} ${ts.slice(11, 16)}`
}

console.log(`first piece:   ${fmt(firstTs)}`)
console.log(`last piece:    ${fmt(lastTs)}`)
const wallClockSec = (Date.parse(lastTs) - Date.parse(firstTs)) / 1000
console.log(`wall clock:    ${Math.round(wallClockSec / 60)} min (${(wallClockSec / 3600).toFixed(1)} h)`)

const det = detectPauses(tsSorted, shiftId)
const activeMinutes = new Set(tsSorted.map(t => t.slice(0, 16))).size
console.log(`active min:    ${activeMinutes}  (minutos únicos con ≥1 pieza)`)
console.log(`dead time:     ${Math.round(det.totalDeadTimeSec / 60)} min (${(det.totalDeadTimeSec / 60 / wallClockSec * 60 * 100).toFixed(1)}% del wall clock)`)

console.log(`\n── MICRO-DETENCIONES (1-5 min) ──`)
console.log(`count:         ${det.microDetentions.count}`)
console.log(`total:         ${Math.round(det.microDetentions.totalSec / 60)} min`)
console.log(`prom:          ${det.microDetentions.count > 0 ? (det.microDetentions.totalSec / det.microDetentions.count).toFixed(0) : 0}s por micro`)
console.log(`byHour:`)
for (const h of Object.keys(det.microDetentions.byHour).sort()) {
  const sec = det.microDetentions.byHour[h]
  console.log(`  ${h}:00  →  ${Math.round(sec / 60)}m ${sec % 60}s`)
}

console.log(`\n── PAUSAS (≥5 min) ──`)
if (det.pauses.length === 0) {
  console.log('(ninguna)')
} else {
  const byTier = { pausa: 0, larga: 0, parada: 0 }
  for (const p of det.pauses) byTier[p.tier]++
  console.log(`total: ${det.pauses.length}  (pausa: ${byTier.pausa}, larga: ${byTier.larga}, parada: ${byTier.parada})`)
  const autoCol = det.pauses.filter(p => p.autoTag === 'colacion').length
  console.log(`auto-tag colación: ${autoCol}`)
  console.log(``)
  for (const p of det.pauses) {
    const durMin = p.durationSec / 60
    const startHM = p.startAt.slice(11, 16)
    const endHM = p.endAt.slice(11, 16)
    const label = p.autoTag === 'colacion' ? '🍽️  COLACIÓN' : `   ${p.tier.toUpperCase().padEnd(8)}`
    const bar = '▓'.repeat(Math.min(40, Math.round(durMin / 3)))
    console.log(`  ${label}  ${startHM}–${endHM}  ${String(Math.round(durMin)).padStart(3)} min  ${bar}`)
  }
}
console.log(``)
