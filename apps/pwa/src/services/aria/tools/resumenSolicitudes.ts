/**
 * Resumen de las solicitudes de repuesto para ARIA — puro y probado.
 *
 * POR QUÉ EXISTE
 * --------------
 * Preguntado el 15-09 en el chat de la app: «¿hay solicitudes de repuestos pendientes o por
 * entregar?». ARIA contestó que «no contamos con un módulo de solicitudes activo» —existe desde
 * la Fase 6— y armó una lista de SIETE «pendientes» buscando la palabra «pendiente» en el
 * catálogo (repuestos cuyo fabricante dice «pendiente», despieces sin SAP, y una bomba
 * «pendiente de recepción física» inventada). La respuesta real era: 1 solicitud, entregada,
 * ninguna pendiente. El chat de la app no tenía ninguna fuente de solicitudes; el ARIA de
 * Telegram sí (`ariaDataSolicitudes`).
 */

export interface SolicitudParaAria {
  codigoSAP: string
  textoBreve: string
  cantidad: number
  estado: 'pendiente' | 'aprobada' | 'entregada' | string
  solicitadoPorNombre: string
  observaciones?: string
  createdAt?: Date
  aprobadaPor?: string
  aprobadaAt?: Date
  entregadaPor?: string
  entregadaAt?: Date
}

/** «31-05», en hora de Chile. A mano: `toLocaleDateString` cambia de forma según el ICU del entorno. */
function fecha(d?: Date): string {
  if (!d || Number.isNaN(d.getTime())) return '?'
  const partes = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'numeric' }).formatToParts(d)
  const de = (t: string) => (partes.find((p) => p.type === t)?.value ?? '?').padStart(2, '0')
  return `${de('day')}-${de('month')}`
}

function linea(s: SolicitudParaAria): string {
  const partes = [`- [${s.estado}] ${s.textoBreve || '(sin nombre)'} ×${s.cantidad} · SAP ${s.codigoSAP || '—'}`, `pedida por ${s.solicitadoPorNombre || '?'} el ${fecha(s.createdAt)}`]
  if (s.aprobadaPor) partes.push(`aprobada por ${s.aprobadaPor} el ${fecha(s.aprobadaAt)}`)
  if (s.entregadaPor) partes.push(`entregada por ${s.entregadaPor} el ${fecha(s.entregadaAt)}`)
  if (s.observaciones) partes.push(`obs: ${s.observaciones}`)
  return partes.join(' · ')
}

export function resumenDeSolicitudes(solicitudes: readonly SolicitudParaAria[]): string {
  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente')
  const aprobadas = solicitudes.filter((s) => s.estado === 'aprobada')
  const entregadas = solicitudes.filter((s) => s.estado === 'entregada')
  const cabecera =
    `SOLICITUDES DE REPUESTO (módulo Repuestos › «Solicitudes»; se piden desde la ficha de un repuesto con SAP). ` +
    `Registradas: ${solicitudes.length} — pendientes de aprobar: ${pendientes.length}, aprobadas por entregar: ${aprobadas.length}, entregadas: ${entregadas.length}.`
  const regla =
    `⚠️ ARIA: esta ES la fuente de solicitudes. Responde con estos números y esta lista. ` +
    `NO busques «pendiente» en el catálogo de repuestos (un fabricante «pendiente» o una pieza sin SAP NO es una solicitud) ` +
    `y NO digas que el módulo no existe.`
  if (solicitudes.length === 0) return `${cabecera}\nNo hay ninguna solicitud registrada.\n${regla}`
  const abiertas = [...pendientes, ...aprobadas]
  const cuerpo = [
    abiertas.length ? `Abiertas (${abiertas.length}):\n${abiertas.map(linea).join('\n')}` : 'Abiertas: ninguna — no hay nada pendiente de aprobar ni de entregar.',
    entregadas.length ? `Últimas entregadas:\n${entregadas.slice(0, 5).map(linea).join('\n')}` : '',
  ].filter(Boolean)
  return `${cabecera}\n${cuerpo.join('\n')}\n${regla}`
}
