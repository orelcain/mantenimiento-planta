/**
 * Script para marcar la estructura de jerarquía actual como "base"
 * 
 * Establece isBaseStructure=true y baseStructureDate para todos los nodos existentes
 * para poder diferenciar la estructura base de futuras expansiones.
 * 
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccount.json"
 *   node scripts/mark_base_hierarchy.js [--dry-run]
 */

const admin = require('firebase-admin')

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  })
}

const db = admin.firestore()
const HIERARCHY_COLLECTION = 'hierarchy'

// Parse argumentos
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

async function main() {
  console.log('=== Marcar Estructura Base de Jerarquía ===')
  console.log(`Modo: ${dryRun ? 'DRY RUN (no escribe)' : 'PRODUCCIÓN (escribe a Firestore)'}`)
  console.log('')

  try {
    // Obtener todos los nodos de jerarquía
    const snapshot = await db.collection(HIERARCHY_COLLECTION).get()
    
    if (snapshot.empty) {
      console.log('⚠️  No se encontraron nodos en la colección hierarchy')
      return
    }

    console.log(`📊 Total de nodos encontrados: ${snapshot.size}`)
    console.log('')

    // Fecha base para todos los nodos actuales (hoy)
    const baseStructureDate = admin.firestore.Timestamp.now()
    console.log(`📅 Fecha de estructura base: ${baseStructureDate.toDate().toISOString()}`)
    console.log('')

    let updated = 0
    let skipped = 0

    const batch = db.batch()

    for (const doc of snapshot.docs) {
      const data = doc.data()
      
      // Solo actualizar si no tiene ya el campo isBaseStructure
      if (data.isBaseStructure === undefined) {
        const ref = db.collection(HIERARCHY_COLLECTION).doc(doc.id)
        
        if (!dryRun) {
          batch.update(ref, {
            isBaseStructure: true,
            baseStructureDate: baseStructureDate,
          })
        }
        
        updated++
        
        if (updated % 10 === 0) {
          console.log(`✓ Procesados ${updated} nodos...`)
        }
      } else {
        skipped++
      }
    }

    console.log('')
    console.log('=== Resumen ===')
    console.log(`Total nodos: ${snapshot.size}`)
    console.log(`Nodos actualizados: ${updated}`)
    console.log(`Nodos omitidos (ya marcados): ${skipped}`)
    console.log('')

    if (!dryRun && updated > 0) {
      console.log('💾 Guardando cambios en Firestore...')
      await batch.commit()
      console.log('✅ Cambios guardados exitosamente')
    } else if (dryRun && updated > 0) {
      console.log('🔍 DRY RUN: No se guardaron cambios')
      console.log('   Ejecuta sin --dry-run para aplicar cambios')
    } else {
      console.log('✅ Todos los nodos ya estaban marcados')
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
  .then(() => {
    console.log('')
    console.log('✅ Script completado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error)
    process.exit(1)
  })
