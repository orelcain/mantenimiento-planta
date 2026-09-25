/** Giro de una hoja del plano, en grados horarios. */
export type Giro = 0 | 90 | 180 | 270

/**
 * Del punto del dibujo (x, y) al punto de la hoja YA girada, y la transformación
 * CSS que produce ese mismo giro (con `transform-origin: 0 0`). La capa girada
 * vive dentro de un marco de VW×VH, así el zoom, el encuadre y el foco trabajan
 * siempre sobre el marco sin saber del giro.
 */
export function geometriaGiro(giro: Giro, W: number, H: number) {
  switch (giro) {
    case 90: return { VW: H, VH: W, css: `translate(${H}px,0) rotate(90deg)`, punto: (x: number, y: number) => [H - y, x] as const }
    case 180: return { VW: W, VH: H, css: `translate(${W}px,${H}px) rotate(180deg)`, punto: (x: number, y: number) => [W - x, H - y] as const }
    case 270: return { VW: H, VH: W, css: `translate(0,${W}px) rotate(270deg)`, punto: (x: number, y: number) => [y, W - x] as const }
    default: return { VW: W, VH: H, css: '', punto: (x: number, y: number) => [x, y] as const }
  }
}

/** El giro siguiente (+90°, vuelve a 0 tras 270). */
export const siguienteGiro = (g: Giro | undefined): Giro => ((((g ?? 0) + 90) % 360) as Giro)
