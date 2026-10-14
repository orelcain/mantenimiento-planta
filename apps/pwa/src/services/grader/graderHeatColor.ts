/**
 * graderHeatColor.ts — color de «mapa de calor» para barras de cantidad (calibres, compuertas).
 *
 * Sin `data-paleta="pizarra"` es EXACTAMENTE el degradado de siempre: azul (valor bajo) → verde →
 * rojo (valor alto), que se usaba en `GraderTurnoDetailView`.
 *
 * Con Pizarra («foco, contexto, estado») la cantidad es una magnitud, no un estado: va en la rampa
 * SECUENCIAL de un solo tono (paso 1 → paso 4 de `--shift-ramp-*`: menos → más). Rojo y verde
 * quedan reservados para estados fuera de una banda fijada de antemano.
 */
import { elegirColor, hayPizarra } from '@/lib/coloresGrafico'

function hexARgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Color del valor dentro de [min, max] con la opacidad pedida. */
export function heatColor(value: number, min: number, max: number, alpha = 0.78): string {
  const t = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5
  // Pizarra: interpolación entre el primer y el último paso de la rampa secuencial.
  if (hayPizarra()) {
    const bajo = hexARgb(elegirColor('#3b82f6', 'shift-ramp-1'))
    const alto = hexARgb(elegirColor('#ef4444', 'shift-ramp-4'))
    if (bajo && alto) {
      const r = Math.round(bajo[0] * (1 - t) + alto[0] * t)
      const g = Math.round(bajo[1] * (1 - t) + alto[1] * t)
      const b = Math.round(bajo[2] * (1 - t) + alto[2] * t)
      return `rgba(${r},${g},${b},${alpha})`
    }
  }
  let r: number, g: number, b: number
  if (t <= 0.5) {
    // azul → verde
    const s = t / 0.5
    r = Math.round(59 * (1 - s) + 16 * s)
    g = Math.round(130 * (1 - s) + 185 * s)
    b = Math.round(246 * (1 - s) + 129 * s)
  } else {
    // verde → rojo
    const s = (t - 0.5) / 0.5
    r = Math.round(16 * (1 - s) + 239 * s)
    g = Math.round(185 * (1 - s) + 68 * s)
    b = Math.round(129 * (1 - s) + 68 * s)
  }
  return `rgba(${r},${g},${b},${alpha})`
}

/** Borde del mismo color, sólido. */
export function heatBorder(value: number, min: number, max: number): string {
  return heatColor(value, min, max, 1)
}
