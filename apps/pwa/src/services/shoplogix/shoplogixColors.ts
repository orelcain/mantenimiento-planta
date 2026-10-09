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
import { elegirColor, hayPizarra } from '@/lib/coloresGrafico'

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
  name?: string,
): string {
  // Pizarra: colores de la paleta de gráficos, SIN el −50% de croma (ya son apagados).
  if (typeof document !== 'undefined' && hayPizarra()) return slxStateColorPizarra(type, reason, name)
  return softenAccentHex(slxStateColorRaw(type, reason, stored))
}

/** Quita el −50% de croma solo sin Pizarra; con Pizarra el color ya viene de la paleta. */
export function slxSuavizarAcento(color: string): string {
  return typeof document !== 'undefined' && hayPizarra() ? color : softenAccentHex(color)
}

/** ¿Este estado va con trama (contexto: colación, parada planificada)? Solo con Pizarra. */
export function slxStateTrama(type: string, reason: string): boolean {
  if (typeof document === 'undefined' || !hayPizarra() || type === 'uptime') return false
  const r = reason.toUpperCase().trim()
  return r.includes('COLAC') || r.includes('PLANNED DOWNTIME') || r.includes('POST-TURNO')
}

/**
 * Mapa de la paleta de gráficos (spec «foco, contexto, estado»), en el MISMO orden de
 * prioridad que `slxStateColorRaw`. Ajuste/mantención = serie 1 (el foco de la app);
 * falta MMPP = 2; setup = 3; micro detención = 4; limpieza = 5; lo normal y lo planificado
 * en neutro medio; otras causas con nombre en neutro fuerte (distinguible del uptime);
 * parada SIN causa = falla (pide imputar). Corrige el defecto de la paleta anterior, donde
 * micro detención y parada sin causa compartían el mismo rojo.
 */
function slxStateColorPizarra(type: string, reason: string, name?: string): string {
  const medio = () => elegirColor('#878682', 'grafico-neutro-medio')
  if (type === 'uptime') return medio()

  const r = reason.toUpperCase().trim()

  if (r.includes('MMPP') || r.includes('MATERIA PRIMA') || r.includes('FALTA MP') || r.includes('SIN MATERIA')) {
    return elegirColor('#719146', 'serie-2')
  }
  if (r.includes('AJUSTE') || r.includes('MANTENIM') || r.includes('MANTENC') || r.includes('REPARAC')) {
    return elegirColor('#2A6BA6', 'serie-1')
  }
  if (r.includes('COLAC')) return medio()
  if (r.includes('REUNION') || r.includes('REUNI') || r.includes('INICIO TURNO') || r.includes('CAPACIT')) return medio()
  if (r.includes('LIMPIEZA') || r.includes('SANITIZ')) return elegirColor('#6c6ab3', 'serie-5')
  if (r.includes('PLANNED DOWNTIME') || r.includes('POST-TURNO')) return medio()

  if (type === 'setup') return elegirColor('#a578be', 'serie-3')
  if (type === 'break') return medio()

  if (type === 'downtime') {
    const esMicro = r.includes('MICRO') || (name ?? '').toUpperCase().includes('MICRO')
    if (esMicro) return elegirColor('#138f82', 'serie-4')
    // Con causa anotada pero sin color propio en la paleta: neutro fuerte (≠ uptime).
    if (r) return elegirColor('#4E4D4A', 'grafico-neutro-fuerte')
    return elegirColor('#B1272D', 'grafico-falla') // parada sin causa
  }

  return medio()
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
