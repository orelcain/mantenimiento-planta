#!/usr/bin/env node
/**
 * import-inventario-feb2026.js
 *
 * Importa el inventario de bodega (febrero 2026) al catálogo de repuestos en Firestore.
 *
 * Columnas del Excel:
 *   material      → codigoSAP
 *   texto material → textoBreve (+ extracción de codigoFabricante)
 *   cantidad       → cantidadPorMaquina (inventario febrero 2026)
 *   ubicacion      → ubicacionEnPlanta (ubicación física en bodega)
 *   equipo         → machineId (mapeo a Firestore)
 *
 * Uso:
 *   node scripts/import-inventario-feb2026.js --dry-run     (solo analiza, no escribe)
 *   node scripts/import-inventario-feb2026.js --execute      (importa a Firestore)
 *
 * Lógica:
 *   - Si ya existe un repuesto con el mismo codigoSAP en la máquina, lo actualiza
 *     (agrega cantidad, ubicación) sin borrar campos existentes.
 *   - Si no existe, lo crea como documento nuevo.
 *   - Si el equipo no existe como máquina en Firestore, lo crea automáticamente.
 *   - Extrae codigoFabricante del texto usando regex de 4+ dígitos (última coincidencia).
 *   - Migra campo codigoBaader → codigoFabricante en repuestos existentes.
 */

const admin = require('firebase-admin')
const XLSX = require('xlsx')
const path = require('path')

// ─── Firebase init ──────────────────────────────────────────
const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

// ─── Config ─────────────────────────────────────────────────
const EXCEL_PATH = path.resolve(__dirname, '..', 'INVENTARIO BODEGA FEBRERO 2026.xlsx')
const DRY_RUN = !process.argv.includes('--execute')
const BATCH_SIZE = 400

// ─── Mapeo equipo Excel → machineId Firestore ──────────────
const EQUIPO_TO_MACHINE = {
  'BAADER 142': 'baader-142',
  'BAADER 200': 'baader-200',
  'MARELEC':    'grader',       // Marelec = Grader
  'MAREL':      'marel-pendiente',
  'GARIBALDI':  'garibaldi',
  'KNURO':      'knuro',
  'MULTIVAC':   'multivac',
}

// Nuevas máquinas que no existen aún en Firestore
const NEW_MACHINES = {
  'garibaldi': {
    nombre: 'Garibaldi',
    marca: 'Garibaldi',
    modelo: '-',
    descripcion: 'Equipo Garibaldi',
    activa: true,
    color: '#f59e0b',
    orden: 50,
  },
  'knuro': {
    nombre: 'Knuro',
    marca: 'Knuro',
    modelo: '-',
    descripcion: 'Equipo Knuro',
    activa: true,
    color: '#8b5cf6',
    orden: 51,
  },
  'multivac': {
    nombre: 'Multivac',
    marca: 'Multivac',
    modelo: '-',
    descripcion: 'Equipo Multivac',
    activa: true,
    color: '#ef4444',
    orden: 52,
  },
  'sin-asignar': {
    nombre: 'Sin Asignar',
    marca: '-',
    modelo: '-',
    descripcion: 'Repuestos sin equipo asignado (inventario bodega)',
    activa: true,
    color: '#6b7280',
    orden: 99,
  },
}

// ─── Extracción de código fabricante ────────────────────────
function extractManufacturerCode(textoBreve) {
  if (!textoBreve) return ''
  // Busca secuencias de 4+ dígitos, toma la última (típicamente el P/N)
  const numbers = textoBreve.match(/\b\d{4,}\b/g)
  if (!numbers || numbers.length === 0) return ''
  return numbers[numbers.length - 1]
}

// ─── Leer Excel ─────────────────────────────────────────────
function readExcel() {
  const wb = XLSX.readFile(EXCEL_PATH)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws)

  console.log(`📄 Excel leído: ${data.length} filas`)
  return data
}

// ─── Normalizar fila ────────────────────────────────────────
function normalizeRow(row) {
  const material = String(row['material'] || '').trim()
  const textoBreve = String(row['texto material'] || '').trim()
  const cantidad = Number(row['cantidad']) || 0
  const ubicacion = String(row['ubicacion'] || '').trim()
  const equipoRaw = String(row['equipo'] || '').trim().toUpperCase()

  // Mapear equipo a machineId
  const machineId = EQUIPO_TO_MACHINE[equipoRaw] || (equipoRaw ? null : 'sin-asignar')

  // Si el equipo no está en el mapeo y tiene valor, advertir
  if (equipoRaw && !machineId) {
    return { skip: true, reason: `Equipo desconocido: "${equipoRaw}"`, material }
  }

  // Extraer código fabricante
  const codigoFabricante = extractManufacturerCode(textoBreve)

  return {
    skip: false,
    machineId: machineId || 'sin-asignar',
    codigoSAP: material,
    textoBreve,
    codigoFabricante,
    cantidadPorMaquina: cantidad,
    ubicacionEnPlanta: ubicacion || '',
  }
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  Importación Inventario Bodega Feb 2026')
  console.log(`  Modo: ${DRY_RUN ? '🔍 DRY RUN (solo análisis)' : '🔥 EXECUTE (escribir Firestore)'}`)
  console.log('═══════════════════════════════════════════\n')

  const rows = readExcel()

  // Normalizar
  const normalized = rows.map(normalizeRow)
  const skipped = normalized.filter(r => r.skip)
  const valid = normalized.filter(r => !r.skip)

  if (skipped.length > 0) {
    console.log(`\n⚠️  ${skipped.length} filas omitidas:`)
    const reasons = {}
    skipped.forEach(s => { reasons[s.reason] = (reasons[s.reason] || 0) + 1 })
    Object.entries(reasons).forEach(([r, c]) => console.log(`   ${r}: ${c}`))
  }

  // Agrupar por máquina
  const byMachine = {}
  valid.forEach(r => {
    if (!byMachine[r.machineId]) byMachine[r.machineId] = []
    byMachine[r.machineId].push(r)
  })

  console.log(`\n📊 Resumen por máquina:`)
  Object.entries(byMachine).sort((a, b) => b[1].length - a[1].length).forEach(([m, reps]) => {
    console.log(`   ${m}: ${reps.length} repuestos`)
  })

  // Verificar máquinas existentes
  console.log('\n🔍 Verificando máquinas en Firestore...')
  const existingMachines = new Set()
  const machSnap = await db.collection('machines').get()
  machSnap.docs.forEach(d => existingMachines.add(d.id))

  const machineIds = Object.keys(byMachine)
  const newMachineIds = machineIds.filter(m => !existingMachines.has(m))
  const existingMachineIds = machineIds.filter(m => existingMachines.has(m))

  console.log(`   ✅ Existentes: ${existingMachineIds.join(', ')}`)
  if (newMachineIds.length > 0) {
    console.log(`   🆕 Nuevas a crear: ${newMachineIds.join(', ')}`)
  }

  // Cargar repuestos existentes por SAP para detectar duplicados
  console.log('\n🔍 Cargando repuestos existentes para detectar duplicados...')
  const existingBySAP = {} // machineId -> { sap -> docId }
  for (const machId of machineIds) {
    existingBySAP[machId] = {}
    if (existingMachines.has(machId)) {
      const repSnap = await db.collection(`machines/${machId}/repuestos`).get()
      repSnap.docs.forEach(d => {
        const data = d.data()
        if (data.codigoSAP) {
          existingBySAP[machId][data.codigoSAP] = d.id
        }
      })
      console.log(`   ${machId}: ${repSnap.size} repuestos existentes`)
    }
  }

  // Calcular creates vs updates
  let totalCreate = 0
  let totalUpdate = 0
  let totalSkipDup = 0

  const operations = [] // { type: 'create'|'update', machineId, docId, data }

  for (const [machId, reps] of Object.entries(byMachine)) {
    const existingMap = existingBySAP[machId] || {}

    for (const rep of reps) {
      const existingDocId = existingMap[rep.codigoSAP]

      if (existingDocId) {
        // Ya existe — actualizar campos del inventario
        totalUpdate++
        operations.push({
          type: 'update',
          machineId: machId,
          docId: existingDocId,
          data: {
            cantidadPorMaquina: rep.cantidadPorMaquina,
            ubicacionEnPlanta: rep.ubicacionEnPlanta,
            // Actualizar codigoFabricante solo si estaba vacío
            ...(rep.codigoFabricante ? { codigoFabricante: rep.codigoFabricante } : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        })
      } else {
        // Nuevo — crear documento
        totalCreate++
        const docId = `inv-${rep.codigoSAP}`
        operations.push({
          type: 'create',
          machineId: machId,
          docId,
          data: {
            id: docId,
            codigoSAP: rep.codigoSAP,
            textoBreve: rep.textoBreve,
            descripcion: rep.textoBreve,
            codigoFabricante: rep.codigoFabricante,
            cantidadPorMaquina: rep.cantidadPorMaquina,
            ubicacionEnPlanta: rep.ubicacionEnPlanta,
            valorUnitario: 0,
            vinculosManual: [],
            imagenesManual: [],
            fotosReales: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        })
      }
    }
  }

  console.log(`\n📋 Operaciones planificadas:`)
  console.log(`   🆕 Crear: ${totalCreate} repuestos nuevos`)
  console.log(`   📝 Actualizar: ${totalUpdate} repuestos existentes`)
  console.log(`   🔄 Total: ${operations.length} operaciones`)

  // Muestra de lo que se importará
  console.log('\n📎 Muestra (primeros 5 creates):')
  operations.filter(o => o.type === 'create').slice(0, 5).forEach(o => {
    console.log(`   [${o.machineId}] SAP: ${o.data.codigoSAP} | "${o.data.textoBreve}" | cant: ${o.data.cantidadPorMaquina} | ubic: ${o.data.ubicacionEnPlanta} | cod.fab: ${o.data.codigoFabricante}`)
  })

  if (totalUpdate > 0) {
    console.log('\n📎 Muestra (primeros 5 updates):')
    operations.filter(o => o.type === 'update').slice(0, 5).forEach(o => {
      console.log(`   [${o.machineId}] doc: ${o.docId} | cant: ${o.data.cantidadPorMaquina} | ubic: ${o.data.ubicacionEnPlanta}`)
    })
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — No se escribió nada. Ejecuta con --execute para importar.')
    process.exit(0)
    return
  }

  // ─── EXECUTE ──────────────────────────────────────────────
  console.log('\n🔥 Ejecutando importación...')

  // 0. Migrar campo codigoBaader → codigoFabricante en repuestos existentes
  console.log('\n   Migrando campo codigoBaader → codigoFabricante en datos existentes...')
  let migrated = 0
  for (const machDoc of machSnap.docs) {
    const repSnap = await db.collection(`machines/${machDoc.id}/repuestos`).get()
    if (repSnap.empty) continue
    const migBatch = db.batch()
    let batchCount = 0
    for (const repDoc of repSnap.docs) {
      const data = repDoc.data()
      if (data.codigoBaader !== undefined) {
        const update = {
          codigoFabricante: data.codigoFabricante || data.codigoBaader || '',
        }
        // Remove old field by setting to FieldValue.delete()
        update.codigoBaader = admin.firestore.FieldValue.delete()
        migBatch.update(repDoc.ref, update)
        batchCount++
        migrated++
        if (batchCount >= BATCH_SIZE) {
          await migBatch.commit()
          batchCount = 0
        }
      }
    }
    if (batchCount > 0) await migBatch.commit()
  }
  console.log(`   ✅ Migrados ${migrated} documentos (codigoBaader → codigoFabricante)`)

  // 1. Crear máquinas nuevas
  if (newMachineIds.length > 0) {
    console.log('\n   Creando máquinas nuevas...')
    for (const machId of newMachineIds) {
      const machData = NEW_MACHINES[machId]
      if (!machData) {
        console.log(`   ⚠️  Sin datos para máquina "${machId}", omitida`)
        continue
      }
      await db.collection('machines').doc(machId).set({
        id: machId,
        ...machData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      console.log(`   ✅ Máquina creada: ${machId} ("${machData.nombre}")`)
    }
  }

  // 2. Escribir repuestos en batches
  const chunks = []
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    chunks.push(operations.slice(i, i + BATCH_SIZE))
  }

  let processed = 0
  for (const chunk of chunks) {
    const batch = db.batch()
    for (const op of chunk) {
      const ref = db.collection(`machines/${op.machineId}/repuestos`).doc(op.docId)
      if (op.type === 'create') {
        batch.set(ref, op.data)
      } else {
        batch.update(ref, op.data)
      }
    }
    await batch.commit()
    processed += chunk.length
    const pct = Math.round((processed / operations.length) * 100)
    process.stdout.write(`\r   📦 Progreso: ${processed}/${operations.length} (${pct}%)`)
  }

  console.log('\n')
  console.log('═══════════════════════════════════════════')
  console.log(`  ✅ Importación completada`)
  console.log(`     ${totalCreate} creados + ${totalUpdate} actualizados`)
  console.log('═══════════════════════════════════════════')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
