/**
 * isometricMapService — CRUD para mapas isométricos + datos demo
 * 
 * Colección Firestore: `isometricMaps`
 * Cada documento es un layout de planta con nodos, conectores y áreas.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'
import { setDoc, updateDoc, deleteDoc } from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import type {
  IsometricMap,
  IsometricMapConfig,
  MapNode,
  MapConnector,
  MapArea,
  NodeRuntimeData,
} from '@/types/isometricMap'
import { DEFAULT_MAP_CONFIG } from '@/types/isometricMap'

const COLLECTION = 'isometricMaps'

// ============================================================
// CRUD
// ============================================================

/** Obtener todos los mapas */
export async function getIsometricMaps(): Promise<IsometricMap[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy('updatedAt', 'desc'),
      limit(20)
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as IsometricMap[]
  } catch (error) {
    logger.error('Error fetching isometric maps', error as Error)
    return []
  }
}

/** Obtener un mapa por ID */
export async function getIsometricMap(mapId: string): Promise<IsometricMap | null> {
  try {
    const docRef = doc(db, COLLECTION, mapId)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as IsometricMap
  } catch (error) {
    logger.error('Error fetching isometric map', error as Error)
    return null
  }
}

/** Guardar/actualizar un mapa */
export async function saveIsometricMap(
  mapData: Omit<IsometricMap, 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION, mapData.id)
    const existing = await getDoc(docRef)

    if (existing.exists()) {
      await updateDoc(docRef, {
        ...mapData,
        updatedAt: serverTimestamp(),
      })
    } else {
      await setDoc(docRef, {
        ...mapData,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    logger.info(`Isometric map saved: ${mapData.id}`)
  } catch (error) {
    logger.error('Error saving isometric map', error as Error)
    throw error
  }
}

/** Eliminar un mapa */
export async function deleteIsometricMap(mapId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, mapId))
    logger.info(`Isometric map deleted: ${mapId}`)
  } catch (error) {
    logger.error('Error deleting isometric map', error as Error)
    throw error
  }
}

// ============================================================
// DEMO DATA — Planta ETT ejemplo
// ============================================================

/** 
 * Genera un mapa demo completo de una planta industrial
 * con bombas, motores, tanques, sensores, transportadores, etc.
 */
export function generateDemoMap(): {
  config: IsometricMapConfig
  nodes: MapNode[]
  connectors: MapConnector[]
  areas: MapArea[]
} {
  const config: IsometricMapConfig = {
    ...DEFAULT_MAP_CONFIG,
    width: 60,
    depth: 40,
  }

  // ── Áreas (zonas lógicas) ──
  const areas: MapArea[] = [
    {
      id: 'area-bombas',
      label: 'Sala de Bombas',
      position: { x: -18, z: -10 },
      size: { width: 18, depth: 14 },
      color: '#3b82f6',
      opacity: 0.08,
    },
    {
      id: 'area-tanques',
      label: 'Tanques de Almacenamiento',
      position: { x: 10, z: -10 },
      size: { width: 16, depth: 14 },
      color: '#06b6d4',
      opacity: 0.08,
    },
    {
      id: 'area-proceso',
      label: 'Zona de Proceso',
      position: { x: -5, z: 8 },
      size: { width: 30, depth: 16 },
      color: '#f59e0b',
      opacity: 0.08,
    },
    {
      id: 'area-compresores',
      label: 'Compresores',
      position: { x: 22, z: 8 },
      size: { width: 12, depth: 10 },
      color: '#ec4899',
      opacity: 0.08,
    },
    {
      id: 'area-oficinas',
      label: 'Oficinas / Control',
      position: { x: -24, z: 12 },
      size: { width: 10, depth: 10 },
      color: '#78716c',
      opacity: 0.08,
    },
  ]

  // ── Nodos (equipos) ──
  const nodes: MapNode[] = [
    // Sala de Bombas
    {
      id: 'pump-01',
      label: 'Bomba P-101',
      type: 'pump',
      position: { x: -22, y: 0, z: -14 },
      size: { width: 2, height: 1.5, depth: 1.5 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'equipment',
      linkedEntityId: 'pump-p101',
    },
    {
      id: 'pump-02',
      label: 'Bomba P-102',
      type: 'pump',
      position: { x: -22, y: 0, z: -10 },
      size: { width: 2, height: 1.5, depth: 1.5 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'equipment',
      linkedEntityId: 'pump-p102',
    },
    {
      id: 'pump-03',
      label: 'Bomba P-103',
      type: 'pump',
      position: { x: -22, y: 0, z: -6 },
      size: { width: 2, height: 1.5, depth: 1.5 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'equipment',
      linkedEntityId: 'pump-p103',
    },
    {
      id: 'motor-01',
      label: 'Motor M-101',
      type: 'motor',
      position: { x: -18, y: 0, z: -14 },
      size: { width: 1.5, height: 1.2, depth: 1 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'equipment',
      linkedEntityId: 'motor-m101',
    },
    {
      id: 'motor-02',
      label: 'Motor M-102',
      type: 'motor',
      position: { x: -18, y: 0, z: -10 },
      size: { width: 1.5, height: 1.2, depth: 1 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'equipment',
      linkedEntityId: 'motor-m102',
    },
    {
      id: 'motor-03',
      label: 'Motor M-103',
      type: 'motor',
      position: { x: -18, y: 0, z: -6 },
      size: { width: 1.5, height: 1.2, depth: 1 },
      rotation: 0,
      visible: true,
    },

    // Válvulas de salida
    {
      id: 'valve-01',
      label: 'V-201',
      type: 'valve',
      position: { x: -14, y: 0, z: -14 },
      size: { width: 0.8, height: 1, depth: 0.8 },
      rotation: 0,
      visible: true,
    },
    {
      id: 'valve-02',
      label: 'V-202',
      type: 'valve',
      position: { x: -14, y: 0, z: -10 },
      size: { width: 0.8, height: 1, depth: 0.8 },
      rotation: 0,
      visible: true,
    },

    // Tanques
    {
      id: 'tank-01',
      label: 'Tanque TK-301',
      type: 'tank',
      position: { x: 6, y: 0, z: -12 },
      size: { width: 4, height: 6, depth: 4 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'equipment',
      linkedEntityId: 'tank-tk301',
    },
    {
      id: 'tank-02',
      label: 'Tanque TK-302',
      type: 'tank',
      position: { x: 14, y: 0, z: -12 },
      size: { width: 4, height: 5, depth: 4 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'equipment',
      linkedEntityId: 'tank-tk302',
    },
    {
      id: 'tank-03',
      label: 'Tanque TK-303',
      type: 'tank',
      position: { x: 10, y: 0, z: -6 },
      size: { width: 3, height: 4, depth: 3 },
      rotation: 0,
      visible: true,
    },

    // Sensores de tanque
    {
      id: 'sensor-01',
      label: 'Nivel TK-301',
      type: 'sensor',
      position: { x: 8.5, y: 0, z: -12 },
      size: { width: 0.5, height: 2, depth: 0.5 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'iotDevice',
      linkedEntityId: 'esp32-nivel-tk301',
    },
    {
      id: 'sensor-02',
      label: 'Temp TK-302',
      type: 'sensor',
      position: { x: 16.5, y: 0, z: -12 },
      size: { width: 0.5, height: 2, depth: 0.5 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'iotDevice',
      linkedEntityId: 'esp32-temp-tk302',
    },

    // Zona de Proceso
    {
      id: 'conveyor-01',
      label: 'Transportador C-401',
      type: 'conveyor',
      position: { x: -10, y: 0, z: 6 },
      size: { width: 10, height: 1.2, depth: 1.5 },
      rotation: 0,
      visible: true,
    },
    {
      id: 'conveyor-02',
      label: 'Transportador C-402',
      type: 'conveyor',
      position: { x: 5, y: 0, z: 6 },
      size: { width: 8, height: 1.2, depth: 1.5 },
      rotation: 0,
      visible: true,
    },
    {
      id: 'motor-04',
      label: 'Motor M-401',
      type: 'motor',
      position: { x: -16, y: 0, z: 6 },
      size: { width: 1.5, height: 1.5, depth: 1.2 },
      rotation: 90,
      visible: true,
    },

    // Sensores de proceso
    {
      id: 'sensor-03',
      label: 'Vibración M-401',
      type: 'sensor',
      position: { x: -16, y: 0, z: 8 },
      size: { width: 0.5, height: 1.5, depth: 0.5 },
      rotation: 0,
      visible: true,
      linkedEntityType: 'iotDevice',
    },
    {
      id: 'sensor-04',
      label: 'Temp Proceso',
      type: 'sensor',
      position: { x: -2, y: 0, z: 10 },
      size: { width: 0.5, height: 1.8, depth: 0.5 },
      rotation: 0,
      visible: true,
    },
    {
      id: 'sensor-05',
      label: 'Presión Proceso',
      type: 'sensor',
      position: { x: 5, y: 0, z: 10 },
      size: { width: 0.5, height: 1.8, depth: 0.5 },
      rotation: 0,
      visible: true,
    },

    // Compresores
    {
      id: 'compressor-01',
      label: 'Compresor K-501',
      type: 'compressor',
      position: { x: 20, y: 0, z: 6 },
      size: { width: 3, height: 2.5, depth: 2 },
      rotation: 0,
      visible: true,
    },
    {
      id: 'compressor-02',
      label: 'Compresor K-502',
      type: 'compressor',
      position: { x: 24, y: 0, z: 6 },
      size: { width: 3, height: 2.5, depth: 2 },
      rotation: 0,
      visible: true,
    },
    {
      id: 'sensor-06',
      label: 'Presión K-501',
      type: 'sensor',
      position: { x: 20, y: 0, z: 10 },
      size: { width: 0.5, height: 1.5, depth: 0.5 },
      rotation: 0,
      visible: true,
    },

    // Tuberías principales
    {
      id: 'pipe-main-01',
      label: 'Tubería Principal',
      type: 'pipe',
      position: { x: -5, y: 1.5, z: -3 },
      size: { width: 20, height: 0.5, depth: 0.5 },
      rotation: 0,
      visible: true,
    },

    // Edificio de control
    {
      id: 'building-01',
      label: 'Sala de Control',
      type: 'building',
      position: { x: -24, y: 0, z: 12 },
      size: { width: 8, height: 4, depth: 8 },
      rotation: 0,
      visible: true,
    },
  ]

  // ── Conectores ──
  const connectors: MapConnector[] = [
    // Bombas → Válvulas
    {
      id: 'conn-p101-v201',
      fromNodeId: 'pump-01',
      toNodeId: 'valve-01',
      style: 'pipe',
      animated: false,
    },
    {
      id: 'conn-p102-v202',
      fromNodeId: 'pump-02',
      toNodeId: 'valve-02',
      style: 'pipe',
      animated: false,
    },
    // Motor → Bomba (cable)
    {
      id: 'conn-m101-p101',
      fromNodeId: 'motor-01',
      toNodeId: 'pump-01',
      style: 'cable',
      animated: false,
    },
    {
      id: 'conn-m102-p102',
      fromNodeId: 'motor-02',
      toNodeId: 'pump-02',
      style: 'cable',
      animated: false,
    },
    {
      id: 'conn-m103-p103',
      fromNodeId: 'motor-03',
      toNodeId: 'pump-03',
      style: 'cable',
      animated: false,
    },
    // Válvulas → Tanques (flujo)
    {
      id: 'conn-v201-tk301',
      fromNodeId: 'valve-01',
      toNodeId: 'tank-01',
      style: 'flow',
      animated: true,
    },
    {
      id: 'conn-v202-tk302',
      fromNodeId: 'valve-02',
      toNodeId: 'tank-02',
      style: 'flow',
      animated: true,
    },
    // Motor proceso → Transportador
    {
      id: 'conn-m401-c401',
      fromNodeId: 'motor-04',
      toNodeId: 'conveyor-01',
      style: 'cable',
      animated: false,
    },
    // Sensores → señal
    {
      id: 'conn-s01-tk301',
      fromNodeId: 'sensor-01',
      toNodeId: 'tank-01',
      style: 'signal',
      animated: true,
    },
    {
      id: 'conn-s02-tk302',
      fromNodeId: 'sensor-02',
      toNodeId: 'tank-02',
      style: 'signal',
      animated: true,
    },
  ]

  return { config, nodes, connectors, areas }
}

/** 
 * Genera datos runtime demo (estados, incidencias simuladas)
 * Simula operación real con variaciones
 */
export function generateDemoRuntimeData(nodes: MapNode[]): Map<string, NodeRuntimeData> {
  const data = new Map<string, NodeRuntimeData>()

  for (const node of nodes) {
    const runtime: NodeRuntimeData = {
      nodeId: node.id,
      status: 'ok',
      activeIncidents: 0,
    }

    // Simular estados según el tipo
    switch (node.id) {
      case 'pump-02':
        runtime.status = 'warning'
        runtime.activeIncidents = 1
        break
      case 'motor-03':
        runtime.status = 'critical'
        runtime.activeIncidents = 2
        break
      case 'compressor-02':
        runtime.status = 'maintenance'
        break
      case 'sensor-03':
        runtime.status = 'offline'
        break
      case 'conveyor-02':
        runtime.status = 'warning'
        runtime.activeIncidents = 1
        break
    }

    // Simular valores de sensores
    if (node.type === 'sensor') {
      switch (node.id) {
        case 'sensor-01':
          runtime.sensorValue = 78
          runtime.sensorUnit = '%'
          break
        case 'sensor-02':
          runtime.sensorValue = 42
          runtime.sensorUnit = '°C'
          break
        case 'sensor-03':
          runtime.sensorValue = undefined // offline
          break
        case 'sensor-04':
          runtime.sensorValue = 85
          runtime.sensorUnit = '°C'
          break
        case 'sensor-05':
          runtime.sensorValue = 3.2
          runtime.sensorUnit = ' bar'
          break
        case 'sensor-06':
          runtime.sensorValue = 8.5
          runtime.sensorUnit = ' bar'
          break
      }
    }

    data.set(node.id, runtime)
  }

  return data
}
