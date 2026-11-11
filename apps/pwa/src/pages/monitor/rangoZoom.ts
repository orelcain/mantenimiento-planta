/**
 * La geometría de la franja de rango de «Ritmo en vivo» (`FranjaRango`): qué ventana queda al arrastrar y cómo se dibuja la mini
 * curva. Pura, para probarla sin pantalla.
 */
import type { Punto } from './ejeTurno'
import type { Ventana } from './useZoomGesto'

/** La ventana más corta que se puede dejar, en minutos. */
export const VENTANA_MIN = 10

export type ModoArrastre = 'mover' | 'inicio' | 'fin'

/** Acota una ventana al turno y a su ancho mínimo; el ancho se conserva al chocar con un borde. */
export function ajustarVentana(v: Ventana, totalMin: number, minAncho = VENTANA_MIN): Ventana {
  const min = Math.min(minAncho, totalMin)
  const ancho = Math.min(totalMin, Math.max(min, v.hastaMin - v.desdeMin))
  let desde = v.desdeMin
  if (desde < 0) desde = 0
  if (desde + ancho > totalMin) desde = totalMin - ancho
  return { desdeMin: desde, hastaMin: desde + ancho }
}

/** La ventana después de arrastrar `dMin` minutos desde `base` en el modo dado. */
export function aplicarArrastre(modo: ModoArrastre, dMin: number, base: Ventana, totalMin: number, minAncho = VENTANA_MIN): Ventana {
  const min = Math.min(minAncho, totalMin)
  if (modo === 'inicio') {
    const desde = Math.min(Math.max(0, base.desdeMin + dMin), base.hastaMin - min)
    return { desdeMin: desde, hastaMin: base.hastaMin }
  }
  if (modo === 'fin') {
    const hasta = Math.max(Math.min(totalMin, base.hastaMin + dMin), base.desdeMin + min)
    return { desdeMin: base.desdeMin, hastaMin: hasta }
  }
  return ajustarVentana({ desdeMin: base.desdeMin + dMin, hastaMin: base.hastaMin + dMin }, totalMin, minAncho)
}

/** El trazo de la mini curva (`viewBox` 0 0 100 `alto`): el acumulado del turno de punta a punta, con 4 px de aire arriba y abajo. */
export function trazoMini(puntos: readonly Punto[], totalMin: number, yMax: number, alto = 44): string {
  if (puntos.length < 2 || !(totalMin > 0) || !(yMax > 0)) return ''
  const util = alto - 8
  const f2 = (n: number) => n.toFixed(2) // decimal-tecnico: coordenada de un atributo SVG, no es una cifra que alguien lea
  return puntos
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${f2((Math.min(totalMin, Math.max(0, p.min)) / totalMin) * 100)} ${f2(alto - 4 - Math.min(1, Math.max(0, p.v / yMax)) * util)}`)
    .join(' ')
}
