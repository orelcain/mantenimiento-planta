/**
 * Re-clasifica un summary Yal aplicando la lógica nueva de causas P0
 * (parseMatrixErrorString + classifyRecordToMatrix con mappings Yal de v3.9.0).
 *
 * Lee los pieceRecords actuales del summary, agrupa los gate=0 por causa
 * Matrix, y actualiza `byMatrixCause` en el summary doc.
 *
 * Uso:
 *   node scripts/reclassify-yal-summary.js              # dry-run
 *   node scripts/reclassify-yal-summary.js --apply
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const APPLY = process.argv.includes('--apply')

// Mismas reglas que `parseMatrixErrorString` en graderMatrixP0Causes.ts (v3.9.0)
function parseMatrixErrorString(raw) {
  const s = (raw ?? '').toLowerCase().trim()
  const isFuera = s.includes('fuera de') || s.includes('fuera del') || s.includes('out of')
  if ((s.includes('puerta') || s.includes('door')) && (s.includes('prepar') || s.includes('ready'))) return 'puerta_no_preparada'
  if (
    s.includes('too close') || s.includes('too long')
    || s.includes('demasiado cerca') || s.includes('demasiado largo')
    || s.includes('demasiado próximo') || s.includes('demasiado proximo')
    || s.includes('no puede pesar')
  ) return 'too_close_too_long'
  if (s.includes('fotoc') || s.includes('fotocelula') || s.includes('photocell') || s.includes('no leid') || s.includes('not read by')) return 'no_leido_fotocelula'
  if (
    (isFuera && (s.includes('rango') || s.includes('range') || s.includes('límit') || s.includes('limit')))
    || s.includes('peso por debajo') || s.includes('peso bajo el mínimo') || s.includes('peso bajo el minimo')
    || s.includes('weight below') || s.includes('below minimum')
  ) return 'fuera_de_limites'
  return 'otro'
}

function classifyRecord(rec) {
  const errorStr = rec.error || ''
  const parsed = parseMatrixErrorString(errorStr)
  if (parsed === 'no_leido_fotocelula') return 'no_leido_fotocelula'
  if (parsed === 'too_close_too_long') return 'too_close_too_long'
  if (parsed === 'puerta_no_preparada') return 'puerta_no_preparada'

  let perPieceG = rec.weightPerPieceGrams
  if (!perPieceG && rec.weightKg && rec.pieces > 0) perPieceG = (rec.weightKg / rec.pieces) * 1000

  const hasExplicitError = !!errorStr && errorStr.trim().length > 0
  if (!hasExplicitError && (perPieceG == null || perPieceG < 10)) return 'no_leido_fotocelula'
  if (hasExplicitError && (perPieceG == null || perPieceG === 0)) {
    return parsed === 'fuera_de_limites' ? 'fuera_de_limites' : 'otro'
  }
  // Otros casos derivados (calibre/calidad) no se hacen aquí — solo causas oficiales
  return parsed === 'fuera_de_limites' ? 'fuera_de_limites' : 'otro'
}

async function reclassify(summaryId) {
  const ref = db.collection('graderDailySummaries').doc(summaryId)
  const summarySnap = await ref.get()
  if (!summarySnap.exists) return null
  const summary = summarySnap.data()

  // Leer pieceRecords gate=0
  const recsSnap = await ref.collection('pieceRecords').where('gate', '==', 0).get()
  const gate0Records = recsSnap.docs.map(d => d.data())

  // Recalcular byMatrixCause
  const byCause = {
    fuera_de_limites:    { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    no_leido_fotocelula: { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    too_close_too_long:  { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    puerta_no_preparada: { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    fuera_de_calibre:    { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    fuera_de_calidad:    { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    fuera_de_conservacion: { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    fuera_de_producto:   { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
    otro:                { pieces: 0, pct: 0, pctOfPointZero: 0, count: 0, errorBreakdown: {} },
  }

  for (const rec of gate0Records) {
    const cause = classifyRecord(rec)
    byCause[cause].pieces += rec.pieces || 1
    byCause[cause].count += 1
    const errKey = (rec.error || '(sin error)').slice(0, 80)
    byCause[cause].errorBreakdown[errKey] = (byCause[cause].errorBreakdown[errKey] || 0) + (rec.pieces || 1)
  }

  const totalPieces = summary.totalPieces || 0
  const totalP0 = gate0Records.reduce((s, r) => s + (r.pieces || 1), 0)
  for (const c of Object.values(byCause)) {
    c.pct = totalPieces > 0 ? (c.pieces / totalPieces) * 100 : 0
    c.pctOfPointZero = totalP0 > 0 ? (c.pieces / totalP0) * 100 : 0
  }

  return { summary, oldByCause: summary.byMatrixCause, newByCause: byCause, totalP0 }
}

async function main() {
  console.log(`[reclassify-yal] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)
  const snap = await db.collection('graderDailySummaries').get()
  const yalIds = snap.docs.filter(d => d.id.startsWith('yal-eviscerado__')).map(d => d.id)

  for (const id of yalIds) {
    const r = await reclassify(id)
    if (!r) continue
    console.log(`\n=== ${id} (totalP0=${r.totalP0}) ===`)
    const causes = Object.keys(r.newByCause).filter(c => r.newByCause[c].pieces > 0)
    console.log('Causas con piezas (después del fix):')
    for (const c of causes) {
      const v = r.newByCause[c]
      console.log(`  ${c.padEnd(22)} ${v.pieces}pz (${v.pct.toFixed(2)}% / ${v.pctOfPointZero.toFixed(1)}% del P0)`)
    }
    if (r.oldByCause) {
      const oldCauses = Object.keys(r.oldByCause).filter(c => r.oldByCause[c]?.pieces > 0)
      console.log('Causas antes:')
      for (const c of oldCauses) {
        const v = r.oldByCause[c]
        console.log(`  ${c.padEnd(22)} ${v.pieces}pz`)
      }
    }
    if (APPLY) {
      const ref = db.collection('graderDailySummaries').doc(id)
      // Reconstruir topP0Causes — el TurnoPage lo usa (no byMatrixCause).
      // Schema esperado: array de { error: <causa canónica>, pieces, pct }
      // ordenado desc por pieces. Solo causas con piezas > 0.
      const topP0Causes = Object.entries(r.newByCause)
        .filter(([, v]) => v.pieces > 0)
        .map(([cause, v]) => ({ error: cause, pieces: v.pieces, pct: +v.pctOfPointZero.toFixed(2) }))
        .sort((a, b) => b.pieces - a.pieces)
      await ref.update({
        byMatrixCause: r.newByCause,
        topP0Causes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      console.log(`  → actualizado · topP0Causes:`, topP0Causes.map(c => `${c.error}=${c.pieces}`).join(', '))
    }
  }
  if (!APPLY) console.log(`\n→ Aplicar: node scripts/reclassify-yal-summary.js --apply\n`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
