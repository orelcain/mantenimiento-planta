/**
 * Script de inicialización del sistema jerárquico
 * Crea la estructura base de Aquachile Antarfood Chonchi
 */

import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { HierarchyNode, HierarchyLevel, DEFAULT_COMPANY_NODE } from '../types/hierarchy'
import { logger } from '../lib/logger'

export async function initializeHierarchySystem(userId: string): Promise<void> {
  try {
    logger.info('Initializing hierarchy system...')

    // 1. Crear empresa (Nivel 1)
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

    await setDoc(doc(db, 'hierarchy', empresaId), empresa)
    logger.info('Empresa root created', { empresaId })

    // 2. Crear áreas principales (Nivel 2)
    const areas = [
      {
        id: 'area-produccion',
        nombre: 'Producción',
        codigo: 'PROD-001',
        descripcion: 'Área de procesamiento y producción principal',
      },
      {
        id: 'area-almacenamiento',
        nombre: 'Almacenamiento y Logística',
        codigo: 'ALM-001',
        descripcion: 'Gestión de inventario y despacho',
      },
      {
        id: 'area-mantenimiento',
        nombre: 'Mantenimiento',
        codigo: 'MAN-001',
        descripcion: 'Talleres y gestión de equipos',
      },
      {
        id: 'area-calidad',
        nombre: 'Control de Calidad',
        codigo: 'CAL-001',
        descripcion: 'Laboratorios y aseguramiento de calidad',
      },
    ]

    for (let i = 0; i < areas.length; i++) {
      const area = areas[i]
      const areaNode: Omit<HierarchyNode, 'id'> = {
        nombre: area.nombre,
        codigo: area.codigo,
        nivel: HierarchyLevel.AREA,
        parentId: empresaId,
        path: [empresaId],
        orden: i + 1,
        activo: true,
        descripcion: area.descripcion,
        creadoPor: userId,
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      }

      await setDoc(doc(db, 'hierarchy', area.id), areaNode)
      logger.info('Area created', { areaId: area.id })
    }

    // 3. Crear sub-áreas de ejemplo en Producción (Nivel 3)
    const subAreas = [
      {
        id: 'subarea-prod-proceso',
        nombre: 'Proceso',
        codigo: 'PROD-001-PRO',
        parentId: 'area-produccion',
        descripcion: 'Línea de procesamiento principal',
      },
      {
        id: 'subarea-prod-empaque',
        nombre: 'Empaque',
        codigo: 'PROD-001-EMP',
        parentId: 'area-produccion',
        descripcion: 'Zona de embalaje y etiquetado',
      },
      {
        id: 'subarea-prod-congelacion',
        nombre: 'Congelación',
        codigo: 'PROD-001-CON',
        parentId: 'area-produccion',
        descripcion: 'Cámaras de congelación rápida',
      },
    ]

    for (let i = 0; i < subAreas.length; i++) {
      const subArea = subAreas[i]
      const subAreaNode: Omit<HierarchyNode, 'id'> = {
        nombre: subArea.nombre,
        codigo: subArea.codigo,
        nivel: HierarchyLevel.SUB_AREA,
        parentId: subArea.parentId,
        path: [empresaId, subArea.parentId],
        orden: i + 1,
        activo: true,
        descripcion: subArea.descripcion,
        creadoPor: userId,
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      }

      await setDoc(doc(db, 'hierarchy', subArea.id), subAreaNode)
      logger.info('Sub-area created', { subAreaId: subArea.id })
    }

    // 4. Crear sistemas de ejemplo (Nivel 4)
    const sistemas = [
      {
        id: 'sistema-refrigeracion',
        nombre: 'Sistema de Refrigeración',
        codigo: 'PROD-001-CON-SRF',
        parentId: 'subarea-prod-congelacion',
        descripcion: 'Compresores y circuito de frío',
      },
      {
        id: 'sistema-electrico',
        nombre: 'Sistema Eléctrico',
        codigo: 'PROD-001-CON-ELE',
        parentId: 'subarea-prod-congelacion',
        descripcion: 'Panel eléctrico y distribución',
      },
    ]

    for (let i = 0; i < sistemas.length; i++) {
      const sistema = sistemas[i]
      const sistemaNode: Omit<HierarchyNode, 'id'> = {
        nombre: sistema.nombre,
        codigo: sistema.codigo,
        nivel: HierarchyLevel.SISTEMA,
        parentId: sistema.parentId,
        path: [empresaId, 'area-produccion', sistema.parentId],
        orden: i + 1,
        activo: true,
        descripcion: sistema.descripcion,
        creadoPor: userId,
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      }

      await setDoc(doc(db, 'hierarchy', sistema.id), sistemaNode)
      logger.info('Sistema created', { sistemaId: sistema.id })
    }

    logger.info('Hierarchy system initialization completed successfully')
  } catch (error) {
    logger.error('Failed to initialize hierarchy system', error)
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
