/**
 * MapSearchPanel — Buscador de equipos del mapa con jerarquía
 * 
 * Busca por nombre, código SAP o tipo de equipo.
 * Al seleccionar un resultado, centra la cámara en él y lo selecciona.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Search, X, MapPin, ChevronRight, Building2, Layers } from 'lucide-react'
import { useAppStore } from '@/store'
import type { MapNode, MapArea } from '@/types/isometricMap'
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_TYPE_COLORS } from '@/types/isometricMap'

interface MapSearchPanelProps {
  nodes: MapNode[]
  areas?: MapArea[]
  onSelectNode: (nodeId: string) => void
  onFocusNode: (nodeId: string, position: { x: number; z: number }) => void
}

interface SearchResult {
  type: 'node' | 'area'
  node?: MapNode
  area?: MapArea
  /** Nombre del equipo vinculado en Firestore (si existe) */
  linkedName?: string
  /** Código SAP */
  linkedCode?: string
  matchField: 'label' | 'code' | 'linked' | 'type'
}

const FLOOR_LABELS: Record<number, string> = {
  0: 'PB',
  1: '2°P',
  2: 'Techo',
}

export function MapSearchPanel({ nodes, areas, onSelectNode, onFocusNode }: MapSearchPanelProps) {
  const { equipment } = useAppStore()
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Build lookup de equipos vinculados
  const equipmentMap = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo: string }>()
    for (const eq of equipment) {
      if (!eq.deleted) {
        map.set(eq.id, { nombre: eq.nombre, codigo: eq.codigo })
      }
    }
    return map
  }, [equipment])

  // Search results
  const results = useMemo<SearchResult[]>(() => {
    if (!search || search.length < 2) return []
    const q = search.toLowerCase()
    const out: SearchResult[] = []

    // Search in nodes
    for (const node of nodes) {
      if (!node.visible) continue
      // Check label
      if (node.label.toLowerCase().includes(q)) {
        const linked = node.linkedEntityId ? equipmentMap.get(node.linkedEntityId) : undefined
        out.push({ type: 'node', node, linkedName: linked?.nombre, linkedCode: linked?.codigo, matchField: 'label' })
        continue
      }
      // Check linked entity name/code
      if (node.linkedEntityId) {
        const linked = equipmentMap.get(node.linkedEntityId)
        if (linked && (linked.nombre.toLowerCase().includes(q) || linked.codigo.toLowerCase().includes(q))) {
          out.push({ type: 'node', node, linkedName: linked.nombre, linkedCode: linked.codigo, matchField: 'linked' })
          continue
        }
      }
      // Check type label
      const typeLabel = EQUIPMENT_TYPE_LABELS[node.type]
      if (typeLabel.toLowerCase().includes(q)) {
        const linked = node.linkedEntityId ? equipmentMap.get(node.linkedEntityId) : undefined
        out.push({ type: 'node', node, linkedName: linked?.nombre, linkedCode: linked?.codigo, matchField: 'type' })
      }
    }

    // Search in areas
    if (areas) {
      for (const area of areas) {
        if (area.label.toLowerCase().includes(q)) {
          out.push({ type: 'area', area, matchField: 'label' })
        }
      }
    }

    return out
  }, [search, nodes, areas, equipmentMap])

  const handleSelect = useCallback((result: SearchResult) => {
    if (result.type === 'node' && result.node) {
      onSelectNode(result.node.id)
      onFocusNode(result.node.id, { x: result.node.position.x, z: result.node.position.z })
    } else if (result.type === 'area' && result.area) {
      onFocusNode(result.area.id, { x: result.area.position.x, z: result.area.position.z })
    }
    setSearch('')
    setIsOpen(false)
  }, [onSelectNode, onFocusNode])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as HTMLElement)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setSearch('')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen])

  return (
    <div ref={panelRef} className="relative">
      {/* Search button / input */}
      {!isOpen ? (
        <button
          className="flex items-center gap-1.5 bg-card/90 backdrop-blur rounded-lg px-3 py-1.5 shadow-lg border text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            setIsOpen(true)
            setTimeout(() => inputRef.current?.focus(), 50)
          }}
        >
          <Search className="h-3.5 w-3.5" />
          Buscar equipo o área...
          <kbd className="ml-2 bg-muted px-1 rounded text-[10px] font-mono">/</kbd>
        </button>
      ) : (
        <div className="bg-card/95 backdrop-blur rounded-lg shadow-xl border min-w-[280px] max-w-[360px]">
          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Nombre, código SAP, tipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => { setIsOpen(false); setSearch('') }}
              className="text-muted-foreground hover:text-foreground"
            >
              <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">Esc</kbd>
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto py-1">
              {results.slice(0, 20).map((result) => {
                const isArea = result.type === 'area'
                const label = isArea ? result.area!.label : result.node!.label
                const key = isArea ? result.area!.id : result.node!.id
                const floor = isArea ? (result.area!.floor ?? 0) : (result.node!.floor ?? 0)
                return (
                <button
                  key={key}
                  className="w-full text-left px-3 py-2 hover:bg-muted/80 transition-colors flex items-center gap-2"
                  onClick={() => handleSelect(result)}
                >
                  {isArea ? (
                    <Layers className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <div
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: EQUIPMENT_TYPE_COLORS[result.node!.type] }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {isArea ? 'Área' : EQUIPMENT_TYPE_LABELS[result.node!.type]}
                      </span>
                      {result.linkedCode && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {result.linkedCode}
                        </span>
                      )}
                      {floor > 0 && (
                        <span className="text-[10px] bg-muted px-1 rounded">
                          <Building2 className="inline h-2.5 w-2.5 mr-0.5" />
                          {FLOOR_LABELS[floor] ?? `P${floor}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </button>
                )
              })}
              {results.length > 20 && (
                <p className="text-center text-[10px] text-muted-foreground py-1">
                  +{results.length - 20} más...
                </p>
              )}
            </div>
          )}

          {/* Empty state */}
          {search.length >= 2 && results.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Sin resultados para &quot;{search}&quot;
            </div>
          )}

          {/* Hint */}
          {search.length < 2 && (
            <div className="py-4 text-center text-[10px] text-muted-foreground">
              Escribe al menos 2 caracteres para buscar
            </div>
          )}
        </div>
      )}
    </div>
  )
}
