/**
 * Script de inicialización del sistema jerárquico
 * SOLO crea la empresa raíz - El usuario debe crear su propia estructura
 */

import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { HierarchyNode, HierarchyLevel, DEFAULT_COMPANY_NODE } from '../types/hierarchy'
import { logger } from '../lib/logger'

export async function initializeHierarchySystem(userId: string): Promise<void> {
  try {
    console.log('[hierarchyInit] 🚀 Iniciando sistema jerárquico para usuario:', userId)

    // SOLO crear empresa (Nivel 1) - El usuario debe crear el resto manualmente
    const empresaId = 'aquachile-chonchi'
    const empresa: Omit<HierarchyNode, 'id'> = {
      nombre: DEFAULT_COMPANY_NODE.nombre,
      codigo: DEFAULT_COMPANY_NODE.codigo,
      nivel: HierarchyLevel.EMPRESA,
      parentId: null,
      path: [],
      orden: 1,
      activo: true,
      descripcion: DEFAULT_COMPANY_NODE.descripcion,
      metadata: DEFAULT_COMPANY_NODE.metadata,
      creadoPor: userId,
      creadoEn: Timestamp.now(),
      actualizadoEn: Timestamp.now(),
    }

    console.log('[hierarchyInit] 📝 Creando empresa root:', empresaId)
    await setDoc(doc(db, 'hierarchy', empresaId), empresa)
    console.log('[hierarchyInit] ✅ Empresa creada:', empresaId)
    console.log('[hierarchyInit] ℹ️ El usuario debe crear Áreas, Sub-áreas y Sistemas manualmente')

    logger.info('Hierarchy system initialized with root company only')
  } catch (error) {
    console.error('[hierarchyInit] ❌ Error fatal durante inicialización:', error)
    logger.error('Failed to initialize hierarchy system', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Verificar si el sistema ya está inicializado
 */
export async function isHierarchyInitialized(): Promise<boolean> {
  try {
    const empresaDoc = await import('firebase/firestore').then(({ getDoc, doc }) =>
      getDoc(doc(db, 'hierarchy', 'aquachile-chonchi'))
    )
    return empresaDoc.exists()
  } catch (error) {
    return false
  }
}
