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
import { ChevronRight, Layers, Loader2, List, X } from 'lucide-react'
import { useHierarchyAreaTree, type AreaTreeNode } from '@/hooks/useHierarchyAreaTree'

interface AreaSidebarProps {
  selectedAreaId: string | null
  onSelectArea: (node: AreaTreeNode) => void
  /** Conteo de motores/bombas por nodeId (incl. descendientes) para el badge secundario. */
  assetCountByNode?: Record<string, number>
  openNodes: Record<string, boolean>
  onToggleNode: (id: string) => void
  onShowAll: () => void
  showingAll: boolean
  /** Móvil: el sidebar es un drawer; controlado desde el hub. */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

/** Cuenta equipos recursivos (propios + descendientes cargados). */
function countEquip(node: AreaTreeNode): number {
  let total = node.equipmentCount
  for (const c of node.children) total += countEquip(c)
  return total
}

function AreaRow({
  node, depth, selectedAreaId, onSelectArea, assetCountByNode, openNodes, onToggleNode,
}: {
  node: AreaTreeNode; depth: number
} & Pick<AreaSidebarProps, 'selectedAreaId' | 'onSelectArea' | 'assetCountByNode' | 'openNodes' | 'onToggleNode'>) {
  const isSelected = selectedAreaId === node.id
  const isOpen = !!openNodes[node.id]
  const hasChildren = node.children.length > 0 || node.hasMoreChildren
  const eqCount = countEquip(node)
  const assetCount = assetCountByNode?.[node.id] ?? 0

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
            className="shrink-0 -ml-1 flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
            aria-label={isOpen ? 'Colapsar' : 'Expandir'}
          >
            {node.isLoading
              ? <Loader2 className="h-3 w-3 animate-spin text-primary/60" />
              : <ChevronRight className={['h-3.5 w-3.5 transition-transform', isOpen ? 'rotate-90' : ''].join(' ')} />}
          </button>
        ) : (
          <Layers className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{node.nombre}</div>
          <div className="flex items-center gap-2 text-[10.5px] leading-tight text-muted-foreground">
            <span className="tabular-nums">{eqCount} equipos</span>
            {assetCount > 0 && (
              <span className="tabular-nums text-cyan-500">· {assetCount} M/B</span>
            )}
          </div>
        </div>
      </div>

      {isOpen && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <AreaRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedAreaId={selectedAreaId}
              onSelectArea={onSelectArea}
              assetCountByNode={assetCountByNode}
              openNodes={openNodes}
              onToggleNode={onToggleNode}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function AreaSidebar({
  selectedAreaId, onSelectArea, assetCountByNode, openNodes, onToggleNode, onShowAll, showingAll,
  mobileOpen = false, onMobileClose,
}: AreaSidebarProps) {
  const { areaTree, loading } = useHierarchyAreaTree()

  // Saltar la raíz única (CHONCHI) y mostrar sus hijos directamente, como EquipmentNavigator.
  const roots = useMemo(() => {
    if (areaTree.length === 1 && areaTree[0]!.children.length > 0) return areaTree[0]!.children
    return areaTree
  }, [areaTree])

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
          'flex h-full w-60 shrink-0 flex-col border-r border-border bg-card/40',
          // Base (móvil): drawer fijo deslizable
          'fixed inset-y-0 left-0 z-40 shadow-xl transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: estático, siempre visible
          'sm:static sm:z-auto sm:translate-x-0 sm:shadow-none',
        ].join(' ')}
      >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Áreas</span>
        <button onClick={onMobileClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden" aria-label="Cerrar áreas">
          <X className="h-4 w-4" />
        </button>
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
              assetCountByNode={assetCountByNode}
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
