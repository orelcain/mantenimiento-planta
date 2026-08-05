/**
 * backfill-gate0-input.js
 *
 * Restituye el input de Puerta 0 (`meta/gate0`) de los turnos guardados ANTES de
 * que la app lo persistiera, para que su desglose de causas P0 pueda recalcularse
 * solo al cambiar las gates — igual que los turnos nuevos.
 *
 * Contexto: el Excel de Puerta 0 es el único que trae la columna Error (fotocélula,
 * too close, puerta no preparada). Hasta agosto 2026 ese archivo se parseaba, se
 * usaba para clasificar y se descartaba: a Firestore solo iban los pieceRecords del
 * pieza-a-pieza, que no la tienen. Sin ese input, reclasificar desde la base
 * convierte las causas oficiales del Marelec en "fuera de límites" — pérdida de
 * datos, no imprecisión. Ver apps/pwa/src/services/grader/graderGate0Store.ts.
 *
 * De dónde salen los Excel: Firebase Storage, indexados en la colección
 * `graderUploads` (fileMeta.kind = PIEZA_PIEZA | PUERTA_0). NO están en OneDrive.
 *
 * ⚠️ El shiftId del upload NO coincide con el del summary — el mismo turno figura
 * como "Turno noche" en uno y "Turno 2" en el otro, y hay "Turno 1 Lunes" contra
 * "Turno 1". Emparejar por nombre cruzaría turnos en silencio. Este script empareja
 * por VENTANA HORARIA y sólo escribe cuando la suma de piezas del candidato coincide
 * EXACTA con `pointZeroPieces` del summary. Si no cuadra, reporta y no toca nada.
 *
 * Uso:
 *   node scripts/backfill-gate0-input.js                  # dry-run (default)
 *   node scripts/backfill-gate0-input.js --confirm        # escribe
 *   node scripts/backfill-gate0-input.js --shift <id>     # un solo turno
 *   node scripts/backfill-gate0-input.js --all            # incluye los ya backfilleados
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
const bucket = admin.storage().bucket()

const CONFIRM = process.argv.includes('--confirm')
const ALL = process.argv.includes('--all')
const ONLY = (() => {
  const i = process.argv.indexOf('--shift')
  return i >= 0 ? process.argv[i + 1] : null
})()
/** % mínimo de piezas que deben recuperar su causa oficial para escribir el turno. */
const MIN_COBERTURA = (() => {
  const i = process.argv.indexOf('--min-cobertura')
  return i >= 0 ? Number(process.argv[i + 1]) : 95
})()

/** Debe coincidir con GATE0_SCHEMA_VERSION y CHUNK_SIZE de graderGate0Store.ts */
const SCHEMA_VERSION = 1
const CHUNK_SIZE = 2000
// ── Helpers de parseo (mismos que upload-historical-excels-to-storage.js) ────

const norm = (s) => s == null ? '' : String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function parseNum(v) {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const s = String(v).trim().replace(/\s/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
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
    const hasFecha = cells.some((c) => c === 'fecha' || c === 'date')
    const hasPiezas = cells.some((c) => c.includes('pieza') || c.includes('cantidad') || c === 'qty')
    if (hasFecha && hasPiezas) return { rowIndex: i, headers: row.map(norm) }
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

/** Parsea un Excel de Puerta 0 → registros con la forma de StoredGate0Record. */
function parseP0Buffer(buf) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const head = findHeaderRow(rows)
  if (!head) return []
  const map = {}
  head.headers.forEach((h, i) => { if (h) map[h] = i })

  const iError = col(map, 'error', 'motivo', 'causa', 'reason')
  const iPieces = col(map, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeight = col(map, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightG = col(map, 'peso en gr', 'peso en gramos')
  const iDate = col(map, 'fecha', 'date')
  const iTime = col(map, 'hora', 'time')
  const iQuality = col(map, 'calidad', 'quality')
  const iCalibre = col(map, 'calibre', 'size', 'tamano')

  const out = []
  for (let r = head.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    const ts = parseDatetime(iDate != null ? row[iDate] : undefined, iTime != null ? row[iTime] : undefined)
    if (!ts) continue
    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue
    const rawErr = iError != null && row[iError] != null ? String(row[iError]).trim() : ''
    const en = norm(rawErr)
    // Las filas de totales del Excel no son piezas.
    if (en === 'total' || en.startsWith('total ') || en === 'subtotal' || en.startsWith('subtotal ')) continue

    const weightPerPieceGrams = iWeightG != null ? parseNum(row[iWeightG]) : undefined
    let weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    if (weightKg != null && weightKg > 5000) weightKg = weightKg / 1000
    if (weightKg == null && weightPerPieceGrams != null && weightPerPieceGrams > 0) {
      weightKg = (weightPerPieceGrams * pieces) / 1000
    }
    const quality = iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() : undefined
    const calibre = iCalibre != null && row[iCalibre] != null ? String(row[iCalibre]).trim() : undefined

    out.push({
      ts,
      pieces,
      error: rawErr || 'Desconocido',
      ...(weightKg != null && { weightKg }),
      ...(weightPerPieceGrams != null && { weightPerPieceGrams }),
      ...(quality && { quality }),
      ...(calibre && { calibre }),
    })
  }
  return out
}

/**
 * Clave de emparejamiento entre una fila del Excel y un pieceRecord gate 0 ya
 * guardado. Deliberadamente NO incluye:
 *   - `error`, que es justamente el campo que venimos a recuperar;
 *   - `calibre`, porque el Excel de Puerta 0 lo exporta VACÍO mientras que el
 *     registro guardado sí lo trae (incluirlo daba 0% de emparejamiento).
 * `weightKg` se redondea porque viaja como float.
 */
const matchKey = (r) => [
  r.ts,
  r.pieces,
  r.weightKg != null ? Number(r.weightKg).toFixed(2) : '',
  String(r.quality ?? '').trim().toUpperCase(),
].join('|')

const sumPieces = (rs) => rs.reduce((s, r) => s + r.pieces, 0)

// ── Descarga con cache (un mismo Excel sirve a varios turnos del día) ────────

const cache = new Map()
async function fetchP0(storagePath) {
  if (cache.has(storagePath)) return cache.get(storagePath)
  const file = bucket.file(storagePath)
  const [exists] = await file.exists()
  if (!exists) { cache.set(storagePath, null); return null }
  const [buf] = await file.download()
  const recs = parseP0Buffer(buf)
  cache.set(storagePath, recs)
  return recs
}

// ── Escritura (misma forma que saveGate0Records en graderGate0Store.ts) ──────

async function writeGate0(summaryId, records) {
  const chunks = []
  for (let i = 0; i < records.length; i += CHUNK_SIZE) chunks.push(records.slice(i, i + CHUNK_SIZE))
  if (chunks.length === 0) chunks.push([])
  const updatedAt = new Date().toISOString()
  for (let i = 0; i < chunks.length; i++) {
    const id = i === 0 ? 'gate0' : `gate0__${i}`
    await db.collection('graderDailySummaries').doc(summaryId).collection('meta').doc(id).set({
      records: chunks[i],
      chunkIndex: i,
      totalChunks: chunks.length,
      updatedAt,
      schemaVersion: SCHEMA_VERSION,
      backfilledBy: 'backfill-gate0-input.js',
    })
  }
  await db.collection('graderDailySummaries').doc(summaryId).update({
    gate0RecordsStored: true,
    updatedAt,
  })
  return chunks.length
}

// ── Main ────────────────────────────────────────────────────────────────────

;(async () => {
  console.log(CONFIRM ? '⚠️  MODO ESCRITURA (--confirm)\n' : '🔍 DRY RUN — no se escribe nada. Usa --confirm para aplicar.\n')

  // 1) Índice de Excel P0 por fecha
  const ups = await db.collection('graderUploads').where('fileMeta.kind', '==', 'PUERTA_0').get()
  const p0PorFecha = new Map()
  for (const d of ups.docs) {
    const x = d.data()
    const date = x.sessionDate || (x.inferred?.startAt || '').slice(0, 10)
    if (!date || !x.fileMeta?.storagePath) continue
    if (!p0PorFecha.has(date)) p0PorFecha.set(date, [])
    p0PorFecha.get(date).push({
      id: d.id,
      shiftId: x.shiftId,
      path: x.fileMeta.storagePath,
      name: x.fileMeta.name,
      startAt: x.inferred?.startAt,
      endAt: x.inferred?.endAt,
    })
  }
  console.log(`Excel de Puerta 0 indexados: ${ups.size} en ${p0PorFecha.size} fechas\n`)

  // 2) Turnos a procesar
  const sums = await db.collection('graderDailySummaries').get()
  let objetivo = sums.docs.filter((d) => ALL || !d.data().gate0RecordsStored)
  if (ONLY) objetivo = objetivo.filter((d) => d.id === ONLY)
  objetivo.sort((a, b) => a.id.localeCompare(b.id))
  console.log(`Turnos a procesar: ${objetivo.length}\n`)

  const stats = { ok: 0, mismatch: 0, sinArchivo: 0, sinP0: 0, escritos: 0 }
  const pendientes = []

  for (const doc of objetivo) {
    const s = doc.data()
    const etiqueta = doc.id.padEnd(34)
    const esperado = s.pointZeroPieces ?? 0

    if (esperado === 0) {
      console.log(`— ${etiqueta} sin piezas en puerta 0, nada que restituir`)
      stats.sinP0++
      continue
    }

    // Candidatos: archivos de la fecha del turno y de la anterior (turnos noche).
    const prev = new Date(new Date(s.dateKey).getTime() - 86400000).toISOString().slice(0, 10)
    const cands = [...(p0PorFecha.get(s.dateKey) || []), ...(p0PorFecha.get(prev) || [])]
    if (cands.length === 0) {
      console.log(`✗ ${etiqueta} sin Excel de Puerta 0 para ${s.dateKey}`)
      stats.sinArchivo++
      continue
    }

    // El turno YA tiene sus registros de puerta 0 guardados (pieceRecords con
    // gate 0): ts, piezas, peso, calidad, calibre. Lo único que les falta es el
    // `error`. Así que no hay que "elegir" qué filas del Excel son de este turno
    // — hay que EMPAREJARLAS una a una con los registros que ya existen. El
    // resultado es exacto por construcción: mismo conteo, mismas piezas.
    const prSnap = await db.collection('graderDailySummaries').doc(doc.id)
      .collection('pieceRecords').where('gate', '==', 0).get()
    const guardados = prSnap.docs.map((d) => d.data())
    if (guardados.length === 0) {
      console.log(`✗ ${etiqueta} sin pieceRecords de puerta 0 guardados — nada que emparejar`)
      stats.sinArchivo++
      continue
    }

    // Pool de filas del Excel, indexado por clave de emparejamiento. Se conservan
    // las repeticiones: dos piezas idénticas del mismo segundo son dos piezas.
    const pool = new Map()
    const fuentes = []
    for (const c of cands) {
      // Hay uploads mal indexados en graderUploads: archivos de pieza-a-pieza
      // marcados como PUERTA_0 (y con sessionDate de otra fecha). Se delatan por
      // el nombre; tomarlos como fuente contamina el emparejamiento.
      if (/pieza\s*a\s*pieza/i.test(c.name || '')) continue
      const recs = await fetchP0(c.path)
      if (!recs || recs.length === 0) continue
      fuentes.push(c.name)
      for (const r of recs) {
        const k = matchKey(r)
        if (!pool.has(k)) pool.set(k, [])
        pool.get(k).push(r)
      }
    }

    // TODOS los registros del turno se restituyen — los que no encuentran su fila
    // en el Excel quedan con `error` vacío, que es exactamente el estado actual
    // (la app los clasifica por peso). Así el conteo cuadra siempre y lo que se
    // gana es la causa OFICIAL del Marelec para las piezas que sí emparejaron.
    // Rellenar es estrictamente mejor que descartar el turno entero.
    const restituidos = []
    let conCausa = 0
    for (const g of guardados) {
      const k = matchKey(g)
      const cola = pool.get(k)
      const hit = cola && cola.length > 0 ? cola.shift() : null
      if (hit) conCausa++
      restituidos.push({
        ts: g.ts,
        pieces: g.pieces,
        error: hit ? hit.error : '',
        ...(g.weightKg != null && { weightKg: g.weightKg }),
        ...(hit?.weightPerPieceGrams != null && { weightPerPieceGrams: hit.weightPerPieceGrams }),
        ...(g.quality && { quality: g.quality }),
        ...(g.calibre && { calibre: g.calibre }),
        ...(g.lot && { lot: g.lot }),
      })
    }

    const cobertura = guardados.length > 0 ? (conCausa / guardados.length) * 100 : 0
    const piezasTotal = sumPieces(restituidos)

    // Invariante dura: el input restituido tiene que sumar EXACTAMENTE las piezas
    // de puerta 0 del turno. Si no, algo se perdió y no se escribe.
    if (piezasTotal !== esperado) {
      const detalle = `piezas ${piezasTotal}/${esperado} — el input no reproduce el conteo del turno`
      console.log(`✗ ${etiqueta} ${detalle}`)
      stats.mismatch++
      pendientes.push({ id: doc.id, esperado, detalle })
      continue
    }

    if (cobertura < MIN_COBERTURA) {
      const detalle = `sólo ${cobertura.toFixed(1)}% con causa oficial (mínimo ${MIN_COBERTURA}%) · fuentes: ${fuentes.join(', ') || '(ninguna)'}`
      console.log(`✗ ${etiqueta} ${detalle}`)
      stats.mismatch++
      pendientes.push({ id: doc.id, esperado, detalle })
      continue
    }

    // Verificación independiente: las causas OFICIALES del Marelec que trae el
    // input restituido deberían coincidir con las que el turno ya tenía
    // calculadas. Si coinciden, el emparejamiento es correcto — no es fe, es
    // contraste contra un dato que ya estaba en la base.
    const oficiales = { no_leido_fotocelula: /fotoc|no leid|photocell/i, puerta_no_preparada: /puerta.*(prepar|ready)|door.*(ready|prepar)/i }
    const contraste = []
    for (const [clave, rx] of Object.entries(oficiales)) {
      const mio = restituidos.filter((r) => rx.test(r.error)).reduce((a, r) => a + r.pieces, 0)
      const suyo = (s.topP0Causes ?? []).find((c) => c.error === clave)?.pieces ?? 0
      if (mio === 0 && suyo === 0) continue
      // suyo === 0 no es discrepancia: el turno se generó sin la columna Error y
      // nunca tuvo esta causa. Recuperarla es justamente el objetivo.
      if (suyo === 0) contraste.push(`${clave}: +${mio} recuperadas (el turno no las tenía)`)
      else contraste.push(`${clave}: ${mio} vs ${suyo} guardadas${mio === suyo ? ' ✓ reproduce' : ' ⚠ DIFIERE'}`)
    }

    const causas = new Map()
    for (const r of restituidos) causas.set(r.error || '(sin causa en el Excel)', (causas.get(r.error || '(sin causa en el Excel)') ?? 0) + r.pieces)
    const resumen = [...causas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([e, n]) => `${e} ×${n}`).join(' · ')
    console.log(`✓ ${etiqueta} ${String(esperado).padStart(5)} pz · ${cobertura.toFixed(1)}% con causa · ${resumen}`)
    if (contraste.length > 0) console.log(`   contraste: ${contraste.join(' · ')}`)
    stats.ok++

    if (CONFIRM) {
      const chunks = await writeGate0(doc.id, restituidos)
      stats.escritos++
      console.log(`   → escrito en meta/gate0 (${chunks} chunk${chunks > 1 ? 's' : ''})`)
    }
  }

  console.log('\n── Resumen ──────────────────────────────────')
  console.log(`  restituibles (cuadran exacto): ${stats.ok}`)
  console.log(`  no cuadran:                    ${stats.mismatch}`)
  console.log(`  sin Excel / sin ventana:       ${stats.sinArchivo}`)
  console.log(`  sin piezas en puerta 0:        ${stats.sinP0}`)
  if (CONFIRM) console.log(`  ESCRITOS:                      ${stats.escritos}`)
  else console.log('\n  (dry-run: no se escribió nada — usa --confirm para aplicar)')

  if (pendientes.length > 0) {
    console.log('\n  Turnos que quedan sin restituir:')
    for (const p of pendientes) console.log(`    ${p.id} — esperado ${p.esperado} · ${p.detalle}`)
  }
  process.exit(0)
})().catch((e) => { console.error('ERR', e); process.exit(1) })
