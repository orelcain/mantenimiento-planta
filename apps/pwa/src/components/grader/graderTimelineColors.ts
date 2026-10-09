/**
 * graderTimelineColors.ts — colores de calibre, error P0 y gate del gráfico segundo a segundo
 * (GraderTimelineChart). Sacados del componente para poder probar la regla de la paleta Pizarra:
 *
 *  · Sin `data-paleta="pizarra"` cada función devuelve EXACTAMENTE el hex de siempre.
 *  · Con ella aplica «foco, contexto, estado»: calibres = rampa ordinal de 4 pasos, errores y
 *    gates = series 1-5 en orden fijo y «Otros» para lo que sobra.
 */
import { elegirColor } from '@/lib/coloresGrafico'
import type { UpstreamProductionInterval } from '@/services/shoplogix/types'

const CALIBRE_COLORS: Record<string, string> = {
  '0-2': '#94a3b8', '1-2': '#94a3b8',
  '2-3': '#3b82f6', '2-4': '#3b82f6',
  '3-4': '#10b981',
  '4-5': '#f59e0b', '4-6': '#f59e0b',
  '5-6': '#ef4444',
  '6-8': '#ec4899',
  '8-10': '#8b5cf6',
  '10-12': '#14b8a6',
  '12+': '#f97316',
}
const DEFAULT_CALIBRE_COLOR = '#6b7280'

/**
 * Pizarra: los calibres son un ORDEN (de liviano a pesado), no 12 categorías: van en la rampa
 * secuencial de 4 pasos (más oscuro = más pesado en Día; más claro en Penumbra). El peso ya
 * está en el eje Y; el color solo agrupa. Calibre desconocido = neutro medio.
 */
const CALIBRE_RAMPA: Record<string, number> = {
  '0-2': 1, '1-2': 1, '2-3': 1, '2-4': 1,
  '3-4': 2, '4-5': 2, '4-6': 2,
  '5-6': 3, '6-8': 3,
  '8-10': 4, '10-12': 4, '12+': 4,
}

const ERROR_COLORS: Record<string, string> = {
  'Fuera de rango': '#ef4444',
  'Fuera de límites': '#f59e0b',
  'No leído por fotocélula': '#8b5cf6',
  'No leido por fotocelula': '#8b5cf6',
  'Too close or too long': '#3b82f6',
  'Puerta no preparada': '#10b981',
  'Desconocido': '#6b7280',
}
const DEFAULT_ERROR_COLOR = '#6b7280'

/**
 * Pizarra: token del TIPO de error P0, por entidad y en orden fijo. Los cuatro tipos oficiales
 * de Matrix siguen el mismo orden que las causas de `causaColor` (límites = serie 1, fotocélula = 2,
 * too close = 3, puerta = 4); «fuera de rango» = serie 5; «Desconocido», «Otro» y lo no listado → Otros.
 * Acepta la etiqueta ("Fuera de límites", "No leído por fotocélula") o el id ("fuera_de_limites").
 */
export function tokenTipoError(nombre: string): string {
  const k = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  if (k.includes('limites')) return 'serie-1'
  if (k.includes('leido')) return 'serie-2'
  if (k.includes('tooclose')) return 'serie-3'
  if (k.includes('puerta')) return 'serie-4'
  if (k.includes('rango')) return 'serie-5'
  return 'serie-otros'
}

/** Color de un tipo de error en canvas/HTML: `hoy` (el literal del gráfico) sin Pizarra; con ella, su token. */
export function colorTipoError(nombre: string, hoy: string, alfa = 1): string {
  return elegirColor(hoy, tokenTipoError(nombre), alfa)
}

export function getCalibreColor(calibre: string): string {
  for (const [key, color] of Object.entries(CALIBRE_COLORS)) {
    if (calibre.includes(key)) return elegirColor(color, `shift-ramp-${CALIBRE_RAMPA[key] ?? 1}`)
  }
  return elegirColor(DEFAULT_CALIBRE_COLOR, 'grafico-neutro-medio')
}

export function getErrorColor(error: string): string {
  for (const [key, color] of Object.entries(ERROR_COLORS)) {
    if (error.toLowerCase().includes(key.toLowerCase())) return colorTipoError(key, color)
  }
  return colorTipoError('', DEFAULT_ERROR_COLOR)
}

const GATE_PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#e11d48']

/** Gate → color. Pizarra: las 5 primeras posiciones de la paleta = series 1-5; el resto, «Otros». */
export function gateColor(gate: number): string {
  const i = (gate - 1) % GATE_PALETTE.length
  return elegirColor(GATE_PALETTE[i]!, i < 5 ? `serie-${i + 1}` : 'serie-otros')
}

const COLOR_MAP: Record<UpstreamProductionInterval['color'], string> = {
  green:  'rgba(16, 185, 129, 0.9)',  // emerald-500
  yellow: 'rgba(245, 158, 11, 0.9)',  // amber-500
  red:    'rgba(244, 63, 94, 0.9)',   // rose-500
  gray:   'rgba(51, 65, 85, 0.6)',    // slate-700
}

/**
 * Pizarra («foco, contexto, estado»): las bandas de cumplimiento son las MISMAS de hoy
 * (verde ≥ umbral, amarillo ≥ umbral/2, rojo debajo; ver shoplogixNormalizer), solo cambia lo que
 * se pinta: dentro de banda = serie 1 (acento), banda baja = aviso, banda crítica = falla, y
 * sin objetivo (gris) = neutro medio. No se inventa ninguna banda nueva.
 */
const COLOR_PIZARRA: Record<UpstreamProductionInterval['color'], { token: string; alfa: number }> = {
  green:  { token: 'serie-1', alfa: 0.9 },
  yellow: { token: 'grafico-aviso', alfa: 0.9 },
  red:    { token: 'grafico-falla', alfa: 0.9 },
  gray:   { token: 'grafico-neutro-medio', alfa: 0.6 },
}

/** Color de la barra de un intervalo: `COLOR_MAP` sin Pizarra; con ella, su banda en la paleta. */
export function colorBarraProduccion(color: UpstreamProductionInterval['color']): string {
  const p = COLOR_PIZARRA[color]
  return elegirColor(COLOR_MAP[color], p.token, p.alfa)
}
