/**
 * graderQualityColors.ts — colores por categoría de calidad de pieza.
 *
 * FUENTE ÚNICA DE VERDAD para los colores asociados a cada calidad
 * (premium, superior, primera, etc.). Antes vivían duplicados en al menos
 * 2 lugares con representaciones distintas:
 *   - `GateBreakdownCard` usaba HEX (#6366f1, …) para inline styles ECharts
 *   - `CurrentGateConfigPanel` usaba clases Tailwind (text-indigo-400, …)
 *     para className de spans
 *
 * Ambos hacían normalización idéntica (`replace(/[^a-z]/g, '')` + lowercase)
 * pero con conjuntos de calidades ligeramente distintos — riesgo de drift.
 *
 * Aplica el principio "consistencia entre elementos" del CLAUDE.md.
 */

import { elegirColor } from '@/lib/coloresGrafico'

// ── Conjunto canónico ────────────────────────────────────────────────────────

/**
 * Lista canónica de calidades reconocidas. El orden refleja la jerarquía
 * típica del Grader (mejor → peor / industrial / descarte).
 *
 * `grado` y `d` son alias de calibres con sufijo "grado" o "D" que aparecen
 * en algunos turnos legacy — se mantienen para retrocompatibilidad visual.
 */
const QUALITY_KEYS = [
  'premium',
  'superior',
  'primera',
  'segunda',
  'tercera',
  'industrial',
  'descarte',
  'grado',
  'd',
] as const

type QualityKey = typeof QUALITY_KEYS[number]

// ── Mapa de colores ──────────────────────────────────────────────────────────

interface QualityColorEntry {
  /** Hex sólido (para inline styles, ECharts, exportación PDF/PNG). */
  hex: string
  /** Clase Tailwind para color de texto (`text-…-400`). */
  textClass: string
}

const QUALITY_COLORS: Record<QualityKey, QualityColorEntry> = {
  // Variantes `pizarra:` (solo casan con la paleta Pizarra; sin ella la clase es la de siempre).
  // Texto: la rampa --calidad-4/5 no llega a 4,5:1 como tinta (Día 3,9 y 2,9:1), así que segunda y
  // tercera usan la tinta del acero (--cat-1-ink); el resto sigue la correspondencia de QUALITY_TOKENS.
  premium:    { hex: '#6366f1', textClass: 'text-indigo-400 pizarra:text-[var(--calidad-1)]'  },
  superior:   { hex: '#10b981', textClass: 'text-emerald-400 pizarra:text-[var(--calidad-2)]' },
  primera:    { hex: '#3b82f6', textClass: 'text-blue-400 pizarra:text-[var(--calidad-3)]'    },
  segunda:    { hex: '#f59e0b', textClass: 'text-amber-400 pizarra:text-cat-1-ink'   },
  tercera:    { hex: '#f97316', textClass: 'text-orange-400 pizarra:text-cat-1-ink'  },
  industrial: { hex: '#94a3b8', textClass: 'text-slate-400 pizarra:text-cat-4-ink'   },
  descarte:   { hex: '#ef4444', textClass: 'text-red-400 pizarra:text-cat-6-ink'     },
  grado:      { hex: '#06b6d4', textClass: 'text-cyan-400 pizarra:text-cat-7-ink'    },
  d:          { hex: '#71717a', textClass: 'text-zinc-400 pizarra:text-cat-5-ink'    },
}

/** Fallback cuando la calidad no matchea ninguna clave canónica. */
const FALLBACK: QualityColorEntry = {
  hex: '#6366f1',
  textClass: 'text-muted-foreground',
}

// ── Normalización + matching ─────────────────────────────────────────────────

/**
 * Normaliza un string de calidad a una clave canónica:
 * lowercase + remover todo lo que no sea letra. Si matchea por inclusión con
 * alguna `QualityKey`, devuelve esa entrada; si no, fallback.
 *
 * Ejemplos: "Primera" → 'primera', "Premium A1" → 'premium',
 * "primera-A" → 'primera'.
 */
function resolveEntry(quality: string | undefined | null): QualityColorEntry {
  const k = (quality ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (!k) return FALLBACK
  for (const key of QUALITY_KEYS) {
    if (k.includes(key)) return QUALITY_COLORS[key]
  }
  return FALLBACK
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Color hex sólido para una calidad — usar en inline styles, dots, ECharts,
 * exportación PDF.
 */
export function qualityColorHex(quality: string | undefined | null): string {
  return resolveEntry(quality).hex
}

// ── Pizarra: rampa ORDINAL por token ─────────────────────────────────────────

/**
 * Color CSS por TOKEN (Pizarra, spec «foco, contexto, estado»). Las calidades son un orden,
 * no categorías: premium → tercera = rampa azul de 5 pasos (`--calidad-1..5`, más oscuro =
 * mejor en Día, más claro = mejor en Penumbra); industrial = neutro fuerte; descarte = serie 3;
 * grado = serie 4; d = neutro medio. Solo se resuelve con la paleta Pizarra activa: `qualityColorHex`
 * NO cambia (hay tests que fijan sus hex y los usan PDF/exportaciones, que no leen CSS).
 */
const QUALITY_TOKENS: Record<QualityKey, string> = {
  premium:    'calidad-1',
  superior:   'calidad-2',
  primera:    'calidad-3',
  segunda:    'calidad-4',
  tercera:    'calidad-5',
  industrial: 'grafico-neutro-fuerte',
  descarte:   'serie-3',
  grado:      'serie-4',
  d:          'grafico-neutro-medio',
}
const FALLBACK_TOKEN = 'serie-otros'

/** `--calidad-N` guarda un color completo (hex); los demás tokens guardan canales «R G B». */
function tokenAVar(token: string): string {
  return token.startsWith('calidad-') ? `var(--${token})` : `rgb(var(--${token}))`
}

const QUALITY_VARS = Object.fromEntries(
  QUALITY_KEYS.map((k) => [k, tokenAVar(QUALITY_TOKENS[k])]),
) as Record<QualityKey, string>
const FALLBACK_VAR = tokenAVar(FALLBACK_TOKEN)

/** `var(--…)` de la calidad bajo Pizarra; sirve en `style` HTML/SVG (no en canvas). */
export function qualityColorVar(quality: string | undefined | null): string {
  const k = (quality ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (!k) return FALLBACK_VAR
  for (const key of QUALITY_KEYS) {
    if (k.includes(key)) return QUALITY_VARS[key]
  }
  return FALLBACK_VAR
}

/**
 * Color RESUELTO para canvas (Chart.js / ECharts, que no leen `var()`): `hoy` (el literal que el
 * gráfico traía) sin Pizarra; con ella, el token de la calidad leído de los estilos (con `alfa`).
 * Es la forma de pintar calidades en un canvas sin tocar `qualityColorHex`.
 */
export function qualityColorCanvas(quality: string | undefined | null, hoy: string, alfa = 1): string {
  const k = (quality ?? '').toLowerCase().replace(/[^a-z]/g, '')
  let token = FALLBACK_TOKEN
  if (k) {
    for (const key of QUALITY_KEYS) {
      if (k.includes(key)) { token = QUALITY_TOKENS[key]; break }
    }
  }
  return elegirColor(hoy, token, alfa)
}

/**
 * Lo que se pinta en pantalla: la variante por token con Pizarra, el hex de siempre sin ella.
 * Para inline styles de HTML/SVG (puntos de leyenda). Canvas/ECharts siguen con `qualityColorHex`.
 */
export function qualityColorDisplay(quality: string | undefined | null): string {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-paleta') === 'pizarra'
    ? qualityColorVar(quality)
    : qualityColorHex(quality)
}

/**
 * Clase Tailwind de color de texto para una calidad — usar en className de
 * spans / labels. Devuelve `text-muted-foreground` cuando no hay match.
 */
export function qualityColorTextClass(quality: string | undefined | null): string {
  return resolveEntry(quality).textClass
}
