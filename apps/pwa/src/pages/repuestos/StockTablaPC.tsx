import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownCircle, ChevronDown, ChevronUp, Download, Loader2, SlidersHorizontal, Star, X } from 'lucide-react'
import { Button } from '@/components/piel'
import { LECTURA_NOTA } from '@/components/piel/Lectura'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { BOTON_PC, fechaConteoCorta } from './datosFichaPieza'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import { ESTADO_VISIBLE_TEXTO, estadoVisibleDeStock, type EstadoVisible } from '@/hooks/repuestos/estadoDeStock'
import { FILTROS_DE_STOCK, type FiltroRapido, type StockFilterKey } from '@/hooks/repuestos/filtrosDeStock'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'
import {
  CLASE_TEXTO, FILTROS_INICIALES, FILTROS_LIMPIOS, OTROS, facetas, filasDeTablaPC,
  type FiltrosBodega, type GrupoFiltro,
} from '@/utils/repuestos/filtrosBodegaPC'
import { BuscadorBodega } from '@/components/repuestos/bodega/BuscadorBodega'
import { FraseAlertas } from '@/components/repuestos/bodega/FraseAlertas'

/**
 * Stock de Bodega en PC: una tabla que cabe entera en el ancho, sin columna de casillas.
 * El estado se elige con pestañas de texto (con su cuenta); el resto de los filtros vive en
 * «Más filtros». Cada fila: nombre con su SAP debajo, dónde se usa, stock, mínimo, estado
 * (punto + palabra, sin píldora) y valor; la tabla cierra con el total de lo filtrado.
 * Tocar una fila abre la ficha de la pieza como página. En el teléfono sigue la lista (StockTab).
 */

const GRUPOS_MAS: { g: GrupoFiltro; titulo: string; texto: (v: string) => string; max?: number }[] = [
  { g: 'clase', titulo: 'Clase', texto: v => CLASE_TEXTO[v] ?? v },
  { g: 'ubicacion', titulo: 'Ubicación en bodega', texto: v => v || 'Sin ubicación' },
  { g: 'maquina', titulo: 'Máquina', texto: v => v || 'Sin equipo asignado', max: 12 },
  { g: 'otros', titulo: 'Otros', texto: v => OTROS[v]?.texto ?? v },
]

type Col = 'nombre' | 'ubicacion' | 'maquina' | 'stock' | 'minimo' | 'estado' | 'conteo' | 'valor'
const COLS: { c: Col; t: string; num?: boolean }[] = [
  { c: 'nombre', t: 'Repuesto' }, { c: 'ubicacion', t: 'Ubicación' }, { c: 'maquina', t: 'Dónde se usa' },
  { c: 'stock', t: 'Stock', num: true }, { c: 'minimo', t: 'Mín.', num: true },
  { c: 'estado', t: 'Estado' }, { c: 'conteo', t: 'Contado' }, { c: 'valor', t: 'Valor', num: true },
]
const valorTotal = (i: BodegaMergedItem) => i.stockActual * (i.costoCompra ?? i.valorUnitario ?? 0)
/** Solo equipos reales (machineId no vacío): el marcador «Sin equipo» no cuenta. Igual en el Excel. */
const maquinas = (i: BodegaMergedItem) => [...new Set(i.equipos.filter(e => !!(e.machineId ?? '').trim()).map(e => e.machineName).filter(Boolean))]
const ORDEN_ESTADO: Record<EstadoVisible, number> = { sinStock: 0, bajo: 1, ceroSinMinimo: 2, ok: 3, sinConfig: 4 }
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
const fechaIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function clave(i: BodegaMergedItem, c: Col): string | number | null {
  switch (c) {
    // Se ordena por lo que se ve: el nombre común si lo hay, si no el nombre SAP formateado.
    case 'nombre': { const v = nombreVisible(i); return v.esComun || v.titulo !== '(sin nombre)' ? v.titulo : null }
    case 'ubicacion': return i.bodegaId ? (i.ubicacionBodega || null) : null
    case 'maquina': return maquinas(i)[0] ?? null
    case 'stock': return i.bodegaId ? i.stockActual : null
    case 'minimo': return i.bodegaId && i.stockMinimo > 0 ? i.stockMinimo : null
    case 'estado': return ORDEN_ESTADO[estadoVisibleDeStock(i)]
    case 'conteo': return i.bodegaId ? (i.ultimoConteoAt?.getTime() ?? null) : null
    case 'valor': return valorTotal(i) || null
  }
}

/** Punto de 8 px del estado. Sin configurar no lleva punto. */
const PUNTO_ESTADO: Partial<Record<EstadoVisible, string>> = {
  ok: 'bg-ink-ok', bajo: 'bg-ink-warn', sinStock: 'bg-ink-crit', ceroSinMinimo: 'bg-muted-foreground/50',
}

/** Punto de los chips de estado: solo «Bajo mínimo» y «Sin stock» llevan uno. */
const PUNTO_CHIP: Partial<Record<StockFilterKey | 'todos', string>> = { bajo: 'bg-ink-warn', sin: 'bg-ink-crit' }

const PASO = 200

const PESTANAS: { k: StockFilterKey | 'todos'; t: string; estados: string[] }[] = [
  { k: 'configurados', t: 'Configurados', estados: ['ok', 'low', 'out'] },
  { k: 'bajo', t: 'Bajo mínimo', estados: ['low'] },
  { k: 'sin', t: 'Sin stock', estados: ['out'] },
  { k: 'sinConfig', t: 'Sin configurar', estados: ['unset'] },
  { k: 'todos', t: 'Todos con SAP', estados: [] },
]

/** Al apagar un filtro rápido se vuelve a «Configurados». */
const ESTADOS_CONFIGURADOS = PESTANAS.find(p => p.k === 'configurados')?.estados ?? []

/** Filtros rápidos: un predicado propio (FILTROS_DE_STOCK), no un estado. */
const RAPIDOS: { k: FiltroRapido; t: string }[] = [
  { k: 'sinEquipo', t: 'Sin equipo' },
  { k: 'sinContar', t: 'Sin contar' },
]

/** Chip de la fila de filtros: pastilla de 36 px; encendido = marca sólida. */
function Chip({ on, onClick, punto, cifra, children }: {
  on: boolean
  onClick: () => void
  punto?: string
  cifra: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-[36px] items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-subhead',
        on ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted font-medium text-foreground hover:bg-muted-foreground/[0.15]',
      )}
    >
      {punto && <span aria-hidden className={cn('inline-block size-[8px] shrink-0 rounded-full', punto)} />}
      {children}
      <span className={cn('tabular-nums', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{cifra.toLocaleString('es-CL')}</span>
    </button>
  )
}

export function StockTablaPC({ items, acciones, onAbrir, onMovimiento, onFavorito, pedidos, atajoActivo = true }: {
  items: BodegaMergedItem[]
  /** Bloque «Pedidos por atender», justo debajo del buscador. */
  pedidos?: ReactNode
  /** Apaga el atajo «/» del buscador (p. ej. con una pieza abierta). */
  atajoActivo?: boolean
  /** El menú «⋯» de siempre (lote, carga rápida, configurar, CSV). */
  acciones: ReactNode
  /** Abre la ficha; recibe el orden visible para «Anterior» y «Siguiente». */
  onAbrir: (i: BodegaMergedItem, orden: BodegaMergedItem[]) => void
  /** Sin handler (pase de lectura) no se muestra el botón. */
  onMovimiento?: (i: BodegaMergedItem) => void
  onFavorito?: (i: BodegaMergedItem) => void
}) {
  const [f, setF] = useState<FiltrosBodega>(FILTROS_INICIALES)
  const [busca, setBusca] = useState('')
  const [orden, setOrden] = useState<{ c: Col; dir: 1 | -1 }>({ c: 'nombre', dir: 1 })
  const [limite, setLimite] = useState(PASO)
  const [bajando, setBajando] = useState(false)
  const [errExcel, setErrExcel] = useState<string | null>(null)
  const [rapido, setRapido] = useState<FiltroRapido | null>(null)
  useEffect(() => setLimite(PASO), [f, busca, rapido])

  // La tabla, el total y la descarga salen de ESTA lista.
  const visibles = useMemo(() => {
    const r = filasDeTablaPC(items, f, busca, rapido)
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
  }, [items, f, busca, rapido, orden])
  // Las facetas de «Más filtros» cuentan sobre la base del filtro rápido activo, si lo hay.
  const base = useMemo(() => (rapido ? items.filter(FILTROS_DE_STOCK[rapido]) : items), [items, rapido])
  const opciones = useMemo(
    () => Object.fromEntries(GRUPOS_MAS.map(({ g }) => [g, facetas(base, f, g, busca)])) as Record<GrupoFiltro, ReturnType<typeof facetas>>,
    [base, f, busca],
  )

  const alternar = (g: GrupoFiltro, v: string) =>
    setF(p => ({ ...p, [g]: p[g].includes(v) ? p[g].filter(x => x !== v) : [...p[g], v] }))
  const activos = GRUPOS_MAS.flatMap(({ g, texto }) => f[g].map(v => ({ g, v, t: texto(v) })))
  const mismos = (a: readonly string[], b: string[]) => a.length === b.length && b.every(x => a.includes(x))
  // Cada chip cuenta por la MISMA ruta que la tabla (con la búsqueda y «Más filtros» aplicados):
  // su cifra es el número de filas que quedan al pulsarlo.
  const cuentaEstado = (estados: string[]) => filasDeTablaPC(items, { ...f, estado: estados }, busca, null).length
  const cuentaRapido = (k: FiltroRapido) => filasDeTablaPC(items, { ...f, estado: [] }, busca, k).length

  const unidades = visibles.reduce((a, i) => a + (i.bodegaId ? i.stockActual : 0), 0)
  const valor = visibles.reduce((a, i) => a + valorTotal(i), 0)
  const ordenTexto = { nombre: 'nombre', ubicacion: 'ubicación', maquina: 'equipo', stock: 'stock', minimo: 'mínimo', estado: 'estado', conteo: 'conteo', valor: 'valor' }[orden.c]

  const descargar = async () => {
    setBajando(true); setErrExcel(null)
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(visibles.map(i => ({
        'Nombre': formatNombreSAP(i.textoBreve).nombre, 'SAP': i.codigoSAP, 'Código fabricante': i.codigoFabricante,
        'Clase': CLASE_TEXTO[i.clase || ''] ?? i.clase, 'Ubicación': i.bodegaId ? i.ubicacionBodega : '',
        'Máquinas': maquinas(i).join(' | '), 'Equipos': i.equipos.length,
        'Stock': i.bodegaId ? i.stockActual : '', 'Mínimo': i.bodegaId ? i.stockMinimo : '',
        'Estado': ESTADO_VISIBLE_TEXTO[estadoVisibleDeStock(i)],
        'Contado': i.bodegaId && i.ultimoConteoAt ? fechaIso(i.ultimoConteoAt) : '',
        'Valor unitario': i.costoCompra ?? i.valorUnitario ?? '',
        'Valor total': valorTotal(i) || '',
      })))
      ws['!cols'] = [36, 13, 16, 13, 14, 28, 8, 8, 8, 14, 11, 12, 12].map(wch => ({ wch }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Bodega')
      XLSX.writeFile(wb, `bodega_${new Date().toISOString().slice(0, 10)}${activos.length || busca ? '_filtrado' : ''}.xlsx`)
    } catch (e) {
      setErrExcel(`No se pudo generar el Excel: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBajando(false) }
  }

  return (
    <section aria-label="Stock" className="flex min-w-0 flex-col gap-3">
      <BuscadorBodega valor={busca} onCambio={setBusca} esPC atajoActivo={atajoActivo} />
      {pedidos}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar el stock" className="flex flex-wrap items-center gap-2">
          {PESTANAS.map(p => (
            <Chip
              key={p.k}
              on={rapido === null && mismos(f.estado, p.estados)}
              punto={PUNTO_CHIP[p.k]}
              cifra={cuentaEstado(p.estados)}
              onClick={() => { setRapido(null); setF(x => ({ ...x, estado: p.estados })) }}
            >
              {p.t}
            </Chip>
          ))}
          <span aria-hidden className="mx-1.5 h-6 w-px bg-border" />
          {RAPIDOS.map(({ k, t }) => (
            <Chip
              key={k}
              on={rapido === k}
              cifra={cuentaRapido(k)}
              onClick={() => {
                if (rapido === k) { setRapido(null); setF(x => ({ ...x, estado: ESTADOS_CONFIGURADOS })) }
                else { setRapido(k); setF(x => ({ ...x, estado: [] })) }
              }}
            >
              {t}
            </Chip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex h-[36px] items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-3.5 text-subhead font-semibold text-foreground hover:bg-muted-foreground/[0.15]">
                <SlidersHorizontal className="size-4" aria-hidden />Más filtros{activos.length > 0 && <span className="tabular-nums text-brand-ink">· {activos.length}</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[70vh] w-[min(720px,90vw)] overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {GRUPOS_MAS.map(({ g, titulo, texto, max }) => (
                  <div key={g} className="min-w-0">
                    <DropdownMenuLabel className="flex items-center justify-between px-2 text-footnote text-muted-foreground">
                      {titulo}
                      {f[g].length > 0 && <button type="button" onClick={() => setF(p => ({ ...p, [g]: [] }))} className="font-medium text-brand-ink">Quitar</button>}
                    </DropdownMenuLabel>
                    {(max ? opciones[g].slice(0, max) : opciones[g]).map(({ valor: v, cuenta: n }) => (
                      <DropdownMenuCheckboxItem key={v || '∅'} checked={f[g].includes(v)} onSelect={e => e.preventDefault()}
                                                onCheckedChange={() => alternar(g, v)}
                                                className={cn('gap-2 text-footnote', n === 0 && !f[g].includes(v) && 'text-muted-foreground/60')}>
                        <span className="min-w-0 flex-1 truncate">{texto(v)}</span>
                        <span className="tabular-nums text-muted-foreground">{n.toLocaleString('es-CL')}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                ))}
              </div>
              {activos.length > 0 && (<>
                <DropdownMenuSeparator />
                <button type="button" onClick={() => setF(p => ({ ...FILTROS_LIMPIOS, estado: p.estado }))} className="px-2 py-1 text-footnote font-medium text-brand-ink">Quitar todos</button>
              </>)}
            </DropdownMenuContent>
          </DropdownMenu>
          {acciones}
        </div>
      </div>

      {activos.length > 0 && (
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', LECTURA_NOTA)}>
          {activos.map(({ g, v, t }) => (
            <button key={`${g}:${v}`} type="button" onClick={() => alternar(g, v)} aria-label={`Quitar filtro ${t}`}
                    className="inline-flex items-center gap-1 text-foreground hover:underline">
              {t} <X className="size-3.5 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      )}

      <FraseAlertas items={items} />

      <div className="max-h-[calc(100vh-13rem)] overflow-auto">
        <table className="w-full border-collapse text-[length:calc(15px*var(--escala-texto,1))]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="text-footnote text-muted-foreground">
              <th className="w-9" aria-label="Favorito" />
              {COLS.map(({ c, t, num }) => (
                <th key={c} scope="col" aria-sort={orden.c === c ? (orden.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    className={cn('pb-2 pr-3 font-medium', num ? 'text-right' : 'text-left')}>
                  <button type="button" onClick={() => setOrden(o => ({ c, dir: o.c === c ? (o.dir === 1 ? -1 : 1) : 1 }))}
                          className={cn('inline-flex items-center gap-1 whitespace-nowrap', orden.c === c && 'text-foreground')}>
                    {t}
                    {orden.c === c && (orden.dir === 1 ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)}
                  </button>
                </th>
              ))}
              <th className="w-10" aria-label="Movimiento" />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={COLS.length + 2} className="border-t border-border py-12 text-center text-muted-foreground">Ningún repuesto cumple los filtros.</td></tr>
            )}
            {visibles.slice(0, limite).map(i => {
              const nv = nombreVisible(i)
              const est = estadoVisibleDeStock(i)
              const ms = maquinas(i)
              const v = valorTotal(i)
              const punto = PUNTO_ESTADO[est]
              return (
                <tr key={i.rowKey} onClick={() => onAbrir(i, visibles)} className="cursor-pointer border-t border-border align-baseline hover:bg-muted/50">
                  <td className="pl-0.5">
                    {onFavorito && (
                      <button type="button" aria-label={i.isWatched ? 'Quitar de favoritos' : 'Marcar como favorito'}
                              onClick={e => { e.stopPropagation(); onFavorito(i) }}
                              className={cn('flex size-8 items-center justify-center rounded-full hover:bg-muted', i.isWatched ? 'text-ink-warn' : 'text-muted-foreground/40')}>
                        <Star className={cn('size-4', i.isWatched && 'fill-current')} />
                      </button>
                    )}
                  </td>
                  <td className="max-w-[24rem] py-2 pr-3">
                    <span className="block truncate" title={nv.oficial ?? undefined}>
                      {nv.etiquetas.length > 0 && <span className="mr-1.5 text-footnote font-medium text-ink-warn">{nv.etiquetas.join(' · ')}</span>}
                      {nv.esComun || nv.titulo !== '(sin nombre)' ? nv.titulo : <span className="italic text-muted-foreground">Sin nombre</span>}
                    </span>
                    <span className="block font-mono text-footnote text-muted-foreground">
                      {i.codigoSAP}{i.codigoFabricante ? ` · ${i.codigoFabricante}` : ''}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-footnote">{(i.bodegaId && i.ubicacionBodega) || <span className="text-muted-foreground/60">—</span>}</td>
                  <td className="max-w-[15rem] truncate py-2 pr-3 text-footnote">
                    {ms.length ? <>{ms[0]}{ms.length > 1 && <span className="text-muted-foreground"> +{ms.length - 1}</span>}</>
                      : <span className="text-muted-foreground">Sin equipo</span>}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">{i.bodegaId ? i.stockActual : <span className="font-normal text-muted-foreground/60">—</span>}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{i.bodegaId && i.stockMinimo > 0 ? i.stockMinimo : '—'}</td>
                  <td className={cn('whitespace-nowrap py-2 pr-3 text-footnote', est === 'bajo' || est === 'sinStock' ? 'text-foreground' : 'text-muted-foreground')}>
                    {punto && <span className={cn('mr-1.5 inline-block size-[8px] shrink-0 rounded-full align-[1px]', punto)} aria-hidden />}
                    {ESTADO_VISIBLE_TEXTO[est]}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-footnote tabular-nums text-muted-foreground">
                    {i.bodegaId ? (i.ultimoConteoAt ? fechaConteoCorta(i.ultimoConteoAt) : 'Nunca') : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{v ? pesos(v) : '—'}</td>
                  <td className="pr-0.5">
                    {onMovimiento && i.bodegaId && (
                      <button type="button" aria-label="Registrar movimiento" title="Registrar movimiento"
                              onClick={e => { e.stopPropagation(); onMovimiento(i) }}
                              className="flex size-8 items-center justify-center rounded-full text-brand-ink hover:bg-muted">
                        <ArrowDownCircle className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-background">
            <tr className="border-t-2 border-border">
              <td />
              <td colSpan={3} className="py-2.5 pr-3 text-footnote text-muted-foreground">
                {Math.min(limite, visibles.length).toLocaleString('es-CL')} de {visibles.length.toLocaleString('es-CL')} · ordenadas por {ordenTexto}
              </td>
              <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{unidades.toLocaleString('es-CL')}</td>
              <td colSpan={3} className="py-2.5 pr-3 text-footnote text-muted-foreground">{unidades === 1 ? 'unidad' : 'unidades'}</td>
              <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{pesos(valor)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {errExcel && <p className="mr-auto text-footnote text-ink-crit">{errExcel}</p>}
        {visibles.length > limite && <Button variant="plain" size="sm" className={BOTON_PC} onClick={() => setLimite(l => l + PASO)}>Mostrar {PASO} más</Button>}
        <Button variant="tinted" size="sm" className={BOTON_PC} onClick={descargar} disabled={bajando || visibles.length === 0}>
          {bajando ? <Loader2 className="animate-spin" /> : <Download />} Descargar Excel
        </Button>
      </div>
    </section>
  )
}
