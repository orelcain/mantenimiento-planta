/**
 * BuscadorGlobal — Búsqueda cross-empresa de repuestos
 *
 * Diseñado para técnicos en terreno: encuentra cualquier pieza
 * en segundos sin saber en qué máquina está.
 * Carga TODOS los repuestos de toda la empresa usando el cache
 * de equipos jerárquicos (hierarchy) en vez de la colección machines.
 *
 * Props:
 *  initialQuery      → query pre-cargada (desde "Buscar similar" en Catálogo)
 *  onQueryConsumed   → callback para limpiar el jump state en el padre
 *  onViewInCatalog   → salta al catálogo mostrando esa máquina
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Search, X, Package, Filter, ChevronRight, ChevronDown,
  BarChart3, Layers, Tag, ExternalLink, MapPin,
  ArrowUp, ArrowDown, Download,
} from 'lucide-react'
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useGlobalSearch, type GlobalSearchResult } from '@/hooks/repuestos/useGlobalSearch'
import { getGlobalEquipmentCache, useGlobalEquipmentSearch } from '@/hooks/useGlobalEquipmentSearch'
import { RepuestoDetailModal } from '@/components/repuestos/RepuestoDetailModal'
import type { Repuesto, Machine } from '@/types/repuestos'

// ── Helpers ────────────────────────────────────────────────────

const formatCurrency = (v: number) =>
  Number.isFinite(v) && v > 0 ? `$${v.toLocaleString('es-CL')}` : '—'

function tipoBadgeColor(tipo?: string): string {
  if (!tipo) return 'bg-muted text-muted-foreground'
  const t = tipo.toUpperCase()
  if (['RODAMIENTO', 'COJINETE'].includes(t)) return 'bg-blue-500/15 text-blue-400'
  if (['SELLO/JUNTA', 'ANILLO', 'SELLO'].includes(t)) return 'bg-green-500/15 text-green-400'
  if (['MOTOR', 'BOMBA'].includes(t)) return 'bg-red-500/15 text-red-400'
  if (['SENSOR', 'INTERRUPTOR', 'MÓDULO ELÉCT.', 'RELÉ', 'CONTACTOR',
    'FUENTE ALIM.', 'TRANSFORMADOR', 'VARIADOR', 'HMI', 'PLC'].includes(t))
    return 'bg-purple-500/15 text-purple-400'
  if (['TORNILLERÍA', 'PERNO', 'TUERCA', 'PASADOR', 'ARANDELA', 'ABRAZADERA'].includes(t))
    return 'bg-zinc-500/15 text-zinc-400'
  if (['CORREA', 'CADENA', 'CINTA/BANDA'].includes(t)) return 'bg-orange-500/15 text-orange-400'
  if (['VÁLVULA', 'CILINDRO NEUM.', 'NEUMÁTICA GEN.'].includes(t))
    return 'bg-cyan-500/15 text-cyan-400'
  if (['FILTRO', 'LUBRICACIÓN'].includes(t)) return 'bg-yellow-500/15 text-yellow-500'
  return 'bg-muted text-muted-foreground'
}

type SortField = 'relevance' | 'sap' | 'nombre' | 'tipo' | 'valor'
type SortDir = 'asc' | 'desc'

/** Exportar resultados a CSV */
const exportToCSV = (results: GlobalSearchResult[], breadcrumbFn: (id: string) => string) => {
  const header = 'Código SAP\tNombre\tCód. Fabricante\tTipo\tEquipo\tValor Unit.\tStock\tUbicación\tValor Total'
  const rows = results.map(r => {
    const rep = r.repuesto
    const vTotal = (rep.valorUnitario || 0) * (rep.cantidadPorMaquina || 0)
    return [
      rep.codigoSAP || '',
      rep.textoBreve || rep.descripcion || '',
      rep.codigoFabricante || '',
      rep.tipo || '',
      breadcrumbFn(r.machineId),
      rep.valorUnitario || '',
      rep.cantidadPorMaquina || '',
      rep.ubicacionEnPlanta || '',
      vTotal || '',
    ].join('\t')
  })
  const content = '\uFEFF' + [header, ...rows].join('\n')
  const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `repuestos_busqueda_${new Date().toISOString().slice(0, 10)}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Skeleton ───────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-0.5 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-10 rounded bg-muted/40" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Package; label: string; value: number | string; color: string
}) {
  return (
    <div className="bg-muted/20 border border-border/50 rounded-xl p-3 sm:p-4 flex items-center gap-3">
      <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{value}</div>
        <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      </div>
    </div>
  )
}

/** Acorta breadcrumb quitando los 2 primeros niveles comunes (empresa/planta) */
const shortBreadcrumb = (full?: string) => {
  if (!full) return ''
  const parts = full.split(' › ')
  return parts.length > 2 ? parts.slice(2).join(' › ') : full
}

/** Separa breadcrumb en { area (ruta sin equipo), equipo (último nivel) } */
const splitBreadcrumb = (full?: string) => {
  if (!full) return { area: '', equipo: '' }
  const parts = full.split(' › ')
  // Quitar los 2 primeros niveles comunes (empresa/planta)
  const relevant = parts.length > 2 ? parts.slice(2) : parts
  if (relevant.length <= 1) return { area: '', equipo: relevant[0] || '' }
  return {
    area: relevant.slice(0, -1).join(' › '),
    equipo: relevant[relevant.length - 1],
  }
}

// ── Result row ─────────────────────────────────────────────────

function ResultRow({
  result, index, onView, onViewInCatalog, breadcrumb,
}: {
  result: GlobalSearchResult
  index: number
  onView: (r: GlobalSearchResult) => void
  onViewInCatalog?: (machineId: string) => void
  breadcrumb?: string
}) {
  const r = result.repuesto
  const name = r.textoBreve || r.descripcion || r.codigoSAP || 'Sin nombre'
  const { area, equipo } = splitBreadcrumb(breadcrumb)
  const valorTotal = (r.valorUnitario || 0) * (r.cantidadPorMaquina || 0)

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors group cursor-pointer"
      onClick={() => onView(result)}
    >
      {/* Número */}
      <span className="hidden sm:block w-5 shrink-0 text-[9px] text-muted-foreground/40 tabular-nums text-right">
        {index + 1}
      </span>

      {/* Código SAP */}
      <span className="w-20 sm:w-24 shrink-0 text-[9.5px] sm:text-[10px] font-mono text-muted-foreground truncate">
        {r.codigoSAP || <span className="opacity-30">—</span>}
      </span>

      {/* Nombre + alias + código fabricante */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] sm:text-xs text-foreground font-medium truncate">{name}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {r.alias && (
            <span className="text-[9px] italic text-primary/60 truncate max-w-[140px]" title={`Alias: ${r.alias}`}>
              "{r.alias}"
            </span>
          )}
          {r.codigoFabricante && (
            <span className="text-[9px] font-mono text-muted-foreground/60 truncate max-w-[120px]" title={`Fabricante: ${r.codigoFabricante}`}>
              {r.codigoFabricante}
            </span>
          )}
        </div>
        {/* Breadcrumb en mobile */}
        {(area || equipo) && (
          <div className="sm:hidden flex items-center gap-1 mt-0.5">
            <MapPin className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
            <span className="text-[9px] text-muted-foreground/70 truncate">
              {area ? `${area} › ` : ''}{equipo}
            </span>
          </div>
        )}
      </div>

      {/* Tipo — prominente con color */}
      {r.tipo ? (
        <span className={`hidden sm:inline-flex shrink-0 text-[8.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${tipoBadgeColor(r.tipo)}`}>
          {r.tipo}
        </span>
      ) : null}

      {/* Stock */}
      <span className="hidden md:block shrink-0 w-10 text-center text-xs font-bold tabular-nums text-foreground">
        {r.cantidadPorMaquina || <span className="text-muted-foreground/30">—</span>}
      </span>

      {/* Ubicación */}
      {r.ubicacionEnPlanta ? (
        <span className="hidden lg:block shrink-0 w-16 text-[10px] text-muted-foreground truncate text-center" title={r.ubicacionEnPlanta}>
          {r.ubicacionEnPlanta}
        </span>
      ) : (
        <span className="hidden lg:block shrink-0 w-16 text-center text-muted-foreground/30 text-[10px]">—</span>
      )}

      {/* Ubicación jerárquica — equipo */}
      <div className="shrink-0 text-right hidden sm:block min-w-0 w-36" title={breadcrumb}>
        {area && (
          <div className="text-[8px] text-muted-foreground/50 truncate uppercase tracking-wide">{area}</div>
        )}
        <div className="text-[10px] font-medium text-foreground/80 truncate">
          {equipo || result.machineName}
        </div>
      </div>

      {/* Valor unitario */}
      <span className="shrink-0 text-[10px] font-mono text-muted-foreground w-16 text-right hidden md:block">
        {formatCurrency(r.valorUnitario || 0)}
      </span>

      {/* Valor total */}
      <span className="shrink-0 text-[10px] font-bold font-mono text-right hidden lg:block w-20 tabular-nums text-foreground">
        {valorTotal > 0 ? formatCurrency(valorTotal) : <span className="text-muted-foreground/30">—</span>}
      </span>

      {/* Acciones */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onViewInCatalog && (
          <button
            onClick={e => { e.stopPropagation(); onViewInCatalog(result.machineId) }}
            title="Ver en catálogo del equipo"
            className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-1 rounded hover:bg-primary/10 border border-transparent hover:border-primary/20"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">Equipo</span>
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onView(result) }}
          className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/50"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────

interface BuscadorGlobalProps {
  initialQuery?: string
  onQueryConsumed?: () => void
  onViewInCatalog?: (machineId: string) => void
}

// ── Main ───────────────────────────────────────────────────────

export function BuscadorGlobal({ initialQuery, onQueryConsumed, onViewInCatalog }: BuscadorGlobalProps) {
  // Forzar carga del cache de equipos globales
  useGlobalEquipmentSearch('', 999)

  // Construir Machine[] desde el cache de equipos jerárquicos
  const [hierarchyNames, setHierarchyNames] = useState<Map<string, string>>(new Map())
  const hierarchyLoadedRef = useRef(false)

  // Cargar nombres de TODOS los nodos hierarchy (áreas + equipos) para breadcrumbs
  useEffect(() => {
    if (hierarchyLoadedRef.current) return
    hierarchyLoadedRef.current = true
    const load = async () => {
      try {
        const snap = await getDocs(fsQuery(collection(db, 'hierarchy'), where('activo', '==', true)))
        const names = new Map<string, string>()
        snap.forEach(doc => {
          const d = doc.data()
          names.set(doc.id, d.nombre ?? doc.id)
        })
        setHierarchyNames(names)
      } catch (err) {
        console.error('Error loading hierarchy names:', err)
      }
    }
    load()
  }, [])

  // Construir machines[] desde equipos con linkedMachineId (deduplicados)
  const machines = useMemo((): Machine[] => {
    const equipment = getGlobalEquipmentCache()
    if (!equipment) return []

    const seen = new Map<string, { nombre: string; path: string[] }>()
    for (const eq of equipment) {
      if (!eq.linkedMachineId || eq.oculto) continue
      if (seen.has(eq.linkedMachineId)) continue
      seen.set(eq.linkedMachineId, { nombre: eq.nombre, path: eq.path || [] })
    }

    return [...seen.entries()].map(([machineId, info]) => ({
      id: machineId,
      nombre: info.nombre,
      marca: '',
      modelo: '',
      activa: true,
      color: '#6b7280',
      orden: 0,
      createdAt: new Date(),
    }))
  }, [hierarchyNames]) // re-calc when hierarchy loads

  // Lookup: machineId → { equipmentName, breadcrumb }
  const machineInfoMap = useMemo(() => {
    const equipment = getGlobalEquipmentCache()
    if (!equipment) return new Map<string, { name: string; breadcrumb: string }>()

    const map = new Map<string, { name: string; breadcrumb: string }>()
    for (const eq of equipment) {
      if (!eq.linkedMachineId || eq.oculto) continue
      if (map.has(eq.linkedMachineId)) continue

      // Construir breadcrumb desde path (IDs) → nombres
      const pathNames = (eq.path || [])
        .map(id => hierarchyNames.get(id) || '')
        .filter(Boolean)
      // Agregar el nombre del equipo al final
      const breadcrumb = [...pathNames, eq.nombre].join(' › ')

      map.set(eq.linkedMachineId, { name: eq.nombre, breadcrumb })
    }
    return map
  }, [hierarchyNames])

  const globalSearch = useGlobalSearch(machines)
  const { allRepuestos, search, loadAll, loaded, loading } = globalSearch

  const [query, setQuery] = useState(initialQuery ?? '')
  const [filterTipo, setFilterTipo] = useState<string | null>(null)
  const [filterMachine, setFilterMachine] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<GlobalSearchResult | null>(null)
  const [sortField, setSortField] = useState<SortField>('relevance')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [equipDropdownOpen, setEquipDropdownOpen] = useState(false)
  const equipDropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const consumedRef = useRef(false)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!equipDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (equipDropdownRef.current && !equipDropdownRef.current.contains(e.target as Node)) {
        setEquipDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [equipDropdownOpen])

  // Consumir initialQuery del padre una sola vez
  useEffect(() => {
    if (initialQuery && !consumedRef.current) {
      setQuery(initialQuery)
      consumedRef.current = true
      onQueryConsumed?.()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [initialQuery, onQueryConsumed])

  // Cargar índice cuando las máquinas estén disponibles
  useEffect(() => {
    if (!loaded && !loading && machines.length > 0) loadAll()
  }, [loaded, loading, loadAll, machines.length])

  // Auto-focus en desktop
  useEffect(() => {
    if (window.innerWidth >= 640) inputRef.current?.focus()
  }, [])

  // Resultados
  const rawResults = useMemo(() => {
    if (!query.trim()) return []
    return search(query)
  }, [query, search])

  const results = useMemo(() => {
    let res = rawResults
    if (filterTipo) res = res.filter(r => r.repuesto.tipo === filterTipo)
    if (filterMachine) res = res.filter(r => r.machineId === filterMachine)

    // Sorting (relevance = orden original del search scoring)
    if (sortField !== 'relevance') {
      const dir = sortDir === 'asc' ? 1 : -1
      res = [...res].sort((a, b) => {
        switch (sortField) {
          case 'sap':
            return dir * (a.repuesto.codigoSAP || '').localeCompare(b.repuesto.codigoSAP || '')
          case 'nombre':
            return dir * (a.repuesto.textoBreve || '').localeCompare(b.repuesto.textoBreve || '', 'es')
          case 'tipo':
            return dir * (a.repuesto.tipo || '').localeCompare(b.repuesto.tipo || '', 'es')
          case 'valor':
            return dir * ((a.repuesto.valorUnitario || 0) - (b.repuesto.valorUnitario || 0))
          default:
            return 0
        }
      })
    }
    return res
  }, [rawResults, filterTipo, filterMachine, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'valor' ? 'desc' : 'asc')
    }
  }

  // Tipos disponibles con conteo
  const sourceForChips = query.trim() ? rawResults : allRepuestos
  const tiposDisponibles = useMemo(() => {
    const freq: Record<string, number> = {}
    for (const r of sourceForChips) {
      const t = r.repuesto.tipo
      if (t) freq[t] = (freq[t] || 0) + 1
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t, c]) => ({ tipo: t, count: c }))
  }, [sourceForChips])

  // Máquinas en resultados (para filtro secundario) — breadcrumb acortado
  const maquinasEnResultados = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rawResults) {
      if (map.has(r.machineId)) continue
      const info = machineInfoMap.get(r.machineId)
      map.set(r.machineId, shortBreadcrumb(info?.breadcrumb) || r.machineName)
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [rawResults, machineInfoMap])

  // Stats generales
  const totalRepuestos = allRepuestos.length
  const totalMaquinas = new Set(allRepuestos.map(r => r.machineId)).size
  const totalTipos = new Set(allRepuestos.map(r => r.repuesto.tipo).filter(Boolean)).size
  const totalConSAP = allRepuestos.filter(r => r.repuesto.codigoSAP).length

  const maquinasCount = new Set(results.map(r => r.machineId)).size
  const displayed = results.slice(0, 100)

  const clearAll = () => {
    setQuery('')
    setFilterTipo(null)
    setFilterMachine(null)
    setSortField('relevance')
    setSortDir('desc')
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">

      {/* Buscador */}
      <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setFilterTipo(null); setFilterMachine(null) }}
            placeholder="Código SAP, nombre, fabricante, tipo…"
            className="w-full h-10 sm:h-11 pl-9 pr-9 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
          />
          {query && (
            <button onClick={clearAll} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Estado del índice */}
        <div className="flex items-center gap-2 mt-1.5">
          {loading ? (
            <span className="text-[10px] text-muted-foreground animate-pulse flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-primary animate-bounce" />
              Indexando {totalRepuestos > 0 ? `${totalRepuestos} repuestos…` : '…'}
            </span>
          ) : loaded ? (
            <span className="text-[10px] text-muted-foreground">
              {totalRepuestos.toLocaleString()} repuestos · {totalMaquinas} equipos indexados
            </span>
          ) : (
            <button onClick={loadAll} className="text-[10px] text-primary hover:underline">Cargar índice</button>
          )}
        </div>
      </div>

      {/* Chips de tipo */}
      {tiposDisponibles.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterTipo(null)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9.5px] font-medium border transition-all ${
              !filterTipo ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            <Filter className="h-2.5 w-2.5" />
            Todos
          </button>
          {tiposDisponibles.slice(0, 10).map(({ tipo, count }) => (
            <button
              key={tipo}
              onClick={() => setFilterTipo(filterTipo === tipo ? null : tipo)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9.5px] font-medium border transition-all ${
                filterTipo === tipo ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:border-muted-foreground/40'
              }`}
            >
              {tipo} <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Sin query → stats */}
      {!query.trim() && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatCard icon={Package} label="Total repuestos" value={totalRepuestos.toLocaleString()} color="bg-blue-500/10 text-blue-400" />
            <StatCard icon={Layers} label="Equipos" value={totalMaquinas} color="bg-emerald-500/10 text-emerald-400" />
            <StatCard icon={Tag} label="Tipos" value={totalTipos} color="bg-purple-500/10 text-purple-400" />
            <StatCard icon={BarChart3} label="Con código SAP" value={totalConSAP.toLocaleString()} color="bg-amber-500/10 text-amber-400" />
          </div>

          {loading && <Skeleton />}

          {!loading && loaded && (
            <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
                <Search className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Busca cualquier pieza</p>
                <p className="text-xs text-muted-foreground mt-0.5">Por nombre, código SAP, fabricante o tipo</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Con query → resultados */}
      {query.trim() && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">

          {/* Header — estilo Excel con totales */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/10 gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {results.length === 0
                ? <span className="text-destructive/70">Sin resultados para "{query}"</span>
                : <>
                    <span className="font-semibold text-foreground">{results.length}</span>
                    {' repuesto'}{results.length !== 1 ? 's' : ''}
                    {' en '}
                    <span className="font-semibold text-foreground">{maquinasCount}</span>
                    {' equipo'}{maquinasCount !== 1 ? 's' : ''}
                    {results.length > 0 && (
                      <span className="hidden sm:inline ml-2 text-muted-foreground/60">
                        {' · '}Valor: <span className="font-semibold text-violet-400">{formatCurrency(results.reduce((s, r) => s + (r.repuesto.valorUnitario || 0) * (r.repuesto.cantidadPorMaquina || 0), 0))}</span>
                      </span>
                    )}
                    {results.length > 100 && <span className="ml-1 opacity-50">(mostrando 100)</span>}
                  </>
              }
            </span>

            <div className="flex items-center gap-2">
              {/* Exportar */}
              {results.length > 0 && (
                <button
                  onClick={() => exportToCSV(results, id => shortBreadcrumb(machineInfoMap.get(id)?.breadcrumb) || '')}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/50 hover:border-border hover:bg-muted/30 transition-all"
                  title="Exportar resultados a Excel"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">Exportar</span>
                </button>
              )}

              {/* Filtro por equipo — dropdown custom */}
              {maquinasEnResultados.length > 1 && (
                <div className="relative" ref={equipDropdownRef}>
                  <button
                    onClick={() => setEquipDropdownOpen(o => !o)}
                    className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border transition-all max-w-[200px] ${
                      filterMachine
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-muted/50 text-muted-foreground border-border hover:border-muted-foreground/40'
                    }`}
                  >
                    <Layers className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {filterMachine
                        ? splitBreadcrumb(machineInfoMap.get(filterMachine)?.breadcrumb).equipo || 'Equipo'
                        : 'Todos los equipos'
                      }
                    </span>
                    <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${equipDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {equipDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl w-72 max-h-64 overflow-y-auto py-1">
                      <button
                        onClick={() => { setFilterMachine(null); setEquipDropdownOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-[11px] transition-colors ${
                          !filterMachine ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/30'
                        }`}
                      >
                        Todos los equipos
                      </button>
                      {maquinasEnResultados.map(m => {
                        const { area, equipo } = splitBreadcrumb(machineInfoMap.get(m.id)?.breadcrumb)
                        const count = rawResults.filter(r => r.machineId === m.id).length
                        return (
                          <button
                            key={m.id}
                            onClick={() => { setFilterMachine(m.id); setEquipDropdownOpen(false) }}
                            className={`w-full text-left px-3 py-2 transition-colors ${
                              filterMachine === m.id ? 'bg-primary/10' : 'hover:bg-muted/30'
                            }`}
                          >
                            {area && <div className="text-[8px] text-muted-foreground/50 uppercase tracking-wide truncate">{area}</div>}
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[11px] font-medium truncate ${filterMachine === m.id ? 'text-primary' : 'text-foreground'}`}>
                                {equipo || m.name}
                              </span>
                              <span className="text-[9px] text-muted-foreground/50 shrink-0">{count}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cabecera tabla — clickeable para ordenar */}
          {results.length > 0 && (
            <div className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 border-b border-border/40 bg-muted/5">
              <span className="hidden sm:block w-5 shrink-0" />
              <button onClick={() => toggleSort('sap')} className="w-20 sm:w-24 shrink-0 flex items-center gap-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                SAP {sortField === 'sap' && (sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)}
              </button>
              <button onClick={() => toggleSort('nombre')} className="flex-1 flex items-center gap-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Descripci&oacute;n {sortField === 'nombre' && (sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)}
              </button>
              <button onClick={() => toggleSort('tipo')} className="hidden sm:flex shrink-0 w-16 items-center gap-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Tipo {sortField === 'tipo' && (sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)}
              </button>
              <span className="hidden md:block shrink-0 w-10 text-center text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50">Stock</span>
              <span className="hidden lg:block shrink-0 w-16 text-center text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50">Ubic.</span>
              <span className="hidden sm:block shrink-0 w-36 text-right text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50">Equipo</span>
              <button onClick={() => toggleSort('valor')} className="hidden md:flex shrink-0 w-16 items-center justify-end gap-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                {sortField === 'valor' && (sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)} Valor
              </button>
              <span className="hidden lg:block shrink-0 w-20 text-right text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground/50">V. Total</span>
              <span className="shrink-0 w-16" />
            </div>
          )}

          {/* Filas */}
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
              <Package className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Sin resultados para "{query}"</p>
              <p className="text-xs text-muted-foreground/60">
                Prueba con otro código, nombre o tipo de pieza
              </p>
              {(filterTipo || filterMachine) && (
                <button onClick={() => { setFilterTipo(null); setFilterMachine(null) }} className="text-xs text-primary hover:underline mt-1">
                  Quitar filtros
                </button>
              )}
            </div>
          ) : (
            displayed.map((result, i) => (
              <ResultRow
                key={`${result.machineId}-${result.repuesto.id}-${i}`}
                result={result}
                index={i}
                onView={setDetailTarget}
                onViewInCatalog={onViewInCatalog}
                breadcrumb={machineInfoMap.get(result.machineId)?.breadcrumb}
              />
            ))
          )}
        </div>
      )}

      {/* Detail modal */}
      {detailTarget && (
        <RepuestoDetailModal
          open={!!detailTarget}
          onOpenChange={open => { if (!open) setDetailTarget(null) }}
          repuesto={detailTarget.repuesto as Repuesto}
          machineName={shortBreadcrumb(machineInfoMap.get(detailTarget.machineId)?.breadcrumb) || detailTarget.machineName}
          machineId={detailTarget.machineId}
          onAliasUpdated={(repId, alias) => {
            // Actualizar el alias en el resultado local para que se refleje en la lista
            const target = allRepuestos.find(r => r.repuesto.id === repId && r.machineId === detailTarget.machineId)
            if (target) (target.repuesto as any).alias = alias || undefined
          }}
        />
      )}
    </div>
  )
}
