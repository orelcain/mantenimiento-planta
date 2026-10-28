/**
 * Datos y cuentas de la pestaña «Análisis» del monitor v2 (AnalisisV2.tsx), sin React.
 *
 *  · `datosDeHoy`: las pérdidas, causas, fallas y respuesta de Mantención de HOY. Es la MISMA cuenta que usa «El turno»
 *    (la página la llama en los dos lados), así «detenciones de hoy» y «Tiempo perdido» cuadran a la misma hora.
 *  · `detencionesPorHora`, `paretoAcumulado`, `metaAEstaHora`: puras, con test.
 */
import { duenoDe, type DuenoPerdida } from '@/services/shoplogix/monitorEventos'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'

export interface EventoHoy { maquina: string; desde: string; hasta: string; min: number; causa: string | null; causas: string[] }
export interface MantHoy { fallas: number; fallaMin: number; mttr: number | null; mttrPrevio: number | null; dispPct: number | null }
export interface CausaHoy { causa: string; min: number; dueno: DuenoPerdida; veces: number }
export interface PerdidaHoy { dueno: DuenoPerdida; min: number }

/** Lo mínimo que se lee de un turno anterior (`data.history[i]`). */
export interface TurnoPrevio { live?: Pick<PublicMonitorLive, 'mantencion'> | null }

export interface DatosDeHoy {
  perdidas: PerdidaHoy[]
  causas: CausaHoy[]
  eventos: EventoHoy[]
  mant: MantHoy | null
}

/**
 * Pérdidas de hoy por dueño (minutos de LÍNEA: `equivMin ?? lineMin ?? min`), causas con dueño, fallas técnicas en orden
 * y la respuesta de Mantención (minutos por falla hoy contra el promedio de los últimos 6 turnos con fallas).
 */
export function datosDeHoy(live: Pick<PublicMonitorLive, 'mantencion' | 'timeBreakdown'>, history: TurnoPrevio[] | null | undefined): DatosDeHoy {
  const pm = live.mantencion?.porMaquina ?? []
  const fallas = pm.reduce((a, x) => a + x.eventosFalla, 0)
  const fallaMin = pm.reduce((a, x) => a + x.fallaMin, 0)
  const previos = (history ?? []).slice(-6).flatMap((h) => {
    const hp = h.live?.mantencion?.porMaquina ?? []
    const ev = hp.reduce((a, x) => a + x.eventosFalla, 0)
    return ev > 0 ? [hp.reduce((a, x) => a + x.fallaMin, 0) / ev] : []
  })
  const disp = pm.map((x) => x.dispTecnicaPct).filter((x): x is number => x != null)
  const porDueno = new Map<DuenoPerdida, number>()
  for (const r of live.timeBreakdown?.recoverable ?? []) {
    const d = duenoDe(r.reason).dueno
    porDueno.set(d, (porDueno.get(d) ?? 0) + (r.equivMin ?? r.lineMin ?? r.min))
  }
  return {
    perdidas: (['mantencion', 'externo', 'sin-imputar'] as DuenoPerdida[]).map((d) => ({ dueno: d, min: porDueno.get(d) ?? 0 })),
    causas: (live.timeBreakdown?.recoverable ?? [])
      .map((r) => ({ causa: r.reason, min: r.equivMin ?? r.lineMin ?? r.min, dueno: duenoDe(r.reason).dueno, veces: r.count }))
      .filter((c) => c.min > 0)
      .sort((a, b) => b.min - a.min),
    eventos: (live.mantencion?.eventos ?? []).map((e) => ({ maquina: e.maquina, desde: e.desde, hasta: e.hasta, min: e.min, causa: e.causas[0] ?? null, causas: e.causas })),
    mant: live.mantencion
      ? {
          fallas,
          fallaMin,
          mttr: fallas > 0 ? fallaMin / fallas : null,
          mttrPrevio: previos.length ? previos.reduce((a, x) => a + x, 0) / previos.length : null,
          dispPct: disp.length ? disp.reduce((a, x) => a + x, 0) / disp.length : null,
        }
      : null,
  }
}

// ── Funciones puras ──────────────────────────────────────────────────────────

const HORA_MS = 3_600_000

/**
 * Lo que tocaba hacer en los primeros `minTranscurridos` minutos de una hora: `metaPorHora × min ÷ 60`, redondeado.
 * null sin meta o sin minutos (la hora recién parte: no hay resta honesta). Pasados los 60 min vale la hora completa.
 */
export function metaAEstaHora(metaPorHora: number | null | undefined, minTranscurridos: number): number | null {
  if (metaPorHora == null || !Number.isFinite(metaPorHora) || metaPorHora <= 0) return null
  if (!Number.isFinite(minTranscurridos) || minTranscurridos <= 0) return null
  return Math.round((metaPorHora * Math.min(60, minTranscurridos)) / 60)
}

export interface FallaEnHora { maquina: string; causa: string | null; desde: string; hasta: string; min: number }
export interface DetencionesHora {
  hourStart: string
  /** Fallas de equipo que tocaron esa hora. */
  fallas: number
  /** Minutos de MÁQUINA de esas fallas DENTRO de la hora (una falla que cruza la hora se reparte). */
  min: number
  items: FallaEnHora[]
}

/**
 * Reparte las fallas técnicas de hoy (`eventos`) en las horas corridas del turno. Cada fila abarca 60 min desde su
 * `from` (la última, parcial, también: una falla en curso no se pierde). Solo hay hora de las fallas de equipos: las
 * detenciones sin imputar no traen reloj, así que no se inventan.
 */
export function detencionesPorHora(
  eventos: Array<Pick<EventoHoy, 'maquina' | 'desde' | 'hasta' | 'causa' | 'causas'>>,
  horas: Array<Pick<HourlyRow, 'hourStart' | 'from'>>,
): DetencionesHora[] {
  return horas.map((h) => {
    const ini = Date.parse(h.from)
    const fin = ini + HORA_MS
    const items: FallaEnHora[] = []
    let min = 0
    for (const e of eventos) {
      const d = Date.parse(e.desde)
      const a = Date.parse(e.hasta)
      if (Number.isNaN(ini) || Number.isNaN(d) || Number.isNaN(a)) continue
      const m = (Math.min(a, fin) - Math.max(d, ini)) / 60_000
      if (m <= 0) continue
      items.push({ maquina: e.maquina, causa: e.causa ?? e.causas[0] ?? null, desde: e.desde, hasta: e.hasta, min: m })
      min += m
    }
    return { hourStart: h.hourStart, fallas: items.length, min, items }
  })
}

/**
 * % acumulado de cada fila de un pareto ordenado de mayor a menor: esa causa y las de arriba, sobre el total de las filas
 * recibidas (la última siempre cierra en 100). Sin minutos devuelve ceros.
 */
export function paretoAcumulado(rows: Array<{ minutes: number }>): number[] {
  const total = rows.reduce((a, r) => a + Math.max(0, r.minutes), 0)
  if (total <= 0) return rows.map(() => 0)
  let acc = 0
  return rows.map((r) => {
    acc += Math.max(0, r.minutes)
    return (acc / total) * 100
  })
}
