/**
 * Export de datasets para Power BI (Camino A: archivos en OneDrive).
 *
 * Vuelca las colecciones que evidencian el aporte de Mantención a CSVs
 * (UTF-8 con BOM, coma, fechas hora local America/Santiago) para que
 * Power BI los consuma como carpeta de datos y gerencia vea los KPIs
 * en la herramienta que ya usa la empresa.
 *
 * Tablas de hechos:
 *   fact_mantenciones.csv       ← maintenanceLog (intervenciones NFPA 70B / Captura Rápida)
 *   fact_paros_manuales.csv     ← paros (paros de etapa capturados a mano)
 *   fact_incidencias.csv        ← incidents (con horas de resolución para MTTR)
 *   fact_shoplogix_turnos.csv   ← shoplogix > shifts > machines (1 fila máquina-turno)
 *   fact_shoplogix_estados.csv  ← states agregados por causa (Pareto avería vs operacional)
 *   fact_grader_turnos.csv      ← graderDailySummaries (1 fila por turno del Grader/Marelec)
 *   fact_grader_p0_causas.csv   ← topP0Causes por turno (Pareto de rechazo P0)
 *   fact_grader_calibres.csv    ← calibreDistribution por turno (mix de calibres)
 * Dimensiones:
 *   dim_equipos.csv             ← hierarchy (con ruta y área resueltas)
 *   dim_equipment.csv           ← equipment (criticidad NFPA 70B, tipo, marca)
 *
 * Uso:   node scripts/powerbi/export-powerbi-datasets.js [--out="C:\\ruta\\salida"]
 * Salida por defecto: C:\Users\orelc\OneDrive\ANTARFOOD\POWERBI\datasets
 *
 * Criterio de "avería" replicado de apps/pwa/src/services/grader/shoplogixMaintenance.ts:
 * type='downtime' AND reason ∉ exclude-list; micro = name 'Micro Detencion'.
 */
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const sa = require('../../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

// ── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_OUT = 'C:\\Users\\orelc\\OneDrive\\ANTARFOOD\\POWERBI\\datasets'
const outArg = process.argv.find((a) => a.startsWith('--out='))
const OUT_DIR = outArg ? outArg.slice('--out='.length).replace(/^"|"$/g, '') : DEFAULT_OUT

// Igual que MAINTENANCE_EXCLUDED_REASONS en shoplogixMaintenance.ts
const EXCLUDED_REASONS = new Set(['FALTA MMPP', 'CONTRASTACION', 'CAMBIO LOTE/MMPP', 'AJUSTE OPERADOR'])

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtSantiago = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

/** Timestamp admin | {_seconds} | ISO string | Date | epoch-sec → Date|null */
function toDate(v) {
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000)
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d) ? null : d }
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000)
  return null
}

/** Fecha-hora local Chile "YYYY-MM-DD HH:mm:ss" (o '' si no hay). */
function fmt(v) {
  const d = toDate(v)
  return d ? fmtSantiago.format(d).replace(',', '') : ''
}

/** Segundos entre dos timestamps (para states sin durationSec). */
function secBetween(a, b) {
  const da = toDate(a), db_ = toDate(b)
  return da && db_ ? Math.max(0, (db_ - da) / 1000) : 0
}

/** Texto plano de una celda: sin saltos de línea ni tabs. */
function clean(v) {
  if (v == null) return ''
  return String(v).replace(/[\r\n\t]+/g, ' ').trim()
}

function csvCell(v) {
  const s = clean(v)
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function writeCsv(fileName, header, rows) {
  const lines = [header.join(',')]
  for (const r of rows) lines.push(header.map((h) => csvCell(r[h])).join(','))
  const filePath = path.join(OUT_DIR, fileName)
  fs.writeFileSync(filePath, '﻿' + lines.join('\r\n') + '\r\n', 'utf8')
  console.log(`  ✔ ${fileName}  (${rows.length} filas)`)
}

async function fetchAll(collName) {
  const snap = await db.collection(collName).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ── Exportadores ────────────────────────────────────────────────────────────
async function exportMantenciones() {
  const docs = await fetchAll('maintenanceLog')
  const rows = docs.map((d) => ({
    id: d.id,
    fecha: fmt(d.fecha),
    tipo: d.tipo ?? '',
    severidad: d.severidad ?? '',
    equipmentId: d.equipmentId ?? '',
    hierarchyNodeId: d.hierarchyNodeId ?? '',
    areaNodeId: d.areaNodeId ?? '',
    plantLineId: d.plantLineId ?? '',
    shiftId: d.shiftId ?? '',
    tecnico: d.tecnico ?? '',
    hallazgo: d.hallazgo ?? '',
    origen: d.origen ?? '',
    sapAviso: d.sapAviso ?? '',
    sapOrden: d.sapOrden ?? '',
    incidenciaId: d.incidenciaId ?? '',
    plantId: d.plantId ?? 'chonchi',
    createdAt: fmt(d.createdAt),
  }))
  rows.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  writeCsv('fact_mantenciones.csv', Object.keys(rows[0] ?? { id: '' }), rows)
}

async function exportParosManuales() {
  const docs = await fetchAll('paros')
  const rows = docs.map((d) => ({
    id: d.id,
    fecha: fmt(d.fecha),
    plantLineId: d.plantLineId ?? '',
    etapa: d.etapa ?? '',
    duracionMin: Number(d.duracionMin) || 0,
    causa: d.causa ?? '',
    tecnico: d.tecnico ?? '',
    shiftId: d.shiftId ?? '',
    plantId: d.plantId ?? 'chonchi',
  }))
  rows.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  writeCsv('fact_paros_manuales.csv', Object.keys(rows[0] ?? { id: '' }), rows)
}

async function exportIncidencias() {
  const docs = await fetchAll('incidents')
  const rows = docs.map((d) => {
    const created = toDate(d.createdAt)
    const resolved = toDate(d.resolvedAt)
    const horas = created && resolved ? ((resolved - created) / 3600000).toFixed(2) : ''
    return {
      id: d.id,
      createdAt: fmt(d.createdAt),
      tipo: d.tipo ?? '',
      titulo: d.titulo ?? '',
      prioridad: d.prioridad ?? '',
      status: d.status ?? '',
      equipmentId: d.equipmentId ?? '',
      hierarchyNodeId: d.hierarchyNodeId ?? '',
      creadoPorNombre: d.creadoPorNombre ?? '',
      asignadoANombre: d.asignadoANombre ?? '',
      resolvedByName: d.resolvedByName ?? '',
      confirmedAt: fmt(d.confirmedAt),
      resolvedAt: fmt(d.resolvedAt),
      closedAt: fmt(d.closedAt),
      horasResolucion: horas,
      causaRaiz: d.causaRaiz ?? '',
      plantId: d.plantId ?? 'chonchi',
    }
  })
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  writeCsv('fact_incidencias.csv', Object.keys(rows[0] ?? { id: '' }), rows)
}

/** Recorre shoplogix > shifts > machines vía collection group paginado. */
async function fetchShoplogixMachineDocs() {
  const docs = []
  let last = null
  for (;;) {
    let q = db.collectionGroup('machines').orderBy('__name__').limit(300)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      // El collection group también matchea la colección top-level legacy
      // `machines`: filtrar solo subcolecciones bajo shoplogix/.
      if (doc.ref.path.startsWith('shoplogix/')) docs.push(doc)
    }
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < 300) break
  }
  return docs
}

function classifyState(s) {
  const type = String(s.type ?? '').toLowerCase()
  if (type !== 'downtime') return { esAveria: false, categoria: type || 'desconocido' }
  const reason = String(s.reason ?? '').trim().toUpperCase()
  if (reason && EXCLUDED_REASONS.has(reason)) return { esAveria: false, categoria: 'paro_operacional' }
  const micro = String(s.name ?? '').trim() === 'Micro Detencion'
  return { esAveria: true, categoria: micro ? 'averia_micro' : 'averia_macro' }
}

async function exportShoplogix() {
  const machineDocs = await fetchShoplogixMachineDocs()
  const turnoRows = []
  const estadosAgg = new Map()

  for (const doc of machineDocs) {
    const d = doc.data()
    // Ruta: shoplogix/{plantSlug}/shifts/{dateKey}_{shiftId}/machines/{machineid}
    const plantSlug = doc.ref.path.split('/')[1] || 'chonchi'
    const shiftDocId = doc.ref.parent.parent ? doc.ref.parent.parent.id : ''
    const dateKey = d.dateKey ?? shiftDocId.split('_')[0] ?? ''
    const shiftId = d.shiftId ?? shiftDocId.slice(dateKey.length + 1)
    const maquina = d.machineName || doc.id
    const states = Array.isArray(d.states) ? d.states : []

    const acc = { uptimeSec: 0, downtimeSec: 0, breakSec: 0, setupSec: 0, averiaMacroSec: 0, averiaMacroCount: 0, averiaMicroSec: 0, averiaMicroCount: 0 }
    for (const s of states) {
      const dur = Number(s.durationSec) || secBetween(s.startAt, s.endAt)
      const type = String(s.type ?? '').toLowerCase()
      if (type === 'uptime') acc.uptimeSec += dur
      else if (type === 'downtime') acc.downtimeSec += dur
      else if (type === 'break') acc.breakSec += dur
      else if (type === 'setup') acc.setupSec += dur
      const c = classifyState(s)
      if (c.categoria === 'averia_macro') { acc.averiaMacroSec += dur; acc.averiaMacroCount += 1 }
      if (c.categoria === 'averia_micro') { acc.averiaMicroSec += dur; acc.averiaMicroCount += 1 }

      // Agregado por causa para el Pareto
      const name = clean(s.name ?? '')
      const reason = clean(s.reason ?? '')
      const key = [plantSlug, dateKey, shiftId, maquina, type, name, reason].join('|')
      const prev = estadosAgg.get(key) ?? {
        dateKey, shiftId, maquina, tipo: type, estado: name, causa: reason,
        categoria: c.categoria, esAveria: c.esAveria ? 1 : 0, totalSec: 0, eventos: 0,
        plantId: plantSlug,
      }
      prev.totalSec += dur
      prev.eventos += 1
      estadosAgg.set(key, prev)
    }

    turnoRows.push({
      dateKey,
      shiftId,
      maquina,
      maquinaId: doc.id,
      tipoMaquina: d.machineType ?? '',
      shiftStart: fmt(d.shiftStart),
      shiftEnd: fmt(d.shiftEnd),
      totalPieces: Number(d.totalPieces) || 0,
      expectedTotalPieces: Number(d.expectedTotalPieces) || 0,
      totalCycles: Number(d.totalCycles) || 0,
      expectedTotalCycles: Number(d.expectedTotalCycles) || 0,
      // Runtimes tal cual vienen de Shoplogix (fracción/ratio, NO segundos)
      shiftRuntime: Number(d.shiftRuntime) || 0,
      expectedRuntime: Number(d.expectedRuntime) || 0,
      actualRuntime: Number(d.actualRuntime) || 0,
      overallRatio: Number(d.overallRatio) || 0,
      uptimeSec: Math.round(acc.uptimeSec),
      downtimeSec: Math.round(acc.downtimeSec),
      breakSec: Math.round(acc.breakSec),
      setupSec: Math.round(acc.setupSec),
      averiaMacroSec: Math.round(acc.averiaMacroSec),
      averiaMacroCount: acc.averiaMacroCount,
      averiaMicroSec: Math.round(acc.averiaMicroSec),
      averiaMicroCount: acc.averiaMicroCount,
      plantId: plantSlug,
    })
  }

  turnoRows.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
  writeCsv('fact_shoplogix_turnos.csv', Object.keys(turnoRows[0] ?? { dateKey: '' }), turnoRows)

  const estadoRows = [...estadosAgg.values()].map((r) => ({ ...r, totalSec: Math.round(r.totalSec) }))
  estadoRows.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
  writeCsv('fact_shoplogix_estados.csv', Object.keys(estadoRows[0] ?? { dateKey: '' }), estadoRows)
}

/**
 * Grader (Excel del Marelec): 1 fila por turno + Paretos de P0 y calibres.
 * Fuente: `graderDailySummaries` (ID `${plantLineId?}__${dateKey}__${shiftId}`;
 * sin plantLineId = 'chonchi-eviscerado' legacy). La data existe solo si el
 * supervisor subió el Excel del turno — por eso las filas son más ralas que
 * Shoplogix: el join natural con el resto del modelo es por fecha + planta.
 */
/**
 * Los timestamps del Grader vienen en la convención `Z-as-wall-clock-local`
 * del módulo (hora Chile del Excel con sufijo Z falso — ver graderExcelParser
 * `toWallClockIso`). NO pasar por fmt(): eso restaría el offset de Chile a una
 * hora que ya es local. Solo se limpia el formato.
 */
function wallIso(v) {
  if (typeof v !== 'string' || !v.includes('T')) return ''
  return v.replace('T', ' ').slice(0, 19)
}

async function exportGrader() {
  const docs = await fetchAll('graderDailySummaries')
  const turnoRows = []
  const p0Rows = []
  const calibreRows = []

  for (const d of docs) {
    const plantLineId = d.plantLineId || 'chonchi-eviscerado'
    const base = { plantLineId, dateKey: d.dateKey ?? '', shiftId: d.shiftId ?? '' }
    const durMin = Number(d.durationMinutes) || 0
    const totalPieces = Number(d.totalPieces) || 0
    turnoRows.push({
      id: d.id,
      ...base,
      turnoLabel: d.turnoLabel ?? '',
      especie: d.species ?? '',
      totalPieces,
      pointZeroPieces: Number(d.pointZeroPieces) || 0,
      pointZeroPct: Number(d.pointZeroPct) || 0,
      totalWeightKg: Number(d.totalWeightKg) || 0,
      avgWeightGrams: Number(d.avgWeightGrams) || 0,
      productionRatePerHour: Number(d.productionRatePerHour) || 0,
      durationMinutes: durMin,
      cadenciaPzMin: durMin > 0 ? Number((totalPieces / durMin).toFixed(1)) : 0,
      startAt: wallIso(d.startAt),
      endAt: wallIso(d.endAt),
      updatedAt: fmt(d.updatedAt),
    })
    for (const c of Array.isArray(d.topP0Causes) ? d.topP0Causes : []) {
      p0Rows.push({ ...base, causa: c.error ?? '', piezas: Number(c.pieces) || 0, pct: Number(c.pct) || 0 })
    }
    for (const c of Array.isArray(d.calibreDistribution) ? d.calibreDistribution : []) {
      calibreRows.push({ ...base, calibre: c.calibre ?? '', piezas: Number(c.pieces) || 0, pct: Number(c.pct) || 0 })
    }
  }

  turnoRows.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
  p0Rows.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
  calibreRows.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
  writeCsv('fact_grader_turnos.csv', Object.keys(turnoRows[0] ?? { id: '' }), turnoRows)
  writeCsv('fact_grader_p0_causas.csv', Object.keys(p0Rows[0] ?? { dateKey: '' }), p0Rows)
  writeCsv('fact_grader_calibres.csv', Object.keys(calibreRows[0] ?? { dateKey: '' }), calibreRows)
}

async function exportDimEquipos() {
  const nodes = await fetchAll('hierarchy')
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rows = nodes.map((n) => {
    const rawPath = Array.isArray(n.path) ? n.path : []
    const pathIds = rawPath[rawPath.length - 1] === n.id ? rawPath.slice(0, -1) : rawPath
    const rutaNombres = [...pathIds.map((id) => byId.get(id)?.nombre ?? id), n.nombre ?? '']
      .filter(Boolean).join(' > ')
    // Área del nodo: el ancestro (o él mismo) más profundo etiquetado 'area'.
    let areaNombre = ''
    for (const id of [...pathIds].reverse()) {
      const anc = byId.get(id)
      if (anc?.tipoNodo === 'area') { areaNombre = anc.nombre ?? ''; break }
    }
    return {
      id: n.id,
      codigo: n.codigo ?? '',
      nombre: n.nombre ?? '',
      alias: n.alias ?? '',
      tipoNodo: n.tipoNodo ?? '',
      nivel: n.nivel ?? '',
      parentId: n.parentId ?? '',
      areaNombre,
      rutaNombres,
      activo: n.activo === false ? 0 : 1,
      plantId: n.plantId ?? 'chonchi',
    }
  })
  rows.sort((a, b) => (a.rutaNombres > b.rutaNombres ? 1 : -1))
  writeCsv('dim_equipos.csv', Object.keys(rows[0] ?? { id: '' }), rows)
}

async function exportDimEquipment() {
  const docs = await fetchAll('equipment')
  const rows = docs
    .filter((d) => d.deleted !== true)
    .map((d) => ({
      id: d.id,
      codigo: d.codigo ?? '',
      nombre: d.nombre ?? '',
      nombreComun: d.nombreComun ?? '',
      tipo: d.tipo ?? '',
      marca: d.marca ?? '',
      modelo: d.modelo ?? '',
      criticidad: d.criticidad ?? '',
      estado: d.estado ?? '',
      condicionNFPA: d.fichaTecnica?.condicion ?? '',
      hierarchyNodeId: d.hierarchyNodeId ?? '',
      hierarchyPath: d.hierarchyPath ?? '',
      plantId: d.plantId ?? 'chonchi',
    }))
  rows.sort((a, b) => (a.nombre > b.nombre ? 1 : -1))
  writeCsv('dim_equipment.csv', Object.keys(rows[0] ?? { id: '' }), rows)
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Exportando datasets Power BI → ${OUT_DIR}\n`)
  await exportMantenciones()
  await exportParosManuales()
  await exportIncidencias()
  await exportShoplogix()
  await exportGrader()
  await exportDimEquipos()
  await exportDimEquipment()
  const stamp = { exportadoEn: new Date().toISOString(), zonaHoraria: 'America/Santiago (fechas de los CSV)' }
  fs.writeFileSync(path.join(OUT_DIR, '_ultima_exportacion.json'), JSON.stringify(stamp, null, 2), 'utf8')
  console.log('\nListo.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
