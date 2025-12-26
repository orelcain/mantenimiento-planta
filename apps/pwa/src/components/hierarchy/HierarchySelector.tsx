/**
 * HierarchySelector - Selector en cascada de 8 niveles
 * 
 * Permite seleccionar ubicación jerárquica para incidencias
 * con carga dinámica por nivel y validación mínima nivel 3.
 */

import React, { useState, useEffect } from 'react'
import { ChevronRight, MapPin, CheckCircle, AlertTriangle } from 'lucide-react'
import { 
  HierarchyLevel, 
  HIERARCHY_LEVEL_NAMES,
  HIERARCHY_CONSTRAINTS 
} from '@/types/hierarchy'
import { useHierarchyCascadeOptions, useHierarchyPath } from '@/hooks/useHierarchy'

interface HierarchySelectorProps {
  value?: string // ID del nodo seleccionado
  onChange: (nodeId: string | null) => void
  minLevel?: HierarchyLevel // Nivel mínimo requerido (default: 3)
  maxLevel?: HierarchyLevel // Nivel máximo permitido (default: 8)
  disabled?: boolean
  error?: string
}

interface SelectedNode {
  id: string
  nivel: HierarchyLevel
}

export function HierarchySelector({
  value,
  onChange,
  minLevel = HIERARCHY_CONSTRAINTS.MIN_REQUIRED_LEVEL_FOR_INCIDENT,
  maxLevel = HierarchyLevel.ELEMENTO,
  disabled = false,
  error,
}: HierarchySelectorProps) {
  console.log('[HierarchySelector] Montado con:', { value, minLevel, maxLevel, disabled })
  
  // Estado de selecciones por nivel
  const [selections, setSelections] = useState<(SelectedNode | null)[]>(
    Array(maxLevel).fill(null)
  )

  // Cargar path inicial si hay un valor
  const { path: initialPath, loading: loadingPath } = useHierarchyPath(value ?? null)

  useEffect(() => {
    console.log('[HierarchySelector] Path inicial:', { initialPath, loadingPath })
    if (initialPath.length > 0 && !loadingPath) {
      const newSelections: (SelectedNode | null)[] = Array(maxLevel).fill(null)
      initialPath.forEach((pathNode) => {
        if (pathNode.nivel <= maxLevel) {
          newSelections[pathNode.nivel - 1] = {
            id: pathNode.id,
            nivel: pathNode.nivel,
          }
        }
      })
      setSelections(newSelections)
    }
  }, [initialPath, loadingPath, maxLevel])

  const handleLevelSelect = (nivel: HierarchyLevel, nodeId: string | null) => {
    console.log('[HierarchySelector] Selección en nivel', nivel, ':', nodeId)
    
    const newSelections = [...selections]
    const index = nivel - 1
    
    newSelections[index] = nodeId
      ? { id: nodeId, nivel }
      : null
    
    // Limpiar niveles posteriores
    for (let i = index + 1; i < maxLevel; i++) {
      newSelections[i] = null
    }
    
    setSelections(newSelections)
    
    // Emitir último nivel seleccionado
    const lastSelection = newSelections.findLast(s => s !== null)
    onChange(lastSelection?.id ?? null)
  }

  // Verificar si se alcanzó el nivel mínimo
  const isMinLevelReached = selections.some(
    sel => sel !== null && sel.nivel >= minLevel
  )

  const currentLevel = selections.findIndex(s => s === null) + 1
  const showValidation = currentLevel > 0 && currentLevel < minLevel

  return (
    <div className="space-y-4">
      {/* Breadcrumb de selección actual */}
      {selections.some(s => s !== null) && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <MapPin className="w-5 h-5 text-blue-600" />
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            {selections.map((sel, index) => {
              if (!sel) return null
              const nivel = (index + 1) as HierarchyLevel
              return (
                <React.Fragment key={sel.id}>
                  {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <span className="text-sm font-medium text-blue-700">
                    {HIERARCHY_LEVEL_NAMES[nivel]}
                  </span>
                </React.Fragment>
              )
            })}
          </div>

          {/* Indicador de validación */}
          {isMinLevelReached ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : showValidation ? (
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          ) : null}
        </div>
      )}

      {/* Selectores en cascada */}
      <div className="space-y-3">
        {Array.from({ length: maxLevel }, (_, i) => {
          const nivel = (i + 1) as HierarchyLevel
          const isVisible = i === 0 || selections[i - 1] !== null
          const parentId = i === 0 ? null : selections[i - 1]?.id ?? null

          if (!isVisible) return null

          return (
            <LevelSelector
              key={nivel}
              nivel={nivel}
              parentId={parentId}
              value={selections[i]?.id ?? null}
              onChange={nodeId => handleLevelSelect(nivel, nodeId)}
              disabled={disabled}
              isRequired={nivel <= minLevel}
            />
          )
        })}
      </div>

      {/* Mensaje de validación */}
      {showValidation && !isMinLevelReached && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-800">
            Debes seleccionar hasta el nivel <strong>{HIERARCHY_LEVEL_NAMES[minLevel]}</strong> como mínimo.
          </div>
        </div>
      )}

      {/* Error externo */}
      {error && (
        <div className="text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  )
}

/**
 * Selector individual por nivel
 */
interface LevelSelectorProps {
  nivel: HierarchyLevel
  parentId: string | null
  value: string | null
  onChange: (nodeId: string | null) => void
  disabled: boolean
  isRequired: boolean
}

function LevelSelector({
  nivel,
  parentId,
  value,
  onChange,
  disabled,
  isRequired,
}: LevelSelectorProps) {
  const { options, loading } = useHierarchyCascadeOptions(parentId, nivel)

  console.log('[LevelSelector] Renderizando nivel:', {
    nivel,
    parentId,
    optionsCount: options.length,
    loading,
    value
  })

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {HIERARCHY_LEVEL_NAMES[nivel]}
        {isRequired && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        value={value ?? ''}
        onChange={e => {
          console.log('[LevelSelector] Cambio en nivel', nivel, ':', e.target.value)
          onChange(e.target.value || null)
        }}
        disabled={disabled || loading}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">
          {loading ? 'Cargando...' : `Seleccionar ${HIERARCHY_LEVEL_NAMES[nivel].toLowerCase()}`}
        </option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Breadcrumb compacto para mostrar path seleccionado
 * (Para usar en cards/listas)
 */
interface HierarchyBreadcrumbProps {
  nodeId: string | null
  maxItems?: number
}

export function HierarchyBreadcrumb({ nodeId, maxItems = 4 }: HierarchyBreadcrumbProps) {
  const { path, loading } = useHierarchyPath(nodeId)

  if (loading || !path.length) {
    return <span className="text-sm text-gray-400">Sin ubicación</span>
  }

  const displayPath = maxItems && path.length > maxItems
    ? [...path.slice(0, maxItems - 1), { nombre: '...', id: 'more' }, path[path.length - 1]]
    : path

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-600">
      {displayPath.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <span className="font-medium">{item.nombre}</span>
        </React.Fragment>
      ))}
    </div>
  )
}
