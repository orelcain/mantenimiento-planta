/**
 * AreaSidebar — Navegación área-first del hub de Repuestos.
 *
 * Lista las áreas de la jerarquía técnica (colección `hierarchy`) con conteo
 * de equipos, expandible. Es el eje del rediseño área-first: seleccionar un
 * área filtra repuestos + motores/bombas + KPIs del panel principal.
 *
 * Reutiliza useHierarchyAreaTree (mismo árbol que EquipmentNavigator).
 */
import { useMemo } from 'react'
import { ChevronRight, ChevronsLeft, Layers, Loader2, List, X, Star, Cog } from 'lucide-react'
import { useHierarchyAreaTree, type AreaTreeNode, type EquipmentLeaf } from '@/hooks/useHierarchyAreaTree'

/** Un equipo (hoja) es favorito si su clave (linkedMachineId || nodeId) está en el set. */
function isLeafFav(leaf: EquipmentLeaf, equipFavKeys?: Set<string>): boolean {
  return !!equipFavKeys && equipFavKeys.has(leaf.linkedMachineId || leaf.id)
}

/** Poda el árbol a las áreas favoritas, las que tienen equipos favoritos, o con descendientes favoritos. */
function filterForFavorites(nodes: AreaTreeNode[], favIds: Set<string>, equipFavKeys?: Set<string>): AreaTreeNode[] {
  const out: AreaTreeNode[] = []
  for (const node of nodes) {
    const filteredChildren = filterForFavorites(node.children, favIds, equipFavKeys)
    const hasFavEquip = node.equipment.some((e) => !e.oculto && isLeafFav(e, equipFavKeys))
    if (favIds.has(node.id) || hasFavEquip || filteredChildren.length > 0) {
      out.push({ ...node, children: filteredChildren })
    }
  }
  return out
}

interface AreaSidebarProps {
  selectedAreaId: string | null
  onSelectArea: (node: AreaTreeNode) => void
  /** Conteo de motores/bombas por nodeId (incl. descendientes) para el badge secundario. */
  assetCountByNode?: Record<string, number>
  /** Conteo de repuestos por nodeId (incl. descendientes) para el badge "N rep". */
  repCountByNode?: Record<string, number>
  /** Áreas favoritas (nodeIds) — compartido con "Por equipo" (localStorage hierarchy-favorites). */
  favoriteAreaIds?: Set<string>
  onToggleAreaFav?: (id: string) => void
  /** Mostrar solo áreas favoritas. */
  favoritesOnly?: boolean
  onToggleFavoritesOnly?: () => void
  /** Clic en un equipo (hoja) → filtrar la tabla a ese equipo. Si no se pasa, selecciona el área padre. */
  onSelectEquipment?: (areaNode: AreaTreeNode, leaf: EquipmentLeaf) => void
  /** Clave del equipo seleccionado (linkedMachineId || nodeId) para resaltarlo. */
  selectedEquipKey?: string | null
  /** Claves de equipos favoritos (linkedMachineId || nodeId) para la estrella + filtro de favoritos. */
  equipFavKeys?: Set<string>
  onToggleEquipFav?: (leaf: EquipmentLeaf) => void
  openNodes: Record<string, boolean>
  onToggleNode: (id: string) => void
  onShowAll: () => void
  showingAll: boolean
  /** Móvil: el sidebar es un drawer; controlado desde el hub. */
  mobileOpen?: boolean
  onMobileClose?: () => void
  /** Desktop: contraer el sidebar (oculta el panel, deja un edge-tab para reabrir). */
  collapsed?: boolean
  onToggleCollapse?: () => void
}

/** Cuenta equipos recursivos (propios + descendientes cargados). */
function countEquip(node: AreaTreeNode): number {
  let total = node.equipmentCount
  for (const c of node.children) total += countEquip(c)
  return total
}

/** Fila de equipo (hoja) bajo un área — clic filtra la tabla a ese equipo. */
function EquipmentRow({ leaf, depth, selected, onClick, isFav, onToggleFav }: {
  leaf: EquipmentLeaf; depth: number; selected: boolean; onClick: () => void; isFav?: boolean; onToggleFav?: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ paddingLeft: `${10 + depth * 14}px` }}
      className={[
        'group relative flex items-center gap-2 pr-2 py-2 cursor-pointer select-none border-l-2 transition-colors',
        selected
          ? 'border-l-primary bg-primary/10 text-primary'
          : 'border-l-transparent text-foreground/70 hover:bg-muted/40 hover:text-foreground',
      ].join(' ')}
      title={leaf.nombre}
    >
      <Cog className={['h-3.5 w-3.5 shrink-0', selected ? 'text-primary' : 'text-cyan-500/60'].join(' ')} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] leading-tight">{leaf.alias || leaf.nombre}</div>
        {leaf.codigo && (
          <div className="truncate font-mono text-[9px] leading-tight text-muted-foreground/60">{leaf.codigo}</div>
        )}
      </div>
      {onToggleFav && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav() }}
          className={[
            'shrink-0 rounded p-1 transition',
            // En táctil siempre visible (para poder marcar); en mouse, oculta hasta hover de la fila.
            isFav ? 'text-amber-400' : 'text-muted-foreground/30 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 hover:text-amber-400',
          ].join(' ')}
          title={isFav ? 'Quitar de favoritos' : 'Marcar equipo como favorito'}
          aria-label="Equipo favorito"
        >
          <Star className={['h-3 w-3', isFav ? 'fill-current' : ''].join(' ')} />
        </button>
      )}
    </div>
  )
}

function AreaRow({
  node, depth, selectedAreaId, onSelectArea, onSelectEquipment, selectedEquipKey, equipFavKeys, onToggleEquipFav, favoritesOnly, assetCountByNode, repCountByNode, favoriteAreaIds, onToggleAreaFav, openNodes, onToggleNode,
}: {
  node: AreaTreeNode; depth: number
} & Pick<AreaSidebarProps, 'selectedAreaId' | 'onSelectArea' | 'onSelectEquipment' | 'selectedEquipKey' | 'equipFavKeys' | 'onToggleEquipFav' | 'favoritesOnly' | 'assetCountByNode' | 'repCountByNode' | 'favoriteAreaIds' | 'onToggleAreaFav' | 'openNodes' | 'onToggleNode'>) {
  const isSelected = selectedAreaId === node.id
  const isOpen = !!openNodes[node.id]
  // Con "solo favoritos" activo, las hojas se limitan a equipos favoritos.
  const visibleEquip = node.equipment.filter((e) => !e.oculto && (!favoritesOnly || isLeafFav(e, equipFavKeys)))
  const hasChildren = node.children.length > 0 || node.hasMoreChildren || visibleEquip.length > 0
  const eqCount = countEquip(node)
  const assetCount = assetCountByNode?.[node.id] ?? 0
  const repCount = repCountByNode?.[node.id] ?? 0
  const isFav = !!favoriteAreaIds?.has(node.id)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectArea(node)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectArea(node) } }}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        className={[
          'group relative flex items-center gap-2 pr-2 py-2 cursor-pointer select-none',
          'border-l-2 transition-colors',
          isSelected
            ? 'border-l-primary bg-primary/10 text-primary'
            : 'border-l-transparent text-foreground/80 hover:bg-muted/50 hover:text-foreground',
        ].join(' ')}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleNode(node.id) }}
            className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted"
            aria-label={isOpen ? 'Colapsar' : 'Expandir'}
          >
            {node.isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
              : <ChevronRight className={['h-4 w-4 transition-transform', isOpen ? 'rotate-90' : ''].join(' ')} />}
          </button>
        ) : (
          <span className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center">
            <Layers className="h-3.5 w-3.5 opacity-50" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium leading-tight">{node.nombre}</div>
          {/* Meta en una sola línea (trunca si no entra). Orden por relevancia en Repuestos:
              equipos · rep · M/B → al truncar se corta primero el M/B (menos crítico). */}
          <div className="truncate text-[10px] leading-tight text-muted-foreground">
            <span className="tabular-nums">{eqCount} equipos</span>
            {repCount > 0 && (
              <span className="tabular-nums text-emerald-500"> · {repCount} rep</span>
            )}
            {assetCount > 0 && (
              <span className="tabular-nums text-cyan-500"> · {assetCount} M/B</span>
            )}
          </div>
        </div>

        {onToggleAreaFav && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleAreaFav(node.id) }}
            className={[
              'shrink-0 rounded p-1 transition',
              // En táctil siempre visible (para poder marcar); en mouse, oculta hasta hover de la fila.
              isFav ? 'text-amber-400' : 'text-muted-foreground/30 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 hover:text-amber-400',
            ].join(' ')}
            title={isFav ? 'Quitar de áreas favoritas' : 'Marcar área como favorita'}
            aria-label="Área favorita"
          >
            <Star className={['h-3.5 w-3.5', isFav ? 'fill-current' : ''].join(' ')} />
          </button>
        )}
      </div>

      {isOpen && (node.children.length > 0 || visibleEquip.length > 0) && (
        <div>
          {node.children.map((child) => (
            <AreaRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedAreaId={selectedAreaId}
              onSelectArea={onSelectArea}
              onSelectEquipment={onSelectEquipment}
              selectedEquipKey={selectedEquipKey}
              equipFavKeys={equipFavKeys}
              onToggleEquipFav={onToggleEquipFav}
              favoritesOnly={favoritesOnly}
              assetCountByNode={assetCountByNode}
              repCountByNode={repCountByNode}
              favoriteAreaIds={favoriteAreaIds}
              onToggleAreaFav={onToggleAreaFav}
              openNodes={openNodes}
              onToggleNode={onToggleNode}
            />
          ))}
          {visibleEquip.map((eq) => (
            <EquipmentRow
              key={eq.id}
              leaf={eq}
              depth={depth + 1}
              selected={!!selectedEquipKey && (selectedEquipKey === eq.id || selectedEquipKey === eq.linkedMachineId)}
              onClick={() => (onSelectEquipment ? onSelectEquipment(node, eq) : onSelectArea(node))}
              isFav={isLeafFav(eq, equipFavKeys)}
              onToggleFav={onToggleEquipFav ? () => onToggleEquipFav(eq) : undefined}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function AreaSidebar({
  selectedAreaId, onSelectArea, onSelectEquipment, selectedEquipKey, equipFavKeys, onToggleEquipFav, assetCountByNode, repCountByNode, favoriteAreaIds, onToggleAreaFav,
  favoritesOnly = false, onToggleFavoritesOnly, openNodes, onToggleNode, onShowAll, showingAll,
  mobileOpen = false, onMobileClose, collapsed = false, onToggleCollapse,
}: AreaSidebarProps) {
  const { areaTree, loading } = useHierarchyAreaTree()

  // Saltar la raíz única (CHONCHI) y mostrar sus hijos directamente, como EquipmentNavigator.
  const roots = useMemo(() => {
    const base = (areaTree.length === 1 && areaTree[0]!.children.length > 0) ? areaTree[0]!.children : areaTree
    // "Solo favoritos": conserva áreas favoritas o con equipos favoritos.
    if (favoritesOnly) {
      const favAreas = favoriteAreaIds ?? new Set<string>()
      const favEquip = equipFavKeys ?? new Set<string>()
      if (favAreas.size > 0 || favEquip.size > 0) return filterForFavorites(base, favAreas, favEquip)
    }
    return base
  }, [areaTree, favoritesOnly, favoriteAreaIds, equipFavKeys])

  // En móvil, seleccionar un área cierra el drawer
  const handleSelect = (node: AreaTreeNode) => { onSelectArea(node); onMobileClose?.() }
  const handleShowAll = () => { onShowAll(); onMobileClose?.() }

  return (
    <>
      {/* Backdrop móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 sm:hidden" onClick={onMobileClose} aria-hidden />
      )}
      <aside
        className={[
          // Móvil: fondo OPACO (drawer sobre el contenido); desktop: sutil translúcido.
          'flex h-full w-72 shrink-0 flex-col border-r border-border bg-card sm:bg-card/40',
          // Base (móvil): drawer fijo deslizable
          'fixed inset-y-0 left-0 z-40 shadow-xl transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: estático, siempre visible (oculto si está contraído)
          collapsed ? 'sm:hidden' : 'sm:static sm:z-auto sm:translate-x-0 sm:shadow-none',
        ].join(' ')}
      >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Áreas</span>
        <div className="flex items-center gap-1">
          {onToggleFavoritesOnly && (
            <button
              onClick={onToggleFavoritesOnly}
              className={['rounded p-1 transition', favoritesOnly ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'].join(' ')}
              title={favoritesOnly ? 'Ver todo' : 'Ver solo favoritos (áreas y equipos)'}
              aria-label="Solo favoritos"
            >
              <Star className={['h-4 w-4', favoritesOnly ? 'fill-current' : ''].join(' ')} />
            </button>
          )}
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} className="hidden rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground sm:block" title="Contraer panel de áreas" aria-label="Contraer áreas">
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
          <button onClick={onMobileClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden" aria-label="Cerrar áreas">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando áreas…
          </div>
        ) : roots.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">No hay áreas en la jerarquía.</div>
        ) : (
          roots.map((node) => (
            <AreaRow
              key={node.id}
              node={node}
              depth={0}
              selectedAreaId={selectedAreaId}
              onSelectArea={handleSelect}
              onSelectEquipment={onSelectEquipment}
              selectedEquipKey={selectedEquipKey}
              equipFavKeys={equipFavKeys}
              onToggleEquipFav={onToggleEquipFav}
              favoritesOnly={favoritesOnly}
              assetCountByNode={assetCountByNode}
              repCountByNode={repCountByNode}
              favoriteAreaIds={favoriteAreaIds}
              onToggleAreaFav={onToggleAreaFav}
              openNodes={openNodes}
              onToggleNode={onToggleNode}
            />
          ))
        )}
      </div>

      <button
        onClick={handleShowAll}
        className={[
          'flex items-center justify-center gap-2 border-t border-border px-3 py-2.5 text-xs font-medium transition-colors',
          showingAll ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        ].join(' ')}
      >
        <List className="h-3.5 w-3.5" /> Ver todas las áreas
      </button>
      </aside>
    </>
  )
}
