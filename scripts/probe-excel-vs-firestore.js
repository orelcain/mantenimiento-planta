/**
 * Probe: parsea un Excel Grader RAW (sin dedupe) y compara contra los
 * pieceRecords de Firestore para un dateKey dado. Reporta:
 *   - Filas Excel raw para ese día
 *   - Filas Firestore (post-dedupe)
 *   - Diferencia (= piezas eliminadas por dedupe)
 *   - Top colisiones por (ts, gate, quality, calibre, weightKg)
 *
 * Uso:
 *   node scripts/probe-excel-vs-firestore.js "C:/.../Pieza pieza ... .xlsx" 2026-02-14
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
const path = require('path')
const xlsx = require('xlsx')

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const xlsxPath = process.argv[2]
const dateKey = process.argv[3]
if (!xlsxPath || !dateKey) {
  console.error('Uso: node scripts/probe-excel-vs-firestore.js <ruta.xlsx> YYYY-MM-DD')
  process.exit(1)
}

function buildDedupeKey(r) {
  return `${r.ts}|${r.gate}|${r.pieces}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}`
}

// Detect header row + parse — réplica simplificada del parser real
function parseExcel(filePath) {
  console.log(`Leyendo ${path.basename(filePath)}...`)
  const wb = xlsx.readFile(filePath, { cellDates: true })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
  console.log(`  total filas crudas: ${rows.length.toLocaleString('es-CL')}`)

  // Buscar header (fila con "Fecha" + "Hora" + "Gate")
  let headerIdx = -1
  let H = {}
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i]
    if (!Array.isArray(r)) continue
    const lower = r.map((c) => (c == null ? '' : String(c).toLowerCase().trim()))
    if (lower.includes('fecha') && lower.includes('hora')) {
      headerIdx = i
      lower.forEach((c, idx) => { if (c) H[c] = idx })
      break
    }
  }
  if (headerIdx < 0) throw new Error('No se encontró header con Fecha+Hora')
  console.log(`  header en fila ${headerIdx} — keys: ${Object.keys(H).join(', ')}`)

  const records = []
  const iFecha = H['fecha']
  const iHora = H['hora']
  const iGate = H['salida'] ?? H['gate'] ?? H['puerta']
  const iPieces = H['piezas'] ?? H['piezas (1)'] ?? null
  const iQuality = H['calidad'] ?? H['quality'] ?? null
  const iCalibre = H['calibre'] ?? null
  const iWeight = H['peso'] ?? H['peso (kg)'] ?? H['peso pez (kg)'] ?? null
  const iError = H['error'] ?? null

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!Array.isArray(row) || row.every((c) => c == null)) continue
    const fecha = row[iFecha]
    const hora = row[iHora]
    if (!fecha || !hora) continue
    let ts
    if (fecha instanceof Date) {
      const f = fecha
      const h = hora instanceof Date ? hora : new Date(`1970-01-01T${String(hora).padStart(8, '0')}Z`)
      ts = new Date(Date.UTC(
        f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(),
        h.getUTCHours(), h.getUTCMinutes(), h.getUTCSeconds(),
      )).toISOString()
    } else {
      const dStr = String(fecha)
      const hStr = String(hora)
      const iso = `${dStr}T${hStr.padStart(8, '0')}.000Z`.replace(/\//g, '-')
      ts = new Date(iso).toISOString()
    }
    const gate = row[iGate] != null ? String(row[iGate]).trim() : null
    const pieces = iPieces != null && row[iPieces] != null ? Number(row[iPieces]) : 1
    const quality = iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() : undefined
    const calibre = iCalibre != null && row[iCalibre] != null ? String(row[iCalibre]).trim() : undefined
    const weightKg = iWeight != null && row[iWeight] != null ? Number(row[iWeight]) : undefined
    if (!ts || isNaN(new Date(ts).getTime())) continue
    if (gate == null) continue
    if (pieces <= 0) continue
    records.push({ ts, gate, pieces, quality, calibre, weightKg, rowIdx: i + 1 })
  }
  console.log(`  records útiles parseados: ${records.length.toLocaleString('es-CL')}`)
  return records
}

async function fetchFirestoreRecords(dateKey) {
  const out = []
  const candidates = [
    `${dateKey}__Turno día`,
    `${dateKey}__Turno noche`,
  ]
  // Yesterday's noche tambien deja piezas en este día (madrugada)
  const [y, m, d] = dateKey.split('-').map(Number)
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  candidates.unshift(`${yesterday}__Turno noche`)
  for (const id of candidates) {
    const ref = db.collection('graderDailySummaries').doc(id)
    const snap = await ref.collection('pieceRecords').get()
    snap.forEach((doc) => {
      const dd = doc.data()
      if (dd && dd.ts && dd.ts.slice(0, 10) === dateKey) {
        out.push({ ts: dd.ts, gate: dd.gate, pieces: dd.pieces ?? 1, quality: dd.quality, calibre: dd.calibre, weightKg: dd.weightKg, summary: id })
      }
    })
  }
  return out
}

async function main() {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  PROBE Excel vs Firestore — ${dateKey}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

  const allExcel = parseExcel(xlsxPath)
  const dayExcel = allExcel.filter((r) => r.ts.slice(0, 10) === dateKey)
  console.log(`\nFilas Excel ∈ ${dateKey} (raw, sin dedupe): ${dayExcel.length.toLocaleString('es-CL')}`)

  // Aplicar dedupe replicado del bulk-upload-piece-records.js
  const seen = new Map()
  let collisions = 0
  for (const r of dayExcel) {
    const key = buildDedupeKey(r)
    if (seen.has(key)) {
      collisions++
      seen.get(key).count++
    } else {
      seen.set(key, { rec: r, count: 1 })
    }
  }
  const afterDedupe = seen.size
  console.log(`Filas Excel post-dedupe (key=ts+gate+pieces+quality+calibre+weightKg): ${afterDedupe.toLocaleString('es-CL')}`)
  console.log(`Colisiones (descartadas): ${collisions.toLocaleString('es-CL')}  (${((collisions / dayExcel.length) * 100).toFixed(2)}%)`)

  console.log(`\nLeyendo Firestore...`)
  const fsRecs = await fetchFirestoreRecords(dateKey)
  console.log(`Filas Firestore ∈ ${dateKey}: ${fsRecs.length.toLocaleString('es-CL')}`)

  const diffExcelRaw = dayExcel.length - fsRecs.length
  const diffExcelDedup = afterDedupe - fsRecs.length
  console.log(`\nDIFERENCIAS:`)
  console.log(`  Excel raw - Firestore  = ${diffExcelRaw.toLocaleString('es-CL')}`)
  console.log(`  Excel dedupe - Firestore = ${diffExcelDedup.toLocaleString('es-CL')}  (≈0 esperado si dedupe es la única causa)`)

  // Top 10 colisiones
  const collisionList = Array.from(seen.values()).filter((v) => v.count > 1).sort((a, b) => b.count - a.count).slice(0, 10)
  if (collisionList.length > 0) {
    console.log(`\nTOP 10 colisiones de dedupe:`)
    for (const { rec, count } of collisionList) {
      console.log(`  ${count}× ${rec.ts}  gate=${rec.gate}  pz=${rec.pieces}  q=${rec.quality ?? ''}  cal=${rec.calibre ?? ''}  pesoKg=${rec.weightKg ?? ''}`)
    }
  }

  // Distribución por hora — colisiones
  const collByHour = new Array(24).fill(0)
  for (const { rec, count } of seen.values()) {
    if (count > 1) {
      const h = new Date(rec.ts).getUTCHours()
      collByHour[h] += (count - 1)
    }
  }
  console.log(`\nColisiones por hora del día:`)
  for (let h = 0; h < 24; h++) {
    if (collByHour[h] > 0) {
      console.log(`  ${String(h).padStart(2, '0')}:00  ${String(collByHour[h]).padStart(4)}  ${'█'.repeat(Math.min(60, Math.round(collByHour[h] / 5)))}`)
    }
  }
  console.log()
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e); process.exit(1) })
