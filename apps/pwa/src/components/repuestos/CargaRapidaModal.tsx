/**
 * CargaRapidaModal — Carga rápida de stock + ubicación de bodega, ítem por ítem.
 *
 * Pensado para poblar de un tirón los con-SAP que no tienen stock/ubicación:
 * una fila por material con inputs inline (stock · pasillo · estante · nivel),
 * guardado al salir del campo (blur) o con Enter (que además salta a la
 * siguiente fila). Reusa `saveStock` de useBodega (upsert en `bodega/{sap}`).
 */
import { useMemo, useRef, useState } from 'react'
import { X, Check, Loader2, Search, MapPin } from 'lucide-react'
import type { BodegaMergedItem, BodegaStockData } from '@/hooks/repuestos/useBodega'
import { haystackMatchesAll, normalizeForSearch } from '@/utils/repuestos'

interface Props {
  items: BodegaMergedItem[]
  saveStock: (sap: string, data: BodegaStockData) => Promise<void>
  onClose: () => void
}

interface Edit { stock: string; pasillo: string; estante: string; nivel: string }

const INPUT = 'w-full px-2 py-1.5 text-sm bg-muted border border-border rounded-ctl focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground'

const faltaUbicacion = (i: BodegaMergedItem) => !i.pasillo && !i.estante && !i.nivel && !i.ubicacionBodega
const faltaStock = (i: BodegaMergedItem) => !i.bodegaId || (i.stockActual ?? 0) === 0

export function CargaRapidaModal({ items, saveStock, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [soloFaltantes, setSoloFaltantes] = useState(true)
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const stockRefs = useRef<(HTMLInputElement | null)[]>([])

  const editOf = (i: BodegaMergedItem): Edit =>
    edits[i.codigoSAP] ?? {
      stock: i.bodegaId ? String(i.stockActual ?? 0) : '',
      pasillo: i.pasillo ?? '',
      estante: i.estante ?? '',
      nivel: i.nivel ?? '',
    }

  const setField = (sap: string, base: Edit, field: keyof Edit, value: string) =>
    setEdits((prev) => ({ ...prev, [sap]: { ...base, ...prev[sap], [field]: value } }))

  const visible = useMemo(() => {
    let res = items
    if (soloFaltantes) res = res.filter((i) => faltaUbicacion(i) || faltaStock(i))
    const terms = normalizeForSearch(search).split(/\s+/).filter(Boolean)
    if (terms.length) {
      res = res.filter((i) => {
        const h = normalizeForSearch(`${i.codigoSAP} ${i.textoBreve} ${i.tipo ?? ''}`)
        return haystackMatchesAll(h, terms)
      })
    }
    return res
  }, [items, soloFaltantes, search])

  const pendientes = useMemo(() => items.filter((i) => faltaUbicacion(i)).length, [items])

  // Cap de render: 3.777 con-SAP × 4 inputs sería lentísimo. Mostramos un tramo
  // (los configurados/en-bodega van primero por el orden de useBodega) y se acota
  // con el buscador. Enter sigue saltando dentro del tramo visible.
  const LIMIT = 150
  const shown = visible.slice(0, LIMIT)

  const saveRow = async (item: BodegaMergedItem) => {
    const e = editOf(item)
    const sap = item.codigoSAP
    // No guardar si no hay nada que registrar
    const stockNum = e.stock.trim() === '' ? (item.stockActual ?? 0) : Math.max(0, Math.round(Number(e.stock) || 0))
    setSaving((s) => new Set(s).add(sap))
    try {
      await saveStock(sap, {
        stockActual: stockNum,
        stockMinimo: item.stockMinimo || 1,
        ubicacionBodega: item.ubicacionBodega || '',
        unidad: item.unidad || 'pzas',
        pasillo: e.pasillo.trim(),
        estante: e.estante.trim(),
        nivel: e.nivel.trim(),
      })
      setSaved((s) => new Set(s).add(sap))
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(sap); return n })
    }
  }

  const onEnter = (item: BodegaMergedItem, idx: number) => {
    void saveRow(item)
    const next = stockRefs.current[idx + 1]
    if (next) next.focus()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-card border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h3 className="text-base font-bold">Carga rápida — stock y ubicación</h3>
          </div>
          <button onClick={onClose} className="rounded-ctl p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por SAP, nombre o tipo…" className={`${INPUT} pl-8`} />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 rounded-ctl border border-border px-3 py-1.5 text-sm">
            <input type="checkbox" checked={soloFaltantes} onChange={(e) => setSoloFaltantes(e.target.checked)} className="rounded-ctl" />
            Solo faltantes
          </label>
          <span className="text-xs text-muted-foreground">{visible.length} ítems · {pendientes} sin ubicación · {saved.size} guardados</span>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {/* Cabecera de columnas (desktop) */}
          <div className="sticky top-0 z-10 mb-1 hidden grid-cols-[1fr_70px_88px_88px_72px_28px] gap-2 bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Material</span><span>Stock</span><span>Pasillo</span><span>Estante</span><span>Nivel</span><span />
          </div>
          {visible.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {soloFaltantes ? '¡Sin faltantes! Todos los visibles ya tienen ubicación o stock.' : 'Sin resultados.'}
            </div>
          ) : (
            shown.map((item, idx) => {
              const e = editOf(item)
              const isSaved = saved.has(item.codigoSAP)
              const isSaving = saving.has(item.codigoSAP)
              return (
                <div key={item.codigoSAP} className="grid grid-cols-2 items-center gap-2 rounded-ctl px-3 py-1.5 hover:bg-muted/40 sm:grid-cols-[1fr_70px_88px_88px_72px_28px]">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <div className="truncate text-sm font-medium text-foreground" title={item.textoBreve}>{item.textoBreve || '(sin nombre)'}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">SAP {item.codigoSAP}{item.tipo ? ` · ${item.tipo}` : ''}</div>
                  </div>
                  <input
                    ref={(el) => { stockRefs.current[idx] = el }}
                    type="number" min={0} inputMode="numeric" placeholder="0"
                    value={e.stock}
                    onChange={(ev) => setField(item.codigoSAP, e, 'stock', ev.target.value)}
                    onBlur={() => saveRow(item)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(item, idx) } }}
                    className={`${INPUT} tabular-nums`}
                  />
                  <input
                    type="text" placeholder="Pasillo" value={e.pasillo}
                    onChange={(ev) => setField(item.codigoSAP, e, 'pasillo', ev.target.value)}
                    onBlur={() => saveRow(item)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(item, idx) } }}
                    className={INPUT}
                  />
                  <input
                    type="text" placeholder="Estante" value={e.estante}
                    onChange={(ev) => setField(item.codigoSAP, e, 'estante', ev.target.value)}
                    onBlur={() => saveRow(item)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(item, idx) } }}
                    className={INPUT}
                  />
                  <input
                    type="text" placeholder="Nivel" value={e.nivel}
                    onChange={(ev) => setField(item.codigoSAP, e, 'nivel', ev.target.value)}
                    onBlur={() => saveRow(item)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(item, idx) } }}
                    className={INPUT}
                  />
                  <div className="flex justify-center">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      : isSaved ? <Check className="h-4 w-4 text-emerald-500" />
                      : <span className="h-2 w-2 rounded-full bg-muted-foreground/20" />}
                  </div>
                </div>
              )
            })
          )}
          {visible.length > LIMIT && (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              Mostrando {LIMIT} de {visible.length}. Usa el buscador para acotar y cargar el resto.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
          <span>Se guarda solo al salir del campo o con Enter (Enter salta a la fila siguiente).</span>
          <button onClick={onClose} className="rounded-ctl border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted">Listo</button>
        </div>
      </div>
    </div>
  )
}
