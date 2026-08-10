/**
 * Turnos de un mes, listos para pintar — la ÚNICA fuente de datos de la vista
 * de período del Análisis Grader.
 *
 * La Matriz (turno × día) y la Lista son dos presentaciones de este mismo hook,
 * no dos features: misma consulta, mismo período, mismos turnos. Por eso nunca
 * pueden discrepar entre sí, y por eso alternar entre ellas no cuesta una
 * recarga.
 *
 * COSTO: 2 queries por mes, sin importar cuántos turnos tenga.
 *   1. `listShoplogixShiftParentsForMonth` — UNA query de rango sobre los docs
 *      padre. Los padres traen los agregados por máquina, así que NO hace falta
 *      leer la subcolección `machines` de cada turno (que sería 1 query × turno).
 *   2. `listDailySummariesByRange` — UNA query de rango sobre los summaries.
 * Relevante porque el costo de Firestore de Shoplogix ya fue un problema real
 * en este repo (−76% writes / −73% reads en la optimización de julio).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listShoplogixShiftParentsForMonth,
  getSlxShiftCandidates,
  type ShoplogixShiftParent,
} from '@/services/shoplogix/shoplogixShift.service'
import { listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
import { getPlantLineConfig, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
import {
  buildPeriodShifts,
  periodShiftRows,
  periodDayKeys,
  indexPeriodShiftsByRow,
  type PeriodShift,
} from '@/services/grader/graderShiftPeriod'
import type { GraderDailySummary } from '@/services/grader/types'
import { applyUnscheduledAttribution, type CycleInterval } from '@/services/grader/graderUnscheduledAttribution'
import { loadUnscheduledIntervalsForKeys, loadCountedKeysForDate } from '@/services/grader/graderUnscheduledLoad'

export interface UseGraderShiftPeriodOptions {
  /** Año del mes a mostrar. */
  year: number
  /** Mes 0-indexed (0 = enero), igual que `Date.getMonth()`. */
  month: number
  plantLineId?: PlantLineId
  /** Permite montar el hook sin disparar las queries todavía. */
  enabled?: boolean
}

export interface UseGraderShiftPeriodResult {
  loading: boolean
  /** Mensaje de error si AMBAS fuentes fallaron. Una sola falla degrada, no rompe. */
  error: string | null
  /** Turnos del mes, orden cronológico. Alimenta la Lista tal cual. */
  shifts: PeriodShift[]
  /** shiftIds presentes, ordenados por hora de inicio. Son las filas de la Matriz. */
  rows: string[]
  /** Todos los días del mes (`YYYY-MM-DD`). Son las columnas de la Matriz. */
  days: string[]
  /** `${dateKey}__${shiftId}` → turno. Para pintar cada celda en O(1). */
  byKey: Map<string, PeriodShift>
  /** true si Shoplogix no respondió y lo que se ve viene solo del Grader. */
  slxDegraded: boolean
  refresh: () => void
}

export function useGraderShiftPeriod(
  opts: UseGraderShiftPeriodOptions,
): UseGraderShiftPeriodResult {
  const { year, month, plantLineId = DEFAULT_PLANT_LINE_ID, enabled = true } = opts

  const [parents, setParents] = useState<ShoplogixShiftParent[]>([])
  const [summaries, setSummaries] = useState<GraderDailySummary[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [slxDegraded, setSlxDegraded] = useState(false)
  const [nonce, setNonce] = useState(0)

  const plantSlug = getPlantLineConfig(plantLineId).plantSlug
  const days = useMemo(() => periodDayKeys(year, month), [year, month])

  // Evita que una respuesta lenta de un mes anterior pise la del mes actual
  // (pasa al navegar rápido entre meses con < >).
  const runIdRef = useRef(0)

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    const runId = ++runIdRef.current
    let alive = true

    setLoading(true)
    setError(null)

    const from = days[0]!
    const to = days[days.length - 1]!

    Promise.allSettled([
      listShoplogixShiftParentsForMonth(year, month, plantSlug),
      listDailySummariesByRange(from, to, plantLineId),
    ]).then(([slxRes, gradRes]) => {
      if (!alive || runId !== runIdRef.current) return

      // `listShoplogixShiftParentsForMonth` resuelve a null cuando la query
      // falla — no rechaza. Ambos casos son "no hay datos de Shoplogix".
      const slxOk = slxRes.status === 'fulfilled' && slxRes.value !== null
      const nextParents = slxOk ? slxRes.value! : []
      const gradOk = gradRes.status === 'fulfilled'
      const nextSummaries = gradOk ? gradRes.value : []

      setParents(nextParents)
      setSummaries(nextSummaries)
      setSlxDegraded(!slxOk && gradOk)

      if (!slxOk && !gradOk) {
        setError('No se pudieron cargar los turnos del período.')
      }
      setLoading(false)
    })

    return () => { alive = false }
  }, [year, month, plantSlug, plantLineId, enabled, days, nonce])

  const base = useMemo(
    () => buildPeriodShifts({ parents, summaries, plantSlug, getCandidates: getSlxShiftCandidates }),
    [parents, summaries, plantSlug],
  )

  // La producción "Unscheduled" no es un turno: es lo que quedó fuera de las
  // ventanas configuradas en Shoplogix. Con los tramos de su subcolección se
  // reparte entre los turnos que la produjeron (típicamente la planta entrando
  // antes de hora). Lo que no encuentra turno se conserva aparte, visible.
  const [unsIntervals, setUnsIntervals] = useState<Map<string, CycleInterval[]>>(new Map())
  const unsKeys = useMemo(
    () => base.filter(s => s.unscheduled).map(s => s.key).sort().join('|'),
    [base],
  )

  // Minutos que los turnos de esos días YA tienen contados: sin esto se suman
  // dos veces los tramos que Shoplogix reporta en el turno Y en Unscheduled.
  // Solo se leen los turnos de los días CON Unscheduled (1-3 docs por día), no
  // los del mes entero.
  const [countedKeys, setCountedKeys] = useState<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    if (!unsKeys) { setUnsIntervals(new Map()); setCountedKeys(new Map()); return }
    let alive = true
    const keys = unsKeys.split('|')

    loadUnscheduledIntervalsForKeys(keys, plantSlug).then(m => {
      if (alive) setUnsIntervals(m)
    })

    const fechas = [...new Set(keys.map(k => k.slice(0, 10)))]
    Promise.all(fechas.map(async dateKey => {
      // `shiftId`, no un corte de `key`: la key es `${dateKey}__${shiftId}` con
      // DOS guiones bajos y el doc de Firestore lleva uno solo.
      const delDia = base
        .filter(s => s.dateKey === dateKey && !s.unscheduled)
        .map(s => s.shiftId)
      if (delDia.length === 0) return [dateKey, new Set<string>()] as const
      return [dateKey, await loadCountedKeysForDate(dateKey, delDia, plantSlug)] as const
    })).then(entries => {
      if (alive) setCountedKeys(new Map(entries))
    })

    return () => { alive = false }
    // `base` cambia de identidad en cada carga; las fechas relevantes las fija
    // `unsKeys`, que es el disparador correcto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsKeys, plantSlug])

  const shifts = useMemo(
    () => applyUnscheduledAttribution(base, unsIntervals, countedKeys),
    [base, unsIntervals, countedKeys],
  )
  const rows = useMemo(() => periodShiftRows(shifts), [shifts])
  const byKey = useMemo(() => indexPeriodShiftsByRow(shifts), [shifts])

  const refresh = useCallback(() => setNonce(n => n + 1), [])

  return { loading, error, shifts, rows, days, byKey, slxDegraded, refresh }
}
