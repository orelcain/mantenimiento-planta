/**
 * Tarjeta A3C · BAADER 142 — la herramienta completa (mockup v5 aprobado).
 *
 * Teléfono (una mano): lienzo Máquina | Tarjeta con pellizco, arrastre, atajos y + / − de
 * 44 px; debajo, «qué LED prende» siempre visible, la regleta X5 recorrible y la ficha en
 * una hoja inferior con buscador. Un toque ambiguo acerca en vez de adivinar.
 * PC: tarjeta completa (vertical, como en la placa) + plano de ubicación + ficha a la vez;
 * el mouse muestra la señal y un clic en un dibujo mueve el otro.
 *
 * Recibe el paquete ya cargado (la página lo pide); así se prueba sin red.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, Minus, Plus, Search } from 'lucide-react'
import { SegmentedControl, Sheet } from '@/components/piel'
import type { Hoja, PaqueteA3c } from '@/data/baader142A3c'
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
  puntosLed,
  type ClaveSel,
  type Idioma,
  type LimitesCamara,
} from '@/utils/aprendizaje/a3c'
import { LienzoA3c, type LienzoA3cHandle } from './LienzoA3c'
import { FranjaLed } from './FranjaLed'
import { RegletaX5 } from './RegletaX5'
import { FichaA3c, ListaA3c } from './FichaA3c'
import { QuizA3c } from './QuizA3c'
import './a3c.css'

const LIM22: LimitesCamara = { minW: 70, maxW: 2200, bounds: [40, 45, 1080, 675] }
const LIM23: LimitesCamara = { minW: 50, maxW: 2000, bounds: [-60, 0, 780, 1131] }
const FUENTE = 'Plano 142.71.00.888, hojas 22 y 23 · máquinas N2 y N3'

type Modo = 'explorar' | 'practicar'

/**
 * Hacia dónde quedan los textos de una regleta respecto de su LED: en las de arriba del
 * plano (x < 360) el LED va a la izquierda y el texto a la derecha; en las de abajo, al
 * revés. La cámara se corre hacia el texto para que el LED y su rótulo entren juntos.
 */
const ladoTextos = (x: number) => (x > 360 ? -1 : 1)
type Origen = Hoja | 'regleta' | 'lista' | null

export interface TarjetaA3cProps {
  paquete: PaqueteA3c
  onVolver: () => void
  etiquetaVolver: string
  /** Fuerza el diseño (pruebas). Sin esto se mide el ancho real del contenedor. */
  dosColumnas?: boolean
}

export function TarjetaA3c({ paquete, onVolver, etiquetaVolver, dosColumnas: forzado }: TarjetaA3cProps) {
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

  const [modo, setModo] = useState<Modo>('explorar')
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

  const v22 = useRef<LienzoA3cHandle>(null)
  const v23 = useRef<LienzoA3cHandle>(null)
  const regletaRef = useRef<HTMLDivElement>(null)
  const tip22 = useRef<HTMLDivElement>(null)
  const tip23 = useRef<HTMLDivElement>(null)
  const pendiente = useRef<(() => void) | null>(null)
  const ultimoOrigen = useRef<Origen>(null)

  const item = useMemo(() => describir(m, sel, idioma) ?? describir(m, 'e:B4', idioma)!, [m, sel, idioma])
  const linea = useMemo(() => lineaLed(item), [item])
  const leds = useMemo(() => puntosLed(m, item), [m, item])
  const elegidos = useMemo(() => new Set([...item.bornes, ...(selN != null ? [selN] : [])]), [item, selN])
  const encendidos = useMemo(() => new Set(item.leds), [item])
  const grupos = useMemo(() => buscar(m, consulta, idioma), [m, consulta, idioma])

  /** Lleva las cámaras a lo elegido (la que originó el toque no se mueve). */
  const enfocar = useCallback((clave: ClaveSel, origen: Origen) => {
    const it = describir(m, clave, 'es')
    if (!it) return
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
  }, [m, pc])

  const seleccionar = useCallback((clave: ClaveSel, origen: Origen, n?: number) => {
    const it = describir(m, clave, 'es')
    setSel(clave)
    setSelN(n ?? it?.bornes[0] ?? null)
    ultimoOrigen.current = origen
    enfocar(clave, origen)
  }, [m, enfocar])

  const elegirBorne = useCallback((n: number, origen: Origen) => seleccionar(claveDeBorne(m, n), origen, n), [m, seleccionar])

  // La regleta sigue a la selección (salvo si el toque vino de ella).
  useEffect(() => {
    const cont = regletaRef.current
    if (!cont || ultimoOrigen.current === 'regleta') return
    const n = selN ?? item.bornes[0]
    const celda = n != null ? cont.querySelector<HTMLElement>(`[data-n="${n}"]`) : null
    if (!celda || typeof cont.scrollTo !== 'function') return
    const rc = cont.getBoundingClientRect()
    const rt = celda.getBoundingClientRect()
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    cont.scrollTo({ left: cont.scrollLeft + rt.left - rc.left - rc.width / 2 + rt.width / 2, behavior: suave ? 'smooth' : 'auto' })
  }, [sel, selN, item, modo, pc])

  // Acciones pendientes tras cambiar de lienzo en el teléfono (el nuevo se monta primero).
  useEffect(() => {
    const f = pendiente.current
    pendiente.current = null
    f?.()
  }, [hoja, modo, pc])

  const verLed = () => {
    const ir = () => {
      const xy = puntoFoco(m, item)
      const c = v23.current
      if (!c || !xy) return
      const w = pc ? 260 : 170
      c.enfocar(xy[0] + ladoTextos(xy[0]) * w * 0.36, xy[1], w)
      c.pulso(xy[0], xy[1])
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

  // ─── Toques y hover en los dibujos ───
  const toque23 = (u: [number, number]) => {
    const c = v23.current
    if (!c) return
    const ppu = c.pxPorUnidad()
    const el = elegirEn(obj23, u, (pc ? 6 : 22) / ppu)
    const primero = el.cerca[0]
    if (!primero) return
    // Teléfono: si en el dedo caben dos bornes (celdas de 8,5 u a < 30 px), acerca en vez de adivinar.
    if (!pc && el.distintos > 1 && 8.5 * ppu < 30) {
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
    const el = elegirEn(obj22, u, (pc ? 6 : 22) / ppu)
    const primero = el.cerca[0]
    if (!primero) {
      // Vista completa en el teléfono: un toque en una zona acerca a esa zona.
      if (!pc && ppu < 0.7) c.preset(u[1] < 400 ? 'modulos' : u[0] < 300 ? 'ciclon' : 'gabinete')
      return
    }
    const otro = el.cerca.find(x => x.o.clave !== primero.o.clave)
    if (!pc && otro) {
      const [ax, ay] = centroRect(primero.o.r)
      const [bx, by] = centroRect(otro.o.r)
      if (Math.hypot(ax - bx, ay - by) * ppu < 44) {
        c.enfocar(u[0], u[1], Math.min(c.camara().w * 0.5, 200))
        return
      }
    }
    seleccionar(primero.o.clave, '22')
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
    tip.style.left = `${Math.min(ev.x - r.left + 14, r.width - 250)}px`
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

  // ─── Piezas de interfaz ───
  const selectorIdioma = (
    <SegmentedControl<Idioma>
      ariaLabel="Idioma de los textos del plano"
      value={idioma}
      onChange={setIdioma}
      segments={[{ value: 'es', label: 'ES' }, { value: 'or', label: 'Original' }]}
      className="w-[168px] flex-none"
    />
  )
  const selectorModo = (
    <SegmentedControl<Modo>
      ariaLabel="Modo"
      value={modo}
      onChange={setModo}
      segments={[{ value: 'explorar', label: 'Explorar' }, { value: 'practicar', label: 'Practicar' }]}
      className={pc ? 'w-[260px] flex-none' : 'mt-3'}
    />
  )

  const atajos = (h: Hoja, activo: string | null) => {
    const ps = datos.presets_v5[h === '22' ? 'hoja22' : 'hoja23']
    const lienzo = h === '22' ? v22 : v23
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
              pc ? 'h-[30px]' : 'h-[40px]',
              activo === k ? 'bg-card text-brand-ink' : 'text-foreground',
            )}
          >
            {p.l}
          </button>
        ))}
      </div>
    )
  }

  const botonesZoom = (h: Hoja) => {
    const lienzo = h === '22' ? v22 : v23
    const clase = cn(
      'grid place-items-center rounded-full bg-muted text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      pc ? 'size-[32px]' : 'size-[44px]',
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

  const lienzo = (h: Hoja, clase: string) => {
    const es22 = h === '22'
    return (
      <div className={cn('relative overflow-hidden rounded-card bg-card', clase)} data-lienzo={h}>
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
        >
          {es22 ? capa22 : capa23}
        </LienzoA3c>
        {!pc && (
          <div className="absolute left-2 top-2 z-[2]">
            <SegmentedControl<Hoja>
              ariaLabel="Dibujo"
              value={hoja}
              onChange={cambiarHoja}
              segments={[{ value: '22', label: 'Máquina' }, { value: '23', label: 'Tarjeta' }]}
              className="w-[200px]"
            />
          </div>
        )}
        <div className={cn('absolute bottom-2 left-2 z-[2] overflow-x-auto', pc ? 'right-12' : 'right-[60px]', 'a3c-regleta')}>
          {atajos(h, es22 ? preset22 : preset23)}
        </div>
        {botonesZoom(h)}
        {pc && tip(es22 ? tip22 : tip23, itemHov && (
          <>
            {hov?.n != null && <b className="font-mono">X5:{hov.n} · </b>}
            <b className="font-mono">{itemHov.codigo}</b> {itemHov.nombre}
            {es22 && <><br />{lineaLed(itemHov).grande}</>}
            {!es22 && hov?.n != null && !m.bornes.get(hov.n)?.led && <><br />Sin LED en el plano</>}
          </>
        ))}
      </div>
    )
  }

  const regleta = (
    <RegletaX5
      ref={regletaRef}
      bornes={m.bornes}
      elegidos={elegidos}
      encendidos={encendidos}
      idioma={idioma}
      compacta={pc}
      onElegir={n => elegirBorne(n, 'regleta')}
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

  if (pc) {
    return (
      <div ref={raizRef} className="min-h-full w-full bg-background pb-10 text-foreground">
        <div className="mx-auto w-full max-w-[1400px] px-5">
          <div className="flex h-[52px] items-center">{volver}</div>
          <header className="flex flex-wrap items-end justify-between gap-4 pb-4">
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
                    <div className="absolute left-0 right-0 top-[52px] z-20 max-h-[420px] overflow-y-auto rounded-card bg-background p-3 shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                      <ListaA3c grupos={grupos} elegido={sel} consulta={consulta} onElegir={elegirDeLista} />
                    </div>
                  )}
                </div>
              )}
              {selectorModo}
            </div>
          </header>
          {modo === 'practicar' ? quiz : (
            <div className="grid h-[max(640px,calc(100dvh-190px))] grid-cols-[minmax(0,520px)_minmax(0,1fr)] gap-5">
              <div className="flex min-h-0 flex-col">
                {lienzo('23', 'min-h-0 flex-1')}
                {regleta}
              </div>
              <div className="flex min-h-0 flex-col gap-3">
                {lienzo('22', 'h-[300px] flex-none')}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-card bg-card p-4">
                  <FranjaLed linea={linea} onVer={verLed} className="bg-background" />
                  <div className="mt-4"><FichaA3c item={item} idioma={idioma} /></div>
                </div>
              </div>
            </div>
          )}
        </div>
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
            <FranjaLed linea={linea} onVer={verLed} className="mt-3" />
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
    </div>
  )
}
