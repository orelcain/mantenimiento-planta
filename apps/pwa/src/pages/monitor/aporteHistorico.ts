/**
 * «Que cada Baader compita contra sí misma» (Orel, 31-08).
 *
 * El aporte de una máquina al promedio del turno (piezas ÷ minutos produciendo
 * de la LÍNEA) comparado contra lo que ESA MISMA máquina viene aportando en el
 * mismo turno. La referencia es el PROMEDIO de los últimos 5 turnos, no el
 * último: un turno con una máquina caída (Ev 1 aportó 3,6 el mié 27-ago contra
 * 13,4 el jue 28) convertiría el delta de hoy en un «subiste 8» que no dice
 * nada de hoy.
 *
 * ⚠ Se agrupa por NÚMERO de turno, no por nombre exacto. En Chonchi el turno
 * de hoy se llama «Turno 1 Lunes» y los otros lunes «Turno 1» a secas: por
 * nombre exacto quedaban 4 comparables en 30 días —uno por semana— y un delta
 * semanal llega tarde para corregir algo dentro del turno. Decisión de Orel:
 * «cada turno se compara con su mismo turno… el turno 2 contra el T2 solamente».
 */
import type { ShiftStat } from '../../services/shoplogix/publicShiftMonitor.service'

/** Cuántos turnos entran en el promedio de referencia. */
export const APORTE_TURNOS_REF = 5

/**
 * Mínimo de minutos produciendo del turno EN CURSO para mostrar el delta. A los
 * 10 minutos de arrancar, el aporte acumulado todavía se mueve solo y el delta
 * sería un ▼8,0 que no significa nada.
 */
export const APORTE_MIN_PROD_MIN = 45

/**
 * El turno, sin el día que a veces trae pegado el nombre. Los nombres REALES
 * medidos en el espejo (31-08) no son parejos ni entre plantas ni dentro de
 * una misma planta:
 *
 *   Chonchi  «Turno 2» ×20 · «Turno 1» ×14 · «Turno 1 Lunes» ×3
 *   Filete   «Turno Dia» ×23 · «Turno Noche» ×10 · «Turno Noche L» ×2
 *   Yal      «Turno 1» / «Turno 2» / «Turno 3»
 *
 * Por eso hay DOS reglas y no una: primero el número («Turno 1 Lunes» →
 * `turno 1`), y si el turno no se llama por número, la palabra que lo nombra
 * («Turno Noche L» → `turno noche`). Sin la segunda, el turno noche de Filete
 * se comparaba solo contra los otros dos «Turno Noche L» —los lunes— y dejaba
 * fuera los diez «Turno Noche». Requisito de Orel: «si es noche compara contra
 * turno noche, turno día contra turno día solamente».
 *
 * Sin número ni palabra reconocible cae al nombre completo normalizado:
 * comparar contra otra cosa sería peor que no comparar.
 */
const PALABRAS_TURNO = ['noche', 'tarde', 'mañana', 'manana', 'dia', 'día'] as const

export function numeroDeTurno(shiftId: string | null | undefined): string | null {
  if (!shiftId) return null
  const s = shiftId.trim().toLowerCase()
  if (!s) return null
  const m = /turno\s*(\d+)/.exec(s)
  if (m) return `turno ${m[1]}`
  /* Palabra completa: «dia» no debe salir de «mediodia» ni de un nombre que
     la lleve adentro de otra. El orden de la lista importa poco porque los
     nombres reales traen una sola. */
  for (const p of PALABRAS_TURNO) {
    if (new RegExp(`(^|[^a-záéíóúñ])${p}([^a-záéíóúñ]|$)`).test(s)) {
      return `turno ${p === 'día' ? 'dia' : p === 'mañana' ? 'manana' : p}`
    }
  }
  return s
}

export type ReferenciaAporte = {
  /** Aporte promedio de cada máquina, por nombre. */
  porMaquina: Map<string, number>
  /** Cuántos turnos entraron en el promedio. */
  turnos: number
  /** El más reciente de esos turnos (para poder nombrarlo). */
  desde: string | null
}

/**
 * El aporte promedio por máquina de los últimos `n` turnos del mismo número.
 *
 * Solo entran turnos con `producingMin > 0` y con desglose por máquina: un
 * turno sin el dato no se rellena con ceros (bajaría el promedio inventando un
 * turno malo). Devuelve null si no quedó ninguno.
 */
export function referenciaAporte(
  stats: ShiftStat[] | null | undefined,
  shiftIdActual: string | null | undefined,
  n: number = APORTE_TURNOS_REF,
): ReferenciaAporte | null {
  const numero = numeroDeTurno(shiftIdActual)
  if (!numero || !stats?.length) return null

  const utiles = stats
    .filter((s) => numeroDeTurno(s.shiftId) === numero)
    .filter((s) => s.producingMin > 0 && (s.porMaquina?.length ?? 0) > 0)
    /* Por dateKey y no por el orden del arreglo: el backend lo ordena por id,
       y un id ordena alfabéticamente («Turno 1 Lunes» antes que «Turno 2»). */
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0))
    .slice(0, Math.max(1, n))

  if (utiles.length === 0) return null

  const suma = new Map<string, { total: number; veces: number }>()
  for (const s of utiles) {
    for (const m of s.porMaquina ?? []) {
      if (!m?.n || !Number.isFinite(m.p)) continue
      const acc = suma.get(m.n) ?? { total: 0, veces: 0 }
      acc.total += m.p / s.producingMin
      acc.veces += 1
      suma.set(m.n, acc)
    }
  }
  if (suma.size === 0) return null

  return {
    /* Cada máquina se promedia sobre los turnos en que APARECE: una Baader que
       se sumó hace dos semanas no se castiga con los turnos en que no existía. */
    porMaquina: new Map([...suma].map(([nombre, a]) => [nombre, a.total / a.veces])),
    turnos: utiles.length,
    desde: utiles[0]?.dateKey ?? null,
  }
}

/**
 * El delta de una máquina contra su referencia. null cuando falta cualquiera de
 * las dos puntas o el turno todavía no produjo lo suficiente: un delta que no
 * se puede sostener no se muestra.
 */
export function deltaAporte(
  ref: ReferenciaAporte | null,
  nombreMaquina: string,
  aporteActual: number | null | undefined,
  producingMinActual: number | null | undefined,
): number | null {
  if (!ref || aporteActual == null || !Number.isFinite(aporteActual)) return null
  if ((producingMinActual ?? 0) < APORTE_MIN_PROD_MIN) return null
  const base = ref.porMaquina.get(nombreMaquina)
  if (base == null || !Number.isFinite(base)) return null
  return aporteActual - base
}
