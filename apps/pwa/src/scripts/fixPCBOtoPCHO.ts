/**
 * Script para corregir PCBO → PCHO en Firestore
 * Ejecutar desde SettingsPage o consola del navegador
 */

import { collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

export async function fixPCBOtoPCHO(): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    logger.info('🔧 Iniciando corrección PCBO → PCHO en Firestore...')
    
    const hierarchyRef = collection(db, 'hierarchy')
    const snapshot = await getDocs(hierarchyRef)
    
    const batch = writeBatch(db)
    let updateCount = 0
    
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data()
      let needsUpdate = false
      const updates: Record<string, string> = {}
      
      // Corregir código
      if (data.codigo && data.codigo.includes('PCBO')) {
        updates.codigo = data.codigo.replace(/PCBO/g, 'PCHO')
        needsUpdate = true
      }
      
      // Corregir padre
      if (data.padre && data.padre.includes('PCBO')) {
        updates.padre = data.padre.replace(/PCBO/g, 'PCHO')
        needsUpdate = true
      }
      
      if (needsUpdate) {
        batch.update(doc(db, 'hierarchy', docSnap.id), updates)
        updateCount++
        logger.info(`📝 Actualizando: ${data.codigo} → ${updates.codigo || data.codigo}`)
      }
    })
    
    if (updateCount > 0) {
      await batch.commit()
      logger.info(`✅ Corrección completada: ${updateCount} nodos actualizados`)
      return { success: true, updated: updateCount }
    } else {
      logger.info('ℹ️ No se encontraron nodos con PCBO')
      return { success: true, updated: 0 }
    }
    
  } catch (error) {
    logger.error('❌ Error al corregir PCBO → PCHO:', error instanceof Error ? error : new Error(String(error)))
    return { 
      success: false, 
      updated: 0, 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }
  }
}

// Función helper para ejecutar desde consola
if (typeof window !== 'undefined') {
  (window as any).fixPCBOtoPCHO = fixPCBOtoPCHO
}
