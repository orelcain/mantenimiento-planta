import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Loader2, Pencil, Scale, Search, Shapes, X } from 'lucide-react'
import { Button, ListCell, ListGroup, SegmentedControl, Sheet, Tag, type TagTone } from '@/components/piel'
import {
  FILTROS_VACIOS, conTotalesPorSap, diferencia, filtrosActivos, nombreDe, ordenarLineas, pasaFiltros, planDeAjuste,
  type ColumnaOrden, type FiltroDif, type FiltroEstado, type FiltrosTabla,
} from '@/utils/repuestos/inventarioTabla'
import { rutaDibujo, useFigurasDespiece, useManualesPieza } from './enlacesPieza'
import type { useBodega, InventarioLinea, InventarioSesion, MotivoDuda, BodegaMergedItem } from '@/hooks/repuestos/useBodega'

/**
 * Inventario de la bodega de UNA máquina, contado a mano y cargado desde el
 * cuaderno. Vista distinta por dispositivo:
 *  - PC: una sola tabla con TODAS las líneas, orden por columna y un filtro
 *    en cada columna (autofiltro de Excel). Clic en una fila la corrige o,
 *    si es dudosa, la valida.
 *  - Celular: Inventario (validado, en lista) y Dudosos (tarjetas).
 * Dudosa = lo que el papel no deja cerrar (código que no existe, cantidad
 * sobrescrita, SAP que es de otra pieza, sin SAP). El código del cuaderno
 * nunca se pisa.
 */

const MOTIVO: Record<MotivoDuda, { texto: string; tono: TagTone }> = {
  codigo: { texto: 'Revisar código', tono: 1 },
  cantidad: { texto: 'Revisar cantidad', tono: 3 },
  sap: { texto: 'SAP no corresponde', tono: 3 },
  sin_sap: { texto: 'Sin SAP', tono: 5 },
}

const normCodigo = (s: string) => s.toUpperCase().replace(/[\s.\-/]/g, '')

/** El repuesto del maestro con ese código de fabricante (el que tenga SAP). */
function buscarEnMaestro(items: BodegaMergedItem[], codigo: string): BodegaMergedItem | undefined {
  const k = normCodigo(codigo)
  if (!k) return undefined
  return items.find(i => i.codigoSAP && normCodigo(i.codigoFabricante || '') === k)
}

type Guardar = (l: InventarioLinea, d: Parameters<ReturnType<typeof useBodega>['validarLinea']>[2]) => Promise<void>

/**
 * Al ir del inventario al dibujo en el teléfono (misma pestaña), al volver
 * hay que caer DENTRO del mismo inventario, no en la lista de inventarios.
 * BodegaView e InventarioTab leen esta marca al montar.
 */
export const CLAVE_VOLVER_INVENTARIO = 'bodega:volverAInventario'

/** Lo que las filas necesitan para ir al dibujo o al manual de su pieza. */
interface CtxEnlaces {
  sesionId: string
  maquina?: string
  dibujoDe: (codigo: string) => string | null
  manualDe: (codigo: string) => { url: string | null; pagina: number } | null
  cargandoManual: boolean
  /** En el teléfono los manuales se cargan recién al pedirlos (≈2 MB de catálogo). */
  pedirManuales: () => void
}
const Enlaces = createContext<CtxEnlaces | null>(null)
const useEnlaces = () => useContext(Enlaces)!
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

/** Baja las líneas dadas como .xlsx. PC y celular usan esta misma función: mismo archivo, mismas columnas. */
async function descargarExcel(ls: InventarioLinea[], nombreArchivo: string) {
  const XLSX = await import('xlsx')
  const filas = ls.map(l => ({
    'Ubicación': l.ubicacion,
    'Código fabricante': l.codigoFabricante,
    'Código en el cuaderno': l.codigoCuaderno !== l.codigoFabricante ? l.codigoCuaderno : '',
    'Nombre': nombreDe(l),
    'Nombre común': l.nombreComun,
    'SAP': l.codigoSAP,
    'Contado': l.cantidad ?? '',
    'Sistema': l.stockSistema ?? '',
    'Diferencia': diferencia(l) ?? '',
    'Sistema antes del ajuste': l.stockSistemaAntes ?? '',
    'Estado': l.estado === 'dudoso' && l.motivo ? MOTIVO[l.motivo].texto : 'Validado',
    'Nota del cuaderno': l.notaCuaderno,
  }))
  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [14, 16, 16, 32, 18, 13, 9, 9, 10, 12, 18, 28].map(wch => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
}

/** Botón de descarga con su propio estado de carga y error (un fallo se dice, no se traga). */
function BotonExcel({ onDescargar, disabled, className }: { onDescargar: () => Promise<void>; disabled?: boolean; className?: string }) {
  const [bajando, setBajando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className={className}>
      <Button variant="tinted" disabled={bajando || disabled}
              onClick={async () => {
                setBajando(true); setErr(null)
                try { await onDescargar() }
                catch (e) { setErr(e instanceof Error ? `No se pudo generar el Excel: ${e.message}` : 'No se pudo generar el Excel.') }
                finally { setBajando(false) }
              }}>
        {bajando ? <Loader2 className="animate-spin" /> : <Download />} Descargar Excel
      </Button>
      {err && <p className="mt-1 text-footnote text-ink-crit">{err}</p>}
    </div>
  )
}

export function InventarioMaquinaView({ sesion, bodega, user, onVolver }: {
  sesion: InventarioSesion
  bodega: ReturnType<typeof useBodega>
  user: { id: string; nombre: string } | null
  onVolver: () => void
}) {
  const { items, loadLineas, validarLinea, aplicarAjusteInventario } = bodega
  const [lineas, setLineas] = useState<InventarioLinea[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      // Con el total por SAP: la diferencia de un SAP repartido en dos
      // ubicaciones se mide contra lo contado entre ambas.
      setLineas(conTotalesPorSap(await loadLineas(sesion.id)))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las líneas.')
    }
  }, [loadLineas, sesion.id])
  useEffect(() => { void recargar() }, [recargar])

  const unidades = (lineas ?? []).reduce((a, l) => a + (l.cantidad ?? 0), 0)
  const figuras = useFigurasDespiece()
  // En el PC los manuales se cargan de entrada (los íconos de la tabla ya
  // apuntan a su página); en el teléfono, recién cuando alguien abre una fila.
  const [quiereManuales, setQuiereManuales] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches === true)
  const manuales = useManualesPieza(quiereManuales)
  const enlaces = useMemo<CtxEnlaces>(() => ({
    sesionId: sesion.id,
    maquina: sesion.maquina,
    dibujoDe: codigo => rutaDibujo(figuras, codigo, sesion.maquina),
    manualDe: codigo => manuales.manualDe(codigo, sesion.maquina),
    cargandoManual: manuales.cargando,
    pedirManuales: () => setQuiereManuales(true),
  }), [sesion.id, sesion.maquina, figuras, manuales])

  const guardar: Guardar = async (l, datos) => {
    if (!user) throw new Error('Hay que iniciar sesión.')
    await validarLinea(sesion.id, l.id, datos, user.id, user.nombre)
    await recargar()
  }

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onVolver}
                className="-ml-1 mb-1 flex min-h-[44px] items-center gap-1 text-subhead text-primary">
          <ChevronLeft className="h-4 w-4" /> Inventarios
        </button>
        <h3 className="text-title3 font-bold text-foreground">{sesion.nombre}</h3>
        <p className="text-footnote text-muted-foreground tabular-nums">
          {sesion.maquina ? `${sesion.maquina} · ` : ''}{lineas?.length ?? '…'} líneas · {unidades} unidades
        </p>
      </div>

      {error && <p className="flex items-center gap-1.5 text-footnote text-ink-crit"><AlertTriangle className="h-4 w-4" />{error}</p>}
      {!lineas && !error && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}

      {lineas && user && (
        <PanelAjuste lineas={lineas}
                     onAplicar={async (plan, onProgreso) => {
                       const r = await aplicarAjusteInventario(sesion, lineas, plan, user.id, user.nombre, onProgreso)
                       await recargar()
                       return r
                     }} />
      )}

      {lineas && (
        <Enlaces.Provider value={enlaces}>
          {/* PC: TODO el inventario en una sola tabla, con filtro por columna
              (como el autofiltro de Excel). Celular: lista en dos renglones —
              8 columnas no caben en 375 px sin volverse ilegibles. */}
          <div className="hidden md:block" data-vista="pc">
            <TablaInventario lineas={lineas} items={items} onGuardar={guardar} nombreArchivo={sesion.nombre} />
          </div>
          <div className="md:hidden" data-vista="celular">
            <ListaCelular lineas={lineas} items={items} onGuardar={guardar} nombreArchivo={sesion.nombre} />
          </div>
        </Enlaces.Provider>
      )}
    </div>
  )
}

/* ══════════════════════ Ajustar el stock de bodega al conteo ══════════════════════ */

function PanelAjuste({ lineas, onAplicar }: {
  lineas: InventarioLinea[]
  onAplicar: (plan: ReturnType<typeof planDeAjuste>, onProgreso: (h: number, t: number) => void) =>
    Promise<{ actualizados: number; creados: number; cuadran: number }>
}) {
  const plan = useMemo(() => planDeAjuste(lineas), [lineas])
  const [abierto, setAbierto] = useState(false)
  const [progreso, setProgreso] = useState<[number, number] | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const pendientes = plan.cambian.length + plan.cuadran.length
  const bajan = plan.cambian.filter(a => a.sistema != null && a.contado < a.sistema).length
  const suben = plan.cambian.filter(a => a.sistema != null && a.contado > a.sistema).length
  const crean = plan.cambian.filter(a => a.sistema == null).length
  const pct = plan.conFicha ? Math.round((plan.cuadrabanConFicha / plan.conFicha) * 100) : null

  const aviso = hecho && <p className="flex items-center gap-1.5 text-footnote text-ink-ok"><Check className="h-4 w-4 shrink-0" />{hecho}</p>
  if (!pendientes) return aviso || null
  if (!abierto) {
    return (
      <div className="space-y-2">
        {aviso}
        <Button variant="tinted" onClick={() => { setAbierto(true); setErr(null); setHecho(null) }}>
          <Scale /> Ajustar stock según el conteo ({pendientes})
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <p className="text-headline font-semibold text-foreground">Ajustar el stock de bodega a lo contado</p>
      <ul className="m-0 list-disc space-y-1 pl-5 text-body text-foreground">
        {plan.cambian.length - crean > 0 && (
          <li className="tabular-nums">{plan.cambian.length - crean} repuestos cambian de stock: {bajan} bajan y {suben} suben.</li>
        )}
        {crean > 0 && <li className="tabular-nums">{crean} se crean en bodega (no tenían ficha), con la ubicación del inventario.</li>}
        {plan.cuadran.length > 0 && <li className="tabular-nums">{plan.cuadran.length} ya cuadraban: solo se marcan como revisados.</li>}
      </ul>
      {(plan.dudosas > 0 || plan.sinSap > 0) && (
        <p className="text-footnote text-muted-foreground tabular-nums">
          No se tocan {plan.dudosas > 0 && <>{plan.dudosas} dudosas (hasta validarlas)</>}
          {plan.dudosas > 0 && plan.sinSap > 0 && ' ni '}
          {plan.sinSap > 0 && <>{plan.sinSap} sin SAP</>}. Cuando las valides, este botón vuelve a aparecer solo con esas.
        </p>
      )}
      {pct != null && (
        <p className="text-footnote text-muted-foreground tabular-nums">
          Antes del ajuste, el sistema cuadraba con lo contado en <b className="text-foreground">{plan.cuadrabanConFicha} de {plan.conFicha}</b> repuestos con ficha ({pct} %).
        </p>
      )}
      <p className="text-footnote text-muted-foreground">
        Cada cambio queda como movimiento de ajuste («sistema X → contado Y») en el historial del repuesto.
      </p>
      {err && <p className="text-footnote text-ink-crit">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="filled" disabled={!!progreso}
                onClick={async () => {
                  setErr(null); setProgreso([0, plan.cambian.length])
                  try {
                    const r = await onAplicar(plan, (h, t) => setProgreso([h, t]))
                    setHecho(`Stock ajustado: ${r.actualizados} actualizados, ${r.creados} creados en bodega, ${r.cuadran} ya cuadraban.`)
                    setAbierto(false)
                  } catch (e) {
                    setErr(`No se pudo terminar el ajuste: ${e instanceof Error ? e.message : String(e)}. Lo que alcanzó a hacerse quedó guardado; vuelve a intentarlo y seguirá con lo pendiente.`)
                  } finally { setProgreso(null) }
                }}>
          {progreso ? <><Loader2 className="animate-spin" /> {progreso[0]} de {progreso[1]}…</> : <><Check /> Ajustar stock</>}
        </Button>
        {!progreso && <Button variant="plain" onClick={() => setAbierto(false)}>Cancelar</Button>}
      </div>
    </div>
  )
}

/* ══════════════════════ Ir al dibujo o al manual ══════════════════════ */

/** Íconos de la tabla del PC: abren en OTRA pestaña para no perder los filtros. */
function EnlacesPC({ codigo }: { codigo: string }) {
  const e = useEnlaces()
  const dib = e.dibujoDe(codigo)
  const man = e.manualDe(codigo)
  const icono = 'flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted'
  return (
    <div className="flex justify-end gap-0.5" onClick={ev => ev.stopPropagation()}>
      {dib
        ? <a href={`${BASE}${dib}`} target="_blank" rel="noopener noreferrer" title="Ver en el dibujo" aria-label={`Ver ${codigo} en el dibujo`} className={`${icono} text-primary`}><Shapes className="h-4 w-4" /></a>
        : <span title="Sin dibujo en el despiece" className={`${icono} text-muted-foreground/30`}><Shapes className="h-4 w-4" /></span>}
      {man?.url
        ? <a href={man.url} target="_blank" rel="noopener noreferrer" title={`Manual, página ${man.pagina}`} aria-label={`Ver ${codigo} en el manual, página ${man.pagina}`} className={`${icono} text-primary`}><BookOpen className="h-4 w-4" /></a>
        : <span title={man ? `Manual pág. ${man.pagina}: el PDF no está disponible ahora` : e.cargandoManual ? 'Buscando la página del manual…' : 'Sin página en el manual'} className={`${icono} text-muted-foreground/30`}><BookOpen className="h-4 w-4" /></span>}
    </div>
  )
}

/* ══════════════════════ PC: tabla con autofiltro ══════════════════════ */

const COLUMNAS: { col: ColumnaOrden; titulo: string; num?: boolean }[] = [
  { col: 'ubicacion', titulo: 'Ubicación' },
  { col: 'codigo', titulo: 'Código fabricante' },
  { col: 'nombre', titulo: 'Nombre' },
  { col: 'sap', titulo: 'SAP' },
  { col: 'cantidad', titulo: 'Contado', num: true },
  { col: 'sistema', titulo: 'Sistema', num: true },
  { col: 'dif', titulo: 'Dif.', num: true },
  { col: 'estado', titulo: 'Estado' },
]

function EstadoTag({ l }: { l: InventarioLinea }) {
  if (l.estado === 'dudoso' && l.motivo) return <Tag tone={MOTIVO[l.motivo].tono}>{MOTIVO[l.motivo].texto}</Tag>
  return <Tag tone={2}>Validado</Tag>
}

function DifTexto({ l }: { l: InventarioLinea }) {
  const d = diferencia(l)
  if (d == null) return <span className="text-muted-foreground/60">—</span>
  if (d === 0) return <span className="text-muted-foreground">0</span>
  return <span className={d > 0 ? 'text-ink-ok' : 'text-ink-crit'}>{d > 0 ? '+' : ''}{d}</span>
}

function TablaInventario({ lineas, items, onGuardar, nombreArchivo }: {
  lineas: InventarioLinea[]
  items: BodegaMergedItem[]
  onGuardar: Guardar
  nombreArchivo: string
}) {
  const [f, setF] = useState<FiltrosTabla>(FILTROS_VACIOS)
  const [busca, setBusca] = useState('')
  const [orden, setOrden] = useState<{ col: ColumnaOrden; dir: 1 | -1 }>({ col: 'ubicacion', dir: 1 })
  const [abierta, setAbierta] = useState<string | null>(null)

  const ubicaciones = useMemo(
    () => [...new Set(lineas.map(l => l.ubicacion))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    [lineas])
  // La tabla, el pie y la descarga salen de ESTA lista: lo anunciado es lo que se ve.
  const visibles = useMemo(
    () => ordenarLineas(lineas.filter(l => pasaFiltros(l, f, busca)), orden.col, orden.dir),
    [lineas, f, busca, orden])
  const nFiltros = filtrosActivos(f, busca)
  const dudosas = lineas.filter(l => l.estado === 'dudoso').length
  const set = <K extends keyof FiltrosTabla>(k: K, v: FiltrosTabla[K]) => setF(p => ({ ...p, [k]: v }))
  const ordenarPor = (col: ColumnaOrden) =>
    setOrden(o => ({ col, dir: o.col === col ? (o.dir === 1 ? -1 : 1) : 1 }))


  const control = 'h-[36px] w-full min-w-0 rounded-ctl bg-muted px-2 text-footnote text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'
  const activo = (v: string) => (v ? `${control} bg-primary/[0.12] font-semibold text-primary` : control)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
                 placeholder="Buscar en todo: código, SAP o nombre…"
                 className="h-11 w-full rounded-full bg-muted pl-10 pr-4 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        {dudosas > 0 && f.estado !== 'dudoso' && (
          <Button variant="tinted" onClick={() => setF({ ...FILTROS_VACIOS, estado: 'dudoso' })}>
            <AlertTriangle /> {dudosas} por confirmar
          </Button>
        )}
        {nFiltros > 0 && (
          <Button variant="plain" onClick={() => { setF(FILTROS_VACIOS); setBusca('') }}><X /> Quitar filtros</Button>
        )}
      </div>

      <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-footnote tabular-nums">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                {COLUMNAS.map(c => (
                  <th key={c.col} scope="col" aria-sort={orden.col === c.col ? (orden.dir === 1 ? 'ascending' : 'descending') : 'none'}
                      className={`border-b border-border px-2 pt-2 font-semibold text-muted-foreground ${c.num ? 'text-right' : 'text-left'}`}>
                    <button type="button" onClick={() => ordenarPor(c.col)}
                            className={`inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap ${orden.col === c.col ? 'text-primary' : ''}`}>
                      {c.titulo}
                      {orden.col === c.col && (orden.dir === 1 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                    </button>
                  </th>
                ))}
                <th scope="col" className="border-b border-border px-2 pt-2 text-right font-semibold text-muted-foreground">Ver</th>
              </tr>
              <tr>
                <th className="border-b border-border px-1.5 pb-2 font-normal">
                  <select aria-label="Filtrar ubicación" value={f.ubicacion} onChange={e => set('ubicacion', e.target.value)} className={activo(f.ubicacion)}>
                    <option value="">Todas</option>
                    {ubicaciones.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </th>
                <th className="border-b border-border px-1.5 pb-2 font-normal">
                  <input aria-label="Filtrar código" value={f.codigo} onChange={e => set('codigo', e.target.value)} placeholder="Contiene…" className={`${activo(f.codigo)} font-mono`} />
                </th>
                <th className="border-b border-border px-1.5 pb-2 font-normal">
                  <input aria-label="Filtrar nombre" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Contiene…" className={activo(f.nombre)} />
                </th>
                <th className="border-b border-border px-1.5 pb-2 font-normal">
                  <select aria-label="Filtrar SAP" value={f.sap} onChange={e => set('sap', e.target.value as FiltrosTabla['sap'])} className={activo(f.sap)}>
                    <option value="">Todos</option><option value="con">Con SAP</option><option value="sin">Sin SAP</option>
                  </select>
                </th>
                <th className="border-b border-border" /><th className="border-b border-border" />
                <th className="border-b border-border px-1.5 pb-2 font-normal">
                  <select aria-label="Filtrar diferencia" value={f.dif} onChange={e => set('dif', e.target.value as FiltroDif)} className={activo(f.dif)}>
                    <option value="">Todas</option><option value="con">Con diferencia</option><option value="falta">Faltan (−)</option>
                    <option value="sobra">Sobran (+)</option><option value="cero">Cuadra (0)</option><option value="nd">Sin dato</option>
                  </select>
                </th>
                <th className="border-b border-border px-1.5 pb-2 font-normal">
                  <select aria-label="Filtrar estado" value={f.estado} onChange={e => set('estado', e.target.value as FiltroEstado)} className={activo(f.estado)}>
                    <option value="">Todos</option><option value="validado">Validados</option><option value="dudoso">Todos los dudosos</option>
                    {(Object.keys(MOTIVO) as MotivoDuda[]).map(m => <option key={m} value={m}>{MOTIVO[m].texto}</option>)}
                  </select>
                </th>
                <th className="border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Ninguna línea cumple los filtros.</td></tr>
              )}
              {visibles.map(l => (
                <Fragment key={l.id}>
                  <tr onClick={() => setAbierta(a => (a === l.id ? null : l.id))}
                      className={`cursor-pointer hover:bg-muted/60 ${abierta === l.id ? 'bg-muted/60' : ''}`}>
                    <td className="border-b border-border/40 px-2 py-2 whitespace-nowrap">{l.ubicacion}</td>
                    <td className="border-b border-border/40 px-2 py-2 font-mono">
                      {l.codigoFabricante}
                      {l.codigoCuaderno !== l.codigoFabricante && <span className="block text-caption text-muted-foreground">cuaderno: {l.codigoCuaderno}</span>}
                    </td>
                    <td className="border-b border-border/40 px-2 py-2">
                      {nombreDe(l) || <span className="text-muted-foreground/60">—</span>}
                      {l.nombreComun && <span className="text-muted-foreground"> · {l.nombreComun}</span>}
                    </td>
                    <td className="border-b border-border/40 px-2 py-2 font-mono">{l.codigoSAP || <span className="text-muted-foreground/60">sin SAP</span>}</td>
                    <td className="border-b border-border/40 px-2 py-2 text-right font-semibold">
                      {l.cantidad ?? '?'}
                      {l.lineasSap && <span className="block text-caption font-normal text-muted-foreground">total SAP {l.contadoSap} ({l.lineasSap} líneas)</span>}
                    </td>
                    <td className="border-b border-border/40 px-2 py-2 text-right">
                      {l.stockSistema ?? <span className="text-muted-foreground/60">—</span>}
                      {l.aplicadoCantidad != null && l.stockSistemaAntes !== l.stockSistema && (
                        <span className="block text-caption text-muted-foreground">antes {l.stockSistemaAntes ?? 'sin ficha'}</span>
                      )}
                    </td>
                    <td className="border-b border-border/40 px-2 py-2 text-right"><DifTexto l={l} /></td>
                    <td className="border-b border-border/40 px-2 py-2"><EstadoTag l={l} /></td>
                    <td className="border-b border-border/40 px-1 py-1"><EnlacesPC codigo={l.codigoFabricante} /></td>
                  </tr>
                  {abierta === l.id && (
                    <tr>
                      <td colSpan={9} className="border-b border-border/40 bg-muted/30 px-4 py-3">
                        <div className="max-w-xl space-y-2">
                          {l.estado === 'dudoso' && (
                            <p className="text-footnote text-muted-foreground">
                              Cuaderno: <b className="font-mono text-foreground">{l.codigoCuaderno}</b> × {l.cantidad ?? '?'}
                              {l.notaCuaderno && <> · «{l.notaCuaderno}»</>}
                              {l.detalleDuda && <><br />{l.detalleDuda}</>}
                            </p>
                          )}
                          <FormularioLinea linea={l} items={items} textoBoton={l.estado === 'dudoso' ? 'Validar' : 'Guardar'}
                                           onCancelar={() => setAbierta(null)}
                                           onGuardar={async d => { await onGuardar(l, d); setAbierta(null) }} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 text-footnote text-muted-foreground tabular-nums">
          <span>
            {visibles.length} de {lineas.length} líneas · {visibles.reduce((a, l) => a + (l.cantidad ?? 0), 0)} unidades
            {nFiltros > 0 && ` · ${nFiltros} filtro${nFiltros > 1 ? 's' : ''} activo${nFiltros > 1 ? 's' : ''}`}
            {' · '}clic en una fila para corregirla
          </span>
          <BotonExcel disabled={visibles.length === 0}
                      onDescargar={() => descargarExcel(visibles, `${nombreArchivo}${nFiltros ? ' (filtrado)' : ''}`)} />
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════ Celular: lista ══════════════════════ */

type Chip = 'todos' | 'con' | 'falta' | 'sin'
const CHIPS: { id: Chip; texto: string; filtro: Partial<FiltrosTabla> }[] = [
  { id: 'todos', texto: 'Todos', filtro: {} },
  { id: 'con', texto: 'Con diferencia', filtro: { dif: 'con' } },
  { id: 'falta', texto: 'Faltan', filtro: { dif: 'falta' } },
  { id: 'sin', texto: 'Sin SAP', filtro: { sap: 'sin' } },
]

function ListaCelular({ lineas, items, onGuardar, nombreArchivo }: {
  lineas: InventarioLinea[]; items: BodegaMergedItem[]; onGuardar: Guardar; nombreArchivo: string
}) {
  const [vista, setVista] = useState<'inventario' | 'dudosos'>('inventario')
  const [busca, setBusca] = useState('')
  const [agrupar, setAgrupar] = useState<'ubicacion' | ''>('ubicacion')
  const [orden, setOrden] = useState<ColumnaOrden>('ubicacion')
  const [chip, setChip] = useState<Chip>('todos')

  const validadas = useMemo(() => lineas.filter(l => l.estado === 'validado'), [lineas])
  const dudosas = useMemo(() => lineas.filter(l => l.estado === 'dudoso'), [lineas])
  const filtroChip = (c: Chip): FiltrosTabla => ({ ...FILTROS_VACIOS, ...CHIPS.find(x => x.id === c)!.filtro })
  const visibles = useMemo(
    () => ordenarLineas(validadas.filter(l => pasaFiltros(l, filtroChip(chip), busca)), orden, 1),
    [validadas, chip, busca, orden])
  const grupos = useMemo(() => {
    if (!agrupar) return [['', visibles] as const]
    const m = new Map<string, InventarioLinea[]>()
    for (const l of visibles) { if (!m.has(l.ubicacion)) m.set(l.ubicacion, []); m.get(l.ubicacion)!.push(l) }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
  }, [visibles, agrupar])
  const dudosasVisibles = dudosas.filter(l => pasaFiltros(l, FILTROS_VACIOS, busca))
  const menu = 'h-11 min-w-0 flex-1 rounded-full bg-muted px-3 text-subhead text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <div className="space-y-3">
      {/* En el teléfono se baja TODO el inventario (validadas y dudosas, con
          su estado), en el orden de las ubicaciones: los chips y la búsqueda
          sirven para mirar, no para armar el reporte. */}
      <BotonExcel onDescargar={() => descargarExcel(ordenarLineas(lineas, 'ubicacion', 1), nombreArchivo)} />
      <SegmentedControl
        value={vista} onChange={setVista} ariaLabel="Vista del inventario"
        segments={[
          { value: 'inventario', label: <>Inventario <span className="tabular-nums text-muted-foreground">{validadas.length}</span></> },
          { value: 'dudosos', label: <>Dudosos <span className="tabular-nums text-ink-warn">{dudosas.length}</span></> },
        ]} />
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
               placeholder="Código, SAP o nombre…"
               className="h-11 w-full rounded-full bg-muted pl-10 pr-4 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
      </div>

      {vista === 'inventario' && (
        <>
          <div className="flex gap-2">
            <select aria-label="Agrupar" value={agrupar} onChange={e => setAgrupar(e.target.value as 'ubicacion' | '')} className={menu}>
              <option value="ubicacion">Por ubicación</option>
              <option value="">Sin agrupar</option>
            </select>
            <select aria-label="Ordenar" value={orden} onChange={e => setOrden(e.target.value as ColumnaOrden)} className={menu}>
              <option value="ubicacion">Orden: ubicación</option>
              <option value="codigo">Orden: código</option>
              <option value="nombre">Orden: nombre</option>
              <option value="cantidad">Orden: cantidad</option>
              <option value="dif">Orden: diferencia</option>
            </select>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
            {CHIPS.map(c => {
              const n = validadas.filter(l => pasaFiltros(l, filtroChip(c.id), busca)).length
              const on = chip === c.id
              return (
                <button key={c.id} type="button" onClick={() => setChip(c.id)} aria-pressed={on}
                        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                  {c.texto} <span className="tabular-nums opacity-80">{n}</span>
                </button>
              )
            })}
          </div>
          {visibles.length === 0
            ? <p className="py-8 text-center text-footnote text-muted-foreground">Sin coincidencias</p>
            : grupos.map(([ubi, ls]) => (
                <ListGroup key={ubi || 'todo'}
                           title={ubi ? <>{ubi} <span className="tabular-nums font-normal">· {ls.length} líneas · {ls.reduce((a, l) => a + (l.cantidad ?? 0), 0)} unidades</span></> : undefined}>
                  {ls.map(l => <FilaValidada key={l.id} linea={l} items={items} onGuardar={onGuardar} />)}
                </ListGroup>
              ))}
        </>
      )}

      {vista === 'dudosos' && (
        dudosasVisibles.length === 0
          ? <p className="py-8 text-center text-footnote text-muted-foreground">{busca ? 'Sin coincidencias' : 'No quedan dudosos: todo está validado.'}</p>
          : <div className="space-y-3">
              <p className="text-footnote text-muted-foreground">
                Confirma cada línea con la etiqueta de la pieza. Al validarla pasa al inventario; lo que decía el cuaderno queda guardado.
              </p>
              {dudosasVisibles.map(l => <TarjetaDudosa key={l.id} linea={l} items={items} onGuardar={onGuardar} />)}
            </div>
      )}
    </div>
  )
}

/* ── Una línea confirmada: nombre, códigos, contado vs sistema; se puede corregir ── */

function FilaValidada({ linea: l, items, onGuardar }: {
  linea: InventarioLinea
  items: BodegaMergedItem[]
  onGuardar: Guardar
}) {
  const [editando, setEditando] = useState(false)
  const [acciones, setAcciones] = useState(false)
  const e = useEnlaces()
  const navigate = useNavigate()
  const dif = diferencia(l)
  if (editando) {
    return (
      <div className="border-b border-border/40 p-3 last:border-b-0">
        <FormularioLinea linea={l} items={items} textoBoton="Guardar"
                         onCancelar={() => setEditando(false)}
                         onGuardar={async d => { await onGuardar(l, d); setEditando(false) }} />
      </div>
    )
  }
  const dib = e.dibujoDe(l.codigoFabricante)
  const man = e.manualDe(l.codigoFabricante)
  return (
    <>
      {/* Toda la fila es el toque: abre las acciones (dibujo, manual, corregir).
          Un solo blanco grande en vez de botoncitos apretados. */}
      <button type="button"
              onClick={() => { e.pedirManuales(); setAcciones(true) }}
              className="flex min-h-[56px] w-full items-center gap-3 border-b border-border/40 px-4 py-2.5 text-left last:border-b-0 active:bg-muted/60">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-foreground">{l.textoBreve || l.descripcion || 'Sin nombre'}</p>
          <p className="text-footnote text-muted-foreground">
            <span className="font-mono tabular-nums">{l.codigoFabricante}</span>
            {' · '}
            {l.codigoSAP ? <span className="font-mono tabular-nums">SAP {l.codigoSAP}</span> : <span className="text-ink-warn">sin SAP</span>}
            {l.codigoCuaderno && l.codigoCuaderno !== l.codigoFabricante && <> · cuaderno: <span className="font-mono">{l.codigoCuaderno}</span></>}
            {l.nombreComun && <> · {l.nombreComun}</>}
          </p>
        </div>
        <div className="w-16 shrink-0 text-right">
          <p className="text-headline font-bold tabular-nums text-foreground">{l.cantidad ?? '—'}</p>
          {l.lineasSap && <p className="text-caption tabular-nums text-muted-foreground">total {l.contadoSap}</p>}
          {l.stockSistema != null && (
            <p className={`text-caption tabular-nums ${dif ? (dif > 0 ? 'text-ink-ok' : 'text-ink-crit') : 'text-muted-foreground'}`}>
              sist. {l.stockSistema}{dif ? ` (${dif > 0 ? '+' : ''}${dif})` : ''}
            </p>
          )}
          {l.aplicadoCantidad != null && l.stockSistemaAntes !== l.stockSistema && (
            <p className="text-caption tabular-nums text-muted-foreground">antes {l.stockSistemaAntes ?? 'sin ficha'}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>

      <Sheet open={acciones} onClose={() => setAcciones(false)}
             title={l.textoBreve || l.descripcion || l.codigoFabricante}
             description={<span className="font-mono tabular-nums">{l.codigoFabricante}{l.codigoSAP ? ` · SAP ${l.codigoSAP}` : ''} · {l.ubicacion}</span>}>
        <ListGroup>
          <ListCell
            leading={<Shapes className="h-5 w-5 text-primary" />}
            title="Ver en el dibujo"
            subtitle={dib ? 'Zoom a su posición; si va en varios lugares, los recorre uno a uno' : 'Esta pieza no está en el despiece navegable'}
            chevron={!!dib}
            className={dib ? '' : 'opacity-50'}
            onClick={dib ? () => {
              // Al volver (atrás) se cae de nuevo en este inventario.
              try { sessionStorage.setItem(CLAVE_VOLVER_INVENTARIO, e.sesionId) } catch { /* sin storage */ }
              navigate(dib)
            } : undefined} />
          <ListCell
            leading={<BookOpen className="h-5 w-5 text-primary" />}
            title={man ? `Ver en el manual · pág. ${man.pagina}` : 'Ver en el manual'}
            subtitle={man?.url ? 'PDF del fabricante: pesado, necesita señal'
              : man ? 'El PDF no está disponible ahora (sin señal o sin sesión)'
              : e.cargandoManual ? 'Buscando su página…' : 'Sin página en el manual'}
            chevron={!!man?.url}
            className={man?.url ? '' : 'opacity-50'}
            onClick={man?.url ? () => { window.open(man.url!, '_blank', 'noopener') } : undefined} />
          <ListCell
            leading={<Pencil className="h-5 w-5 text-primary" />}
            title="Corregir o recontar"
            subtitle="Código, cantidad o SAP de esta línea"
            chevron
            onClick={() => { setAcciones(false); setEditando(true) }} />
        </ListGroup>
      </Sheet>
    </>
  )
}

/* ── Una línea dudosa: qué dice el cuaderno, por qué duda, y el formulario ── */

function TarjetaDudosa({ linea: l, items, onGuardar }: {
  linea: InventarioLinea
  items: BodegaMergedItem[]
  onGuardar: Guardar
}) {
  const m = l.motivo ? MOTIVO[l.motivo] : undefined
  return (
    <div className="space-y-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        {m && <Tag tone={m.tono}>{m.texto}</Tag>}
        <span className="text-footnote text-muted-foreground">{l.ubicacion}</span>
      </div>
      <p className="text-body text-foreground">
        Cuaderno: <b className="font-mono tabular-nums">{l.codigoCuaderno}</b>
        {' '}<span className="tabular-nums">× {l.cantidad ?? '?'}</span>
        {l.notaCuaderno && <span className="text-muted-foreground"> · «{l.notaCuaderno}»</span>}
      </p>
      {l.detalleDuda && <p className="text-footnote text-muted-foreground">{l.detalleDuda}</p>}
      <FormularioLinea linea={l} items={items} textoBoton="Validar" onGuardar={d => onGuardar(l, d)} />
    </div>
  )
}

/* ── Formulario común: código, cantidad y SAP, con el maestro buscando solo ── */

function FormularioLinea({ linea: l, items, textoBoton, onGuardar, onCancelar }: {
  linea: InventarioLinea
  items: BodegaMergedItem[]
  textoBoton: string
  onGuardar: (d: Parameters<ReturnType<typeof useBodega>['validarLinea']>[2]) => Promise<void>
  onCancelar?: () => void
}) {
  const [codigo, setCodigo] = useState(l.estado === 'dudoso' && l.motivo === 'codigo' ? (l.sugerencia || l.codigoCuaderno) : l.codigoFabricante)
  const [cantidad, setCantidad] = useState<string>(l.cantidad != null ? String(l.cantidad) : '')
  // Un SAP que "no corresponde" no se ofrece de nuevo: se escribe el correcto.
  const [sap, setSap] = useState(l.motivo === 'sap' && l.estado === 'dudoso' ? '' : l.codigoSAP)
  const [sapTocado, setSapTocado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const enMaestro = useMemo(() => buscarEnMaestro(items, codigo), [items, codigo])
  // El SAP sigue al código mientras nadie lo haya escrito a mano.
  useEffect(() => {
    if (sapTocado) return
    if (l.motivo === 'sap' && l.estado === 'dudoso') return
    setSap(enMaestro?.codigoSAP ?? (codigo === l.codigoFabricante ? l.codigoSAP : ''))
  }, [enMaestro, codigo, sapTocado, l])
  const itemSap = useMemo(() => items.find(i => i.codigoSAP === sap.trim()), [items, sap])

  const n = Number(cantidad)
  const valido = codigo.trim().length >= 4 && cantidad.trim() !== '' && Number.isInteger(n) && n >= 0

  const enviar = async () => {
    if (!valido) return
    setGuardando(true); setErr(null)
    try {
      await onGuardar({
        codigoFabricante: codigo.trim(),
        cantidad: n,
        codigoSAP: sap.trim(),
        textoBreve: itemSap?.textoBreve || (sap.trim() ? l.textoBreve : '') || l.descripcion || l.textoBreve,
        // Sin ficha de bodega el "stock" es un 0 por defecto, no un dato: no se compara.
        stockSistema: itemSap?.bodegaId ? itemSap.stockActual : null,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally { setGuardando(false) }
  }

  const campo = 'h-11 w-full rounded-ctl bg-muted px-3 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted-foreground">Código de fabricante</span>
          <input value={codigo} onChange={e => setCodigo(e.target.value)} inputMode="text" autoComplete="off"
                 className={`${campo} font-mono`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted-foreground">Cantidad</span>
          <input value={cantidad} onChange={e => setCantidad(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
                 className={`${campo} text-center font-semibold tabular-nums`} />
        </label>
      </div>
      {l.sugerencia && codigo !== l.sugerencia && l.estado === 'dudoso' && (
        <button type="button" onClick={() => setCodigo(l.sugerencia!)}
                className="min-h-[36px] text-footnote text-primary">
          Usar la sugerencia: <span className="font-mono">{l.sugerencia}</span>
        </button>
      )}
      <p className="text-footnote text-muted-foreground">
        {enMaestro
          ? <>En el maestro: <b className="text-foreground">{enMaestro.textoBreve}</b> · SAP <span className="font-mono">{enMaestro.codigoSAP}</span>{enMaestro.bodegaId ? ` · stock sistema ${enMaestro.stockActual}` : ' · sin stock configurado en bodega'}</>
          : codigo.trim().length >= 4 ? 'Ese código no tiene SAP en el maestro: se puede validar igual y asignar el SAP a mano.' : ''}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Código SAP (opcional)</span>
        <input value={sap} onChange={e => { setSap(e.target.value.replace(/\D/g, '')); setSapTocado(true) }} inputMode="numeric"
               placeholder={l.motivo === 'sap' ? `El actual (${l.codigoSAP}) es de otra pieza` : 'Sin SAP'}
               className={`${campo} font-mono tabular-nums`} />
      </label>
      {sap.trim() && !itemSap && <p className="text-footnote text-ink-warn">Ese SAP no está en la bodega de la app.</p>}
      {itemSap && sapTocado && <p className="text-footnote text-muted-foreground">SAP {itemSap.codigoSAP}: {itemSap.textoBreve}</p>}
      {err && <p className="text-footnote text-ink-crit">{err}</p>}
      <div className="flex gap-2">
        <Button variant="filled" onClick={enviar} disabled={!valido || guardando}>
          {guardando ? <Loader2 className="animate-spin" /> : <Check />} {textoBoton}
        </Button>
        {onCancelar && <Button variant="plain" onClick={onCancelar}><X /> Cancelar</Button>}
      </div>
    </div>
  )
}
