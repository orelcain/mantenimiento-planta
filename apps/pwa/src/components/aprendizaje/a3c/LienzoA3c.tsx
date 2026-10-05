/**
 * Lienzo con el dibujo REAL del plano (SVG vectorial sin texto) + los textos que pone la
 * app + capas interactivas, con pellizco, arrastre, rueda y atajos de zoom.
 *
 * La cámara vive en una ref y se aplica directo al DOM (`transform` de un <g>): en un
 * pointermove por frame, pasar por el estado de React haría que el arrastre se sintiera a
 * saltos. React solo dibuja lo que cambia con la selección (capas `children`).
 * La matemática de la cámara es pura y está probada en `utils/aprendizaje/a3c.ts`.
 */
import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Hoja, PresetV5, Texto } from '@/data/baader142A3c'
import {
  camaraDePreset,
  deltaRuedaPx,
  limitarCamara,
  lineasDeTexto,
  matrizCamara,
  pantallaAUnidades,
  zoomCamara,
  type Camara,
  type Idioma,
  type LimitesCamara,
} from '@/utils/aprendizaje/a3c'

export interface LienzoA3cHandle {
  enfocar: (x: number, y: number, w?: number) => void
  preset: (k: string) => void
  zoom: (f: number) => void
  pulso: (x: number, y: number) => void
  /** Px de pantalla por unidad del plano. */
  pxPorUnidad: () => number
  /** Ancho del lienzo en px. */
  anchoPx: () => number
  camara: () => Camara
}

export interface LienzoA3cProps {
  /** Hoja del plano o «placa» (dibujo de la placa real, sin textos de la app). */
  hoja: Hoja | 'placa'
  dibujo: string
  textos: Texto[]
  idioma: Idioma
  /** Solo los textos que son números (recorte del quiz). */
  soloNumeros?: boolean
  presets: Record<string, PresetV5>
  inicio: string
  limites: LimitesCamara
  etiqueta: string
  onToque?: (u: [number, number]) => void
  onHover?: (u: [number, number] | null, ev?: { x: number; y: number }) => void
  /** Avisa qué atajo está activo (null = la cámara se movió a mano). */
  onPresetActivo?: (k: string | null) => void
  children?: ReactNode
}

/** Capa de textos del plano en el idioma elegido. Memo: son ~250 <text> por hoja. */
export const CapaTextos = memo(function CapaTextos({ textos, idioma, soloNumeros }: { textos: Texto[]; idioma: Idioma; soloNumeros?: boolean }) {
  return (
    <g className="a3c-textos" aria-hidden>
      {textos.flatMap((t, i) => {
        if (soloNumeros && !/^\d+$/.test(t.layout_v5.or)) return []
        const ls = lineasDeTexto(t, idioma)
        const nodos = ls.map((l, j) => (
          <text
            key={`${i}-${j}`}
            x={l.x}
            y={l.y}
            fontSize={l.size}
            textAnchor={l.anchor}
            {...(l.largo ? { textLength: l.largo, lengthAdjust: 'spacingAndGlyphs' } : {})}
          >
            {l.texto}
          </text>
        ))
        const tr = ls[0]?.transform
        return tr ? [<g key={i} transform={tr}>{nodos}</g>] : nodos
      })}
    </g>
  )
})

const ANCHO_DEF = 343
const ALTO_DEF = 340

export const LienzoA3c = forwardRef<LienzoA3cHandle, LienzoA3cProps>(function LienzoA3c(
  { hoja, dibujo, textos, idioma, soloNumeros, presets, inicio, limites, etiqueta, onToque, onHover, onPresetActivo, children },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const camRef = useRef<SVGGElement>(null)
  const anilloRef = useRef<SVGCircleElement>(null)
  const tam = useRef({ vw: ANCHO_DEF, vh: ALTO_DEF })
  const cam = useRef<Camara>({ cx: 0, cy: 0, w: 1 })
  const presetActual = useRef<string | null>(inicio)
  const iniciado = useRef(false)
  const timerEscala = useRef<ReturnType<typeof setTimeout>>()
  // Las props de callback en refs: los listeners nativos se registran una sola vez.
  const cb = useRef({ onToque, onHover, onPresetActivo, limites, presets })
  cb.current = { onToque, onHover, onPresetActivo, limites, presets }

  const aplicar = (animar: boolean) => {
    const g = camRef.current
    const svg = svgRef.current
    if (!g || !svg) return
    cam.current = limitarCamara(cam.current, cb.current.limites)
    const { vw, vh } = tam.current
    const m = matrizCamara(cam.current, vw, vh)
    g.style.transition = animar ? '' : 'none'
    g.style.transform = `matrix(${m.s},0,0,${m.s},${m.tx},${m.ty})`
    clearTimeout(timerEscala.current)
    // El grosor de línea se recalcula al terminar la animación (cambiarlo durante, parpadea).
    timerEscala.current = setTimeout(() => svg.style.setProperty('--escala', m.s.toFixed(3)), animar ? 330 : 60)
  }

  const marcarPreset = (k: string | null) => {
    presetActual.current = k
    cb.current.onPresetActivo?.(k)
  }

  const irAPreset = (k: string, animar: boolean) => {
    const p = cb.current.presets[k]
    if (!p) return
    cam.current = camaraDePreset(p, tam.current.vw, tam.current.vh)
    marcarPreset(k)
    aplicar(animar)
  }

  useImperativeHandle(ref, () => ({
    enfocar: (x, y, w) => {
      cam.current = { cx: x, cy: y, w: w ?? cam.current.w }
      marcarPreset(null)
      aplicar(true)
    },
    preset: k => irAPreset(k, true),
    zoom: f => {
      cam.current = zoomCamara(cam.current, f, cb.current.limites)
      marcarPreset(null)
      aplicar(true)
    },
    pulso: (x, y) => {
      const a = anilloRef.current
      if (!a) return
      a.setAttribute('cx', String(x))
      a.setAttribute('cy', String(y))
      a.classList.remove('a3c-pulso')
      void a.getBoundingClientRect()
      a.classList.add('a3c-pulso')
    },
    pxPorUnidad: () => tam.current.vw / cam.current.w,
    anchoPx: () => tam.current.vw,
    camara: () => cam.current,
  }))

  // Medida inicial + seguir el tamaño del contenedor.
  useLayoutEffect(() => {
    const host = hostRef.current
    const svg = svgRef.current
    if (!host || !svg) return
    const medir = () => {
      const w = Math.round(host.clientWidth) || ANCHO_DEF
      const h = Math.round(host.clientHeight) || ALTO_DEF
      if (w === tam.current.vw && h === tam.current.vh) return false
      tam.current = { vw: w, vh: h }
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      return true
    }
    medir()
    // Una sola vez por instancia: en desarrollo (StrictMode) el efecto corre dos veces y la
    // segunda pisaría un `enfocar` que el padre ya pidió (p. ej. «Ver» al cambiar de lienzo).
    if (!iniciado.current) {
      iniciado.current = true
      irAPreset(inicio, false)
      svg.style.setProperty('--escala', (tam.current.vw / cam.current.w).toFixed(3))
    }
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (!medir()) return
      if (presetActual.current) irAPreset(presetActual.current, false)
      else aplicar(false)
    })
    ro.observe(host)
    return () => ro.disconnect()
    // Solo al montar: el atajo inicial no se reaplica si cambia después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pellizco, arrastre, toque, hover y rueda (listeners nativos: la rueda necesita passive:false).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const pts = new Map<number, { x: number; y: number }>()
    let inicioGesto: { n: number; cam: Camara; p?: { x: number; y: number }; d: number; m?: { x: number; y: number } } | null = null
    let movido = false
    // Un gesto que tuvo dos dedos nunca es un toque (al levantarlos sin mover no debe elegir nada).
    let hubo2 = false
    const caja = () => svg.getBoundingClientRect()
    const aU = (cx: number, cy: number): [number, number] => {
      const r = caja()
      const k = tam.current.vw / (r.width || tam.current.vw)
      return pantallaAUnidades(cam.current, tam.current.vw, tam.current.vh, (cx - r.left) * k, (cy - r.top) * k)
    }
    const ppu = () => (tam.current.vw / cam.current.w) * ((caja().width || tam.current.vw) / tam.current.vw)
    const foto = () => {
      const [a, b] = [...pts.values()]
      return {
        n: pts.size,
        cam: { ...cam.current },
        p: a && { ...a },
        d: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
        m: a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined,
      }
    }
    const down = (e: PointerEvent) => {
      // Mouse: solo el botón principal (clic derecho / ctrl+clic abren menú y no deben arrastrar).
      if (e.pointerType === 'mouse' && e.button !== 0) return
      try {
        svg.setPointerCapture?.(e.pointerId)
      } catch {
        /* puntero ya liberado (o sintético): el gesto sigue sin captura */
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size >= 2) hubo2 = true
      inicioGesto = foto()
      movido = false
    }
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) {
        if (e.pointerType === 'mouse') cb.current.onHover?.(aU(e.clientX, e.clientY), { x: e.clientX, y: e.clientY })
        return
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!inicioGesto || pts.size !== inicioGesto.n) inicioGesto = foto()
      const g = inicioGesto
      if (pts.size >= 2 && g.m && g.d) {
        const [a, b] = [...pts.values()]
        if (!a || !b) return
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const w = Math.max(cb.current.limites.minW, Math.min(cb.current.limites.maxW, (g.cam.w * g.d) / Math.max(d, 1)))
        const p2 = (tam.current.vw / w) * ((caja().width || tam.current.vw) / tam.current.vw)
        cam.current = { w, cx: g.cam.cx - (m.x - g.m.x) / p2, cy: g.cam.cy - (m.y - g.m.y) / p2 }
        movido = true
        marcarPreset(null)
        aplicar(false)
        return
      }
      if (!g.p) return
      const dx = e.clientX - g.p.x
      const dy = e.clientY - g.p.y
      if (!movido && Math.hypot(dx, dy) > 6) {
        movido = true
        svg.classList.add('a3c-arrastrando')
      }
      if (movido) {
        const k = ppu()
        cam.current = { ...g.cam, cx: g.cam.cx - dx / k, cy: g.cam.cy - dy / k }
        marcarPreset(null)
        aplicar(false)
      }
    }
    const up = (e: PointerEvent) => {
      const eraToque = !movido && !hubo2 && pts.size === 1 && pts.has(e.pointerId) && e.type === 'pointerup'
      pts.delete(e.pointerId)
      svg.classList.remove('a3c-arrastrando')
      if (eraToque) cb.current.onToque?.(aU(e.clientX, e.clientY))
      inicioGesto = foto()
      if (!pts.size) {
        movido = false
        hubo2 = false
      }
    }
    // El navegador quitó la captura (cambio de pestaña, gesto del sistema): sin restos en `pts`.
    const perdida = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return
      svg.classList.remove('a3c-arrastrando')
      inicioGesto = foto()
      if (!pts.size) {
        movido = false
        hubo2 = false
      }
    }
    const leave = () => cb.current.onHover?.(null)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const u = aU(e.clientX, e.clientY)
      cam.current = zoomCamara(cam.current, Math.exp(deltaRuedaPx(e.deltaY, e.deltaMode) * 0.0015), cb.current.limites, u[0], u[1])
      marcarPreset(null)
      aplicar(false)
    }
    svg.addEventListener('pointerdown', down)
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerup', up)
    svg.addEventListener('pointercancel', up)
    svg.addEventListener('lostpointercapture', perdida)
    svg.addEventListener('pointerleave', leave)
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => {
      svg.removeEventListener('pointerdown', down)
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerup', up)
      svg.removeEventListener('pointercancel', up)
      svg.removeEventListener('lostpointercapture', perdida)
      svg.removeEventListener('pointerleave', leave)
      svg.removeEventListener('wheel', wheel)
      clearTimeout(timerEscala.current)
    }
  }, [])

  return (
    <div ref={hostRef} className="absolute inset-0">
      <svg
        ref={svgRef}
        className="a3c-lienzo"
        viewBox={`0 0 ${ANCHO_DEF} ${ALTO_DEF}`}
        role="img"
        aria-label={etiqueta}
        data-hoja={hoja}
      >
        <g ref={camRef} className="a3c-cam">
          <g className="a3c-dibujo" dangerouslySetInnerHTML={{ __html: dibujo }} />
          <g className="a3c-dibujo">
            <CapaTextos textos={textos} idioma={idioma} soloNumeros={soloNumeros} />
          </g>
          {children}
          <circle ref={anilloRef} className="a3c-llegada" cx={0} cy={0} r={1} />
        </g>
      </svg>
    </div>
  )
})
