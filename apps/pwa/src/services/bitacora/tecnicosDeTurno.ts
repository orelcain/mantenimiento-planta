import type { BandaTurno, TurnoMantencion } from './bitacora.types'
import { bandaDeHora } from './turnoMantencion'

/**
 * Quiénes estaban de turno según el calendario de Mantención
 * (`calendario_mantencion_state/current`).
 *
 * Las celdas son texto literal: `08:00 - 16:00`, `19:00 - 00:00` (domingo
 * reducido), `LIBRE`, `VAC`… La banda sale de la hora de INICIO, igual que
 * `bandaDeTurno` del calendario: un `19:00 - 00:00` es tarde.
 */

export interface CalendarioDoc {
  dayCols?: Array<{ c: number; dateRaw?: string }>
  techRows?: Array<{ name?: string; shifts?: Record<string, string> }>
}

/** `dd/mm/yyyy` o `yyyy-mm-dd` → `yyyy-mm-dd`. */
export function normalizarFechaCalendario(raw: string | undefined): string | null {
  if (!raw) return null
  const dmy = raw.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) {
    const [, d = '', m = '', y = ''] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ymd = raw.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (ymd) {
    const [, y = '', m = '', d = ''] = ymd
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

export function bandaDeCelda(celda: string | undefined): BandaTurno | null {
  const m = celda?.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*\d{1,2}:\d{2}/)
  if (!m) return null
  return bandaDeHora(Number(m[1] ?? NaN))
}

const capitalizar = (p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()

/**
 * Nombre corto para el correo: primer nombre + primer apellido.
 *
 * El calendario trae casi todos como `CORTES BARRIA, DANILO FELIPE`
 * (apellidos, coma, nombres) y alguno sin coma y con el nombre primero
 * (`LUCAS EDUARDO ADRADE MANSILLA`). Sin coma se asume nombre primero.
 */
export function nombreCorto(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (!limpio) return ''
  const [antes = '', despues] = limpio.split(',').map((s) => s.trim())
  let nombrePila: string | undefined
  let apellido: string | undefined
  if (despues) {
    nombrePila = despues.split(' ')[0]
    apellido = antes.split(' ')[0]
  } else {
    const w = limpio.split(' ')
    if (w.length >= 4) [nombrePila, apellido] = [w[0], w[2]]
    else if (w.length >= 2) [nombrePila, apellido] = [w[0], w[1]]
    else nombrePila = w[0]
  }
  return [nombrePila, apellido].filter(Boolean).map((p) => capitalizar(p as string)).join(' ')
}

/**
 * Todos los técnicos del calendario, en el orden de la planilla. Es la lista de
 * la que cada uno elige su nombre al registrar: la bitácora se usa con la cuenta
 * compartida de Mantención, así que la cuenta NO dice quién escribió.
 */
export function tecnicosDelCalendario(cal: CalendarioDoc | null | undefined): string[] {
  const vistos = new Set<string>()
  const nombres: string[] = []
  for (const fila of cal?.techRows ?? []) {
    const n = fila.name?.trim() ? nombreCorto(fila.name) : ''
    if (n && !vistos.has(n)) {
      vistos.add(n)
      nombres.push(n)
    }
  }
  return nombres
}

export function tecnicosDeTurno(cal: CalendarioDoc | null | undefined, turno: Pick<TurnoMantencion, 'fecha' | 'banda'>): string[] {
  const col = cal?.dayCols?.find((d) => normalizarFechaCalendario(d.dateRaw) === turno.fecha)
  if (!col) return []
  const nombres: string[] = []
  for (const fila of cal?.techRows ?? []) {
    if (!fila.name?.trim()) continue
    const celda = fila.shifts?.[String(col.c)]
    if (bandaDeCelda(celda) === turno.banda) nombres.push(nombreCorto(fila.name))
  }
  return nombres
}
