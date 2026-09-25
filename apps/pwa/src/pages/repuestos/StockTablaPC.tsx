import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownCircle, ChevronDown, ChevronUp, Download, Loader2, Search, Star, X } from 'lucide-react'
import { Button, Pill, Tag, type PillTone } from '@/components/piel'
import { cn } from '@/lib/utils'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import { stockStatusOf, type StockStatus } from '@/hooks/repuestos/estadoDeStock'
import { contarParaFiltro, type StockFilterKey } from '@/hooks/repuestos/filtrosDeStock'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'
import {
  CLASE_TEXTO, ESTADO_TEXTO, FILTROS_INICIALES, FILTROS_LIMPIOS, OTROS, facetas, pasaFiltros,
  type FiltrosBodega, type GrupoFiltro,
} from '@/utils/repuestos/filtrosBodegaPC'

/**
 * Stock de Bodega en PC: filtros a la izquierda y una tabla a todo el ancho.
 * En el teléfono sigue la lista de siempre (StockTab); esto solo se monta
 * desde 1024 px, donde caben la columna de filtros y las 10 columnas.
 */

const TONO_ESTADO: Record<StockStatus, PillTone> = { ok: 'ok', low: 'warning', out: 'critical', unset: 'neutral' }
const GRUPOS: { g: GrupoFiltro; titulo: string; texto: (v: string) => string; max?: number }[] = [
  { g: 'estado', titulo: 'Estado', texto: v => ESTADO_TEXTO[v as StockStatus] ?? v },
  { g: 'clase', titulo: 'Clase', texto: v => CLASE_TEXTO[v] ?? v },
  { g: 'ubicacion', titulo: 'Ubicación en bodega', texto: v => v || 'Sin ubicación' },
  { g: 'maquina', titulo: 'Máquina', texto: v => v || 'Sin equipo asignado', max: 10 },
  { g: 'otros', titulo: 'Otros', texto: v => OTROS[v]?.texto ?? v },
]

type Col = 'nombre' | 'sap' | 'fab' | 'ubicacion' | 'maquina' | 'stock' | 'minimo' | 'estado' | 'valor'
const COLS: { c: Col; t: string; num?: boolean }[] = [
  { c: 'nombre', t: 'Nombre' }, { c: 'sap', t: 'SAP' }, { c: 'fab', t: 'Cód. fabricante' },
  { c: 'ubicacion', t: 'Ubicación' }, { c: 'maquina', t: 'Máquina / equipos' },
  { c: 'stock', t: 'Stock', num: true }, { c: 'minimo', t: 'Mínimo', num: true },
  { c: 'estado', t: 'Estado' }, { c: 'valor', t: 'Valor', num: true },
]
const valorTotal = (i: BodegaMergedItem) => i.stockActual * (i.costoCompra ?? i.valorUnitario ?? 0)
const maquinas = (i: BodegaMergedItem) => [...new Set(i.equipos.map(e => e.machineName).filter(Boolean))]
const ORDEN_ESTADO: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, unset: 3 }

function clave(i: BodegaMergedItem, c: Col): string | number | null {
  switch (c) {
    case 'nombre': return formatNombreSAP(i.textoBreve).nombre || null
    case 'sap': return i.codigoSAP
    case 'fab': return i.codigoFabricante || null
    case 'ubicacion': return i.bodegaId ? (i.ubicacionBodega || null) : null
    case 'maquina': return maquinas(i)[0] ?? null
    case 'stock': return i.bodegaId ? i.stockActual : null
    case 'minimo': return i.bodegaId && i.stockMinimo > 0 ? i.stockMinimo : null
    case 'estado': return ORDEN_ESTADO[stockStatusOf(i)]
    case 'valor': return valorTotal(i) || null
  }
}

const PASO = 200

export function StockTablaPC({ items, acciones, onAbrir, onMovimiento, onFavorito }: {
  items: BodegaMergedItem[]
  /** El menú «⋯» de siempre (lote, carga rápida, configurar, CSV). */
  acciones: ReactNode
  onAbrir: (i: BodegaMergedItem) => void
  onMovimiento: (i: BodegaMergedItem) => void
  onFavorito: (i: BodegaMergedItem) => void
}) {
  const [f, setF] = useState<FiltrosBodega>(FILTROS_INICIALES)
  const [busca, setBusca] = useState('')
  const [orden, setOrden] = useState<{ c: Col; dir: 1 | -1 }>({ c: 'nombre', dir: 1 })
  const [limite, setLimite] = useState(PASO)
  const [verTodas, setVerTodas] = useState<Partial<Record<GrupoFiltro, boolean>>>({})
  const [bajando, setBajando] = useState(false)
  const [errExcel, setErrExcel] = useState<string | null>(null)
  useEffect(() => setLimite(PASO), [f, busca])

  // La tabla, el pie y la descarga salen de ESTA lista.
  const visibles = useMemo(() => {
    const r = items.filter(i => pasaFiltros(i, f, busca))
    return r
      .map((i, n) => ({ i, n, k: clave(i, orden.c) }))
      .sort((a, b) => {
        if (a.k == null && b.k == null) return a.n - b.n
        if (a.k == null) return 1
        if (b.k == null) return -1
        const d = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'es', { numeric: true })
        return d !== 0 ? d * orden.dir : a.n - b.n
      })
      .map(x => x.i)
  }, [items, f, busca, orden])
  const opciones = useMemo(() => Object.fromEntries(GRUPOS.map(({ g }) => [g, facetas(items, f, g, busca)])) as Record<GrupoFiltro, ReturnType<typeof facetas>>, [items, f, busca])

  const alternar = (g: GrupoFiltro, v: string) =>
    setF(p => ({ ...p, [g]: p[g].includes(v) ? p[g].filter(x => x !== v) : [...p[g], v] }))
  const activos = GRUPOS.flatMap(({ g, texto }) => f[g].map(v => ({ g, v, t: texto(v) })))
  const kpis: { k: StockFilterKey; t: string; estados: string[] }[] = [
    { k: 'configurados', t: 'Configurados', estados: ['ok', 'low', 'out'] },
    { k: 'bajo', t: 'Bajo mínimo', estados: ['low'] },
    { k: 'sin', t: 'Sin stock', estados: ['out'] },
    { k: 'sinConfig', t: 'Sin configurar', estados: ['unset'] },
  ]
  const mismos = (a: readonly string[], b: string[]) => a.length === b.length && b.every(x => a.includes(x))

  const descargar = async () => {
    setBajando(true); setErrExcel(null)
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(visibles.map(i => ({
        'Nombre': formatNombreSAP(i.textoBreve).nombre, 'SAP': i.codigoSAP, 'Código fabricante': i.codigoFabricante,
        'Clase': CLASE_TEXTO[i.clase || ''] ?? i.clase, 'Ubicación': i.bodegaId ? i.ubicacionBodega : '',
        'Máquinas': maquinas(i).join(' | '), 'Equipos': i.equipos.length,
        'Stock': i.bodegaId ? i.stockActual : '', 'Mínimo': i.bodegaId ? i.stockMinimo : '',
        'Estado': ESTADO_TEXTO[stockStatusOf(i)], 'Valor unitario': i.costoCompra ?? i.valorUnitario ?? '',
        'Valor total': valorTotal(i) || '',
      })))
      ws['!cols'] = [36, 13, 16, 13, 14, 28, 8, 8, 8, 14, 12, 12].map(wch => ({ wch }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Bodega')
      XLSX.writeFile(wb, `bodega_${new Date().toISOString().slice(0, 10)}${activos.length || busca ? '_filtrado' : ''}.xlsx`)
    } catch (e) {
      setErrExcel(`No se pudo generar el Excel: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBajando(false) }
  }

  return (
    <div className="grid grid-cols-[250px_minmax(0,1fr)] items-start gap-4">
      {/* ── Filtros ── */}
      <aside aria-label="Filtros" className="sticky top-3 flex max-h-[calc(100vh-1.5rem)] flex-col gap-4 overflow-y-auto rounded-card bg-card p-3 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        {GRUPOS.map(({ g, titulo, texto, max }) => {
          const ops = opciones[g]
          const lista = max && !verTodas[g] ? ops.slice(0, max) : ops
          return (
            <section key={g} className="flex flex-col">
              <h3 className="mb-1 flex items-center justify-between text-footnote font-semibold text-muted-foreground">
                {titulo}
                {f[g].length > 0 && (
                  <button type="button" onClick={() => setF(p => ({ ...p, [g]: [] }))} className="text-footnote font-medium text-primary">Quitar</button>
                )}
              </h3>
              {lista.map(({ valor, cuenta }) => (
                <label key={valor || '∅'}
                       className={cn('flex min-h-[34px] cursor-pointer items-center gap-2 rounded-ctl px-1.5 text-footnote hover:bg-muted',
                         cuenta === 0 && !f[g].includes(valor) && 'text-muted-foreground/60')}>
                  <input type="checkbox" checked={f[g].includes(valor)} onChange={() => alternar(g, valor)}
                         className="size-4 shrink-0 accent-primary" />
                  <span className="min-w-0 flex-1 truncate">{texto(valor)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{cuenta.toLocaleString('es-CL')}</span>
                </label>
              ))}
              {max && ops.length > max && (
                <button type="button" onClick={() => setVerTodas(v => ({ ...v, [g]: !v[g] }))}
                        className="mt-0.5 self-start px-1.5 text-footnote font-medium text-primary">
                  {verTodas[g] ? 'Ver menos' : `Ver las ${ops.length}`}
                </button>
              )}
            </section>
          )
        })}
      </aside>

      <div className="flex min-w-0 flex-col gap-3">
        {/* ── Indicadores: tocar uno filtra por ese estado ── */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map(k => {
            const on = mismos(f.estado, k.estados)
            return (
              <button key={k.k} type="button" aria-pressed={on}
                      onClick={() => setF(p => ({ ...p, estado: k.estados }))}
                      className={cn('rounded-card bg-card px-4 py-2.5 text-left shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition-colors dark:shadow-none',
                        on ? 'ring-2 ring-primary/50' : 'hover:bg-muted')}>
                <span className="block text-title2 font-bold tabular-nums text-foreground">{contarParaFiltro(items, k.k).toLocaleString('es-CL')}</span>
                <span className="text-footnote text-muted-foreground">{k.t}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
                   placeholder="Nombre, SAP, código de fabricante o ubicación…"
                   className="h-11 w-full rounded-full bg-muted pl-10 pr-4 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {acciones}
        </div>

        {activos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activos.map(({ g, v, t }) => (
              <button key={`${g}:${v}`} type="button" onClick={() => alternar(g, v)}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-primary/[0.12] px-2.5 text-footnote font-medium text-primary">
                {t} <X className="size-3.5" />
              </button>
            ))}
            <button type="button" onClick={() => { setF(FILTROS_LIMPIOS); setBusca('') }} className="px-1.5 text-footnote font-medium text-muted-foreground hover:text-foreground">
              Quitar todos
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
          <div className="max-h-[calc(100vh-14rem)] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-footnote">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className="w-9 border-b border-border" aria-label="Favorito" />
                  {COLS.map(({ c, t, num }) => (
                    <th key={c} scope="col" aria-sort={orden.c === c ? (orden.dir === 1 ? 'ascending' : 'descending') : 'none'}
                        className={cn('border-b border-border px-2 py-2 font-semibold text-muted-foreground', num ? 'text-right' : 'text-left')}>
                      <button type="button" onClick={() => setOrden(o => ({ c, dir: o.c === c ? (o.dir === 1 ? -1 : 1) : 1 }))}
                              className={cn('inline-flex min-h-[28px] items-center gap-1 whitespace-nowrap', orden.c === c && 'text-primary')}>
                        {t}
                        {orden.c === c && (orden.dir === 1 ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)}
                      </button>
                    </th>
                  ))}
                  <th className="w-11 border-b border-border" aria-label="Movimiento" />
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr><td colSpan={COLS.length + 2} className="py-12 text-center text-muted-foreground">Ningún repuesto cumple los filtros.</td></tr>
                )}
                {visibles.slice(0, limite).map(i => {
                  const { nombre, etiquetas } = formatNombreSAP(i.textoBreve)
                  const est = stockStatusOf(i)
                  const ms = maquinas(i)
                  const v = valorTotal(i)
                  return (
                    <tr key={i.rowKey} onClick={() => onAbrir(i)} className="cursor-pointer hover:bg-muted/60">
                      <td className="border-b border-border/40 pl-1.5">
                        <button type="button" aria-label={i.isWatched ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                onClick={e => { e.stopPropagation(); onFavorito(i) }}
                                className={cn('flex size-8 items-center justify-center rounded-full hover:bg-muted', i.isWatched ? 'text-ink-warn' : 'text-muted-foreground/40')}>
                          <Star className={cn('size-4', i.isWatched && 'fill-current')} />
                        </button>
                      </td>
                      <td className="max-w-[26rem] border-b border-border/40 px-2 py-2">
                        {etiquetas.map(e => <Tag key={e} tone="neutral" className="mr-1.5 align-[1px]">{e}</Tag>)}
                        {nombre || <span className="italic text-muted-foreground">Sin nombre</span>}
                      </td>
                      <td className="border-b border-border/40 px-2 py-2 font-mono">{i.codigoSAP}</td>
                      <td className="border-b border-border/40 px-2 py-2 font-mono">{i.codigoFabricante || <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="border-b border-border/40 px-2 py-2 whitespace-nowrap">{(i.bodegaId && i.ubicacionBodega) || <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="max-w-[16rem] border-b border-border/40 px-2 py-2">
                        {ms.length ? <>{ms.slice(0, 2).join(', ')}{ms.length > 2 && <span className="text-muted-foreground"> +{ms.length - 2}</span>}</>
                          : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="border-b border-border/40 px-2 py-2 text-right font-semibold tabular-nums">{i.bodegaId ? i.stockActual : <span className="font-normal text-muted-foreground/50">—</span>}</td>
                      <td className="border-b border-border/40 px-2 py-2 text-right tabular-nums">{i.bodegaId && i.stockMinimo > 0 ? i.stockMinimo : <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="border-b border-border/40 px-2 py-2"><Pill tone={TONO_ESTADO[est]}>{ESTADO_TEXTO[est]}</Pill></td>
                      <td className="border-b border-border/40 px-2 py-2 text-right tabular-nums">{v ? `$${v.toLocaleString('es-CL', { maximumFractionDigits: 0 })}` : <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="border-b border-border/40 pr-1.5">
                        <button type="button" aria-label="Registrar movimiento" title="Registrar movimiento"
                                onClick={e => { e.stopPropagation(); onMovimiento(i) }}
                                className="flex size-9 items-center justify-center rounded-full text-primary hover:bg-muted">
                          <ArrowDownCircle className="size-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 text-footnote tabular-nums text-muted-foreground">
            <span>
              {Math.min(limite, visibles.length).toLocaleString('es-CL')} de {visibles.length.toLocaleString('es-CL')} repuestos filtrados
              {' '}(de {items.length.toLocaleString('es-CL')} con SAP) · {visibles.reduce((a, i) => a + (i.bodegaId ? i.stockActual : 0), 0).toLocaleString('es-CL')} unidades
            </span>
            <span className="flex items-center gap-2">
              {visibles.length > limite && <Button variant="plain" onClick={() => setLimite(l => l + PASO)}>Mostrar {PASO} más</Button>}
              <Button variant="tinted" onClick={descargar} disabled={bajando || visibles.length === 0}>
                {bajando ? <Loader2 className="animate-spin" /> : <Download />} Descargar Excel
              </Button>
            </span>
          </div>
          {errExcel && <p className="px-3 pb-2 text-footnote text-ink-crit">{errExcel}</p>}
        </div>
      </div>
    </div>
  )
}
