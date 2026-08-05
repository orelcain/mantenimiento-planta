/**
 * rebuild-shift-from-excel.js
 *
 * Reconstruye UN turno desde sus Excel de Storage, con la ventana horaria dada a
 * mano. Para cuando la segmentación automática dejó un turno mal cortado o con
 * piezas huérfanas.
 *
 * Caso que lo originó (3-ago-2026): Shoplogix tenía ese día mal configurado —
 * `Turno 2` iba de 09:15 a las 08:00 del día SIGUIENTE (23 h), solapado con
 * `Turno 1` y con `Unscheduled`. Al re-subir los Excel, el turno de noche quedó
 * partido en dos (el corte de las 05:00) y las 6.526 piezas del turno de día
 * quedaron fuera de toda ventana: desaparecieron de los KPIs sin aviso.
 *
 * Escribe el summary + `meta/gate0` + `meta/timeline` del turno, en modo agregado
 * (sin pieceRecords), igual que load-missing-shifts.js. Los helpers de parseo son
 * los de ese script — si cambian allá, cambiarlos acá.
 *
 * Uso:
 *   node scripts/rebuild-shift-from-excel.js --shift "2026-08-03__Turno 2" \
 *        --desde 2026-08-03T08:00:00Z --hasta 2026-08-03T19:00:00Z
 *   ... --confirm     para escribir
 *
 * Los Excel se buscan en `graderUploads` por las fechas que toca la ventana.
 */

'use strict'
const admin = require('firebase-admin')
const XLSX = require('xlsx')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
  })
}
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })
const bucket = admin.storage().bucket()

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null }
const CONFIRM = process.argv.includes('--confirm')
const SHIFT_ID = arg('--shift')
const DESDE = arg('--desde')
const HASTA = arg('--hasta')

if (!SHIFT_ID || !DESDE || !HASTA) {
  console.error('Faltan argumentos: --shift <id> --desde <ISO> --hasta <ISO>')
  process.exit(1)
}

const GATE0_SCHEMA_VERSION = 1
const TIMELINE_SCHEMA_VERSION = 1
const CHUNK_SIZE = 2000

const CALIBRE_WEIGHT_RANGES = [
  { calibre: '0-2 lb', minGrams: 0, maxGrams: 916 },
  { calibre: '2-4 lb', minGrams: 916, maxGrams: 1833 },
  { calibre: '4-6 lb', minGrams: 1833, maxGrams: 2749 },
  { calibre: '6-8 lb', minGrams: 2749, maxGrams: 3665 },
  { calibre: '8-10 lb', minGrams: 3665, maxGrams: 4581 },
  { calibre: '10-12 lb', minGrams: 4581, maxGrams: 9163 },
]

// ── Helpers de parseo (copiados de load-missing-shifts.js) ───────────────────

const norm = (s) => s == null ? '' : String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const r = (n, d = 2) => +Number(n).toFixed(d)


function parseNum(v) {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function parseDatetime(dateVal, timeVal) {
  let dateStr = ''
  let timeStr = ''
  if (typeof dateVal === 'number') {
    dateStr = new Date(Math.floor(dateVal - 25569) * 86400 * 1000).toISOString().slice(0, 10)
  } else if (dateVal != null) {
    const s = String(dateVal).trim()
    const m1 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
    if (m1) dateStr = `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateStr = s.slice(0, 10)
  }
  if (typeof timeVal === 'number') {
    const t = Math.round(timeVal * 86400)
    timeStr = `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  } else if (timeVal != null) {
    const m = String(timeVal).trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
    if (m) timeStr = `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${(m[3] || '00').padStart(2, '0')}`
  }
  if (!dateStr) return null
  return `${dateStr}T${timeStr || '00:00:00'}.000Z`
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue
    const cells = row.map(norm).filter(Boolean)
    if (cells.length < 3) continue
    if (cells.some((c) => c === 'fecha' || c === 'date') && cells.some((c) => c.includes('pieza') || c.includes('cantidad') || c === 'qty')) {
      return { rowIndex: i, headers: row.map(norm) }
    }
  }
  return null
}

function col(map, ...names) {
  for (const n of names) {
    const k = norm(n)
    for (const key of Object.keys(map)) if (key === k || key.includes(k)) return map[key]
  }
  return null
}

function parseMatrixErrorString(raw) {
  const s = (raw ?? '').toLowerCase().trim()
  const isFuera = s.includes('fuera de') || s.includes('fuera del') || s.includes('out of')
  if ((s.includes('puerta') || s.includes('door')) && (s.includes('prepar') || s.includes('ready'))) return 'puerta_no_preparada'
  if (s.includes('too close') || s.includes('too long') || s.includes('demasiado cerca') || s.includes('demasiado largo')
    || s.includes('demasiado próximo') || s.includes('demasiado proximo') || s.includes('no puede pesar')) return 'too_close_too_long'
  if (s.includes('fotoc') || s.includes('fotocelula') || s.includes('photocell') || s.includes('no leid') || s.includes('not read by')) return 'no_leido_fotocelula'
  if ((isFuera && (s.includes('rango') || s.includes('range') || s.includes('límit') || s.includes('limit')))
    || s.includes('peso por debajo') || s.includes('weight below') || s.includes('below minimum')) return 'fuera_de_limites'
  return 'otro'
}

function classifyRecordToMatrix(record, activeGates, weightRanges) {
  const errorStr = record.error ?? ''
  const parsed = parseMatrixErrorString(errorStr)
  if (parsed === 'no_leido_fotocelula') return 'no_leido_fotocelula'
  if (parsed === 'too_close_too_long') return 'too_close_too_long'
  if (parsed === 'puerta_no_preparada') return 'puerta_no_preparada'
  let g = record.weightPerPieceGrams
  if (!g && record.weightKg && record.pieces > 0) g = (record.weightKg / record.pieces) * 1000
  const explicit = !!errorStr && errorStr.trim().length > 0
  if (!explicit && (g == null || g < 10)) return 'no_leido_fotocelula'
  if (explicit && (g == null || g === 0)) return parsed === 'fuera_de_limites' ? 'fuera_de_limites' : 'otro'
  const m = weightRanges.find((x) => g >= x.minGrams && g < x.maxGrams)
  if (!m) return 'fuera_de_calibre'
  if (activeGates.length > 0) {
    if (!activeGates.some((x) => x.assignedCalibre === m.calibre)) return 'fuera_de_calibre'
    if (record.quality && !activeGates.some((x) => x.assignedCalibre === m.calibre && x.assignedQuality === record.quality)) return 'fuera_de_calidad'
  }
  return 'fuera_de_limites'
}

// ── Acumulador por segmento (turno) ─────────────────────────────────────────

function nuevoSegmento(dateKey, shiftId) {
  return {
    id: `${dateKey}__${shiftId}`,
    dateKey,
    shiftId,
    vistos: new Set(),        // dedupe de filas PP entre archivos solapados
    vistosP0: new Set(),      // dedupe de filas del Excel de Puerta 0
    totalPieces: 0,
    prodPieces: 0,
    pointZeroPieces: 0,
    weightKgProd: 0,
    minutosActivos: new Set(),
    tsMin: null,
    tsMax: null,
    gates: new Map(),
    calibres: new Map(),
    calidades: new Map(),
    horas: new Map(),         // hora → { total, p0 }
    minutos: new Map(),       // tsMin → acumulador de timeline
    p0Records: [],            // input de Puerta 0 (para meta/gate0)
    archivos: new Set(),
  }
}

const truncarMinuto = (ts) => ts.slice(0, 16) + ':00.000Z'

function bucketMinuto(seg, tsMin) {
  let b = seg.minutos.get(tsMin)
  if (!b) {
    b = { pieces: 0, p0Pieces: 0, weightKgSum: 0, weightCount: 0, errorCounts: new Map(), gateCounts: new Map(), calibres: new Map() }
    seg.minutos.set(tsMin, b)
  }
  return b
}

function acumularPP(seg, rec) {
  seg.totalPieces += rec.pieces
  if (!seg.tsMin || rec.ts < seg.tsMin) seg.tsMin = rec.ts
  if (!seg.tsMax || rec.ts > seg.tsMax) seg.tsMax = rec.ts
  seg.minutosActivos.add(rec.ts.slice(0, 16))

  const hora = Number(rec.ts.slice(11, 13))
  const h = seg.horas.get(hora) || { total: 0, p0: 0 }
  h.total += rec.pieces
  if (rec.gate === 0) h.p0 += rec.pieces
  seg.horas.set(hora, h)

  const b = bucketMinuto(seg, truncarMinuto(rec.ts))
  b.pieces += rec.pieces

  if (rec.gate === 0) {
    seg.pointZeroPieces += rec.pieces
    b.p0Pieces += rec.pieces
    return
  }
  seg.prodPieces += rec.pieces
  seg.weightKgProd += rec.weightKg ?? 0
  seg.gates.set(rec.gate, (seg.gates.get(rec.gate) ?? 0) + rec.pieces)
  b.gateCounts.set(rec.gate, (b.gateCounts.get(rec.gate) ?? 0) + rec.pieces)
  if (rec.weightKg) { b.weightKgSum += rec.weightKg; b.weightCount += rec.pieces }
  if (rec.calibre) {
    seg.calibres.set(rec.calibre, (seg.calibres.get(rec.calibre) ?? 0) + rec.pieces)
    b.calibres.set(rec.calibre, (b.calibres.get(rec.calibre) ?? 0) + rec.pieces)
  }
  if (rec.quality) seg.calidades.set(rec.quality, (seg.calidades.get(rec.quality) ?? 0) + rec.pieces)
}

// ── Parseo de un archivo → reparte filas a segmentos ─────────────────────────

function detectarTipo(headers, nombre) {
  const h = headers.map(norm)
  const hasGate = h.some((x) => x === 'gate' || x.includes('compuerta') || x === 'puerta')
  const hasError = h.some((x) => x.includes('error') || x.includes('motivo') || x.includes('causa'))
  if (/puerta\s*0|_p0|punto\s*0/i.test(nombre) && hasError) return 'PUERTA_0'
  if (hasGate) return 'PIEZA_PIEZA'
  if (hasError) return 'PUERTA_0'
  return 'DESCONOCIDO'
}

/**
 * Ventanas [startAt, endAt] de los turnos ya cargados. Cualquier fila cuyo
 * timestamp caiga dentro de una de ellas pertenece a un turno que ya existe,
 * sin importar cómo se llame.
 */
let VENTANAS_EXISTENTES = []
// ── Construcción del summary ────────────────────────────────────────────────

function construirSummary(seg, usuario) {
  const durationMinutes = seg.minutosActivos.size
  const totalWeightKg = seg.weightKgProd > 0 ? r(seg.weightKgProd, 2) : undefined
  const p0 = seg.p0Records.length > 0
    ? seg.p0Records.reduce((s, x) => s + x.pieces, 0)
    : seg.pointZeroPieces

  const causeMap = new Map()
  for (const rec of (seg.p0Records.length > 0 ? seg.p0Records : [])) {
    const k = classifyRecordToMatrix(rec, [], CALIBRE_WEIGHT_RANGES)
    causeMap.set(k, (causeMap.get(k) ?? 0) + rec.pieces)
  }
  const topP0Causes = [...causeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9)
    .map(([error, pieces]) => ({ error, pieces, pct: r((pieces / (p0 || 1)) * 100, 1) }))

  const dist = (m, total) => [...m.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, pieces]) => ({ pieces, pct: r((pieces / (total || 1)) * 100, 1), k }))

  return {
    id: seg.id,
    dateKey: seg.dateKey,
    shiftId: seg.shiftId,
    totalPieces: seg.totalPieces,
    pointZeroPieces: p0,
    pointZeroPct: seg.totalPieces > 0 ? r((p0 / seg.totalPieces) * 100, 2) : 0,
    startAt: seg.tsMin,
    endAt: seg.tsMax,
    durationMinutes,
    ...(totalWeightKg != null && { totalWeightKg }),
    ...(totalWeightKg != null && seg.prodPieces > 0 && { avgWeightGrams: r((totalWeightKg * 1000) / seg.prodPieces, 0) }),
    ...(durationMinutes > 0 && seg.prodPieces > 0 && { productionRatePerHour: r(seg.prodPieces / (durationMinutes / 60), 0) }),
    ...(topP0Causes.length > 0 && { topP0Causes }),
    calibreDistribution: dist(seg.calibres, seg.prodPieces).slice(0, 8).map((x) => ({ calibre: x.k, pieces: x.pieces, pct: x.pct })),
    qualityDistribution: dist(seg.calidades, seg.prodPieces).map((x) => ({ quality: x.k, pieces: x.pieces, pct: x.pct })),
    gateDistribution: [...seg.gates.entries()].sort((a, b) => a[0] - b[0])
      .map(([gate, pieces]) => ({ gate, pieces, pct: r((pieces / (seg.prodPieces || 1)) * 100, 1) })),
    hourlyBuckets: [...seg.horas.entries()].sort((a, b) => a[0] - b[0])
      .map(([hour, v]) => ({ hour, totalPieces: v.total, p0Pieces: v.p0 })),
    sourceFileNames: [...seg.archivos],
    hasPieceData: seg.totalPieces > 0,
    hasGate0Data: seg.p0Records.length > 0,
    gate0RecordsStored: seg.p0Records.length > 0,
    loadedBy: 'load-missing-shifts.js',
    updatedBy: usuario,
    updatedAt: new Date().toISOString(),
  }
}

function construirTimeline(seg) {
  return [...seg.minutos.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([tsMin, b]) => {
    const o = { tsMin, pieces: b.pieces, p0Pieces: b.p0Pieces }
    if (b.weightKgSum > 0) o.weightKg = r(b.weightKgSum, 3)
    if (b.weightCount > 0) o.weightCount = b.weightCount
    if (b.gateCounts.size > 0) { o.gateCounts = {}; for (const [k, v] of b.gateCounts) o.gateCounts[String(k)] = v }
    if (b.errorCounts.size > 0) { o.errorCounts = {}; for (const [k, v] of b.errorCounts) o.errorCounts[k] = v }
    let max = 0
    for (const [k, v] of b.calibres) if (v > max) { max = v; o.dominantCalibre = k }
    return o
  })
}

// ── Lectura de un archivo, filtrando por la ventana pedida ──────────────────

/**
 * Reparte las filas del archivo al segmento, quedándose SOLO con las que caen
 * dentro de [desde, hasta]. A diferencia de load-missing-shifts.js, acá la
 * ventana la fija el operador: es el punto de este script.
 */
function procesarArchivoEnVentana(buf, nombre, seg, desdeMs, hastaMs) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const head = findHeaderRow(rows)
  if (!head) return { tipo: 'SIN_ENCABEZADO', filas: 0 }
  const map = {}
  head.headers.forEach((h, i) => { if (h) map[h] = i })
  const tipo = detectarTipo(head.headers, nombre)
  if (tipo === 'DESCONOCIDO') return { tipo, filas: 0 }

  const iDate = col(map, 'fecha', 'date')
  const iTime = col(map, 'hora', 'time')
  const iPieces = col(map, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iGate = col(map, 'gate', 'compuerta', 'puerta')
  const iWeight = col(map, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightG = col(map, 'peso en gr', 'peso en gramos')
  const iQuality = col(map, 'calidad', 'quality')
  const iCalibre = col(map, 'calibre', 'size', 'tamano')
  const iError = col(map, 'error', 'motivo', 'causa', 'reason')
  const iLot = col(map, 'lote', 'lot')

  let usadas = 0
  for (let i = head.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue
    const ts = parseDatetime(iDate != null ? row[iDate] : undefined, iTime != null ? row[iTime] : undefined)
    if (!ts) continue
    const t = Date.parse(ts)
    if (!(t >= desdeMs && t <= hastaMs)) continue
    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue

    const errRaw = iError != null && row[iError] != null ? String(row[iError]).trim() : ''
    const en = norm(errRaw)
    if (en === 'total' || en.startsWith('total ') || en === 'subtotal') continue

    seg.archivos.add(nombre)

    const weightPerPieceGrams = iWeightG != null ? parseNum(row[iWeightG]) : undefined
    let weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    if (weightKg != null && weightKg > 5000) weightKg = weightKg / 1000
    if (weightKg == null && weightPerPieceGrams != null && weightPerPieceGrams > 0) {
      weightKg = (weightPerPieceGrams * pieces) / 1000
    }
    const quality = iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() : undefined
    const calibre = iCalibre != null && row[iCalibre] != null ? String(row[iCalibre]).trim() : undefined
    const lot = iLot != null && row[iLot] != null ? String(row[iLot]).trim() : undefined

    if (tipo === 'PIEZA_PIEZA') {
      const gate = parseNum(iGate != null ? row[iGate] : undefined) ?? 0
      const k = `${ts}|${gate}|${pieces}|${quality ?? ''}|${calibre ?? ''}|${weightKg ?? ''}|${lot ?? ''}|${errRaw}|${weightPerPieceGrams ?? ''}`
      if (seg.vistos.has(k)) continue
      seg.vistos.add(k)
      acumularPP(seg, { ts, gate, pieces, weightKg, weightPerPieceGrams, quality, calibre, lot })
      usadas++
    } else {
      const k = `${ts}|${pieces}|${errRaw}|${quality ?? ''}|${calibre ?? ''}|${weightKg ?? ''}`
      if (seg.vistosP0.has(k)) continue
      seg.vistosP0.add(k)
      seg.p0Records.push({
        ts, pieces, error: errRaw || 'Desconocido',
        ...(weightKg != null && { weightKg }),
        ...(weightPerPieceGrams != null && { weightPerPieceGrams }),
        ...(quality && { quality }),
        ...(calibre && { calibre }),
        ...(lot && { lot }),
      })
      usadas++
    }
  }
  return { tipo, filas: usadas }
}

// ── Main ────────────────────────────────────────────────────────────────────

;(async () => {
  console.log(CONFIRM ? '⚠️  MODO ESCRITURA (--confirm)\n' : '🔍 DRY RUN — no se escribe nada. Usa --confirm para aplicar.\n')

  const [dateKey, shiftId] = SHIFT_ID.split('__')
  if (!dateKey || !shiftId) { console.error('El --shift debe tener el formato YYYY-MM-DD__Nombre'); process.exit(1) }
  const desdeMs = Date.parse(DESDE)
  const hastaMs = Date.parse(HASTA)
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs) || hastaMs <= desdeMs) {
    console.error('Ventana inválida'); process.exit(1)
  }
  console.log(`turno:   ${SHIFT_ID}`)
  console.log(`ventana: ${new Date(desdeMs).toISOString()} → ${new Date(hastaMs).toISOString()}\n`)

  // Estado actual, para poder comparar
  const ref = db.collection('graderDailySummaries').doc(SHIFT_ID)
  const actual = (await ref.get()).data()
  if (actual) {
    console.log(`estado actual: ${actual.totalPieces} pz · P0 ${actual.pointZeroPieces} · ${actual.startAt} → ${actual.endAt}`)
  } else {
    console.log('estado actual: el turno NO existe (se creará)')
  }

  // Excel de las fechas que toca la ventana (incluye el día siguiente para turnos noche)
  const fechas = new Set()
  for (let t = desdeMs; t <= hastaMs + 86400000; t += 86400000) {
    fechas.add(new Date(t).toISOString().slice(0, 10))
  }
  const ups = await db.collection('graderUploads').where('sessionDate', 'in', [...fechas].slice(0, 10)).get()
  const archivos = [...new Map(ups.docs.map((d) => d.data()).filter((x) => x.fileMeta?.storagePath)
    .map((x) => [x.fileMeta.storagePath, { path: x.fileMeta.storagePath, name: x.fileMeta.name }])).values()]
  console.log(`\narchivos candidatos: ${archivos.length}`)

  const seg = nuevoSegmento(dateKey, shiftId)
  for (const a of archivos) {
    const [buf] = await bucket.file(a.path).download()
    const res = procesarArchivoEnVentana(buf, a.name, seg, desdeMs, hastaMs)
    if (res.filas > 0) console.log(`  ${a.name} → ${res.tipo} · ${res.filas.toLocaleString('es-CL')} filas en ventana`)
  }

  if (seg.totalPieces === 0) { console.log('\n✗ No se encontraron piezas en esa ventana. Nada que hacer.'); process.exit(0) }

  const summary = construirSummary(seg, 'rebuild-shift-from-excel')
  console.log(`\nreconstruido: ${summary.totalPieces} pz · P0 ${summary.pointZeroPieces} (${summary.pointZeroPct}%) · ${summary.startAt} → ${summary.endAt}`)
  console.log(`  causas: ${(summary.topP0Causes ?? []).map((c) => `${c.error} ${c.pieces}`).join(' · ') || '(sin P0)'}`)
  console.log(`  fuentes: ${summary.sourceFileNames.join(', ')}`)

  if (!CONFIRM) { console.log('\n  (dry-run: no se escribió nada — usa --confirm para aplicar)'); process.exit(0) }

  await ref.set(summary, { merge: true })
  // Los chunks de gate0 se reescriben; se borran los sobrantes de una versión previa mayor.
  const chunks = []
  for (let i = 0; i < seg.p0Records.length; i += CHUNK_SIZE) chunks.push(seg.p0Records.slice(i, i + CHUNK_SIZE))
  if (chunks.length === 0) chunks.push([])
  const updatedAt = new Date().toISOString()
  for (let i = 0; i < chunks.length; i++) {
    await ref.collection('meta').doc(i === 0 ? 'gate0' : `gate0__${i}`).set({
      records: chunks[i], chunkIndex: i, totalChunks: chunks.length,
      updatedAt, schemaVersion: GATE0_SCHEMA_VERSION, rebuiltBy: 'rebuild-shift-from-excel.js',
    })
  }
  const viejos = await ref.collection('meta').where('schemaVersion', '==', GATE0_SCHEMA_VERSION).get()
  for (const d of viejos.docs) {
    const c = d.data()
    if (typeof c.chunkIndex === 'number' && c.chunkIndex >= chunks.length) await d.ref.delete()
  }
  const buckets = construirTimeline(seg)
  if (buckets.length > 0) {
    await ref.collection('meta').doc('timeline').set({
      buckets, updatedAt, schemaVersion: TIMELINE_SCHEMA_VERSION,
    })
  }
  console.log(`\n✓ escrito: summary + ${chunks.length} chunk(s) de gate0 + ${buckets.length} buckets de timeline`)
  process.exit(0)
})().catch((e) => { console.error('ERR', e); process.exit(1) })
