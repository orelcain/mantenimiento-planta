/**
 * InsumosPage — Catálogo plano transversal de insumos (EPP, ferretería, químicos…).
 *
 * Importado desde STOCK ALMACENES.xlsx — 3431 docs en colección raíz `insumos/`.
 * Ver: scripts/import-insumos.js
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Filter, Package, AlertTriangle, Eye, X } from 'lucide-react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/services/firebase'
import {
  Input, Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
  Spinner,
} from '@/components/ui'
import {
  type Insumo, type InsumoFamilia, type InsumoStatus,
  INSUMO_FAMILIA_LABEL, INSUMO_STATUS_LABEL,
} from '@/types/insumos'
import { InsumoDetailModal } from '@/components/insumos/InsumoDetailModal'
import { logger } from '@/lib/logger'

const PAGE_SIZE = 80
const ALL_FAMILIAS: (InsumoFamilia | 'all')[] = [
  'all',
  'REPUESTOS', 'INSUMOS_MANT', 'AREA', 'REFRIGERACION', 'QUIMICOS',
  'HERRAMIENTAS', 'EMPAQUE', 'COMBUSTIBLE', 'LUBRICANTES', 'SIN_FAMILIA',
]

function normaliza(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function InsumosPage() {
  const [items, setItems] = useState<Insumo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [familia, setFamilia] = useState<InsumoFamilia | 'all'>('all')
  const [status, setStatus] = useState<InsumoStatus | 'all'>('activo') // default oculta obsoletos
  const [conStockSolo, setConStockSolo] = useState(false)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)

  const [selected, setSelected] = useState<Insumo | null>(null)

  // Carga inicial — 1 sola vez
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDocs(query(collection(db, 'insumos'), orderBy('codigoSAP')))
        if (cancelled) return
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Insumo))
        setItems(data)
      } catch (e) {
        logger.error('insumos.load.error', e as Error)
        if (!cancelled) setError('No se pudo cargar el catálogo')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Filtrado client-side (3431 items pequeños = no problema)
  const filtered = useMemo(() => {
    const q = normaliza(search.trim())
    return items.filter((i) => {
      if (familia !== 'all' && i.familia !== familia) return false
      if (status !== 'all' && i.status !== status) return false
      if (conStockSolo && (i.stockFisico == null || i.stockFisico <= 0)) return false
      if (q) {
        const hay = `${i.codigoSAP} ${i.textoBreve} ${i.subFamilia ?? ''} ${i.ubicacion ?? ''}`.toLowerCase()
        if (!normaliza(hay).includes(q)) return false
      }
      return true
    })
  }, [items, search, familia, status, conStockSolo])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  // Stats top — recalculadas con filtros activos para feedback inmediato
  const stats = useMemo(() => {
    const total = items.length
    const activos = items.filter((i) => i.status === 'activo').length
    const conStock = items.filter((i) => (i.stockFisico ?? 0) > 0).length
    const bajoMin = items.filter(
      (i) => i.stockFisico != null && i.stockMinimo != null && i.stockFisico < i.stockMinimo,
    ).length
    return { total, activos, conStock, bajoMin }
  }, [items])

  const handleClear = useCallback(() => {
    setSearch('')
    setFamilia('all')
    setStatus('activo')
    setConStockSolo(false)
  }, [])

  const handleItemUpdated = useCallback((updated: Partial<Insumo>) => {
    if (!selected) return
    setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, ...updated } as Insumo : i)))
    setSelected((prev) => (prev ? { ...prev, ...updated } as Insumo : prev))
  }, [selected])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Spinner className="h-6 w-6" />
        <span className="text-sm">Cargando catálogo…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-destructive">
        <AlertTriangle className="h-6 w-6" />
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-3 sm:px-6 py-3 space-y-3">
          {/* Title + KPIs */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h1 className="text-lg sm:text-xl font-semibold">Insumos</h1>
              <span className="text-xs text-muted-foreground">catálogo transversal</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <Kpi label="Total" value={stats.total} />
              <Kpi label="Activos" value={stats.activos} />
              <Kpi label="Con stock" value={stats.conStock} />
              <Kpi label="Bajo mín." value={stats.bajoMin} tone={stats.bajoMin > 0 ? 'warn' : undefined} />
            </div>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar SAP, descripción, sub-familia, ubicación…"
                className="pl-9 h-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 h-5 w-5 rounded hover:bg-muted flex items-center justify-center"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <Select value={familia} onValueChange={(v) => setFamilia(v as InsumoFamilia | 'all')}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_FAMILIAS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f === 'all' ? 'Todas las familias' : INSUMO_FAMILIA_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => setStatus(v as InsumoStatus | 'all')}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="obsoleto">Obsoleto</SelectItem>
                <SelectItem value="trasladar">Trasladar</SelectItem>
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 px-3 h-9 rounded-md border border-input cursor-pointer select-none">
              <Switch checked={conStockSolo} onCheckedChange={setConStockSolo} />
              <span className="text-sm">Con stock</span>
            </label>

            {(search || familia !== 'all' || status !== 'activo' || conStockSolo) && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="h-9">
                <Filter className="h-3.5 w-3.5 mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Mostrando <span className="font-semibold text-foreground">{visible.length}</span> de{' '}
            <span className="font-semibold text-foreground">{filtered.length}</span> resultados
            {filtered.length !== items.length && (
              <span className="ml-1">(filtrados de {items.length})</span>
            )}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Package className="h-10 w-10 opacity-30" />
            <span className="text-sm">Sin resultados con los filtros actuales</span>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setSelected(item)}
                  className="w-full flex items-start gap-3 px-3 sm:px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono font-semibold text-primary">{item.codigoSAP}</code>
                      <span className="text-xs text-muted-foreground">{INSUMO_FAMILIA_LABEL[item.familia]}</span>
                      {item.subFamilia && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">{item.subFamilia}</Badge>
                      )}
                      {item.status !== 'activo' && (
                        <Badge variant={item.status === 'obsoleto' ? 'destructive' : 'secondary'} className="text-[10px] py-0 px-1.5 h-4">
                          {INSUMO_STATUS_LABEL[item.status]}
                        </Badge>
                      )}
                      {item.stockFisico != null && item.stockMinimo != null && item.stockFisico < item.stockMinimo && (
                        <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">Bajo mín.</Badge>
                      )}
                    </div>
                    <div className="text-sm truncate mt-0.5">{item.textoBreve}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                      {item.ubicacion && <span className="font-mono">📍 {item.ubicacion}</span>}
                      {item.almacen && <span className="font-mono">🏬 {item.almacen}</span>}
                      {item.unidadMedida && <span>{item.unidadMedida}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {item.stockFisico != null ? (
                      <div className="text-sm font-semibold">{item.stockFisico}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">—</div>
                    )}
                    <Eye className="h-3.5 w-3.5 text-muted-foreground/60 mt-1 ml-auto" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {filtered.length > visible.length && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={() => setPageSize((s) => s + PAGE_SIZE)}>
              Mostrar {Math.min(PAGE_SIZE, filtered.length - visible.length)} más
            </Button>
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {selected && (
        <InsumoDetailModal
          insumo={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onUpdated={handleItemUpdated}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div
      className={[
        'flex items-baseline gap-1 px-2 py-1 rounded border',
        tone === 'warn' ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-muted/30',
      ].join(' ')}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={['text-sm font-semibold', tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''].join(' ')}>
        {value.toLocaleString('es-CL')}
      </span>
    </div>
  )
}
