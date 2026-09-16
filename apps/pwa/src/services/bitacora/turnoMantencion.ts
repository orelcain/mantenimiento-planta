import { ETIQUETA_BANDA, INICIO_BANDA } from '@/config/bitacora'
import type { BandaTurno, TurnoMantencion } from './bitacora.types'

/**
 * Turno de Mantención por RELOJ: día 08-16, tarde 16-00, noche 00-08.
 *
 * Es deliberadamente independiente de Shoplogix: los turnos de producción
 * cambian de nombre y de ventana (ver gotchas de turnos), mientras que el turno
 * de Mantención es el que está escrito en el calendario del equipo.
 *
 * Todas las fechas son HORA LOCAL del dispositivo (la planta y los técnicos
 * están en la misma zona). Los `Date` se construyen con el constructor de
 * componentes y no sumando milisegundos, para no correrse una hora en los
 * cambios de horario de verano.
 */

const BANDAS_VALIDAS: readonly BandaTurno[] = ['noche', 'dia', 'tarde']

const pad = (n: number) => String(n).padStart(2, '0')

export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function bandaDeHora(hora: number): BandaTurno {
  if (hora < INICIO_BANDA.dia) return 'noche'
  if (hora < INICIO_BANDA.tarde) return 'dia'
  return 'tarde'
}

function construirTurno(anio: number, mes: number, dia: number, banda: BandaTurno): TurnoMantencion {
  const h = INICIO_BANDA[banda]
  const inicio = new Date(anio, mes, dia, h, 0, 0, 0)
  // new Date(..., 24) rueda solo al día siguiente: la tarde termina a las 00:00.
  const fin = new Date(anio, mes, dia, h + 8, 0, 0, 0)
  const fecha = fechaLocal(inicio)
  return { id: `${fecha}_${banda}`, fecha, banda, inicio, fin }
}

/** El turno que está corriendo en `ahora`. */
export function turnoMantencionEn(ahora: Date = new Date()): TurnoMantencion {
  return construirTurno(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), bandaDeHora(ahora.getHours()))
}

/** Reconstruye un turno desde su id. Null si el id no tiene la forma esperada. */
export function turnoDesdeId(id: string | null | undefined): TurnoMantencion | null {
  const m = id?.match(/^(\d{4})-(\d{2})-(\d{2})_(dia|tarde|noche)$/)
  if (!m) return null
  const banda = m[4] as BandaTurno
  if (!BANDAS_VALIDAS.includes(banda)) return null
  const turno = construirTurno(Number(m[1]), Number(m[2]) - 1, Number(m[3]), banda)
  // Rechaza fechas imposibles (2026-02-31 rodaría a marzo).
  return turno.id === id ? turno : null
}

/** Turno anterior (`-1`) o siguiente (`+1`). */
export function turnoAdyacente(turno: TurnoMantencion, paso: -1 | 1): TurnoMantencion {
  const i = turno.inicio
  const ref = new Date(i.getFullYear(), i.getMonth(), i.getDate(), i.getHours() + 8 * paso, 0, 0, 0)
  return turnoMantencionEn(ref)
}

export function etiquetaTurno(turno: TurnoMantencion): string {
  return ETIQUETA_BANDA[turno.banda]
}

export function horarioTurno(turno: TurnoMantencion): string {
  const h = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${h(turno.inicio)} – ${h(turno.fin)}`
}

/** "martes 15-09-2026". */
export function fechaTurnoLarga(turno: TurnoMantencion): string {
  const d = turno.inicio
  const dia = d.toLocaleDateString('es-CL', { weekday: 'long' })
  return `${dia} ${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** `HH:mm` de un Date. */
export function horaDe(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Hora por defecto para un evento nuevo: la actual si el turno está corriendo,
 * y el inicio del turno si se está completando uno pasado o futuro.
 */
export function horaSugeridaParaEvento(turno: TurnoMantencion, ahora: Date = new Date()): string {
  if (ahora >= turno.inicio && ahora < turno.fin) return horaDe(ahora)
  return horaDe(turno.inicio)
}

/** Minutos desde el inicio del turno hasta `HH:mm` (para ordenar eventos). */
export function minutosDesdeInicioTurno(turno: Pick<TurnoMantencion, 'banda'>, hhmm: string): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return Number.MAX_SAFE_INTEGER
  const total = Number(m[1]) * 60 + Number(m[2])
  const desde = (((total - INICIO_BANDA[turno.banda] * 60) % 1440) + 1440) % 1440
  // Una hora "después" del inicio que cae más allá de las 16 h es en realidad un
  // poco ANTES del inicio (un evento de las 15:50 cargado en la tarde): va
  // primero, no último. El corte va en 16 h, el punto MÁS LEJOS de las dos horas
  // plausibles —el fin del turno (8 h) y su inicio (24 h)—: así el minuto en que
  // el orden salta queda a 8 h de cualquier evento real (revisión 15-09).
  return desde > 16 * 60 ? desde - 1440 : desde
}

/**
 * Minutos entre dos `HH:mm`. Si el término es menor que el inicio, cruzó la
 * medianoche (una intervención de la tarde que termina 00:20).
 */
export function minutosEntre(inicio: string, termino: string | null | undefined): number | null {
  if (!termino) return null
  const a = inicio.match(/^(\d{1,2}):(\d{2})$/)
  const b = termino.match(/^(\d{1,2}):(\d{2})$/)
  if (!a || !b) return null
  const ma = Number(a[1]) * 60 + Number(a[2])
  const mb = Number(b[1]) * 60 + Number(b[2])
  return (mb - ma + 1440) % 1440
}

/** "35 min", "1 h 05 min", "2 h". */
export function formatoMinutos(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  const total = Math.max(0, Math.round(min))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${pad(m)} min`
}
