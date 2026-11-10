/**
 * useAncho — ancho medido de un contenedor, en px enteros.
 *
 * Para los gráficos SVG del modo lectura: el viewBox mide lo mismo que se pinta,
 * así el texto sale a 13 px reales. `inicial` es el ancho que se usa antes de la
 * primera medición (y en entornos sin ResizeObserver).
 */
import { useEffect, useRef, useState } from 'react'

export function useAncho<T extends HTMLElement = HTMLDivElement>(inicial: number) {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(inicial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medido = Math.round(el.getBoundingClientRect().width)
    if (medido > 0) setAncho(medido)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0)
      if (w > 0) setAncho(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}
