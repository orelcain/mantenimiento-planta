/**
 * gateEvolutionColors.ts — colores de las 12 líneas de GateEvolutionChart.
 *
 * Sin `data-paleta="pizarra"`, `gateColor` devuelve EXACTAMENTE el hex de siempre. Con ella: color por
 * ENTIDAD (gate), gates 1-5 = series 1-5 y 6-12 = «Otros».
 */
import { elegirColor } from '@/lib/coloresGrafico'

// Paleta para 12 gates (saturada, distinguible en dark mode)
const GATE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

/**
 * Color del gate. Pizarra: color por ENTIDAD (no por ranking, un filtro no repinta a los demás):
 * los gates 1-5 son las series 1-5 y del 6 al 12 van en «Otros» (sus nombres están al final de
 * la línea y en las chips).
 */
export function gateColor(gateNumber: number): string {
  const i = (gateNumber - 1) % GATE_COLORS.length
  return elegirColor(GATE_COLORS[i]!, i < 5 ? `serie-${i + 1}` : 'serie-otros')
}

/** Luminancia relativa WCAG de un color `rgb(r, g, b)` (el que devuelve `elegirColor` con Pizarra). */
function luminanciaRgb(c: string): number | null {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c)
  if (!m) return null
  const lin = (v: string) => {
    const x = Number(v) / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(m[1]!) + 0.7152 * lin(m[2]!) + 0.0722 * lin(m[3]!)
}

/**
 * Tinta legible sobre el color del gate (los claros —lima, ámbar, cian— piden tinta oscura).
 * Con `rgb(...)` (Pizarra) se elige la tinta de mayor contraste real; con hex, la regla de siempre.
 */
export function inkOn(hex: string): string {
  const lumRgb = luminanciaRgb(hex)
  if (lumRgb != null) {
    // Contraste contra #FFFFFF vs contra #0d1722 (L ≈ 0,008)
    return 1.05 / (lumRgb + 0.05) >= (lumRgb + 0.05) / 0.058 ? '#ffffff' : '#0d1722'
  }
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.55 ? '#0d1722' : '#ffffff'
}
