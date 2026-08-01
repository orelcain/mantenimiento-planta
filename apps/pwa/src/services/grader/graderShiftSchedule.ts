/**
 * Helpers para horarios de turnos (dia, tarde, noche).
 * Soporta hora + minuto (HH:MM).
 */

import type { GraderShiftSchedule } from './types'

/**
 * Horarios por defecto de turnos del Grader.
 *
 * La planta opera con 2 turnos (A y B) que cubren las ~24h sin solapamiento:
 *   - Turno día (A):   ~09:00 – 17:30 real, ventana ancha 07:00 – 19:00
 *   - Turno noche (B): ~21:00 – 06:00 real, ventana ancha 19:00 – 07:00
 *
 * La ventana ancha absorbe variaciones (±1h) en las horas reales de operación
 * sin fragmentar un turno en dos IDs distintos en Firestore. Un registro de
 * las 18:00 cae naturalmente en "día"; uno de las 19:30 cae en "noche".
 *
 * Nota: NO hay "Turno tarde". Si un Excel legacy tiene ese label se remapea a
 * "Turno noche" desde `normalizeShiftLabel`, y los documentos antiguos en
 * Firestore se pueden consolidar con `migrateTardeShiftsToNoche()`.
 */
export const DEFAULT_SHIFT_SCHEDULE: GraderShiftSchedule[] = [
  { shiftId: 'Turno día', startHour: 7, startMinute: 0, endHour: 19, endMinute: 0 },
  { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
]

function clampHour(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(23, Math.max(0, Math.round(value)))
}

function clampMinute(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(59, Math.max(0, Math.round(value)))
}

/** Convierte hora+minuto a minutos totales del día (0-1439) */
function toMinutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute
}

/** Formatea hora:minuto como "HH:MM" */
export function formatShiftTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Parsea "HH:MM" → { hour, minute } */
export function parseShiftTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map(Number)
  return { hour: clampHour(h || 0), minute: clampMinute(m || 0) }
}

/**
 * Normaliza un horario de turnos contra una base.
 *
 * @param schedule  Valores parciales guardados en Firestore (pueden faltar campos)
 * @param baseSchedule  Horarios base de la planta. Si se omite usa DEFAULT_SHIFT_SCHEDULE
 *                      (Chonchi). Pasar `plantLineConfig.defaultShiftSchedule` para
 *                      obtener los defaults correctos de cada planta.
 */
export function normalizeShiftSchedule(
  schedule?: Partial<GraderShiftSchedule>[],
  baseSchedule?: GraderShiftSchedule[],
): GraderShiftSchedule[] {
  const base = baseSchedule ?? DEFAULT_SHIFT_SCHEDULE
  const map = new Map<string, GraderShiftSchedule>()
  for (const item of base) {
    map.set(item.shiftId, { ...item })
  }
  for (const item of schedule || []) {
    if (!item.shiftId || !map.has(item.shiftId)) continue
    const quota = item.quota && Number.isFinite(item.quota.value) && item.quota.value > 0
      ? {
          value: Math.max(0, Math.round(item.quota.value)),
          unit: item.quota.unit === 'kg' ? ('kg' as const) : ('pieces' as const),
        }
      : undefined
    map.set(item.shiftId, {
      shiftId: item.shiftId,
      startHour: clampHour(item.startHour ?? 0),
      startMinute: clampMinute(item.startMinute ?? 0),
      endHour: clampHour(item.endHour ?? 0),
      endMinute: clampMinute(item.endMinute ?? 0),
      ...(quota ? { quota } : {}),
    })
  }
  return base.map((item) => map.get(item.shiftId)!).map((item) => ({ ...item }))
}

export function inferShiftIdFromSchedule(startAt: string | undefined, schedule?: GraderShiftSchedule[]): GraderShiftSchedule['shiftId'] {
  if (!startAt) return 'Turno noche'
  const d = new Date(startAt)
  // wall-clock-as-UTC — ver nota en graderSegmenter.assignShiftAndDate
  const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes()
  // El schedule recibido ES la verdad (trae los turnos reales de la planta:
  // Turno 1, Turno 2…). Antes se pasaba por normalizeShiftSchedule() sin base,
  // que los descartaba y dejaba solo día/noche.
  const normalized = schedule && schedule.length > 0 ? schedule : DEFAULT_SHIFT_SCHEDULE

  for (const item of normalized) {
    const start = toMinutesOfDay(item.startHour, item.startMinute)
    const end = toMinutesOfDay(item.endHour, item.endMinute)
    if (start === end) continue
    if (start < end) {
      if (minutesOfDay >= start && minutesOfDay < end) return item.shiftId
    } else {
      // cruza medianoche
      if (minutesOfDay >= start || minutesOfDay < end) return item.shiftId
    }
  }

  return 'Turno noche'
}

/**
 * Key corta y estable para IDs de documento a partir del shiftId.
 *
 * 'Turno día' → 'dia' y 'Turno noche' → 'noche' se conservan TAL CUAL para no
 * romper los IDs ya guardados en Firestore. El resto (Turno 1, Turno 2,
 * 'Turno 1 Lunes'… que es lo que emite Shoplogix en Planta Principal desde
 * 2026-05) se slugifica en vez de caer todo en 'noche' — antes dos turnos
 * distintos del mismo día compartían ID y el segundo pisaba al primero.
 */
export function shiftIdToKey(shiftId?: string): string {
  if (shiftId === 'Turno día') return 'dia'
  if (!shiftId || shiftId === 'Turno noche') return 'noche'
  const slug = shiftId
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'noche'
}
