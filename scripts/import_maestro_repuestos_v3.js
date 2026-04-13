#!/usr/bin/env node
/**
 * import_maestro_repuestos_v3.js
 *
 * Importa el catálogo completo de repuestos desde Maestro_Repuestos_Completo_v3.xlsx
 * a la colección Firestore: machines/{machineId}/repuestos
 *
 * El Excel tiene encabezado decorativo en las primeras 3 filas.
 * Los datos reales comienzan en la fila 4 con columnas:
 *   MAQUINA | N° SERIE | SECCION | COD. MAQUINA | DESCRIPCION |
 *   DESC. SAP | VALOR UNIT. ($) | TIPO | COD. SAP | STOCK | UBICACION | VALOR TOTAL ($)
 *
 * Uso:
 *   node scripts/import_maestro_repuestos_v3.js              → dry-run (solo analiza)
 *   node scripts/import_maestro_repuestos_v3.js --execute    → importa a Firestore
 *   node scripts/import_maestro_repuestos_v3.js --preview    → muestra primeras 15 filas
 *   node scripts/import_maestro_repuestos_v3.js --machine baader-142  → solo esa máquina
 *
 * Lógica:
 *   - Crea máquinas automáticamente si no existen en Firestore
 *   - Si ya existe un repuesto con mismo codigoFabricante en esa máquina, lo ACTUALIZA
 *   - Si no existe, lo CREA con ID auto-generado
 *   - Ignora filas con MAQUINA = "TOTAL PLANTA" o vacías
 *   - Procesa en batches de 400 para respetar límites de Firestore
 */

const admin = require('firebase-admin')
const XLSX  = require('xlsx')
const path  = require('path')

// ─── Firebase init ───────────────────────────────────────────────────────────
const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

// ─── Config ──────────────────────────────────────────────────────────────────
const EXCEL_PATH  = path.resolve('C:\\Users\\pc hp\\OneDrive\\ANTARFOOD\\INVENTARIO\\Maestro_Repuestos_Completo_v3.xlsx')
const SHEET_NAME  = 'Maestro'
const HEADER_ROWS = 4   // las primeras 3 filas son decorativo, la 4ta es el header real
const BATCH_SIZE  = 400

const DRY_RUN     = !process.argv.includes('--execute')
const PREVIEW     = process.argv.includes('--preview')
const ONLY_MACHINE = (() => {
  const idx = process.argv.indexOf('--machine')
  return idx !== -1 ? process.argv[idx + 1] : null
})()

// ─── Mapeo MAQUINA (Excel) → machineId (Firestore) ──────────────────────────
const MACHINE_MAP = {
  'BAADER 142':        'baader-142',
  'BAADER 200':        'baader-200',
  'DETECTOR METALES':  'detector-metales',
  'FISHKEN':           'fishken',
  'GEA V2':            'gea-v2',
  'GARIBALDI':         'garibaldi',
  'GRADER':            'grader',
  'IMPRESORA VIDEOJET':'impresora-videojet',
  'KNURO':             'knuro',
  'MAREL EVISCERADO':  'marel-eviscerado',
  'MAREL FILETE':      'marel-filete',
}

// Datos de cada máquina para crearla si no existe
const MACHINE_DEFAULTS = {
  'baader-142':         { nombre: 'Baader 142',          marca: 'Baader',    modelo: '142',      color: '#3b82f6', orden: 0  },
  'baader-200':         { nombre: 'Baader 200',          marca: 'Baader',    modelo: '200',      color: '#6366f1', orden: 1  },
  'detector-metales':   { nombre: 'Detector de Metales', marca: 'Genérico',  modelo: '',         color: '#ef4444', orden: 2  },
  'fishken':            { nombre: 'Fishken',             marca: 'Fishken',   modelo: '',         color: '#f59e0b', orden: 3  },
  'gea-v2':             { nombre: 'GEA V2',              marca: 'GEA',       modelo: 'V2',       color: '#10b981', orden: 4  },
  'garibaldi':          { nombre: 'Garibaldi',           marca: 'Garibaldi', modelo: '',         color: '#8b5cf6', orden: 5  },
  'grader':             { nombre: 'Grader',              marca: 'Marel',     modelo: 'Grader',   color: '#06b6d4', orden: 6  },
  'impresora-videojet': { nombre: 'Impresora Videojet',  marca: 'Videojet',  modelo: '',         color: '#ec4899', orden: 7  },
  'knuro':              { nombre: 'Knuro',               marca: 'Knuro',     modelo: '',         color: '#84cc16', orden: 8  },
  'marel-eviscerado':   { nombre: 'Marel Eviscerado',    marca: 'Marel',     modelo: 'Eviscerado', color: '#14b8a6', orden: 9  },
  'marel-filete':       { nombre: 'Marel Filete',        marca: 'Marel',     modelo: 'Filete',   color: '#f97316', orden: 10 },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function str(v, fallback = '') {
  if (v === undefined || v === null) return fallback
  return String(v).trim()
}

function num(v, fallback = 0) {
  const n = Number(String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'item'
}

// Genera un ID estable para el repuesto basado en machineId + codigoFabricante + descripcion
function makeRepuestoId(machineId, codigoFabricante, descripcion) {
  const base = `${machineId}-${codigoFabricante || descripcion}`
  return slugify(base).slice(0, 60)
}

// ─── Leer Excel ──────────────────────────────────────────────────────────────
function readMaestro() {
  console.log(`\n📖 Leyendo: ${EXCEL_PATH}`)
  const wb = XLSX.readFile(EXCEL_PATH)

  if (!wb.SheetNames.includes(SHEET_NAME)) {
    console.error(`❌ Hoja "${SHEET_NAME}" no encontrada. Hojas disponibles: ${wb.SheetNames.join(', ')}`)
    process.exit(1)
  }

  const ws = wb.Sheets[SHEET_NAME]

  // Convertir a array de arrays para controlar el header manualmente
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  // La fila HEADER_ROWS (índice 2) contiene los nombres de columna
  const headerRow = raw[HEADER_ROWS - 1] || []
  const normalize = s => str(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const headers   = headerRow.map(normalize)

  console.log(`   Columnas detectadas: ${headers.filter(Boolean).join(' | ')}`)

  // Mapear columnas por nombre
  const COL = {
    maquina:    headers.findIndex(h => h === 'MAQUINA'),
    serie:      headers.findIndex(h => h.includes('SERIE')),
    seccion:    headers.findIndex(h => h === 'SECCION'),
    codMaq:     headers.findIndex(h => h.includes('COD') && h.includes('MAQUINA')),
    desc:       headers.findIndex(h => h === 'DESCRIPCION'),
    descSAP:    headers.findIndex(h => h.includes('DESC') && h.includes('SAP')),
    valorUnit:  headers.findIndex(h => h.includes('VALOR UNIT')),
    tipo:       headers.findIndex(h => h === 'TIPO'),
    codSAP:     headers.findIndex(h => h.includes('COD') && h.includes('SAP') && !h.includes('MAQUINA')),
    stock:      headers.findIndex(h => h === 'STOCK'),
    ubicacion:  headers.findIndex(h => h === 'UBICACION'),
  }

  // Verificar columnas críticas
  const missing = Object.entries(COL)
    .filter(([k, v]) => v === -1 && ['maquina','desc'].includes(k))
    .map(([k]) => k)
  if (missing.length) {
    console.error(`❌ Columnas no encontradas: ${missing.join(', ')}`)
    console.error(`   Headers detectados: ${headers.join(' | ')}`)
    process.exit(1)
  }

  console.log(`   Índices de columnas: ${JSON.stringify(COL)}`)

  // Extraer filas de datos (a partir de HEADER_ROWS)
  const rows = []
  for (let i = HEADER_ROWS; i < raw.length; i++) {
    const row = raw[i]
    if (!row) continue

    const maquina = str(COL.maquina >= 0 ? row[COL.maquina] : null).toUpperCase()
    if (!maquina || maquina === 'TOTAL PLANTA' || maquina === 'MAQUINA') continue

    const machineId = MACHINE_MAP[maquina]
    if (!machineId) continue  // ignorar máquinas no mapeadas

    const codigoFabricante = str(COL.codMaq   >= 0 ? row[COL.codMaq]   : null)
    const descripcion      = str(COL.desc     >= 0 ? row[COL.desc]     : null)
    const textoBreve       = str(COL.descSAP  >= 0 ? row[COL.descSAP]  : null)
    const codigoSAP        = str(COL.codSAP   >= 0 ? row[COL.codSAP]   : null)
    const tipo             = str(COL.tipo     >= 0 ? row[COL.tipo]     : null)
    const seccion          = str(COL.seccion  >= 0 ? row[COL.seccion]  : null)
    const ubicacion        = str(COL.ubicacion >= 0 ? row[COL.ubicacion] : null)
    const serie            = str(COL.serie    >= 0 ? row[COL.serie]    : null)
    const valorUnit        = num(COL.valorUnit >= 0 ? row[COL.valorUnit] : null)
    const stock            = num(COL.stock    >= 0 ? row[COL.stock]    : null)

    // Ignorar filas completamente vacías
    if (!descripcion && !codigoFabricante && !codigoSAP) continue

    rows.push({
      machineId,
      maquinaNombre: maquina,
      codigoFabricante,
      descripcion,
      textoBreve,
      codigoSAP,
      tipo,
      seccion,
      ubicacionEnPlanta: ubicacion,
      numeroSerie: serie,
      valorUnitario: valorUnit,
      cantidadPorMaquina: stock,  // stock físico en bodega
    })
  }

  return rows
}

// ─── Asegurar que la máquina existe en Firestore ─────────────────────────────
async function ensureMachine(machineId, existingIds) {
  if (existingIds.has(machineId)) return false  // ya existe, no hay que crearla

  const defaults = MACHINE_DEFAULTS[machineId] || {
    nombre: machineId, marca: '', modelo: '', color: '#94a3b8', orden: 99,
  }

  const now = admin.firestore.FieldValue.serverTimestamp()
  await db.collection('machines').doc(machineId).set({
    ...defaults,
    activa: true,
    descripcion: '',
    manuals: [],
    infografias: [],
    createdAt: now,
    updatedAt: now,
  }, { merge: true })

  existingIds.add(machineId)
  return true
}

// ─── Ejecutar batches ─────────────────────────────────────────────────────────
async function flushBatch(ops) {
  if (!ops.length) return
  const batch = db.batch()
  for (const { ref, data, merge } of ops) {
    if (merge) batch.set(ref, data, { merge: true })
    else       batch.set(ref, data)
  }
  await batch.commit()
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('  📦  Importar Maestro_Repuestos_Completo_v3 → Firestore')
  console.log('═'.repeat(60))
  if (DRY_RUN) console.log('  ⚠️   DRY-RUN — no se escribirá nada (usa --execute para importar)')
  if (ONLY_MACHINE) console.log(`  🔍  Filtrando solo: ${ONLY_MACHINE}`)
  console.log()

  // Leer Excel
  let rows = readMaestro()

  if (ONLY_MACHINE) {
    rows = rows.filter(r => r.machineId === ONLY_MACHINE)
  }

  // Estadísticas por máquina
  const byMachine = {}
  for (const r of rows) {
    byMachine[r.machineId] = (byMachine[r.machineId] || 0) + 1
  }
  console.log(`\n📊 Repuestos leídos por equipo:`)
  for (const [mid, cnt] of Object.entries(byMachine).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${mid.padEnd(25)} ${cnt.toString().padStart(5)} repuestos`)
  }
  console.log(`   ${'TOTAL'.padEnd(25)} ${rows.length.toString().padStart(5)}`)

  if (PREVIEW) {
    console.log('\n🔎 Preview (primeras 15 filas):')
    rows.slice(0, 15).forEach((r, i) => {
      console.log(`  [${i+1}] ${r.machineId} | "${r.codigoFabricante}" | "${r.descripcion.slice(0,40)}" | TIPO:${r.tipo} | STOCK:${r.cantidadPorMaquina}`)
    })
    return
  }

  if (DRY_RUN) {
    console.log('\n✅ Dry-run completado. Usa --execute para importar.')
    return
  }

  // ─── Verificar máquinas existentes ────────────────────────────────────────
  console.log('\n🔍 Verificando máquinas existentes en Firestore...')
  const machinesSnap = await db.collection('machines').get()
  const existingMachineIds = new Set(machinesSnap.docs.map(d => d.id))
  console.log(`   Máquinas en Firestore: ${existingMachineIds.size}`)

  // Crear máquinas faltantes
  const uniqueMachineIds = [...new Set(rows.map(r => r.machineId))]
  let machinesCreated = 0
  for (const mid of uniqueMachineIds) {
    const created = await ensureMachine(mid, existingMachineIds)
    if (created) {
      console.log(`   ✚ Máquina creada: ${mid}`)
      machinesCreated++
    }
  }
  if (machinesCreated === 0) console.log('   Todas las máquinas ya existen.')

  // ─── Cargar repuestos existentes por máquina para detectar duplicados ──────
  console.log('\n🔍 Cargando índice de repuestos existentes...')
  const existingByMachine = {}  // machineId → Map<codigoFabricante, docId>
  for (const mid of uniqueMachineIds) {
    const snap = await db.collection(`machines/${mid}/repuestos`).get()
    existingByMachine[mid] = new Map()
    snap.docs.forEach(d => {
      const cod = str(d.data().codigoFabricante)
      if (cod) existingByMachine[mid].set(cod, d.id)
    })
    console.log(`   ${mid}: ${snap.size} repuestos existentes`)
  }

  // ─── Preparar operaciones ────────────────────────────────────────────────
  console.log('\n⬆️  Preparando importación...')
  const now = admin.firestore.FieldValue.serverTimestamp()
  let ops     = []
  let created = 0
  let updated = 0

  for (const row of rows) {
    const { machineId, maquinaNombre: _, ...fields } = row
    const existing = existingByMachine[machineId]

    // Determinar si actualizar o crear
    const existingDocId = fields.codigoFabricante
      ? existing?.get(fields.codigoFabricante)
      : undefined

    const data = {
      codigoFabricante:  fields.codigoFabricante  || '',
      descripcion:       fields.descripcion        || '',
      textoBreve:        fields.textoBreve         || '',
      codigoSAP:         fields.codigoSAP          || '',
      tipo:              fields.tipo               || '',
      seccion:           fields.seccion            || '',
      ubicacionEnPlanta: fields.ubicacionEnPlanta  || '',
      numeroSerie:       fields.numeroSerie        || '',
      valorUnitario:     fields.valorUnitario      || 0,
      cantidadPorMaquina: fields.cantidadPorMaquina || 0,
      // Campos requeridos por el tipo Repuesto
      nombreManual:      '',
      vinculosManual:    [],
      imagenesManual:    [],
      fotosReales:       [],
      updatedAt:         now,
    }

    let ref
    let merge = false
    if (existingDocId) {
      ref   = db.collection(`machines/${machineId}/repuestos`).doc(existingDocId)
      merge = true
      updated++
    } else {
      const newId = makeRepuestoId(machineId, fields.codigoFabricante, fields.descripcion)
      ref = db.collection(`machines/${machineId}/repuestos`).doc(newId)
      data.createdAt = now
      created++
    }

    ops.push({ ref, data, merge })

    if (ops.length >= BATCH_SIZE) {
      await flushBatch(ops)
      process.stdout.write(`   ... ${created + updated} procesados\r`)
      ops = []
    }
  }

  // Último batch
  if (ops.length) {
    await flushBatch(ops)
  }

  console.log('\n')
  console.log('═'.repeat(60))
  console.log(`  ✅ Importación completada`)
  console.log(`     Creados:    ${created}`)
  console.log(`     Actualizados: ${updated}`)
  console.log(`     Máquinas nuevas: ${machinesCreated}`)
  console.log('═'.repeat(60))
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
