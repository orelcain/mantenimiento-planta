/**
 * RepuestosPage — Contenedor principal del módulo de repuestos
 *
 * 3 vistas vinculadas:
 *  - Por equipo  → catálogo por máquina + jerarquía (jefe mantenimiento)
 *  - Buscar      → búsqueda global instantánea (técnico en terreno) [default móvil]
 *  - Bodega      → stock real (próximamente)
 *
 * Vinculación:
 *  Buscar → "Ver en equipo"   → cambia a "Por equipo" con máquina pre-seleccionada
 *  Equipo → "Buscar similar"  → cambia a "Buscar" con query pre-cargada
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Layers, Search, Package, Map, LayoutGrid } from 'lucide-react'
import { RepuestosDashboard } from './Dashboard'
import { BuscadorGlobal } from './BuscadorGlobal'
import { BodegaView } from './BodegaView'
import { CatalogoBases } from './CatalogoBases'
import { RepuestosAreaHub } from './RepuestosAreaHub'
import { useMachineContext } from '@/contexts/MachineContext'

type Tab = 'areas' | 'equipo' | 'buscar' | 'bodega' | 'bases'

const STORAGE_KEY = 'repuestos-active-tab'

/** Detecta móvil en el primer render */
function getDefaultTab(): Tab {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Tab | null
    if (saved === 'areas' || saved === 'equipo' || saved === 'buscar' || saved === 'bodega' || saved === 'bases') return saved
    // En móvil, el buscador es más útil por defecto (el hub aún no es responsive)
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 'buscar'
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
  { id: 'areas',   label: 'Áreas',        mobileLabel: 'Áreas',  icon: LayoutGrid },
  { id: 'equipo',  label: 'Por equipo',   mobileLabel: 'Equipo', icon: Layers  },
  { id: 'buscar',  label: 'Buscar pieza', mobileLabel: 'Buscar', icon: Search  },
  { id: 'bases',   label: 'Mapas',        mobileLabel: 'Mapas',  icon: Map     },
  { id: 'bodega',  label: 'Bodega',       mobileLabel: 'Bodega', icon: Package },
]

export function RepuestosPage() {
  const { setCurrentMachine } = useMachineContext()

  const [activeTab, setActiveTab] = useState<Tab>(getDefaultTab)
  // Lazy mount: solo renderiza un tab la primera vez que se activa
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set([getDefaultTab()]))

  // jumpMachineId: al saltar desde Buscador → Equipo, auto-selecciona esta máquina
  const jumpMachineIdRef = useRef<string | null>(null)
  const [jumpMachineId, setJumpMachineId] = useState<string | null>(null)

  // jumpQuery: al saltar desde Equipo → Buscar, pre-carga esta query
  const [jumpQuery, setJumpQuery] = useState<string>('')

  // Persiste tab activo + lazy mount
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, activeTab) } catch { /* noop */ }
    setMountedTabs(prev => prev.has(activeTab) ? prev : new Set([...prev, activeTab]))
  }, [activeTab])

  // ── "Ver en equipo" desde Buscador ──────────────────────────────
  const handleViewInCatalog = useCallback(async (machineId: string) => {
    // Pre-selecciona la máquina en el contexto compartido
    await setCurrentMachine(machineId)
    jumpMachineIdRef.current = machineId
    setJumpMachineId(machineId)
    setActiveTab('equipo')
  }, [setCurrentMachine])

  // Limpiar jumpMachineId una vez que el Dashboard lo consumió
  const handleJumpConsumed = useCallback(() => {
    jumpMachineIdRef.current = null
    setJumpMachineId(null)
  }, [])

  // ── "Buscar similar" desde Catálogo ────────────────────────────
  const handleSearchSimilar = useCallback((query: string) => {
    setJumpQuery(query)
    setActiveTab('buscar')
  }, [])

  // Limpiar jumpQuery una vez consumido
  const handleQueryConsumed = useCallback(() => {
    setJumpQuery('')
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
                {/* Dot de estado si tiene jump pendiente */}
                {id === 'equipo' && jumpMachineId && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
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
            <RepuestosAreaHub />
          )}
        </div>

        <div className={activeTab === 'equipo' ? '' : 'hidden'}>
          {mountedTabs.has('equipo') && (
            <RepuestosDashboard
              jumpMachineId={jumpMachineId}
              onJumpConsumed={handleJumpConsumed}
              onSearchSimilar={handleSearchSimilar}
            />
          )}
        </div>

        <div className={activeTab === 'buscar' ? 'p-3 sm:p-6' : 'hidden'}>
          {mountedTabs.has('buscar') && (
            <BuscadorGlobal
              initialQuery={jumpQuery}
              onQueryConsumed={handleQueryConsumed}
              onViewInCatalog={handleViewInCatalog}
            />
          )}
        </div>

        <div className={activeTab === 'bases' ? '' : 'hidden'}>
          {mountedTabs.has('bases') && (
            <CatalogoBases />
          )}
        </div>

        <div className={activeTab === 'bodega' ? '' : 'hidden'}>
          {mountedTabs.has('bodega') && (
            <BodegaView
              onViewInEquipo={handleViewInCatalog}
              onSearchSimilar={handleSearchSimilar}
            />
          )}
        </div>

      </div>
    </div>
  )
}
