/**
 * El chip de desfase de la cabecera (spec §3). Dice, con el estado del reloj único, qué tan atrás va lo que se ve respecto
 * de la planta, y reemplaza a la nota «reproducción del último minuto · 1 min de desfase» / «sin lectura nueva desde»:
 *
 *   «En vivo · 3 min de desfase»                     (neutro)            estado `vivo`
 *   «Poniéndose al día · m:ss»                       (neutro)            estado `poniendose` (factor > 1; m:ss = atraso del reloj)
 *   «Shoplogix atrasado · sin datos desde HH:MM»     (ámbar)             estado `atrasado` (cola vacía, reloj congelado)
 *   «Línea detenida»                                 (rojo)              estado `detenida` (el minuto llegó con 0 piezas)
 *
 * No calcula nada: lee `CuadroRep` (`estado`, `atrasoS`, `ultimaLecturaHHMM`). El texto se escribe por ref solo cuando cambia
 * (el m:ss cambia por segundo, no por cuadro); React no se entera. Sin reproducción activa no dibuja nada.
 */
import { useEffect, useRef, useState } from 'react'
import { chipDeCuadro, type TonoChip } from './chipDesfaseTexto'
import { useReproduccion } from './useReproduccionMinuto'

export function ChipDesfase({ className }: { className?: string }) {
  const rep = useReproduccion()
  const activa = rep?.activa ?? false
  const reloj = rep?.reloj
  const nodo = useRef<HTMLSpanElement>(null)
  const texto = useRef<HTMLSpanElement>(null)
  /* El primer pintado ya es lo que dice el reloj (como `CifraViva`): React no vuelve a escribir estos nodos. */
  const [inicial] = useState(() => (activa && reloj ? chipDeCuadro(reloj.cuadro().rep) : { tono: 'vivo' as TonoChip, texto: '' }))
  useEffect(() => {
    if (!activa || !reloj) return
    let tono = ''
    let txt = ''
    return reloj.alCuadro((c) => {
      const el = nodo.current
      const t = texto.current
      if (!el || !t) return
      const q = chipDeCuadro(c.rep)
      if (q.tono !== tono) { tono = q.tono; el.dataset.st = q.tono }
      if (q.texto !== txt || t.textContent !== q.texto) { txt = q.texto; t.textContent = q.texto }
    })
  }, [activa, reloj])
  if (!activa) return null
  return (
    <span ref={nodo} className={`v2-chip-desfase${className ? ` ${className}` : ''}`} data-st={inicial.tono}>
      <i aria-hidden />
      <span ref={texto} className="v2-chip-desfase-t">{inicial.texto}</span>
    </span>
  )
}
