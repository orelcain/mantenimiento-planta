/**
 * Script de migración de repuestos desde Repuestos-App a mantenimiento-planta
 * 
 * Este script:
 * 1. Crea las máquinas en Firestore
 * 2. Importa repuestos por máquina
 * 3. Migra imágenes a Firebase Storage
 * 4. Preserva vínculos PDF con marcadores
 * 
 * Uso:
 *   node scripts/migrate_repuestos_app.js
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, writeBatch } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import fetch from 'node-fetch'
import * as admin from 'firebase-admin'

// Configuración del proyecto destino (mantenimiento-planta)
const serviceAccount = require('../serviceAccountKey.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'tu-proyecto.appspot.com' // REEMPLAZAR con tu bucket
})

const db = admin.firestore()
const storage = admin.storage()

// Configuración del proyecto origen (Repuestos-App)
const ORIGEN_PROJECT_ID = 'repuestos-app' // ID del proyecto origen
const ORIGEN_API_KEY = 'TU_API_KEY' // REEMPLAZAR con API key del origen

// Máquinas a migrar
const MACHINES = [
  {
    id: 'baader-200',
    nombre: 'Baader 200',
    fabricante: 'Baader',
    color: '#3b82f6',
    orden: 1,
    activa: true,
    descripcion: 'Máquina fileteadora Baader 200',
  },
  {
    id: 'fishken',
    nombre: 'Fishken',
    fabricante: 'Fishken',
    color: '#10b981',
    orden: 2,
    activa: true,
    descripcion: 'Equipo Fishken',
  },
  {
    id: 'grader',
    nombre: 'Grader',
    fabricante: 'Grader',
    color: '#f59e0b',
    orden: 3,
    activa: true,
    descripcion: 'Clasificadora Grader',
  },
]

// Estadísticas de migración
const stats = {
  machines: 0,
  repuestos: 0,
  images: 0,
  vinculos: 0,
  errors: [],
}

/**
 * Crear máquinas en Firestore
 */
async function createMachines() {
  console.log('\n📦 Creando máquinas...')
  
  for (const machine of MACHINES) {
    try {
      await db.collection('machines').doc(machine.id).set({
        ...machine,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      
      console.log(`  ✅ Máquina creada: ${machine.nombre}`)
      stats.machines++
    } catch (error) {
      console.error(`  ❌ Error creando ${machine.nombre}:`, error.message)
      stats.errors.push({ type: 'machine', id: machine.id, error: error.message })
    }
  }
}

/**
 * Descargar imagen desde URL y subirla a Firebase Storage
 */
async function migrateImage(imageUrl, repuestoId, machineId, index) {
  try {
    // Descargar imagen del origen
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const buffer = await response.buffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    
    // Subir a Storage del destino
    const ext = contentType.split('/')[1] || 'jpg'
    const filename = `${repuestoId}_${index}.${ext}`
    const storagePath = `repuestos/${machineId}/${repuestoId}/${filename}`
    
    const fileRef = storage.bucket().file(storagePath)
    await fileRef.save(buffer, {
      metadata: {
        contentType,
        metadata: {
          repuestoId,
          machineId,
          originalUrl: imageUrl,
        }
      }
    })
    
    // Obtener URL pública
    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Fecha muy lejana
    })
    
    stats.images++
    return {
      url,
      storagePath,
      contentType,
      size: buffer.length,
      uploadedAt: new Date(),
    }
  } catch (error) {
    console.error(`    ⚠️  Error migrando imagen ${imageUrl}:`, error.message)
    stats.errors.push({ type: 'image', url: imageUrl, error: error.message })
    return null
  }
}

/**
 * Migrar vínculos de manuales con marcadores
 */
function migrateVinculos(vinculosOrigen) {
  if (!Array.isArray(vinculosOrigen)) return []
  
  return vinculosOrigen.map(v => {
    stats.vinculos++
    
    // Convertir coordenadas absolutas a normalizadas (si es necesario)
    let coordenadas = v.coordenadas
    if (coordenadas && !v.normalized) {
      // Asumiendo viewport de 800x1200 (ajustar según tu caso)
      coordenadas = {
        x: coordenadas.x / 800,
        y: coordenadas.y / 1200,
        width: coordenadas.width / 800,
        height: coordenadas.height / 1200,
      }
    }
    
    return {
      pdfUrl: v.pdfUrl || v.url,
      pagina: v.pagina || 1,
      coordenadas,
      puntos: v.puntos, // Para polígonos
      forma: v.forma || 'rectangulo',
      color: v.color || '#3b82f6',
      descripcion: v.descripcion || '',
      sinBorde: v.sinBorde || false,
    }
  })
}

/**
 * Migrar tags del formato antiguo al nuevo
 */
function migrateTags(tagsOrigen) {
  if (!Array.isArray(tagsOrigen)) return []
  
  return tagsOrigen.map(tag => {
    // Si ya es objeto con cantidad
    if (typeof tag === 'object' && tag.nombre) {
      return {
        nombre: tag.nombre,
        tipo: tag.tipo || 'stock',
        cantidad: tag.cantidad || 0,
        fecha: tag.fecha || new Date(),
      }
    }
    
    // Si es string simple
    return {
      nombre: tag,
      tipo: 'stock',
      cantidad: 1,
      fecha: new Date(),
    }
  })
}

/**
 * Migrar repuestos de una máquina
 */
async function migrateRepuestosForMachine(machineId, machineNombre) {
  console.log(`\n📋 Migrando repuestos de ${machineNombre}...`)
  
  try {
    // Aquí deberías conectarte al proyecto origen y obtener los repuestos
    // Por simplicidad, este ejemplo usa datos hardcodeados
    // En producción, usarías:
    // const repuestosOrigen = await fetchRepuestosFromOrigen(machineId)
    
    const repuestosOrigen = await fetchRepuestosFromOrigen(machineId)
    
    console.log(`  📦 ${repuestosOrigen.length} repuestos encontrados`)
    
    const batch = db.batch()
    let batchCount = 0
    
    for (const repOrigen of repuestosOrigen) {
      try {
        const repId = repOrigen.id || db.collection('machines').doc(machineId).collection('repuestos').doc().id
        const repRef = db.collection('machines').doc(machineId).collection('repuestos').doc(repId)
        
        // Migrar imágenes
        const imagenesManual = []
        const fotosReales = []
        
        if (Array.isArray(repOrigen.imagenesManual)) {
          for (let i = 0; i < repOrigen.imagenesManual.length; i++) {
            const img = repOrigen.imagenesManual[i]
            const migratedImg = await migrateImage(img.url, repId, machineId, `manual_${i}`)
            if (migratedImg) {
              imagenesManual.push({
                ...migratedImg,
                esPrincipal: img.esPrincipal || i === 0,
              })
            }
          }
        }
        
        if (Array.isArray(repOrigen.fotosReales)) {
          for (let i = 0; i < repOrigen.fotosReales.length; i++) {
            const img = repOrigen.fotosReales[i]
            const migratedImg = await migrateImage(img.url, repId, machineId, `real_${i}`)
            if (migratedImg) {
              fotosReales.push(migratedImg)
            }
          }
        }
        
        // Construir repuesto migrado
        const repuestoMigrado = {
          id: repId,
          codigoSAP: repOrigen.codigoSAP || '',
          textoBreve: repOrigen.textoBreve || '',
          descripcion: repOrigen.descripcion || '',
          nombreManual: repOrigen.nombreManual || '',
          codigoBaader: repOrigen.codigoBaader || repOrigen.codigoFabricante || '',
          
          // Cantidades legacy (mantener por compatibilidad)
          cantidadSolicitada: repOrigen.cantidadSolicitada || 0,
          cantidadStockBodega: repOrigen.cantidadStockBodega || 0,
          
          valorUnitario: repOrigen.valorUnitario || 0,
          total: repOrigen.total || 0,
          fechaUltimaActualizacionInventario: repOrigen.fechaUltimaActualizacionInventario || null,
          
          // Migrar tags al nuevo formato
          tags: migrateTags(repOrigen.tags),
          
          // Migrar vínculos con marcadores
          vinculosManual: migrateVinculos(repOrigen.vinculosManual || repOrigen.vinculos),
          
          // Imágenes migradas
          imagenesManual,
          fotosReales,
          
          createdAt: repOrigen.createdAt || new Date(),
          updatedAt: new Date(),
        }
        
        batch.set(repRef, repuestoMigrado)
        batchCount++
        
        // Ejecutar batch cada 500 operaciones
        if (batchCount >= 500) {
          await batch.commit()
          batchCount = 0
          console.log(`  💾 Batch de 500 repuestos guardado`)
        }
        
        stats.repuestos++
        console.log(`  ✅ ${repuestoMigrado.codigoSAP || repId}`)
        
      } catch (error) {
        console.error(`  ❌ Error migrando repuesto:`, error.message)
        stats.errors.push({ type: 'repuesto', id: repOrigen.id, error: error.message })
      }
    }
    
    // Ejecutar batch restante
    if (batchCount > 0) {
      await batch.commit()
    }
    
    console.log(`  ✅ ${stats.repuestos} repuestos migrados para ${machineNombre}`)
    
  } catch (error) {
    console.error(`  ❌ Error migrando ${machineNombre}:`, error.message)
    stats.errors.push({ type: 'machine_migration', id: machineId, error: error.message })
  }
}

/**
 * Obtener repuestos del proyecto origen
 * NOTA: Implementar según tu setup (puede ser via API, export JSON, o Firestore directo)
 */
async function fetchRepuestosFromOrigen(machineId) {
  // OPCIÓN 1: Leer desde archivo JSON exportado
  // const data = require(`../data/exports/${machineId}_repuestos.json`)
  // return data
  
  // OPCIÓN 2: Consultar Firestore del origen (requiere configurar segundo app)
  // const origenApp = initializeApp(origenConfig, 'origen')
  // const origenDb = getFirestore(origenApp)
  // const snapshot = await getDocs(collection(origenDb, 'repuestos', machineId))
  // return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  
  // OPCIÓN 3: API REST
  // const response = await fetch(`https://repuestos-app.com/api/repuestos/${machineId}`)
  // return await response.json()
  
  // Por ahora, retornar array vacío
  console.log(`  ⚠️  fetchRepuestosFromOrigen no implementada, retornando datos de ejemplo`)
  return []
}

/**
 * Ejecutar migración completa
 */
async function main() {
  console.log('🚀 Iniciando migración de Repuestos-App → mantenimiento-planta')
  console.log('='.repeat(60))
  
  const startTime = Date.now()
  
  try {
    // Paso 1: Crear máquinas
    await createMachines()
    
    // Paso 2: Migrar repuestos por máquina
    for (const machine of MACHINES) {
      await migrateRepuestosForMachine(machine.id, machine.nombre)
    }
    
    // Resumen final
    console.log('\n' + '='.repeat(60))
    console.log('📊 RESUMEN DE MIGRACIÓN')
    console.log('='.repeat(60))
    console.log(`✅ Máquinas creadas: ${stats.machines}`)
    console.log(`✅ Repuestos migrados: ${stats.repuestos}`)
    console.log(`✅ Imágenes migradas: ${stats.images}`)
    console.log(`✅ Vínculos PDF migrados: ${stats.vinculos}`)
    console.log(`❌ Errores encontrados: ${stats.errors.length}`)
    
    if (stats.errors.length > 0) {
      console.log('\n⚠️  ERRORES:')
      stats.errors.slice(0, 10).forEach(err => {
        console.log(`  - [${err.type}] ${err.id || err.url}: ${err.error}`)
      })
      if (stats.errors.length > 10) {
        console.log(`  ... y ${stats.errors.length - 10} errores más`)
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n⏱️  Tiempo total: ${duration}s`)
    console.log('\n✨ Migración completada!')
    
  } catch (error) {
    console.error('\n💥 Error fatal durante la migración:', error)
    process.exit(1)
  }
}

// Ejecutar
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error no capturado:', error)
    process.exit(1)
  })
