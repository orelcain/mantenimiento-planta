/**
 * Patrón «exprés / ampliado» del monitor v2 (mockup del 27-10, opción A).
 *
 * Cada tarjeta muestra su resumen (exprés) y, si tiene detalle, un botón «Ampliar» en el encabezado. En PC
 * (lg+) el detalle abre en una CAPA del ancho de 2 columnas (880 px) sobre la grilla, pegada al borde de la
 * tarjeta que la abre (desde la columna principal crece a la derecha; desde el riel, a la izquierda). Crece con
 * `transform` desde el rectángulo de la tarjeta (FLIP, resorte de 350 ms): no mueve nada de la grilla y se
 * cierra devolviendo la vista exactamente como estaba. En celular es una hoja desde abajo (`Sheet`).
 *
 * Aquí también viven los primitivos compartidos por las tarjetas (`Tarjeta`, `Globo`, `Icono`) y `AnilloMeta`
 * (el único que anima `stroke-dashoffset`). Los hooks (`useCuentaCifra`, `useEntradaEscalonada`, `useEsPc`…) están
 * en `ampliarHooks.ts`. Todo respeta `prefers-reduced-motion`.
 */
import { Info, Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from '@/components/piel'
import { AbrirCtx, CapaCtx, useEsPc, useMovimientoReducido } from './ampliarHooks'


// ── Primitivos de tarjeta ────────────────────────────────────────────────────

export function Icono({ children, grande }: { children: ReactNode; grande?: boolean }) {
  return <span className={`v2-icono inline-flex shrink-0 items-center justify-center rounded-full ${grande ? 'h-10 w-10' : 'h-7 w-7'}`}>{children}</span>
}

/** Globo del gráfico, posicionado en % del ancho y acotado para no salirse. */
export function Globo({ x, children }: { x: number; children: ReactNode }) {
  const left = Math.min(82, Math.max(18, x))
  return (
    <div className="v2-tip pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-ctl px-3 py-2 text-[13px] leading-snug" style={{ left: `${left}%` }}>
      {children}
    </div>
  )
}

export interface TarjetaProps {
  icono?: ReactNode
  titulo: string
  sub?: string
  children: ReactNode
  className?: string
  /** Abre el panel lateral de siempre (bajar a una fila puntual). Con `ampliado` no se usa: la tarjeta no es un botón. */
  onAbrir?: () => void
  /** A media pantalla en el celular el ícono le roba el ancho al título: ahí se omite. */
  iconoSoloPc?: boolean
  /** El detalle: da la tarjeta un botón «Ampliar» y abre la capa (PC) o la hoja (celular). */
  ampliado?: ReactNode
  /** Subtítulo de la capa (si no, el de la tarjeta). */
  subAmpliado?: string
  /** Lo que va en el encabezado, a la izquierda del botón «Ampliar» (p. ej. la hora en vivo). */
  derecha?: ReactNode
  /** Una clave que, al CAMBIAR (no al montar), abre el ampliado: «ver ›» de una parada en Camino a la meta. */
  abrirCon?: string | null
  /** El botón «Ampliar» sin rótulo entre 1024 y 1365 px (tarjetas angostas): solo el ícono, el nombre accesible no cambia. */
  compacta?: boolean
  /** Atributos de datos para CSS (p. ej. `data-parada`). */
  datos?: Record<string, string | undefined>
  /** Etiqueta accesible de la tarjeta. */
  etiqueta?: string
}

export function Tarjeta({ icono, titulo, sub, children, className = '', onAbrir, iconoSoloPc, ampliado, subAmpliado, derecha, datos, etiqueta, compacta, abrirCon }: TarjetaProps) {
  const ref = useRef<HTMLElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const [abierta, setAbierta] = useState(false)
  const conAmpliado = ampliado != null
  const previaAbierta = useRef(false)
  /* Abrir por pedido ajeno: espera 400 ms para que la capa/hoja que lo pidió termine de cerrarse (dos hojas a la vez
     dejarían el scroll de la página bloqueado). */
  const claveVista = useRef(abrirCon)
  useEffect(() => {
    if (abrirCon === claveVista.current) return
    claveVista.current = abrirCon
    if (!abrirCon) return
    const id = setTimeout(() => setAbierta(true), 400)
    return () => clearTimeout(id)
  }, [abrirCon])
  /* Al reducir, el foco vuelve al botón que abrió (después de que la capa suelta el resto de la página). */
  useEffect(() => {
    if (previaAbierta.current && !abierta) botonRef.current?.focus({ preventScroll: true })
    previaAbierta.current = abierta
  }, [abierta])

  const tocable = onAbrir && !conAmpliado
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: onAbrir,
        onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } },
        'aria-label': `${titulo}: ver detalle`,
      }
    : {}
  return (
    <section ref={ref} aria-label={etiqueta} className={`v2-tarjeta min-w-0 rounded-card p-4 lg:p-5 ${className}`} {...datos} {...tocable}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icono && <span className={iconoSoloPc ? 'hidden lg:contents' : 'contents'}><Icono>{icono}</Icono></span>}
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-tight text-foreground">{titulo}</h3>
            {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {derecha}
          {conAmpliado && (
            <button
              ref={botonRef}
              type="button"
              onClick={() => setAbierta((a) => !a)}
              aria-expanded={abierta}
              aria-haspopup="dialog"
              aria-label={`Ampliar ${titulo}`}
              className={`v2-amp tap-44${compacta ? " v2-amp-compacta" : ""}`}
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              <span>Ampliar</span>
            </button>
          )}
          {onAbrir && !conAmpliado && <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />}
        </div>
      </div>
      <AbrirCtx.Provider value={conAmpliado ? () => setAbierta(true) : null}>{children}</AbrirCtx.Provider>
      {conAmpliado && (
        <CapaAmpliada
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          origen={ref}
          titulo={titulo}
          sub={subAmpliado ?? sub}
          icono={icono}
        >
          {ampliado}
        </CapaAmpliada>
      )}
    </section>
  )
}

// ── La capa ampliada ─────────────────────────────────────────────────────────

const ANCHO_CAPA = 880
const MARGEN = 16
/** Riel lateral (56) + aire: la capa nunca lo tapa. */
const IZQ_MIN = 72
/** Cabecera de 56 px + aire: la capa nunca la tapa. */
const SUP_MIN = 64
const RESORTE = 'cubic-bezier(0.34, 1.3, 0.5, 1)'
const SUAVE = 'cubic-bezier(0.32, 0.72, 0, 1)'

const FOCOS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'


export interface CapaAmpliadaProps {
  abierta: boolean
  onCerrar: () => void
  /** La tarjeta que la abre: de su rectángulo nace y a él vuelve. */
  origen: RefObject<HTMLElement | null>
  titulo: string
  sub?: string
  icono?: ReactNode
  children: ReactNode
}

/**
 * PC (lg+): capa de 880 px sobre la grilla con animación FLIP. Celular: hoja desde abajo.
 * Esc, clic afuera y «Reducir» cierran; el foco queda atrapado adentro y vuelve al botón.
 */
export function CapaAmpliada(p: CapaAmpliadaProps) {
  const pc = useEsPc()
  if (!pc) {
    return (
      <Sheet
        open={p.abierta}
        onClose={p.onCerrar}
        title={p.titulo}
        description={p.sub}
        /* Siempre agrupada: es la hoja de altura acotada (85 dvh) con el cuerpo desplazable; la de tarjeta crece sin tope. */
        surface="grouped"
        headerAction={<button type="button" onClick={p.onCerrar} className="v2-amp tap-44" aria-label={`Reducir ${p.titulo}`}><Minimize2 className="h-3.5 w-3.5" aria-hidden /><span>Reducir</span></button>}
      >
        <CapaCtx.Provider value={p.onCerrar}><div className="v2-vars v2-piel space-y-5 pb-4">{p.children}</div></CapaCtx.Provider>
      </Sheet>
    )
  }
  return <CapaPc {...p} />
}

function CapaPc({ abierta, onCerrar, origen, titulo, sub, icono, children }: CapaAmpliadaProps) {
  const reducido = useMovimientoReducido()
  const [montada, setMontada] = useState(abierta)
  const capaRef = useRef<HTMLDivElement>(null)
  const reducirRef = useRef<HTMLButtonElement>(null)
  const idTitulo = useId()
  /* Lo último que se vio de la capa abierta: el cierre vuelve al rectángulo ACTUAL de la tarjeta. */
  const anim = useRef<Animation[]>([])

  useEffect(() => { if (abierta) setMontada(true) }, [abierta])

  /* Abrir: se mide, se ubica pegada a la tarjeta y se anima desde su rectángulo (antes de pintar). */
  useLayoutEffect(() => {
    const el = capaRef.current
    const card = origen.current
    if (!abierta || !montada || !el || !card) return
    const r = card.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const ancho = Math.min(ANCHO_CAPA, vw - IZQ_MIN - MARGEN)
    el.style.width = `${ancho}px`
    el.style.maxHeight = `${vh - SUP_MIN - MARGEN}px`
    const alto = Math.min(el.offsetHeight, vh - SUP_MIN - MARGEN)
    const desdeRiel = r.left + r.width / 2 > vw / 2
    const left = Math.max(IZQ_MIN, Math.min(desdeRiel ? r.right - ancho : r.left, vw - MARGEN - ancho))
    const top = Math.max(SUP_MIN, Math.min(r.top, vh - MARGEN - alto))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    /* Si el contenido crece estando abierta (cambia el selector, llega un dato), no se sale por abajo: scroll interno. */
    el.style.maxHeight = `${vh - top - MARGEN}px`
    el.style.visibility = 'visible'
    card.setAttribute('data-origen', '')
    document.documentElement.setAttribute('data-v2-capa', '')
    const cuerpo = el.querySelector<HTMLElement>('[data-capa-cuerpo]')
    if (reducido) {
      anim.current = [el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' })]
    } else {
      const desde = `translate(${r.left - left}px, ${r.top - top}px) scale(${r.width / ancho}, ${r.height / alto})`
      anim.current = [
        el.animate([{ transform: desde }, { transform: 'none' }], { duration: 350, easing: RESORTE }),
        el.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' }),
        ...(cuerpo ? [cuerpo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 110, easing: 'ease-out', fill: 'backwards' })] : []),
      ]
    }
    reducirRef.current?.focus({ preventScroll: true })
    return () => {
      /* Cerrar (o desmontar): la página vuelve a verse completa al instante; la capa se encoge sola. */
      document.documentElement.removeAttribute('data-v2-capa')
    }
  }, [abierta, montada, origen, reducido])

  /* Cerrar: la capa se encoge al rectángulo actual de la tarjeta y recién ahí se desmonta. */
  useLayoutEffect(() => {
    const el = capaRef.current
    const card = origen.current
    if (abierta || !montada || !el) return
    const terminar = () => {
      card?.removeAttribute('data-origen')
      setMontada(false)
    }
    anim.current.forEach((a) => a.cancel())
    if (!card) { terminar(); return }
    if (reducido) {
      const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' })
      a.onfinish = terminar
      return
    }
    const r = card.getBoundingClientRect()
    const c = el.getBoundingClientRect()
    const hacia = `translate(${r.left - c.left}px, ${r.top - c.top}px) scale(${r.width / c.width}, ${r.height / c.height})`
    const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: hacia, opacity: 0.6 }], { duration: 280, easing: SUAVE, fill: 'forwards' })
    a.onfinish = terminar
  }, [abierta, montada, origen, reducido])

  /* Si la ventana cambia de tamaño con la capa abierta, la geometría medida ya no vale: se cierra. */
  useEffect(() => {
    if (!abierta) return
    const f = () => onCerrar()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [abierta, onCerrar])

  /* El resto de la app queda inerte (ni Tab ni lectores de pantalla entran) mientras la capa está abierta. */
  useEffect(() => {
    if (!abierta) return
    const raiz = document.getElementById('root')
    raiz?.setAttribute('inert', '')
    return () => raiz?.removeAttribute('inert')
  }, [abierta])

  useEffect(() => {
    if (!abierta) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [abierta, onCerrar])

  useEffect(() => () => {
    document.documentElement.removeAttribute('data-v2-capa')
    origen.current?.removeAttribute('data-origen')
  }, [origen])

  if (!montada) return null

  /* Foco atrapado: Tab y Mayús+Tab giran dentro de la capa. */
  const teclas = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const l = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCOS)).filter((x) => x.offsetParent !== null)
    if (!l.length) return
    const a = l[0]!
    const z = l[l.length - 1]!
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
  }

  return createPortal(
    <div className="v2-capa-raiz v2-vars v2-piel">
      <div className="v2-capa-velo" onClick={onCerrar} aria-hidden />
      <div
        ref={capaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onKeyDown={teclas}
        className="v2-capa"
        style={{ visibility: 'hidden', left: 0, top: 0 }}
      >
        <div data-capa-cuerpo className="v2-capa-interior">
          <div className="v2-capa-cabecera">
            <div className="flex min-w-0 items-center gap-2.5">
              {icono && <Icono grande>{icono}</Icono>}
              <div className="min-w-0">
                <h2 id={idTitulo} className="text-[17px] font-semibold leading-tight text-foreground">{titulo}</h2>
                {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
              </div>
            </div>
            <button ref={reducirRef} type="button" onClick={onCerrar} className="v2-amp tap-44" aria-label={`Reducir ${titulo}`}>
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              <span>Reducir</span>
            </button>
          </div>
          <CapaCtx.Provider value={onCerrar}><div className="v2-capa-cuerpo">{children}</div></CapaCtx.Provider>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Anillo de avance a la meta ───────────────────────────────────────────────

/**
 * Anillo de cumplimiento de meta. ÚNICO elemento del monitor que anima `stroke-dashoffset` (1,1 s, una vez al
 * montar y suave en cada cambio): es un SVG de ~44 px, el costo de pintura es despreciable y no hay otra forma
 * de animar un arco. Con reducir movimiento nace ya lleno hasta su valor, sin animación.
 */
export function AnilloMeta({ frac, tam = 44, rotulo }: { frac: number; tam?: number; rotulo: string }) {
  const reducido = useMovimientoReducido()
  const [listo, setListo] = useState(reducido)
  useEffect(() => {
    if (reducido) { setListo(true); return }
    const id = setTimeout(() => setListo(true), 200)
    return () => clearTimeout(id)
  }, [reducido])
  const r = 18
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, frac))
  return (
    <span className="v2-anillo relative inline-flex shrink-0" style={{ width: tam, height: tam }} role="img" aria-label={rotulo}>
      <svg viewBox="0 0 44 44" width={tam} height={tam} className="-rotate-90">
        <circle cx={22} cy={22} r={r} fill="none" strokeWidth={5} style={{ stroke: 'var(--v2-relleno)' }} />
        <circle
          cx={22} cy={22} r={r} fill="none" strokeWidth={5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={listo ? c * (1 - f) : c}
          className="v2-anillo-pr" style={{ stroke: 'var(--v2-bien)' }}
        />
      </svg>
      <b className="absolute inset-0 grid place-items-center text-[11.5px] font-bold tabular-nums text-foreground">{Math.round(frac * 100)}%</b>
    </span>
  )
}
