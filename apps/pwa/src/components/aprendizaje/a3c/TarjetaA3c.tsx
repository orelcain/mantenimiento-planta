/**
 * Tarjeta A3C · BAADER 142 — la herramienta completa (mockup v5 aprobado).
 *
 * Teléfono (una mano): lienzo Máquina | Tarjeta con pellizco, arrastre, atajos y + / − de
 * 44 px; debajo, «qué LED prende» siempre visible, la regleta X5 recorrible y la ficha en
 * una hoja inferior con buscador. Un toque ambiguo acerca en vez de adivinar.
 * PC: tarjeta completa (vertical, como en la placa) + plano de ubicación + ficha a la vez,
 * a todo el ancho y alto útil de la ventana (ver `distribuirPc`); el mouse muestra la señal y
 * un clic en un dibujo mueve el otro.
 *
 * Recibe el paquete ya cargado (la página lo pide); así se prueba sin red.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, Minus, Plus, Search } from 'lucide-react'
import { Button, ListCell, ListGroup, SegmentedControl, Sheet } from '@/components/piel'
import { cargarPlacaA3c, type Hoja, type PaqueteA3c, type PaquetePlaca, type Texto } from '@/data/baader142A3c'
import {
  altoBornePlaca,
  focoPlaca,
  guardarVistaTarjeta,
  leerVistaTarjeta,
  ledsGrupoPlaca,
  ledsPlaca,
  lineaEnPlaca,
  limitesPlaca,
  objetivosPlaca,
  presetsPlaca,
  zonaPlaca,
  type VistaTarjeta,
} from '@/utils/aprendizaje/a3cPlaca'
import { cn } from '@/lib/utils'
import {
  buscar,
  centroRect,
  claveDeBorne,
  construirModelo,
  describir,
  elegirEn,
  guardarIdioma,
  leerIdioma,
  lineaLed,
  objetivosHoja22,
  objetivosHoja23,
  puntoFoco,
  puntosGrupo,
  puntosLed,
  resolverToqueAmbiguo,
  type ClaveSel,
  type Idioma,
  type LimitesCamara,
} from '@/utils/aprendizaje/a3c'
import { LienzoA3c, type LienzoA3cHandle } from './LienzoA3c'
import {
  ALTO_DIVISOR,
  ALTO_MIN_PC,
  ANCHO_REGLETA_PC,
  MARGEN_INF_PC,
  SOLAPE_DIVISOR,
  UBICACION_MIN,
  distribuirPc,
} from './distribucionPc'
import { FranjaLed } from './FranjaLed'
import { RegletaX5 } from './RegletaX5'
import { FichaA3c, ListaA3c } from './FichaA3c'
import { QuizA3c } from './QuizA3c'
import './a3c.css'

const LIM22: LimitesCamara = { minW: 70, maxW: 2200, bounds: [40, 45, 1080, 675] }
const LIM23: LimitesCamara = { minW: 50, maxW: 2000, bounds: [-60, 0, 780, 1131] }
const FUENTE = 'Plano 142.71.00.888, hojas 22 y 23 · máquinas N2 y N3'
const FUENTE_PLACA = 'Placa de la N2 (Línea 2), dibujada desde foto; mismo plano 142.71.00.888 que la N3'
/** 44 px en px, no en rem: en PC la raíz es de 14 px y el `h-11` del control quedaría en 38,5 px. */
const ALTO_44 = 'h-[44px] [&>button]:h-[44px]'
/** La placa no lleva textos de la app: sus rótulos vienen dibujados en el SVG. */
const SIN_TEXTOS: Texto[] = []

const CLAVE_DIVISION = 'a3c-pc-ubicacion'

/**
 * Distancia del borde superior de `el` al tope de la página SIN scroll: su posición en pantalla
 * más todo lo desplazado por la ventana y por sus contenedores. No depende del alto de ningún
 * contenedor (un `main` de alto automático mediría el propio contenido y realimentaría la medida).
 */
function topeSinScroll(el: HTMLElement): number {
  let top = el.getBoundingClientRect().top + window.scrollY
  for (let p = el.parentElement; p; p = p.parentElement) top += p.scrollTop
  return top
}

/** Fracción del alto útil que la persona dejó para el plano de ubicación (null = por defecto). */
function leerDivision(): number | null {
  try {
    const v = Number(localStorage.getItem(CLAVE_DIVISION))
    return v > 0 && v < 1 ? v : null
  } catch {
    return null
  }
}
function guardarDivision(f: number) {
  try {
    localStorage.setItem(CLAVE_DIVISION, f.toFixed(3))
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

type Modo = 'explorar' | 'practicar'
/** Lo que se dibuja en un lienzo: una hoja del plano o la placa. */
type Lamina = Hoja | 'placa'

/**
 * Hacia dónde quedan los textos de una regleta respecto de su LED: en las de arriba del
 * plano (x < 360) el LED va a la izquierda y el texto a la derecha; en las de abajo, al
 * revés. La cámara se corre hacia el texto para que el LED y su rótulo entren juntos.
 */
const ladoTextos = (x: number) => (x > 360 ? -1 : 1)
type Origen = Lamina | 'regleta' | 'lista' | null

export interface TarjetaA3cProps {
  paquete: PaqueteA3c
  /** Dibujo de la placa ya cargado (pruebas). Sin esto se pide al elegir «Placa». */
  placa?: PaquetePlaca
  onVolver: () => void
  etiquetaVolver: string
  /** Fuerza el diseño (pruebas). Sin esto se mide el ancho real del contenedor. */
  dosColumnas?: boolean
  /** Fuerza el modo táctil en el diseño de PC (pruebas). Sin esto se lee `(pointer: coarse)`. */
  tactil?: boolean
}

/** ¿El puntero principal es táctil? Sigue los cambios (tablet con teclado, convertibles). */
function usePunteroGrueso(): boolean {
  const consulta = () => (typeof window !== 'undefined' ? window.matchMedia?.('(pointer: coarse)') : undefined)
  const [grueso, setGrueso] = useState(() => !!consulta()?.matches)
  useEffect(() => {
    const mq = consulta()
    if (!mq) return
    const f = () => setGrueso(mq.matches)
    f()
    mq.addEventListener?.('change', f)
    return () => mq.removeEventListener?.('change', f)
  }, [])
  return grueso
}

export function TarjetaA3c({ paquete, placa: placaDada, onVolver, etiquetaVolver, dosColumnas: forzado, tactil }: TarjetaA3cProps) {
  const { datos, dibujo } = paquete
  const m = useMemo(() => construirModelo(datos), [datos])
  const obj22 = useMemo(() => objetivosHoja22(m), [m])
  const obj23 = useMemo(() => objetivosHoja23(m), [m])

  // Dos columnas según el ancho REAL del contenido (con o sin barra lateral), no la ventana.
  const raizRef = useRef<HTMLDivElement>(null)
  const [medido, setMedido] = useState(false)
  useLayoutEffect(() => {
    const el = raizRef.current
    if (!el || forzado !== undefined) return
    const medir = () => setMedido(el.clientWidth >= 960)
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [forzado])
  const pc = forzado ?? medido
  const punteroGrueso = usePunteroGrueso()
  // Táctil = teléfono (una columna) o cualquier pantalla con puntero grueso, aunque quepan dos columnas:
  // radios de toque, atajos y zoom de 44 px y desambiguación por zoom/lista.
  const grueso = !pc || (tactil ?? punteroGrueso)

  const [modo, setModo] = useState<Modo>('explorar')

  // PC: alto útil MEDIDO (alto de la ventana menos lo que hay sobre la grilla) y ancho real.
  const grillaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState<{ ancho: number; alto: number } | null>(null)
  useLayoutEffect(() => {
    const el = grillaRef.current
    if (!pc || modo !== 'explorar' || !el) return
    const medir = () => {
      const alto = Math.round(window.innerHeight - topeSinScroll(el) - MARGEN_INF_PC)
      const nuevo = { ancho: Math.round(el.clientWidth), alto: Math.max(ALTO_MIN_PC, alto) }
      setArea(a => (a && a.ancho === nuevo.ancho && a.alto === nuevo.alto ? a : nuevo))
    }
    medir()
    window.addEventListener('resize', medir)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    ro?.observe(el)
    return () => {
      window.removeEventListener('resize', medir)
      ro?.disconnect()
    }
  }, [pc, modo])
  const dist = area && area.ancho > 0 ? distribuirPc(area.ancho, area.alto) : null
  // División plano de ubicación | ficha, ajustable y recordada como fracción del alto útil.
  const [division, setDivision] = useState<number | null>(leerDivision)
  const altoUbic = dist && area
    ? Math.round(Math.min(dist.maxUbicacion, Math.max(UBICACION_MIN, division != null ? division * area.alto : dist.altoUbicacion)))
    : 340
  const fijarUbicacion = (px: number) => {
    if (!area || !dist) return
    const v = Math.min(dist.maxUbicacion, Math.max(UBICACION_MIN, px))
    const f = v / area.alto
    setDivision(f)
    guardarDivision(f)
  }
  const arrastreDivisor = useRef<{ id: number; y: number; alto: number } | null>(null)
  const [idioma, setIdiomaEstado] = useState<Idioma>(leerIdioma)
  const setIdioma = (i: Idioma) => {
    setIdiomaEstado(i)
    guardarIdioma(i)
  }
  const [sel, setSel] = useState<ClaveSel>('e:B4')
  const [selN, setSelN] = useState<number | null>(45)
  const [hoja, setHoja] = useState<Hoja>('22')
  const [preset22, setPreset22] = useState<string | null>(null)
  const [preset23, setPreset23] = useState<string | null>(null)
  const [hov, setHov] = useState<{ clave: ClaveSel; n?: number } | null>(null)
  const [consulta, setConsulta] = useState('')
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [resultadosPc, setResultadosPc] = useState(false)
  /** Elementos que comparten sitio en el plano: la persona elige cuál quería (toque ambiguo). */
  const [ambiguos, setAmbiguos] = useState<ClaveSel[] | null>(null)

  // ─── Vista de la tarjeta: Plano (hoja 23) | Placa (dibujo desde foto, se pide al elegirla) ───
  const [vista, setVistaEstado] = useState<VistaTarjeta>(leerVistaTarjeta)
  const [placaCargada, setPlacaCargada] = useState<PaquetePlaca | null>(null)
  const [errorPlaca, setErrorPlaca] = useState(false)
  const [intentoPlaca, setIntentoPlaca] = useState(0)
  const [presetP, setPresetP] = useState<string | null>(null)
  const placa = placaDada ?? placaCargada
  const verPlaca = vista === 'placa'
  useEffect(() => {
    if (!verPlaca || placa) return
    let vivo = true
    setErrorPlaca(false)
    cargarPlacaA3c().then(
      p => vivo && setPlacaCargada(p),
      () => vivo && setErrorPlaca(true),
    )
    return () => {
      vivo = false
    }
  }, [verPlaca, placa, intentoPlaca])
  const presetsP = useMemo(() => (placa ? presetsPlaca(placa.geo) : null), [placa])
  const limP = useMemo(() => (placa ? limitesPlaca(placa.geo) : null), [placa])
  const objP = useMemo(() => (placa ? objetivosPlaca(m, placa.geo) : []), [m, placa])
  const altoP = useMemo(() => (placa ? altoBornePlaca(placa.geo) : 10), [placa])

  const v22 = useRef<LienzoA3cHandle>(null)
  const v23 = useRef<LienzoA3cHandle>(null)
  const vP = useRef<LienzoA3cHandle>(null)
  const tipP = useRef<HTMLDivElement>(null)
  const placaHost = useRef<HTMLDivElement>(null)
  const regletaRef = useRef<HTMLDivElement>(null)
  const tip22 = useRef<HTMLDivElement>(null)
  const tip23 = useRef<HTMLDivElement>(null)
  const pendiente = useRef<(() => void) | null>(null)
  const ultimoOrigen = useRef<Origen>(null)

  const item = useMemo(() => describir(m, sel, idioma) ?? describir(m, 'e:B4', idioma)!, [m, sel, idioma])
  const linea = useMemo(() => lineaLed(item), [item])
  const leds = useMemo(() => puntosLed(m, item), [m, item])
  const grupo = useMemo(() => puntosGrupo(m, item), [m, item])
  const elegidos = useMemo(() => new Set([...item.bornes, ...(selN != null ? [selN] : [])]), [item, selN])
  const encendidos = useMemo(() => new Set(item.grupoBits ? [] : item.leds), [item])
  const enGrupo = useMemo(() => new Set(item.grupoBits ? item.leds : []), [item])
  const grupos = useMemo(() => buscar(m, consulta, idioma), [m, consulta, idioma])
  const ledsP = useMemo(() => (placa ? ledsPlaca(placa.geo, item) : []), [placa, item])
  const grupoP = useMemo(() => (placa ? ledsGrupoPlaca(placa.geo, item) : []), [placa, item])
  // En «Placa» la franja dice si lo elegido no está en el dibujo; entonces «Ver» lleva al plano.
  const lineaVista = useMemo(
    () => (verPlaca && placa ? lineaEnPlaca(linea, placa.geo, item) : { ...linea, soloPlano: false }),
    [verPlaca, placa, linea, item],
  )

  // En la placa, el LED y el borne elegidos se marcan también en el propio dibujo (atributos
  // sobre sus grupos `led-X5-n` o `led-estado-k` / `borne-X5-n`): el CSS los resalta y queda verificable. Corre
  // en cada render porque el lienzo puede montarse de nuevo (cambio de diseño o de lámina).
  useEffect(() => {
    const host = placaHost.current
    if (!host) return
    host.querySelectorAll('[data-encendido],[data-grupo],[data-elegido]').forEach(e => {
      e.removeAttribute('data-encendido')
      e.removeAttribute('data-grupo')
      e.removeAttribute('data-elegido')
    })
    for (const l of ledsP) host.querySelector(`#${l.svgId}`)?.setAttribute('data-encendido', '')
    for (const l of grupoP) host.querySelector(`#${l.svgId}`)?.setAttribute('data-grupo', '')
    for (const n of elegidos) host.querySelector(`#borne-X5-${n}`)?.setAttribute('data-elegido', '')
  })

  /** Encuadre de la placa: entre el LED y su borne (quedan lado a lado), con pulso en el LED. */
  const enfocarPlaca = useCallback((clave: ClaveSel, origen: Origen) => {
    const c = vP.current
    const it = describir(m, clave, 'es')
    if (!c || !placa || !it) return
    const foco = focoPlaca(placa.geo, it)
    if (!foco) return
    if (origen !== 'placa') {
      const b = it.bornes.map(n => placa.geo.bornes.get(n)).find(Boolean)
      const cx = b ? (foco[0] + b.x + b.w / 2) / 2 : foco[0]
      c.enfocar(cx, foco[1], Math.min(c.camara().w, pc ? 260 : 170))
    }
    c.pulso(foco[0], foco[1])
  }, [m, placa, pc])

  /** Lleva las cámaras a lo elegido (la que originó el toque no se mueve). */
  const enfocar = useCallback((clave: ClaveSel, origen: Origen) => {
    const it = describir(m, clave, 'es')
    if (!it) return
    enfocarPlaca(clave, origen)
    const xy = puntoFoco(m, it)
    const c23 = v23.current
    if (c23 && xy) {
      if (origen !== '23') {
        let w = Math.min(c23.camara().w, pc ? 300 : 190)
        if (it.leds.length > 2) w = Math.max(w, pc ? 260 : 150)
        c23.enfocar(xy[0] + ladoTextos(xy[0]) * w * 0.36, xy[1], w)
      }
      c23.pulso(xy[0], xy[1])
    }
    const c22 = v22.current
    const h0 = it.hotspots[0]
    if (c22 && h0) {
      const [cx, cy] = centroRect(h0)
      if (origen !== '22') c22.enfocar(cx, cy, Math.min(c22.camara().w, pc ? 300 : 200))
      c22.pulso(cx, cy)
    }
  }, [m, pc, enfocarPlaca])

  const seleccionar = useCallback((clave: ClaveSel, origen: Origen, n?: number) => {
    const it = describir(m, clave, 'es')
    setSel(clave)
    setSelN(n ?? it?.bornes[0] ?? null)
    ultimoOrigen.current = origen
    enfocar(clave, origen)
  }, [m, enfocar])

  const elegirBorne = useCallback((n: number, origen: Origen) => seleccionar(claveDeBorne(m, n), origen, n), [m, seleccionar])

  // La regleta sigue a la selección (salvo si el toque vino de ella). Depende del BORNE, no del
  // texto: alternar ES/Original no debe mover la regleta.
  const nRegleta = selN ?? item.bornes[0] ?? null
  useEffect(() => {
    const cont = regletaRef.current
    if (!cont || ultimoOrigen.current === 'regleta') return
    const n = nRegleta
    const celda = n != null ? cont.querySelector<HTMLElement>(`[data-n="${n}"]`) : null
    if (!celda || typeof cont.scrollTo !== 'function') return
    const rc = cont.getBoundingClientRect()
    const rt = celda.getBoundingClientRect()
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // PC: columna vertical; teléfono: tira horizontal.
    if (pc) cont.scrollTo({ top: cont.scrollTop + rt.top - rc.top - rc.height / 2 + rt.height / 2, behavior: suave ? 'smooth' : 'auto' })
    else cont.scrollTo({ left: cont.scrollLeft + rt.left - rc.left - rc.width / 2 + rt.width / 2, behavior: suave ? 'smooth' : 'auto' })
  }, [nRegleta, modo, grueso, pc])

  // Acciones pendientes tras cambiar de lienzo en el teléfono (el nuevo se monta primero).
  useEffect(() => {
    const f = pendiente.current
    pendiente.current = null
    f?.()
  }, [hoja, modo, pc, vista, placa])

  // Al volver de «Practicar» (los lienzos se montan de nuevo) o al cambiar de diseño, la cámara
  // vuelve a lo elegido. Antes de la primera elección se respeta el encuadre inicial.
  const previo = useRef({ modo, pc })
  useEffect(() => {
    const p = previo.current
    if (p.modo === modo && p.pc === pc) return
    previo.current = { modo, pc }
    if (modo === 'explorar' && ultimoOrigen.current !== null) enfocar(sel, null)
  }, [modo, pc, sel, enfocar])

  const verLed = () => {
    const irPlano = () => {
      const xy = puntoFoco(m, item)
      const c = v23.current
      if (!c || !xy) return
      const w = pc ? 260 : 170
      c.enfocar(xy[0] + ladoTextos(xy[0]) * w * 0.36, xy[1], w)
      c.pulso(xy[0], xy[1])
    }
    // Lo elegido no está dibujado en la placa: «Ver en el plano» cambia la vista y lo muestra ahí.
    if (verPlaca && lineaVista.soloPlano) {
      setVistaEstado('plano')
      guardarVistaTarjeta('plano')
      pendiente.current = irPlano
      if (!pc && hoja !== '23') setHoja('23')
      return
    }
    const ir = () => {
      if (verPlaca) {
        const c = vP.current
        const xy = placa && focoPlaca(placa.geo, item)
        if (!c || !xy) return
        c.enfocar(xy[0], xy[1], pc ? 220 : 150)
        c.pulso(xy[0], xy[1])
        return
      }
      irPlano()
    }
    if (!pc && hoja !== '23') {
      pendiente.current = ir
      setHoja('23')
    } else ir()
  }

  const cambiarHoja = (h: Hoja) => {
    if (h === hoja) return
    pendiente.current = () => enfocar(sel, null)
    setHoja(h)
  }

  const enfocarAlCargar = useRef(false)
  /** Plano | Placa: solo cambia el dibujo de la tarjeta; la selección es la misma. */
  const cambiarVista = (v: VistaTarjeta) => {
    if (v === vista) return
    setVistaEstado(v)
    guardarVistaTarjeta(v)
    // Al volver al plano (o si la placa ya está cargada) el nuevo lienzo se lleva a lo elegido;
    // si la placa aún no llega, arranca en la zona del borne elegido (`inicio`).
    if (ultimoOrigen.current === null) return
    if (v === 'plano' || placa) pendiente.current = () => (v === 'placa' ? enfocarPlaca(sel, null) : enfocar(sel, '22'))
    else enfocarAlCargar.current = true
  }
  // Primera vez en «Placa» con algo ya elegido: al llegar el dibujo (su lienzo se monta en el
  // mismo commit) se encuadra lo elegido, no el atajo inicial.
  useEffect(() => {
    if (!placa || !enfocarAlCargar.current) return
    enfocarAlCargar.current = false
    enfocarPlaca(sel, null)
  }, [placa, sel, enfocarPlaca])

  // ─── Toques y hover en los dibujos ───
  const toque23 = (u: [number, number]) => {
    const c = v23.current
    if (!c) return
    const ppu = c.pxPorUnidad()
    const el = elegirEn(obj23, u, (grueso ? 22 : 6) / ppu)
    const primero = el.cerca[0]
    if (!primero) return
    // Táctil: si en el dedo caben dos bornes (celdas de 8,5 u a < 30 px), acerca en vez de adivinar.
    if (grueso && el.distintos > 1 && 8.5 * ppu < 30) {
      c.enfocar(u[0], u[1], c.anchoPx() / 5.2)
      return
    }
    if (primero.o.n != null) elegirBorne(primero.o.n, '23')
    else seleccionar(primero.o.clave, '23')
  }
  const toque22 = (u: [number, number]) => {
    const c = v22.current
    if (!c) return
    const ppu = c.pxPorUnidad()
    const el = elegirEn(obj22, u, (grueso ? 22 : 6) / ppu)
    if (!el.cerca[0]) {
      // Vista completa en táctil: un toque en una zona acerca a esa zona.
      if (grueso && ppu < 0.7) c.preset(u[1] < 400 ? 'modulos' : u[0] < 300 ? 'ciclon' : 'gabinete')
      return
    }
    if (!grueso) {
      // Puntero fino: los que comparten la misma zona (S20..S25) no se adivinan; se pregunta cuál.
      const r = resolverToqueAmbiguo(el.cerca, ppu, false, 1)
      if (r?.tipo === 'lista') setAmbiguos(r.claves)
      else seleccionar(el.cerca[0].o.clave, '22')
      return
    }
    // Táctil: si varios elementos caben bajo el dedo, acerca; en el límite del zoom elige el más
    // cercano y, si siguen empatados (S20..S25 están en el mismo sitio), pregunta cuál.
    const w = c.camara().w
    const r = resolverToqueAmbiguo(el.cerca, ppu, w > LIM22.minW * 1.02)
    if (!r) return
    if (r.tipo === 'acercar') c.enfocar(u[0], u[1], Math.max(LIM22.minW, Math.min(w * 0.5, 200)))
    else if (r.tipo === 'lista') setAmbiguos(r.claves)
    else seleccionar(r.clave, '22')
  }

  const mostrarTip = (tip: HTMLDivElement | null, texto: ReactNode | null, ev?: { x: number; y: number }) => {
    if (!tip) return
    const host = tip.parentElement
    if (!texto || !ev || !host) {
      tip.hidden = true
      return
    }
    const r = host.getBoundingClientRect()
    tip.hidden = false
    const ancho = tip.offsetWidth || 240
    tip.style.left = `${Math.max(4, Math.min(ev.x - r.left + 14, r.width - ancho - 4))}px`
    tip.style.top = `${ev.y - r.top + 16}px`
  }
  const hover23 = (u: [number, number] | null, ev?: { x: number; y: number }) => {
    const c = v23.current
    const o = u && c ? elegirEn(obj23, u, 6 / c.pxPorUnidad()).cerca[0]?.o : undefined
    const nuevo = o ? { clave: o.clave, n: o.n } : null
    setHov(h => (h?.clave === nuevo?.clave && h?.n === nuevo?.n ? h : nuevo))
    mostrarTip(tip23.current, nuevo ? 'si' : null, ev)
  }
  const hover22 = (u: [number, number] | null, ev?: { x: number; y: number }) => {
    const c = v22.current
    const o = u && c ? elegirEn(obj22, u, 6 / c.pxPorUnidad()).cerca[0]?.o : undefined
    const nuevo = o ? { clave: o.clave } : null
    setHov(h => (h?.clave === nuevo?.clave && h?.n === undefined ? h : nuevo))
    mostrarTip(tip22.current, nuevo ? 'si' : null, ev)
  }
  // Placa: mismo criterio que la hoja 23 (borne o su LED → el elemento de ese borne).
  const toquePlaca = (u: [number, number]) => {
    const c = vP.current
    if (!c) return
    const ppu = c.pxPorUnidad()
    const el = elegirEn(objP, u, (grueso ? 22 : 6) / ppu)
    const primero = el.cerca[0]
    if (!primero) return
    // Táctil: si en el dedo caben dos bornes, acerca hasta que cada borne mida ~44 px.
    const alto = (primero.o.n != null && placa?.geo.bornes.get(primero.o.n)?.h) || altoP
    if (grueso && el.distintos > 1 && alto * ppu < 30) {
      c.enfocar(u[0], u[1], (c.anchoPx() * alto) / 44)
      return
    }
    if (primero.o.n != null) elegirBorne(primero.o.n, 'placa')
    else seleccionar(primero.o.clave, 'placa')
  }
  const hoverPlaca = (u: [number, number] | null, ev?: { x: number; y: number }) => {
    const c = vP.current
    const o = u && c ? elegirEn(objP, u, 6 / c.pxPorUnidad()).cerca[0]?.o : undefined
    const nuevo = o ? { clave: o.clave, n: o.n } : null
    setHov(h => (h?.clave === nuevo?.clave && h?.n === nuevo?.n ? h : nuevo))
    mostrarTip(tipP.current, nuevo ? 'si' : null, ev)
  }
  const itemHov = hov ? describir(m, hov.clave, idioma) : null

  const elegirDeLista = (c: ClaveSel) => {
    seleccionar(c, 'lista')
    setHojaAbierta(false)
    setResultadosPc(false)
    setConsulta('')
  }

  // ─── Capas sobre los dibujos ───
  const capa23 = (
    <>
      <g>
        {[...elegidos].map(n => {
          const b = m.bornes.get(n)
          if (!b) return null
          const r = b.celda
          return <rect key={n} className="a3c-elegida" x={r.x} y={r.y} width={r.w} height={r.h} />
        })}
      </g>
      <g data-testid="leds-grupo">
        {grupo.map(p => (
          <circle key={p.k} className="a3c-contorno" data-grupo={p.k} cx={p.x} cy={p.y} r={4} />
        ))}
      </g>
      <g data-testid="leds-encendidos">
        {leds.map(p => (
          <g key={p.k} className={cn('a3c-led', p.color === 'g' && 'a3c-verde')} data-led={p.k}>
            <circle className="a3c-halo" cx={p.x} cy={p.y} r={6} />
            <circle className="a3c-anillo" cx={p.x} cy={p.y} r={4} />
            <circle className="a3c-anillo a3c-segundo" cx={p.x} cy={p.y} r={4} />
            <circle className="a3c-nucleo" cx={p.x} cy={p.y} r={2.7} />
          </g>
        ))}
      </g>
      {hov?.n != null && m.bornes.get(hov.n) && (() => {
        const r = m.bornes.get(hov.n!)!.celda
        return <rect className="a3c-celda-hover" x={r.x} y={r.y} width={r.w} height={r.h} />
      })()}
    </>
  )
  const capa22 = (
    <>
      <g>
        {obj22.map((o, i) => (
          <rect
            key={i}
            className={o.clave === sel ? 'a3c-elegida' : cn('a3c-zona', hov?.clave === o.clave && 'a3c-hover')}
            x={o.r.x - 1.5}
            y={o.r.y - 1.5}
            width={o.r.w + 3}
            height={o.r.h + 3}
            rx={1.5}
          />
        ))}
      </g>
      {item.hotspots[0] && (() => {
        const [cx, cy] = centroRect(item.hotspots[0])
        return (
          <g key={sel} className="a3c-led a3c-en-plano">
            <circle className="a3c-anillo" cx={cx} cy={cy} r={8} />
            <circle className="a3c-anillo a3c-segundo" cx={cx} cy={cy} r={8} />
          </g>
        )
      })()}
    </>
  )

  // Placa: los LED del dibujo están todos APAGADOS (el estado de la foto no es en vivo); aquí
  // se enciende solo el del elemento elegido, con el mismo LED animado que en el plano.
  const capaPlaca = placa && (
    <>
      <g>
        {[...elegidos].map(n => {
          const r = placa.geo.bornes.get(n)
          if (!r) return null
          return <rect key={n} className="a3c-elegida" x={r.x - 1} y={r.y - 1} width={r.w + 2} height={r.h + 2} rx={1} />
        })}
      </g>
      <g data-testid="leds-placa-grupo">
        {grupoP.map(p => (
          <circle key={p.k} className="a3c-contorno a3c-en-placa" data-grupo={p.k} cx={p.x} cy={p.y} r={p.r * 1.4} />
        ))}
      </g>
      <g data-testid="leds-placa">
        {ledsP.map(p => (
          <g key={p.k} className={cn('a3c-led a3c-en-placa', p.color === 'g' && 'a3c-verde')} data-led={p.k}>
            <circle className="a3c-halo" cx={p.x} cy={p.y} r={p.r * 2.1} />
            <circle className="a3c-anillo" cx={p.x} cy={p.y} r={p.r * 1.4} />
            <circle className="a3c-anillo a3c-segundo" cx={p.x} cy={p.y} r={p.r * 1.4} />
            <circle className="a3c-nucleo" cx={p.x} cy={p.y} r={p.r * 1.05} />
          </g>
        ))}
      </g>
      {hov?.n != null && placa.geo.bornes.get(hov.n) && (() => {
        const r = placa.geo.bornes.get(hov.n!)!
        return <rect className="a3c-celda-hover" x={r.x - 1} y={r.y - 1} width={r.w + 2} height={r.h + 2} />
      })()}
    </>
  )

  const elegirAmbiguo = (c: ClaveSel) => {
    setAmbiguos(null)
    seleccionar(c, '22')
  }
  const hojaAmbigua = (
    <Sheet
      open={ambiguos !== null}
      onClose={() => setAmbiguos(null)}
      title="¿Cuál?"
      description="Estos elementos están en el mismo lugar del plano."
      surface="grouped"
    >
      <ListGroup>
        {(ambiguos ?? []).map(c => {
          const it = describir(m, c, idioma)
          if (!it) return null
          return (
            <ListCell
              key={c}
              onClick={() => elegirAmbiguo(c)}
              title={<span><span className="mr-2 font-mono font-semibold">{it.codigo}</span>{it.nombre}</span>}
              subtitle={lineaLed(it).grande}
              chevron={false}
            />
          )
        })}
      </ListGroup>
    </Sheet>
  )

  // ─── Piezas de interfaz ───
  const selectorIdioma = (
    <SegmentedControl<Idioma>
      ariaLabel="Idioma de los textos del plano"
      value={idioma}
      onChange={setIdioma}
      segments={[{ value: 'es', label: 'ES' }, { value: 'or', label: 'Original' }]}
      className={cn(ALTO_44, 'w-[168px] flex-none')}
    />
  )
  const selectorModo = (
    <SegmentedControl<Modo>
      ariaLabel="Modo"
      value={modo}
      onChange={setModo}
      segments={[{ value: 'explorar', label: 'Explorar' }, { value: 'practicar', label: 'Practicar' }]}
      className={cn(ALTO_44, pc ? 'w-[260px] flex-none' : 'mt-3')}
    />
  )

  const selectorVista = (clase: string) => (
    <SegmentedControl<VistaTarjeta>
      ariaLabel="Vista de la tarjeta"
      value={vista}
      onChange={cambiarVista}
      segments={[{ value: 'plano', label: 'Plano' }, { value: 'placa', label: 'Placa' }]}
      className={cn(ALTO_44, clase)}
    />
  )

  const refDe = (l: Lamina) => (l === '22' ? v22 : l === '23' ? v23 : vP)

  const atajos = (l: Lamina, activo: string | null) => {
    const ps = l === 'placa' ? presetsP ?? {} : datos.presets_v5[l === '22' ? 'hoja22' : 'hoja23']
    const lienzo = refDe(l)
    return (
      <div role="group" aria-label="Atajos de zoom" className="flex flex-none gap-0.5 rounded-full bg-muted p-0.5">
        {Object.entries(ps).map(([k, p]) => (
          <button
            key={k}
            type="button"
            aria-pressed={activo === k}
            onClick={() => lienzo.current?.preset(k)}
            className={cn(
              'whitespace-nowrap rounded-full px-3 text-footnote font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              grueso ? 'h-[44px]' : 'h-[30px]',
              activo === k ? 'bg-card text-brand-ink' : 'text-foreground',
            )}
          >
            {p.l}
          </button>
        ))}
      </div>
    )
  }

  const botonesZoom = (l: Lamina) => {
    const lienzo = refDe(l)
    const clase = cn(
      'grid place-items-center rounded-full bg-muted text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      grueso ? 'size-[44px]' : 'size-[32px]',
    )
    return (
      <div className="absolute bottom-2 right-2 z-[2] flex flex-col gap-1.5">
        <button type="button" aria-label="Acercar" className={clase} onClick={() => lienzo.current?.zoom(0.66)}>
          <Plus aria-hidden className="size-5" />
        </button>
        <button type="button" aria-label="Alejar" className={clase} onClick={() => lienzo.current?.zoom(1.5)}>
          <Minus aria-hidden className="size-5" />
        </button>
      </div>
    )
  }

  const tip = (r: React.RefObject<HTMLDivElement>, contenido: ReactNode) => (
    <div ref={r} hidden className="pointer-events-none absolute z-[5] max-w-[240px] rounded-ctl bg-foreground px-2.5 py-1.5 text-footnote leading-snug text-background">
      {contenido}
    </div>
  )

  /** Teléfono: Máquina | Tarjeta y, en «Tarjeta», Plano | Placa (arriba, sin tapar los atajos). */
  const selectoresTel = !pc && (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-[2] flex items-start justify-between gap-1.5">
      <SegmentedControl<Hoja>
        ariaLabel="Dibujo"
        value={hoja}
        onChange={cambiarHoja}
        segments={[{ value: '22', label: 'Máquina' }, { value: '23', label: 'Tarjeta' }]}
        className={cn(ALTO_44, 'pointer-events-auto min-w-0 max-w-[190px] flex-[1_1_190px]')}
      />
      {/* En teléfonos angostos (≤ 360 px) los dos se encogen en vez de recortarse. */}
      {hoja === '23' && selectorVista('pointer-events-auto min-w-0 max-w-[132px] flex-[0_1_132px]')}
    </div>
  )

  const contenidoTip = (l: Lamina) =>
    itemHov && (
      <>
        {hov?.n != null && <b className="font-mono">X5:{hov.n} · </b>}
        <b className="font-mono">{itemHov.codigo}</b> {itemHov.nombre}
        {l === '22' && <><br />{lineaLed(itemHov).grande}</>}
        {l === '23' && hov?.n != null && !m.bornes.get(hov.n)?.led && <><br />Sin LED en el plano</>}
        {l === 'placa' && hov?.n != null && !placa?.geo.leds.has(hov.n) && <><br />Sin LED en la placa</>}
      </>
    )

  // PC: el dibujo termina sobre la franja de atajos (no queda tapado por ella) y «Todo» se ve entero.
  const areaPc = pc ? (grueso ? 'inset-x-0 top-0 bottom-[56px]' : 'inset-x-0 top-0 bottom-[42px]') : undefined

  const lienzoPlaca = (clase: string) => {
    const nInicio = selN ?? item.bornes[0]
    return (
      <div ref={placaHost} className={cn('a3c-placa relative overflow-hidden rounded-card bg-card', clase)} data-lienzo="placa">
        {placa && presetsP && limP ? (
          <LienzoA3c
            key={`placa-${pc ? 'pc' : 'tel'}`}
            ref={vP}
            hoja="placa"
            dibujo={placa.dibujo}
            textos={SIN_TEXTOS}
            idioma={idioma}
            presets={presetsP}
            inicio={pc ? 'todo' : (nInicio != null && zonaPlaca(nInicio)) || 'todo'}
            limites={limP}
            etiqueta="Placa A3C de la N2 (Línea 2), dibujada desde foto; los LED no muestran estado en vivo"
            onToque={toquePlaca}
            onHover={pc ? hoverPlaca : undefined}
            onPresetActivo={setPresetP}
            area={areaPc}
          >
            {capaPlaca}
          </LienzoA3c>
        ) : errorPlaca ? (
          <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-subhead">No se pudo cargar el dibujo de la placa. Revisa la conexión e inténtalo de nuevo.</p>
            <Button onClick={() => setIntentoPlaca(i => i + 1)}>Reintentar</Button>
          </div>
        ) : (
          <div role="status" aria-label="Cargando la placa" className="h-full animate-pulse bg-muted motion-reduce:animate-none" />
        )}
        {selectoresTel}
        {placa && (
          <>
            <div className={cn('absolute bottom-2 left-2 z-[2] overflow-x-auto', grueso ? 'right-[60px]' : 'right-12', 'a3c-regleta')}>
              {atajos('placa', presetP)}
            </div>
            {botonesZoom('placa')}
          </>
        )}
        {pc && tip(tipP, contenidoTip('placa'))}
      </div>
    )
  }

  const lienzo = (h: Hoja, clase: string, estilo?: CSSProperties) => {
    if (h === '23' && verPlaca) return lienzoPlaca(clase)
    const es22 = h === '22'
    return (
      <div className={cn('relative overflow-hidden rounded-card bg-card', clase)} style={estilo} data-lienzo={h}>
        <LienzoA3c
          key={`${h}-${pc ? 'pc' : 'tel'}`}
          ref={es22 ? v22 : v23}
          hoja={h}
          dibujo={dibujo[h]}
          textos={es22 ? datos.textos.hoja22 : datos.textos.hoja23}
          idioma={idioma}
          presets={es22 ? datos.presets_v5.hoja22 : datos.presets_v5.hoja23}
          inicio={pc ? 'todo' : es22 ? 'gabinete' : 'r30'}
          limites={es22 ? LIM22 : LIM23}
          etiqueta={es22 ? 'Plano de ubicación de la máquina, hoja 22/45' : 'Tarjeta A3C, hoja 23/45, girada como en el tablero'}
          onToque={es22 ? toque22 : toque23}
          onHover={pc ? (es22 ? hover22 : hover23) : undefined}
          onPresetActivo={es22 ? setPreset22 : setPreset23}
          area={areaPc}
        >
          {es22 ? capa22 : capa23}
        </LienzoA3c>
        {selectoresTel}
        <div className={cn('absolute bottom-2 left-2 z-[2] overflow-x-auto', grueso ? 'right-[60px]' : 'right-12', 'a3c-regleta')}>
          {atajos(h, es22 ? preset22 : preset23)}
        </div>
        {botonesZoom(h)}
        {pc && tip(es22 ? tip22 : tip23, contenidoTip(h))}
      </div>
    )
  }

  const alElegirRegleta = useCallback((n: number) => elegirBorne(n, 'regleta'), [elegirBorne])
  const regleta = (
    <RegletaX5
      ref={regletaRef}
      bornes={m.bornes}
      elegidos={elegidos}
      encendidos={encendidos}
      grupo={enGrupo}
      idioma={idioma}
      compacta={!grueso}
      vertical={pc}
      onElegir={alElegirRegleta}
    />
  )

  const quiz = (
    <QuizA3c
      key={pc ? 'pc' : 'tel'}
      modelo={m}
      dibujo={dibujo['23']}
      textos={datos.textos.hoja23}
      preguntas={datos.quiz.filter(q => q.contexto === (pc ? 'pc' : 'telefono'))}
      dosColumnas={pc}
      onVolver={() => setModo('explorar')}
    />
  )

  const volver = (
    <button
      type="button"
      onClick={onVolver}
      className="-ml-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-full px-2 text-body text-primary hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ChevronLeft aria-hidden className="size-6" />
      {etiquetaVolver}
    </button>
  )

  const campoBusqueda = (autoFocus: boolean) => (
    <label className="flex h-[44px] items-center gap-2 rounded-[22px] bg-muted px-3.5 text-muted-foreground">
      <Search aria-hidden className="size-[18px] flex-none" />
      <input
        type="search"
        value={consulta}
        autoFocus={autoFocus}
        onChange={e => {
          setConsulta(e.target.value)
          setResultadosPc(!!e.target.value.trim())
        }}
        placeholder="Buscar: B4, Y8, encoder, 68…"
        aria-label="Buscar elemento, borne o LED"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  )

  // Divisor plano de ubicación | ficha (PC): arrastre, flechas (Mayús = paso largo), Inicio/Fin;
  // doble clic vuelve al reparto por defecto. Objetivo de 44 px; su mitad baja pisa el relleno de la ficha.
  /** Termina el arrastre del puntero que lo empezó (otro dedo no lo corta ni lo mueve). */
  const soltarDivisor = (e: React.PointerEvent) => {
    if (arrastreDivisor.current?.id === e.pointerId) arrastreDivisor.current = null
  }
  const divisor = dist && area && (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Tamaño del plano de ubicación y de la ficha"
      aria-valuemin={UBICACION_MIN}
      aria-valuemax={dist.maxUbicacion}
      aria-valuenow={altoUbic}
      aria-valuetext={`Plano de ubicación de ${altoUbic} px de alto`}
      tabIndex={0}
      data-testid="divisor-pc"
      className="group relative z-[3] flex flex-none cursor-row-resize touch-none items-center justify-center focus-visible:outline-none"
      style={{ height: ALTO_DIVISOR, marginBottom: -SOLAPE_DIVISOR }}
      onPointerDown={e => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || arrastreDivisor.current) return
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Sin captura, soltar fuera del divisor no avisaría: no se arrastra.
          return
        }
        arrastreDivisor.current = { id: e.pointerId, y: e.clientY, alto: altoUbic }
      }}
      onPointerMove={e => {
        const a = arrastreDivisor.current
        if (a && a.id === e.pointerId) fijarUbicacion(a.alto + e.clientY - a.y)
      }}
      onPointerUp={soltarDivisor}
      onPointerCancel={soltarDivisor}
      onLostPointerCapture={soltarDivisor}
      onDoubleClick={() => {
        setDivision(null)
        try {
          localStorage.removeItem(CLAVE_DIVISION)
        } catch {
          /* sin almacenamiento */
        }
      }}
      onKeyDown={e => {
        const paso = e.shiftKey ? 80 : 24
        const v =
          e.key === 'ArrowUp' ? altoUbic - paso
          : e.key === 'ArrowDown' ? altoUbic + paso
          : e.key === 'Home' ? UBICACION_MIN
          : e.key === 'End' ? dist.maxUbicacion
          : null
        if (v == null) return
        e.preventDefault()
        fijarUbicacion(v)
      }}
    >
      <span
        aria-hidden
        className="h-[5px] w-10 rounded-full bg-muted-foreground/40 group-hover:bg-muted-foreground/70 group-focus-visible:bg-primary"
        style={{ marginBottom: SOLAPE_DIVISOR }}
      />
    </div>
  )

  if (pc) {
    return (
      <div ref={raizRef} className="min-h-full w-full bg-background pb-4 text-foreground">
        {/* Sin `max-width`: la herramienta usa todo el ancho útil de la ventana (HIG, layout). */}
        <div className="w-full px-5">
          <div className="flex h-[52px] items-center">{volver}</div>
          <header className="flex flex-wrap items-end justify-between gap-4 pb-3">
            <div className="min-w-0">
              <h1 className="text-title1 font-bold">Tarjeta A3C · BAADER 142</h1>
              <p className="mt-0.5 font-mono text-caption text-muted-foreground">{FUENTE}</p>
            </div>
            <div className="flex items-center gap-3">
              {selectorIdioma}
              {modo === 'explorar' && (
                <div className="relative w-[300px]">
                  {campoBusqueda(false)}
                  {resultadosPc && consulta.trim() && (
                    <div className="absolute left-0 right-0 top-[52px] z-20 max-h-[420px] overflow-y-auto rounded-card bg-background p-3 shadow-xl">
                      <ListaA3c grupos={grupos} elegido={sel} consulta={consulta} onElegir={elegirDeLista} />
                    </div>
                  )}
                </div>
              )}
              {selectorModo}
            </div>
          </header>
          {modo === 'practicar' ? quiz : (
            <div
              ref={grillaRef}
              data-testid="grilla-pc"
              className="grid h-[max(560px,calc(100dvh-180px))] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5"
              style={dist && area ? { height: area.alto, gridTemplateColumns: `${dist.anchoTarjeta}px minmax(0,1fr)` } : undefined}
            >
              {/* Izquierda: la tarjeta, protagonista (≥ 50 % del ancho, todo el alto), con la regleta X5
                  como índice vertical: los 144 bornes legibles y elegibles con teclado, sin tira horizontal. */}
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="flex min-h-[52px] items-center gap-3 pb-2">
                  {selectorVista('w-[200px] flex-none')}
                  {verPlaca && <p className="min-w-0 text-caption leading-snug text-muted-foreground">{FUENTE_PLACA}</p>}
                </div>
                <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `${ANCHO_REGLETA_PC}px minmax(0,1fr)` }}>
                  <div className="min-h-0">{regleta}</div>
                  {lienzo('23', 'h-full min-h-0')}
                </div>
              </div>
              {/* Derecha: plano de ubicación grande arriba; ficha compacta abajo; divisor ajustable. */}
              <div className="flex min-h-0 min-w-0 flex-col">
                {lienzo('22', 'flex-none', { height: altoUbic })}
                {divisor}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-card bg-card p-4">
                  <FranjaLed linea={lineaVista} onVer={verLed} destino={lineaVista.soloPlano ? 'plano' : 'tarjeta'} className="bg-background" />
                  <div className={cn('mt-3', dist?.fichaAncha && 'columns-2 gap-8 [&_dl]:break-inside-avoid [&_section]:break-inside-avoid')}>
                    <FichaA3c item={item} idioma={idioma} compacta />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {hojaAmbigua}
      </div>
    )
  }

  return (
    <div ref={raizRef} className="min-h-full w-full bg-background pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-foreground">
      <div className="mx-auto w-full max-w-[640px] px-4">
        <div className="flex h-[52px] items-center justify-between gap-2">
          {volver}
          {selectorIdioma}
        </div>
        <h1 className="text-title1 font-bold">Tarjeta A3C</h1>
        <p className="mt-0.5 font-mono text-caption text-muted-foreground">{FUENTE}</p>
        {selectorModo}
        {modo === 'practicar' ? quiz : (
          <>
            {lienzo(hoja, 'mt-3 h-[clamp(280px,calc(100dvh-440px),460px)] touch-none')}
            {hoja === '23' && verPlaca && <p className="mt-1.5 text-caption leading-snug text-muted-foreground">{FUENTE_PLACA}</p>}
            <FranjaLed linea={lineaVista} onVer={verLed} destino={lineaVista.soloPlano ? 'plano' : 'tarjeta'} className="mt-3" />
            {regleta}
            <button
              type="button"
              onClick={() => setHojaAbierta(true)}
              className="mt-2 flex min-h-[64px] w-full items-center gap-3 rounded-card bg-card px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Ver la ficha de ${item.codigo} y buscar`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-headline">
                  <span className="font-mono">{item.codigo}</span> · {item.nombre}
                </span>
                <span className="block truncate text-footnote text-muted-foreground">{item.queHace.texto}</span>
              </span>
              <span className="grid size-[44px] flex-none place-items-center rounded-full bg-muted text-foreground" aria-hidden>
                <Search className="size-[18px]" />
              </span>
            </button>
          </>
        )}
      </div>
      <Sheet
        open={hojaAbierta}
        onClose={() => {
          setHojaAbierta(false)
          setConsulta('')
        }}
        title="Ficha y buscador"
        surface="grouped"
        toolbar={campoBusqueda(false)}
      >
        {consulta.trim() ? (
          <ListaA3c grupos={grupos} elegido={sel} consulta={consulta} onElegir={elegirDeLista} />
        ) : (
          <>
            <div className="rounded-card bg-card p-4">
              <FichaA3c item={item} idioma={idioma} />
            </div>
            <div className="mt-5">
              <ListaA3c grupos={grupos} elegido={sel} consulta={consulta} onElegir={elegirDeLista} />
            </div>
          </>
        )}
      </Sheet>
      {hojaAmbigua}
    </div>
  )
}
