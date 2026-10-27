/**
 * PROTOTIPO «monitor v2» (no producción, ?glass=v2).
 *
 * Nace del panel MiroFish del 26-10 (28 respuestas) y del reel «Glassy
 * Dashboard V2»: lo que envejecía el monitor no era la falta de vidrio sino
 * los párrafos dentro de las tarjetas y los números que no destacaban. Cada
 * tarjeta responde UNA pregunta con UNA cifra grande y una píldora de
 * contexto. El «por qué» vuelve en dos niveles, sin ensuciar la vista de lejos:
 *  · gráficos con hover (PC) / toque (celular) que muestran el punto exacto;
 *  · cada tarjeta se toca y abre su detalle: hoja desde abajo en celular,
 *    panel lateral en PC.
 * Lo de siempre sigue debajo, plegado en «Ver análisis completo».
 *
 * Vistas: `CabeceraV2`, `MonitorV2` (El turno) y `MonitorV2Analisis`.
 */
import { AlertTriangle, BarChart3, CalendarRange, ChevronDown, Clock, Cpu, Filter, Gauge, Repeat, Target, Timer, TrendingUp, Wrench, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ListCell, ListGroup, Pill, Sheet } from '@/components/piel'
import type { PillTone } from '@/components/piel/Pill'
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'
import type { MonitorStatus } from '@/services/shoplogix/publicShiftMonitor.service'
import type { PacePoint } from '@/services/shoplogix/monitorCompare'
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'
import type { ParetoRow } from '@/services/shoplogix/monitorPareto'
import type { SemanaReparto } from './repartoSemanal'
import { DetalleSemanaV2 } from './DetalleSemanaV2'
import { contenedorPlural, vaciasEtiqueta, type Cascada } from './cascadaTurno'
import type { DetalleCascada, DuenoDetalle, HoraDetalle, RenglonDetalle } from './cascadaDetalle'
import { DUENO_UI } from './duenoUi'
import { useZoomGesto, type Ventana } from './useZoomGesto'
import { AnilloMeta, Globo, Icono, Tarjeta } from './AmpliarV2'
import { useCuentaCifra, useEntradaEscalonada, useEsPc } from './ampliarHooks'
import { etiquetaMaquina } from './ritmoVivo'

// ── Formato ──────────────────────────────────────────────────────────────────

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
const firmado = (n: number, f: (x: number) => string = int) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`
const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)
const hhmm = (iso: string) => iso.slice(11, 16)
/** Para una cifra grande: «8,2 h» cabe en media tarjeta de celular; «8 h 13 min» no. */
const horasCifra = (min: number) => (min >= 60 ? `${dec(min / 60)} h` : `${Math.round(min)} min`)
const relojDe = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const semanaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`

/** Color de relleno por dueño, como variable CSS (el SVG no lee clases bg-*). */
const RELLENO: Record<DuenoPerdida, string> = {
  mantencion: 'var(--v2-mant)',
  externo: 'var(--v2-ext)',
  'sin-imputar': 'var(--v2-gris)',
  programado: 'var(--v2-prog)',
}
const DUENOS = ['mantencion', 'externo', 'sin-imputar'] as const

// ── Interacción ──────────────────────────────────────────────────────────────

/**
 * Elemento activo de un gráfico: hover con mouse, toque con el dedo (el toque
 * alterna). `stopPropagation` para que tocar una barra no abra el detalle de
 * la tarjeta que la contiene.
 */
function useActivo() {
  const [activo, setActivo] = useState<number | null>(null)
  const en = (i: number) => ({
    onPointerEnter: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setActivo(i) },
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); setActivo((a) => (a === i ? null : i)) },
  })
  const salir = { onPointerLeave: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setActivo(null) } }
  return { activo, en, salir }
}

// ── Detalle: hoja (celular) / panel lateral (PC) ─────────────────────────────

function PanelDetalle({ abierto, titulo, sub, onClose, children }: {
  abierto: boolean; titulo: string; sub?: string; onClose: () => void; children: ReactNode
}) {
  const pc = useEsPc()
  useEffect(() => {
    if (!abierto || !pc) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [abierto, pc, onClose])
  if (!pc) {
    return (
      <Sheet open={abierto} onClose={onClose} title={titulo} description={sub} surface="grouped">
        <div className="v2-vars space-y-5 pb-4">{children}</div>
      </Sheet>
    )
  }
  if (!abierto) return null
  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={titulo} className="v2-panel-lateral v2-vars absolute inset-y-3 right-3 flex w-[460px] max-w-[calc(100vw-24px)] flex-col rounded-[32px] text-foreground">
        <div className="flex items-start gap-3 px-6 pb-3 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold leading-tight tracking-tight">{titulo}</h2>
            {sub && <p className="mt-1 text-[14px] text-muted-foreground">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="tap-44 inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted-foreground/[0.12] text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-6">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

function Grupo({ titulo, nota, children }: { titulo?: string; nota?: string; children: ReactNode }) {
  return <ListGroup title={titulo} footer={nota}>{children}</ListGroup>
}

const Punto = ({ color }: { color: string }) => <i className="block h-3 w-3 rounded-full" style={{ background: color }} />

// ── Primitivos de tarjeta ────────────────────────────────────────────────────

function Cifra({ valor, unidad, chica }: { valor: string; unidad?: string; chica?: boolean }) {
  return (
    <div className="mt-3 flex items-baseline gap-1.5">
      <span className={`${chica ? 'v2-cifra-chica' : 'v2-cifra'} tabular-nums font-semibold leading-none tracking-tight text-foreground`}>{valor}</span>
      {unidad && <span className="text-[15px] text-muted-foreground">{unidad}</span>}
    </div>
  )
}

function Contexto({ tono, children, nota }: { tono: PillTone; children: ReactNode; nota?: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Pill tone={tono} className="tabular-nums">{children}</Pill>
      {nota && <span className="text-[13px] tabular-nums text-muted-foreground">{nota}</span>}
    </div>
  )
}

function Leyenda({ items }: { items: Array<{ color: string; label: string; trazo?: 'linea' | 'punteada' }> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.trazo === 'punteada'
            ? <i className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: it.color }} />
            : it.trazo === 'linea'
              ? <i className="h-[3px] w-4 rounded-full" style={{ background: it.color }} />
              : <i className="h-2 w-2 rounded-full" style={{ background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** Barra horizontal con etiqueta y valor: el «Spending by category» del reel, sin dona. */
function FilaBarra({ label, sub, valor, frac, color }: { label: string; sub?: string; valor: string; frac: number; color: string }) {
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[15px]">
        <span className="min-w-0 truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{valor}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted-foreground/[0.12]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, background: color }} />
      </div>
      {sub && <div className="mt-1 text-[12px] text-muted-foreground">{sub}</div>}
    </li>
  )
}

/** 0 = solo lo esencial · 1 = «Ver más» (tarjetas nuevas) · 2 = además la versión clásica. */
export type VistaV2 = 0 | 1 | 2

function BotonDetalle({ vista, onVista, conMas = true }: { vista: VistaV2; onVista: (v: VistaV2) => void; conMas?: boolean }) {
  const abierto = conMas ? vista >= 1 : vista === 2
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => onVista(abierto ? 0 : conMas ? 1 : 2)}
        className="tap-44 flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] text-primary transition-colors hover:bg-primary/10"
      >
        {abierto ? 'Ver menos' : conMas ? 'Ver más del turno' : 'Ver versión clásica'}
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {conMas && vista >= 1 && (
        <button type="button" onClick={() => onVista(vista === 2 ? 1 : 2)} className="tap-44 rounded-full px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground">
          {vista === 2 ? 'Ocultar versión clásica' : 'Ver versión clásica (todo el detalle de antes)'}
        </button>
      )}
      <a href={urlClasico()} className="tap-44 rounded-full px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground">
        Volver al monitor anterior
      </a>
    </div>
  )
}

/** Misma URL con ?glass=clasico: el monitor de antes, sin el v2. */
function urlClasico(): string {
  const u = new URL(window.location.href)
  u.searchParams.set('glass', 'clasico')
  return u.pathname + u.search
}

const ic = 'h-3.5 w-3.5'

// ── Velocidad minuto a minuto ────────────────────────────────────────────────

/** Ciclos por minuto de cada máquina, tal como los entrega Shoplogix (el pulso del turno). */
export interface MinutoTurno {
  desde: string
  maquinas: Array<{ id: string; nombre: string; esperado: number | null; cycles: number[] }>
}

/** Una parada ubicada en el reloj (ms, misma base que `MinutoTurno.desde`). */
export interface EventoMarcado {
  desdeMs: number
  hastaMs: number
  causa: string | null
  /** La máquina de la parada (id de `MinutoTurno.maquinas`). null = no se sabe: se marca en todas. */
  maquinaId?: string | null
}

type TonoMinuto = 'ok' | 'warn' | 'crit' | 'sin'
/** Los cortes de Shoplogix en sus barras: ≥75 % del esperado ok, 50-75 atención, <50 crítico. */
function tonoMinuto(v: number, esperado: number | null): TonoMinuto {
  if (esperado == null || esperado <= 0) return v > 0 ? 'ok' : 'sin'
  const r = v / esperado
  return r >= 0.75 ? 'ok' : r >= 0.5 ? 'warn' : 'crit'
}
/* Paleta calma: lo normal va en el acento y solo lo que se queda atrás toma color (ámbar y coral apagados). */
const COLOR_MINUTO: Record<TonoMinuto, string> = {
  ok: 'var(--v2-bien)',
  warn: 'var(--v2-atento)',
  crit: 'var(--v2-mal)',
  sin: 'var(--v2-prog)',
}
const RELLENO_MINUTO = (t: TonoMinuto) => `linear-gradient(to top, color-mix(in srgb, ${COLOR_MINUTO[t]} 35%, transparent), ${COLOR_MINUTO[t]})`

/** Ancho de barra con el que el número del minuto se lee bien (el mismo objetivo del clásico). */
const PX_BARRA_V2 = 19
/** Desde este ancho la cifra entra adentro de la barra. */
const PX_NUMERO_V2 = 15
/** Margen interno de cada franja: las columnas de minuto quedan alineadas entre franjas. */
const PAD_MINUTO = 12
const PASOS_MARCA = [5, 10, 15, 30, 60, 120]

/**
 * Una franja por máquina y arriba la línea (la suma), una barra por minuto del turno.
 * Cada franja abre con su cifra: qué parte de los minutos del turno anduvo a ritmo (≥75 % del esperado).
 *
 * El zoom es el del clásico (`useZoomGesto`): en el celular abre en los últimos minutos con la
 * cifra adentro de cada barra y siguiendo el presente; se pellizca para acercar o alejar, se
 * arrastra para recorrer y «ver todo el turno» vuelve al turno entero. Con ancho de sobra (PC)
 * abre con el turno completo. Pasar el mouse o tocar marca el mismo minuto en todas las franjas.
 * Las cabeceras quedan pegadas al borde visible mientras el contenido se desplaza.
 */
export function MinutoTurnoV2({ d, cerrado, marca, onQuitarMarca }: {
  d: MinutoTurno; cerrado: boolean; marca?: EventoMarcado | null; onQuitarMarca?: () => void
}) {
  const [i, setI] = useState<number | null>(null)
  const t0 = Date.parse(d.desde)
  /* Sin máquinas, Math.min() da Infinity y el Array.from de abajo revienta. */
  let n = d.maquinas.length ? Math.min(...d.maquinas.map((m) => m.cycles.length)) : 0
  const suma = Array.from({ length: n }, (_, k) => d.maquinas.reduce((a, m) => a + (m.cycles[k] ?? 0), 0))
  /* Cerrado, los minutos en cero DESPUÉS de la última pieza no son una línea parada: el turno ya terminó. */
  if (cerrado) while (n > 2 && suma[n - 1] === 0) n--

  const medidorRef = useRef<HTMLDivElement>(null)
  const [anchoPx, setAnchoPx] = useState(0)
  useEffect(() => {
    const el = medidorRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAnchoPx(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /* Ventana de partida: en PC, si el turno entero entra a ~2,5 px por minuto, se muestra completo;
     en el celular (y si no entra), los minutos que caben con cifra legible, pegados al presente. */
  const util = Math.max(0, anchoPx - 2 * PAD_MINUTO)
  const ventanaDef = util <= 0 ? null : anchoPx >= 600 && util >= n * 2.5 ? n : Math.max(12, Math.min(60, Math.floor(util / PX_BARRA_V2)))
  const [tocado, setTocado] = useState(false)
  const [ventana, setVentana] = useState<Ventana | null>(null)
  useEffect(() => {
    if (tocado || ventanaDef == null) return
    setVentana(n > ventanaDef ? { desdeMin: n - ventanaDef, hastaMin: n } : null)
  }, [n, tocado, ventanaDef])
  const zg = useZoomGesto({
    dominioMin: Math.max(1, n),
    ventana,
    /* El scroll programado también publica: es gesto de la persona solo si la vista dejó la cola. */
    onVentana: (v) => {
      const esCola = v != null && v.hastaMin >= n - 2
        && ventanaDef != null && Math.abs((v.hastaMin - v.desdeMin) - ventanaDef) <= 2
      if (!esCola) setTocado(true)
      setVentana(v)
    },
  })
  /* Mientras nadie tomó el control, el scroll queda clavado al presente. */
  const scrollRef = zg.props.ref
  useEffect(() => {
    if (tocado) return
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  })
  /* Con zoom, la vista que mira la cola también avanza con los minutos nuevos; la que se fue a la historia no se toca. */
  const nPrevRef = useRef(n)
  useEffect(() => {
    const prev = nPrevRef.current
    nPrevRef.current = n
    if (n <= prev || !tocado || ventana == null || ventana.hastaMin < prev - 2) return
    const delta = n - prev
    setVentana({ desdeMin: ventana.desdeMin + delta, hastaMin: ventana.hastaMin + delta })
  }, [n, tocado, ventana])

  /* La parada marcada en minutos del gráfico. Al llegar una marca nueva, la vista se acerca a ella con
     un respiro proporcional (mín. 3 min) para que se vea qué venía antes y después. */
  const marcaMin = marca && Number.isFinite(t0)
    ? { desde: (marca.desdeMs - t0) / 60_000, hasta: (marca.hastaMs - t0) / 60_000 }
    : null
  const marcaClave = marca ? `${marca.desdeMs}-${marca.hastaMs}` : null
  useEffect(() => {
    if (!marcaMin || n < 2) return
    const aire = Math.max(3, (marcaMin.hasta - marcaMin.desde) * 0.8)
    setTocado(true)
    setVentana({
      desdeMin: Math.max(0, marcaMin.desde - aire),
      hastaMin: Math.min(n, Math.max(marcaMin.hasta + aire, marcaMin.desde + aire + 6)),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la parada elegida
  }, [marcaClave])

  const varias = d.maquinas.length > 1
  const filas = [
    ...(varias
      ? [{
          nombre: 'Línea',
          nota: `las ${d.maquinas.length} suman`,
          esperado: d.maquinas.every((m) => m.esperado != null) ? d.maquinas.reduce((a, m) => a + (m.esperado ?? 0), 0) : null,
          cycles: suma,
          principal: true,
          id: null as string | null,
        }]
      : []),
    ...d.maquinas.map((m) => ({ nombre: m.nombre, nota: null as string | null, esperado: m.esperado, cycles: m.cycles, principal: !varias, id: m.id as string | null })),
  ]
  const aRitmo = (f: (typeof filas)[number]) => {
    if (f.esperado == null || n === 0) return null
    let ok = 0
    for (let k = 0; k < n; k++) if (tonoMinuto(f.cycles[k] ?? 0, f.esperado) === 'ok') ok++
    return Math.round((ok / n) * 100)
  }
  const indice = (e: { clientX: number; currentTarget: HTMLDivElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    const ancho = r.width - 2 * PAD_MINUTO
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left - PAD_MINUTO) / Math.max(1, ancho)) * n)))
  }
  const pxBarra = util > 0 ? (util * zg.zoom) / Math.max(1, n) : 0
  const conNumeros = pxBarra >= PX_NUMERO_V2
  const separadas = pxBarra >= 6
  /* Marcas de reloj con el paso más chico que no se pisa (~48 px entre marcas). */
  const paso = PASOS_MARCA.find((p) => p * pxBarra >= 48) ?? 120
  const marcas: number[] = []
  for (let k = 1; k < n; k++) if (Math.round((t0 + k * 60_000) / 60_000) % paso === 0) marcas.push(k)
  const X = (k: number) => ((k + 0.5) / n) * 100
  const pegado = { left: PAD_MINUTO, width: util > 0 ? util : undefined }

  return (
    <div ref={medidorRef} className="mt-4">
      <div {...zg.props} className="v2-minuto-scroll relative overflow-x-auto" style={{ touchAction: 'pan-x pan-y', scrollbarWidth: 'none' }}>
        <div
          className="relative cursor-crosshair select-none"
          style={{ width: `${zg.zoom * 100}%` }}
          onPointerMove={(e) => { if (e.pointerType === 'mouse') setI(indice(e)) }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setI(null) }}
          onClick={(e) => { e.stopPropagation(); const k = indice(e); setI((a) => (a === k ? null : k)) }}
        >
          {filas.map((f) => {
            const tope = Math.max(1, (f.esperado ?? 0) * 1.15, ...f.cycles.slice(0, n))
            const pct = aRitmo(f)
            const yEsperado = f.esperado != null ? (f.esperado / tope) * 100 : null
            /* La parada marcada vive DENTRO de las barras de su máquina (y de la línea, que la suma):
               sus minutos quedan plenos sobre un fondo tenue y el resto se apaga. Las otras máquinas
               se apagan enteras: se ve de un vistazo cuál Baader fue. */
            const conMarca = marcaMin != null && marcaMin.hasta > 0 && marcaMin.desde < n
            const filaMarcada = conMarca && (f.principal || !marca?.maquinaId || f.id === marca.maquinaId)
            const k0 = conMarca ? Math.max(0, Math.floor(marcaMin!.desde)) : -1
            const k1 = conMarca ? Math.min(n - 1, Math.max(k0, Math.ceil(marcaMin!.hasta) - 1)) : -1
            return (
              /* Fondo y contenido en la misma celda de grilla: el fondo de la línea queda pegado
                 al borde visible (sticky) y no se va con el desplazamiento. */
              <div key={f.nombre} className="mb-3 grid">
                {f.principal && (
                  <div className="v2-subtarjeta pointer-events-none sticky left-0 col-start-1 row-start-1 rounded-card" style={{ width: anchoPx || undefined }} />
                )}
                <div className={`relative col-start-1 row-start-1 ${f.principal ? 'py-3 lg:py-4' : ''}`} style={{ paddingInline: PAD_MINUTO }}>
                  <div className="sticky z-10 mb-2 flex items-end justify-between gap-3" style={pegado}>
                    <div className="min-w-0">
                      <div className={f.principal ? 'text-[15px] font-semibold text-foreground' : 'text-[14px] font-medium text-foreground'}>
                        {f.nombre}
                        {f.nota && <span className="font-normal text-muted-foreground"> · {f.nota}</span>}
                      </div>
                      <div className="text-[13px] tabular-nums text-muted-foreground">
                        {i != null
                          ? <><b className="font-semibold text-foreground">{int(f.cycles[i] ?? 0)} pz</b>{f.esperado != null ? ` de ${dec(f.esperado, 0)} esperadas` : ''} a las {relojDe(t0 + i * 60_000)}</>
                          : f.esperado != null ? `esperado ${dec(f.esperado, 0)} pz/min` : 'pz por minuto'}
                      </div>
                    </div>
                    {pct != null && (
                      <div className="shrink-0 text-right">
                        <span className={`${f.principal ? 'text-[28px] lg:text-[34px]' : 'text-[20px]'} font-semibold leading-none tabular-nums tracking-tight`}>{pct}</span>
                        <span className="text-[13px] text-muted-foreground"> % a ritmo</span>
                      </div>
                    )}
                  </div>
                  <div className={`relative flex items-end ${f.principal ? 'h-28 lg:h-36' : 'h-10 lg:h-12'}`} style={{ gap: separadas ? 2 : 0 }}>
                    {filaMarcada && (
                      <span
                        className="v2-marca-parada pointer-events-none absolute inset-y-0 rounded-t-[6px]"
                        style={{ left: `${(k0 / n) * 100}%`, width: `${((k1 - k0 + 1) / n) * 100}%` }}
                      />
                    )}
                    {yEsperado != null && (
                      <span className="pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ bottom: `${yEsperado}%`, borderColor: 'var(--v2-tenue)' }} />
                    )}
                    {f.cycles.slice(0, n).map((v, k) => {
                      const t = tonoMinuto(v, f.esperado)
                      return (
                        <span
                          key={k}
                          className="relative min-w-0 flex-1 transition-opacity duration-150"
                          style={{
                            height: `${Math.max(v > 0 ? 6 : 2, (v / tope) * 100)}%`,
                            background: RELLENO_MINUTO(t),
                            borderRadius: separadas ? '3px 3px 0 0' : 0,
                            opacity: i != null ? (i === k ? 1 : 0.35)
                              : conMarca ? (filaMarcada && k >= k0 && k <= k1 ? 1 : filaMarcada ? 0.4 : 0.22)
                              : 1,
                          }}
                        >
                          {conNumeros && v > 0 && (
                            <b className={`pointer-events-none absolute inset-x-0 bottom-0.5 text-center font-semibold tabular-nums text-foreground/90 ${f.principal ? 'text-[12px]' : 'text-[11px]'}`}>
                              {v}
                            </b>
                          )}
                        </span>
                      )
                    })}
                    {i != null && (
                      <span className="pointer-events-none absolute -inset-y-1 w-px" style={{ left: `${X(i)}%`, background: 'var(--v2-secundaria)' }} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div className="relative h-5 text-[12px] tabular-nums text-muted-foreground" style={{ marginInline: PAD_MINUTO }}>
            {marcas.map((k) => (
              <span key={k} className="absolute -translate-x-1/2" style={{ left: `${X(k)}%` }}>
                {relojDe(t0 + k * 60_000)}
              </span>
            ))}
          </div>
        </div>
      </div>
      {marca && (
        <div className="v2-subtarjeta mt-3 flex items-center justify-between gap-3 rounded-card px-3 py-2 text-[13px]">
          <span className="min-w-0">
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: 'var(--v2-mal)' }} />
            <b className="font-semibold text-foreground">{marca.causa ?? 'Parada'}</b>
            <span className="tabular-nums text-muted-foreground">
              {' '}· {relojDe(marca.desdeMs)}–{relojDe(marca.hastaMs)} · {dec((marca.hastaMs - marca.desdeMs) / 60_000, 1)} min
            </span>
          </span>
          {onQuitarMarca && (
            <button type="button" onClick={onQuitarMarca} className="tap-44 shrink-0 rounded-full px-3 py-1 font-medium text-foreground" style={{ background: 'rgb(142 142 147 / 0.14)' }}>
              Quitar
            </button>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        {(['ok', 'warn', 'crit'] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_MINUTO[t] }} />
            {t === 'ok' ? 'a ritmo (75 % o más del esperado)' : t === 'warn' ? '50 a 75 %' : 'menos de 50 %'}
          </span>
        ))}
        <span className="ml-auto">{cerrado ? 'turno cerrado' : `hasta las ${relojDe(t0 + (n - 1) * 60_000)}`}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span>{zg.acercado ? 'arrastra para recorrer el turno' : 'pellizca o usa ctrl + rueda para acercar'}</span>
        {zg.acercado && (
          <button
            type="button"
            onClick={() => { setTocado(true); zg.verTodo() }}
            className="tap-44 shrink-0 rounded-full px-3 py-1.5 font-medium text-foreground"
            style={{ background: 'rgb(142 142 147 / 0.14)' }}
          >
            Ver todo el turno
          </button>
        )}
        {!zg.acercado && ventanaDef != null && ventanaDef < n && (
          <button
            type="button"
            onClick={() => setTocado(false)}
            className="tap-44 shrink-0 rounded-full px-3 py-1.5 font-medium text-foreground"
            style={{ background: 'rgb(142 142 147 / 0.14)' }}
          >
            Últimos minutos
          </button>
        )}
      </div>
    </div>
  )
}

/** «17,0 pz/min · prom. 13,2»: el ahora del contador y el promedio del turno, la misma vara del clásico. */
function velMaquina(m: { ahora: number | null; promedio: number | null }): string {
  if (m.ahora != null) return `${dec(m.ahora)} pz/min${m.promedio != null ? ` · prom. ${dec(m.promedio)}` : ''}`
  return m.promedio != null ? `${dec(m.promedio)} pz/min promedio` : '—'
}

// ── Gráficos ─────────────────────────────────────────────────────────────────

/** Curva suave (Catmull-Rom → Bézier): la línea del reel, no un serrucho. */
function suave(ps: Array<[number, number]>): string {
  if (ps.length < 2) return ''
  let d = `M${ps[0]![0].toFixed(2)},${ps[0]![1].toFixed(2)}` // decimal-tecnico: coordenadas SVG
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[Math.max(0, i - 1)]!, p1 = ps[i]!, p2 = ps[i + 1]!, p3 = ps[Math.min(ps.length - 1, i + 2)]!
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]!.toFixed(2)},${c1[1]!.toFixed(2)} ${c2[0]!.toFixed(2)},${c2[1]!.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}` // decimal-tecnico: coordenadas SVG
  }
  return d
}

/** Una curva acumulada cada `paso` minutos: menos puntos, curva limpia. */
function ralear(ps: PacePoint[], paso = 15): PacePoint[] {
  if (ps.length <= 2) return ps
  const out: PacePoint[] = [ps[0]!]
  let sig = ps[0]!.minutes + paso
  for (const p of ps) if (p.minutes >= sig) { out.push(p); sig = p.minutes + paso }
  const ult = ps[ps.length - 1]!
  if (out[out.length - 1] !== ult) out.push(ult)
  return out
}

/** Piezas de una curva acumulada en el minuto `m` (interpolado); null fuera de rango. */
function valorEn(ps: PacePoint[] | null | undefined, m: number): number | null {
  if (!ps?.length) return null
  if (m < ps[0]!.minutes) return 0
  if (m > ps[ps.length - 1]!.minutes) return null
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i]!, b = ps[i + 1]!
    if (m >= a.minutes && m <= b.minutes) return b.minutes === a.minutes ? b.pieces : a.pieces + ((m - a.minutes) / (b.minutes - a.minutes)) * (b.pieces - a.pieces)
  }
  return ps[ps.length - 1]!.pieces
}

type CurvaDatos = { hoy: PacePoint[]; previo: { label: string; curve: PacePoint[] } | null; objetivo: PacePoint[] | null; maxMin: number }

/**
 * La curva se dibuja en un sistema 0-100 × 0-100 estirado al alto de la
 * pantalla (`preserveAspectRatio="none"` + trazo que no escala): en celular
 * 190 px, en PC 300 px. Antes el alto salía del ancho y en PC la curva medía
 * 400 px mientras en el celular quedaba en 110. Los puntos van en HTML para
 * que no se estiren en óvalo.
 */
function Curva({ curva, inicioMs, alto, conDiferencia, proyeccion }: {
  curva: CurvaDatos
  inicioMs: number | null
  /** Alto fijo en px (la capa ampliada); sin él, 190 en celular y 300 en PC. */
  alto?: number
  /** El globo suma «± N pz vs meta»: la diferencia contra el ritmo de la meta a esa hora. */
  conDiferencia?: boolean
  /** Hasta dónde llega el turno al cierre a este ritmo (la cifra de «Al cierre»), punteada. */
  proyeccion?: { min: number; piezas: number } | null
}) {
  const [m, setM] = useState<number | null>(null)
  const techo = Math.max(1, ...curva.hoy.map((p) => p.pieces), ...(curva.previo?.curve.map((p) => p.pieces) ?? []), ...(curva.objetivo?.map((p) => p.pieces) ?? []), proyeccion?.piezas ?? 0)
  const max = techo * 1.06
  const X = (min: number) => (min / Math.max(1, curva.maxMin)) * 100
  const Y = (v: number) => 100 - (v / max) * 100
  const pts = (ps: PacePoint[]) => ralear(ps).map((p) => [X(p.minutes), Y(p.pieces)] as [number, number])
  const hoy = pts(curva.hoy)
  const ult = curva.hoy[curva.hoy.length - 1]
  const marcas = Array.from({ length: Math.floor(curva.maxMin / 120) + 1 }, (_, i) => i * 120)
  const mover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setM(Math.max(0, Math.min(curva.maxMin, ((e.clientX - r.left) / r.width) * curva.maxMin)))
  }
  const vHoy = m != null ? valorEn(curva.hoy, m) : null
  const vPrev = m != null && curva.previo ? valorEn(curva.previo.curve, m) : null
  const vObj = m != null ? valorEn(curva.objetivo, m) : null
  const punto = (v: number | null, color: string, r = 4) => v != null && m != null && (
    <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[rgb(var(--card))]" style={{ left: `${X(m)}%`, top: `${Y(v)}%`, width: r * 2, height: r * 2, background: color }} />
  )

  return (
    <div className="mt-4">
      <div
        className={`relative touch-pan-y select-none ${alto ? '' : 'h-[190px] lg:h-[300px]'}`}
        style={alto ? { height: alto } : undefined}
        onPointerMove={mover}
        onPointerDown={(e) => { e.stopPropagation(); mover(e) }}
        onClick={(e) => e.stopPropagation()}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setM(null) }}
        role="img"
        aria-label="Piezas acumuladas del turno comparadas con el turno anterior"
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="v2-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--v2-acento)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--v2-acento)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={0} x2={100} y1={Y(techo * f)} y2={Y(techo * f)} stroke="var(--v2-reja)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {curva.objetivo && <path d={suave(pts(curva.objetivo))} fill="none" stroke="var(--v2-tenue)" strokeWidth={1.5} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />}
          {curva.previo && <path d={suave(pts(curva.previo.curve))} fill="none" stroke="var(--v2-secundaria)" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          {proyeccion && ult && (
            <path d={`M${X(ult.minutes).toFixed(2)},${Y(ult.pieces).toFixed(2)} L${X(proyeccion.min).toFixed(2)},${Y(proyeccion.piezas).toFixed(2)}`} fill="none" stroke="var(--v2-acento)" strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" opacity={0.8} vectorEffect="non-scaling-stroke" /> /* decimal-tecnico: coordenadas SVG */
          )}
          {hoy.length > 1 && (
            <>
              <path d={`${suave(hoy)} L${hoy[hoy.length - 1]![0].toFixed(2)},100 L0,100 Z`} fill="url(#v2-area)" /> {/* decimal-tecnico: coordenadas SVG */}
              <path d={suave(hoy)} fill="none" stroke="var(--v2-acento)" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {ult && m == null && (
          <>
            <span className="pointer-events-none absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20" style={{ left: `${X(ult.minutes)}%`, top: `${Y(ult.pieces)}%`, background: 'var(--v2-acento)' }} />
            <span className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${X(ult.minutes)}%`, top: `${Y(ult.pieces)}%`, background: 'var(--v2-acento)' }} />
          </>
        )}
        {m != null && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px" style={{ left: `${X(m)}%`, background: 'var(--v2-tenue)' }} />
            {punto(vObj, 'var(--v2-tenue)', 3)}
            {punto(vPrev, 'var(--v2-secundaria)')}
            {punto(vHoy, 'var(--v2-acento)', 5)}
            <Globo x={X(m)}>
              <div className="font-medium tabular-nums text-foreground">
                {inicioMs != null ? relojDe(inicioMs + m * 60_000) : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`}
              </div>
              {vHoy != null && <div className="tabular-nums"><span style={{ color: 'var(--v2-acento)' }}>●</span> Hoy {int(vHoy)} pz</div>}
              {vPrev != null && <div className="tabular-nums text-muted-foreground">● {curva.previo!.label} {int(vPrev)} pz{vHoy != null ? ` (${firmado(vHoy - vPrev)})` : ''}</div>}
              {vObj != null && <div className="tabular-nums text-muted-foreground">┄ Meta {int(vObj)} pz</div>}
              {conDiferencia && vHoy != null && vObj != null && (
                <div className="font-medium tabular-nums" style={{ color: vHoy - vObj < 0 ? 'var(--v2-mal-texto)' : 'var(--v2-bien)' }}>{firmado(vHoy - vObj)} pz vs meta</div>
              )}
            </Globo>
          </>
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-muted-foreground">
        {marcas.map((mm) => (
          <span key={mm} className={`absolute ${mm === 0 ? '' : '-translate-x-1/2'}`} style={{ left: `${X(mm)}%` }}>
            {inicioMs != null ? relojDe(inicioMs + mm * 60_000) : `${mm / 60} h`}
          </span>
        ))}
      </div>
      <Leyenda items={[
        { color: 'var(--v2-acento)', label: 'Hoy', trazo: 'linea' },
        ...(curva.previo ? [{ color: 'var(--v2-secundaria)', label: curva.previo.label, trazo: 'linea' as const }] : []),
        ...(curva.objetivo ? [{ color: 'var(--v2-tenue)', label: 'Ritmo de la meta', trazo: 'punteada' as const }] : []),
        ...(proyeccion ? [{ color: 'var(--v2-acento)', label: 'Al cierre, a este ritmo', trazo: 'punteada' as const }] : []),
      ]} />
    </div>
  )
}

type Riel = Array<{ label: string; mttr: number | null; hoy?: boolean }>

/** Mini barras del MTTR turno a turno: la racha de Mantención en una mirada. */
function RielMttr({ riel }: { riel: Riel }) {
  const { activo, en, salir } = useActivo()
  const max = Math.max(1, ...riel.map((r) => r.mttr ?? 0))
  const a = activo != null ? riel[activo] : null
  return (
    <div className="relative mt-5" {...salir}>
      {a && activo != null && (
        <Globo x={((activo + 0.5) / riel.length) * 100}>
          <div className="font-medium text-foreground">{a.hoy ? 'Hoy' : a.label}</div>
          <div className="tabular-nums text-muted-foreground">{a.mttr != null ? `${dec(a.mttr)} min por falla` : 'Sin fallas técnicas'}</div>
        </Globo>
      )}
      <div className="flex h-16 items-end gap-1.5 lg:h-20" aria-label="Minutos por falla en los últimos turnos">
        {riel.map((r, i) => (
          <div key={`${r.label}-${i}`} className="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end" {...en(i)}>
            <div
              className="w-full rounded-ctl transition-opacity"
              style={{
                height: r.mttr != null ? `${Math.max(10, (r.mttr / max) * 100)}%` : '5%',
                background: r.hoy ? 'var(--v2-mant)' : 'var(--v2-secundaria)',
                opacity: activo != null && activo !== i ? 0.45 : r.mttr != null ? 1 : 0.4,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {riel.map((r, i) => <span key={`${r.label}-l${i}`} className={`min-w-0 flex-1 truncate text-center text-[11px] ${r.hoy ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{r.hoy ? 'Hoy' : r.label}</span>)}
      </div>
    </div>
  )
}

function BarrasSemana({ semanas }: { semanas: SemanaReparto[] }) {
  const { activo, en, salir } = useActivo()
  const tot = (s: SemanaReparto) => DUENOS.reduce((a, d) => a + s.min[d], 0)
  const max = Math.max(1, ...semanas.map(tot))
  const a = activo != null ? semanas[activo] : null
  return (
    <div className="relative mt-5" {...salir}>
      {a && activo != null && (
        <Globo x={((activo + 0.5) / semanas.length) * 100}>
          <div className="font-medium text-foreground">Semana del {semanaCorta(a.semana)} · {a.turnos} turnos</div>
          {DUENOS.map((d) => a.min[d] > 0 && (
            <div key={d} className="tabular-nums text-muted-foreground"><span style={{ color: RELLENO[d] }}>●</span> {DUENO_UI[d].corto} {horas(a.min[d])}</div>
          ))}
        </Globo>
      )}
      <div className="flex h-40 items-end gap-2 lg:h-56 lg:gap-3">
        {semanas.map((s, i) => (
          <div key={s.semana} className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end gap-[3px] transition-opacity" style={{ opacity: activo != null && activo !== i ? 0.45 : 1 }} {...en(i)}>
            {DUENOS.slice().reverse().map((d) => s.min[d] > 0 && (
              <div key={d} className="w-full rounded-ctl" style={{ height: `${(s.min[d] / max) * 100}%`, background: RELLENO[d], minHeight: 3 }} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 lg:gap-3">
        {semanas.map((s) => <span key={s.semana} className="min-w-0 flex-1 truncate text-center text-[11px] tabular-nums text-muted-foreground">{semanaCorta(s.semana)}</span>)}
      </div>
      <Leyenda items={DUENOS.map((d) => ({ color: RELLENO[d], label: DUENO_UI[d].corto }))} />
    </div>
  )
}

function BarrasHora({ filas, metaPorHora }: { filas: HourlyRow[]; metaPorHora: number | null }) {
  const { activo, en, salir } = useActivo()
  const max = Math.max(1, metaPorHora ?? 0, ...filas.map((h) => h.piecesPerHour)) * 1.08
  const mejor = filas.filter((h) => !h.partial).reduce<HourlyRow | null>((a, h) => (!a || h.pieces > a.pieces ? h : a), null)
  const a = activo != null ? filas[activo] : null
  return (
    <div className="relative mt-6" {...salir}>
      {a && activo != null && (
        <Globo x={((activo + 0.5) / filas.length) * 100}>
          <div className="font-medium tabular-nums text-foreground">{hhmm(a.from)}–{hhmm(a.to)}{a.partial ? ' · en curso' : ''}</div>
          <div className="tabular-nums text-muted-foreground">{int(a.pieces)} pz · {int(a.piecesPerHour)} pz/h</div>
          {metaPorHora != null && <div className="tabular-nums text-muted-foreground">{firmado(a.piecesPerHour - metaPorHora)} pz/h vs meta</div>}
        </Globo>
      )}
      <div className="relative flex h-44 items-end gap-1.5 lg:h-64 lg:gap-3">
        {metaPorHora != null && (
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed" style={{ bottom: `${(metaPorHora / max) * 100}%`, borderColor: 'var(--v2-tenue)' }}>
            <span className="absolute -top-5 right-0 text-[11px] tabular-nums text-muted-foreground">meta {int(metaPorHora)} pz/h</span>
          </div>
        )}
        {filas.map((h, i) => (
          <div key={h.hourStart} className="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1" {...en(i)}>
            <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">{int(h.pieces)}</span>
            <div
              className="w-full rounded-ctl transition-opacity"
              style={{
                height: `${Math.max(2, (h.piecesPerHour / max) * 100)}%`,
                background: h === mejor ? 'var(--v2-acento)' : 'var(--v2-secundaria)',
                opacity: activo != null && activo !== i ? 0.4 : h.partial ? 0.45 : 1,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 lg:gap-3">
        {filas.map((h, i) => (
          <span key={h.hourStart} className={`min-w-0 flex-1 truncate text-center text-[11px] tabular-nums text-muted-foreground ${filas.length > 8 && i % 2 ? 'invisible sm:visible' : ''}`}>{hhmm(h.from)}</span>
        ))}
      </div>
      <Leyenda items={[
        { color: 'var(--v2-acento)', label: 'Mejor hora' },
        { color: 'var(--v2-secundaria)', label: 'Resto' },
        ...(metaPorHora != null ? [{ color: 'var(--v2-tenue)', label: 'Ritmo de la meta', trazo: 'punteada' as const }] : []),
      ]} />
    </div>
  )
}

/**
 * El turno hora a hora: barras de la línea contra la meta por hora (las del Análisis) y, debajo, la tabla con las
 * piezas de la línea y de CADA Baader en esas mismas horas, marcando la mejor y la peor hora completa.
 * Línea y Baader salen de la misma serie de 5 min del turno, así que en cada hora las Baader suman la línea.
 */
function HoraAHora({ filas, metaPorHora, porMaquina, total }: { filas: HourlyRow[]; metaPorHora: number | null; porMaquina: Array<{ nombre: string; piezas: number[] }>; total: number }) {
  const sumaHoras = filas.reduce((a, h) => a + h.pieces, 0)
  const completas = filas.filter((h) => !h.partial)
  const mejor = completas.reduce<HourlyRow | null>((a, h) => (!a || h.pieces > a.pieces ? h : a), null)
  const peor = completas.reduce<HourlyRow | null>((a, h) => (!a || h.pieces < a.pieces ? h : a), null)
  const cols = `minmax(96px,1.3fr) repeat(${1 + porMaquina.length}, minmax(0,1fr))`
  return (
    <div>
      <h4 className="text-[15px] font-semibold leading-tight text-foreground">Hora a hora</h4>
      <p className="text-[13px] text-muted-foreground">piezas de cada hora desde el arranque{metaPorHora != null ? ` · punteada: meta de ${int(metaPorHora)} pz por hora` : ''}</p>
      <BarrasHora filas={filas} metaPorHora={metaPorHora} />
      <div className="mt-4 overflow-x-auto">
        <div role="table" aria-label="Piezas por hora de la línea y de cada máquina" className="min-w-[420px] text-[13px] tabular-nums">
          <div role="row" className="grid gap-x-3 border-b border-border/60 pb-1.5 font-medium text-muted-foreground" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader">Hora</span>
            <span role="columnheader" className="text-right">Línea</span>
            {porMaquina.map((m) => <span key={m.nombre} role="columnheader" className="truncate text-right">{etiquetaMaquina(m.nombre)}</span>)}
          </div>
          {filas.map((h, i) => {
            const marca = h.partial ? 'en curso' : h === mejor && mejor !== peor ? 'mejor' : h === peor && mejor !== peor ? 'peor' : null
            return (
              <div key={h.hourStart} role="row" className="grid items-baseline gap-x-3 border-b border-border/30 py-1.5 last:border-0" style={{ gridTemplateColumns: cols }}>
                <span role="cell" className="text-foreground">
                  {hhmm(h.from)}–{hhmm(h.to)}
                  {marca && <b className="ml-1.5 text-[12px] font-semibold" style={{ color: marca === 'mejor' ? 'var(--v2-bien)' : marca === 'peor' ? 'var(--v2-mal-texto)' : undefined }}>{marca}</b>}
                </span>
                <span role="cell" className="text-right font-semibold text-foreground">{int(h.pieces)}</span>
                {porMaquina.map((m) => <span key={m.nombre} role="cell" className="text-right text-muted-foreground">{m.piezas[i] != null ? int(m.piezas[i]!) : '—'}</span>)}
              </div>
            )
          })}
        </div>
      </div>
      {sumaHoras !== total && (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Las horas suman {int(sumaHoras)} pz: llegan hasta el último tramo de 5 min que Shoplogix sincronizó. «Piezas ahora» ({int(total)}) es el contador vivo y suma además {int(Math.abs(total - sumaHoras))} pz del tramo en curso{total < sumaHoras ? ' (ajuste del contador)' : ''}.
        </p>
      )}
    </div>
  )
}

// ── El turno ─────────────────────────────────────────────────────────────────

export interface MonitorV2Props {
  piezas: number
  corteHora: string | null
  /** El turno hora a hora (las mismas filas del Análisis) con la meta por hora y las piezas de cada Baader en esas mismas horas. */
  horas?: { filas: HourlyRow[]; metaPorHora: number | null; porMaquina: Array<{ nombre: string; piezas: number[] }> } | null
  /** Lo que tocaba a esta hora según la cuota (la MISMA cifra que «Camino a la meta»): la vara de la curva ampliada. */
  cuota?: { piezas: number; hora: string | null } | null
  meta: number | null
  proyeccion: number | null
  /** Promedio del turno andando: piezas ÷ minutos produciendo (el «promedio turno» del clásico). */
  ritmo: number | null
  /** El «Ahora» del contador de Shoplogix (pulso); null con el turno cerrado o sin pulso. */
  ritmoAhora: number | null
  ritmoNecesario: number | null
  setPoint: number | null
  vsAyer: { label: string; pieces: number; diff: number } | null
  mant: { fallas: number; fallaMin: number; mttr: number | null; mttrPrevio: number | null; dispPct: number | null } | null
  /** Fallas técnicas del turno, en orden. */
  eventos: Array<{ maquina: string; desde: string; hasta: string; min: number; causa: string | null; causas: string[] }>
  /** MTTR de los turnos previos (más antiguo primero) + el de hoy al final. */
  rielMttr: Riel
  perdidas: Array<{ dueno: DuenoPerdida; min: number }>
  /** Las mismas paradas en minutos de MÁQUINA (los que muestra «Camino a la meta»), y cuántas máquinas tiene la línea. */
  perdidasMaquina?: { min: number; maquinas: number } | null
  causas: Array<{ causa: string; min: number; dueno: DuenoPerdida; veces: number }>
  programadas: Array<{ causa: string; min: number }>
  maquinas: Array<{ name: string; status: MonitorStatus; desdeMin: number | null; ahora: number | null; promedio: number | null; razon: string | null; piezas: number; dispPct: number | null }>
  curva: CurvaDatos | null
  /** Hora de planta de la primera pieza (ms wall-clock): el eje y el globo hablan en hora de reloj. */
  inicioMs: number | null
  cierre: { hora: string | null; quedaMin: number | null; faltan: number | null; colacionMin: number | null; extraCpm: number | null; extraFactible: boolean | null } | null
  ritmoInfo: { recienteCpm: number | null; recienteMin: number | null; medianaCpm: number | null; mejorCpm: number | null; muestras: number | null; setPointFecha: string | null; setPointMetodo: string | null }
  mantPorMaquina: Array<{ name: string; disp: number | null; fallas: number; fallaMin: number; mttr: number | null; microN: number; microMin: number }>
  cerrado: boolean
  /** Lo que se ve al tocar «Ver más del turno». */
  mas: MasDelTurno
  /** «Ritmo de la línea» del clásico (ahora, media 15 min, promedio, meta, techo y cada máquina). Si viene,
      reemplaza al KPI Ritmo y a la tarjeta Máquinas: cada cifra se muestra una sola vez. */
  ritmoLinea?: ReactNode
  /** «Ritmo en vivo · 15 min»: va justo debajo de «Ritmo de la línea». Ausente con el turno cerrado o sin serie del pulso. */
  ritmoVivo?: ReactNode
  /** Banda de estado de PC (la parada en curso con su cronómetro): primera fila de la grilla, pegada bajo la cabecera. */
  banda?: ReactNode
  /** «Camino a la meta» del monitor clásico (hechas, paradas por causa, ritmo, por jugar): se ve tal cual. */
  caminoMeta?: ReactNode
  vista: VistaV2
  onVista: (v: VistaV2) => void
}

type ClaveTurno = 'cierre' | 'ritmo' | 'mant' | 'maquinas' | 'perdido'

export function MonitorV2(p: MonitorV2Props) {
  const raizRef = useRef<HTMLDivElement>(null)
  useEntradaEscalonada(raizRef)
  /* Las cifras grandes cuentan solo cuando el dato cambia de verdad (nunca al montar). */
  const piezasMostradas = useCuentaCifra(p.piezas)
  const cierreMostrado = useCuentaCifra(p.proyeccion ?? 0)
  const ritmoGrande = p.ritmoAhora ?? p.ritmo
  const [abierta, setAbierta] = useState<ClaveTurno | null>(null)
  const abrir = (k: ClaveTurno) => () => setAbierta(k)
  const pct = p.meta ? Math.round((p.piezas / p.meta) * 100) : null
  const cierreVsMeta = p.proyeccion != null && p.meta ? p.proyeccion - p.meta : null
  const deltaMttr = p.mant?.mttr != null && p.mant.mttrPrevio != null ? p.mant.mttr - p.mant.mttrPrevio : null
  const totalPerdida = p.perdidas.reduce((a, x) => a + x.min, 0)
  const corriendo = p.maquinas.filter((m) => m.status === 'produciendo').length
  const maxCausa = Math.max(1, ...p.causas.map((c) => c.min))
  const conProyeccion = !p.cerrado && p.proyeccion != null
  const fallasMin = p.eventos.reduce((a, e) => a + e.min, 0)
  const finCurva = p.curva?.hoy[p.curva.hoy.length - 1]?.minutes ?? 0

  const detalleDe = (clave: ClaveTurno | null): { titulo: string; sub?: string; cuerpo: ReactNode } | null => {
    switch (clave) {
      case 'cierre': return {
        titulo: 'Al cierre', sub: p.cierre?.hora ? `Proyección hasta las ${p.cierre.hora}` : undefined,
        cuerpo: (
          <Grupo nota="Piezas de ahora + el ritmo andando × los minutos productivos que quedan (sin la colación pendiente).">
            {p.proyeccion != null && <ListCell title="Proyección" value={`${int(p.proyeccion)} pz`} valueSub={cierreVsMeta != null ? `${firmado(cierreVsMeta)} vs meta` : undefined} />}
            {p.cierre?.faltan != null && <ListCell title="Faltan para la meta" value={`${int(p.cierre.faltan)} pz`} />}
            {p.cierre?.quedaMin != null && <ListCell title="Tiempo que queda" value={horas(p.cierre.quedaMin)} />}
            {p.cierre?.colacionMin != null && p.cierre.colacionMin > 0 && <ListCell title="Colación pendiente" value={horas(p.cierre.colacionMin)} />}
            {p.ritmoNecesario != null && <ListCell title="Ritmo necesario" value={`${dec(p.ritmoNecesario)} pz/min`} />}
            {p.cierre?.extraCpm != null && <ListCell title="Con una hora extra" value={`${dec(p.cierre.extraCpm)} pz/min`} valueSub={p.cierre.extraFactible ? 'alcanzable' : 'fuera de alcance'} />}
          </Grupo>
        ),
      }
      case 'ritmo': return {
        titulo: 'Ritmo de la línea', sub: 'Piezas por minuto mientras la línea anda',
        cuerpo: (
          <Grupo nota="«Andando» descuenta los minutos detenidos: es la velocidad real cuando la línea produce.">
            {p.ritmoAhora != null && <ListCell title="Ahora" value={`${dec(p.ritmoAhora)} pz/min`} valueSub="contador de Shoplogix" />}
            <ListCell title="Promedio del turno (andando)" value={p.ritmo != null ? `${dec(p.ritmo)} pz/min` : '—'} />
            {p.ritmoInfo.recienteCpm != null && <ListCell title={`Últimos ${Math.round(p.ritmoInfo.recienteMin ?? 0)} min`} value={`${dec(p.ritmoInfo.recienteCpm)} pz/min`} />}
            {p.ritmoNecesario != null && <ListCell title="Necesario para la meta" value={`${dec(p.ritmoNecesario)} pz/min`} />}
            {p.ritmoInfo.medianaCpm != null && <ListCell title="Lo normal de esta línea" value={`${dec(p.ritmoInfo.medianaCpm)} pz/min`} valueSub={p.ritmoInfo.muestras ? `mediana de ${p.ritmoInfo.muestras} turnos` : undefined} />}
            {p.ritmoInfo.mejorCpm != null && <ListCell title="Mejor turno" value={`${dec(p.ritmoInfo.mejorCpm)} pz/min`} />}
            {p.setPoint != null && <ListCell title="Set point" value={`${dec(p.setPoint, 0)} pz/min`} valueSub={[p.ritmoInfo.setPointMetodo, p.ritmoInfo.setPointFecha].filter(Boolean).join(' · ') || undefined} />}
          </Grupo>
        ),
      }
      case 'mant': return {
        titulo: 'Respuesta de Mantención', sub: p.mant?.fallas ? `${p.mant.fallas} ${p.mant.fallas === 1 ? 'falla técnica' : 'fallas técnicas'} · ${horas(p.mant.fallaMin)}` : 'Sin fallas técnicas en el turno',
        cuerpo: (
          <>
            <Grupo nota="Minutos por falla = minutos de falla técnica ÷ número de fallas (MTTR). Turnos previos: promedio de los últimos con fallas.">
              <ListCell title="Hoy" value={p.mant?.mttr != null ? `${dec(p.mant.mttr)} min por falla` : '—'} />
              {p.mant?.mttrPrevio != null && <ListCell title="Turnos previos" value={`${dec(p.mant.mttrPrevio)} min por falla`} valueSub={deltaMttr != null ? `${firmado(deltaMttr, (n) => dec(n))} min hoy` : undefined} />}
              {p.mant?.dispPct != null && <ListCell title="Disponibilidad técnica" value={`${dec(p.mant.dispPct)} %`} />}
            </Grupo>
            {p.mantPorMaquina.length > 0 && (
              <Grupo titulo="Por máquina">
                {p.mantPorMaquina.map((m) => (
                  <ListCell
                    key={m.name}
                    title={m.name}
                    subtitle={`${m.fallas} ${m.fallas === 1 ? 'falla' : 'fallas'} · ${horas(m.fallaMin)}${m.microN ? ` · ${m.microN} micro (${horas(m.microMin)})` : ''}`}
                    value={m.disp != null ? `${dec(m.disp)} %` : '—'}
                    valueSub={m.mttr != null ? `MTTR ${dec(m.mttr)} min` : undefined}
                  />
                ))}
              </Grupo>
            )}
            {p.eventos.length > 0 && (
              <Grupo titulo="Fallas del turno">
                {p.eventos.slice().reverse().map((e, i) => (
                  <ListCell key={`${e.desde}-${i}`} title={e.causas.join(' · ') || 'Falla técnica'} subtitle={`${e.maquina} · ${hhmm(e.desde)}–${hhmm(e.hasta)}`} value={horas(e.min)} />
                ))}
              </Grupo>
            )}
          </>
        ),
      }
      case 'maquinas': return {
        titulo: 'Máquinas', sub: `${corriendo} de ${p.maquinas.length} corriendo`,
        cuerpo: (
          <Grupo>
            {p.maquinas.map((m) => (
              <ListCell
                key={m.name}
                title={m.name}
                subtitle={m.status === 'detenida' ? `${m.razon ?? 'Detenida'}${m.desdeMin != null ? ` · hace ${Math.round(m.desdeMin)} min` : ''}` : m.status === 'produciendo' ? 'Corriendo' : 'Sin datos'}
                value={m.ahora != null ? `${dec(m.ahora)} pz/min` : m.promedio != null ? `${dec(m.promedio)} pz/min` : '—'}
                valueSub={`${m.ahora != null && m.promedio != null ? `promedio ${dec(m.promedio)} · ` : ''}${int(m.piezas)} pz${m.dispPct != null ? ` · ${dec(m.dispPct, 0)} % arriba` : ''}`}
              />
            ))}
          </Grupo>
        ),
      }
      case 'perdido': return {
        titulo: 'Tiempo perdido', sub: `${horas(totalPerdida)} de línea recuperables`,
        cuerpo: (
          <>
            <Grupo titulo="Por dueño" nota="Minutos equivalentes de línea: una máquina parada de tres cuenta un tercio.">
              {p.perdidas.map((x) => <ListCell key={x.dueno} leading={<Punto color={RELLENO[x.dueno]} />} title={DUENO_UI[x.dueno].corto} value={horas(x.min)} />)}
            </Grupo>
            <Grupo titulo="Todas las causas">
              {p.causas.map((c) => <ListCell key={c.causa} leading={<Punto color={RELLENO[c.dueno]} />} title={c.causa} subtitle={`${c.veces} ${c.veces === 1 ? 'vez' : 'veces'}`} value={horas(c.min)} />)}
            </Grupo>
            {p.programadas.length > 0 && (
              <Grupo titulo="Programado (no cuenta como pérdida)">
                {p.programadas.map((c) => <ListCell key={c.causa} title={c.causa} value={horas(c.min)} />)}
              </Grupo>
            )}
          </>
        ),
      }
      default: return null
    }
  }
  const detalle = detalleDe(abierta)

  /* Piezas ahora, ampliado: la curva acumulada real del turno contra el mismo turno de otros días y el ritmo de la meta,
     con cursor; debajo el turno HORA A HORA (línea y cada Baader) y la lista de siempre (meta, faltan, contra ayer). */
  const ampliadoPiezas = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <Cifra valor={int(p.piezas)} unidad="pz" />
        {p.cuota && !p.cerrado && (
          <span className="text-[13px] tabular-nums text-muted-foreground">
            tocaban <b className="font-semibold text-foreground">{int(p.cuota.piezas)}</b>{p.cuota.hora ? ` a las ${p.cuota.hora}` : ' a esta hora'}
          </span>
        )}
      </div>
      {p.curva && (
        <Curva
          curva={p.curva}
          inicioMs={p.inicioMs}
          alto={280}
          conDiferencia
          proyeccion={conProyeccion && p.curva.maxMin > finCurva + 1 ? { min: p.curva.maxMin, piezas: p.proyeccion! } : null}
        />
      )}
      {p.horas && p.horas.filas.length > 0 && <HoraAHora filas={p.horas.filas} metaPorHora={p.horas.metaPorHora} porMaquina={p.horas.porMaquina} total={p.piezas} />}
      <Grupo>
        {p.meta != null && <ListCell title="Meta del turno" value={`${int(p.meta)} pz`} />}
        {p.meta != null && <ListCell title="Faltan" value={`${int(Math.max(0, p.meta - p.piezas))} pz`} valueSub={pct != null ? `${pct} % hecho` : undefined} />}
        {p.vsAyer && <ListCell title={`${p.vsAyer.label} a esta altura`} value={`${int(p.vsAyer.pieces)} pz`} valueSub={`${firmado(p.vsAyer.diff)} hoy`} />}
      </Grupo>
      {p.maquinas.length > 1 && (
        <Grupo titulo="Por máquina">
          {p.maquinas.map((m) => <ListCell key={m.name} title={m.name} value={`${int(m.piezas)} pz`} />)}
        </Grupo>
      )}
    </div>
  )

  return (
    <div ref={raizRef} className="monitor-v2 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      {p.banda}

      {/* PC: columna principal fluida + riel fijo con lo vivo y lo de Mantención. Un solo DOM: en celular los dos
          envoltorios son `contents` y cada tarjeta lleva `max-lg:order-N`, que repite el orden de siempre
          (cifras, ritmo de la línea, ritmo en vivo, camino a la meta, curva, minuto a minuto, fallas, más). */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4 2xl:grid 2xl:grid-cols-2">
      {/* Fila 1 · las cifras que se miran de lejos */}
      <div className={`grid grid-cols-2 gap-3 max-lg:order-1 lg:gap-4 2xl:col-span-2 2xl:row-start-1 ${p.ritmoLinea ? 'xl:grid-cols-3' : '2xl:grid-cols-4'}`}>
        <Tarjeta compacta ampliado={ampliadoPiezas} subAmpliado={p.curva ? 'acumulado del turno contra el ritmo de la meta' : undefined} className={`col-span-2 ${p.ritmoLinea ? 'xl:col-span-1' : '2xl:col-span-1'}`} icono={<Target className={ic} />} titulo={p.cerrado ? 'Piezas del turno' : 'Piezas ahora'} sub={p.corteHora ? `Shoplogix ${p.corteHora}` : undefined}>
          <Cifra valor={int(piezasMostradas)} unidad="pz" />
          {p.meta != null && pct != null && (
            <div className="mt-3 flex items-center gap-3">
              <AnilloMeta frac={pct / 100} rotulo={`${pct} % de la meta del turno`} />
              <span className="text-[13px] leading-snug text-muted-foreground">de la meta del turno,<br /><b className="font-semibold tabular-nums text-foreground">{int(p.meta)} pz</b></span>
            </div>
          )}
        </Tarjeta>

        {conProyeccion && (
          <Tarjeta onAbrir={abrir('cierre')} icono={<TrendingUp className={ic} />} titulo="Al cierre" sub="a este ritmo">
            <Cifra valor={int(cierreMostrado)} unidad="pz" />
            {cierreVsMeta != null && <Contexto tono={cierreVsMeta >= 0 ? 'ok' : 'critical'}>{firmado(cierreVsMeta)} vs meta</Contexto>}
          </Tarjeta>
        )}

        {!p.ritmoLinea && <Tarjeta onAbrir={abrir('ritmo')} icono={<Gauge className={ic} />} titulo="Ritmo" sub={p.ritmoAhora != null ? 'pz/min ahora' : 'pz/min promedio andando'}>
          <Cifra valor={ritmoGrande != null ? dec(ritmoGrande) : '—'} unidad="pz/min" />
          {p.ritmoNecesario != null && ritmoGrande != null
            ? <Contexto tono={ritmoGrande >= p.ritmoNecesario ? 'ok' : 'warning'} nota={p.ritmoAhora != null && p.ritmo != null ? `promedio ${dec(p.ritmo)}` : p.setPoint ? `set ${dec(p.setPoint, 0)}` : undefined}>necesita {dec(p.ritmoNecesario)}</Contexto>
            : p.vsAyer && <Contexto tono={p.vsAyer.diff >= 0 ? 'ok' : 'critical'}>{firmado(p.vsAyer.diff)} pz vs {p.vsAyer.label}</Contexto>}
        </Tarjeta>}

        <Tarjeta iconoSoloPc={!!(conProyeccion && p.ritmoLinea)} onAbrir={abrir('mant')} className={`${conProyeccion && p.ritmoLinea ? 'col-span-1' : 'col-span-2'} ${p.ritmoLinea ? 'xl:col-span-1' : conProyeccion ? '2xl:col-span-1' : '2xl:col-span-2'}`} icono={<Wrench className={ic} />} titulo="Respuesta de Mantención" sub="minutos por falla técnica">
          {p.mant && p.mant.fallas > 0 ? (
            <>
              <Cifra valor={p.mant.mttr != null ? dec(p.mant.mttr) : '—'} unidad="min" />
              {deltaMttr != null
                ? <Contexto tono={deltaMttr <= 0 ? 'ok' : 'warning'} nota={`${p.mant.fallas} ${p.mant.fallas === 1 ? 'falla' : 'fallas'}`}>{firmado(deltaMttr, (n) => dec(n))} min vs turnos previos</Contexto>
                : <Contexto tono="neutral">{p.mant.fallas} {p.mant.fallas === 1 ? 'falla' : 'fallas'} · {horas(p.mant.fallaMin)}</Contexto>}
            </>
          ) : (
            <>
              <Cifra valor="0" unidad="fallas" />
              <Contexto tono="ok">Sin fallas de equipos</Contexto>
            </>
          )}
        </Tarjeta>
      </div>

      {p.ritmoLinea && <div className="v2-clasico v2-ritmo max-lg:order-2 2xl:col-start-1 2xl:row-start-2">{p.ritmoLinea}</div>}

      {p.caminoMeta && <div className="v2-camino max-lg:order-4 2xl:col-start-2 2xl:row-start-2 2xl:self-start">{p.caminoMeta}</div>}

      {/* Fila 2 · la curva del turno y las máquinas */}
      <div className="grid grid-cols-1 gap-3 max-lg:order-5 lg:grid-cols-4 lg:gap-4 2xl:col-span-2 2xl:row-start-3">
        {!p.ritmoLinea && <Tarjeta onAbrir={abrir('maquinas')} className="lg:col-span-4" icono={<Cpu className={ic} />} titulo="Máquinas" sub={`${corriendo} de ${p.maquinas.length} corriendo`}>
          <ul className="mt-4 space-y-3">
            {p.maquinas.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] text-foreground">{m.name}</div>
                  <div className="text-[13px] tabular-nums text-muted-foreground">
                    {m.status === 'detenida' ? (m.razon ?? 'Detenida') : velMaquina(m)}
                  </div>
                </div>
                {m.status === 'detenida'
                  ? <Pill tone="critical" dot className="tabular-nums">{m.desdeMin != null ? `${Math.round(m.desdeMin)} min` : 'Parada'}</Pill>
                  : m.status === 'produciendo' ? <Pill tone="ok" dot>Corre</Pill> : <Pill tone="neutral">Sin datos</Pill>}
              </li>
            ))}
          </ul>
        </Tarjeta>}
      </div>

      {/* «Más del turno»: al final de la columna principal, a todo el ancho en 2xl. */}
      <div className="flex min-w-0 flex-col gap-3 max-lg:order-9 lg:gap-4 2xl:col-span-2 2xl:row-start-5">
        {p.vista >= 1 && <MasDelTurnoV2 mas={p.mas} cerrado={p.cerrado} />}
        <BotonDetalle vista={p.vista} onVista={p.onVista} />
      </div>
      </div>

      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
      {p.ritmoVivo && <div className="min-w-0 max-lg:order-3">{p.ritmoVivo}</div>}

      {/* Fila 3 · Mantención en detalle y a dónde se fue el tiempo */}
      <div className="grid grid-cols-1 gap-3 max-lg:order-7 lg:gap-4">
        <Tarjeta ampliado={detalleDe('mant')?.cuerpo} subAmpliado={detalleDe('mant')?.sub} icono={<Wrench className={ic} />} titulo="Fallas de equipos" sub={p.eventos.length ? `${p.eventos.length} en el turno · ${horas(fallasMin)}` : 'ninguna en el turno'}>
          {p.rielMttr.length > 1 && <RielMttr riel={p.rielMttr} />}
          {p.eventos.length > 0 && (
            <ol className="mt-4 space-y-3">
              {p.eventos.slice(-4).reverse().map((e, i) => (
                <li key={`${e.desde}-${i}`} className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--v2-mant)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-[15px]">
                      <span className="truncate text-foreground">{e.causa ?? 'Falla técnica'}</span>
                      <span className="shrink-0 tabular-nums font-medium text-foreground">{horas(e.min)}</span>
                    </div>
                    <div className="text-[13px] tabular-nums text-muted-foreground">{e.maquina} · {hhmm(e.desde)}–{hhmm(e.hasta)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        <Tarjeta ampliado={detalleDe('perdido')?.cuerpo} subAmpliado={detalleDe('perdido')?.sub} icono={<Clock className={ic} />} titulo="Tiempo perdido" sub={p.perdidasMaquina && p.perdidasMaquina.maquinas > 1 ? `minutos de línea: ${int(p.perdidasMaquina.min)} min de máquina ÷ ${p.perdidasMaquina.maquinas}` : 'minutos de línea, por dueño y causa'}>
          <Cifra valor={horasCifra(totalPerdida)} chica />
          {totalPerdida > 0 && (
            <>
              <div className="mt-3 flex h-2.5 gap-1 overflow-hidden">
                {p.perdidas.filter((x) => x.min > 0).map((x) => (
                  <div key={x.dueno} className="h-full rounded-full" style={{ flex: x.min, background: RELLENO[x.dueno] }} />
                ))}
              </div>
              <Leyenda items={p.perdidas.filter((x) => x.min > 0).map((x) => ({ color: RELLENO[x.dueno], label: `${DUENO_UI[x.dueno].corto} ${horas(x.min)}` }))} />
              <ul className="mt-4 space-y-3">
                {p.causas.slice(0, 4).map((c) => (
                  <FilaBarra key={c.causa} label={c.causa} valor={horas(c.min)} frac={c.min / maxCausa} color={RELLENO[c.dueno]} />
                ))}
              </ul>
            </>
          )}
        </Tarjeta>
      </div>

      </div>

      <PanelDetalle abierto={detalle != null} titulo={detalle?.titulo ?? ''} sub={detalle?.sub} onClose={() => setAbierta(null)}>
        {detalle?.cuerpo}
      </PanelDetalle>
    </div>
  )
}

// ── Análisis ─────────────────────────────────────────────────────────────────

export interface MonitorV2AnalisisProps {
  pareto: { rows: ParetoRow[]; totalMin: number; totalPiezas: number; shifts: number; porDueno: Partial<Record<DuenoPerdida, number>> } | null
  semanas: SemanaReparto[]
  /** dateKey de hoy en hora de planta: marca la semana en curso. */
  hoy?: string | null
  horas: HourlyRow[]
  /** pz/h que pide la meta, para la línea de referencia de «hora por hora». */
  metaPorHora: number | null
  vista: VistaV2
  onVista: (v: VistaV2) => void
}

type ClaveAnalisis = 'pareto' | 'semanas' | 'horas'

export function MonitorV2Analisis(p: MonitorV2AnalisisProps) {
  const raizRef = useRef<HTMLDivElement>(null)
  useEntradaEscalonada(raizRef)
  const [abierta, setAbierta] = useState<ClaveAnalisis | null>(null)
  const abrir = (k: ClaveAnalisis) => () => setAbierta(k)
  const pareto = p.pareto
  const mantMin = pareto?.porDueno.mantencion ?? 0
  const mantPct = pareto && pareto.totalMin > 0 ? Math.round((mantMin / pareto.totalMin) * 100) : null
  const filas = pareto?.rows.slice(0, 6) ?? []
  const maxFila = Math.max(1, ...filas.map((r) => r.minutes))
  const [semAnt, semAct] = p.semanas.slice(-2)
  const pctMant = (s?: SemanaReparto) => {
    if (!s) return null
    const t = s.min.mantencion + s.min.externo + s.min['sin-imputar']
    return t > 0 ? (s.min.mantencion / t) * 100 : null
  }
  const pAct = pctMant(semAct)
  const pAnt = pctMant(semAnt)
  const completas = p.horas.filter((h) => !h.partial)
  const mejor = completas.reduce<HourlyRow | null>((a, h) => (!a || h.pieces > a.pieces ? h : a), null)
  const peor = completas.reduce<HourlyRow | null>((a, h) => (!a || h.pieces < a.pieces ? h : a), null)

  const detalle = ((): { titulo: string; sub?: string; cuerpo: ReactNode } | null => {
    switch (abierta) {
      case 'pareto': return {
        titulo: 'Qué se repite', sub: pareto ? `Últimos ${pareto.shifts} turnos · ${horas(pareto.totalMin)} · ≈${int(pareto.totalPiezas)} pz` : undefined,
        cuerpo: pareto && (
          <>
            <Grupo titulo="Por dueño">
              {DUENOS.map((d) => <ListCell key={d} leading={<Punto color={RELLENO[d]} />} title={DUENO_UI[d].corto} value={horas(pareto.porDueno[d] ?? 0)} valueSub={pareto.totalMin ? `${Math.round(((pareto.porDueno[d] ?? 0) / pareto.totalMin) * 100)} %` : undefined} />)}
            </Grupo>
            <Grupo titulo="Todas las causas" nota="Piezas valorizadas al ritmo del turno en que ocurrió cada parada. Las paradas de convenio no entran.">
              {pareto.rows.map((r) => (
                <ListCell
                  key={r.label}
                  leading={<Punto color={RELLENO[r.dueno as DuenoPerdida] ?? 'var(--v2-gris)'} />}
                  title={r.label}
                  subtitle={`en ${r.shifts} de ${pareto.shifts} turnos · ${r.count} paradas · acumulado ${Math.round(r.cumPct)} %`}
                  value={horas(r.minutes)}
                  valueSub={`≈${int(r.piezas)} pz`}
                />
              ))}
            </Grupo>
          </>
        ),
      }
      case 'semanas': return {
        titulo: 'De quién fue la pérdida', sub: 'Minutos de línea por semana · toca una semana',
        cuerpo: <DetalleSemanaV2 semanas={p.semanas} hoy={p.hoy} />,
      }
      case 'horas': return {
        titulo: 'Hora por hora', sub: 'Desde la primera pieza del turno',
        cuerpo: (
          <Grupo nota="La hora en curso no se compara de igual a igual: está incompleta.">
            {p.horas.map((h) => (
              <ListCell
                key={h.hourStart}
                title={`${hhmm(h.from)}–${hhmm(h.to)}`}
                subtitle={h.partial ? 'en curso' : h === mejor ? 'mejor hora' : h === peor ? 'peor hora' : undefined}
                value={`${int(h.pieces)} pz`}
                valueSub={`${int(h.piecesPerHour)} pz/h${p.metaPorHora != null ? ` · ${firmado(h.piecesPerHour - p.metaPorHora)} vs meta` : ''}`}
              />
            ))}
          </Grupo>
        ),
      }
      default: return null
    }
  })()

  return (
    <div ref={raizRef} className="monitor-v2 flex flex-col gap-3 lg:gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Tarjeta onAbrir={abrir('pareto')} icono={<Repeat className={ic} />} titulo="Tiempo perdido" sub={pareto ? `últimos ${pareto.shifts} turnos` : undefined}>
          <Cifra valor={pareto ? horasCifra(pareto.totalMin) : '—'} chica />
          {pareto && <Contexto tono="neutral">≈ {int(pareto.totalPiezas)} pz</Contexto>}
        </Tarjeta>
        <Tarjeta onAbrir={abrir('pareto')} icono={<Wrench className={ic} />} titulo="Peso de Mantención" sub="del tiempo perdido">
          <Cifra valor={mantPct != null ? `${mantPct} %` : '—'} chica />
          {pareto && <Contexto tono="warning">{horas(mantMin)} de equipos</Contexto>}
        </Tarjeta>
        <Tarjeta onAbrir={abrir('semanas')} icono={<CalendarRange className={ic} />} titulo="Esta semana" sub={semAct ? `equipos sobre lo perdido · ${semAct.turnos} ${semAct.turnos === 1 ? 'turno' : 'turnos'}` : 'equipos sobre lo perdido'}>
          <Cifra valor={pAct != null ? `${Math.round(pAct)} %` : '—'} chica />
          {pAct != null && pAnt != null && (
            <Contexto tono={pAct <= pAnt ? 'ok' : 'warning'}>{firmado(Math.round(pAct - pAnt))} pts vs semana anterior</Contexto>
          )}
        </Tarjeta>
        <Tarjeta onAbrir={abrir('horas')} icono={<Timer className={ic} />} titulo="Mejor hora de hoy" sub={mejor ? `${hhmm(mejor.from)}–${hhmm(mejor.to)}` : undefined}>
          <Cifra valor={mejor ? int(mejor.pieces) : '—'} unidad="pz" chica />
          {peor && mejor && peor !== mejor && <Contexto tono="critical" nota={`${hhmm(peor.from)}–${hhmm(peor.to)}`}>peor {int(peor.pieces)} pz</Contexto>}
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <Tarjeta onAbrir={abrir('pareto')} icono={<AlertTriangle className={ic} />} titulo="Qué se repite" sub={pareto ? `causas de los últimos ${pareto.shifts} turnos` : 'sin historial'}>
          {filas.length > 0 && (
            <>
              <ul className="mt-4 space-y-3.5">
                {filas.map((r) => (
                  <FilaBarra
                    key={r.label}
                    label={r.label}
                    valor={`${horas(r.minutes)} · ≈${int(r.piezas)} pz`}
                    sub={`en ${r.shifts} de ${pareto!.shifts} turnos`}
                    frac={r.minutes / maxFila}
                    color={RELLENO[r.dueno as DuenoPerdida] ?? 'var(--v2-gris)'}
                  />
                ))}
              </ul>
              <Leyenda items={DUENOS.map((d) => ({ color: RELLENO[d], label: DUENO_UI[d].corto }))} />
            </>
          )}
        </Tarjeta>

        <Tarjeta onAbrir={abrir('semanas')} icono={<BarChart3 className={ic} />} titulo="De quién fue la pérdida" sub={`minutos de línea por semana · ${p.semanas.length} semanas`}>
          {p.semanas.length > 0 && <BarrasSemana semanas={p.semanas} />}
        </Tarjeta>
      </div>

      {p.horas.length > 0 && (
        <Tarjeta onAbrir={abrir('horas')} icono={<Clock className={ic} />} titulo="Hora por hora" sub="piezas de cada hora desde el arranque">
          <BarrasHora filas={p.horas} metaPorHora={p.metaPorHora} />
        </Tarjeta>
      )}

      <BotonDetalle vista={p.vista} onVista={p.onVista} conMas={false} />

      <PanelDetalle abierto={detalle != null} titulo={detalle?.titulo ?? ''} sub={detalle?.sub} onClose={() => setAbierta(null)}>
        {detalle?.cuerpo}
      </PanelDetalle>
    </div>
  )
}

// ── Cabecera (barra flotante + título grande, como el reel) ─────────────────

export function CabeceraV2({ titulo, area, estado, tema, cambioLinea, navTurnos, sub, pestana, onPestana }: {
  titulo: string
  area: string | null
  estado: ReactNode
  tema: ReactNode
  /** El cambio de línea (Eviscerado ↔ Filete). Solo existe con sesión de supervisor. */
  cambioLinea: ReactNode
  navTurnos: ReactNode
  sub: string
  pestana: 'turno' | 'analisis'
  onPestana: (p: 'turno' | 'analisis') => void
}) {
  /* Celular: la barra flotante y el título grande de siempre (`lg:hidden`). PC (lg+): UNA barra de 56 px, pegada
     arriba: línea · estado · turno a la izquierda y la navegación de turnos a la derecha. Las pestañas, el cambio
     de línea, Modo TV, el tema y Inicio viven en la barra lateral (`BarraLateralPC`). Sin título grande. */
  const ancho = 'mx-auto max-w-3xl px-3'
  const pestanas = (
    <div className="v2-segmentado flex rounded-full p-1" role="tablist">
      {([['turno', 'El turno'], ['analisis', 'Análisis']] as const).map(([id, rotulo]) => (
        <button
          key={id}
          role="tab"
          aria-selected={pestana === id}
          onClick={() => onPestana(id)}
          className={`tap-44 rounded-full px-4 py-1.5 text-[14px] transition-colors ${pestana === id ? 'v2-seg-activo font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
  return (
    <>
      <div className="v2-cabecera sticky top-0 z-20 pt-3 lg:hidden">
        <div className={ancho}>
          <div className="v2-barra flex h-14 items-center gap-2.5 rounded-full pl-2 pr-2">
            <Icono grande><Cpu className="h-4 w-4" /></Icono>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight">{titulo}</div>
              {area && <div className="truncate text-[12px] text-muted-foreground">{area}</div>}
            </div>
            <span className="hidden sm:inline-flex">{estado}</span>
            <span className="ml-auto inline-flex">{tema}</span>
          </div>
        </div>
      </div>
      <div className={`${ancho} pt-5 lg:hidden`}>
        <div className="mb-3 sm:hidden">{estado}</div>
        <div className="mb-4">{cambioLinea}</div>
        <div className="flex flex-col gap-4">
          <div className="min-w-0 px-1">
            <h1 className="text-[34px] font-semibold leading-none tracking-tight">{pestana === 'turno' ? 'El turno' : 'Análisis'}</h1>
            <p className="mt-2 text-[15px] tabular-nums text-muted-foreground first-letter:uppercase">{sub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {navTurnos}
            {pestanas}
          </div>
        </div>
      </div>

      <div className="v2-cabecera v2-barra-pc sticky top-0 z-20 hidden h-14 items-center gap-4 px-6 lg:flex">
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="min-w-0 truncate text-[15px] font-semibold leading-tight">{titulo}</h1>
            {estado}
            {area && <span className="hidden truncate text-[13px] text-muted-foreground xl:inline">{area.startsWith(titulo) ? area.slice(titulo.length).replace(/^[\s·]+/, '') || area : area}</span>}
          </div>
          <p className="truncate text-[13px] leading-tight tabular-nums text-muted-foreground first-letter:uppercase" title={sub}>{sub}</p>
        </div>
        {navTurnos}
      </div>
    </>
  )
}

// ── «Ver más del turno»: lo que antes vivía en el análisis completo ─────────

export interface MasDelTurno {
  cascada: Cascada | null
  /** Máquina · causa · hora de cada pérdida de la cascada, cuadrado a sus totales. */
  cascadaDetalle?: DetalleCascada | null
  tiempo: { windowMin: number; producingMin: number; plannedMin: number; recoverableMin: number } | null
  /** Otros días comparados a la misma altura del turno (o completos, cerrado). */
  comparado: Array<{ label: string; piezas: number; hoy: boolean }> | null
}

/** Sin imputar: rayado gris, para que no se confunda con un dueño. */
const RAYADO = 'repeating-linear-gradient(135deg, var(--v2-gris) 0 3px, transparent 3px 6px)'
const RELLENO_DETALLE: Record<DuenoDetalle, string> = { mantencion: 'var(--v2-mant)', externo: 'var(--v2-ext)', 'sin-imputar': RAYADO }
const NOMBRE_DUENO: Record<DuenoDetalle, string> = { mantencion: 'Mantención', externo: 'Externo', 'sin-imputar': 'Sin imputar' }
const pct = (n: number, t: number) => `${t > 0 ? Math.round((n / t) * 100) : 0} %`
const vecesTxt = (n: number) => `${int(n)} ${n === 1 ? 'vez' : 'veces'}`

type FilaAbrible = 'detenciones' | 'micro' | 'vacias'
type VistaDetalle = 'maquina' | 'causa' | 'hora'

/** Una barra partida por dueño (o de un solo color). `ancho` en %. */
function BarraPartes({ partes, color, ancho, alto = 'h-2' }: { partes?: Partial<Record<DuenoDetalle, number>>; color?: string; ancho: number; alto?: string }) {
  const tramos = partes ? DUENOS.filter((d) => (partes[d] ?? 0) > 0) : []
  return (
    <div className={`flex ${alto} gap-px overflow-hidden rounded-full`} style={{ width: `${Math.max(3, Math.min(100, ancho))}%` }}>
      {tramos.length
        ? tramos.map((d) => <i key={d} className="block h-full" style={{ flex: partes![d], background: RELLENO_DETALLE[d] }} />)
        : <i className="block h-full w-full" style={{ background: color }} />}
    </div>
  )
}

/** Renglones de una vista (máquina o causa): nombre, barra, piezas y su contexto. */
function RenglonesDetalle({ filas, total, color, sub }: { filas: RenglonDetalle[]; total: number; color: string; sub: (r: RenglonDetalle) => string }) {
  const max = Math.max(1, ...filas.map((r) => r.piezas))
  return (
    <ul className="mt-3 space-y-2.5">
      {filas.map((r) => (
        <li key={r.nombre} className="min-w-0">
          <div className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2 text-[13px]">
            <span className="truncate text-foreground" title={r.nombre}>{r.nombre}</span>
            <BarraPartes partes={r.partes} color={r.dueno ? RELLENO_DETALLE[r.dueno] : color} ancho={(r.piezas / max) * 100} />
            <span className="tabular-nums text-foreground">{firmado(-r.piezas)} pz</span>
          </div>
          <div className="mt-0.5 pl-0 text-[12px] tabular-nums text-muted-foreground sm:pl-[7rem]">{sub(r)} · {pct(r.piezas, total)}</div>
        </li>
      ))}
    </ul>
  )
}

/** Columnas por hora de planta. Con muchas horas los valores no caben: se nombra la más cara. */
function HorasDetalle({ horasFila, color }: { horasFila: HoraDetalle[]; color: string }) {
  const max = Math.max(1, ...horasFila.map((h) => h.piezas))
  const peor = horasFila.reduce((a, h) => (h.piezas > a.piezas ? h : a), horasFila[0]!)
  const conValor = horasFila.length <= 7
  const parciales = horasFila.filter((h) => h.parcialMin != null)
  return (
    <>
      <div className="mt-3 grid h-24 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${horasFila.length}, minmax(0, 1fr))` }}>
        {horasFila.map((h) => (
          <div key={h.hora} className="flex h-full min-w-0 flex-col items-stretch justify-end gap-1" title={`${h.hora} h · ${firmado(-h.piezas)} pz`}>
            {conValor && <span className="text-center text-[12px] tabular-nums text-foreground">{h.piezas > 0 ? firmado(-h.piezas) : '0'}</span>}
            <div className="flex flex-col-reverse overflow-hidden rounded-t-[6px] rounded-b-[2px]" style={{ height: `${(h.piezas / max) * 56}px`, minHeight: h.piezas > 0 ? 3 : 0 }}>
              {h.partes && DUENOS.some((d) => (h.partes![d] ?? 0) > 0)
                ? DUENOS.filter((d) => (h.partes![d] ?? 0) > 0).map((d) => <i key={d} className="block" style={{ flex: h.partes![d], background: RELLENO_DETALLE[d] }} />)
                : <i className="block h-full" style={{ background: color }} />}
            </div>
            <span className="text-center text-[12px] tabular-nums text-muted-foreground">{h.hora}{h.parcialMin != null ? '*' : ''}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] tabular-nums text-muted-foreground">
        La hora más cara: {peor.hora} h, {firmado(-peor.piezas)} pz.
        {parciales.length ? ` * Hora incompleta: ${parciales.map((h) => `${h.hora} h (${h.parcialMin} min)`).join(', ')}.` : ''}
      </p>
    </>
  )
}

const SinDato = ({ children }: { children: ReactNode }) => (
  <p className="mt-3 rounded-[10px] border border-dashed border-muted-foreground/30 px-3 py-2.5 text-[13px] text-muted-foreground">{children}</p>
)
const Nota = ({ children }: { children: ReactNode }) => <p className="mt-3 text-[12px] leading-snug text-muted-foreground">{children}</p>

/** El cuerpo de una fila abierta: pestañas Máquina · Causa · Hora. */
function DetalleFila({ fila, c, d, vista, onVista }: { fila: FilaAbrible; c: Cascada; d: DetalleCascada; vista: VistaDetalle; onVista: (v: VistaDetalle) => void }) {
  const cont = contenedorPlural(c.contenedor)
  const pasoVacio = c.contenedor === 'carro' ? 'el carro pasó vacío' : 'la silleta pasó vacía'
  const color = fila === 'vacias' ? 'var(--v2-ext)' : 'var(--v2-mant)'
  const total = fila === 'detenciones' ? d.responde.total - d.responde.micro - d.responde.vacias : fila === 'micro' ? d.responde.micro : d.responde.vacias
  const v = fila === 'detenciones' ? d.detenciones : fila === 'micro' ? d.micro : d.vacias
  const pestanas: Array<[VistaDetalle, string]> = [['maquina', 'Máquina'], ['causa', 'Causa'], ['hora', 'Hora']]
  let cuerpo: ReactNode = null
  if (vista === 'maquina') {
    cuerpo = v?.maquina?.length ? (
      <>
        <RenglonesDetalle filas={v.maquina} total={total} color={color} sub={(r) =>
          fila === 'vacias' ? (r.esperado != null ? `pide ${dec(r.esperado, 0)} pz/min` : 'sin objetivo')
            : `${r.minutos != null ? `${horas(r.minutos)} de máquina · ` : ''}${vecesTxt(r.veces ?? 0)}`} />
        <Nota>{fila === 'vacias'
          ? 'Repartido según lo que cada máquina se quedó bajo su esperado en los minutos que andaba.'
          : 'Repartido según el tiempo que cada máquina estuvo detenida.'}</Nota>
      </>
    ) : <SinDato>Sin dato por máquina en este turno.</SinDato>
  } else if (vista === 'causa') {
    if (fila === 'detenciones' && v?.causa?.length) {
      const sin = d.responde.sinImputar
      cuerpo = (
        <>
          <RenglonesDetalle filas={v.causa} total={total} color={color} sub={(r) =>
            [NOMBRE_DUENO[r.dueno ?? 'sin-imputar'], r.maquinas?.join(', '), r.veces ? vecesTxt(r.veces) : null].filter(Boolean).join(' · ')} />
          {sin > 0 && <Nota>{int(sin)} pz ({pct(sin, total)}) sin imputar: si nadie anota la causa, no se puede defender.</Nota>}
        </>
      )
    } else if (fila === 'micro' && d.micro) {
      const seg = d.micro.segundosPromedio
      cuerpo = (
        <>
          <RenglonesDetalle filas={d.micro.causa ?? []} total={total} color={color} sub={(r) =>
            [r.veces ? vecesTxt(r.veces) : null, seg != null ? `${int(seg)} s promedio` : null].filter(Boolean).join(' · ') || 'sin detalle'} />
          <Nota>Shoplogix las registra como «Microdetención», sin causa de origen. Se sabe la máquina, la hora y cuánto duran; el porqué, no.</Nota>
        </>
      )
    } else if (fila === 'vacias') {
      cuerpo = <SinDato>Sin dato de causa: Shoplogix no registra por qué {pasoVacio}. La línea andaba: no es tiempo de equipo detenido.</SinDato>
    } else cuerpo = <SinDato>Sin dato de causa en este turno.</SinDato>
  } else {
    cuerpo = v?.hora?.length ? <HorasDetalle horasFila={v.hora} color={color} /> : <SinDato>Sin dato por hora en este turno.</SinDato>
  }
  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-3 gap-0.5 rounded-[10px] bg-muted-foreground/[0.12] p-0.5" role="tablist" aria-label={`Detalle por ${cont}`}>
        {pestanas.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={vista === id}
            onClick={() => onVista(id)}
            className={`tap-44 rounded-[10px] py-1.5 text-[13px] transition-colors ${vista === id ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {cuerpo}
    </div>
  )
}

/** «Quién responde de las N»: el dato que separa a Mantención del resto. */
function QuienResponde({ d, c }: { d: DetalleCascada; c: Cascada }) {
  const r = d.responde
  const partes = [
    { k: 'Mantención', n: r.mantencion, fondo: 'var(--v2-mant)', op: 1 },
    { k: 'Externo', n: r.externo, fondo: 'var(--v2-ext)', op: 1 },
    { k: 'Sin imputar', n: r.sinImputar, fondo: RAYADO, op: 1 },
    { k: 'Micro', n: r.micro, fondo: 'var(--v2-mant)', op: 0.5 },
    { k: vaciasEtiqueta(c.contenedor), n: r.vacias, fondo: 'var(--v2-ext)', op: 0.45 },
  ].filter((x) => x.n > 0)
  if (!partes.length) return null
  return (
    <div className="v2-subtarjeta mt-4 rounded-[14px] p-3">
      <div className="text-[13px] tabular-nums text-muted-foreground">Quién responde de las {int(r.total)}</div>
      <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={partes.map((x) => `${x.k} ${int(x.n)}`).join(', ')}>
        {partes.map((x) => <i key={x.k} className="block h-full" style={{ flex: x.n, background: x.fondo, opacity: x.op }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums text-foreground">
        {partes.map((x) => (
          <span key={x.k} className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.fondo, opacity: x.op, border: x.fondo === RAYADO ? '1px solid var(--v2-gris)' : undefined }} />
            {x.k} {int(x.n)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** «Dónde se fueron las piezas»: cascada horizontal; cada pérdida cuelga de lo que quedaba y se abre en su detalle. */
function CascadaV2({ c, d }: { c: Cascada; d: DetalleCascada | null }) {
  const [abierta, setAbierta] = useState<FilaAbrible | null>(null)
  const [vistas, setVistas] = useState<Record<FilaAbrible, VistaDetalle>>({ detenciones: 'maquina', micro: 'maquina', vacias: 'maquina' })
  let resto = c.capacidad
  const filas = c.pasos.map((paso) => {
    if (paso.clave === 'capacidad' || paso.clave === 'producido') return { paso, desde: 0, hasta: Math.abs(paso.piezas) }
    const hasta = resto
    resto = resto + paso.piezas
    return { paso, desde: resto, hasta }
  })
  const color = (k: string) => (k === 'capacidad' ? 'var(--v2-secundaria)' : k === 'producido' ? 'var(--v2-acento)' : k === 'vacias' ? 'var(--v2-ext)' : 'var(--v2-mant)')
  const info = (p: Cascada['pasos'][number]) => {
    if (p.clave === 'vacias') return 'andando, sin pieza'
    return [p.minutos != null ? `${horas(p.minutos)} de línea` : null, p.veces ? vecesTxt(p.veces) : null].filter(Boolean).join(' · ')
  }
  return (
    <>
      {d && <QuienResponde d={d} c={c} />}
      <ul className="mt-4 space-y-1">
        {filas.map(({ paso, desde, hasta }) => {
          const abrible = d != null && (paso.clave === 'detenciones' || paso.clave === 'micro' || paso.clave === 'vacias')
          const clave = paso.clave as FilaAbrible
          const ab = abrible && abierta === clave
          const alternar = () => setAbierta((a) => (a === clave ? null : clave))
          const cabeza = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                  {abrible && <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${ab ? '' : '-rotate-90'}`} aria-hidden />}
                  <span className="truncate">{paso.etiqueta}</span>
                </span>
                <span className={`shrink-0 tabular-nums ${paso.piezas < 0 ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{paso.piezas < 0 ? firmado(paso.piezas) : int(paso.piezas)} pz</span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-full bg-muted-foreground/[0.08]">
                <div className="absolute inset-y-0 rounded-full" style={{ left: `${(desde / c.capacidad) * 100}%`, width: `${Math.max(0.8, ((hasta - desde) / c.capacidad) * 100)}%`, background: color(paso.clave) }} />
              </div>
              {paso.piezas < 0 && !ab && info(paso) && <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">{info(paso)}</div>}
            </>
          )
          return (
            <li key={paso.clave} className={`-mx-2.5 rounded-[14px] px-2.5 py-2 ${ab ? 'v2-subtarjeta' : ''}`}>
              {abrible ? (
                <button type="button" className="block w-full text-left" aria-expanded={ab} onClick={(e) => { e.stopPropagation(); alternar() }}>
                  {cabeza}
                </button>
              ) : cabeza}
              {ab && d && <DetalleFila fila={clave} c={c} d={d} vista={vistas[clave]} onVista={(v) => setVistas((x) => ({ ...x, [clave]: v }))} />}
            </li>
          )
        })}
      </ul>
      {d && !abierta && <p className="mt-2 text-[12px] text-muted-foreground">Toca una pérdida para ver máquina, causa y hora.</p>}
    </>
  )
}

/** Barra del tiempo del turno: produciendo / programado / recuperable. */
function TiempoV2({ t }: { t: NonNullable<MasDelTurno['tiempo']> }) {
  const partes = [
    { k: 'Produciendo', min: t.producingMin, color: 'var(--v2-acento)' },
    { k: 'Programado (colación, aseo)', min: t.plannedMin, color: 'var(--v2-prog)' },
    // Solo la línea ENTERA detenida: por eso es menos que «Tiempo perdido», que suma también las paradas de una máquina de N.
    { k: 'Línea entera detenida', min: t.recoverableMin, color: 'var(--v2-mant)' },
  ]
  const tot = Math.max(1, partes.reduce((a, x) => a + x.min, 0))
  return (
    <>
      <div className="mt-4 flex h-3 gap-1 overflow-hidden">
        {partes.filter((x) => x.min > 0).map((x) => <div key={x.k} className="h-full rounded-full" style={{ flex: x.min, background: x.color }} />)}
      </div>
      <ul className="mt-4 space-y-2">
        {partes.map((x) => (
          <li key={x.k} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="inline-flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} /><span className="truncate">{x.k}</span></span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{horas(x.min)} · {Math.round((x.min / tot) * 100)} %</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function MasDelTurnoV2({ mas, cerrado }: { mas: MasDelTurno; cerrado: boolean }) {
  const c = mas.cascada
  const t = mas.tiempo
  const comp = mas.comparado ?? []
  const maxComp = Math.max(1, ...comp.map((x) => x.piezas))
  const hoyComp = comp.find((x) => x.hoy)
  const otros = comp.filter((x) => !x.hoy)
  const mediaOtros = otros.length ? otros.reduce((a, x) => a + x.piezas, 0) / otros.length : null
  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <div className="px-1 pt-2">
        <h2 className="text-[22px] font-semibold tracking-tight lg:text-[26px]">Más del turno</h2>
        <p className="text-[15px] text-muted-foreground">Dónde se fueron las piezas y cómo se usó el tiempo</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        {c && (
          <Tarjeta icono={<Filter className={ic} />} titulo="Dónde se fueron las piezas" sub={`capacidad a ${dec(c.ritmoMaquina, 0)} pz/min · ${horas(c.minutosEnMarcha + c.minutosDetenida)}`}>
            <Cifra valor={int(c.perdido)} unidad="pz no hechas" chica />
            <Contexto tono="info" nota={`parado ${int(c.perdidoParado)} · andando ${int(c.perdidoAndando)}`}>{Math.round(c.silletasLlenasPor100)} de cada 100 {contenedorPlural(c.contenedor)} con pieza</Contexto>
            <CascadaV2 c={c} d={mas.cascadaDetalle ?? null} />
          </Tarjeta>
        )}
        {t && (
          <Tarjeta icono={<Clock className={ic} />} titulo="Tiempo del turno" sub={`${horas(t.windowMin)} ${cerrado ? 'de turno' : 'transcurridos'}`}>
            <Cifra valor={`${Math.round((t.producingMin / Math.max(1, t.windowMin)) * 100)} %`} unidad="del tiempo produciendo" chica />
            <TiempoV2 t={t} />
          </Tarjeta>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        {comp.length > 1 && (
          <Tarjeta icono={<CalendarRange className={ic} />} titulo="Comparado con otros días" sub={cerrado ? 'el mismo turno de otros días, completo' : 'el mismo turno de otros días, a esta misma altura'}>
            {hoyComp && mediaOtros != null && (
              <>
                <Cifra valor={firmado(hoyComp.piezas - mediaOtros)} unidad="pz vs el promedio" chica />
                <Contexto tono={hoyComp.piezas >= mediaOtros ? 'ok' : 'critical'}>hoy {int(hoyComp.piezas)} · promedio {int(mediaOtros)}</Contexto>
              </>
            )}
            <ul className="mt-4 space-y-3">
              {comp.map((x) => (
                <FilaBarra key={x.label + (x.hoy ? '-hoy' : '')} label={x.hoy ? 'Hoy' : x.label} valor={`${int(x.piezas)} pz`} frac={x.piezas / maxComp} color={x.hoy ? 'var(--v2-acento)' : 'var(--v2-secundaria)'} />
              ))}
            </ul>
          </Tarjeta>
        )}
      </div>
    </div>
  )
}
