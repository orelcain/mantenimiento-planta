/**
 * La cifra que cuenta con el «reloj de datos» (DESIGN.md §8): avanza en línea recta entre dos lecturas REALES de Shoplogix
 * (`useRelojDeDatos`) o, con la reproducción del último minuto activa, sube un escalón por pieza. Escribe el texto solo
 * cuando cambia el entero y con `tabular-nums` (para que no baile). La usan «Piezas del turno» de la franja y el Duelo en PC.
 */
import { useEffect, useRef } from 'react'
import { int } from './ejeTurno'
import type { RelojDeDatos } from './useRelojDeDatos'

/** Un número que sigue al reloj de datos. Sin lectura, o sin reloj de por medio, muestra `respaldo`. */
export function CifraViva({ reloj, respaldo, className }: { reloj: RelojDeDatos; respaldo: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const ultimo = useRef(int(respaldo))
  useEffect(() => reloj.alCuadro((c) => {
    const el = ref.current
    if (!el) return
    const t = int(c.valor ?? respaldo)
    /* Se compara con lo que HAY en el nodo: React reescribe el texto con `respaldo` cuando éste cambia, y el valor que
       muestra la reproducción (un escalón por pieza) puede ir por debajo de él. */
    if (t !== ultimo.current || el.textContent !== t) { ultimo.current = t; el.textContent = t }
  }), [reloj, respaldo])
  return <span ref={ref} className={className}>{int(respaldo)}</span>
}
