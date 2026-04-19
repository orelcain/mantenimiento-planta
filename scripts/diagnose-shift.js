/**
 * Diagnóstico de un turno: compara Firestore vs Excel local.
 *
 * Uso:
 *   node scripts/diagnose-shift.js 2026-02-22__"Turno noche"
 */

const admin = require('firebase-admin')
const XLSX  = require('xlsx')
const fs    = require('fs')
const path  = require('path')
const sa    = require('../serviceAccountKey.json')

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const SHIFT_ID = process.argv[2] || '2026-02-22__Turno noche'
const BASE_DIR = 'C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026'
const PP_DIR   = path.join(BASE_DIR, 'pieza a pieza')
const P0_DIR   = path.join(BASE_DIR, 'punto 0')

const norm = (v) => v == null ? '' : String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i]; if (!row) continue
    const cells = row.map(norm).filter(Boolean)
    if (cells.length < 3) continue
    if (cells.some(c => c === 'fecha' || c === 'date') && cells.some(c => c.includes('pieza') || c.includes('cantidad'))) {
      return { rowIndex: i, headers: row.map(norm) }
    }
  }
  return null
}

function buildColMap(headers) { const m = {}; headers.forEach((h, i) => { if (h) m[h] = i }); return m }
function col(map, ...names) {
  for (const n of names) { const k = norm(n)
    for (const key of Object.keys(map)) if (key === k || key.includes(k)) return map[key] }
  return null
}
function parseDatetime(d, t) {
  let ds = '', ts = ''
  if (typeof d === 'number') ds = new Date((Math.floor(d-25569))*86400000).toISOString().slice(0,10)
  else if (d) { const m = String(d).match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/); if (m) ds=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; else if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) ds=String(d).slice(0,10) }
  if (typeof t === 'number') { const s=Math.round(t*86400); ts=`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` }
  else if (t) { const m = String(t).match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/); if (m) ts=`${m[1].padStart(2,'0')}:${m[2].padStart(2,'0')}:${(m[3]||'00').padStart(2,'0')}` }
  if (!ds) return null
  return `${ds}T${ts || '00:00:00'}.000Z`
}
function parseNum(v) { if (v==null) return undefined; const n=typeof v==='number'?v:parseFloat(String(v).replace(',','.')); return isNaN(n)?undefined:n }
function assignShift(ts) {
  const d = new Date(ts); const m = d.getUTCHours()*60 + d.getUTCMinutes()
  if (m >= 420 && m < 1140) return { shiftId: 'Turno día',   dateKey: ts.slice(0,10) }
  if (m >= 1140)             return { shiftId: 'Turno noche', dateKey: ts.slice(0,10) }
  const prev = new Date(d); prev.setUTCDate(prev.getUTCDate()-1)
  return { shiftId: 'Turno noche', dateKey: prev.toISOString().slice(0,10) }
}

function parseXlsx(filePath) {
  const buf = fs.readFileSync(filePath)
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const info = findHeaderRow(rows); if (!info) return { kind:'UNKNOWN', records:[] }
  const colMap = buildColMap(info.headers)
  const fname = path.basename(filePath).toLowerCase()
  const hasGate = info.headers.some(h => h && (h === 'gate' || h.includes('compuerta')))
  const hasError = info.headers.some(h => h && (h === 'error' || h === 'motivo' || h === 'causa'))
  const isP0 = fname.includes('puerta 0') || fname.includes('punto cero') || (!hasGate && hasError)
  const kind = isP0 ? 'PUERTA_0' : 'PIEZA_PIEZA'
  const iDate=col(colMap,'fecha','date'), iTime=col(colMap,'hora','time')
  const iPieces=col(colMap,'cantidad de piezas','cant. piezas','piezas','qty','cantidad')
  const iGate=col(colMap,'gate','compuerta','puerta')
  const iWeight=col(colMap,'peso de las piezas','peso piezas','weight')
  const iWeightG=col(colMap,'peso en gr','peso en gramos')
  const iQuality=col(colMap,'calidad','quality'), iCalibre=col(colMap,'calibre','size')
  const records = []
  for (let r = info.rowIndex+1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue
    const ts = parseDatetime(iDate!=null?row[iDate]:null, iTime!=null?row[iTime]:null); if (!ts) continue
    const pieces = parseNum(iPieces!=null?row[iPieces]:null); if (!pieces || pieces<=0) continue
    const gate = kind==='PIEZA_PIEZA' ? Math.round(parseNum(iGate!=null?row[iGate]:null) ?? 0) : 0
    records.push({ ts, gate, pieces,
      weightKg: iWeight!=null?parseNum(row[iWeight]):undefined,
      weightPerPieceGrams: iWeightG!=null?parseNum(row[iWeightG]):undefined,
      quality: iQuality!=null && row[iQuality]!=null ? String(row[iQuality]).trim() : undefined,
      calibre: iCalibre!=null && row[iCalibre]!=null ? String(row[iCalibre]).trim() : undefined,
    })
  }
  return { kind, records, file: path.basename(filePath) }
}

function walkXlsx(dir) {
  const files = []; if (!fs.existsSync(dir)) return files
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n)
    if (fs.statSync(f).isDirectory()) files.push(...walkXlsx(f))
    else if (n.endsWith('.xlsx') && !n.startsWith('~$')) files.push(f)
  }
  return files
}

async function main() {
  console.log(`\n🔍 DIAGNÓSTICO TURNO: ${SHIFT_ID}\n${'='.repeat(60)}\n`)

  // 1) Firestore
  console.log('🔗 FIRESTORE — graderDailySummaries doc:')
  const docSnap = await db.collection('graderDailySummaries').doc(SHIFT_ID).get()
  if (!docSnap.exists) { console.log('   ❌ No existe el documento'); return }
  const d = docSnap.data()
  console.log(`   totalPieces: ${d.totalPieces ?? 'N/A'}`)
  console.log(`   totalP0:     ${d.totalP0 ?? 'N/A'}`)
  console.log(`   p0Pct:       ${d.p0Pct ?? 'N/A'}`)
  console.log(`   reclassifiedAt: ${d.reclassifiedAt ?? 'nunca'}`)
  console.log(`   topP0Causes:`)
  for (const c of (d.topP0Causes || [])) {
    console.log(`     - ${c.error}: ${c.pieces} pzas (${c.pct}%)`)
  }

  // 2) pieceRecords subcollection
  console.log('\n🔗 FIRESTORE — pieceRecords subcollection:')
  const prSnap = await db.collection('graderDailySummaries').doc(SHIFT_ID).collection('pieceRecords').get()
  console.log(`   total docs: ${prSnap.size}`)
  const byGate = {}
  for (const doc of prSnap.docs) {
    const r = doc.data(); const g = r.gate ?? '?'
    byGate[g] = (byGate[g] ?? 0) + (r.pieces ?? 0)
  }
  for (const g of Object.keys(byGate).sort((a,b)=>+a-+b)) {
    console.log(`   gate ${g}: ${byGate[g]} pzas`)
  }

  // 3) Excel local
  console.log('\n📂 EXCEL LOCAL — buscando registros de este turno:')
  const ppFiles = walkXlsx(PP_DIR), p0Files = walkXlsx(P0_DIR)
  let ppForShift = [], p0ForShift = []
  for (const f of ppFiles) {
    const { records } = parseXlsx(f)
    for (const r of records) {
      const { shiftId, dateKey } = assignShift(r.ts)
      if (`${dateKey}__${shiftId}` === SHIFT_ID) ppForShift.push(r)
    }
  }
  for (const f of p0Files) {
    const { records } = parseXlsx(f)
    for (const r of records) {
      const { shiftId, dateKey } = assignShift(r.ts)
      if (`${dateKey}__${shiftId}` === SHIFT_ID) p0ForShift.push(r)
    }
  }
  console.log(`   PP records: ${ppForShift.length}`)
  console.log(`   P0 records: ${p0ForShift.length}`)
  const ppByGate = {}
  for (const r of ppForShift) ppByGate[r.gate] = (ppByGate[r.gate] ?? 0) + r.pieces
  console.log(`   PP por gate:`)
  for (const g of Object.keys(ppByGate).sort((a,b)=>+a-+b)) {
    console.log(`     gate ${g}: ${ppByGate[g]} pzas`)
  }
  const totalP0Excel = p0ForShift.reduce((s,r)=>s+r.pieces, 0)
  console.log(`   P0 total piezas: ${totalP0Excel}`)
  if (p0ForShift.length > 0) {
    console.log(`   primeros 3 P0:`)
    for (const r of p0ForShift.slice(0,3)) {
      console.log(`     - ${r.ts} | ${r.pieces} pzas | calibre=${r.calibre} quality=${r.quality} weightG=${r.weightPerPieceGrams}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 DIAGNÓSTICO:')
  console.log(`   Firestore totalP0     : ${d.totalP0 ?? 'N/A'}`)
  console.log(`   Excel    totalP0      : ${totalP0Excel}`)
  console.log(`   Sum topP0Causes pieces: ${(d.topP0Causes || []).reduce((s,c)=>s+c.pieces, 0)}`)
  console.log(`   PP en Firestore       : ${(byGate['1']||0)+(byGate['2']||0)+(byGate['3']||0)+(byGate['4']||0)+(byGate['5']||0)+(byGate['6']||0)+(byGate['7']||0)+(byGate['8']||0)+(byGate['9']||0)+(byGate['10']||0)+(byGate['11']||0)+(byGate['12']||0)} pzas (gates 1-12)`)
  console.log(`   PP en Excel           : ${ppForShift.reduce((s,r)=>s+r.pieces, 0)} pzas`)
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) })
