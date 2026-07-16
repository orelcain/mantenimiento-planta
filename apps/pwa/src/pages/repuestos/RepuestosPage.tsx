/**
 * RepuestosPage — Contenedor principal del módulo de repuestos
 *
 * 3 vistas:
 *  - Áreas             → hub área-first (default); reemplaza "Por equipo" retirado en v3.75.0
 *  - Bodega            → stock real, movimientos, inventario y estadísticas
 *  - Códigos fabricante → buscador de los despieces oficiales de los manuales
 *
 * Bodega se retiró en v3.91.0 por costo/desuso y volvió en v3.93.0 abaratada:
 * los "últimos movimientos" salen de UNA query collection-group (antes ~2.200
 * queries por pestaña) y las escrituras parchean el estado local en vez de
 * releer los ~2.200 docs. Ver `useBodega`.
 */

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, LayoutGrid, ScanSearch } from 'lucide-react'
import { BodegaView } from './BodegaView'
import { RepuestosAreaHub } from './RepuestosAreaHub'
import { CodigosFabricanteView, type CrearDesdeCatalogo } from './CodigosFabricanteView'

type Tab = 'areas' | 'bodega' | 'codigos'

const STORAGE_KEY = 'repuestos-active-tab'

function getDefaultTab(): Tab {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Tab | null
    if (saved === 'areas' || saved === 'bodega' || saved === 'codigos') return saved
  } catch { /* noop */ }
  return 'areas'
}

interface TabDef {
  id: Tab
  label: string
  mobileLabel: string
  icon: typeof Package
  badge?: string
}

const TABS: TabDef[] = [
  { id: 'areas',   label: 'Áreas',   mobileLabel: 'Áreas',   icon: LayoutGrid },
  { id: 'bodega',  label: 'Bodega',  mobileLabel: 'Bodega',  icon: Package    },
  { id: 'codigos', label: 'Códigos fabricante', mobileLabel: 'Códigos', icon: ScanSearch },
]

export function RepuestosPage() {
  const [activeTab, setActiveTab] = useState<Tab>(getDefaultTab)
  // Lazy mount: solo renderiza un tab la primera vez que se activa
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set([getDefaultTab()]))

  // jumpQuery: saltar a Áreas con query pre-cargada (desde Bodega "Ver en Áreas" o "Buscar similar")
  const [jumpQuery, setJumpQuery] = useState<string>('')
  // pendingCreate: saltar a Áreas y abrir el form de crear prellenado (desde Códigos fabricante)
  const [pendingCreate, setPendingCreate] = useState<CrearDesdeCatalogo | null>(null)

  // Deep-link ?q=<SAP> (ej. desde "Ver en Repuestos" de la pestaña Repuestos comunes
  // del Centro de Aprendizaje): abre Áreas con ese código pre-buscado.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && q.trim()) {
      setJumpQuery(q.trim())
      setActiveTab('areas')
      searchParams.delete('q')
      setSearchParams(searchParams, { replace: true })
    }
    // solo al montar / cambiar el param
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persiste tab activo + lazy mount
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, activeTab) } catch { /* noop */ }
    setMountedTabs(prev => prev.has(activeTab) ? prev : new Set([...prev, activeTab]))
  }, [activeTab])

  // ── "Ver en Áreas" desde Bodega → salta al hub con el machineId como query ──
  const handleViewInAreas = useCallback((machineId: string) => {
    setJumpQuery(machineId)
    setActiveTab('areas')
  }, [])

  // ── "Buscar similar" / "Ver repuesto" → hub con query ──
  const handleSearchSimilar = useCallback((query: string) => {
    setJumpQuery(query)
    setActiveTab('areas')
  }, [])

  // Limpiar jumpQuery una vez consumido
  const handleQueryConsumed = useCallback(() => {
    setJumpQuery('')
  }, [])

  // ── "Agregar a repuestos" desde Códigos fabricante → salta a Áreas con el form prellenado ──
  const handleCrearDesdeCatalogo = useCallback((data: CrearDesdeCatalogo) => {
    setPendingCreate(data)
    setActiveTab('areas')
  }, [])

  const handlePendingCreateConsumed = useCallback(() => {
    setPendingCreate(null)
  }, [])

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Tab bar ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-3 sm:px-6">
        <div className="flex items-end gap-0.5 sm:gap-1">
          {TABS.map(({ id, label, mobileLabel, icon: Icon, badge }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={[
                  'flex items-center gap-1.5 px-3 sm:px-3 py-3 sm:py-2.5 text-xs sm:text-xs font-medium transition-all border-b-2 -mb-px whitespace-nowrap',
                  isActive
                    ? 'text-primary border-primary bg-primary/5'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{mobileLabel}</span>
                {badge && (
                  <span className="hidden sm:inline text-[8px] font-bold uppercase tracking-wide text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Contenido — lazy mount + display:hidden (no desmonta) ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        <div className={activeTab === 'areas' ? 'h-full' : 'hidden'}>
          {mountedTabs.has('areas') && (
            <RepuestosAreaHub
              initialQuery={jumpQuery}
              onQueryConsumed={handleQueryConsumed}
              pendingCreate={pendingCreate}
              onPendingCreateConsumed={handlePendingCreateConsumed}
            />
          )}
        </div>

        <div className={activeTab === 'bodega' ? '' : 'hidden'}>
          {mountedTabs.has('bodega') && (
            <BodegaView
              onViewInEquipo={handleViewInAreas}
              onSearchSimilar={handleSearchSimilar}
            />
          )}
        </div>

        <div className={activeTab === 'codigos' ? '' : 'hidden'}>
          {mountedTabs.has('codigos') && (
            <CodigosFabricanteView onBuscarEnRepuestos={handleSearchSimilar} onCrearRepuesto={handleCrearDesdeCatalogo} />
          )}
        </div>

      </div>
    </div>
  )
}
