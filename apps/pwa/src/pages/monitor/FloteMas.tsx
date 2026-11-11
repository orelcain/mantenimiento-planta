/**
 * El «+N» flotante sobre «Piezas del turno» y la cifra grande del Modo TV (spec §4). Cuando el reloj único suma piezas, un
 * «+N» sube 12 px y se desvanece en 1,1 s; las que entran en 600 ms se agrupan en el mismo («+2», «+3»).
 *
 * Sobrio: color de acento, sin rebote. UN solo nodo reutilizado por contador (WAAPI sobre ese nodo: solo `transform` y
 * `opacity`, nada de layout) y ningún render de React por cuadro. Con «reducir movimiento» no hay nada (es adorno; el conteo,
 * que es dato, sigue). Un salto del reloj (recarga, otro turno, contador que baja, o un tirón por volver a una pestaña dormida)
 * NO flota: no son piezas que hayan caído.
 */
import { useEffect, useRef } from 'react'
import type { RelojDeDatos } from './useRelojDeDatos'

/** Las piezas que entran en esta ventana se agrupan en un solo «+N». */
export const AGRUPA_MS = 600
/** Duración del vuelo. */
export const VUELO_MS = 1100
/** Más piezas que estas en UN cuadro no son piezas cayendo una a una (pestaña dormida, tirón): no flotan. */
export const MAX_POR_CUADRO = 8
const CURVA = 'cubic-bezier(0.22, 0.9, 0.24, 1)'

/** 0 → 1 (12 %) → 1 (65 %) → 0, subiendo de 4 px abajo a 12 px arriba. */
const VUELO: Keyframe[] = [
  { opacity: 0, transform: 'translateY(4px)', offset: 0 },
  { opacity: 1, offset: 0.12 },
  { opacity: 1, offset: 0.65 },
  { opacity: 0, transform: 'translateY(-12px)', offset: 1 },
]

export function FloteMas({ reloj, className }: { reloj: RelojDeDatos; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  /* El estado vive en refs: volver a suscribirse (el reloj cambia ~una vez por minuto) no corta un «+N» que está volando. */
  const previo = useRef<number | null>(null)
  const saltos = useRef<number | null>(null)
  const n = useRef(0)
  const ultimoMs = useRef(-Infinity)
  const anim = useRef<Animation | null>(null)

  useEffect(() => {
    if (reloj.reducido) return
    return reloj.alCuadro((c) => {
      const el = ref.current
      if (!el) return
      const s = c.rep?.saltos ?? 0
      if (c.valor == null) { previo.current = null; return }
      const ent = Math.round(c.valor)
      if (previo.current == null || saltos.current !== s) { previo.current = ent; saltos.current = s; return }
      const d = ent - previo.current
      previo.current = ent
      if (d <= 0 || d > MAX_POR_CUADRO) return
      const ahora = performance.now()
      n.current = ahora - ultimoMs.current < AGRUPA_MS ? n.current + d : d
      ultimoMs.current = ahora
      el.textContent = `+${n.current}`
      anim.current?.cancel()
      anim.current = typeof el.animate === 'function' ? el.animate(VUELO, { duration: VUELO_MS, easing: CURVA, fill: 'both' }) : null
    })
  }, [reloj, reloj.reducido])
  useEffect(() => () => { anim.current?.cancel() }, [])

  return (
    <span className="flote-zona" aria-hidden>
      <span ref={ref} className={`flote${className ? ` ${className}` : ''}`} />
    </span>
  )
}
