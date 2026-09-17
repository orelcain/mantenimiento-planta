import { ETIQUETA_TIPO, MAX_CANTIDAD_REPUESTO, MAX_REPUESTOS_EVENTO, MAX_TIPO_OTRO, TIPOS_EVENTO } from '@/config/bitacora'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import type { EventoBitacora, RepuestoUsado, TipoEvento, TurnoMantencion } from './bitacora.types'
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

/** El número del equipo (o la ubicación técnica de un área), solo si se eligió del buscador. */
export function codigoEquipoDe(e: Pick<EventoBitacora, 'equipoId' | 'equipoCodigo'>): string {
  return e.equipoId ? (e.equipoCodigo ?? '').trim() : ''
}

/** «N° de equipo 720004447» o «Ubicación técnica AQ-IN-CHO-EXTE-CASI». */
export function etiquetaCodigoEquipo(codigo: string): string {
  const c = codigo.trim()
  if (!c) return ''
  return /^\d+$/.test(c) ? `N° de equipo ${c}` : `Ubicación técnica ${c}`
}

/** "EVISCERADORA BAADER 142 N2 (720004447)"; sin número, el equipo tal cual. */
export function equipoConCodigo(e: Pick<EventoBitacora, 'equipo' | 'equipoId' | 'equipoCodigo'>): string {
  const equipo = e.equipo?.trim() ?? ''
  const codigo = codigoEquipoDe(e)
  return equipo && codigo ? `${equipo} (${codigo})` : equipo
}

/**
 * La línea que encabeza el evento en el correo, el PDF y WhatsApp:
 * "18:07 – 18:30 · CASINO · Cambio de tubos". Sin hora, parte por el equipo.
 */
export function encabezadoEvento(
  e: Pick<EventoBitacora, 'horaInicio' | 'horaTermino' | 'equipo' | 'titulo'> & Partial<Pick<EventoBitacora, 'equipoId' | 'equipoCodigo'>>,
): string {
  return [horarioEvento(e), equipoConCodigo(e), tituloDe(e)].filter(Boolean).join(' · ')
}

/**
 * Repuestos válidos y sin repetir (el mismo código suma cantidades), en el
 * orden en que se agregaron. Lo usa el guardado y la comparación entre equipos.
 */
export function normalizarRepuestos(lista: readonly Partial<RepuestoUsado>[] | null | undefined): RepuestoUsado[] {
  const porCodigo = new Map<string, RepuestoUsado>()
  for (const r of lista ?? []) {
    const codigoSAP = String(r?.codigoSAP ?? '').trim()
    if (!/^[0-9A-Za-z-]{3,20}$/.test(codigoSAP)) continue
    const cantidad = Math.min(MAX_CANTIDAD_REPUESTO, Math.max(1, Math.round(Number(r?.cantidad) || 1)))
    const previo = porCodigo.get(codigoSAP)
    if (previo) previo.cantidad = Math.min(MAX_CANTIDAD_REPUESTO, previo.cantidad + cantidad)
    else porCodigo.set(codigoSAP, { codigoSAP, nombre: String(r?.nombre ?? '').trim().slice(0, 120), cantidad })
  }
  return [...porCodigo.values()].slice(0, MAX_REPUESTOS_EVENTO)
}

/** Nombre legible del repuesto (los del maestro vienen en MAYÚSCULAS de SAP). */
export function nombreRepuesto(r: Pick<RepuestoUsado, 'nombre'>): string {
  return formatNombreSAP(r.nombre).nombre || r.nombre
}

/** "3300011612 Soporte sección 519437 ×2" (sin nombre: solo el código). */
export function textoRepuesto(r: RepuestoUsado): string {
  return [r.codigoSAP, nombreRepuesto(r), r.cantidad > 1 ? `×${r.cantidad}` : ''].filter(Boolean).join(' ')
}

/** "Repuestos: 3300011612 Soporte sección 519437 · 3300011654 Anillo 31000251 ×2" ('' si no hay). */
export function lineaRepuestos(e: Pick<EventoBitacora, 'repuestos'>): string {
  const lista = normalizarRepuestos(e.repuestos)
  return lista.length ? `Repuestos: ${lista.map(textoRepuesto).join(' · ')}` : ''
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
