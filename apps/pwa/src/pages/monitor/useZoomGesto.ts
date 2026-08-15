/**
 * useZoomGesto — zoom por gesto y ventana COMPARTIDA entre gráficos.
 *
 * ── Por qué un hook y no el código repetido ─────────────────────────────────
 *
 * Los dos gráficos del monitor —velocidad y comparador— miran el mismo turno
 * por el mismo eje: minutos desde el primer tramo con dato. Que al acercarse en
 * uno el otro muestre el MISMO tramo es lo que permite cruzar "acá se cayó la
 * velocidad" con "acá se abrió la brecha" (pedido de Orel, 14-08). Para eso los
 * dos tienen que hablar el mismo idioma, y ese idioma es este hook.
 *
 * ⚠⚠ Lo que se comparte es la VENTANA EN MINUTOS, no el nivel de zoom. Los dos
 * ejes no cubren lo mismo: el comparador llega hasta el cierre proyectado y el
 * de velocidad hasta el último tramo con dato. Compartiendo un "2,4×" a secas,
 * uno de los dos terminaría mirando un vacío; compartiendo minutos, cada uno
 * recorta lo suyo y ambos muestran el mismo tramo de turno.
 *
 * ── Cómo funciona el zoom ──────────────────────────────────────────────────
 *
 * Ensanchando el contenido dentro de un contenedor con scroll: el paneo es el
 * scroll nativo, que en el celular arrastra y frena con inercia sin una línea
 * de código. `zoom` es cuántas veces el contenido es más ancho que la ventana.
 *
 * ⚠⚠ Los listeners de `wheel` y `touchmove` van NATIVOS con `passive: false`.
 * React los registra como pasivos y ahí `preventDefault()` no hace nada: la
 * rueda seguiría desplazando la página y el pellizco haría zoom del navegador
 * entero por encima del gráfico.
 *
 * ⚠⚠ Y hay que cortar la propagación del touch: la página escucha swipe para
 * cambiar de turno con umbral de 60 px, y un pellizco mueve los dedos mucho más
 * que eso — acercarse al detalle terminaría abriendo el turno anterior.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Tramo de turno visible, en minutos desde el primer tramo con dato. */
export interface Ventana {
  desdeMin: number
  hastaMin: number
}

const ZOOM_MAX = 12
/** Por debajo de esto se considera "sin zoom": evita rebotes por redondeo. */
const SIN_ZOOM = 1.02

export function useZoomGesto({ dominioMin, ventana, onVentana }: {
  /** Minutos de turno que abarca el gráfico COMPLETO. */
  dominioMin: number
  /** La ventana compartida. null = todo el turno. */
  ventana?: Ventana | null
  /** Se llama cuando el usuario cambia el zoom o panea. */
  onVentana?: (v: Ventana | null) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom
  /** Ancla del zoom: qué punto del contenido dejar quieto al reescalar. */
  const anclaRef = useRef<{ x: number; ratio: number } | null>(null)
  /** Mientras se aplica una ventana ajena NO se publica: cortaría el lazo. */
  const aplicandoRef = useRef(false)
  const dominioRef = useRef(dominioMin)
  dominioRef.current = dominioMin
  const onVentanaRef = useRef(onVentana)
  onVentanaRef.current = onVentana

  /** La ventana que este gráfico está mostrando ahora mismo. */
  const ventanaActual = useCallback((): Ventana | null => {
    const el = scrollRef.current
    if (!el || el.scrollWidth <= 0 || dominioRef.current <= 0) return null
    const d = dominioRef.current
    const desdeMin = (el.scrollLeft / el.scrollWidth) * d
    const hastaMin = ((el.scrollLeft + el.clientWidth) / el.scrollWidth) * d
    return { desdeMin, hastaMin }
  }, [])

  const publicar = useCallback(() => {
    if (aplicandoRef.current || !onVentanaRef.current) return
    if (zoomRef.current <= SIN_ZOOM) {
      onVentanaRef.current(null)
      return
    }
    const v = ventanaActual()
    if (v) onVentanaRef.current(v)
  }, [ventanaActual])

  /** Aplica un zoom nuevo dejando quieto el punto que se está mirando. */
  const zoomA = useCallback((nuevo: number, clientX?: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(1, nuevo))
    const el = scrollRef.current
    if (el && el.scrollWidth > 0) {
      const r = el.getBoundingClientRect()
      const x = clientX == null ? r.width / 2 : Math.max(0, Math.min(r.width, clientX - r.left))
      anclaRef.current = { x, ratio: (el.scrollLeft + x) / el.scrollWidth }
    }
    setZoom(z)
  }, [])

  // El reposicionado va DESPUÉS del layout: el ancho del contenido recién
  // cambió y `scrollLeft` se calcula contra el nuevo `scrollWidth`.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const a = anclaRef.current
    if (!el || !a) return
    anclaRef.current = null
    el.scrollLeft = Math.max(0, a.ratio * el.scrollWidth - a.x)
    publicar()
  }, [zoom, publicar])

  /*
   * Adoptar la ventana que viene de afuera. Se compara con la propia antes de
   * tocar nada: sin eso, dos gráficos sincronizados se corrigen mutuamente en
   * un lazo infinito por diferencias de redondeo.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || dominioMin <= 0) return
    const propia = ventanaActual()
    const iguales = (a: Ventana | null, b: Ventana | null) =>
      (a == null && b == null) ||
      (a != null && b != null &&
        Math.abs(a.desdeMin - b.desdeMin) < 1 && Math.abs(a.hastaMin - b.hastaMin) < 1)

    if (ventana == null) {
      if (zoomRef.current <= SIN_ZOOM) return
      aplicandoRef.current = true
      setZoom(1)
      requestAnimationFrame(() => { aplicandoRef.current = false })
      return
    }
    if (iguales(propia, ventana)) return

    /*
     * La ventana ajena se RECORTA al dominio propio: si el otro gráfico llega
     * más lejos (el comparador dibuja hasta el cierre proyectado), pedir su
     * tramo tal cual dejaría a este mirando el vacío del final.
     */
    const desde = Math.max(0, Math.min(ventana.desdeMin, dominioMin))
    const hasta = Math.min(dominioMin, Math.max(ventana.hastaMin, desde + 1))
    const ancho = hasta - desde
    if (ancho <= 0) return
    const z = Math.min(ZOOM_MAX, Math.max(1, dominioMin / ancho))
    aplicandoRef.current = true
    anclaRef.current = null
    setZoom(z)
    // El scroll se fija cuando el ancho ya cambió; dos frames alcanzan porque
    // el segundo corre con el layout nuevo.
    requestAnimationFrame(() => {
      const e2 = scrollRef.current
      if (e2) e2.scrollLeft = (desde / dominioMin) * e2.scrollWidth
      requestAnimationFrame(() => { aplicandoRef.current = false })
    })
  }, [ventana, dominioMin, ventanaActual])

  // Gestos: rueda con modificador, pellizco y arrastre.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let d0 = 0
    let z0 = 1
    let t: ReturnType<typeof setTimeout> | null = null

    const onWheel = (ev: WheelEvent) => {
      // Sin modificador la rueda sigue desplazando la página: secuestrar el
      // scroll de un bloque chico hace que la pantalla se sienta rota. El
      // pellizco del trackpad llega justamente como ctrl+wheel.
      if (!ev.ctrlKey && !ev.metaKey) return
      ev.preventDefault()
      zoomA(zoomRef.current * (ev.deltaY < 0 ? 1.25 : 0.8), ev.clientX)
    }
    const dist = (ts: TouchList) =>
      Math.hypot(ts[0]!.clientX - ts[1]!.clientX, ts[0]!.clientY - ts[1]!.clientY)

    const onTouchStart = (ev: TouchEvent) => {
      if (zoomRef.current > SIN_ZOOM) ev.stopPropagation()
      if (ev.touches.length !== 2) return
      ev.stopPropagation()
      d0 = dist(ev.touches)
      z0 = zoomRef.current
    }
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 2 || d0 <= 0) return
      ev.preventDefault()
      ev.stopPropagation()
      const centro = (ev.touches[0]!.clientX + ev.touches[1]!.clientX) / 2
      zoomA(z0 * (dist(ev.touches) / d0), centro)
    }
    const onTouchEnd = (ev: TouchEvent) => {
      if (d0 > 0 || zoomRef.current > SIN_ZOOM) ev.stopPropagation()
      if (ev.touches.length < 2) d0 = 0
    }
    // El paneo publica al FRENAR, no en cada píxel: el scroll dispara decenas
    // de eventos por gesto y el otro gráfico se reacomodaría a los saltos.
    const onScroll = () => {
      if (t) clearTimeout(t)
      t = setTimeout(publicar, 120)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (t) clearTimeout(t)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('scroll', onScroll)
    }
  }, [zoomA, publicar])

  /** Arrastre con el mouse para panear (el touch ya panea con el scroll). */
  const arrastre = useRef<{ x: number; left: number } | null>(null)
  const props = {
    ref: scrollRef,
    onDoubleClick: () => { onVentanaRef.current?.(null); zoomA(1) },
    onPointerDown: (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.pointerType !== 'mouse' || zoomRef.current <= SIN_ZOOM) return
      arrastre.current = { x: ev.clientX, left: ev.currentTarget.scrollLeft }
    },
    onPointerMove: (ev: React.PointerEvent<HTMLDivElement>) => {
      const a = arrastre.current
      if (!a) return
      ev.currentTarget.scrollLeft = a.left - (ev.clientX - a.x)
    },
    onPointerUp: () => { arrastre.current = null },
    onPointerLeave: () => { arrastre.current = null },
  }

  return {
    /** Va en el contenedor con `overflow-x-auto`. */
    props,
    zoom,
    acercado: zoom > SIN_ZOOM,
    verTodo: () => { onVentanaRef.current?.(null); zoomA(1) },
  }
}
