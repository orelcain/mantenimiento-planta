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

/** Cuántos días hacia atrás se puede mover un evento de turno (17-09-2026). */
export const DIAS_PARA_MOVER = 7

/**
 * Los turnos que se pueden elegir para un evento: el actual y los de los
 * últimos `dias` días, del más nuevo al más viejo. Nunca uno futuro, y nunca
 * uno anterior a `desdeId` (el turno del pendiente que el evento cierra).
 */
export function turnosElegibles(
  actual: TurnoMantencion,
  dias: number = DIAS_PARA_MOVER,
  desdeId?: string | null,
): TurnoMantencion[] {
  const desde = desdeId ? turnoDesdeId(desdeId) : null
  const salida: TurnoMantencion[] = []
  let t = actual
  for (let i = 0; i < dias * 3; i++) {
    if (desde && t.inicio.getTime() < desde.inicio.getTime()) break
    salida.push(t)
    t = turnoAdyacente(t, -1)
  }
  return salida
}

/**
 * ¿Una hora `HH:mm` puede ser de este turno? Con una hora de holgura a cada
 * lado (se registra un poco antes o se termina un poco después del cambio).
 */
export function horaCalzaEnTurno(turno: Pick<TurnoMantencion, 'banda'>, hhmm: string): boolean {
  const m = minutosDesdeInicioTurno(turno, hhmm)
  return m >= -60 && m <= 9 * 60
}

/** Más que esto, «Terminó ahora» ya no es el término: es la hora en que se está cargando. */
export const TOPE_TERMINO_AHORA_MIN = 120

/**
 * ¿Se puede ofrecer «Terminó ahora» para un evento de `turnoId` que empezó a
 * `horaInicio`? Solo si el turno del evento está corriendo (con la misma hora
 * de holgura de `horaCalzaEnTurno`, para lo que termina pasado el cambio) y la
 * duración que resultaría va de 1 minuto a `TOPE_TERMINO_AHORA_MIN`.
 *
 * Medido el 18-09-2026: de 15 eventos con hora, 6 se cargaron más de 2 h después
 * de empezar y 6 después de terminado su turno. Con el botón a la vista siempre,
 * la TOLVA GENERAL RILES (11:00, cargada 18:55) habría quedado con 7 h 55 min de
 * parada donde hubo 20.
 *
 * La diferencia va CON SIGNO respecto del inicio del turno: `minutosEntre` da la
 * vuelta por medianoche, y un inicio que todavía no llega (21:56 abierto a las
 * 21:53) saldría como 1.437 minutos en vez de «aún no empieza».
 */
export function terminoAhora(
  turnoId: string,
  horaInicio: string,
  ahora: Date = new Date(),
):
  | { disponible: true; hora: string; minutos: number }
  | { disponible: false; motivo: 'sin-inicio' | 'otro-turno' | 'turno-terminado' | 'aun-no-empieza' | 'pasa-el-tope' } {
  const turno = turnoDesdeId(turnoId)
  if (!turno) return { disponible: false, motivo: 'otro-turno' }
  if (!/^\d{1,2}:\d{2}$/.test(horaInicio)) return { disponible: false, motivo: 'sin-inicio' }
  const desdeInicioTurno = Math.floor((ahora.getTime() - turno.inicio.getTime()) / 60_000)
  if (desdeInicioTurno < 0) return { disponible: false, motivo: 'otro-turno' }
  if (ahora.getTime() > turno.fin.getTime() + 60 * 60_000) return { disponible: false, motivo: 'turno-terminado' }
  const minutos = desdeInicioTurno - minutosDesdeInicioTurno(turno, horaInicio)
  if (minutos <= 0) return { disponible: false, motivo: 'aun-no-empieza' }
  if (minutos > TOPE_TERMINO_AHORA_MIN) return { disponible: false, motivo: 'pasa-el-tope' }
  return { disponible: true, hora: horaDe(ahora), minutos }
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

/** ¿El turno está corriendo ahora? (ni futuro ni ya cerrado). */
export function turnoEnCurso(turno: Pick<TurnoMantencion, 'inicio' | 'fin'>, ahora: Date = new Date()): boolean {
  return ahora >= turno.inicio && ahora < turno.fin
}

/**
 * Semilla de «Inicio» para un evento NUEVO: «ahora» solo si el turno elegido
 * está corriendo. Con el turno ya cerrado, `horaSugeridaParaEvento` rellenaba
 * con el INICIO DEL TURNO (p. ej. 08:00) — un valor con forma de hora real que
 * nadie escribió y que nadie revisaba: medido el 19-09-2026, el 27% de los
 * eventos se carga con su turno ya terminado. Mejor vacío y obligatorio, igual
 * que ya funciona con «Qué se hizo» e «Impacto».
 */
export function horaInicioNuevoEvento(turno: TurnoMantencion, ahora: Date = new Date()): string {
  return turnoEnCurso(turno, ahora) ? horaDe(ahora) : ''
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

/** `HH:mm` más `minutos`, dando la vuelta por medianoche (23:50 + 20 = 00:10). Null si la hora no es válida. */
export function horaMasMinutos(hhmm: string, minutos: number): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const total = (((Number(m[1]) * 60 + Number(m[2]) + Math.round(minutos)) % 1440) + 1440) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
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
