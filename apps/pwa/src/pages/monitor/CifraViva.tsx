/**
 * La cifra que cuenta con el «reloj de datos» (DESIGN.md §8): sube un escalón por pieza al ritmo de la cola de reproducción
 * (`useReproduccionMinuto`) o, sin ella, avanza en línea recta entre dos lecturas REALES de Shoplogix (`useRelojDeDatos`).
 * Escribe el texto solo cuando cambia el entero y con `tabular-nums` (para que no baile). La usan «Piezas del turno» de la
 * franja, el Duelo (PC y celular) y la cifra grande del Modo TV: todas leen el MISMO reloj.
 *
 * ⚠ Ni un frame con el contador vivo (`respaldo`): el primer pintado ya es el valor del reloj en ese instante. Antes se
 * pintaba `respaldo` (el contador de planta, que va ~3 min por delante de lo reproducido) y recién después del primer
 * efecto se corregía: un parpadeo de cifra equivocada en cada montaje. `respaldo` solo vale si el reloj no tiene valor.
 */
import { useEffect, useRef, useState } from 'react'
import { int } from './ejeTurno'
import type { RelojDeDatos } from './useRelojDeDatos'

/** Un número que sigue al reloj de datos. Sin lectura, o sin reloj de por medio, muestra `respaldo`. */
export function CifraViva({ reloj, respaldo, className }: { reloj: RelojDeDatos; respaldo: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  /* El texto inicial sale del reloj y NO cambia con los renders: React no vuelve a escribir el nodo, solo lo hace el reloj. */
  const [inicial] = useState(() => int(reloj.cuadro().valor ?? respaldo))
  const ultimo = useRef(inicial)
  useEffect(() => reloj.alCuadro((c) => {
    const el = ref.current
    if (!el) return
    const t = int(c.valor ?? respaldo)
    /* Se compara con lo que HAY en el nodo, no solo con lo último escrito. */
    if (t !== ultimo.current || el.textContent !== t) { ultimo.current = t; el.textContent = t }
  }), [reloj, respaldo])
  return <span ref={ref} className={className}>{inicial}</span>
}
