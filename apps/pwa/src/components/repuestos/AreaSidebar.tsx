/**
 * AreaSidebar — Navegación área-first del hub de Repuestos.
 *
 * Lista las áreas de la jerarquía técnica (colección `hierarchy`) con conteo
 * de equipos, expandible. Es el eje del rediseño área-first: seleccionar un
 * área filtra repuestos + motores/bombas + KPIs del panel principal.
 *
 * Reutiliza useHierarchyAreaTree (mismo árbol que EquipmentNavigator).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronsLeft, ChevronsDownUp, Layers, Loader2, List, X, Star, Cog, Search } from 'lucide-react'
import { useHierarchyAreaTree, type AreaTreeNode, type EquipmentLeaf } from '@/hooks/useHierarchyAreaTree'
import { useGlobalEquipmentSearch, type GlobalEquipmentResult } from '@/hooks/useGlobalEquipmentSearch'

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
  /** Buscar un equipo en TODA la planta (cache global) y seleccionarlo. Habilita el buscador del sidebar. */
  onSelectEquipmentGlobal?: (eq: GlobalEquipmentResult) => void
  /** Clave del equipo seleccionado (linkedMachineId || nodeId) para resaltarlo. */
  selectedEquipKey?: string | null
  /** Claves de equipos favoritos (linkedMachineId || nodeId) para la estrella + filtro de favoritos. */
  equipFavKeys?: Set<string>
  onToggleEquipFav?: (leaf: EquipmentLeaf) => void
  openNodes: Record<string, boolean>
  onToggleNode: (id: string) => void
  /** Contraer todas las ramas del árbol de un golpe. */
  onCollapseAll?: () => void
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

/** Fila de equipo bajo un área — clic filtra la tabla a ese equipo; expandible si tiene sub-equipos. */
function EquipmentRow({
  leaf, areaNode, depth, selectedEquipKey, equipFavKeys, favoritesOnly, onSelectArea, onSelectEquipment, onToggleEquipFav,
}: {
  leaf: EquipmentLeaf; areaNode: AreaTreeNode; depth: number
} & Pick<AreaSidebarProps, 'selectedEquipKey' | 'equipFavKeys' | 'favoritesOnly' | 'onSelectArea' | 'onSelectEquipment' | 'onToggleEquipFav'>) {
  const [expanded, setExpanded] = useState(false)
  const visibleChildren = leaf.children.filter((c) => !c.oculto && (!favoritesOnly || isLeafFav(c, equipFavKeys)))
  const hasChildren = visibleChildren.length > 0
  const selected = !!selectedEquipKey && (selectedEquipKey === leaf.id || selectedEquipKey === leaf.linkedMachineId)
  const isFav = isLeafFav(leaf, equipFavKeys)
  const handleSelect = () => (onSelectEquipment ? onSelectEquipment(areaNode, leaf) : onSelectArea(areaNode))
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect() } }}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        className={[
          'group relative flex items-center gap-2 pr-2 py-2 cursor-pointer select-none border-l-2 transition-colors',
          selected
            ? 'border-l-primary bg-primary/10 text-primary'
            : 'border-l-transparent text-foreground/70 hover:bg-muted/40 hover:text-foreground',
        ].join(' ')}
        title={leaf.nombre}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-ctl hover:bg-muted"
            aria-label={expanded ? 'Colapsar sub-equipos' : 'Expandir sub-equipos'}
          >
            <ChevronRight className={['h-4 w-4 transition-transform', expanded ? 'rotate-90' : ''].join(' ')} />
          </button>
        ) : (
          <span className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center">
            <Cog className={['h-3.5 w-3.5', selected ? 'text-primary' : 'text-cat-7-ink/60'].join(' ')} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-caption leading-tight">{leaf.alias || leaf.nombre}</div>
          {leaf.codigo && (
            <div className="truncate font-mono text-caption leading-tight text-muted-foreground/60">{leaf.codigo}</div>
          )}
        </div>
        {onToggleEquipFav && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleEquipFav(leaf) }}
            className={[
              'shrink-0 rounded-ctl p-1 transition',
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
      {expanded && hasChildren && (
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-border/40" style={{ left: `${10 + depth * 14 + 11}px` }} />
          {visibleChildren.map((c) => (
            <EquipmentRow
              key={c.id}
              leaf={c}
              areaNode={areaNode}
              depth={depth + 1}
              selectedEquipKey={selectedEquipKey}
              equipFavKeys={equipFavKeys}
              favoritesOnly={favoritesOnly}
              onSelectArea={onSelectArea}
              onSelectEquipment={onSelectEquipment}
              onToggleEquipFav={onToggleEquipFav}
            />
          ))}
        </div>
      )}
    </>
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
            className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-ctl hover:bg-muted"
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
          <div className="truncate text-footnote font-medium leading-tight">{node.nombre}</div>
          {/* Meta en una sola línea (trunca si no entra). Orden por relevancia en Repuestos:
              equipos · rep · M/B → al truncar se corta primero el M/B (menos crítico). */}
          <div className="truncate text-caption leading-tight text-muted-foreground">
            <span className="tabular-nums">{eqCount} equipos</span>
            {repCount > 0 && (
              <span className="tabular-nums text-emerald-500"> · {repCount} rep</span>
            )}
            {assetCount > 0 && (
              <span className="tabular-nums text-cat-7-ink"> · {assetCount} M/B</span>
            )}
          </div>
        </div>

        {onToggleAreaFav && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleAreaFav(node.id) }}
            className={[
              'shrink-0 rounded-ctl p-1 transition',
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
        <div className="relative">
          {/* Guía de indentación: línea vertical alineada bajo el chevron del padre */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-border/40"
            style={{ left: `${10 + depth * 14 + 11}px` }}
          />
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
              areaNode={node}
              depth={depth + 1}
              selectedEquipKey={selectedEquipKey}
              equipFavKeys={equipFavKeys}
              favoritesOnly={favoritesOnly}
              onSelectArea={onSelectArea}
              onSelectEquipment={onSelectEquipment}
              onToggleEquipFav={onToggleEquipFav}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function AreaSidebar({
  selectedAreaId, onSelectArea, onSelectEquipment, onSelectEquipmentGlobal, selectedEquipKey, equipFavKeys, onToggleEquipFav, assetCountByNode, repCountByNode, favoriteAreaIds, onToggleAreaFav,
  favoritesOnly = false, onToggleFavoritesOnly, openNodes, onToggleNode, onCollapseAll, onShowAll, showingAll,
  mobileOpen = false, onMobileClose, collapsed = false, onToggleCollapse,
}: AreaSidebarProps) {
  const { areaTree, loading, expandNode } = useHierarchyAreaTree()

  // ── Buscador de equipos (cache global de toda la planta) ──
  // El árbol es lazy: solo trae hojas al expandir un área. Para encontrar CUALQUIER
  // equipo sin navegar a mano, se busca sobre el cache global de `hierarchy`.
  const [equipSearch, setEquipSearch] = useState('')
  const { results: equipResults, loading: equipSearchLoading } = useGlobalEquipmentSearch(equipSearch)
  const searching = equipSearch.trim().length >= 2
  const handlePickEquipment = useCallback((eq: GlobalEquipmentResult) => {
    onSelectEquipmentGlobal?.(eq)
    setEquipSearch('')
    onMobileClose?.()
  }, [onSelectEquipmentGlobal, onMobileClose])

  // ── Ancho ajustable (desktop): se arrastra el borde derecho, se recuerda. ──
  const MIN_W = 220, MAX_W = 560
  const [width, setWidth] = useState<number>(() => {
    try { const s = Number(localStorage.getItem('repuestos-area-sidebar-width')); return s >= MIN_W && s <= MAX_W ? s : 288 } catch { return 288 }
  })
  const [resizing, setResizing] = useState(false)
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(true)
    const startX = e.clientX, startW = width
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX)))
      setWidth(w)
    }
    const onUp = () => {
      setResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setWidth((w) => { try { localStorage.setItem('repuestos-area-sidebar-width', String(w)) } catch { /* noop */ } return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width])
  // Al restaurar ramas abiertas (persistidas), cargar sus hijos en este árbol.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current || areaTree.length === 0) return
    restoredRef.current = true
    Object.entries(openNodes).forEach(([id, open]) => { if (open) expandNode(id) })
  }, [areaTree, openNodes, expandNode])

  // Esta instancia del hook tiene su PROPIO allNodes (separado del hub). Al abrir un nodo,
  // cargar sus hijos/sub-equipos en ESTE árbol (la caché por nodeId es compartida → barato),
  // además de propagar el toggle de openNodes al hub.
  const toggleNode = (id: string) => {
    if (!openNodes[id]) expandNode(id)
    onToggleNode(id)
  }

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
        style={{ ['--sidebar-w' as string]: `${width}px` } as React.CSSProperties}
        className={[
          // Móvil: ancho fijo w-72 (drawer). Desktop: ancho ajustable vía CSS var.
          'flex h-full w-72 shrink-0 flex-col border-r border-border bg-[var(--panel-surface)] sm:w-[var(--sidebar-w)]',
          // Base (móvil): drawer fijo deslizable
          'fixed inset-y-0 left-0 z-40 shadow-xl transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: en flujo (relative para anclar el handle), siempre visible (oculto si está contraído)
          collapsed ? 'sm:hidden' : 'sm:relative sm:z-auto sm:translate-x-0 sm:shadow-none',
        ].join(' ')}
      >
        {/* Handle de redimensionado (solo desktop) */}
        {!collapsed && (
          <div
            onMouseDown={startResize}
            className={['absolute right-0 top-0 z-20 hidden h-full w-1.5 cursor-col-resize transition-colors sm:block', resizing ? 'bg-primary/50' : 'hover:bg-primary/30'].join(' ')}
            title="Arrastra para ajustar el ancho"
            aria-hidden
          />
        )}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-caption font-bold tracking-wider text-muted-foreground">Áreas</span>
        <div className="flex items-center gap-1">
          {onToggleFavoritesOnly && (
            <button
              onClick={onToggleFavoritesOnly}
              className={['rounded-ctl p-1 transition', favoritesOnly ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'].join(' ')}
              title={favoritesOnly ? 'Ver todo' : 'Ver solo favoritos (áreas y equipos)'}
              aria-label="Solo favoritos"
            >
              <Star className={['h-4 w-4', favoritesOnly ? 'fill-current' : ''].join(' ')} />
            </button>
          )}
          {onCollapseAll && (
            <button onClick={onCollapseAll} className="rounded-ctl p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Contraer todas las ramas" aria-label="Contraer todo">
              <ChevronsDownUp className="h-4 w-4" />
            </button>
          )}
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} className="hidden rounded-ctl p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground sm:block" title="Contraer panel de áreas" aria-label="Contraer áreas">
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
          <button onClick={onMobileClose} className="rounded-ctl p-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden" aria-label="Cerrar áreas">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {onSelectEquipmentGlobal && (
        <div className="border-b border-border px-2 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={equipSearch}
              onChange={(e) => setEquipSearch(e.target.value)}
              placeholder="Buscar equipo en toda la planta…"
              className="h-8 w-full rounded-ctl border border-input bg-background pl-8 pr-7 text-xs text-foreground outline-none transition-colors focus:border-primary/50"
            />
            {equipSearch && (
              <button
                onClick={() => setEquipSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-ctl p-0.5 text-muted-foreground transition hover:text-foreground"
                aria-label="Limpiar búsqueda de equipo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {searching ? (
          equipSearchLoading && equipResults.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando equipos…
            </div>
          ) : equipResults.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Sin equipos para «{equipSearch.trim()}».</div>
          ) : (
            <div className="space-y-0.5 px-1">
              <div className="px-2 py-1 text-caption font-semibold tracking-wider text-muted-foreground">
                {equipResults.length} equipo{equipResults.length === 1 ? '' : 's'}
              </div>
              {equipResults.map((eq) => {
                const isSel = !!selectedEquipKey && (selectedEquipKey === eq.id || selectedEquipKey === eq.linkedMachineId)
                return (
                  <button
                    key={eq.id}
                    onClick={() => handlePickEquipment(eq)}
                    className={[
                      'flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-left transition-colors',
                      isSel ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted/50 hover:text-foreground',
                    ].join(' ')}
                    title={eq.nombre}
                  >
                    <Cog className={['h-3.5 w-3.5 shrink-0', isSel ? 'text-primary' : 'text-cat-7-ink/70'].join(' ')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption leading-tight">{eq.alias || eq.nombre}</span>
                      {eq.codigo && (
                        <span className="block truncate font-mono text-caption leading-tight text-muted-foreground/60">{eq.codigo}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        ) : loading ? (
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
              onToggleNode={toggleNode}
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
