/**
 * Reparto SEMANAL de las pérdidas recuperables por dueño — equipos
 * (Mantención) vs externo (MMPP/proceso) vs sin imputar.
 *
 * ── Para qué existe ─────────────────────────────────────────────────────────
 * La meta grande del proyecto: DEMOSTRAR con datos, semana a semana, qué parte
 * de las pérdidas es de equipos y qué parte no. Con los datos reales de agosto
 * la historia es doble: cuando se imputa, equipos es minoría (22%/44% vs 55%/
 * 22% externo) — y cuando no se imputa, el gris domina (83-86%) y delata que
 * la historia está sin contar.
 *
 * ── Las dos trampas pagadas que este módulo esquiva ─────────────────────────
 * ⚠⚠⚠ `shiftStats[].recoverable[].min` son minutos de MÁQUINA (la trampa que
 * infló el Pareto 5,6×): acá se ESCALAN a minutos de LÍNEA a prorrata de
 * `recoverableMin`, que sí es de línea — el patrón establecido del monitor.
 * ⚠ Las piezas se valorizan al ritmo PROPIO de cada turno (total/producingMin),
 * nunca a un promedio global: un ritmo sobre tiempo productivo solo se compara
 * contra ritmos productivos.
 */

import type { ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import { duenoDe, type DuenoPerdida } from '@/services/shoplogix/monitorEventos'

/** Los tres dueños que aparecen en lo recuperable (lo programado no entra). */
export type DuenoReparto = Exclude<DuenoPerdida, 'programado'>

export interface SemanaReparto {
  /** Lunes de la semana (dateKey, hora de planta). */
  semana: string
  turnos: number
  /** Piezas PRODUCIDAS en la semana (contexto del tamaño). */
  piezas: number
  /** Minutos de LÍNEA y piezas estimadas de pérdida, por dueño. */
  min: Record<DuenoReparto, number>
  pz: Record<DuenoReparto, number>
  /** Las causas top de la semana por dueño (min de línea), para el detalle. */
  causas: Record<DuenoReparto, Array<{ causa: string; min: number }>>
}

/** Lunes de la semana del dateKey (el dateKey ya viene en hora de planta). */
export function lunesDe(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * Agrega `shiftStats` por semana calendario (lunes-domingo, hora de planta).
 * Devuelve las últimas `maxSemanas` en orden cronológico. Un turno sin
 * `recoverableMin` o sin `producingMin` aporta solo al conteo/piezas.
 */
export function repartoSemanal(
  stats: readonly ShiftStat[] | null | undefined,
  maxSemanas = 6,
): SemanaReparto[] {
  if (!stats?.length) return []
  const semanas = new Map<string, SemanaReparto>()
  const causasAcum = new Map<string, Map<string, { dueno: DuenoReparto; min: number }>>()

  for (const t of stats) {
    const w = lunesDe(t.dateKey)
    let s = semanas.get(w)
    if (!s) {
      s = {
        semana: w, turnos: 0, piezas: 0,
        min: { mantencion: 0, externo: 0, 'sin-imputar': 0 },
        pz: { mantencion: 0, externo: 0, 'sin-imputar': 0 },
        causas: { mantencion: [], externo: [], 'sin-imputar': [] },
      }
      semanas.set(w, s)
      causasAcum.set(w, new Map())
    }
    s.turnos++
    s.piezas += t.total || 0

    const sumaMaquina = (t.recoverable ?? []).reduce((a, c) => a + (c.min || 0), 0)
    if (!(sumaMaquina > 0) || t.recoverableMin == null || !(t.recoverableMin >= 0)) continue
    /* Escala máquina → línea: las causas reparten los minutos de LÍNEA a
       prorrata de sus minutos de máquina. */
    const factor = t.recoverableMin / sumaMaquina
    const ritmo = t.producingMin > 0 ? (t.total || 0) / t.producingMin : 0
    const mapa = causasAcum.get(w)!
    for (const c of t.recoverable ?? []) {
      const linMin = (c.min || 0) * factor
      if (!(linMin > 0)) continue
      const d = duenoDe(c.reason).dueno
      const dueno: DuenoReparto = d === 'programado' ? 'sin-imputar' : d
      s.min[dueno] += linMin
      s.pz[dueno] += linMin * ritmo
      const prev = mapa.get(c.reason)
      if (prev) prev.min += linMin
      else mapa.set(c.reason, { dueno, min: linMin })
    }
  }

  const out = [...semanas.values()].sort((a, b) => (a.semana < b.semana ? -1 : 1)).slice(-maxSemanas)
  for (const s of out) {
    const mapa = causasAcum.get(s.semana)
    if (!mapa) continue
    for (const [causa, x] of mapa) s.causas[x.dueno].push({ causa, min: x.min })
    for (const d of ['mantencion', 'externo', 'sin-imputar'] as const) {
      s.causas[d].sort((a, b) => b.min - a.min)
      s.causas[d] = s.causas[d].slice(0, 5)
    }
  }
  return out
}
