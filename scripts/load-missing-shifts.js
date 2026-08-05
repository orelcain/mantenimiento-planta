/**
 * load-missing-shifts.js
 *
 * Carga a `graderDailySummaries` los turnos de la temporada que tienen Excel en
 * Storage pero nunca entraron a la app (~218 fechas, jun-2025 → may-2026).
 *
 * MODO AGREGADO (decisión explícita): escribe por turno el resumen, el input de
 * Puerta 0 y los agregados por minuto — NO los millones de registros pieza a
 * pieza. Son ~3 docs por turno en vez de ~12.000. Alimenta calendario, KPIs
 * mensuales, tendencias, Power BI y el desglose de causas P0; lo único que no
 * habilita es el drill-down pieza a pieza de esos turnos (que hoy tampoco existe).
 *
 * ⚠️ NUNCA borra ni pisa un turno existente. Los turnos ya cargados se saltan.
 *
 * Segmentación: por el TIMESTAMP de cada fila, no por la fecha del archivo — hay
 * archivos que cubren rangos largos (el del 30-jun-2025 tiene 68.346 filas de
 * varios meses). Turnos día/noche (07:00–19:00), que es la nomenclatura real de
 * esa temporada: Shoplogix no tiene turnos antes de feb-2026 y los propios
 * archivos se llaman "turno_dia"/"turno_noche".
 *
 * Yal se excluye: es otra línea (`yal-eviscerado__`) y sus turnos no se cortan
 * con esta regla.
 *
 * Uso:
 *   node --max-old-space-size=6144 scripts/load-missing-shifts.js
 *   node --max-old-space-size=6144 scripts/load-missing-shifts.js --confirm
 *   node --max-old-space-size=6144 scripts/load-missing-shifts.js --mes 2025-08
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

const CONFIRM = process.argv.includes('--confirm')
const MES = (() => { const i = process.argv.indexOf('--mes'); return i >= 0 ? process.argv[i + 1] : null })()
const LIMITE = (() => { const i = process.argv.indexOf('--limite'); return i >= 0 ? Number(process.argv[i + 1]) : Infinity })()

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

// ── Helpers de parseo (mismos que upload-historical-excels-to-storage.js) ────

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

/** assignShiftAndDate de iter18: turnos día/noche de la temporada 2025-2026. */
function assignShiftAndDate(ts) {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return null
  const min = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (min >= 420 && min < 1140) return { shiftId: 'Turno día', sessionDate: ts.slice(0, 10) }
  if (min >= 1140) return { shiftId: 'Turno noche', sessionDate: ts.slice(0, 10) }
  const prev = new Date(d)
  prev.setUTCDate(prev.getUTCDate() - 1)
  return { shiftId: 'Turno noche', sessionDate: prev.toISOString().slice(0, 10) }
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
function dentroDeTurnoExistente(ts) {
  const t = Date.parse(ts)
  for (const v of VENTANAS_EXISTENTES) if (t >= v.desde && t <= v.hasta) return true
  return false
}

/**
 * Fechas que ya tienen algún turno cargado. Se excluyen enteras: ahí conviven las
 * dos convenciones de turno (Turno 1/2 de Shoplogix vs día/noche de esta regla) y
 * mezclarlas produce turnos solapados o piezas contadas dos veces. Esas fechas se
 * resuelven aparte, re-subiendo sus Excel desde el wizard.
 */
let FECHAS_CON_TURNOS = new Set()

function procesarArchivo(buf, nombre, segmentos, existentes) {
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
    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue

    const errRaw = iError != null && row[iError] != null ? String(row[iError]).trim() : ''
    const en = norm(errRaw)
    if (en === 'total' || en.startsWith('total ') || en === 'subtotal') continue

    const asign = assignShiftAndDate(ts)
    if (!asign) continue
    const id = `${asign.sessionDate}__${asign.shiftId}`
    // ⚠️ NO basta comparar el id: el mismo turno físico se llama distinto en cada
    // convención ("2026-02-16__Turno 1" ya cargado vs "2026-02-16__Turno noche"
    // que produciría esta regla). Comparar por nombre duplicaría los turnos
    // existentes y doblaría las piezas en KPIs, calendario y Power BI. Lo que
    // identifica un turno es CUÁNDO ocurrió: si el timestamp cae dentro de la
    // ventana de un turno ya cargado, la fila es de ese turno y se descarta.
    if (existentes.has(id) || FECHAS_CON_TURNOS.has(asign.sessionDate) || dentroDeTurnoExistente(ts)) continue

    let seg = segmentos.get(id)
    if (!seg) { seg = nuevoSegmento(asign.sessionDate, asign.shiftId); segmentos.set(id, seg) }
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
      // Misma clave que buildDedupeKey del PWA
      const k = `${ts}|${gate}|${pieces}|${quality ?? ''}|${calibre ?? ''}|${weightKg ?? ''}|${lot ?? ''}|${errRaw}|${weightPerPieceGrams ?? ''}`
      if (seg.vistos.has(k)) continue
      seg.vistos.add(k)
      acumularPP(seg, { ts, gate, pieces, weightKg, weightPerPieceGrams, quality, calibre, lot })
      usadas++
    } else {
      // Misma clave que dedupeGate0Records del PWA
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

// ── Escritura ───────────────────────────────────────────────────────────────

async function escribirSegmento(seg, summary) {
  const ref = db.collection('graderDailySummaries').doc(seg.id)
  await ref.set(summary, { merge: true })

  if (seg.p0Records.length > 0) {
    const chunks = []
    for (let i = 0; i < seg.p0Records.length; i += CHUNK_SIZE) chunks.push(seg.p0Records.slice(i, i + CHUNK_SIZE))
    const updatedAt = new Date().toISOString()
    for (let i = 0; i < chunks.length; i++) {
      await ref.collection('meta').doc(i === 0 ? 'gate0' : `gate0__${i}`).set({
        records: chunks[i], chunkIndex: i, totalChunks: chunks.length,
        updatedAt, schemaVersion: GATE0_SCHEMA_VERSION, loadedBy: 'load-missing-shifts.js',
      })
    }
  }

  const buckets = construirTimeline(seg)
  if (buckets.length > 0) {
    await ref.collection('meta').doc('timeline').set({
      buckets, updatedAt: new Date().toISOString(), schemaVersion: TIMELINE_SCHEMA_VERSION,
    })
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

;(async () => {
  console.log(CONFIRM ? '⚠️  MODO ESCRITURA (--confirm)\n' : '🔍 DRY RUN — no se escribe nada. Usa --confirm para aplicar.\n')

  const sums = await db.collection('graderDailySummaries').get()
  const existentes = new Set(sums.docs.map((d) => d.id))
  VENTANAS_EXISTENTES = sums.docs
    .map((d) => d.data())
    .filter((s) => s.startAt && s.endAt)
    .map((s) => ({ id: s.id, desde: Date.parse(s.startAt), hasta: Date.parse(s.endAt) }))
    .filter((v) => Number.isFinite(v.desde) && Number.isFinite(v.hasta))
  FECHAS_CON_TURNOS = new Set(sums.docs.map((d) => d.data().dateKey).filter(Boolean))
  console.log(`turnos ya cargados (intocables): ${existentes.size} · con ventana horaria: ${VENTANAS_EXISTENTES.length}`)
  console.log(`fechas excluidas por tener turnos ya cargados: ${FECHAS_CON_TURNOS.size}`)

  const ups = await db.collection('graderUploads').get()
  const archivos = ups.docs.map((d) => d.data())
    .filter((x) => x.fileMeta?.storagePath)
    // Yal es otra línea (prefijo yal-eviscerado__) y no se corta con esta regla.
    .filter((x) => !/yal/i.test(x.fileMeta.name || ''))
    .map((x) => ({ path: x.fileMeta.storagePath, name: x.fileMeta.name, size: x.fileMeta.sizeBytes ?? 0 }))
  // Un mismo archivo puede estar indexado más de una vez.
  const unicos = [...new Map(archivos.map((a) => [a.path, a])).values()]
  console.log(`archivos a procesar: ${unicos.length} · ${(unicos.reduce((s, a) => s + a.size, 0) / 1024 / 1024).toFixed(0)} MB\n`)

  const segmentos = new Map()
  let procesados = 0
  for (const a of unicos) {
    try {
      const [buf] = await bucket.file(a.path).download()
      const res = procesarArchivo(buf, a.name, segmentos, existentes)
      procesados++
      if (procesados % 25 === 0 || procesados === unicos.length) {
        const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)
        console.log(`  ${procesados}/${unicos.length} archivos · ${segmentos.size} turnos nuevos · ${mem} MB en memoria`)
      }
    } catch (e) {
      console.log(`  ✗ ${a.name}: ${e.message}`)
    }
  }

  let candidatos = [...segmentos.values()].sort((a, b) => a.id.localeCompare(b.id))
  if (MES) candidatos = candidatos.filter((s) => s.dateKey.startsWith(MES))
  candidatos = candidatos.filter((s) => s.totalPieces > 0).slice(0, LIMITE)

  console.log(`\n=== turnos nuevos a crear: ${candidatos.length} ===`)
  let escritos = 0, piezas = 0, p0 = 0
  for (const seg of candidatos) {
    const summary = construirSummary(seg, 'load-missing-shifts')
    piezas += summary.totalPieces
    p0 += summary.pointZeroPieces
    const causa = (summary.topP0Causes ?? []).slice(0, 2).map((c) => `${c.error} ${c.pieces}`).join(' · ') || 'sin P0'
    console.log(`  ${seg.id.padEnd(28)} ${String(summary.totalPieces).padStart(7)} pz · P0 ${String(summary.pointZeroPieces).padStart(5)} (${summary.pointZeroPct}%) · ${causa}`)
    if (CONFIRM) { await escribirSegmento(seg, summary); escritos++ }
  }

  console.log('\n── Resumen ──────────────────────────────────')
  console.log(`  turnos nuevos:  ${candidatos.length}`)
  console.log(`  piezas:         ${piezas.toLocaleString('es-CL')}`)
  console.log(`  piezas en P0:   ${p0.toLocaleString('es-CL')} (${piezas > 0 ? ((p0 / piezas) * 100).toFixed(2) : 0}%)`)
  if (CONFIRM) console.log(`  ESCRITOS:       ${escritos}`)
  else console.log('\n  (dry-run: no se escribió nada — usa --confirm para aplicar)')
  process.exit(0)
})().catch((e) => { console.error('ERR', e); process.exit(1) })
