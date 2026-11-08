/**
 * Vidrio sólido en equipos de gama baja (PLAN_VIDRIO_LIQUIDO.md, Fase 1).
 *
 * Si el equipo declara ≤ 4 GB de memoria (`deviceMemory`) o ≤ 4 núcleos
 * (`hardwareConcurrency`), <html> recibe la clase `vidrio-solido` y el material
 * `.vidrio` queda sólido (ver index.css). Datos ausentes (Safari, Firefox no
 * exponen deviceMemory) no marcan nada: quedan en vidrio.
 */
export interface DatosEquipo {
  deviceMemory?: number
  hardwareConcurrency?: number
}

export function esGamaBaja(equipo: DatosEquipo | null | undefined): boolean {
  if (!equipo) return false
  const { deviceMemory: memoria, hardwareConcurrency: nucleos } = equipo
  return (typeof memoria === 'number' && memoria <= 4) || (typeof nucleos === 'number' && nucleos <= 4)
}

/** Pone o quita `vidrio-solido` en la raíz según el equipo. Devuelve si quedó sólido. */
export function marcarVidrioSolido(
  raiz: Pick<HTMLElement, 'classList'>,
  equipo: DatosEquipo | null | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
  const solido = esGamaBaja(equipo)
  raiz.classList.toggle('vidrio-solido', solido)
  return solido
}
