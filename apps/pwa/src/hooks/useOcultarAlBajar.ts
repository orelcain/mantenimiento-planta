/**
 * useOcultarAlBajar — ¿el botón flotante debe esconderse ahora?
 *
 * Se oculta mientras la página baja, para no tapar lo que se lee. Vuelve al subir,
 * o cuando el scroll se detiene un rato.
 *
 * Escucha en CAPTURA desde `document`: el evento `scroll` no sube por el árbol,
 * así que así se recibe el scroll de cualquier contenedor (la app no siempre
 * desplaza `window`). Cada contenedor lleva su propia posición previa, para que
 * un scroll interno no se mezcle con el de la página.
 */
import { useEffect, useState } from 'react'

export function useOcultarAlBajar(umbralPx = 6, esperaMs = 600): boolean {
  const [oculto, setOculto] = useState(false)

  useEffect(() => {
    const previa = new Map<EventTarget, number>()
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const posicion = (objetivo: EventTarget): number =>
      objetivo === document ? window.scrollY : (objetivo as Element).scrollTop ?? 0

    const alDesplazar = (e: Event) => {
      const objetivo = e.target ?? document
      const ahora = posicion(objetivo)
      const antes = previa.get(objetivo) ?? ahora
      previa.set(objetivo, ahora)
      const delta = ahora - antes
      if (Math.abs(delta) >= umbralPx) setOculto(delta > 0)
      if (temporizador) clearTimeout(temporizador)
      temporizador = setTimeout(() => setOculto(false), esperaMs)
    }

    document.addEventListener('scroll', alDesplazar, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', alDesplazar, { capture: true })
      if (temporizador) clearTimeout(temporizador)
    }
  }, [umbralPx, esperaMs])

  return oculto
}
