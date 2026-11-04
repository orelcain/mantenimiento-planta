/**
 * Hora de planta: el reloj de Chile (America/Santiago) con el que el monitor pone sus minutos.
 *
 * `aWallClockMs` pasa un instante UTC real a milisegundos de RELOJ DE PLANTA (wall-clock-as-UTC). `desdePerilla` y
 * `construirPerilla` sellan la anotación de la perilla con esa misma hora. Vive en `lib/` y no en `pages/monitor/`:
 * `services/shoplogix/pinShiftEnd.ts` la necesita, y los servicios no importan de las páginas.
 */

/** Zona de las plantas. La misma que usa el resto del monitor. */
const TZ = 'America/Santiago'

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
})

/**
 * Pasa un instante UTC real a milisegundos de RELOJ DE PLANTA, para poder
 * compararlo con los `t` de la serie, que ya vienen en wall-clock-as-UTC.
 */
export function aWallClockMs(iso: string): number | null {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const p: Record<string, string> = {}
  for (const parte of PARTES.formatToParts(new Date(ms))) p[parte.type] = parte.value
  const rearmado = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)
  return Number.isFinite(rearmado) ? rearmado : null
}

/**
 * `desde` de una anotación: la hora de PLANTA (America/Santiago) sellada como UTC, la
 * misma convención que los minutos del monitor. Con `toISOString()` directo quedaría
 * UTC real: una perilla anotada a las 10:00 en Chile entraría en vigor a las 13:00.
 * Reusa `aWallClockMs`, que ya pasa los instantes del contador a hora de planta.
 */
export function desdePerilla(nowMs: number): string {
  const wall = Number.isFinite(nowMs) ? aWallClockMs(new Date(nowMs).toISOString()) : null
  if (wall == null) throw new Error('Instante de la perilla no válido')
  return new Date(wall).toISOString()
}

/** La anotación nueva: la velocidad, quién la anotó y su `desde` en hora de planta (la forma de `PerillaMaquina`). */
export function construirPerilla(params: { cpm: number; por: string | null; nowMs: number }): { cpm: number; desde: string; por: string | null } {
  return { cpm: params.cpm, desde: desdePerilla(params.nowMs), por: params.por }
}
