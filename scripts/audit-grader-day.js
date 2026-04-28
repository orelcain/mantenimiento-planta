/**
 * Audit Grader + Shoplogix: para un dateKey dado, lee los pieceRecords
 * Grader y los intervals/states de Shoplogix Baader 142, y reporta:
 *   - Histograma comparado Grader vs Baader (sumado de 3 máquinas) por bucket
 *   - Gaps consecutivos > 10 min en Grader
 *   - Estados Shoplogix en cada gap (downtime/MMPP/setup) — ¿lo justifican?
 *   - Veredicto por gap: justificado, no-justificado, o desconocido
 *
 * Wall-clock-as-UTC: usa getUTC* para que las horas reflejen Chile.
 *
 * Uso:
 *   node scripts/audit-grader-day.js 2026-02-14
 *   node scripts/audit-grader-day.js 2026-02-14 --csv > out.csv
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) })
}
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const dateKey = process.argv[2]
const CSV = process.argv.includes('--csv')
if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
  console.error('Uso: node scripts/audit-grader-day.js YYYY-MM-DD [--csv]')
  process.exit(1)
}

const GAP_THRESHOLD_MIN = 10
const BUCKET_MIN = 5

function prevDateKey(dk) {
  const [y, m, d] = dk.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function nextDateKey(dk) {
  const [y, m, d] = dk.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function fmtUTC(ts) {
  const d = new Date(ts)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function fmtDateUTC(ts) {
  const d = new Date(ts)
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

async function fetchSummaryRecords(summaryId) {
  const summaryRef = db.collection('graderDailySummaries').doc(summaryId)
  const summarySnap = await summaryRef.get()
  if (!summarySnap.exists) return { exists: false, records: [], summary: null }
  const summary = summarySnap.data()
  const recordsSnap = await summaryRef.collection('pieceRecords').get()
  const records = []
  recordsSnap.forEach((doc) => {
    const d = doc.data()
    if (d && d.ts) records.push({ ts: d.ts, gate: d.gate, quality: d.quality })
  })
  records.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  return { exists: true, records, summary }
}

/**
 * Lee los 3 docs Shoplogix (1 por máquina Baader) para un shift dado.
 * Devuelve intervals[] sumados por bucket 5-min y states[] combinados.
 */
async function fetchShoplogixShift(shiftDocId) {
  const machinesRef = db.collection('shoplogix').doc('chonchi').collection('shifts').doc(shiftDocId).collection('machines')
  const snap = await machinesRef.get()
  if (snap.empty) return { exists: false, intervals: [], states: [] }
  const allIntervals = []
  const allStates = []
  snap.forEach((d) => {
    const data = d.data()
    if (Array.isArray(data.intervals)) allIntervals.push(...data.intervals.map((i) => ({ ...i, machineid: data.machineid })))
    if (Array.isArray(data.states))    allStates.push(...data.states.map((s) => ({ ...s, machineid: data.machineid })))
  })
  return { exists: true, intervals: allIntervals, states: allStates }
}

/** Suma cycles Baader por bucket 5-min para piezas dentro del calendar day. */
function shoplogixHistogram(intervals, dateKey, bucketMin) {
  const buckets = new Array(Math.ceil(1440 / bucketMin)).fill(0)
  for (const it of intervals) {
    const startMs = (it.startAt?._seconds ?? 0) * 1000
    if (!startMs) continue
    if (fmtDateUTC(startMs) !== dateKey) continue
    const d = new Date(startMs)
    const min = d.getUTCHours() * 60 + d.getUTCMinutes()
    const idx = Math.floor(min / bucketMin)
    buckets[idx] += (it.cycles || 0)
  }
  return buckets
}

/** Devuelve el state Shoplogix activo en el midpoint de un gap. */
function findStateAtMidpoint(states, fromMs, toMs) {
  const midMs = (fromMs + toMs) / 2
  return states.find((s) => {
    const sMs = (s.startAt?._seconds ?? 0) * 1000
    const eMs = (s.endAt?._seconds ?? 0) * 1000
    return sMs <= midMs && midMs <= eMs
  })
}

async function main() {
  const prev = prevDateKey(dateKey)
  const next = nextDateKey(dateKey)
  const candidates = [
    `${prev}__Turno noche`,
    `${dateKey}__Turno día`,
    `${dateKey}__Turno noche`,
  ]

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  AUDIT GRADER ${dateKey} (Chile wall-clock-as-UTC)`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

  // ── 1) Cargar summaries y pieceRecords
  const all = []
  for (const id of candidates) {
    const { exists, records, summary } = await fetchSummaryRecords(id)
    all.push({ id, exists, records, summary })
    if (!exists) {
      console.log(`✗ ${id}  →  no existe`)
      continue
    }
    const first = records[0]?.ts
    const last = records[records.length - 1]?.ts
    console.log(`✓ ${id}`)
    console.log(`  ├─ piezas:       ${records.length.toLocaleString('es-CL')}`)
    console.log(`  ├─ summary.startAt: ${summary.startAt ?? '—'}`)
    console.log(`  ├─ summary.endAt:   ${summary.endAt ?? '—'}`)
    console.log(`  ├─ records first:   ${first ?? '—'}`)
    console.log(`  └─ records last:    ${last ?? '—'}`)
  }

  // ── 2) Filtrar TODOS los pieceRecords cuyo ts cae dentro del calendar day dateKey
  const allRecs = all.flatMap((s) =>
    s.records.map((r) => ({ ...r, sourceSummary: s.id })),
  )
  const dayRecs = allRecs
    .filter((r) => fmtDateUTC(r.ts) === dateKey)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  console.log(`\n📅 Piezas totales con ts ∈ ${dateKey}:  ${dayRecs.length.toLocaleString('es-CL')}`)
  if (dayRecs.length === 0) {
    console.log('Sin actividad real en este día calendárico.\n')
    return
  }

  // ── 3) Histograma 5-min buckets
  console.log(`\n📊 HISTOGRAMA — buckets de ${BUCKET_MIN} min  (cada █ ≈ 50 piezas)\n`)
  const buckets = new Array(Math.ceil(1440 / BUCKET_MIN)).fill(0)
  for (const r of dayRecs) {
    const d = new Date(r.ts)
    const min = d.getUTCHours() * 60 + d.getUTCMinutes()
    const idx = Math.floor(min / BUCKET_MIN)
    buckets[idx]++
  }
  // Sólo imprimir buckets con actividad o adyacentes a actividad
  for (let i = 0; i < buckets.length; i++) {
    const c = buckets[i]
    if (c === 0) {
      // Sólo mostrar gap si entre dos zonas activas
      const prevAct = buckets.slice(Math.max(0, i - 3), i).some((x) => x > 0)
      const nextAct = buckets.slice(i + 1, Math.min(buckets.length, i + 4)).some((x) => x > 0)
      if (!(prevAct && nextAct)) continue
    }
    const h = Math.floor((i * BUCKET_MIN) / 60)
    const m = (i * BUCKET_MIN) % 60
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    const bar = c > 0 ? '█'.repeat(Math.max(1, Math.round(c / 50))) : '·'
    console.log(`  ${hh}:${mm}  ${String(c).padStart(5)}  ${bar}`)
  }

  // ── 3.5) SHOPLOGIX: cargar 3 docs (1 por shift candidato) y comparar
  console.log(`\n🏭 SHOPLOGIX BAADER 142 (cross-ref):\n`)
  const slxByShift = {}
  let slxStatesAll = []
  let slxIntervalsAll = []
  for (const id of candidates) {
    const docId = id.replace('__', '_') // graderDailySummary id usa __, shoplogix usa _
    const { exists, intervals, states } = await fetchShoplogixShift(docId)
    slxByShift[id] = { exists, intervals, states }
    if (!exists) {
      console.log(`  ✗ ${id}  →  sin doc Shoplogix`)
      continue
    }
    const cyclesInDay = intervals
      .filter((it) => fmtDateUTC((it.startAt?._seconds ?? 0) * 1000) === dateKey)
      .reduce((a, x) => a + (x.cycles || 0), 0)
    console.log(`  ✓ ${id}  →  ${intervals.length} intervals, ${states.length} states, ${cyclesInDay.toLocaleString('es-CL')} cycles ∈ ${dateKey}`)
    slxIntervalsAll.push(...intervals)
    slxStatesAll.push(...states)
  }

  const slxBuckets = shoplogixHistogram(slxIntervalsAll, dateKey, BUCKET_MIN)
  const totalSlxInDay = slxBuckets.reduce((a, b) => a + b, 0)
  const totalGraderInDay = dayRecs.length
  const ratio = totalSlxInDay > 0 ? (totalGraderInDay / totalSlxInDay).toFixed(2) : '—'
  console.log(`\n  Total Baader (3 maq) ∈ ${dateKey}: ${totalSlxInDay.toLocaleString('es-CL')} cycles`)
  console.log(`  Total Grader            ∈ ${dateKey}: ${totalGraderInDay.toLocaleString('es-CL')} pz`)
  console.log(`  Ratio Grader/Baader: ${ratio}  (esperado ~1.0–1.1, downstream con merma)`)

  // ── 3.6) Histograma comparado (5-min) Grader vs Baader, side-by-side
  console.log(`\n📊 HISTOGRAMA COMPARADO  Grader [G] vs Baader [B]  (cada █ ≈ 50)\n`)
  for (let i = 0; i < buckets.length; i++) {
    const g = buckets[i]
    const s = slxBuckets[i]
    if (g === 0 && s === 0) {
      const prevAct = (buckets.slice(Math.max(0, i - 3), i).some((x) => x > 0) ||
                       slxBuckets.slice(Math.max(0, i - 3), i).some((x) => x > 0))
      const nextAct = (buckets.slice(i + 1, Math.min(buckets.length, i + 4)).some((x) => x > 0) ||
                       slxBuckets.slice(i + 1, Math.min(slxBuckets.length, i + 4)).some((x) => x > 0))
      if (!(prevAct && nextAct)) continue
    }
    const h = Math.floor((i * BUCKET_MIN) / 60)
    const m = (i * BUCKET_MIN) % 60
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    const gBar = g > 0 ? '█'.repeat(Math.max(1, Math.round(g / 50))) : '·'
    const sBar = s > 0 ? '█'.repeat(Math.max(1, Math.round(s / 50))) : '·'
    let flag = ''
    if (s > 50 && g === 0) flag = '  ⚠ Baader pasó piezas, Grader vacío'
    else if (s > g * 1.5 && s > 50) flag = '  ⚠ Baader >> Grader (posible loss)'
    console.log(`  ${hh}:${mm}  G ${String(g).padStart(4)} ${gBar.padEnd(8)}  B ${String(s).padStart(4)} ${sBar.padEnd(8)}${flag}`)
  }

  // ── 4) Gaps consecutivos > GAP_THRESHOLD_MIN
  console.log(`\n⏸  GAPS Grader consecutivos > ${GAP_THRESHOLD_MIN} min  (con razón Shoplogix):\n`)
  const gaps = []
  for (let i = 1; i < dayRecs.length; i++) {
    const a = new Date(dayRecs[i - 1].ts).getTime()
    const b = new Date(dayRecs[i].ts).getTime()
    const dur = (b - a) / 1000 / 60
    if (dur >= GAP_THRESHOLD_MIN) {
      gaps.push({ from: dayRecs[i - 1].ts, to: dayRecs[i].ts, durMin: dur, idx: i })
    }
  }
  if (gaps.length === 0) {
    console.log('  (ninguno)\n')
  } else {
    for (const g of gaps) {
      const fromShift = dayRecs[g.idx - 1].sourceSummary
      const toShift = dayRecs[g.idx].sourceSummary
      const crossesBoundary = fromShift !== toShift
      const tag = crossesBoundary ? ' 🔀 cruza turno' : ''
      // Cross-ref Shoplogix: ¿qué state estaba activo en el midpoint del gap?
      const fromMs = new Date(g.from).getTime()
      const toMs = new Date(g.to).getTime()
      const slxState = findStateAtMidpoint(slxStatesAll, fromMs, toMs)
      const reason = slxState
        ? ` · Shoplogix: ${slxState.type}${slxState.reason ? ' (' + slxState.reason + ')' : ''}`
        : ' · sin state Shoplogix'
      // Sumar cycles Baader en la ventana del gap
      const cyclesInGap = slxIntervalsAll.reduce((sum, it) => {
        const sMs = (it.startAt?._seconds ?? 0) * 1000
        if (sMs >= fromMs && sMs <= toMs) return sum + (it.cycles || 0)
        return sum
      }, 0)
      const verdict = cyclesInGap > 50
        ? ' ❌ Baader procesó ' + cyclesInGap + ' piezas en este gap → DATA GRADER PERDIDA'
        : cyclesInGap > 0
        ? ' ⚠ Baader procesó ' + cyclesInGap + ' piezas en este gap (poco)'
        : ' ✓ Baader también detenido — gap operativo legítimo'
      console.log(
        `  ${fmtUTC(g.from)} → ${fmtUTC(g.to)}  ${String(Math.round(g.durMin)).padStart(4)} min${tag}${reason}`,
      )
      console.log(`     ${verdict}`)
      if (crossesBoundary) {
        console.log(`     ${fromShift}  →  ${toShift}`)
      }
    }
    console.log()
  }

  // ── 5) Boundary check: ¿hay continuidad real al cruzar 07:00 y 19:00?
  console.log(`\n🔍 BOUNDARIES (07:00 día, 19:00 noche):\n`)
  for (const boundaryMin of [7 * 60, 19 * 60]) {
    const hh = String(Math.floor(boundaryMin / 60)).padStart(2, '0')
    const before = dayRecs
      .filter((r) => {
        const d = new Date(r.ts)
        const m = d.getUTCHours() * 60 + d.getUTCMinutes()
        return m < boundaryMin && m >= boundaryMin - 30
      })
      .slice(-3)
    const after = dayRecs
      .filter((r) => {
        const d = new Date(r.ts)
        const m = d.getUTCHours() * 60 + d.getUTCMinutes()
        return m >= boundaryMin && m < boundaryMin + 30
      })
      .slice(0, 3)

    console.log(`  ${hh}:00 →`)
    if (before.length === 0 && after.length === 0) {
      console.log(`    sin actividad alrededor (±30min)`)
    } else {
      console.log(`    últimas 3 antes: ${before.map((r) => fmtUTC(r.ts) + ' [' + r.sourceSummary.split('__')[1] + ']').join(', ') || '—'}`)
      console.log(`    primeras 3 después: ${after.map((r) => fmtUTC(r.ts) + ' [' + r.sourceSummary.split('__')[1] + ']').join(', ') || '—'}`)
      if (before.length && after.length) {
        const gap = (new Date(after[0].ts).getTime() - new Date(before[before.length - 1].ts).getTime()) / 1000 / 60
        console.log(`    gap real al cruzar: ${gap.toFixed(1)} min`)
      }
    }
  }

  // ── 6) Resumen final
  console.log(`\n📋 RESUMEN  (segmentación actual del segmenter):\n`)
  for (const s of all) {
    if (!s.exists) continue
    const inDay = s.records.filter((r) => fmtDateUTC(r.ts) === dateKey)
    if (inDay.length === 0) continue
    const first = inDay[0].ts
    const last = inDay[inDay.length - 1].ts
    const durMin = Math.round((new Date(last).getTime() - new Date(first).getTime()) / 1000 / 60)
    console.log(
      `  ${s.id.padEnd(35)}  ${fmtUTC(first)}–${fmtUTC(last)}  (${Math.floor(durMin / 60)}h${durMin % 60}m)  ${inDay.length.toLocaleString('es-CL')} pz`,
    )
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

  if (CSV) {
    const lines = ['hh:mm,piezas']
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i] === 0) continue
      const h = Math.floor((i * BUCKET_MIN) / 60)
      const m = (i * BUCKET_MIN) % 60
      lines.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')},${buckets[i]}`)
    }
    console.error(lines.join('\n')) // CSV a stderr para no mezclar
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
