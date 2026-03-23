/**
 * mapPageState.ts — Custom hooks that group MapPage's ~60 useState into cohesive blocks.
 *
 * Each hook encapsulates related state variables, returning the same individual
 * values and setters so existing callbacks need zero changes.
 *
 * Groups:
 *  1. useTerrainEditorState  (15 fields) — terrain tools, brush, import
 *  2. useHudDisplayState     ( 8 fields) — compass, minimap, stats, measure, geo data
 *  3. useBaseMapState        ( 8 fields) — base-map locations, background image, calibration
 */

import { useState } from 'react'
import type { TerrainImportProgress, TerrainGeoBounds } from '@/lib/terrainImport'
import { formatCoordinatesText, DEFAULT_CHONCHI_RECTANGLE } from '@/lib/terrainImport'
import type { TerrainAdminMarkup, IsometricMap } from '@/types/isometricMap'
import { SEA_LEVEL_ELEVATION } from '@/types/isometricMap'
import type { OSMFeatures } from '@/lib/osmBuildings'
import type { MapLocation } from '@/types/maps'

export type BackgroundCalibrationMode = 'move' | 'scale' | 'rotate'

// ═══════════════════════════════════════════════════════════════════
// 1. Terrain Editor State (15 fields)
// ═══════════════════════════════════════════════════════════════════

export function useTerrainEditorState() {
  const [terrainEditEnabled, setTerrainEditEnabled] = useState(false)
  const [terrainTool, setTerrainTool] = useState<'raise' | 'lower' | 'flatten' | 'smooth' | 'sample'>('raise')
  const [terrainBrushSize, setTerrainBrushSize] = useState<1 | 3 | 5 | 7 | 9>(3)
  const [terrainBrushStrength, setTerrainBrushStrength] = useState<1 | 2 | 3 | 4 | 5>(2)
  const [terrainEditableMin, setTerrainEditableMin] = useState(-30)
  const [terrainEditableMax, setTerrainEditableMax] = useState(60)
  const [terrainFlattenTarget, setTerrainFlattenTarget] = useState<number>(SEA_LEVEL_ELEVATION)
  const [terrainHoverPosition, setTerrainHoverPosition] = useState<{ x: number; z: number } | null>(null)
  const [showTerrainModal, setShowTerrainModal] = useState(false)
  const [isImportingRealTerrain, setIsImportingRealTerrain] = useState(false)
  const [realTerrainImportMessage, setRealTerrainImportMessage] = useState<string | null>(null)
  const [terrainImportProgress, setTerrainImportProgress] = useState<TerrainImportProgress | null>(null)
  const [terrainImportCoordinatesText, setTerrainImportCoordinatesText] = useState<string>(() =>
    formatCoordinatesText(DEFAULT_CHONCHI_RECTANGLE)
  )
  const [terrainImportSampleStep, setTerrainImportSampleStep] = useState<number>(1)
  const [terrainAdminMarkup, setTerrainAdminMarkup] = useState<TerrainAdminMarkup | null | undefined>(undefined)

  return {
    terrainEditEnabled, setTerrainEditEnabled,
    terrainTool, setTerrainTool,
    terrainBrushSize, setTerrainBrushSize,
    terrainBrushStrength, setTerrainBrushStrength,
    terrainEditableMin, setTerrainEditableMin,
    terrainEditableMax, setTerrainEditableMax,
    terrainFlattenTarget, setTerrainFlattenTarget,
    terrainHoverPosition, setTerrainHoverPosition,
    showTerrainModal, setShowTerrainModal,
    isImportingRealTerrain, setIsImportingRealTerrain,
    realTerrainImportMessage, setRealTerrainImportMessage,
    terrainImportProgress, setTerrainImportProgress,
    terrainImportCoordinatesText, setTerrainImportCoordinatesText,
    terrainImportSampleStep, setTerrainImportSampleStep,
    terrainAdminMarkup, setTerrainAdminMarkup,
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. HUD / Display State (8 fields)
// ═══════════════════════════════════════════════════════════════════

export function useHudDisplayState() {
  const [terrainGeoBounds, setTerrainGeoBounds] = useState<TerrainGeoBounds | null>(null)
  const [osmFeaturesData, setOsmFeaturesData] = useState<OSMFeatures | null>(null)
  const [showGeoCoords, setShowGeoCoords] = useState(false)
  const [showCompass, setShowCompass] = useState(true)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showStatsPanel, setShowStatsPanel] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<{ x: number; z: number }[]>([])
  const [measureMode, setMeasureMode] = useState(false)

  return {
    terrainGeoBounds, setTerrainGeoBounds,
    osmFeaturesData, setOsmFeaturesData,
    showGeoCoords, setShowGeoCoords,
    showCompass, setShowCompass,
    showMinimap, setShowMinimap,
    showStatsPanel, setShowStatsPanel,
    measurePoints, setMeasurePoints,
    measureMode, setMeasureMode,
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. Base Map / Background State (8 fields)
// ═══════════════════════════════════════════════════════════════════

export function useBaseMapState() {
  const [mapLocations, setMapLocations] = useState<MapLocation[]>([])
  const [isLoadingBaseMaps, setIsLoadingBaseMaps] = useState(true)
  const [baseMapStatusText, setBaseMapStatusText] = useState('Cargando fuentes de plano base...')
  const [selectedBaseLocationId, setSelectedBaseLocationId] = useState('')
  const [showBaseMap, setShowBaseMap] = useState(true)
  const [backgroundMap, setBackgroundMap] = useState<IsometricMap['backgroundMap'] | null>(null)
  const [calibrationMode, setCalibrationMode] = useState<BackgroundCalibrationMode | null>(null)
  const [calibrationStepMeters, setCalibrationStepMeters] = useState<1 | 5>(1)

  return {
    mapLocations, setMapLocations,
    isLoadingBaseMaps, setIsLoadingBaseMaps,
    baseMapStatusText, setBaseMapStatusText,
    selectedBaseLocationId, setSelectedBaseLocationId,
    showBaseMap, setShowBaseMap,
    backgroundMap, setBackgroundMap,
    calibrationMode, setCalibrationMode,
    calibrationStepMeters, setCalibrationStepMeters,
  }
}
