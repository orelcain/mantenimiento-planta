/**
 * KPI «fallas repetidas de Mantención» (Análisis › «Lo que se repite», 03-11-2026): de las fallas de
 * máquina (Mantención) de las últimas 4 semanas cerradas, ¿cuántas tuvieron otra en la misma Baader
 * antes de 2 h? Se compara con las 4 semanas anteriores y con el promedio de todas las cerradas.
 *
 * Cálculo puro. La definición de falla y de «repetida» la aplica el backend (`semanasFallasMantencion`,
 * `functions/shoplogix/fallaRepetida.js`): aquí solo se suma por semana de calendario (lunes a domingo)
 * y se compara. La semana en curso no entra en ninguna cifra.
 */
import type { FallaRepetidaSemana } from '@/services/shoplogix/publicShiftMonitor.service'
import { lunesDe } from './repartoSemanal'

/** Semanas por tramo, y los puntos de diferencia desde los que se dice «mejor» o «peor» (menos es «igual»). */
export const KPI_FALLAS_REPETIDAS = { semanas: 4, igualPts: 5 } as const

export interface TramoFallas {
  /** Lunes del primer día del tramo (YYYY-MM-DD). */
  desde: string
  /** Domingo del último día del tramo (YYYY-MM-DD). */
  hasta: string
  fallas: number
  repetidas: number
  /** 0–100, sin redondear; null si no hubo fallas. */
  pct: number | null
}

export interface FilaSemanaFallas {
  /** Lunes de la semana (YYYY-MM-DD). */
  semana: string
  turnos: number
  fallas: number
  repetidas: number
  pct: number | null
  tramo: 'curso' | 'ultimas' | 'anteriores'
}

export interface ResumenFallasRepetidas {
  ultimas: TramoFallas
  anteriores: TramoFallas
  promedio: TramoFallas & { meses: number; semanas: number }
  /** Diferencia en puntos entre los % que se ven (redondeados); null si falta alguno. */
  deltaPts: number | null
  estado: 'mejor' | 'peor' | 'igual' | null
  /** La semana en curso si viene (tramo 'curso'); luego las 4 últimas y las 4 anteriores, de la más nueva a la más vieja. */
  filas: FilaSemanaFallas[]
}

const DIA_MS = 86_400_000
const DIAS_POR_MES = 30.44
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const aMs = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`)
const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const sumarDias = (fecha: string, dias: number) => aFecha(aMs(fecha) + dias * DIA_MS)
const porcentaje = (fallas: number, repetidas: number) => (fallas > 0 ? (100 * repetidas) / fallas : null)

/** null si falta `hoy`, no hay semanas, no hay semanas cerradas o hay menos de 8 semanas de historia. */
export function resumenFallasRepetidas(
  semanas: readonly FallaRepetidaSemana[] | null | undefined,
  hoy: string | null | undefined,
): ResumenFallasRepetidas | null {
  if (!hoy || !FECHA_RE.test(hoy) || !semanas || semanas.length === 0) return null
  const n = KPI_FALLAS_REPETIDAS.semanas
  const lunesHoy = lunesDe(hoy)
  const cerradas = semanas.filter((s) => s.semana < lunesHoy)
  const primera = cerradas.reduce<string | null>((m, s) => (m == null || s.semana < m ? s.semana : m), null)
  const anterioresDesde = sumarDias(lunesHoy, -2 * n * 7)
  // La primera semana cerrada tiene que ser anterior o igual al lunes de las 4 anteriores: si no, hay menos de 8 semanas de historia.
  if (primera == null || primera > anterioresDesde) return null

  const sumaEntre = (desde: string, hasta: string) =>
    cerradas.reduce(
      (a, s) => (s.semana >= desde && s.semana <= hasta ? { fallas: a.fallas + s.fallas, repetidas: a.repetidas + s.repetidas } : a),
      { fallas: 0, repetidas: 0 },
    )
  const tramo = (desde: string, hasta: string): TramoFallas => {
    const t = sumaEntre(desde, hasta)
    return { desde, hasta, fallas: t.fallas, repetidas: t.repetidas, pct: porcentaje(t.fallas, t.repetidas) }
  }
  const hastaUltimas = sumarDias(lunesHoy, -1)
  const ultimas = tramo(sumarDias(lunesHoy, -n * 7), hastaUltimas)
  const anteriores = tramo(anterioresDesde, sumarDias(lunesHoy, -n * 7 - 1))

  const todas = sumaEntre(primera, hastaUltimas)
  const dias = Math.round((aMs(hastaUltimas) - aMs(primera)) / DIA_MS) + 1
  const promedio = {
    desde: primera,
    hasta: hastaUltimas,
    fallas: todas.fallas,
    repetidas: todas.repetidas,
    pct: porcentaje(todas.fallas, todas.repetidas),
    meses: Math.round(dias / DIAS_POR_MES),
    semanas: cerradas.length,
  }

  const deltaPts = ultimas.pct == null || anteriores.pct == null ? null : Math.round(ultimas.pct) - Math.round(anteriores.pct)
  const estado: ResumenFallasRepetidas['estado'] =
    deltaPts == null ? null : Math.abs(deltaPts) < KPI_FALLAS_REPETIDAS.igualPts ? 'igual' : deltaPts < 0 ? 'mejor' : 'peor'

  // Una semana que no viene cuenta 0 (turnos 0, fallas 0, pct null). La en curso va aparte, primera.
  const porSemana = new Map(semanas.map((s) => [s.semana, s] as const))
  const filaDe = (semana: string, tramoFila: FilaSemanaFallas['tramo']): FilaSemanaFallas => {
    const s = porSemana.get(semana)
    const fallas = s?.fallas ?? 0
    const repetidas = s?.repetidas ?? 0
    return { semana, turnos: s?.turnos ?? 0, fallas, repetidas, pct: porcentaje(fallas, repetidas), tramo: tramoFila }
  }
  const filas: FilaSemanaFallas[] = porSemana.has(lunesHoy) ? [filaDe(lunesHoy, 'curso')] : []
  for (let i = 1; i <= n; i++) filas.push(filaDe(sumarDias(lunesHoy, -i * 7), 'ultimas'))
  for (let i = n + 1; i <= 2 * n; i++) filas.push(filaDe(sumarDias(lunesHoy, -i * 7), 'anteriores'))

  return { ultimas, anteriores, promedio, deltaPts, estado, filas }
}
