import { ETIQUETA_TIPO, MAX_TIPO_OTRO, TIPOS_EVENTO } from '@/config/bitacora'
import type { EventoBitacora, TipoEvento, TurnoMantencion } from './bitacora.types'
import { minutosDesdeInicioTurno } from './turnoMantencion'

/**
 * Cómo se nombra y se ubica un evento: su tipo (fijo o escrito a mano), su
 * título opcional y su hora opcional (decisiones de Orel, 16-09-2026). Vive
 * aparte para que la fila, el correo, el PDF y WhatsApp digan exactamente lo
 * mismo.
 */

const HORA = /^\d{1,2}:\d{2}$/

/** ¿El evento tiene hora? `''` = se registró con «Sin hora». */
export function tieneHora(e: Pick<EventoBitacora, 'horaInicio'>): boolean {
  return HORA.test(e.horaInicio ?? '')
}

/** Para comparar tipos escritos a mano: sin mayúsculas, tildes ni espacios de más. */
export function normalizarTipo(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** "  mejora   continua " → "Mejora continua" (el resto se respeta: "PLC", "Montaje NH₃"). */
export function limpiarTipo(t: string | null | undefined): string {
  const limpio = String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_TIPO_OTRO)
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

const FIJO_POR_NOMBRE = new Map(TIPOS_EVENTO.filter((t) => t.id !== 'otro').map((t) => [normalizarTipo(t.label), t.id]))

/**
 * El tipo que se guarda al publicar. Si alguien eligió «Otro» y escribió un tipo
 * que ya existe ("preventivo"), queda como ese tipo fijo: si no, el historial
 * contaría dos «Preventivo» distintos.
 */
export function resolverTipo(tipo: TipoEvento, tipoOtro: string | null | undefined): { tipo: TipoEvento; tipoOtro: string | null } {
  if (tipo !== 'otro') return { tipo, tipoOtro: null }
  const limpio = limpiarTipo(tipoOtro)
  const fijo = FIJO_POR_NOMBRE.get(normalizarTipo(limpio))
  if (fijo) return { tipo: fijo, tipoOtro: null }
  return { tipo: 'otro', tipoOtro: limpio || null }
}

/** "Falla", o el tipo escrito a mano ("Mejora"). */
export function etiquetaTipo(e: Pick<EventoBitacora, 'tipo' | 'tipoOtro'>): string {
  if (e.tipo === 'otro') return limpiarTipo(e.tipoOtro) || ETIQUETA_TIPO.otro
  // Un tipo que esta versión no conoce (lo escribió una versión más nueva) se
  // muestra tal cual en vez de quedar en blanco.
  return ETIQUETA_TIPO[e.tipo] ?? String(e.tipo)
}

/** Para agrupar por tipo: el id del tipo fijo, o el tipo propio normalizado. */
export function claveTipo(e: Pick<EventoBitacora, 'tipo' | 'tipoOtro'>): string {
  // Un «Otro: preventivo» cuenta como Preventivo aunque se haya guardado así.
  const r = resolverTipo(e.tipo, e.tipoOtro)
  if (r.tipo !== 'otro') return r.tipo
  return r.tipoOtro ? `otro:${normalizarTipo(r.tipoOtro)}` : 'otro'
}

/**
 * Los tipos escritos a mano, para sugerirlos: el más usado primero y sin
 * repetir ("Mejora" y "mejora" son uno). Se muestra la forma más reciente.
 */
export function tiposPropiosUsados(eventos: readonly Pick<EventoBitacora, 'tipo' | 'tipoOtro'>[]): string[] {
  const porClave = new Map<string, { nombre: string; veces: number }>()
  for (const e of eventos) {
    if (e.tipo !== 'otro') continue
    const nombre = limpiarTipo(e.tipoOtro)
    const k = normalizarTipo(nombre)
    if (!k || FIJO_POR_NOMBRE.has(k)) continue
    const actual = porClave.get(k)
    porClave.set(k, { nombre: actual?.nombre ?? nombre, veces: (actual?.veces ?? 0) + 1 })
  }
  return [...porClave.values()]
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, 'es'))
    .map((x) => x.nombre)
}

/** El título del evento, sin espacios de más ('' si no tiene). */
export function tituloDe(e: Pick<EventoBitacora, 'titulo'>): string {
  return (e.titulo ?? '').trim().replace(/\s+/g, ' ')
}

/** Horario del evento: "16:20 – 16:55", "22:30" si sigue abierto, '' si es sin hora. */
export function horarioEvento(e: Pick<EventoBitacora, 'horaInicio' | 'horaTermino'>): string {
  if (!tieneHora(e)) return ''
  return e.horaTermino ? `${e.horaInicio} – ${e.horaTermino}` : e.horaInicio
}

/**
 * La línea que encabeza el evento en el correo, el PDF y WhatsApp:
 * "18:07 – 18:30 · CASINO · Cambio de tubos". Sin hora, parte por el equipo.
 */
export function encabezadoEvento(e: Pick<EventoBitacora, 'horaInicio' | 'horaTermino' | 'equipo' | 'titulo'>): string {
  return [horarioEvento(e), e.equipo?.trim(), tituloDe(e)].filter(Boolean).join(' · ')
}

function aMilisegundos(v: unknown): number | null {
  if (v == null) return null
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  const t = v as { toMillis?: () => number }
  return typeof t.toMillis === 'function' ? t.toMillis() : null
}

/**
 * Minutos desde el inicio del turno, para ordenar la línea de tiempo. Un evento
 * sin hora se ubica según cuándo se registró (`createdAt`); si todavía no hay
 * marca del servidor, va al final hasta que llegue.
 */
export function minutosEnTurno(
  turno: Pick<TurnoMantencion, 'banda'> & { inicio?: Date },
  e: Pick<EventoBitacora, 'horaInicio'> & { createdAt?: unknown },
): number {
  if (tieneHora(e)) return minutosDesdeInicioTurno(turno, e.horaInicio)
  const ms = aMilisegundos(e.createdAt)
  if (ms == null || !turno.inicio) return Number.MAX_SAFE_INTEGER
  return Math.round((ms - turno.inicio.getTime()) / 60_000)
}
