import type { DispositivoBitacora, PresenciaBitacora } from './bitacora.types'

/**
 * Presencia: quién tiene la bitácora del turno abierta ahora.
 *
 * El reloj de los teléfonos de planta no es confiable, así que la vigencia NO se
 * mide contra `Date.now()` a secas: se estima la hora del servidor con el
 * desfase observado en el latido PROPIO (el servidor fija `vistoEn`).
 */

export function desfaseServidor(miVistoEnMs: number | null, recibidoLocalMs: number | null): number {
  if (miVistoEnMs == null || recibidoLocalMs == null) return 0
  return miVistoEnMs - recibidoLocalMs
}

/** Dispositivos con latido reciente, uno por dispositivo, este primero. */
export function presentesVigentes(
  docs: readonly PresenciaBitacora[],
  opciones: { ahoraLocalMs: number; desfaseMs: number; vigenciaMs: number; miDispositivoId: string },
): PresenciaBitacora[] {
  const ahoraServidor = opciones.ahoraLocalMs + opciones.desfaseMs
  const porDispositivo = new Map<string, PresenciaBitacora>()
  for (const d of docs) {
    // Sin hora todavía = latido propio recién escrito, aún sin respuesta del servidor.
    const vigente =
      d.vistoEnMs == null ? d.dispositivoId === opciones.miDispositivoId : ahoraServidor - d.vistoEnMs <= opciones.vigenciaMs
    if (!vigente) continue
    const previo = porDispositivo.get(d.dispositivoId)
    if (!previo || (d.vistoEnMs ?? 0) > (previo.vistoEnMs ?? 0)) porDispositivo.set(d.dispositivoId, d)
  }
  return [...porDispositivo.values()].sort((a, b) => {
    if (a.dispositivoId === opciones.miDispositivoId) return -1
    if (b.dispositivoId === opciones.miDispositivoId) return 1
    return a.nombre.localeCompare(b.nombre, 'es')
  })
}

/** Los OTROS dispositivos que tienen abierto este evento. */
export function otrosEditando(presentes: readonly PresenciaBitacora[], eventoId: string, miDispositivoId: string): PresenciaBitacora[] {
  return presentes.filter((p) => p.editandoEventoId === eventoId && p.dispositivoId !== miDispositivoId)
}

/** "DC" para "Danilo Cortes"; "M" para "mantencion.plantach@…". */
export function iniciales(nombre: string): string {
  const limpio = (nombre.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim()
  const partes = limpio.split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const [a = '', b = ''] = partes
  return (partes.length === 1 ? a.slice(0, 1) : `${a.slice(0, 1)}${b.slice(0, 1)}`).toUpperCase()
}

/**
 * La cuenta compartida de Mantención (`mantencion.plantach…`). Con ella, el
 * nombre de la cuenta no dice quién es.
 */
export function esCuentaCompartida(correo: string | null | undefined): boolean {
  return /^mantencion[._-]/i.test(correo ?? '')
}

/**
 * Nombre con que figura ESTE equipo en «conectados».
 * - Cuenta personal → el nombre de la cuenta.
 * - Cuenta compartida en un celular → el técnico elegido en ese teléfono.
 * - Cuenta compartida en un PC → «PC de Mantención»: el último técnico elegido
 *   en un PC que usan todos no es quien está sentado ahora.
 */
export function nombreEnPresencia(o: {
  correo: string | null | undefined
  nombreCuenta: string
  recordado: string
  dispositivo: DispositivoBitacora
}): string {
  if (!esCuentaCompartida(o.correo)) return o.nombreCuenta.trim() || o.recordado.trim() || 'Sin nombre'
  if (o.dispositivo === 'pc') return 'PC de Mantención'
  return o.recordado.trim() || 'Celular de Mantención'
}

export const NOMBRE_DISPOSITIVO: Record<DispositivoBitacora, string> = { celular: 'celular', pc: 'PC' }

export type EstadoSincronizacion = 'sincronizado' | 'guardando' | 'sin-senal'

/**
 * Estado de la barra: sin señal manda (los cambios quedan en el teléfono y se
 * suben solos); después, cualquier escritura o foto en camino; si no, al día.
 */
export function estadoSincronizacion(s: { enLinea: boolean; cambiosPorSubir: number; fotosSubiendo: number }): EstadoSincronizacion {
  if (!s.enLinea) return 'sin-senal'
  if (s.cambiosPorSubir > 0 || s.fotosSubiendo > 0) return 'guardando'
  return 'sincronizado'
}

/** "hace 4 s", "hace 3 min", "a las 17:42". */
export function haceCuanto(desdeMs: number, ahoraMs: number, hora: string): string {
  const s = Math.max(0, Math.round((ahoraMs - desdeMs) / 1000))
  if (s < 60) return `hace ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  return `a las ${hora}`
}
