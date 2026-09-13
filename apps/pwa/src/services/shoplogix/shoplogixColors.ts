/**
 * Colores semánticos para estados de máquina Shoplogix.
 *
 * Shoplogix almacena `statusColor` (siempre '#ff0000' para cualquier paro)
 * y `reasonColor` (color de la categoría de la razón). Nuestro normalizer
 * históricamente usó solo `statusColor`, por lo que Firestore tiene todos
 * los paros en rojo. Este helper calcula el color correcto en render-time
 * basándose en el tipo y la razón del estado — matches la UI de Shoplogix.
 *
 * Paleta verificada contra screenshots reales de Shoplogix (Yal, Abr-2026):
 *   - Falta MMPP          → naranja  #f97316
 *   - Ajuste Mantenimiento → azul marino oscuro  #1e3a5f
 *   - Colación             → gris carbón  #313f4b  (reasonColor de Shoplogix)
 *   - Reunión / Inicio turno → slate  #64748b
 *   - Micro Detención (sin razón) → azul claro  #73d8ff
 *   - Downtime genérico    → rojo  #ef4444
 *   - Uptime               → verde  #22c55e
 *   - Setup                → ámbar  #f59e0b
 *   - Planned Downtime     → slate claro  #94a3b8
 */

import { softenAccentHex } from '@/lib/softenColor'

/**
 * Retorna el color CSS (#rrggbb) para un estado de máquina, ya atenuado a
 * −50% croma (mismo tratamiento que la paleta semántica de tailwind.config,
 * 2026-07-19 — los colores de Shoplogix son neón de fábrica).
 *
 * @param type    - Tipo normalizado: 'uptime' | 'downtime' | 'break' | 'setup'
 * @param reason  - Razón del paro (puede ser vacío "")
 * @param stored  - Color almacenado en Firestore (opcional, usado como fallback
 *                  si no es rojo genérico '#ff0000')
 */
/**
 * Los estados que pone el SISTEMA Shoplogix, traducidos.
 *
 * Las causas las escribe el operador y ya vienen en español («COLACION»,
 * «ATASCAMIENTO», «FALTA MMPP»): de los 42 motivos distintos que hay en los
 * datos, **exactamente uno está en inglés** —«Planned Downtime», con 301
 * apariciones— porque no lo escribe nadie, lo pone el sensor. Se veía así en el
 * monitor público, que es la pantalla de la TV de planta.
 */
const ESTADO_SISTEMA_ES: Readonly<Record<string, string>> = {
  'planned downtime': 'Parada programada',
  'unscheduled': 'Fuera de turno',
  'unscheduled downtime': 'Parada no programada',
  'running': 'Produciendo',
  'idle': 'Sin producir',
  'no job': 'Sin trabajo asignado',
  'changeover': 'Cambio de formato',
  'setup': 'Preparación',
}

/** Deja el motivo en español. Lo que ya viene en español pasa intacto. */
export function motivoEnEspanol(motivo: string | null | undefined): string | null {
  if (!motivo) return motivo ?? null
  return ESTADO_SISTEMA_ES[motivo.trim().toLowerCase()] ?? motivo
}

export function slxStateColor(
  type: string,
  reason: string,
  stored?: string,
): string {
  return softenAccentHex(slxStateColorRaw(type, reason, stored))
}

function slxStateColorRaw(
  type: string,
  reason: string,
  stored?: string,
): string {
  // Uptime → siempre verde
  if (type === 'uptime') return '#22c55e'

  const r = reason.toUpperCase().trim()

  // ── Razones específicas (orden: más específico primero) ──────────────────

  // Falta materia prima
  if (
    r.includes('MMPP') ||
    r.includes('MATERIA PRIMA') ||
    r.includes('FALTA MP') ||
    r.includes('SIN MATERIA')
  ) return '#f97316'  // naranja

  // Mantenimiento / ajuste
  if (
    r.includes('AJUSTE') ||
    r.includes('MANTENIM') ||
    r.includes('MANTENC') ||
    r.includes('REPARAC')
  ) return '#1e3a5f'  // azul marino oscuro

  // Colación
  if (r.includes('COLAC')) return '#313f4b'  // gris carbón (valor real Shoplogix reasonColor)

  // Reunión / inicio de turno / capacitación
  if (
    r.includes('REUNION') ||
    r.includes('REUNI') ||
    r.includes('INICIO TURNO') ||
    r.includes('CAPACIT')
  ) return '#64748b'  // slate

  // Limpieza
  if (r.includes('LIMPIEZA') || r.includes('SANITIZ')) return '#7c3aed'  // violeta

  // Post-turno (Planned Downtime de Shoplogix fuera del turno productivo)
  if (r.includes('PLANNED DOWNTIME') || r.includes('POST-TURNO')) return '#94a3b8'  // slate claro

  // ── Fallback por tipo ────────────────────────────────────────────────────

  // Setup
  if (type === 'setup') return '#f59e0b'

  // Break sin reason específica
  if (type === 'break') return '#64748b'

  // Downtime: usar el color almacenado si es válido y distinto del rojo genérico
  if (type === 'downtime') {
    if (stored && stored !== '#ff0000' && /^#[0-9a-f]{6}$/i.test(stored)) return stored
    // Micro Detencion sin reason → azul claro (matches demo data + UI Shoplogix)
    // (Shoplogix usa '#73d8ff' para este estado)
    return '#ef4444'  // rojo genérico para downtime sin categoría
  }

  // Último fallback
  return stored ?? '#64748b'
}

/** Color del punto en la leyenda (círculo de color en Pareto). Alias de slxStateColor. */
export const slxLegendColor = slxStateColor
