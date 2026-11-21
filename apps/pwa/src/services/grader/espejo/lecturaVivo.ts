/**
 * Lectura en vivo a pedido (E1.4): lógica PURA, sin Firebase.
 *
 * Lo normal es que el lector del PC de planta lea cada 5 min. El botón «En vivo 15 min» del monitor escribe
 * `graderEspejoControl/{linea}.hasta`; la función de ingesta se lo devuelve al lector en la respuesta de su
 * próximo envío y el lector baja a 60 s hasta esa hora (lo confirma en el latido con la clave `vivo`).
 * El lector se entera recién en su próximo envío: hasta 5 min después de pulsar.
 */

export const VIVO_MIN = 15
/** Lo mismo que acepta la regla de Firestore. */
export const VIVO_MAX_MIN = 30
/** Primera versión del lector que entiende la lectura en vivo. */
export const VERSION_CON_VIVO = 'e1.4'

/** `hasta` que escribe el botón: ahora + 15 min (entre 1 y 30). */
export function hastaPedido(ahoraMs: number, minutos: number = VIVO_MIN): number {
  return ahoraMs + Math.min(VIVO_MAX_MIN, Math.max(1, minutos)) * 60_000
}

/** Lo mismo que la regla: entre ahora y ahora + 30 min (ahora = volver a 5 min). */
export function hastaValido(hastaMs: number, ahoraMs: number): boolean {
  return Number.isFinite(hastaMs) && Number.isFinite(ahoraMs)
    && hastaMs >= ahoraMs && hastaMs <= ahoraMs + VIVO_MAX_MIN * 60_000
}

/** «e1.10.2» → [1, 10, 2]; `null` si no tiene forma de versión. */
function partes(v: string | undefined): number[] | null {
  const m = /^e(\d{1,2}(?:\.\d{1,2}){0,2})$/.exec(v ?? '')
  return m ? m[1]!.split('.').map(Number) : null
}

/** ¿La versión del lector entiende la lectura en vivo? Sin versión conocida, se supone que no. */
export function lectorConVivo(version: string | undefined): boolean {
  const a = partes(version)
  const b = partes(VERSION_CON_VIVO)!
  if (!a) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}

export type ModoVivo = 'normal' | 'pedido' | 'vivo' | 'sin-soporte'

export interface EstadoVivo {
  modo: ModoVivo
  /** Fin del pedido vigente (ms reales), o `null` si no hay pedido vigente. */
  hastaMs: number | null
}

/**
 * Qué dice la pastilla. «vivo» solo cuando el latido lo confirma (`vivo` no vacío): antes de eso el pedido está
 * escrito pero el lector todavía no lo tomó («pedido»). Un lector anterior a e1.4 no lo toma nunca.
 * `ahoraMs` es la hora real (`Date.now()`), no el reloj de planta.
 */
export function estadoVivo(p: {
  hastaMs: number | null
  ahoraMs: number
  /** Clave `vivo` del último latido: fin del plazo del lector, o '' si lee cada 5 min. */
  latidoVivo: string | undefined
  version: string | undefined
}): EstadoVivo {
  const { hastaMs, ahoraMs } = p
  if (hastaMs === null || !Number.isFinite(hastaMs) || hastaMs <= ahoraMs) return { modo: 'normal', hastaMs: null }
  if (!lectorConVivo(p.version)) return { modo: 'sin-soporte', hastaMs }
  return { modo: p.latidoVivo ? 'vivo' : 'pedido', hastaMs }
}
