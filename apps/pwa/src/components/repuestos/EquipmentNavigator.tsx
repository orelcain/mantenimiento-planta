/**
 * EquipmentNavigator — Navegación por áreas de jerarquía
 *
 * Layout revisado:
 *  Sidebar colapsable (áreas agrupadas por planta) | Lista de equipos
 *  Mobile: pills horizontales en lugar de sidebar
 */

import { useState, useMemo, useEffect, useCallback, useRef, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Settings2,
  X,
  Search,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  Package,
  Plus,
  Star,
  Minimize2,
  Maximize2,
  ArrowUpDown,
  EyeOff,
  Eye,
} from 'lucide-react'
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext'
import { useIsAdmin } from '@/store/authStore'
import { MachineManager } from '@/components/repuestos/MachineManager'
import { Button, Input } from '@/components/ui'
import { doc, updateDoc, deleteDoc, addDoc, collection as firestoreCollection, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { getHmiTooltipPwd } from '@/services/hmiKnuro'
import { getUserPreferences, saveFavoriteLists, type FavList } from '@/services/userPreferences'
import { useAuthStore } from '@/store/authStore'
import type { Machine } from '@/types/repuestos'
import { InlineEditName } from '@/components/repuestos/InlineEditName'
import { useHierarchyAreaTree, type AreaTreeNode } from '@/hooks/useHierarchyAreaTree'
import { useEquipmentForArea, type EquipmentDisplayNode, invalidateEquipmentCache } from '@/hooks/useEquipmentForArea'
import { useLinkMachine } from '@/hooks/useLinkMachine'
import { EquipmentCard } from '@/components/repuestos/EquipmentCard'
// import { LinkMachineModal } from '@/components/repuestos/LinkMachineModal' // deshabilitado
import { useGlobalEquipmentSearch, getGlobalEquipmentCache, type GlobalEquipmentResult } from '@/hooks/useGlobalEquipmentSearch'
import { Loader2, MapPin } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
export interface SelectedEquipmentInfo {
  id: string
  nombre: string
  alias?: string
  codigo: string
}

interface EquipmentNavigatorProps {
  repuestosCounts?: Record<string, number>
  className?: string
  onCategoryChange?: (categoryId: string | null) => void
  onEquipmentSelect?: (info: SelectedEquipmentInfo | null) => void
  onFavoriteMachinesChange?: (favorites: Map<string, { nombre: string; equipmentId: string; listName?: string }>) => void
}

/** Verdadero si el nodo o alguno de sus descendientes tiene el id dado */
function nodeContains(node: AreaTreeNode, targetId: string): boolean {
  if (node.id === targetId) return true
  return node.children.some(c => nodeContains(c, targetId))
}


/* ═══════════════════════════════════════════════════════════════
   Favorites helpers
   ═══════════════════════════════════════════════════════════════ */
const STORAGE_KEY_FAV = 'hierarchy-favorites'

function getDefaultFavorites(tree: AreaTreeNode[]): Set<string> {
  const favs = new Set<string>()
  function findLeaves(node: AreaTreeNode) {
    if (node.children.length === 0 && node.equipmentCount > 0) favs.add(node.id)
    else node.children.forEach(findLeaves)
  }
  tree.forEach(findLeaves)
  return favs
}

function filterForFavorites(nodes: AreaTreeNode[], favIds: Set<string>): AreaTreeNode[] {
  return nodes.flatMap(node => {
    const isFav = favIds.has(node.id)
    const filteredChildren = filterForFavorites(node.children, favIds)
    if (!isFav && filteredChildren.length === 0) return []
    return [{ ...node, children: isFav ? node.children : filteredChildren }]
  })
}

/* ═══════════════════════════════════════════════════════════════
   SidebarAreaItem — ítem de área en el sidebar
   ═══════════════════════════════════════════════════════════════ */
function SidebarAreaItem({
  label, count, isActive, onClick, indent = false, warning = false,
}: {
  label: string; count: number; isActive: boolean
  onClick: () => void; indent?: boolean; warning?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        min-w-full flex items-center gap-1.5 text-left transition-all duration-100
        border-l-2 py-0.5
        ${indent ? 'pl-4 pr-1' : 'pl-2 pr-1'}
        ${isActive
          ? 'border-l-primary bg-primary/8 text-primary'
          : 'border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
        }
      `}
    >
      {warning
        ? <AlertCircle className="h-2.5 w-2.5 shrink-0 text-amber-500" />
        : <span className="h-1 w-1 rounded-full shrink-0 bg-current opacity-60" />
      }
      <span className="shrink-0 whitespace-nowrap text-[10px] font-medium leading-tight">{label}</span>
      <span className={`
        text-[8.5px] font-bold px-1 py-0.5 rounded-full shrink-0 tabular-nums
        ${isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}
      `}>
        {count}
      </span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MobilePill — pill de área para móvil
   ═══════════════════════════════════════════════════════════════ */
function MobilePill({
  label, count, isActive, onClick,
}: {
  label: string; count: number; isActive: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium
        whitespace-nowrap shrink-0 transition-all duration-150 border
        ${isActive
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/50 text-muted-foreground border-border hover:border-muted-foreground/40'
        }
      `}
    >
      {label}
      <span className={`text-[9px] font-bold ${isActive ? 'opacity-80' : 'opacity-60'}`}>
        {count}
      </span>
    </button>
  )
}


/* ═══════════════════════════════════════════════════════════════
   SidebarTreeNodeView — nodo recursivo del árbol de sidebar
   ═══════════════════════════════════════════════════════════════ */
function SidebarTreeNodeView({
  node,
  openNodes,
  onToggle,
  onSelect,
  selectedId,
  showAllAreas,
  onAddMachine,
  onExpandNode,
  favoriteIds,
  onToggleFavorite,
  repuestosCounts,
  depth = 0,
}: {
  node: AreaTreeNode
  openNodes: Record<string, boolean>
  onToggle: (id: string) => void
  onSelect: (node: AreaTreeNode) => void
  selectedId: string | null
  showAllAreas: boolean
  onAddMachine?: (nodeId: string, nodeName: string) => void
  onExpandNode?: (nodeId: string) => void
  favoriteIds: Set<string>
  onToggleFavorite: (id: string) => void
  repuestosCounts?: Record<string, number>
  depth?: number
}) {
  const hasChildren = node.children.length > 0
  const canExpand = hasChildren || node.hasMoreChildren

  const isOpen = !!openNodes[node.id]

  // ── Estado activo / seleccionado ──
  const isSelected         = !showAllAreas && selectedId === node.id
  const descendantSelected = !showAllAreas && !isSelected && !!selectedId
    && node.children.some(c => nodeContains(c, selectedId))
  const isHighlighted      = isSelected
  const isPartiallyActive  = descendantSelected

  // indent: nivel 0 = 6px, cada nivel +13px para jerarquía clara
  const indentPx = 6 + depth * 13

  const handleLabelClick = () => {
    if (canExpand) {
      onToggle(node.id)
      // Lazy load: si tiene hijos no cargados, expandir
      if (node.hasMoreChildren && !hasChildren && onExpandNode) {
        onExpandNode(node.id)
      }
    }
    onSelect(node)
  }

  // Estilo de texto por nivel
  const textClass = depth === 0
    ? 'text-[10px] font-bold uppercase tracking-wider'
    : depth === 1
    ? 'text-[11px] font-semibold'
    : 'text-[10.5px] font-medium'

  // Mostrar todas las áreas — no podar

  return (
    <div>
      <div className="group/row relative flex items-center w-full">
        {/* Barra activa izquierda */}
        {isHighlighted && (
          <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full bg-primary" />
        )}

        <button
          onClick={handleLabelClick}
          style={{ paddingLeft: `${indentPx}px` }}
          className={[
            'flex-1 flex items-center gap-1.5 pr-0.5 py-[3px] text-left transition-all duration-100',
            isHighlighted
              ? 'text-primary bg-primary/8'
              : isPartiallyActive
              ? 'text-primary/70 hover:text-primary/90 hover:bg-muted/40'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
          ].join(' ')}
        >
          {/* Chevron, spinner, o dot */}
          {node.isLoading ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary/60" />
          ) : canExpand ? (
            <span
              onClick={e => { e.stopPropagation(); onToggle(node.id); if (node.hasMoreChildren && !hasChildren && onExpandNode) onExpandNode(node.id) }}
              className="shrink-0 flex items-center cursor-pointer"
            >
              <ChevronRight
                className={[
                  'h-3 w-3 transition-transform duration-150',
                  isOpen ? 'rotate-90' : '',
                  isHighlighted ? 'text-primary' : isPartiallyActive ? 'text-primary/60' : 'text-muted-foreground/50',
                ].join(' ')}
              />
            </span>
          ) : (
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ml-0.5 ${isHighlighted ? 'bg-primary' : 'bg-current opacity-40'}`} />
          )}

          {/* Nombre */}
          <span className={`shrink-0 whitespace-nowrap leading-tight ${textClass}`}>
            {node.nombre}
          </span>

          {/* Badge equipos visibles + repuestos */}
          {(() => {
            const visibleEqCount = repuestosCounts?.[`__eqcount_${node.id}`] ?? 0
            return visibleEqCount > 0 ? (
              <span className={[
                'text-[8.5px] font-bold px-1 py-0.5 rounded-full shrink-0 tabular-nums',
                isHighlighted
                  ? 'bg-primary/20 text-primary'
                  : isPartiallyActive
                  ? 'bg-primary/10 text-primary/70'
                  : 'bg-muted/80 text-muted-foreground',
              ].join(' ')}>
                {visibleEqCount} equipos
              </span>
            ) : null
          })()}
          {repuestosCounts && (() => {
            // Sumar repuestos de todas las máquinas vinculadas en este nodo y descendientes
            const total = Object.values(repuestosCounts).length > 0
              ? (repuestosCounts[`__area_${node.id}`] ?? 0)
              : 0
            return total > 0 ? (
              <span className={[
                'text-[8px] font-bold px-1 py-0.5 rounded-full shrink-0 tabular-nums',
                isHighlighted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 text-emerald-500/60',
              ].join(' ')}>
                {total} rep
              </span>
            ) : null
          })()}
        </button>

        {/* ★ Favorito */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(node.id) }}
          title={favoriteIds.has(node.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          className={[
            'flex items-center justify-center w-5 h-5 rounded transition-all shrink-0',
            favoriteIds.has(node.id)
              ? 'opacity-100 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
              : 'opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10',
          ].join(' ')}
        >
          <Star className={`h-3 w-3 ${favoriteIds.has(node.id) ? 'fill-amber-400' : ''}`} />
        </button>

        {/* + Agregar equipo (admin, hover) */}
        {onAddMachine && (
          <button
            onClick={e => { e.stopPropagation(); onAddMachine(node.id, node.nombre) }}
            title={`Agregar equipo en ${node.nombre}`}
            className="opacity-0 group-hover/row:opacity-100 flex items-center justify-center w-5 h-5 mr-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shrink-0"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Hijos — con línea guía vertical */}
      {hasChildren && isOpen && (
        <div className="relative">
          {/* Línea vertical conectora */}
          <div
            className="absolute top-0 bottom-2 w-px bg-border/40"
            style={{ left: `${indentPx + 5}px` }}
          />
          {node.children.map(child => (
            <SidebarTreeNodeView
              key={child.id}
              node={child}
              openNodes={openNodes}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
              showAllAreas={showAllAreas}

              onAddMachine={onAddMachine}
              onExpandNode={onExpandNode}
              favoriteIds={favoriteIds}
              onToggleFavorite={onToggleFavorite}
              repuestosCounts={repuestosCounts}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MachineListRow — fila compacta de 2 líneas para el panel derecho
   Vista unificada: siempre lista plana, sin tarjetas grandes
   ═══════════════════════════════════════════════════════════════ */
function MachineCard({
  machine, isActive, count, maxCount, onClick, canEdit, onRename, onDelete, areaLabel,
}: {
  machine: Machine; isActive: boolean; count: number; maxCount: number
  onClick: () => void; canEdit?: boolean; onRename?: (name: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>; areaLabel?: string
}) {
  const [deleting, setDeleting] = useState(false)
  const accent = machine.color || '#3b82f6'
  const countColor = count === 0
    ? 'text-muted-foreground/40'
    : count < 5 ? 'text-amber-400' : 'text-emerald-400'
  const barColor = count === 0 ? '#4b5563' : count < 5 ? '#f59e0b' : '#22c55e'
  const pct = maxCount > 0 ? Math.min(100, (count / maxCount) * 100) : 0
  const brandModel = [machine.marca, machine.modelo].filter(Boolean).join(' · ')
  // Sub-línea: área (si viene de vista multi-área) o marca/modelo
  const subline = areaLabel || brandModel

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className={[
        'w-full flex items-center gap-2.5 px-3 py-[7px] text-left cursor-pointer',
        'border-b border-border/20 last:border-b-0',
        'transition-colors duration-100 group relative',
        isActive ? 'bg-primary/8' : 'hover:bg-muted/25',
      ].join(' ')}
    >
      {/* Indicador activo */}
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary" />
      )}

      {/* Dot de color del equipo */}
      <span
        className="h-[9px] w-[9px] rounded-full shrink-0"
        style={{ backgroundColor: accent }}
      />

      {/* Columna principal */}
      <div className="flex-1 min-w-0">
        {/* Línea 1: nombre */}
        {canEdit && onRename ? (
          <InlineEditName
            value={machine.nombre}
            onSave={onRename}
            canEdit
            className="w-full"
            textClassName={`text-[11.5px] leading-snug font-medium truncate ${
              isActive ? 'text-primary' : 'text-foreground group-hover:text-primary'
            }`}
          />
        ) : (
          <span className={`block text-[11.5px] leading-snug font-medium truncate transition-colors ${
            isActive ? 'text-primary' : 'text-foreground group-hover:text-primary'
          }`}>
            {machine.nombre}
          </span>
        )}
        {/* Línea 2: área/marca */}
        {subline && (
          <span className="block text-[9.5px] text-muted-foreground/70 truncate leading-tight mt-px">
            {subline}
          </span>
        )}
      </div>

      {/* Barra + contador de repuestos */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="w-14 h-[3px] rounded-full bg-muted/50 overflow-hidden hidden sm:block">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
        <span className={`text-[10px] font-bold tabular-nums w-5 text-right ${countColor}`}>
          {count}
        </span>
      </div>

      {/* Botón eliminar */}
      {canEdit && onDelete && (
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (!confirm(`¿Eliminar "${machine.nombre}" de equipos manuales?`)) return
            setDeleting(true)
            try { await onDelete(machine.id) } finally { setDeleting(false) }
          }}
          disabled={deleting}
          className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
          title="Eliminar equipo manual"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        </button>
      )}

      <ChevronRight className={`h-3 w-3 shrink-0 transition-colors ${
        isActive ? 'text-primary' : 'text-muted-foreground/25 group-hover:text-primary/50'
      }`} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   GlobalSearchDropdown — dropdown flotante (portal) de búsqueda global
   ═══════════════════════════════════════════════════════════════ */
const GlobalSearchDropdown = forwardRef<HTMLDivElement, {
  anchorRef: React.RefObject<HTMLDivElement | null>
  results: GlobalEquipmentResult[]
  loading: boolean
  searchQuery: string
  sidebarNodeMap: Map<string, AreaTreeNode>
  repuestosCounts: Record<string, number>
  onSelect: (r: GlobalEquipmentResult) => void
}>(({ anchorRef, results, loading, searchQuery, sidebarNodeMap, repuestosCounts, onSelect }, ref) => {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    const update = () => {
      if (!anchorRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.min(Math.max(rect.width, 480), window.innerWidth - rect.left - 16) })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef])

  return (
    <div
      ref={ref}
      className="bg-popover border border-border rounded-lg shadow-xl max-h-80 overflow-y-auto"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
    >
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
        </div>
      ) : results.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Sin resultados para "{searchQuery}"
        </div>
      ) : (
        <>
          <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 sticky top-0">
            {results.length} equipo{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
          </div>
          {results.map(r => {
            const breadcrumb = (r.path ?? [])
              .map(id => sidebarNodeMap.get(id)?.nombre)
              .filter(Boolean)
              .join(' › ')
            const repCount = r.linkedMachineId ? (repuestosCounts[r.linkedMachineId] || 0) : 0

            return (
              <button
                key={r.id}
                onClick={() => onSelect(r)}
                className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {r.alias || r.nombre}
                  </span>
                  {r.codigo && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded shrink-0">
                      {r.codigo}
                    </span>
                  )}
                  {repCount > 0 ? (
                    <span className="text-[9px] font-bold tabular-nums text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                      {repCount} rep.
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground/40 shrink-0">
                      0 rep.
                    </span>
                  )}
                </div>
                {breadcrumb && (
                  <div className="flex items-center gap-1 mt-0.5 ml-5">
                    <MapPin className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                    <span className="text-[10px] text-muted-foreground truncate">
                      {breadcrumb}
                    </span>
                  </div>
                )}
                {r.alias && r.nombre !== r.alias && (
                  <div className="text-[10px] text-muted-foreground/70 ml-5 truncate">
                    {r.nombre}
                  </div>
                )}
              </button>
            )
          })}
        </>
      )}
    </div>
  )
})

/* ═══════════════════════════════════════════════════════════════
   Componente Principal
   ═══════════════════════════════════════════════════════════════ */
const FAV_MACHINES_KEY = 'equipment-favorite-machines'
const FAV_LISTS_KEY = 'equipment-favorite-lists'

export type { FavList } from '@/services/userPreferences'

function loadFavListsLocal(): import('@/services/userPreferences').FavList[] {
  try {
    const raw = localStorage.getItem(FAV_LISTS_KEY)
    if (raw) return JSON.parse(raw)
    const oldRaw = localStorage.getItem(FAV_MACHINES_KEY)
    if (oldRaw) {
      const oldIds: string[] = JSON.parse(oldRaw)
      if (oldIds.length > 0) return [{ name: 'Favoritos', machineIds: oldIds }]
    }
    return []
  } catch { return [] }
}

function isMachineInAnyList(lists: import('@/services/userPreferences').FavList[], machineId: string): string | null {
  for (const list of lists) {
    if (list.machineIds.includes(machineId)) return list.name
  }
  return null
}

export function EquipmentNavigator({
  repuestosCounts = {},
  className = '',
  onCategoryChange,
  onEquipmentSelect,
  onFavoriteMachinesChange,
}: EquipmentNavigatorProps) {
  const currentMachine = useCurrentMachine()
  const activeMachines = useActiveMachines()
  const { setCurrentMachine, clearCurrentMachine } = useMachineContext()
  const isAdmin = useIsAdmin()

  // ── Máquinas favoritas (listas múltiples — Firestore + localStorage fallback) ──
  const currentUser = useAuthStore(s => s.user)
  const [favLists, setFavLists] = useState<FavList[]>(loadFavListsLocal)
  const [favDropdown, setFavDropdown] = useState<{ machineId: string; anchorRect: DOMRect; displayName: string } | null>(null)
  const [newListName, setNewListName] = useState('')
  const favLoadedRef = useRef(false)

  // Cargar favoritos desde Firestore al montar (migra localStorage si es primera vez)
  useEffect(() => {
    if (!currentUser || favLoadedRef.current) return
    favLoadedRef.current = true
    getUserPreferences(currentUser.id).then(prefs => {
      if (prefs.favoriteLists.length > 0) {
        setFavLists(prefs.favoriteLists)
      } else {
        // Migrar localStorage a Firestore si hay datos locales
        const local = loadFavListsLocal()
        if (local.length > 0) {
          saveFavoriteLists(currentUser.id, local)
        }
      }
    })
  }, [currentUser])

  // Set plano de todos los IDs favoritos (para UI rápida)
  const favMachineIds = useMemo(() => {
    const s = new Set<string>()
    for (const l of favLists) for (const id of l.machineIds) s.add(id)
    return s
  }, [favLists])

  const persistFavs = useCallback((lists: FavList[]) => {
    localStorage.setItem(FAV_LISTS_KEY, JSON.stringify(lists))
    if (currentUser) saveFavoriteLists(currentUser.id, lists)
  }, [currentUser])

  const handleFavStarClick = useCallback((machineId: string, e: React.MouseEvent, displayName?: string) => {
    const inList = isMachineInAnyList(favLists, machineId)
    if (inList) {
      const next = favLists.map(l => ({ ...l, machineIds: l.machineIds.filter(id => id !== machineId) })).filter(l => l.machineIds.length > 0)
      setFavLists(next)
      persistFavs(next)
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setFavDropdown({ machineId, anchorRect: rect, displayName: displayName || machineId })
      setNewListName('')
    }
  }, [favLists, persistFavs])

  // Resolver nombre de equipo desde cache global (alias tiene prioridad)
  const resolveEquipName = useCallback((machineId: string): string => {
    const eq = getGlobalEquipmentCache()
    if (eq) {
      const e = eq.find(x => (x.linkedMachineId || x.id) === machineId)
      if (e) return e.alias || e.nombre
    }
    return machineId
  }, [])

  const addToList = useCallback((listName: string, machineId: string, nameOverride?: string) => {
    const displayName = nameOverride || resolveEquipName(machineId)
    setFavLists(prev => {
      const existing = prev.find(l => l.name === listName)
      let next: FavList[]
      if (existing) {
        if (existing.machineIds.includes(machineId)) return prev
        const names = { ...existing.machineNames, [machineId]: displayName }
        next = prev.map(l => l.name === listName ? { ...l, machineIds: [...l.machineIds, machineId], machineNames: names } : l)
      } else {
        next = [...prev, { name: listName, machineIds: [machineId], machineNames: { [machineId]: displayName } }]
      }
      persistFavs(next)
      return next
    })
    setFavDropdown(null)
  }, [resolveEquipName, persistFavs])


  // Notificar al padre cuando cambian favoritos (con nombres de equipos + listas)
  // Se re-ejecuta con un timer para esperar que el cache global se llene
  const favNotifiedRef = useRef(false)
  useEffect(() => {
    if (!onFavoriteMachinesChange) return
    if (favMachineIds.size === 0) {
      onFavoriteMachinesChange(new Map())
      favNotifiedRef.current = true
      return
    }
    const notify = () => {
      const eq = getGlobalEquipmentCache()
      if (!eq || eq.length === 0) return false
      // Construir lookup de nombres guardados en listas
      const savedNames = new Map<string, string>()
      for (const list of favLists) {
        if (list.machineNames) {
          for (const [id, name] of Object.entries(list.machineNames)) savedNames.set(id, name)
        }
      }
      const map = new Map<string, { nombre: string; equipmentId: string; listName?: string }>()
      for (const e of eq) {
        const favKey = e.linkedMachineId || e.id
        if (favMachineIds.has(favKey) && !map.has(favKey)) {
          const listName = isMachineInAnyList(favLists, favKey)
          // Prioridad: alias fresco > nombre guardado > nombre SAP
          const nombre = e.alias || savedNames.get(favKey) || e.nombre
          map.set(favKey, { nombre, equipmentId: e.id, listName: listName || undefined })
        }
      }
      onFavoriteMachinesChange(map)
      return true
    }
    if (notify()) { favNotifiedRef.current = true; return }
    // Cache no listo aún — reintentar
    const timer = setInterval(() => { if (notify()) { favNotifiedRef.current = true; clearInterval(timer) } }, 500)
    return () => clearInterval(timer)
  }, [favMachineIds, favLists, onFavoriteMachinesChange])

  // Hooks nuevos: árbol de áreas + equipos del área seleccionada
  const { areaTree, loading: areaTreeLoading, expandNode, findNode, getNodePath } = useHierarchyAreaTree()

  const [adminMode, setAdminMode] = useState(false)
  const [quickAddNode, setQuickAddNode] = useState<{ id: string; name: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const searchDropdownRef = useRef<HTMLDivElement>(null)
  const { results: globalSearchResults, loading: globalSearchLoading } = useGlobalEquipmentSearch(searchQuery)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showAllAreas, setShowAllAreas] = useState(false)
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({})
  const [favoritesMode, setFavoritesMode] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY_FAV)
      if (s) return new Set(JSON.parse(s) as string[])
    } catch { /* noop */ }
    return new Set<string>()
  })
  // selectedTreeNode: id del nodo del árbol seleccionado (null = todos / sin árbol)
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState<string | null>(() => {
    try { return localStorage.getItem('repuestos-nav-node') } catch { return null }
  })
  const treeAutoInitRef = useRef(false)
  // Nodos que el usuario cerró manualmente → el efecto openAncestors no los vuelve a abrir
  const userClosedNodesRef = useRef<Set<string>>(new Set())
  // Target anterior del efecto openAncestors → si cambia la selección, limpiamos el set
  const prevAncestorTargetRef = useRef<string | null>(null)

  // ── Sidebar tree = areaTree (sin poda, todas las áreas) ──
  // Saltamos el nodo raíz si es único (CHONCHI → mostrar sus hijos directamente)
  const sidebarTree = useMemo(() => {
    if (areaTree.length === 1 && areaTree[0]!.children.length > 0) {
      return areaTree[0]!.children
    }
    return areaTree
  }, [areaTree])

  // ── Árbol filtrado por favoritos ──
  const visibleSidebarTree = useMemo(() =>
    favoritesMode && favoriteIds.size > 0
      ? filterForFavorites(sidebarTree, favoriteIds)
      : sidebarTree,
    [sidebarTree, favoritesMode, favoriteIds],
  )

  // ── Flat map del sidebar tree para lookups rápidos ──
  const sidebarNodeMap = useMemo(() => {
    const map = new Map<string, AreaTreeNode>()
    function walk(nodes: AreaTreeNode[]) {
      for (const n of nodes) { map.set(n.id, n); walk(n.children) }
    }
    walk(sidebarTree)
    return map
  }, [sidebarTree])

  // ── Mapa de repuestos totales por área (para sidebar) ──
  // Suma repuestosCounts de todos los equipos cuyo path incluye cada área
  const areaRepuestosCounts = useMemo(() => {
    const result: Record<string, number> = { ...repuestosCounts }
    const equipment = getGlobalEquipmentCache()
    if (!equipment) return result

    // Conteo de equipos visibles por área
    // Solo contar equipos de primer nivel: cuyo parentId es un área conocida en el sidebar
    // y que tengan código numérico (no vacío)
    // Cada equipo se cuenta SOLO en su área padre directa (parentId),
    // luego se acumula hacia arriba por el árbol de áreas.
    const areaDirectCount = new Map<string, number>()
    for (const eq of equipment) {
      if (eq.oculto) continue
      if (!eq.parentId || !sidebarNodeMap.has(eq.parentId)) continue
      areaDirectCount.set(eq.parentId, (areaDirectCount.get(eq.parentId) || 0) + 1)
    }
    // Acumular recursivamente: cada área suma sus equipos directos + los de sub-áreas
    const areaEqCount = new Map<string, number>()
    function accumulateEqCount(node: AreaTreeNode): number {
      let total = areaDirectCount.get(node.id) || 0
      for (const child of node.children) {
        total += accumulateEqCount(child)
      }
      areaEqCount.set(node.id, total)
      return total
    }
    for (const root of sidebarTree) {
      accumulateEqCount(root)
    }
    for (const [areaId, total] of areaEqCount) {
      result[`__eqcount_${areaId}`] = total
    }

    // Repuestos por área — deduplicar por linkedMachineId para no contar
    // la misma máquina múltiples veces cuando varios equipos SAP comparten una
    if (Object.keys(repuestosCounts).length > 0) {
      // Track which linkedMachineId ya se contó en cada área
      const areaCountedMachines = new Map<string, Set<string>>()
      const areaTotals = new Map<string, number>()
      for (const eq of equipment) {
        if (!eq.linkedMachineId) continue
        const count = repuestosCounts[eq.linkedMachineId] || 0
        if (count === 0) continue
        const areaIds = new Set([...(eq.path || []), eq.parentId].filter(Boolean) as string[])
        for (const areaId of areaIds) {
          if (!areaCountedMachines.has(areaId)) areaCountedMachines.set(areaId, new Set())
          const counted = areaCountedMachines.get(areaId)!
          if (counted.has(eq.linkedMachineId)) continue // ya contada en esta área
          counted.add(eq.linkedMachineId)
          areaTotals.set(areaId, (areaTotals.get(areaId) || 0) + count)
        }
      }
      for (const [areaId, total] of areaTotals) {
        result[`__area_${areaId}`] = total
      }
    }
    return result
  }, [repuestosCounts, sidebarNodeMap, sidebarTree])

  // ── Estado: nodo activo ──
  // Hook de equipos para el área seleccionada
  const [refreshKey, setRefreshKey] = useState(0)
  const { equipment: areaEquipment, loading: equipmentLoading } = useEquipmentForArea(selectedTreeNodeId, refreshKey)

  // ── Toggle colapsar/expandir todos los equipos ──
  const [allEquipmentExpanded, setAllEquipmentExpanded] = useState<boolean | undefined>(undefined)

  // ── Agregar equipo en área ──
  const [addingEquipment, setAddingEquipment] = useState(false)
  const [newEqName, setNewEqName] = useState('')
  const [newEqCode, setNewEqCode] = useState('')
  const [savingNewEq, setSavingNewEq] = useState(false)
  const newEqInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingEquipment) newEqInputRef.current?.focus()
  }, [addingEquipment])

  const handleAddEquipmentToArea = useCallback(async () => {
    const name = newEqName.trim()
    if (!name || !selectedTreeNodeId) return
    const selNode = sidebarNodeMap.get(selectedTreeNodeId)
    setSavingNewEq(true)
    try {
      const nextLevel = selNode ? (selNode as any).nivel + 1 : 5
      const docData = {
        nombre: name.toUpperCase(),
        codigo: newEqCode.trim(),
        nivel: nextLevel,
        parentId: selectedTreeNodeId,
        path: [...(selNode as any)?.path || [], selectedTreeNodeId],
        orden: areaEquipment.length,
        activo: true,
        creadoPor: 'admin',
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      }
      await addDoc(firestoreCollection(db, 'hierarchy'), docData)
      invalidateEquipmentCache(selectedTreeNodeId)
      setRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Error al agregar equipo:', err)
    } finally {
      setSavingNewEq(false)
      setAddingEquipment(false)
      setNewEqName('')
      setNewEqCode('')
    }
  }, [newEqName, newEqCode, selectedTreeNodeId, sidebarNodeMap, areaEquipment.length])

  // ── Ocultar/mostrar equipos ──
  const [showHidden, setShowHidden] = useState(false)

  const handleToggleHidden = useCallback(async (equipmentId: string, hidden: boolean) => {
    try {
      await updateDoc(doc(db, 'hierarchy', equipmentId), {
        oculto: hidden,
        actualizadoEn: Timestamp.now(),
      })
      invalidateEquipmentCache(selectedTreeNodeId ?? undefined)
      setRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Error toggling hidden', err)
    }
  }, [selectedTreeNodeId])

  // ── Eliminar equipo SAP (con clave admin) ──
  const handleDeleteEquipment = useCallback(async (equipmentId: string, name: string) => {
    const clave = prompt(`Para eliminar "${name}", ingresa la clave de administrador:`)
    if (!clave) return
    try {
      const correctPwd = await getHmiTooltipPwd()
      if (clave !== correctPwd) {
        alert('Clave incorrecta')
        return
      }
      if (!confirm(`¿Estás seguro de eliminar "${name}" permanentemente?`)) return
      await deleteDoc(doc(db, 'hierarchy', equipmentId))
      invalidateEquipmentCache(selectedTreeNodeId ?? undefined)
      setRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Error deleting equipment', err)
      alert('Error al eliminar')
    }
  }, [selectedTreeNodeId])

  // ── Reordenar equipos ──
  const [reorderMode, setReorderMode] = useState(false)

  const handleMoveEquipment = useCallback(async (equipmentId: string, direction: 'up' | 'down') => {
    const idx = areaEquipment.findIndex(eq => eq.id === equipmentId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= areaEquipment.length) return

    const eqA = areaEquipment[idx]!
    const eqB = areaEquipment[swapIdx]!

    try {
      await Promise.all([
        updateDoc(doc(db, 'hierarchy', eqA.id), { orden: swapIdx, actualizadoEn: Timestamp.now() }),
        updateDoc(doc(db, 'hierarchy', eqB.id), { orden: idx, actualizadoEn: Timestamp.now() }),
      ])
      invalidateEquipmentCache(selectedTreeNodeId ?? undefined)
      setRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Error reordering equipment', err)
    }
  }, [areaEquipment, selectedTreeNodeId])

  // ── Vinculación máquinas ↔ equipos SAP ──
  const { softDeleteMachine } = useLinkMachine()

  // Vinculación deshabilitada — todas las máquinas ya vinculadas

  // Auto-abrir ancestros del nodo seleccionado
  useEffect(() => {
    if (!sidebarTree.length || !selectedTreeNodeId) return

    // Al cambiar la selección, limpiar el registro de nodos cerrados manualmente
    if (prevAncestorTargetRef.current !== selectedTreeNodeId) {
      prevAncestorTargetRef.current = selectedTreeNodeId
      userClosedNodesRef.current.clear()
    }

    const path = getNodePath(selectedTreeNodeId)
    if (path.length > 0) {
      setOpenNodes(prev => {
        const next = { ...prev }
        // Abrir todos los ancestros menos el último (el seleccionado)
        path.slice(0, -1).forEach(n => {
          if (!userClosedNodesRef.current.has(n.id)) next[n.id] = true
        })
        return next
      })
    }
  }, [sidebarTree, selectedTreeNodeId, getNodePath])

  // ── Persistir selección en localStorage ──
  useEffect(() => {
    try {
      if (selectedTreeNodeId) localStorage.setItem('repuestos-nav-node', selectedTreeNodeId)
      else localStorage.removeItem('repuestos-nav-node')
    } catch { /* noop */ }
  }, [selectedTreeNodeId])

  // ── Inicializar favoritos por defecto (nodos hoja con máquinas) ──
  useEffect(() => {
    if (!sidebarTree.length || favoriteIds.size > 0) return
    const defaults = getDefaultFavorites(sidebarTree)
    if (!defaults.size) return
    setFavoriteIds(defaults)
    try { localStorage.setItem(STORAGE_KEY_FAV, JSON.stringify([...defaults])) } catch { /* noop */ }
  }, [sidebarTree]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle favorito ──
  const toggleFavorite = useCallback((nodeId: string) => {
    setFavoriteIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      try { localStorage.setItem(STORAGE_KEY_FAV, JSON.stringify([...next])) } catch { /* noop */ }
      return next
    })
  }, [])

  // ── Auto-abrir y seleccionar primer área al cargar el árbol ──
  useEffect(() => {
    if (treeAutoInitRef.current || !sidebarTree.length) return
    if (selectedTreeNodeId) return  // ya hay selección guardada
    treeAutoInitRef.current = true

    // Seleccionar el primer nodo con equipos
    function findFirstWithEquipment(nodes: AreaTreeNode[]): AreaTreeNode | null {
      for (const n of nodes) {
        if (n.equipmentCount > 0) return n
        const found = findFirstWithEquipment(n.children)
        if (found) return found
      }
      return null
    }

    const leaf = findFirstWithEquipment(sidebarTree) ?? sidebarTree[0]!

    const path = getNodePath(leaf.id)
    setOpenNodes(prev => {
      const next = { ...prev }
      path.slice(0, -1).forEach(n => { next[n.id] = true })
      return next
    })

    setSelectedTreeNodeId(leaf.id)
    setShowAllAreas(false)
    onCategoryChange?.(leaf.id)
  }, [sidebarTree, selectedTreeNodeId, onCategoryChange, getNodePath])

  // Equipos del área — filtrar ocultos si no se pide verlos
  const hiddenCount = useMemo(() => areaEquipment.filter(eq => eq.oculto).length, [areaEquipment])
  const filteredEquipment = useMemo(() =>
    showHidden ? areaEquipment : areaEquipment.filter(eq => !eq.oculto),
    [areaEquipment, showHidden],
  )

  // ── Máquinas del área (para compatibilidad con MachineCard existente) ──
  const machinesInArea = useMemo(() => {
    if (showAllAreas) return activeMachines
    if (!selectedTreeNodeId) return activeMachines
    // Filtrar máquinas cuyo hierarchyNodeId coincide con el nodo seleccionado
    return activeMachines.filter(m => m.hierarchyNodeId === selectedTreeNodeId)
  }, [showAllAreas, activeMachines, selectedTreeNodeId])

  // ── Handlers ──
  const handleSelectTreeNode = useCallback((node: AreaTreeNode) => {
    setSelectedTreeNodeId(node.id)
    setShowAllAreas(false)
    setSearchQuery('')
    clearCurrentMachine()
    onCategoryChange?.(node.id)
  }, [clearCurrentMachine, onCategoryChange])

  const handleSelectAll = useCallback(() => {
    setShowAllAreas(true)
    setSelectedTreeNodeId(null)
    setSearchQuery('')
    clearCurrentMachine()
    onCategoryChange?.(null)
  }, [clearCurrentMachine, onCategoryChange])

  const toggleNode = useCallback((nodeId: string) => {
    setOpenNodes(prev => {
      const wasOpen = !!prev[nodeId]
      const nextOpen = !wasOpen
      // Registrar intención del usuario para que openAncestors la respete
      if (nextOpen) userClosedNodesRef.current.delete(nodeId)
      else          userClosedNodesRef.current.add(nodeId)
      return { ...prev, [nodeId]: nextOpen }
    })
  }, [])

  const handleRenameMachine = useCallback(async (machineId: string, newName: string) => {
    await updateDoc(doc(db, 'machines', machineId), { nombre: newName, updatedAt: Timestamp.now() })
  }, [])

  // Handler para click en equipo SAP
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentDisplayNode | null>(null)
  const handleSelectEquipment = useCallback((eq: EquipmentDisplayNode) => {
    setSelectedEquipment(eq)
    onEquipmentSelect?.({ id: eq.id, nombre: eq.nombre, alias: eq.alias, codigo: eq.codigo })
    if (eq.linkedMachineId) {
      setCurrentMachine(eq.linkedMachineId)
    } else {
      clearCurrentMachine()
    }
  }, [setCurrentMachine, clearCurrentMachine, onEquipmentSelect])

  // Helper: buscar equipo en el árbol por ID
  function findEquipmentInTree(nodes: EquipmentDisplayNode[], id: string): EquipmentDisplayNode | null {
    for (const eq of nodes) {
      if (eq.id === id) return eq
      const found = findEquipmentInTree(eq.children, id)
      if (found) return found
    }
    return null
  }

  // Handler para seleccionar un equipo desde la búsqueda global
  const handleGlobalSearchSelect = useCallback((result: GlobalEquipmentResult) => {
    // El path del equipo contiene IDs desde raíz → el parentId es el área directa
    // Recorremos el path para encontrar el área padre más cercana en el sidebar tree
    const pathIds = result.path ?? []

    // Buscar el área padre: recorrer el path de atrás hacia adelante
    // y encontrar el primer nodo que exista en el sidebar tree (es un área)
    let targetAreaId: string | null = null
    for (let i = pathIds.length - 1; i >= 0; i--) {
      if (sidebarNodeMap.has(pathIds[i]!)) {
        targetAreaId = pathIds[i]!
        break
      }
    }
    // Fallback: si no encontramos en path, usar parentId directo
    if (!targetAreaId && result.parentId && sidebarNodeMap.has(result.parentId)) {
      targetAreaId = result.parentId
    }

    if (targetAreaId) {
      // Abrir ancestros del área en el sidebar
      const nodePath = getNodePath(targetAreaId)
      setOpenNodes(prev => {
        const next = { ...prev }
        nodePath.forEach(n => { next[n.id] = true })
        return next
      })
      // Seleccionar el área
      setSelectedTreeNodeId(targetAreaId)
      setShowAllAreas(false)
      onCategoryChange?.(targetAreaId)
    }

    // Limpiar búsqueda y cerrar dropdown
    setSearchQuery('')
    setSearchFocused(false)

    // Intentar seleccionar el equipo inmediatamente si ya está cargado
    const existingEq = findEquipmentInTree(areaEquipment, result.id)
    if (existingEq) {
      handleSelectEquipment(existingEq)
    } else {
      // Guardar el ID para auto-seleccionar tras la carga del área
      pendingEquipmentSelectRef.current = result.id
      if (result.linkedMachineId) {
        setCurrentMachine(result.linkedMachineId)
      } else {
        clearCurrentMachine()
      }
      onEquipmentSelect?.({ id: result.id, nombre: result.nombre, alias: result.alias, codigo: result.codigo })
    }
  }, [sidebarNodeMap, getNodePath, onCategoryChange, setCurrentMachine, clearCurrentMachine, onEquipmentSelect, areaEquipment, handleSelectEquipment])

  // Ref para auto-seleccionar equipo tras carga del área
  const pendingEquipmentSelectRef = useRef<string | null>(null)

  // Efecto: auto-seleccionar equipo cuando se carguen los equipos del área
  useEffect(() => {
    const pendingId = pendingEquipmentSelectRef.current
    if (!pendingId || !areaEquipment.length) return

    function findInTree(nodes: EquipmentDisplayNode[]): EquipmentDisplayNode | null {
      for (const eq of nodes) {
        if (eq.id === pendingId) return eq
        const found = findInTree(eq.children)
        if (found) return found
      }
      return null
    }
    const found = findInTree(areaEquipment)
    if (found) {
      setSelectedEquipment(found)
      pendingEquipmentSelectRef.current = null
    }
  }, [areaEquipment])

  // Cerrar dropdown al hacer clic fuera (excluir el portal del dropdown)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (searchContainerRef.current?.contains(target)) return
      if (searchDropdownRef.current?.contains(target)) return
      setSearchFocused(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Loading state ──
  if (areaTreeLoading && sidebarTree.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        Cargando jerarquía...
      </div>
    )
  }

  /* ═══ ADMIN MODE ═══ */
  if (adminMode) {
    return (
      <div className={`rounded-xl border border-primary/30 bg-card overflow-hidden ${className}`}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/20">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Administrar Estructura</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full hidden sm:inline">
              Crea, edita y asigna áreas a los equipos
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAdminMode(false)} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Cerrar
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <MachineManager
            defaultNodeId={quickAddNode?.id}
            defaultNodeName={quickAddNode?.name}
            onCreated={() => setQuickAddNode(null)}
          />
        </div>
      </div>
    )
  }

  /* ═══ BROWSE MODE ═══ */
  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`}>

      {/* ── HEADER (siempre visible) ── */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border bg-muted/10 flex-wrap">

        {/* Toggle sidebar (desktop) */}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          className="hidden sm:flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
          title={sidebarCollapsed ? 'Mostrar áreas' : 'Ocultar áreas'}
        >
          {sidebarCollapsed
            ? <ChevronsRight className="h-3.5 w-3.5" />
            : <ChevronsLeft className="h-3.5 w-3.5" />
          }
        </button>

        {/* Search with global dropdown */}
        <div ref={searchContainerRef} className="relative flex-1 min-w-0" style={{ maxWidth: 280 }}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
          <Input
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchFocused(true) }}
            onFocus={() => setSearchFocused(true)}
            placeholder="Buscar equipo en toda la planta…"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchFocused(false) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
            >
              <X className="h-3 w-3" />
            </button>
          )}

          {/* Global search dropdown (portal para escapar overflow-hidden) */}
          {searchFocused && searchQuery.trim().length >= 2 && createPortal(
            <GlobalSearchDropdown
              ref={searchDropdownRef}
              anchorRef={searchContainerRef}
              results={globalSearchResults}
              loading={globalSearchLoading}
              searchQuery={searchQuery}
              sidebarNodeMap={sidebarNodeMap}
              repuestosCounts={repuestosCounts}
              onSelect={handleGlobalSearchSelect}
            />,
            document.body,
          )}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground min-w-0 flex-1 overflow-hidden">
          {showAllAreas ? (
            <span className="font-medium text-foreground">Todos los equipos</span>
          ) : selectedTreeNodeId ? (
            <>
              {getNodePath(selectedTreeNodeId).map((n, i, arr) => (
                <span key={n.id} className="flex items-center gap-0.5 min-w-0 shrink-0">
                  {i > 0 && <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-30" />}
                  <span className={`truncate ${i === arr.length - 1 ? 'text-foreground font-medium' : 'opacity-60'}`}>
                    {n.nombre}
                  </span>
                </span>
              ))}
              {selectedEquipment && (
                <>
                  <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-30" />
                  <span className="text-primary font-medium truncate shrink-0">
                    {selectedEquipment.alias || selectedEquipment.nombre}
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="truncate">—</span>
          )}
        </div>

        {/* Count badge */}
        <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
          {areaEquipment.length}
        </span>

        {/* Colapsar/expandir todos los equipos */}
        <button
          onClick={() => setAllEquipmentExpanded(v => v === undefined ? false : !v)}
          title={allEquipmentExpanded === false ? 'Expandir todos los equipos' : 'Contraer todos los equipos'}
          className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        >
          {allEquipmentExpanded === false
            ? <Maximize2 className="h-3.5 w-3.5" />
            : <Minimize2 className="h-3.5 w-3.5" />
          }
        </button>

        {/* Favoritos toggle */}
        <button
          onClick={() => setFavoritesMode(v => !v)}
          title={favoritesMode ? 'Ver todas las áreas' : 'Ver solo favoritos'}
          className={[
            'flex items-center justify-center w-6 h-6 rounded transition-colors shrink-0',
            favoritesMode
              ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20'
              : 'text-muted-foreground hover:text-amber-400 hover:bg-muted/50',
          ].join(' ')}
        >
          <Star className={`h-3.5 w-3.5 ${favoritesMode ? 'fill-amber-400' : ''}`} />
        </button>

        {/* Botón Administrar estructura — deshabilitado (máquinas manuales ya vinculadas) */}
      </div>

      {/* ── MOBILE: pills de navegación jerárquica ── */}
      <div className="sm:hidden border-b border-border">
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide">
          <MobilePill
            label="Todos"
            count={0}
            isActive={showAllAreas}
            onClick={handleSelectAll}
          />
          {visibleSidebarTree.map(node => (
            <MobilePill
              key={node.id}
              label={node.nombre}
              count={node.equipmentCount}
              isActive={!showAllAreas && (
                selectedTreeNodeId === node.id ||
                getNodePath(selectedTreeNodeId ?? '').some(n => n.id === node.id)
              )}
              onClick={() => handleSelectTreeNode(node)}
            />
          ))}
        </div>

        {/* Nivel 2 — sub-áreas del nodo seleccionado */}
        {(() => {
          if (showAllAreas || !selectedTreeNodeId) return null
          const activePath = getNodePath(selectedTreeNodeId)
          const activeTopNode = activePath[0] ? findNode(activePath[0].id) : null
          if (!activeTopNode || !activeTopNode.children.length) return null
          const subNodes = activeTopNode.id === selectedTreeNodeId
            ? activeTopNode.children
            : activeTopNode.children
          if (!subNodes.length) return null
          return (
            <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-hide">
              {subNodes.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => handleSelectTreeNode(sub)}
                  className={[
                    'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shrink-0 transition-all border',
                    selectedTreeNodeId === sub.id
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-transparent text-muted-foreground border-border/40 hover:border-muted-foreground/40 hover:text-foreground',
                  ].join(' ')}
                >
                  <ChevronRight className="h-2.5 w-2.5 opacity-60 shrink-0" />
                  {sub.nombre}
                  {sub.equipmentCount > 0 && (
                    <span className="text-[9px] opacity-60 tabular-nums">{sub.equipmentCount}</span>
                  )}
                </button>
              ))}
            </div>
          )
        })()}
      </div>

      {/* ── BODY: sidebar + content ── */}
      <div className="flex">

        {/* ── SIDEBAR (desktop) ── */}
        <div
          style={{ width: sidebarCollapsed ? 0 : 400, minWidth: sidebarCollapsed ? 0 : 400 }}
          className={`
            hidden sm:flex flex-col border-r border-border bg-muted/5 shrink-0
            transition-all duration-200
            ${sidebarCollapsed ? 'overflow-hidden border-r-0' : ''}
          `}
        >
          <div className="flex-1 overflow-y-auto overflow-x-scroll py-0.5 [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]">
          <div className="min-w-max">

            {/* Todos */}
            <SidebarAreaItem
              label="Todos los equipos"
              count={activeMachines.length}
              isActive={showAllAreas}
              onClick={handleSelectAll}
            />

            <div className="my-0.5 mx-1.5 border-t border-border/40" />

            {/* Árbol multi-nivel — todas las áreas */}
            {visibleSidebarTree.map(plantNode => (
              <SidebarTreeNodeView
                key={plantNode.id}
                node={plantNode}
                openNodes={openNodes}
                onToggle={toggleNode}
                onSelect={handleSelectTreeNode}
                selectedId={selectedTreeNodeId}
                showAllAreas={showAllAreas}

                onExpandNode={expandNode}
                onAddMachine={isAdmin ? (id, name) => {
                  setQuickAddNode({ id, name })
                  setAdminMode(true)
                } : undefined}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
                repuestosCounts={areaRepuestosCounts}
              />
            ))}

            {/* Skeleton cuando el árbol aún no cargó */}
            {visibleSidebarTree.length === 0 && areaTreeLoading && (
              <div className="px-3 py-2 flex flex-col gap-2 animate-pulse">
                {[0.6, 0.8, 0.5, 0.7, 0.45].map((w, i) => (
                  <div key={i} className="h-4 rounded bg-muted/60" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            )}
          </div>{/* /min-w-max */}
          </div>
        </div>

        {/* ── CONTENT: equipos SAP del área seleccionada ── */}
        <div className="flex-1 min-w-0 flex flex-col max-h-[65vh]">

          {/* Cabecera de contexto */}
          {(() => {
            const selNode = selectedTreeNodeId ? sidebarNodeMap.get(selectedTreeNodeId) : null
            const areaName = showAllAreas
              ? 'Todos los equipos'
              : selNode?.nombre ?? '—'
            const path = selectedTreeNodeId
              ? getNodePath(selectedTreeNodeId).map(n => n.nombre)
              : []
            return (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    {path.length > 1 && path.slice(0, -1).map((p, i) => (
                      <span key={i} className="text-[9px] text-muted-foreground/50 shrink-0">
                        {p} <span className="opacity-40">/</span>
                      </span>
                    ))}
                    <span className="text-[10px] font-semibold text-foreground">{areaName}</span>
                  </div>
                </div>
                <span className="text-[9px] font-bold tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                  {filteredEquipment.length} equipos
                </span>
                {isAdmin && hiddenCount > 0 && (
                  <button
                    onClick={() => setShowHidden(v => !v)}
                    className={[
                      'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors shrink-0',
                      showHidden
                        ? 'bg-amber-500/15 text-amber-500'
                        : 'bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted',
                    ].join(' ')}
                    title={showHidden ? 'Ocultar equipos ocultos' : `Ver ${hiddenCount} oculto(s)`}
                  >
                    {showHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {hiddenCount}
                  </button>
                )}
                {isAdmin && selectedTreeNodeId && !showAllAreas && (
                  <>
                    <button
                      onClick={() => setReorderMode(v => !v)}
                      className={[
                        'flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0',
                        reorderMode
                          ? 'bg-primary/20 text-primary'
                          : 'hover:bg-primary/20 text-muted-foreground/50 hover:text-primary',
                      ].join(' ')}
                      title={reorderMode ? 'Salir de reordenar' : 'Reordenar equipos'}
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setAddingEquipment(true)}
                      className="flex items-center justify-center w-5 h-5 rounded hover:bg-primary/20 text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
                      title="Agregar equipo"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            )
          })()}

          {/* Formulario inline agregar equipo */}
          {addingEquipment && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-primary/20 bg-primary/5">
              <Plus className="h-3.5 w-3.5 text-primary/50 shrink-0" />
              <input
                ref={newEqInputRef}
                value={newEqName}
                onChange={e => setNewEqName(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddEquipmentToArea()
                  if (e.key === 'Escape') setAddingEquipment(false)
                }}
                placeholder="Nombre del equipo"
                className="flex-1 min-w-0 h-6 px-1.5 text-[11px] uppercase rounded border border-primary/40 bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <input
                value={newEqCode}
                onChange={e => setNewEqCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddEquipmentToArea()
                  if (e.key === 'Escape') setAddingEquipment(false)
                }}
                placeholder="Código (opc.)"
                className="w-24 h-6 px-1.5 text-[10px] font-mono rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button
                onClick={handleAddEquipmentToArea}
                disabled={savingNewEq || !newEqName.trim()}
                className="flex items-center justify-center w-6 h-6 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors shrink-0 disabled:opacity-40"
              >
                {savingNewEq ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </button>
              <button
                onClick={() => setAddingEquipment(false)}
                className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/50 text-muted-foreground transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {equipmentLoading ? (
            <div className="flex items-center justify-center gap-2 py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
              <span className="text-xs text-muted-foreground">Cargando equipos...</span>
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
              <Package className="h-7 w-7 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                Sin equipos en esta área
              </p>
              {selectedTreeNodeId && (
                <p className="text-[10px] text-muted-foreground/50">
                  Selecciona un sub-área con equipos
                </p>
              )}
            </div>
          ) : (
            /* ── LISTA DE EQUIPOS SAP ── */
            <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]">
              {filteredEquipment.map((eq, idx) => (
                <EquipmentCard
                  key={eq.id}
                  equipment={eq}
                  isActive={selectedEquipment?.id === eq.id || currentMachine?.id === eq.linkedMachineId}
                  onClick={handleSelectEquipment}
                  repuestosCounts={repuestosCounts}
                  isAdmin={isAdmin}
                  allExpanded={allEquipmentExpanded}
                  onAliasUpdated={() => { invalidateEquipmentCache(selectedTreeNodeId ?? undefined); setRefreshKey(k => k + 1) }}
                  onChildAdded={() => { invalidateEquipmentCache(selectedTreeNodeId ?? undefined); setRefreshKey(k => k + 1) }}
                  reorderMode={reorderMode}
                  isFirst={idx === 0}
                  isLast={idx === filteredEquipment.length - 1}
                  onMoveUp={() => handleMoveEquipment(eq.id, 'up')}
                  onMoveDown={() => handleMoveEquipment(eq.id, 'down')}
                  onToggleHidden={handleToggleHidden}
                  onDeleteEquipment={isAdmin ? handleDeleteEquipment : undefined}
                  isFavoriteMachine={favMachineIds.has(eq.linkedMachineId || eq.id)}
                  isFavoriteFn={(id: string) => favMachineIds.has(id)}
                  onToggleFavoriteMachine={handleFavStarClick}
                />
              ))}

              {/* Máquinas manuales vinculadas al área (sin match SAP) */}
              {machinesInArea.length > 0 && (
                <>
                  <div className="px-3 py-1.5 border-t border-border/30 bg-muted/5">
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Equipos manuales ({machinesInArea.length})
                    </span>
                  </div>
                  {machinesInArea.map(machine => (
                    <MachineCard
                      key={machine.id}
                      machine={machine}
                      isActive={currentMachine?.id === machine.id}
                      count={repuestosCounts[machine.id] || 0}
                      maxCount={Math.max(1, ...machinesInArea.map(m => repuestosCounts[m.id] || 0))}
                      onClick={() => {
                        setCurrentMachine(machine.id)
                        onCategoryChange?.(machine.hierarchyNodeId || null)
                      }}
                      canEdit={isAdmin}
                      onRename={n => handleRenameMachine(machine.id, n)}
                      onDelete={softDeleteMachine}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de vinculación — deshabilitado (todas las máquinas ya vinculadas) */}

      {/* Dropdown de selección de lista de favoritos */}
      {favDropdown && (
        <div className="fixed inset-0 z-50" onClick={() => setFavDropdown(null)}>
          <div
            className="absolute bg-card border border-border rounded-xl shadow-xl w-56 py-1"
            style={{ top: favDropdown.anchorRect.bottom + 4, left: Math.min(favDropdown.anchorRect.left, window.innerWidth - 240) }}
            onClick={e => e.stopPropagation()}
          >
            <p className="px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase">Agregar a lista</p>
            {favLists.map(list => (
              <button
                key={list.name}
                onClick={() => addToList(list.name, favDropdown.machineId, favDropdown.displayName)}
                className="w-full text-left px-3 py-2 text-[11px] text-foreground hover:bg-muted/30 transition-colors flex items-center gap-2"
              >
                <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 shrink-0" />
                {list.name}
                <span className="text-muted-foreground/50 ml-auto text-[9px]">{list.machineIds.length}</span>
              </button>
            ))}
            <div className="border-t border-border/50 mt-1 pt-1 px-3 py-1.5">
              <div className="flex items-center gap-1">
                <input
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newListName.trim()) {
                      addToList(newListName.trim(), favDropdown.machineId, favDropdown.displayName)
                      setNewListName('')
                    }
                  }}
                  placeholder="Nueva lista..."
                  className="flex-1 h-7 px-2 text-[11px] bg-muted/30 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground/50"
                  autoFocus
                />
                {newListName.trim() && (
                  <button
                    onClick={() => { addToList(newListName.trim(), favDropdown.machineId, favDropdown.displayName); setNewListName('') }}
                    className="h-7 px-2 text-[10px] bg-primary/10 text-primary rounded border border-primary/30 hover:bg-primary/20 transition-colors"
                  >
                    Crear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
