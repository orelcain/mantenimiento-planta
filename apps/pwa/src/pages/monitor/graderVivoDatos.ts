/**
 * Datos de «Grader en vivo» (E-A): arma de una vez todo lo que pinta `GraderVivo.tsx`. Puro, aparte del componente
 * para que React Fast Refresh funcione y para probarlo sin DOM.
 */
import { DEFAULT_P0_CRITICAL_PCT, P0_LINE_MIN_PIECES } from '@/services/grader/graderP0Thresholds'
import { serieDesdeCubetas, type CubetaMinuto } from '@/services/grader/espejo/espejoMinutos'
import { evaluarAlertas, minutosCerrados } from '@/services/grader/espejo/alertasGrader'
import {
  baaderEnEje,
  lineaManualPorHora,
  p0Por15,
  repartoDelTurno,
  retrasoOReferencia,
  salidaUltimaHora,
  totalesDelTurno,
  type SerieMinutoBaader,
} from '@/services/grader/espejo/graderVivo'
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'

/** Una detención de Shoplogix ubicada en el reloj (ms wall-clock-as-UTC). */
export interface ParadaGrader {
  desdeMs: number
  hastaMs: number
  dueno: DuenoPerdida
}

/** Con menos piezas que esto en el turno y ninguna en Gate 0, se dice que el P0 llega con Puerta 0. */
export const PIEZAS_PARA_DECIR_SIN_GATE0 = 500

export interface EntradaGraderVivo {
  cubetas: readonly CubetaMinuto[]
  inicioMs: number
  finMs: number
  baader: SerieMinutoBaader | null
  paradas: readonly ParadaGrader[]
  minutosSinLatido: number | null
  turnoEnCurso: boolean
  /**
   * Hasta dónde leyó el lector ENTERO (ms wall-clock de su última lectura completa, sin tramo pendiente ni error).
   * Con esto un grader detenido se ve: hay minutos leídos sin piezas. `null` si no se sabe.
   */
  leidoHastaMs?: number | null
}

/** Todo lo que se pinta, calculado de una vez (puro: lo usan el componente y los tests). */
export function armarGraderVivo(e: EntradaGraderVivo) {
  const n = Math.max(1, Math.ceil((e.finMs - e.inicioMs) / 60_000))
  const serie = serieDesdeCubetas(e.cubetas, e.inicioMs, n)
  const baader = baaderEnEje(e.baader, serie.t0Ms)
  const retraso = retrasoOReferencia(baader, serie.pz, serie.hastaMin)
  const leidoHastaMin = e.leidoHastaMs != null && Number.isFinite(e.leidoHastaMs)
    ? Math.min(n, Math.max(serie.hastaMin - 1, Math.floor((e.leidoHastaMs - serie.t0Ms) / 60_000)))
    : null
  const cerrados = minutosCerrados({ hastaMin: serie.hastaMin, leidoHastaMin })
  const alertas = evaluarAlertas({
    leidoHastaMin,
    t0Ms: serie.t0Ms,
    grader: serie,
    baader,
    retrasoMin: retraso.min,
    hastaMin: serie.hastaMin,
    minutosSinLatido: e.minutosSinLatido,
    turnoEnCurso: e.turnoEnCurso,
    umbrales: { p0CriticoPct: DEFAULT_P0_CRITICAL_PCT, p0MinPiezas: P0_LINE_MIN_PIECES },
  })
  return {
    n,
    serie,
    baader,
    retraso,
    alertas,
    totales: totalesDelTurno(serie),
    salida: salidaUltimaHora(serie),
    p0: p0Por15(serie, P0_LINE_MIN_PIECES),
    reparto: repartoDelTurno(serie),
    // Solo horas cerradas: la de la última pieza puede seguir abierta.
    manual: lineaManualPorHora({ ...serie, hastaMin: cerrados }, baader, retraso.min),
    paradas: e.paradas
      .map((p) => ({ desde: (p.desdeMs - serie.t0Ms) / 60_000, hasta: (p.hastaMs - serie.t0Ms) / 60_000, dueno: p.dueno }))
      // Hasta donde hay dato (grader o Baader): una banda no puede ir por delante de la curva.
      .filter((p) => p.hasta > 0 && p.desde < Math.min(n, Math.max(serie.hastaMin, baader?.length ?? 0)))
      .map((p) => ({ ...p, hasta: Math.min(p.hasta, Math.max(serie.hastaMin, baader?.length ?? 0)) })),
  }
}

export type DatosGraderVivo = ReturnType<typeof armarGraderVivo>
