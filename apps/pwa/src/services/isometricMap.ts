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
  TerrainTile,
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
 * Genera el mapa real de Planta Chonchi (AQ-IN-CHO)
 * Layout basado en la jerarquía de ubicación técnica con zonas y equipos principales.
 * Mapa 160m × 120m que incluye: Planta Principal, Exteriores, Acopio y Planta Yal.
 */
export function generateDemoMap(): {
  config: IsometricMapConfig
  nodes: MapNode[]
  connectors: MapConnector[]
  areas: MapArea[]
  terrain: TerrainTile[]
} {
  const config: IsometricMapConfig = {
    ...DEFAULT_MAP_CONFIG,
    width: 160,
    depth: 120,
  }

  // ═══════════════════════════════════════════════════════
  // ÁREAS — Zonas lógicas del recinto
  // ═══════════════════════════════════════════════════════
  const areas: MapArea[] = [
    // ── PLANTA PRINCIPAL (PCHO-PROC) ──
    {
      id: 'area-proceso',
      label: 'PROCESO',
      position: { x: -30, z: -15 },
      size: { width: 55, depth: 30 },
      color: '#f59e0b',
      opacity: 0.06,
    },
    {
      id: 'area-ingreso-mp',
      label: 'Ingreso MP',
      position: { x: -28, z: -8 },
      size: { width: 10, depth: 10 },
      color: '#84cc16',
      opacity: 0.08,
    },
    {
      id: 'area-sacrificio',
      label: 'Sacrificio',
      position: { x: -18, z: -8 },
      size: { width: 10, depth: 10 },
      color: '#ef4444',
      opacity: 0.08,
    },
    {
      id: 'area-eviscerado',
      label: 'Eviscerado',
      position: { x: -8, z: -8 },
      size: { width: 10, depth: 10 },
      color: '#f97316',
      opacity: 0.08,
    },
    {
      id: 'area-filete',
      label: 'Filete',
      position: { x: 2, z: -8 },
      size: { width: 8, depth: 10 },
      color: '#a855f7',
      opacity: 0.08,
    },
    {
      id: 'area-emparrillado',
      label: 'Emparrillado / Grader',
      position: { x: -18, z: 4 },
      size: { width: 12, depth: 8 },
      color: '#06b6d4',
      opacity: 0.08,
    },
    {
      id: 'area-empaque',
      label: 'Empaque',
      position: { x: -6, z: 4 },
      size: { width: 12, depth: 8 },
      color: '#8b5cf6',
      opacity: 0.08,
    },
    {
      id: 'area-sellado',
      label: 'Sellado',
      position: { x: 6, z: 4 },
      size: { width: 8, depth: 8 },
      color: '#ec4899',
      opacity: 0.08,
    },
    {
      id: 'area-lavado',
      label: 'Lavado Carros',
      position: { x: 14, z: -8 },
      size: { width: 8, depth: 8 },
      color: '#0ea5e9',
      opacity: 0.08,
    },

    // ── TÚNELES (al sur del proceso) ──
    {
      id: 'area-tuneles',
      label: 'TÚNELES CONGELACIÓN',
      position: { x: -25, z: -35 },
      size: { width: 45, depth: 16 },
      color: '#3b82f6',
      opacity: 0.06,
    },

    // ── FRIGORÍFICO (este del proceso) ──
    {
      id: 'area-frigorifico',
      label: 'FRIGORÍFICO',
      position: { x: 25, z: -15 },
      size: { width: 25, depth: 30 },
      color: '#06b6d4',
      opacity: 0.06,
    },
    {
      id: 'area-camaras',
      label: 'Cámaras Frío',
      position: { x: 27, z: -12 },
      size: { width: 12, depth: 20 },
      color: '#22d3ee',
      opacity: 0.08,
    },
    {
      id: 'area-antecamara',
      label: 'Antecámara',
      position: { x: 40, z: -12 },
      size: { width: 8, depth: 12 },
      color: '#67e8f9',
      opacity: 0.08,
    },
    {
      id: 'area-embarque',
      label: 'Andén Embarque',
      position: { x: 40, z: 2 },
      size: { width: 8, depth: 12 },
      color: '#a78bfa',
      opacity: 0.08,
    },

    // ── EXTERIORES PLANTA PRINCIPAL ──
    {
      id: 'area-sala-maquinas',
      label: 'Sala de Máquinas',
      position: { x: -35, z: -45 },
      size: { width: 15, depth: 10 },
      color: '#f59e0b',
      opacity: 0.08,
    },
    {
      id: 'area-sala-freon',
      label: 'Sala de Freon',
      position: { x: -18, z: -45 },
      size: { width: 14, depth: 10 },
      color: '#0ea5e9',
      opacity: 0.08,
    },
    {
      id: 'area-subestacion',
      label: 'Subestación Principal',
      position: { x: -2, z: -45 },
      size: { width: 10, depth: 8 },
      color: '#eab308',
      opacity: 0.08,
    },
    {
      id: 'area-caldera',
      label: 'Sala de Caldera',
      position: { x: 10, z: -45 },
      size: { width: 8, depth: 8 },
      color: '#dc2626',
      opacity: 0.08,
    },
    {
      id: 'area-taller',
      label: 'Taller Mantención',
      position: { x: -42, z: -25 },
      size: { width: 10, depth: 12 },
      color: '#78716c',
      opacity: 0.08,
    },
    {
      id: 'area-bodega',
      label: 'Bodega Materiales',
      position: { x: -42, z: -12 },
      size: { width: 10, depth: 10 },
      color: '#a8a29e',
      opacity: 0.08,
    },
    {
      id: 'area-carga-camiones',
      label: 'Carga Camiones',
      position: { x: -42, z: 0 },
      size: { width: 10, depth: 10 },
      color: '#84cc16',
      opacity: 0.08,
    },

    // ── PATIO Y SERVICIOS EXTERIORES ──
    {
      id: 'area-admin',
      label: 'Edificio Administrativo',
      position: { x: -42, z: 18 },
      size: { width: 14, depth: 8 },
      color: '#78716c',
      opacity: 0.08,
    },
    {
      id: 'area-casino',
      label: 'Casino',
      position: { x: -26, z: 18 },
      size: { width: 10, depth: 6 },
      color: '#f97316',
      opacity: 0.08,
    },
    {
      id: 'area-porteria',
      label: 'Portería',
      position: { x: -50, z: 25 },
      size: { width: 6, depth: 4 },
      color: '#94a3b8',
      opacity: 0.1,
    },
    {
      id: 'area-almacen-aguas',
      label: 'Almacenamiento Aguas',
      position: { x: 20, z: 20 },
      size: { width: 18, depth: 12 },
      color: '#0284c7',
      opacity: 0.08,
    },
    {
      id: 'area-riles',
      label: 'Planta RILES',
      position: { x: 42, z: 20 },
      size: { width: 16, depth: 14 },
      color: '#059669',
      opacity: 0.08,
    },
    {
      id: 'area-red-incendio',
      label: 'Red de Incendio',
      position: { x: 10, z: 30 },
      size: { width: 8, depth: 6 },
      color: '#ef4444',
      opacity: 0.08,
    },

    // ── ACOPIO (pontón flotante, zona separada) ──
    {
      id: 'area-acopio',
      label: 'ACOPIO (Pontón)',
      position: { x: 55, z: -40 },
      size: { width: 22, depth: 20 },
      color: '#10b981',
      opacity: 0.06,
    },

    // ── PLANTA YAL (edificio separado) ──
    {
      id: 'area-planta-yal',
      label: 'PLANTA YAL',
      position: { x: 55, z: -5 },
      size: { width: 24, depth: 22 },
      color: '#a855f7',
      opacity: 0.06,
    },
  ]

  // ═══════════════════════════════════════════════════════
  // NODOS — Equipos principales por zona
  // ═══════════════════════════════════════════════════════
  const nodes: MapNode[] = [

    // ━━━━━━━━━ INGRESO MATERIA PRIMA ━━━━━━━━━
    {
      id: 'chiller-mp', label: 'Chiller Ingreso', type: 'tank',
      position: { x: -26, y: 0, z: -6 }, size: { width: 3, height: 3, depth: 2.5 },
      rotation: 0, visible: true, color: '#06b6d4',
      linkedEntityType: 'equipment', linkedEntityId: '720004402',
    },
    {
      id: 'ext-cosecha-1', label: 'Extractor Cosecha 1', type: 'extractor',
      position: { x: -22, y: 0, z: -2 }, size: { width: 1.2, height: 1.8, depth: 1.2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004519',
    },
    {
      id: 'ext-cosecha-2', label: 'Extractor Cosecha 2', type: 'extractor',
      position: { x: -24, y: 0, z: -2 }, size: { width: 1.2, height: 1.8, depth: 1.2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004520',
    },

    // ━━━━━━━━━ SACRIFICIO ━━━━━━━━━
    {
      id: 'desangrador', label: 'Desangrador', type: 'conveyor',
      position: { x: -16, y: 0, z: -6 }, size: { width: 4, height: 1.2, depth: 1.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004408',
    },
    {
      id: 'cinta-marel-sacr', label: 'Cinta Aceleración Marel', type: 'conveyor',
      position: { x: -12, y: 0, z: -6 }, size: { width: 3, height: 1, depth: 1.2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004432',
    },

    // ━━━━━━━━━ EVISCERADO ━━━━━━━━━
    {
      id: 'baader142-n1', label: 'Baader 142 N1', type: 'generic',
      position: { x: -6, y: 0, z: -6 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#f97316',
      linkedEntityType: 'equipment', linkedEntityId: '720004441',
    },
    {
      id: 'baader142-n2', label: 'Baader 142 N2', type: 'generic',
      position: { x: -6, y: 0, z: -3 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#f97316',
      linkedEntityType: 'equipment', linkedEntityId: '720004447',
    },
    {
      id: 'baader142-n3', label: 'Baader 142 N3', type: 'generic',
      position: { x: -6, y: 0, z: 0 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#f97316',
      linkedEntityType: 'equipment', linkedEntityId: '720004453',
    },
    {
      id: 'bomba-vacio-evis-1', label: 'Bomba Vacío Eviscerado N1', type: 'pump',
      position: { x: -3, y: 0, z: -6 }, size: { width: 1.5, height: 1.2, depth: 1 },
      rotation: 90, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004445',
    },
    {
      id: 'cinta-elev-clasif', label: 'Cinta Elevadora Clasificado', type: 'conveyor',
      position: { x: -2, y: 0, z: -2 }, size: { width: 3, height: 1.5, depth: 1.2 },
      rotation: 90, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004423',
    },

    // ━━━━━━━━━ FILETE ━━━━━━━━━
    {
      id: 'volcador-bins', label: 'Volcador Bins', type: 'generic',
      position: { x: 3, y: 0, z: -6 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#84cc16',
      linkedEntityType: 'equipment', linkedEntityId: '720004411',
    },
    {
      id: 'baader200', label: 'Baader 200', type: 'generic',
      position: { x: 6, y: 0, z: -6 }, size: { width: 2, height: 2, depth: 2 },
      rotation: 0, visible: true, color: '#22c55e',
      linkedEntityType: 'equipment', linkedEntityId: '720004417',
    },
    {
      id: 'cinta-filete', label: 'Cinta Salida Filete', type: 'conveyor',
      position: { x: 6, y: 0, z: -3 }, size: { width: 4, height: 0.8, depth: 1 },
      rotation: 90, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004420',
    },

    // ━━━━━━━━━ EMPARRILLADO / GRADER ━━━━━━━━━
    {
      id: 'static-grader', label: 'Balanza Estática Grader', type: 'conveyor',
      position: { x: -16, y: 0, z: 6 }, size: { width: 5, height: 1.5, depth: 2 },
      rotation: 0, visible: true, color: '#06b6d4',
      linkedEntityType: 'equipment', linkedEntityId: '720004462',
    },
    {
      id: 'cinta-flippers', label: 'Cinta Flippers Clasificado', type: 'conveyor',
      position: { x: -10, y: 0, z: 6 }, size: { width: 4, height: 1, depth: 1.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004472',
    },

    // ━━━━━━━━━ EMPAQUE ━━━━━━━━━
    {
      id: 'epack', label: 'Empacadora E-Pack', type: 'generic',
      position: { x: -4, y: 0, z: 6 }, size: { width: 2.5, height: 2, depth: 2 },
      rotation: 0, visible: true, color: '#8b5cf6',
      linkedEntityType: 'equipment', linkedEntityId: '720004590',
    },
    {
      id: 'glaseador', label: 'Glaseador Automático', type: 'generic',
      position: { x: -1, y: 0, z: 6 }, size: { width: 2, height: 1.5, depth: 1.5 },
      rotation: 0, visible: true, color: '#0ea5e9',
      linkedEntityType: 'equipment', linkedEntityId: '720004591',
    },
    {
      id: 'enzunchadora-1', label: 'Enzunchadora N1', type: 'generic',
      position: { x: 2, y: 0, z: 6 }, size: { width: 1.5, height: 1.8, depth: 1.5 },
      rotation: 0, visible: true, color: '#ec4899',
      linkedEntityType: 'equipment', linkedEntityId: '720004592',
    },
    {
      id: 'detector-metales', label: 'Detector Metales', type: 'sensor',
      position: { x: -4, y: 0, z: 9 }, size: { width: 0.5, height: 2, depth: 0.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720012954',
    },

    // ━━━━━━━━━ SELLADO ━━━━━━━━━
    {
      id: 'termoformadora', label: 'Termoformadora GEA', type: 'generic',
      position: { x: 8, y: 0, z: 6 }, size: { width: 3, height: 2, depth: 2 },
      rotation: 0, visible: true, color: '#a855f7',
      linkedEntityType: 'equipment', linkedEntityId: '720012997',
    },
    {
      id: 'selladora-campana', label: 'Selladora Campana', type: 'generic',
      position: { x: 11, y: 0, z: 6 }, size: { width: 2, height: 1.8, depth: 1.5 },
      rotation: 0, visible: true, color: '#d946ef',
      linkedEntityType: 'equipment', linkedEntityId: '720012996',
    },
    {
      id: 'balanza-din-sell', label: 'Balanza Dinámica Marel', type: 'conveyor',
      position: { x: 11, y: 0, z: 9 }, size: { width: 3, height: 1, depth: 1.2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720012998',
    },

    // ━━━━━━━━━ TÚNELES CONGELACIÓN ━━━━━━━━━
    {
      id: 'tunel-nh3-1', label: 'Túnel Estático NH3 N1', type: 'building',
      position: { x: -22, y: 0, z: -30 }, size: { width: 6, height: 4, depth: 5 },
      rotation: 0, visible: true, color: '#1e40af',
      linkedEntityType: 'equipment', linkedEntityId: '720004623',
    },
    {
      id: 'tunel-nh3-2', label: 'Túnel Estático NH3 N2', type: 'building',
      position: { x: -14, y: 0, z: -30 }, size: { width: 6, height: 4, depth: 5 },
      rotation: 0, visible: true, color: '#1e40af',
      linkedEntityType: 'equipment', linkedEntityId: '720004629',
    },
    {
      id: 'tunel-nh3-3', label: 'Túnel Estático NH3 N3', type: 'building',
      position: { x: -6, y: 0, z: -30 }, size: { width: 6, height: 4, depth: 5 },
      rotation: 0, visible: true, color: '#1e40af',
      linkedEntityType: 'equipment', linkedEntityId: '720004635',
    },
    {
      id: 'tunel-nh3-4', label: 'Túnel Estático NH3 N4', type: 'building',
      position: { x: 2, y: 0, z: -30 }, size: { width: 6, height: 4, depth: 5 },
      rotation: 0, visible: true, color: '#1e40af',
      linkedEntityType: 'equipment', linkedEntityId: '720004641',
    },
    {
      id: 'tunel-semicontinuo', label: 'Túnel Semicontinuo', type: 'building',
      position: { x: 10, y: 0, z: -30 }, size: { width: 8, height: 4.5, depth: 6 },
      rotation: 0, visible: true, color: '#1d4ed8',
      linkedEntityType: 'equipment', linkedEntityId: '720004647',
    },
    {
      id: 'tunel-freon-5', label: 'Túnel Freon N5', type: 'building',
      position: { x: -22, y: 0, z: -38 }, size: { width: 6, height: 3.5, depth: 4 },
      rotation: 0, visible: true, color: '#0369a1',
      linkedEntityType: 'equipment', linkedEntityId: '720004744',
    },
    {
      id: 'tunel-freon-6', label: 'Túnel Freon N6', type: 'building',
      position: { x: -14, y: 0, z: -38 }, size: { width: 6, height: 3.5, depth: 4 },
      rotation: 0, visible: true, color: '#0369a1',
      linkedEntityType: 'equipment', linkedEntityId: '720004781',
    },
    // Compresores NH3
    {
      id: 'compresor-nh3-1', label: 'Compresor NH3 N1', type: 'compressor',
      position: { x: -6, y: 0, z: -38 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004596',
    },
    {
      id: 'compresor-nh3-2', label: 'Compresor NH3 N2', type: 'compressor',
      position: { x: -2, y: 0, z: -38 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004599',
    },
    {
      id: 'compresor-nh3-3', label: 'Compresor NH3 N3', type: 'compressor',
      position: { x: 2, y: 0, z: -38 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004602',
    },
    // Bombas flujo NH3
    {
      id: 'bomba-nh3-1', label: 'Bomba NH3 N1', type: 'pump',
      position: { x: 6, y: 0, z: -38 }, size: { width: 1.5, height: 1.2, depth: 1 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004605',
    },
    {
      id: 'bomba-nh3-2', label: 'Bomba NH3 N2', type: 'pump',
      position: { x: 8, y: 0, z: -38 }, size: { width: 1.5, height: 1.2, depth: 1 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004607',
    },
    // Estanques NH3
    {
      id: 'estanque-nh3-bombeo', label: 'Estanque Bombeo -40°C', type: 'tank',
      position: { x: 11, y: 0, z: -38 }, size: { width: 2, height: 3, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004611',
    },
    {
      id: 'estanque-nh3-recib', label: 'Recibidor Líquido NH3', type: 'tank',
      position: { x: 14, y: 0, z: -38 }, size: { width: 2, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004612',
    },

    // ━━━━━━━━━ FRIGORÍFICO ━━━━━━━━━
    {
      id: 'camara-1', label: 'Cámara N°1', type: 'building',
      position: { x: 29, y: 0, z: -8 }, size: { width: 8, height: 5, depth: 8 },
      rotation: 0, visible: true, color: '#0c4a6e',
      linkedEntityType: 'equipment', linkedEntityId: '720004674',
    },
    {
      id: 'camara-2', label: 'Cámara N°2', type: 'building',
      position: { x: 29, y: 0, z: 2 }, size: { width: 8, height: 5, depth: 8 },
      rotation: 0, visible: true, color: '#0c4a6e',
      linkedEntityType: 'equipment', linkedEntityId: '720004721',
    },
    {
      id: 'climatiz-embarque', label: 'Climatización Embarque', type: 'evaporator',
      position: { x: 42, y: 0, z: 5 }, size: { width: 3, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004820',
    },
    {
      id: 'evap-cam1-n1', label: 'Evaporador Cámara 1 N1', type: 'evaporator',
      position: { x: 34, y: 0, z: -10 }, size: { width: 2.5, height: 2, depth: 1.5 },
      rotation: 90, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004706',
    },
    {
      id: 'evap-cam1-n2', label: 'Evaporador Cámara 1 N2', type: 'evaporator',
      position: { x: 34, y: 0, z: -6 }, size: { width: 2.5, height: 2, depth: 1.5 },
      rotation: 90, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004711',
    },

    // ━━━━━━━━━ SALA DE MÁQUINAS ━━━━━━━━━
    {
      id: 'rsw', label: 'Equipo RSW', type: 'compressor',
      position: { x: -33, y: 0, z: -42 }, size: { width: 3, height: 3, depth: 2.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004277',
    },
    {
      id: 'compresor-rsw', label: 'Compresor Tornillo NH3 RSW', type: 'compressor',
      position: { x: -29, y: 0, z: -42 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004278',
    },
    {
      id: 'condensador-n1', label: 'Condensador Tubular N1', type: 'condenser',
      position: { x: -25, y: 0, z: -42 }, size: { width: 3, height: 2, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004614',
    },
    {
      id: 'condensador-n2', label: 'Condensador Tubular N2', type: 'condenser',
      position: { x: -25, y: 0, z: -39 }, size: { width: 3, height: 2, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004615',
    },
    {
      id: 'ext-sala-maq-1', label: 'Extractor Sala Máq 1', type: 'extractor',
      position: { x: -33, y: 0, z: -39 }, size: { width: 1.2, height: 1.8, depth: 1.2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004528',
    },

    // ━━━━━━━━━ SALA DE FREON ━━━━━━━━━
    {
      id: 'compresor-cam-1', label: 'Compresor Cámara N1', type: 'compressor',
      position: { x: -16, y: 0, z: -42 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004675',
    },
    {
      id: 'condensador-cam-1', label: 'Condensador Cámara N1', type: 'condenser',
      position: { x: -12, y: 0, z: -42 }, size: { width: 3.5, height: 2, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004681',
    },
    {
      id: 'enfriador-aceite-1', label: 'Enfriador Aceite Comp N1', type: 'condenser',
      position: { x: -16, y: 0, z: -39 }, size: { width: 2.5, height: 1.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004677',
    },

    // ━━━━━━━━━ SUBESTACIÓN PRINCIPAL ━━━━━━━━━
    {
      id: 'trafo-1', label: 'Transformador 1', type: 'transformer',
      position: { x: -1, y: 0, z: -43 }, size: { width: 2.5, height: 3, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004586',
    },
    {
      id: 'trafo-2', label: 'Transformador 2', type: 'transformer',
      position: { x: 3, y: 0, z: -43 }, size: { width: 2.5, height: 3, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004587',
    },
    {
      id: 'sala-servidores', label: 'Sala Servidores', type: 'panel',
      position: { x: 1, y: 0, z: -40 }, size: { width: 2, height: 2, depth: 1 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720011853',
    },

    // ━━━━━━━━━ CALDERA ━━━━━━━━━
    {
      id: 'caldera', label: 'Caldera Planta', type: 'boiler',
      position: { x: 12, y: 0, z: -43 }, size: { width: 3, height: 3.5, depth: 3 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004477',
    },
    {
      id: 'compresor-aire-planta', label: 'Compresor Aire Planta', type: 'compressor',
      position: { x: 12, y: 0, z: -39 }, size: { width: 2, height: 2, depth: 1.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004476',
    },

    // ━━━━━━━━━ TALLER MANTENCIÓN ━━━━━━━━━
    {
      id: 'taller-building', label: 'Taller Mantención', type: 'building',
      position: { x: -40, y: 0, z: -22 }, size: { width: 8, height: 4, depth: 8 },
      rotation: 0, visible: true, color: '#78716c',
    },

    // ━━━━━━━━━ BODEGA ━━━━━━━━━
    {
      id: 'bodega-building', label: 'Bodega Materiales', type: 'building',
      position: { x: -40, y: 0, z: -10 }, size: { width: 8, height: 3.5, depth: 8 },
      rotation: 0, visible: true, color: '#a8a29e',
    },

    // ━━━━━━━━━ CARGA CAMIONES ━━━━━━━━━
    {
      id: 'conj-descarga-cam', label: 'Sist. Descarga Camiones', type: 'generic',
      position: { x: -40, y: 0, z: 2 }, size: { width: 3, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#84cc16',
      linkedEntityType: 'equipment', linkedEntityId: '720004393',
    },
    {
      id: 'bomba-vacio-desc', label: 'Bomba Vacío Desc. Camiones', type: 'pump',
      position: { x: -36, y: 0, z: 2 }, size: { width: 1.5, height: 1.2, depth: 1 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004394',
    },

    // ━━━━━━━━━ EDIFICIO ADMINISTRATIVO ━━━━━━━━━
    {
      id: 'edif-admin', label: 'Edificio Administrativo', type: 'building',
      position: { x: -38, y: 0, z: 20 }, size: { width: 10, height: 4, depth: 6 },
      rotation: 0, visible: true, color: '#78716c',
    },
    {
      id: 'porteria', label: 'Portería', type: 'building',
      position: { x: -49, y: 0, z: 26 }, size: { width: 4, height: 3, depth: 3 },
      rotation: 0, visible: true, color: '#94a3b8',
    },

    // ━━━━━━━━━ CASINO ━━━━━━━━━
    {
      id: 'casino-building', label: 'Casino', type: 'building',
      position: { x: -24, y: 0, z: 20 }, size: { width: 8, height: 3.5, depth: 5 },
      rotation: 0, visible: true, color: '#f97316',
    },

    // ━━━━━━━━━ ALMACENAMIENTO AGUAS ━━━━━━━━━
    {
      id: 'est-agua-dulce-1', label: 'Estanque Agua Dulce 1', type: 'tank',
      position: { x: 22, y: 0, z: 22 }, size: { width: 4, height: 5, depth: 4 },
      rotation: 0, visible: true, color: '#0284c7',
      linkedEntityType: 'equipment', linkedEntityId: '720011857',
    },
    {
      id: 'est-agua-dulce-2', label: 'Estanque Agua Dulce 2', type: 'tank',
      position: { x: 28, y: 0, z: 22 }, size: { width: 4, height: 5, depth: 4 },
      rotation: 0, visible: true, color: '#0284c7',
      linkedEntityType: 'equipment', linkedEntityId: '720011858',
    },
    {
      id: 'est-agua-mar', label: 'Estanque Agua Mar', type: 'tank',
      position: { x: 34, y: 0, z: 22 }, size: { width: 4, height: 5, depth: 4 },
      rotation: 0, visible: true, color: '#0369a1',
      linkedEntityType: 'equipment', linkedEntityId: '720011859',
    },
    {
      id: 'clorador-dulce', label: 'Clorador Agua Dulce', type: 'generic',
      position: { x: 22, y: 0, z: 28 }, size: { width: 1.5, height: 1.5, depth: 1 },
      rotation: 0, visible: true, color: '#22d3ee',
      linkedEntityType: 'equipment', linkedEntityId: '720004485',
    },
    {
      id: 'filtro-uv-dulce', label: 'Filtro UV Agua Dulce', type: 'sensor',
      position: { x: 25, y: 0, z: 28 }, size: { width: 0.5, height: 1.8, depth: 0.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004498',
    },

    // ━━━━━━━━━ PLANTA RILES ━━━━━━━━━
    {
      id: 'daf', label: 'Sistema DAF', type: 'tank',
      position: { x: 44, y: 0, z: 22 }, size: { width: 4, height: 3, depth: 4 },
      rotation: 0, visible: true, color: '#059669',
      linkedEntityType: 'equipment', linkedEntityId: '720004572',
    },
    {
      id: 'est-equalizacion', label: 'Estanque Equalización', type: 'tank',
      position: { x: 50, y: 0, z: 22 }, size: { width: 3, height: 3, depth: 3 },
      rotation: 0, visible: true, color: '#047857',
      linkedEntityType: 'equipment', linkedEntityId: '720004550',
    },
    {
      id: 'filtro-tornillo', label: 'Filtro Tornillo', type: 'generic',
      position: { x: 44, y: 0, z: 28 }, size: { width: 2, height: 2, depth: 1.5 },
      rotation: 0, visible: true, color: '#065f46',
      linkedEntityType: 'equipment', linkedEntityId: '720004558',
    },
    {
      id: 'est-lodos', label: 'Estanque Lodos', type: 'tank',
      position: { x: 50, y: 0, z: 28 }, size: { width: 2.5, height: 2.5, depth: 2.5 },
      rotation: 0, visible: true, color: '#064e3b',
      linkedEntityType: 'equipment', linkedEntityId: '720004563',
    },
    {
      id: 'est-cloracion', label: 'Estanque Cloración', type: 'tank',
      position: { x: 54, y: 0, z: 22 }, size: { width: 2, height: 2.5, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004578',
    },

    // ━━━━━━━━━ RED DE INCENDIO ━━━━━━━━━
    {
      id: 'bomba-incendio', label: 'Bomba Red Incendio', type: 'pump',
      position: { x: 12, y: 0, z: 32 }, size: { width: 2, height: 1.5, depth: 1.5 },
      rotation: 0, visible: true, color: '#dc2626',
      linkedEntityType: 'equipment', linkedEntityId: '720004483',
    },

    // ━━━━━━━━━ ACOPIO (Pontón) ━━━━━━━━━
    {
      id: 'sist-bombeo-n1', label: 'Sist. Bombeo Peces N1', type: 'pump',
      position: { x: 57, y: 0, z: -38 }, size: { width: 2.5, height: 2, depth: 2 },
      rotation: 0, visible: true, color: '#10b981',
      linkedEntityType: 'equipment', linkedEntityId: '720004340',
    },
    {
      id: 'sist-bombeo-n2', label: 'Sist. Bombeo Peces N2', type: 'pump',
      position: { x: 62, y: 0, z: -38 }, size: { width: 2.5, height: 2, depth: 2 },
      rotation: 0, visible: true, color: '#10b981',
      linkedEntityType: 'equipment', linkedEntityId: '720004355',
    },
    {
      id: 'est-bombeo-a-s1', label: 'Estanque Bombeo A S1', type: 'tank',
      position: { x: 57, y: 0, z: -34 }, size: { width: 2.5, height: 3, depth: 2.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004345',
    },
    {
      id: 'est-bombeo-b-s1', label: 'Estanque Bombeo B S1', type: 'tank',
      position: { x: 61, y: 0, z: -34 }, size: { width: 2.5, height: 3, depth: 2.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004346',
    },
    {
      id: 'compresor-aire-n1-acop', label: 'Compresor Aire N1 Acopio', type: 'compressor',
      position: { x: 65, y: 0, z: -38 }, size: { width: 2, height: 2, depth: 1.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004351',
    },
    {
      id: 'subestacion-acopio', label: 'Subestación Acopio', type: 'panel',
      position: { x: 68, y: 0, z: -34 }, size: { width: 2, height: 2.5, depth: 1 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004376',
    },
    {
      id: 'huinche-mallas', label: 'Huinche Levante Mallas', type: 'generic',
      position: { x: 72, y: 0, z: -42 }, size: { width: 2, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#f59e0b',
      linkedEntityType: 'equipment', linkedEntityId: '720004383',
    },

    // ━━━━━━━━━ PLANTA YAL ━━━━━━━━━
    {
      id: 'yal-building', label: 'Planta Yal', type: 'building',
      position: { x: 58, y: 0, z: -2 }, size: { width: 18, height: 5, depth: 15 },
      rotation: 0, visible: true, color: '#7c3aed',
    },
    {
      id: 'yal-chiller', label: 'Chiller Yal', type: 'tank',
      position: { x: 52, y: 0, z: -8 }, size: { width: 3, height: 3, depth: 2.5 },
      rotation: 0, visible: true, color: '#06b6d4',
      linkedEntityType: 'equipment', linkedEntityId: '720004269',
    },
    {
      id: 'yal-stunner', label: 'Stunner Eléctrico', type: 'generic',
      position: { x: 56, y: 0, z: -8 }, size: { width: 3, height: 2, depth: 2 },
      rotation: 0, visible: true, color: '#eab308',
      linkedEntityType: 'equipment', linkedEntityId: '720004285',
    },
    {
      id: 'yal-baader-n1', label: 'Baader 142 Yal N1', type: 'generic',
      position: { x: 60, y: 0, z: -8 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#f97316',
      linkedEntityType: 'equipment', linkedEntityId: '720004247',
    },
    {
      id: 'yal-baader-n2', label: 'Baader 142 Yal N2', type: 'generic',
      position: { x: 64, y: 0, z: -8 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#f97316',
      linkedEntityType: 'equipment', linkedEntityId: '720004252',
    },
    {
      id: 'yal-baader-n3', label: 'Baader 142 Yal N3', type: 'generic',
      position: { x: 68, y: 0, z: -8 }, size: { width: 2.5, height: 2.5, depth: 2 },
      rotation: 0, visible: true, color: '#f97316',
      linkedEntityType: 'equipment', linkedEntityId: '720004258',
    },
    {
      id: 'yal-subestacion', label: 'Subestación Yal', type: 'transformer',
      position: { x: 52, y: 0, z: 4 }, size: { width: 2.5, height: 3, depth: 2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004588',
    },
    {
      id: 'yal-compresor-aire', label: 'Compresor Aire Yal', type: 'compressor',
      position: { x: 56, y: 0, z: 4 }, size: { width: 2, height: 2, depth: 1.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004324',
    },
    {
      id: 'yal-balanza', label: 'Balanza Marelec Yal', type: 'conveyor',
      position: { x: 62, y: 0, z: 4 }, size: { width: 3, height: 1, depth: 1.2 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004297',
    },

    // ━━━━━━━━━ ESTANQUE TRANSFERENCIA AGUA MAR ━━━━━━━━━
    {
      id: 'bomba-agua-mar-n1', label: 'Bomba Agua Mar N1', type: 'pump',
      position: { x: 20, y: 0, z: 32 }, size: { width: 2, height: 1.5, depth: 1.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004478',
    },
    {
      id: 'bomba-agua-mar-n2', label: 'Bomba Agua Mar N2', type: 'pump',
      position: { x: 24, y: 0, z: 32 }, size: { width: 2, height: 1.5, depth: 1.5 },
      rotation: 0, visible: true,
      linkedEntityType: 'equipment', linkedEntityId: '720004480',
    },

    // ━━━━━━━━━ TUBERÍAS PRINCIPALES ━━━━━━━━━
    {
      id: 'pipe-proceso-tuneles', label: 'Tubería Proceso → Túneles', type: 'pipe',
      position: { x: -10, y: 2, z: -22 }, size: { width: 30, height: 0.5, depth: 0.5 },
      rotation: 0, visible: true,
    },
    {
      id: 'pipe-tuneles-maq', label: 'Tubería NH3 Túneles → Sala Máq', type: 'pipe',
      position: { x: -30, y: 2, z: -35 }, size: { width: 10, height: 0.6, depth: 0.6 },
      rotation: 90, visible: true, color: '#f59e0b',
    },
    {
      id: 'pipe-agua-planta', label: 'Tubería Agua → Planta', type: 'pipe',
      position: { x: 10, y: 1.5, z: 15 }, size: { width: 25, height: 0.4, depth: 0.4 },
      rotation: 0, visible: true, color: '#0284c7',
    },
  ]

  // ═══════════════════════════════════════════════════════
  // CONECTORES
  // ═══════════════════════════════════════════════════════
  const connectors: MapConnector[] = [
    // Línea de proceso
    { id: 'c-sacr-evis', fromNodeId: 'desangrador', toNodeId: 'baader142-n1', style: 'flow', animated: true },
    { id: 'c-evis-filete', fromNodeId: 'cinta-elev-clasif', toNodeId: 'volcador-bins', style: 'flow', animated: true },
    // Evisceradoras → bomba vacío
    { id: 'c-b142n1-bv', fromNodeId: 'baader142-n1', toNodeId: 'bomba-vacio-evis-1', style: 'pipe', animated: false },
    // NH3 sistema
    { id: 'c-comp1-tun1', fromNodeId: 'compresor-nh3-1', toNodeId: 'tunel-nh3-1', style: 'pipe', animated: false },
    { id: 'c-comp2-tun2', fromNodeId: 'compresor-nh3-2', toNodeId: 'tunel-nh3-2', style: 'pipe', animated: false },
    { id: 'c-comp3-tun3', fromNodeId: 'compresor-nh3-3', toNodeId: 'tunel-nh3-3', style: 'pipe', animated: false },
    // Agua
    { id: 'c-agua1-planta', fromNodeId: 'est-agua-dulce-1', toNodeId: 'filtro-uv-dulce', style: 'pipe', animated: false },
    // RILES
    { id: 'c-eq-daf', fromNodeId: 'est-equalizacion', toNodeId: 'daf', style: 'flow', animated: true },
    // Cámaras
    { id: 'c-evap-cam1', fromNodeId: 'evap-cam1-n1', toNodeId: 'camara-1', style: 'pipe', animated: false },
    // Acopio
    { id: 'c-sist1-est1', fromNodeId: 'sist-bombeo-n1', toNodeId: 'est-bombeo-a-s1', style: 'pipe', animated: false },
    { id: 'c-sist2-est2', fromNodeId: 'sist-bombeo-n2', toNodeId: 'est-bombeo-b-s1', style: 'pipe', animated: false },
    // Transformadores
    { id: 'c-trafo1-trafo2', fromNodeId: 'trafo-1', toNodeId: 'trafo-2', style: 'cable', animated: false },
    // Planta Yal
    { id: 'c-yal-chiller-bdr', fromNodeId: 'yal-chiller', toNodeId: 'yal-stunner', style: 'flow', animated: true },
    { id: 'c-yal-stunner-bdr', fromNodeId: 'yal-stunner', toNodeId: 'yal-baader-n1', style: 'flow', animated: true },
  ]

  const terrain: TerrainTile[] = []

  return { config, nodes, connectors, areas, terrain }
}

/** 
 * Genera datos runtime demo (estados, incidencias simuladas)
 * Simula operación real de Planta Chonchi
 */
export function generateDemoRuntimeData(nodes: MapNode[]): Map<string, NodeRuntimeData> {
  const data = new Map<string, NodeRuntimeData>()

  for (const node of nodes) {
    const runtime: NodeRuntimeData = {
      nodeId: node.id,
      status: 'ok',
      activeIncidents: 0,
    }

    // Simular algunos estados realistas
    switch (node.id) {
      case 'baader142-n2':
        runtime.status = 'warning'
        runtime.activeIncidents = 1
        runtime.tooltip = 'Vibración elevada en knuro'
        break
      case 'compresor-nh3-3':
        runtime.status = 'critical'
        runtime.activeIncidents = 2
        runtime.tooltip = 'Presión anormal — revisar urgente'
        break
      case 'compresor-cam-1':
        runtime.status = 'maintenance'
        runtime.tooltip = 'Mantención preventiva programada'
        break
      case 'ext-cosecha-2':
        runtime.status = 'offline'
        break
      case 'desangrador':
        runtime.status = 'warning'
        runtime.activeIncidents = 1
        runtime.tooltip = 'Desgaste correa'
        break
      case 'tunel-freon-5':
        runtime.status = 'maintenance'
        runtime.tooltip = 'Recarga de gas'
        break
      case 'yal-baader-n3':
        runtime.status = 'warning'
        runtime.activeIncidents = 1
        break
      case 'filtro-tornillo':
        runtime.status = 'critical'
        runtime.activeIncidents = 1
        runtime.tooltip = 'Tornillo atascado'
        break
    }

    // Sensores
    if (node.type === 'sensor') {
      switch (node.id) {
        case 'detector-metales':
          runtime.sensorValue = 0
          runtime.sensorUnit = ' detec'
          break
        case 'filtro-uv-dulce':
          runtime.sensorValue = 42
          runtime.sensorUnit = ' mJ/cm²'
          break
      }
    }

    data.set(node.id, runtime)
  }

  return data
}
