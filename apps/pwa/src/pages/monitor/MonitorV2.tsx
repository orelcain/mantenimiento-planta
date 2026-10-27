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
import { Activity, AlertTriangle, BarChart3, CalendarRange, ChevronDown, Clock, Cpu, Filter, Gauge, Info, Repeat, Target, Timer, TrendingUp, Tv, Wrench, X } from 'lucide-react'
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
import type { Cascada } from './cascadaTurno'
import { DUENO_UI } from './duenoUi'
import { useZoomGesto, type Ventana } from './useZoomGesto'

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

function useEsPc() {
  const q = '(min-width: 1024px)'
  const [pc, setPc] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setPc(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return pc
}

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

/** Globo del gráfico, posicionado en % del ancho y acotado para no salirse. */
function Globo({ x, children }: { x: number; children: ReactNode }) {
  const left = Math.min(82, Math.max(18, x))
  return (
    <div className="v2-tip pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-ctl px-3 py-2 text-[13px] leading-snug" style={{ left: `${left}%` }}>
      {children}
    </div>
  )
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

function Icono({ children, grande }: { children: ReactNode; grande?: boolean }) {
  return <span className={`v2-icono inline-flex shrink-0 items-center justify-center rounded-full ${grande ? 'h-10 w-10' : 'h-7 w-7'}`}>{children}</span>
}

function Tarjeta({ icono, titulo, sub, children, className = '', onAbrir, iconoSoloPc }: {
  icono?: ReactNode; titulo: string; sub?: string; children: ReactNode; className?: string; onAbrir?: () => void
  /** A media pantalla en el celular el ícono le roba el ancho al título: ahí se omite. */
  iconoSoloPc?: boolean
}) {
  const tocable = onAbrir
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: onAbrir,
        onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } },
        'aria-label': `${titulo}: ver detalle`,
      }
    : {}
  return (
    <section className={`v2-tarjeta min-w-0 rounded-card p-4 lg:p-5 ${className}`} {...tocable}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icono && <span className={iconoSoloPc ? 'hidden lg:contents' : 'contents'}><Icono>{icono}</Icono></span>}
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-tight text-foreground">{titulo}</h3>
            {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
        {onAbrir && <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />}
      </div>
      {children}
    </section>
  )
}

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
function MinutoTurnoV2({ d, cerrado }: { d: MinutoTurno; cerrado: boolean }) {
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

  const varias = d.maquinas.length > 1
  const filas = [
    ...(varias
      ? [{
          nombre: 'Línea',
          nota: `las ${d.maquinas.length} suman`,
          esperado: d.maquinas.every((m) => m.esperado != null) ? d.maquinas.reduce((a, m) => a + (m.esperado ?? 0), 0) : null,
          cycles: suma,
          principal: true,
        }]
      : []),
    ...d.maquinas.map((m) => ({ nombre: m.nombre, nota: null as string | null, esperado: m.esperado, cycles: m.cycles, principal: !varias })),
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
                            opacity: i == null || i === k ? 1 : 0.35,
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
function Curva({ curva, inicioMs }: { curva: CurvaDatos; inicioMs: number | null }) {
  const [m, setM] = useState<number | null>(null)
  const techo = Math.max(1, ...curva.hoy.map((p) => p.pieces), ...(curva.previo?.curve.map((p) => p.pieces) ?? []), ...(curva.objetivo?.map((p) => p.pieces) ?? []))
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
        className="relative h-[190px] touch-pan-y select-none lg:h-[300px]"
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

// ── El turno ─────────────────────────────────────────────────────────────────

export interface MonitorV2Props {
  piezas: number
  corteHora: string | null
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
  /** «Camino a la meta» del monitor clásico (hechas, paradas por causa, ritmo, por jugar): se ve tal cual. */
  caminoMeta?: ReactNode
  /** Velocidad minuto a minuto de todo el turno (ciclos de Shoplogix por máquina). */
  minutoAMinuto?: MinutoTurno | null
  vista: VistaV2
  onVista: (v: VistaV2) => void
}

type ClaveTurno = 'piezas' | 'cierre' | 'ritmo' | 'mant' | 'curva' | 'maquinas' | 'perdido'

export function MonitorV2(p: MonitorV2Props) {
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

  const detalle = ((): { titulo: string; sub?: string; cuerpo: ReactNode } | null => {
    switch (abierta) {
      case 'piezas': return {
        titulo: 'Piezas del turno', sub: p.corteHora ? `Contador de Shoplogix a las ${p.corteHora}` : undefined,
        cuerpo: (
          <>
            <Grupo>
              <ListCell title="Piezas" value={`${int(p.piezas)} pz`} />
              {p.meta != null && <ListCell title="Meta del turno" value={`${int(p.meta)} pz`} />}
              {p.meta != null && <ListCell title="Faltan" value={`${int(Math.max(0, p.meta - p.piezas))} pz`} valueSub={pct != null ? `${pct} % hecho` : undefined} />}
              {p.vsAyer && <ListCell title={`${p.vsAyer.label} a esta altura`} value={`${int(p.vsAyer.pieces)} pz`} valueSub={`${firmado(p.vsAyer.diff)} hoy`} />}
            </Grupo>
            {p.maquinas.length > 1 && (
              <Grupo titulo="Por máquina">
                {p.maquinas.map((m) => <ListCell key={m.name} title={m.name} value={`${int(m.piezas)} pz`} />)}
              </Grupo>
            )}
          </>
        ),
      }
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
      case 'curva': return {
        titulo: 'Cómo viene el turno', sub: 'Piezas acumuladas, hora a hora',
        cuerpo: p.curva && (
          <Grupo nota="Pasa el mouse o toca el gráfico para ver cualquier momento del turno.">
            {Array.from({ length: Math.floor(finCurva / 60) + 1 }, (_, i) => Math.min((i + 1) * 60, finCurva))
              .filter((mm, i, arr) => arr.indexOf(mm) === i)
              .map((mm) => {
                const h = valorEn(p.curva!.hoy, mm) ?? 0
                const v = p.curva!.previo ? valorEn(p.curva!.previo.curve, mm) : null
                return (
                  <ListCell
                    key={mm}
                    title={p.inicioMs != null ? relojDe(p.inicioMs + mm * 60_000) : `${Math.round(mm / 60)} h`}
                    value={`${int(h)} pz`}
                    valueSub={v != null ? `${firmado(h - v)} vs ${p.curva!.previo!.label}` : undefined}
                  />
                )
              })}
          </Grupo>
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
  })()

  return (
    <div className="monitor-v2 flex flex-col gap-3 lg:gap-4">
      {/* Fila 1 · las cuatro cifras que se miran de lejos */}
      <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${p.ritmoLinea ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <Tarjeta onAbrir={abrir('piezas')} className="col-span-2 lg:col-span-1" icono={<Target className={ic} />} titulo={p.cerrado ? 'Piezas del turno' : 'Piezas ahora'} sub={p.corteHora ? `Shoplogix ${p.corteHora}` : undefined}>
          <Cifra valor={int(p.piezas)} unidad="pz" />
          {p.meta != null && pct != null && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted-foreground/[0.12]">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: 'var(--v2-acento)' }} />
              </div>
              <div className="mt-2 text-[13px] tabular-nums text-muted-foreground">{pct} % de la meta de {int(p.meta)}</div>
            </>
          )}
        </Tarjeta>

        {conProyeccion && (
          <Tarjeta onAbrir={abrir('cierre')} icono={<TrendingUp className={ic} />} titulo="Al cierre" sub="a este ritmo">
            <Cifra valor={int(p.proyeccion!)} unidad="pz" />
            {cierreVsMeta != null && <Contexto tono={cierreVsMeta >= 0 ? 'ok' : 'critical'}>{firmado(cierreVsMeta)} vs meta</Contexto>}
          </Tarjeta>
        )}

        {!p.ritmoLinea && <Tarjeta onAbrir={abrir('ritmo')} icono={<Gauge className={ic} />} titulo="Ritmo" sub={p.ritmoAhora != null ? 'pz/min ahora' : 'pz/min promedio andando'}>
          <Cifra valor={ritmoGrande != null ? dec(ritmoGrande) : '—'} unidad="pz/min" />
          {p.ritmoNecesario != null && ritmoGrande != null
            ? <Contexto tono={ritmoGrande >= p.ritmoNecesario ? 'ok' : 'warning'} nota={p.ritmoAhora != null && p.ritmo != null ? `promedio ${dec(p.ritmo)}` : p.setPoint ? `set ${dec(p.setPoint, 0)}` : undefined}>necesita {dec(p.ritmoNecesario)}</Contexto>
            : p.vsAyer && <Contexto tono={p.vsAyer.diff >= 0 ? 'ok' : 'critical'}>{firmado(p.vsAyer.diff)} pz vs {p.vsAyer.label}</Contexto>}
        </Tarjeta>}

        <Tarjeta iconoSoloPc={!!(conProyeccion && p.ritmoLinea)} onAbrir={abrir('mant')} className={`${conProyeccion && p.ritmoLinea ? 'col-span-1' : 'col-span-2'} ${conProyeccion || p.ritmoLinea ? 'lg:col-span-1' : 'lg:col-span-2'}`} icono={<Wrench className={ic} />} titulo="Respuesta de Mantención" sub="minutos por falla técnica">
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

      {p.ritmoLinea && <div className="v2-clasico v2-ritmo">{p.ritmoLinea}</div>}

      {p.caminoMeta && <div className="v2-clasico">{p.caminoMeta}</div>}

      {/* Fila 2 · la curva del turno y las máquinas */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-4">
        {p.curva && (
          <Tarjeta onAbrir={abrir('curva')} className={p.ritmoLinea ? 'lg:col-span-4' : 'lg:col-span-3'} icono={<TrendingUp className={ic} />} titulo="Cómo viene el turno" sub="piezas acumuladas desde la primera pieza">
            <Curva curva={p.curva} inicioMs={p.inicioMs} />
          </Tarjeta>
        )}
        {!p.ritmoLinea && <Tarjeta onAbrir={abrir('maquinas')} className={p.curva ? '' : 'lg:col-span-4'} icono={<Cpu className={ic} />} titulo="Máquinas" sub={`${corriendo} de ${p.maquinas.length} corriendo`}>
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

      {p.minutoAMinuto && (
        <Tarjeta icono={<Activity className={ic} />} titulo="Velocidad minuto a minuto" sub="piezas contadas por Shoplogix, desde el inicio del turno">
          <MinutoTurnoV2 d={p.minutoAMinuto} cerrado={p.cerrado} />
        </Tarjeta>
      )}

      {/* Fila 3 · Mantención en detalle y a dónde se fue el tiempo */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <Tarjeta onAbrir={abrir('mant')} icono={<Wrench className={ic} />} titulo="Fallas de equipos" sub={p.eventos.length ? `${p.eventos.length} en el turno · ${horas(fallasMin)}` : 'ninguna en el turno'}>
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

        <Tarjeta onAbrir={abrir('perdido')} icono={<Clock className={ic} />} titulo="Tiempo perdido" sub={p.perdidasMaquina && p.perdidasMaquina.maquinas > 1 ? `minutos de línea: ${int(p.perdidasMaquina.min)} min de máquina ÷ ${p.perdidasMaquina.maquinas}` : 'minutos de línea, por dueño y causa'}>
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

      {p.vista >= 1 && <MasDelTurnoV2 mas={p.mas} inicioMs={p.inicioMs} cerrado={p.cerrado} />}

      <BotonDetalle vista={p.vista} onVista={p.onVista} />

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
  horas: HourlyRow[]
  /** pz/h que pide la meta, para la línea de referencia de «hora por hora». */
  metaPorHora: number | null
  vista: VistaV2
  onVista: (v: VistaV2) => void
}

type ClaveAnalisis = 'pareto' | 'semanas' | 'horas'

export function MonitorV2Analisis(p: MonitorV2AnalisisProps) {
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
        titulo: 'De quién fue la pérdida', sub: 'Minutos de línea por semana',
        cuerpo: (
          <>
            {p.semanas.slice().reverse().map((s) => (
              <Grupo key={s.semana} titulo={`Semana del ${semanaCorta(s.semana)} · ${s.turnos} turnos · ${int(s.piezas)} pz`}>
                {DUENOS.map((d) => (
                  <ListCell
                    key={d}
                    leading={<Punto color={RELLENO[d]} />}
                    title={DUENO_UI[d].corto}
                    subtitle={s.causas[d].slice(0, 3).map((c) => c.causa).join(' · ') || undefined}
                    value={horas(s.min[d])}
                    valueSub={`≈${int(s.pz[d])} pz`}
                  />
                ))}
              </Grupo>
            ))}
          </>
        ),
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
    <div className="monitor-v2 flex flex-col gap-3 lg:gap-4">
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

export function CabeceraV2({ titulo, area, estado, tema, cambioLinea, navTurnos, sub, pestana, onPestana, onModoTv }: {
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
  onModoTv?: () => void
}) {
  const ancho = 'mx-auto max-w-3xl px-3 lg:max-w-[1500px] lg:px-4 2xl:max-w-[1840px]'
  return (
    <>
      <div className="v2-cabecera sticky top-0 z-20 pt-3">
        <div className={ancho}>
          <div className="v2-barra flex h-14 items-center gap-2.5 rounded-full pl-2 pr-2">
            <Icono grande><Cpu className="h-4 w-4" /></Icono>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight">{titulo}</div>
              {area && <div className="truncate text-[12px] text-muted-foreground">{area}</div>}
            </div>
            <span className="hidden sm:inline-flex">{estado}</span>
            <div className="ml-auto hidden lg:block">{cambioLinea}</div>
            <span className="ml-auto inline-flex lg:ml-0">{tema}</span>
          </div>
        </div>
      </div>
      <div className={`${ancho} pt-5 lg:pt-7`}>
        <div className="mb-3 sm:hidden">{estado}</div>
        <div className="mb-4 lg:hidden">{cambioLinea}</div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 px-1">
            <h1 className="text-[34px] font-semibold leading-none tracking-tight lg:text-[44px]">{pestana === 'turno' ? 'El turno' : 'Análisis'}</h1>
            <p className="mt-2 text-[15px] tabular-nums text-muted-foreground first-letter:uppercase">{sub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {navTurnos}
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
            {onModoTv && (
              <button type="button" onClick={onModoTv} className="v2-boton-fuerte tap-44 hidden items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium lg:inline-flex">
                <Tv className="h-4 w-4" /> Modo TV
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── «Ver más del turno»: lo que antes vivía en el análisis completo ─────────

export interface MasDelTurno {
  cascada: Cascada | null
  tiempo: { windowMin: number; producingMin: number; plannedMin: number; recoverableMin: number } | null
  /** pz/min de cada máquina por tramo de 5 min, desde la primera pieza. */
  velocidad: Array<{ nombre: string; cpm: number[]; objetivo: number | null; ahora: number | null; promedio: number | null }> | null
  /** Otros días comparados a la misma altura del turno (o completos, cerrado). */
  comparado: Array<{ label: string; piezas: number; hoy: boolean }> | null
}

/** «Dónde se fueron las piezas»: cascada horizontal, cada pérdida cuelga de lo que quedaba. */
function CascadaV2({ c }: { c: Cascada }) {
  const { activo, en, salir } = useActivo()
  let resto = c.capacidad
  const filas = c.pasos.map((paso) => {
    if (paso.clave === 'capacidad' || paso.clave === 'producido') return { paso, desde: 0, hasta: Math.abs(paso.piezas) }
    const hasta = resto
    resto = resto + paso.piezas
    return { paso, desde: resto, hasta }
  })
  const color = (k: string) => (k === 'capacidad' ? 'var(--v2-secundaria)' : k === 'producido' ? 'var(--v2-acento)' : k === 'vacias' ? 'var(--v2-ext)' : 'var(--v2-mant)')
  return (
    <ul className="mt-4 space-y-3" {...salir}>
      {filas.map(({ paso, desde, hasta }, i) => (
        <li key={paso.clave} className="cursor-pointer" {...en(i)}>
          <div className="flex items-baseline justify-between gap-3 text-[15px]">
            <span className="min-w-0 truncate text-foreground">{paso.etiqueta}</span>
            <span className={`shrink-0 tabular-nums ${paso.piezas < 0 ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{paso.piezas < 0 ? firmado(paso.piezas) : int(paso.piezas)} pz</span>
          </div>
          <div className="relative mt-1.5 h-3 rounded-full bg-muted-foreground/[0.08]">
            <div className="absolute inset-y-0 rounded-full transition-opacity" style={{ left: `${(desde / c.capacidad) * 100}%`, width: `${Math.max(0.8, ((hasta - desde) / c.capacidad) * 100)}%`, background: color(paso.clave), opacity: activo != null && activo !== i ? 0.4 : 1 }} />
          </div>
          {activo === i && (paso.minutos != null || paso.veces != null) && (
            <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">
              {paso.minutos != null ? horas(paso.minutos) : ''}{paso.veces != null ? ` · ${paso.veces} ${paso.veces === 1 ? 'vez' : 'veces'}` : ''}
            </div>
          )}
        </li>
      ))}
    </ul>
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

/** Una mini curva por máquina: la que se queda atrás se ve sin leer números. */
function VelocidadMaquinaV2({ m, inicioMs }: { m: NonNullable<MasDelTurno['velocidad']>[number]; inicioMs: number | null }) {
  const [i, setI] = useState<number | null>(null)
  const n = m.cpm.length
  const max = Math.max(1, m.objetivo ?? 0, ...m.cpm) * 1.1
  const X = (k: number) => (n > 1 ? (k / (n - 1)) * 100 : 0)
  const Y = (v: number) => 100 - (v / max) * 100
  // Mismo «ahora» y «promedio» que la tarjeta Máquinas; la curva es el detalle cada 5 min.
  const ahora = m.ahora ?? m.cpm[n - 1] ?? null
  const v = i != null ? m.cpm[i] : null
  const indice = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))
  }
  return (
    <div className="v2-subtarjeta rounded-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-medium">{m.nombre}</span>
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">promedio {m.promedio != null ? dec(m.promedio) : '—'}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="v2-cifra-chica tabular-nums font-semibold leading-none">{ahora != null ? dec(ahora) : '—'}</span>
        <span className="text-[13px] text-muted-foreground">{m.ahora != null ? 'pz/min ahora' : 'pz/min último tramo'}</span>
      </div>
      <div
        className="relative mt-3 h-16 touch-pan-y lg:h-20"
        onPointerMove={(e) => setI(indice(e))}
        onPointerDown={(e) => { e.stopPropagation(); setI(indice(e)) }}
        onClick={(e) => e.stopPropagation()}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setI(null) }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {m.objetivo != null && <line x1={0} x2={100} y1={Y(m.objetivo)} y2={Y(m.objetivo)} stroke="var(--v2-tenue)" strokeDasharray="3 5" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          <path d={suave(m.cpm.map((c, k) => [X(k), Y(c)] as [number, number]))} fill="none" stroke="var(--v2-acento)" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {i != null && v != null && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px" style={{ left: `${X(i)}%`, background: 'var(--v2-tenue)' }} />
            <Globo x={X(i)}>
              <div className="font-medium tabular-nums">{inicioMs != null ? relojDe(inicioMs + i * 5 * 60_000) : `tramo ${i + 1}`}</div>
              <div className="tabular-nums text-muted-foreground">{dec(v)} pz/min{m.objetivo != null ? ` · objetivo ${dec(m.objetivo, 0)}` : ''}</div>
            </Globo>
          </>
        )}
      </div>
    </div>
  )
}

function MasDelTurnoV2({ mas, inicioMs, cerrado }: { mas: MasDelTurno; inicioMs: number | null; cerrado: boolean }) {
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
        <p className="text-[15px] text-muted-foreground">Dónde se fueron las piezas, cómo se usó el tiempo y cómo anda cada máquina</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        {c && (
          <Tarjeta icono={<Filter className={ic} />} titulo="Dónde se fueron las piezas" sub={`capacidad a ${dec(c.ritmoMaquina, 0)} pz/min · ${horas(c.minutosEnMarcha + c.minutosDetenida)}`}>
            <Cifra valor={int(c.perdido)} unidad="pz no hechas" chica />
            <Contexto tono="info" nota={`parado ${int(c.perdidoParado)} · andando ${int(c.perdidoAndando)}`}>{Math.round(c.silletasLlenasPor100)} de cada 100 silletas con pieza</Contexto>
            <CascadaV2 c={c} />
          </Tarjeta>
        )}
        {t && (
          <Tarjeta icono={<Clock className={ic} />} titulo="Tiempo del turno" sub={`${horas(t.windowMin)} ${cerrado ? 'de turno' : 'transcurridos'}`}>
            <Cifra valor={`${Math.round((t.producingMin / Math.max(1, t.windowMin)) * 100)} %`} unidad="del tiempo produciendo" chica />
            <TiempoV2 t={t} />
          </Tarjeta>
        )}
      </div>

      {mas.velocidad && mas.velocidad.length > 1 && (
        <Tarjeta icono={<Gauge className={ic} />} titulo="Velocidad por máquina" sub="pz/min cada 5 minutos · punteada: objetivo">
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mas.velocidad.map((m) => <VelocidadMaquinaV2 key={m.nombre} m={m} inicioMs={inicioMs} />)}
          </div>
        </Tarjeta>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        {comp.length > 1 && (
          <Tarjeta icono={<CalendarRange className={ic} />} titulo="Comparado con otros días" sub={cerrado ? 'turno completo' : 'a esta misma altura del turno'}>
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
