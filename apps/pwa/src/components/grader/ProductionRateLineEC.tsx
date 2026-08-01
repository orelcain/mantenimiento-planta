/**
 * ProductionRateLineEC — Gráfico de tasa de producción por Baader.
 *
 * Muestra piezas/minuto para cada máquina upstream (Baader 142 × N) y el
 * promedio de la línea, todo solapado en el mismo eje temporal. Permite
 * identificar cuál máquina baja primero y qué tan sincronizadas están.
 *
 * Sincroniza con TimelineSyncContext: zoom + axisPointer cross-chart.
 *
 * ENCODING SEGÚN LA LÍNEA (`rateChartMode`):
 *
 *   1 máquina  → BARRAS por tramo. Un proceso intermitente no tiene flujo
 *     continuo: el turno del 2026-07-28 de la Baader 200 tuvo 14 tramos con dato
 *     sobre 288 posibles, en dos racimos separados por 4,5 h. Una línea dibujaba
 *     continuidad donde no hubo ni un tramo con producción.
 *
 *   2+ máquinas → LÍNEAS. Acá la pregunta es otra: cuál de las Baader bajó
 *     primero y cuánto se separan entre sí. Con 3 series × ~100 tramos las barras
 *     quedan de 1-2 px pegadas (una reja ilegible, verificado en Yal) mientras la
 *     línea muestra la divergencia de un vistazo.
 *
 * Datos de entrada: `machines[].intervals` (buckets de 5 min con `cycles`).
 * Rate real = cycles / duracion_min del intervalo.
 *
 * Encima se dibuja el OBJETIVO por bucket que reporta el sensor (`targetRate`,
 * con `expectedCycles/duración` como respaldo en docs viejos) y se sombrean los
 * tramos donde el objetivo estaba corriendo y la producción fue 0 — que es la
 * lectura que importa: si el turno se perdió por ritmo o por máquina parada.
 */

import { useCallback, useEffect, useId, useMemo, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import { useTimelineSyncOptional } from './useTimelineSync'
import { useChartReadyConnect } from './useEChartsConnect'
import { fmtTime } from '@/services/grader/graderTimeFormat'

// ── Colores por máquina (sky, violet, emerald) + ámbar para el promedio ──────
const MACHINE_COLORS = [
  { line: 'rgba(56,189,248,0.9)',  area: 'rgba(56,189,248,0.08)'  },  // sky-400
  { line: 'rgba(167,139,250,0.9)', area: 'rgba(167,139,250,0.08)' },  // violet-400
  { line: 'rgba(52,211,153,0.9)',  area: 'rgba(52,211,153,0.08)'  },  // emerald-400
  { line: 'rgba(251,191,36,0.9)',  area: 'rgba(251,191,36,0.06)'  },  // amber-400 (más)
]
const AVG_COLOR  = { line: 'rgba(251,191,36,0.95)', area: 'rgba(251,191,36,0.12)' }  // amber
/** Objetivo del sensor — violeta, el mismo tono que ya usaba la línea de meta. */
const TARGET_COLOR = 'rgba(139,92,246,0.75)'
const OBJETIVO_LABEL = 'Objetivo'
/** Brecha al objetivo — rojo suave (semántico −50% croma del design system). */
const GAP_COLOR = 'rgba(176,112,109,0.42)'
const GAP_LABEL = 'Faltó'

/**
 * Ancho de tramo (min) según el rango visible: con más de 4 h a la vista, los
 * tramos de 5 min quedan de 1-2 px y se apelmazan, así que se agrupan a 15.
 */
function bucketMinutesForRange(rangeMin: number): 5 | 15 {
  return rangeMin > 4 * 60 ? 15 : 5
}
const GRID_COLOR = '#1e293b'

interface Props {
  machines: UpstreamMachineShift[]
  windowStart?: Date
  windowEnd?: Date
  /**
   * Muestra apilada la BRECHA al objetivo (lo que faltó en cada tramo).
   * Apagado por default: en un turno normal casi todo está cerca del objetivo y
   * el sombreado sería ruido; se prende cuando se quiere cuantificar la pérdida.
   */
  showGap?: boolean
}

// ── Helper: toma nombre de máquina y devuelve etiqueta corta ─────────────────
/**
 * Etiqueta de la máquina en la leyenda del gráfico.
 *
 * Shoplogix las nombra "Evisceradora 1/2/3" (verificado en la vista Chronological
 * de Planta Chonchi) y en planta se les dice "Baader". La versión anterior
 * devolvía "M1" — una nomenclatura que no usa nadie: ni Shoplogix, ni la planta,
 * ni el resto de la app, que ya mostraba "Ev 1" y "Evisceradora 1". Tres nombres
 * distintos para la misma máquina en la misma pantalla.
 *
 * Los nombres con número al final cubren todo lo que emite Shoplogix hoy:
 * "Evisceradora 2", "YAL Evisceradora 3", "Baader 142 / 1".
 */
export function shortMachineName(name: string): string {
  const mSlash = name.match(/\/\s*(\d+)\s*$/)
  if (mSlash) return `Baader ${mSlash[1]}`
  const mNum = name.match(/(\d+)\s*$/)
  if (mNum) return `Baader ${mNum[1]}`
  return name
}

/** Compila series de tasa pz/min unificando todos los buckets de tiempo. */
export function buildRateSeries(machines: UpstreamMachineShift[]): {
  timeAxis: number[]
  series: { name: string; data: (number | null)[] }[]
  avgSeries: { name: string; data: (number | null)[] }
  /** Objetivo por bucket (promedio de las máquinas con objetivo en ese bucket). */
  targetSeries: (number | null)[]
  /** Objetivo nominal = máximo por bucket. Ver por qué el máximo, más abajo. */
  expectedRate: number
  /** Tramos [desde, hasta] con objetivo vigente y producción 0. */
  stoppedWithTarget: [number, number][]
  showAvg: boolean
} {
  if (machines.length === 0) {
    return {
      timeAxis: [], series: [], avgSeries: { name: 'Promedio', data: [] },
      targetSeries: [], expectedRate: 0, stoppedWithTarget: [], showAvg: false,
    }
  }

  // Snap a grilla de 5 min: diferentes máquinas pueden tener buckets en :56/:01/:06
  // (Shoplogix registra cada una desde que arranca, no desde el mismo segundo).
  // Sin snap, M1 tiene datos en :01, :06... y M3 en :00, :05... → timeAxis mezclado
  // → en cada tick SOLO UNA máquina tiene valor → las líneas se "intercalan" y
  // parecen idénticas a escala de turno completo.
  const BUCKET_MS = 5 * 60_000
  const snap = (ts: number) => Math.round(ts / BUCKET_MS) * BUCKET_MS

  // Descartar intervalos que Shoplogix etiquetó en el turno equivocado.
  // Caso real: Apr-29 T3 (00:00-07:45 CL) — M2/M3 reciben intervalos de la tarde
  // anterior (13:15-15:35 UTC, T1/T2) etiquetados como "Turno 3" por Shoplogix.
  // ±2h de tolerancia cubre arranques lentos sin capturar turnos vecinos (>6h off).
  const SHIFT_BUFFER_MS = 2 * 60 * 60_000
  const filteredMachines = machines.map(m => {
    const winStart = (m.scheduledStart ?? m.shiftStart).getTime() - SHIFT_BUFFER_MS
    const winEnd   = (m.scheduledEnd   ?? m.shiftEnd).getTime()   + SHIFT_BUFFER_MS
    return {
      ...m,
      intervals: m.intervals.filter(iv => {
        const ts = iv.startAt.getTime()
        return ts >= winStart && ts <= winEnd
      }),
    }
  })

  // Colección de todos los timestamps únicos (alineados a grilla 5 min)
  const tsSet = new Set<number>()
  for (const m of filteredMachines) {
    for (const iv of m.intervals) tsSet.add(snap(iv.startAt.getTime()))
  }
  const timeAxis = [...tsSet].sort((a, b) => a - b)

  // Índice de cycles por máquina y timestamp (con snap)
  const machineRates: Map<number, number>[] = filteredMachines.map((m) => {
    const map = new Map<number, number>()
    for (const iv of m.intervals) {
      const durationMin = Math.max(1, (iv.endAt.getTime() - iv.startAt.getTime()) / 60_000)
      const key = snap(iv.startAt.getTime())
      if (!map.has(key)) map.set(key, iv.cycles / durationMin)
    }
    return map
  })

  const series = filteredMachines.map((m, i) => ({
    name: shortMachineName(m.machineName),
    data: timeAxis.map((ts) => {
      const r = machineRates[i]!.get(ts)
      return r !== undefined ? Math.round(r * 10) / 10 : null
    }),
  }))

  // Promedio: solo promediamos máquinas que tienen dato en ese bucket
  const avgData = timeAxis.map((ts) => {
    const vals = machineRates
      .map((r) => r.get(ts))
      .filter((v): v is number => v !== undefined)
    if (vals.length === 0) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  })

  // ── Objetivo por bucket ────────────────────────────────────────────────────
  // `targetRate` es la cadencia OBJETIVO que reporta el sensor (NO la real). En
  // docs previos a sourceVersion 4 no existe: se cae a expectedCycles/duración,
  // que da lo mismo (el sensor calcula uno desde el otro).
  const machineTargets: Map<number, number>[] = filteredMachines.map((m) => {
    const map = new Map<number, number>()
    for (const iv of m.intervals) {
      const durationMin = Math.max(1, (iv.endAt.getTime() - iv.startAt.getTime()) / 60_000)
      const t = iv.targetRate ?? (iv.expectedCycles > 0 ? iv.expectedCycles / durationMin : null)
      if (t == null || t <= 0) continue
      const key = snap(iv.startAt.getTime())
      if (!map.has(key)) map.set(key, t)
    }
    return map
  })

  const targetSeries = timeAxis.map((ts) => {
    const vals = machineTargets.map((t) => t.get(ts)).filter((v): v is number => v !== undefined)
    if (vals.length === 0) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  })

  // Objetivo NOMINAL = máximo de los objetivos por bucket, no el primero.
  // Los buckets de arranque/cierre son PARCIALES y el sensor escala el objetivo
  // al tiempo activo, así que el primero miente: en el turno del 28-jul de la
  // Baader 200 valía 5 pz/min cuando el objetivo real era 20 (mismo criterio que
  // `targetCpmFromIntervals` en plantKpiCompute).
  const expectedRate = targetSeries.reduce<number>((mx, v) => (v != null && v > mx ? v : mx), 0)

  // Tramos con objetivo vigente y producción 0 — buckets contiguos se fusionan
  // para que el sombreado sea un bloque y no una reja de rayitas.
  const stoppedWithTarget: [number, number][] = []
  const BUCKET_SPAN = BUCKET_MS
  for (let i = 0; i < timeAxis.length; i++) {
    const ts = timeAxis[i]!
    const target = targetSeries[i]
    if (target == null || target <= 0) continue
    const reales = machineRates.map((r) => r.get(ts)).filter((v): v is number => v !== undefined)
    if (reales.length === 0 || reales.some((v) => v > 0)) continue
    const last = stoppedWithTarget[stoppedWithTarget.length - 1]
    if (last && last[1] >= ts) { last[1] = ts + BUCKET_SPAN }
    else stoppedWithTarget.push([ts, ts + BUCKET_SPAN])
  }

  // Promedio solo tiene sentido cuando ≥2 máquinas tienen datos —
  // si solo 1 tiene intervals, Promedio = esa máquina exactamente y
  // su línea amber (z:5) tapaba la línea individual haciéndola invisible.
  const machinesWithData = filteredMachines.filter(m => m.intervals.length > 0).length

  return {
    timeAxis,
    series,
    avgSeries: { name: 'Promedio', data: avgData },
    targetSeries,
    expectedRate,
    stoppedWithTarget,
    showAvg: machinesWithData >= 2,
  }
}

/**
 * Datos de la serie de BRECHA (lo que faltó para el objetivo en cada tramo).
 *
 * Cuando la capa está apagada devuelve la misma cantidad de puntos pero todos en
 * null, en vez de una serie vacía. Es a propósito: `setOption` de ECharts MERGEA
 * por defecto, así que sacar una serie del array NO la borra del gráfico — la
 * capa se prendía y no se podía apagar. Manteniendo la serie con datos vacíos, el
 * merge sí reemplaza los datos y la capa desaparece de verdad.
 */
export function gapSeriesData(
  axis: number[],
  real: (number | null)[],
  target: (number | null)[],
  showGap: boolean,
): [number, number | null][] {
  return axis.map((ts, ti) => {
    if (!showGap) return [ts, null]
    const r = real[ti]
    const t = target[ti]
    // Sin dato real no hay brecha que mostrar (el tramo no existe), y sin
    // objetivo tampoco: nadie esperaba producción ahí.
    if (r == null || t == null || t <= 0) return [ts, null]
    return [ts, Math.max(0, Math.round((t - r) * 10) / 10)]
  })
}

/**
 * Encoding del gráfico según cuántas máquinas tiene la línea.
 *
 * No es preferencia estética: responde a preguntas distintas. Con una máquina
 * interesa "¿en qué tramos produjo y cuánto le faltó al objetivo?" (barras); con
 * varias, "¿cuál bajó primero y cuánto se separan?" (líneas).
 */
export function rateChartMode(machineCount: number): 'bar' | 'line' {
  return machineCount <= 1 ? 'bar' : 'line'
}

/**
 * Reagrupa una serie de tasas (pz/min) a tramos más anchos.
 *
 * Las tasas se PROMEDIAN entre los sub-tramos CON dato, no se divide por el
 * tramo completo: si de 3 sub-tramos de 5 min solo 1 tiene dato, dividir por 15
 * afirmaría que en los otros 10 min la máquina produjo cero, cuando lo que pasa
 * es que no hay dato. Un tramo sin ningún sub-tramo con dato queda null (hueco).
 */
export function regroupRates(
  timeAxis: number[],
  values: (number | null)[],
  groupMs: number,
): { timeAxis: number[]; values: (number | null)[] } {
  if (timeAxis.length === 0 || groupMs <= 0) return { timeAxis, values }
  const acc = new Map<number, { sum: number; n: number }>()
  for (let i = 0; i < timeAxis.length; i++) {
    const key = Math.floor(timeAxis[i]! / groupMs) * groupMs
    const v = values[i]
    const cur = acc.get(key) ?? { sum: 0, n: 0 }
    if (v != null) { cur.sum += v; cur.n += 1 }
    acc.set(key, cur)
  }
  const keys = [...acc.keys()].sort((a, b) => a - b)
  return {
    timeAxis: keys,
    values: keys.map((k) => {
      const a = acc.get(k)!
      return a.n > 0 ? Math.round((a.sum / a.n) * 10) / 10 : null
    }),
  }
}

export function ProductionRateLineEC({ machines, windowStart, windowEnd, showGap = false }: Props) {
  const echartsRef = useRef<any>(null)
  const myHoverId  = useId()
  const timelineSync = useTimelineSyncOptional()
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  const { timeAxis, series, avgSeries, targetSeries, expectedRate, stoppedWithTarget, showAvg } = useMemo(
    () => buildRateSeries(machines),
    [machines],
  )

  // Resaltado compartido (click en un evento del Gantt Baader, o filtro de
  // causal en la Cascada del turno) — mismos tramos que se pintan en los 3
  // Gantts, acá encima de la velocidad upstream para poder "demostrar" el
  // comportamiento real de las máquinas en ese tramo (Orel 2026-07-22).
  const highlightRanges = timelineSync?.highlightRanges ?? []

  // Rango temporal efectivo
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    if (windowStart && windowEnd) return [windowStart, windowEnd]
    if (timeAxis.length >= 2) {
      return [new Date(timeAxis[0]!), new Date(timeAxis[timeAxis.length - 1]!)]
    }
    return [new Date(), new Date()]
  }, [timelineSync?.range, windowStart, windowEnd, timeAxis])

  // Hover cross-chart
  const onMouseMove = useCallback((params: any) => {
    if (!timelineSync) return
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    const offsetX = params?.event?.offsetX ?? params?.offsetX
    if (typeof offsetX !== 'number') return
    const rawMs = inst.convertFromPixel({ xAxisIndex: 0 }, offsetX)
    if (typeof rawMs !== 'number' || !Number.isFinite(rawMs)) return
    timelineSync.setHover({ ms: Math.floor(rawMs / 60_000) * 60_000, originId: myHoverId })
  }, [timelineSync, myHoverId])

  const onMouseOut = useCallback(() => {
    if (timelineSync?.hover?.originId === myHoverId) timelineSync.setHover(null)
  }, [timelineSync, myHoverId])

  const externalHoverMs = timelineSync?.hover?.originId !== myHoverId
    ? timelineSync?.hover?.ms ?? null
    : null

  const hadExternalRef = useRef(false)
  useEffect(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    if (externalHoverMs == null) {
      // Solo limpiar si había hover externo previo — nunca hideTip incondicional
      // (mataría el tooltip cuando el cursor vuelve al chart propio)
      if (hadExternalRef.current) {
        inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' })
      }
      hadExternalRef.current = false
      return
    }
    hadExternalRef.current = true
    const pixelX = inst.convertToPixel({ xAxisIndex: 0 }, externalHoverMs)
    if (typeof pixelX !== 'number' || !Number.isFinite(pixelX)) return
    inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'mousemove', x: pixelX, y: 30 })
    // Hover viene de OTRO chart (típicamente StateTimelineEC del Gantt Baader,
    // que tiene su propio tooltip React). Ocultar el tooltip nativo de este chart
    // para que solo se vea el crosshair y no compita con el tooltip Baader.
    inst.dispatchAction({ type: 'hideTip' })
  }, [externalHoverMs])

  // Zoom sync
  const onDataZoom = useCallback(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst || !timelineSync) return
    const opt = inst.getOption?.()
    const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null
    if (!dz) return
    const startMs = typeof dz.startValue === 'number' ? dz.startValue : null
    const endMs   = typeof dz.endValue   === 'number' ? dz.endValue   : null
    if (startMs == null || endMs == null) return
    const totalMs = rangeEnd.getTime() - rangeStart.getTime()
    if ((endMs - startMs) / totalMs >= 0.995) { timelineSync.setRange(null); return }
    timelineSync.setRange({ startMs, endMs })
  }, [timelineSync, rangeStart, rangeEnd])

  // Max Y: percentil 95 de los datos para ignorar picos de arranque
  const maxRate = useMemo(() => {
    const vals: number[] = []
    for (const s of series) {
      for (const v of s.data) { if (v != null && v > 0) vals.push(v) }
    }
    if (vals.length === 0) return Math.max(expectedRate > 0 ? Math.ceil(expectedRate * 1.3) : 1, 1)
    vals.sort((a, b) => a - b)
    const p95 = vals[Math.floor(vals.length * 0.95)] ?? vals[vals.length - 1]!
    const ceiling = Math.max(p95 * 1.25, expectedRate > 0 ? expectedRate * 1.05 : 0)
    return Math.ceil(Math.max(ceiling, 1))
  }, [series, expectedRate])

  const option = useMemo(() => {
    // Ancho de barra en px: el tramo real (5 o 15 min) proyectado al eje, con un
    // mínimo de 2 px para que un tramo aislado siga siendo visible.
    const mode = rateChartMode(series.length)
    const rangeMin = (rangeEnd.getTime() - rangeStart.getTime()) / 60_000
    const bucketMin = bucketMinutesForRange(rangeMin)
    const barPx = Math.max(2, Math.min(22, Math.round((bucketMin / Math.max(rangeMin, 1)) * 560)))

    // Con rangos largos los tramos de 5 min quedan de 1-2 px: se agrupan a 15.
    const groupMs = bucketMin * 60_000
    const regrouped = bucketMin === 5
      ? { timeAxis, series: series.map(s => s.data), target: targetSeries }
      : (() => {
          const first = regroupRates(timeAxis, series[0]?.data ?? [], groupMs)
          return {
            timeAxis: first.timeAxis,
            series: series.map(s => regroupRates(timeAxis, s.data, groupMs).values),
            target: regroupRates(timeAxis, targetSeries, groupMs).values,
          }
        })()
    const axis = regrouped.timeAxis

    const machineSeries = series.map((s, i) => {
      const col = MACHINE_COLORS[i % MACHINE_COLORS.length]!
      const data = axis.map((ts, ti) => [ts, regrouped.series[i]?.[ti] ?? null] as [number, number | null])
      // Los tramos SIN dato quedan como hueco (null) en los dos modos: "no hubo
      // dato" y "produjo cero" son cosas distintas.
      const comun = {
        name: s.name,
        data,
        // Solo en la primera serie (una vez por chart) — mismo tramo resaltado
        // que en los Gantts Baader (StateTimelineEC), vía TimelineSyncContext.
        markArea: i === 0 && highlightRanges.length > 0 ? {
          silent: true,
          itemStyle: { color: 'rgba(250,204,21,0.14)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.5)', borderType: 'dashed' as const },
          data: highlightRanges.map((r) => ([{ xAxis: r.startMs }, { xAxis: r.endMs }])),
        } : undefined,
      }

      if (mode === 'line') {
        return {
          ...comun,
          type:        'line' as const,
          smooth:      0.3,
          connectNulls: false,
          symbol:      'circle',
          symbolSize:  4,
          lineStyle:   { color: col.line, width: 1.5 },
          itemStyle:   { color: col.line },
          areaStyle:   { color: col.area },
          emphasis:    { lineStyle: { width: 2.5 } },
        }
      }

      return {
        ...comun,
        type:        'bar' as const,
        // Stack FIJO: cambiarlo entre undefined y un id según el toggle dejaba al
        // merge de ECharts con una configuración a medias. Apilar una sola barra
        // con la brecha vacía se ve idéntico a no apilar.
        stack:       `pz-${s.name}`,
        barWidth:    barPx,
        barGap:      '10%',
        barCategoryGap: '0%',
        itemStyle:   { color: col.line, borderRadius: [1, 1, 0, 0] as [number, number, number, number] },
        emphasis:    { itemStyle: { color: col.line } },
      }
    })

    // Brecha al objetivo, apilada encima de cada barra: lo que faltó en ese tramo.
    // Solo con showGap; se calcula por máquina para que apile con su propia barra.
    // La brecha se apila sobre la barra: en modo línea no tiene dónde apilarse.
    // La serie existe SIEMPRE en modo barras (ver `gapSeriesData`): con el toggle
    // apagado va con datos vacíos, no se saca del array.
    const gapSeries = mode === 'bar'
      ? series.map((s, i) => ({
          name:     i === 0 ? GAP_LABEL : `${GAP_LABEL} ${s.name}`,
          type:     'bar' as const,
          stack:    `pz-${s.name}`,
          barWidth: barPx,
          data:     gapSeriesData(axis, regrouped.series[i] ?? [], regrouped.target, showGap),
          itemStyle: { color: GAP_COLOR },
          emphasis:  { itemStyle: { color: GAP_COLOR } },
          tooltip:   { valueFormatter: (v: number) => `${v} pz/min sin producir` },
        }))
      : []

    // Objetivo del sensor: línea punteada violeta, sin área y detrás de todo.
    // Va como serie propia (no como markLine horizontal) porque el objetivo NO
    // es constante: el sensor lo escala en los buckets parciales.
    const targetHasData = regrouped.target.some((v) => v != null && v > 0)
    const targetS = targetHasData ? {
      name:        OBJETIVO_LABEL,
      type:        'line' as const,
      data:        axis.map((ts, ti) => [ts, regrouped.target[ti]] as [number, number | null]),
      step:        'end' as const,
      // El objetivo es una CONSIGNA: no desaparece entre tramos. Sin conectar,
      // los tramos aislados se dibujaban como rayitas flotantes sueltas.
      connectNulls: true,
      symbol:      'none',
      lineStyle:   { color: TARGET_COLOR, width: 1.4, type: 'dashed' as const },
      itemStyle:   { color: TARGET_COLOR },
      z:           0,
      // Tramos con objetivo corriendo y producción 0: el sombreado dice de un
      // vistazo que la pérdida fue por máquina parada, no por ritmo lento.
      markArea: stoppedWithTarget.length > 0 ? {
        silent: true,
        itemStyle: {
          color: 'rgba(176,112,109,0.16)',
          borderWidth: 1,
          borderColor: 'rgba(176,112,109,0.45)',
          borderType: 'dashed' as const,
        },
        data: stoppedWithTarget.map(([from, to]) => ([
          { xAxis: from, name: 'parada con objetivo' },
          { xAxis: to },
        ])),
      } : undefined,
    } : null

    // Promedio: línea punteada sin área fill — queda visualmente detrás de las
    // líneas individuales (que son sólidas con área). Así B1/B2/B3 nunca quedan
    // tapadas aunque Promedio coincida con alguna de ellas.
    const avgS = showAvg ? {
      name:        'Promedio',
      type:        'line' as const,
      data:        (bucketMin === 5
        ? timeAxis.map((ts, ti) => [ts, avgSeries.data[ti]] as [number, number | null])
        : (() => { const g = regroupRates(timeAxis, avgSeries.data, groupMs); return g.timeAxis.map((ts, ti) => [ts, g.values[ti]] as [number, number | null]) })()),
      smooth:      0.3,
      connectNulls: false,
      symbol:      'diamond',
      symbolSize:  5,
      lineStyle:   { color: AVG_COLOR.line, width: 2, type: 'dashed' as const },
      itemStyle:   { color: AVG_COLOR.line },
      z:           1,
      emphasis:    { lineStyle: { width: 3 } },
      // markLine objetivo
      markLine: expectedRate > 0 ? {
        silent: true,
        animation: false,
        data: [{
          yAxis: expectedRate,
          lineStyle: { color: 'rgba(139,92,246,0.6)', type: 'dashed', width: 1 },
          label: {
            show: true,
            formatter: `objetivo ${expectedRate.toFixed(0)} pz/m`,
            color: 'rgba(139,92,246,0.9)',
            fontSize: 9,
            position: 'end',
          },
        }],
      } : undefined,
    } : null

    return {
      backgroundColor: 'transparent',
      grid:   { left: 0, right: 0, top: 6, bottom: 0, containLabel: true },
      legend: {
        show: true,
        top: 0,
        right: 0,
        textStyle: { color: '#64748b', fontSize: 9 },
        itemWidth: 12,
        itemHeight: 8,
        data: [
          ...series.map(s => s.name),
          ...(showAvg ? ['Promedio'] : []),
          ...(targetHasData ? [OBJETIVO_LABEL] : []),
          ...(showGap && mode === 'bar' && gapSeries.length > 0 ? [GAP_LABEL] : []),
        ],
      },
      xAxis: {
        type: 'time' as const,
        min:  rangeStart.getTime(),
        max:  rangeEnd.getTime(),
        axisLine: { show: false },
        axisTick: { show: true, lineStyle: { color: GRID_COLOR }, length: 3 },
        axisLabel: {
          show: true,
          color: '#64748b',
          fontSize: 9,
          formatter: (value: number) => fmtTime(value),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type:  'value' as const,
        min:   0,
        max:   maxRate,
        name:  'pz/min',
        nameTextStyle: { color: '#475569', fontSize: 8 },
        axisLine:  { show: false },
        axisTick:  { show: false },
        axisLabel: { show: true, color: '#475569', fontSize: 9, formatter: (v: number) => v.toFixed(0) },
        splitLine: { lineStyle: { color: GRID_COLOR, type: 'dashed' } },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1f2937',
        borderColor:     '#374151',
        textStyle:       { color: '#f1f5f9', fontSize: 11 },
        hideDelay: 800,
        axisPointer: {
          type:      'line' as const,
          lineStyle: { color: '#475569', type: 'dashed', width: 1 },
        },
        formatter: (params: any[]) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const ts  = params[0]?.value?.[0] as number
          const time = fmtTime(ts)
          const rows = params
            .filter(p => p.value?.[1] != null)
            .map(p => {
              const v = p.value[1] as number
              return `<span style="color:${p.color}">●</span> ${p.seriesName}: <strong>${v.toFixed(1)}</strong> pz/min`
            })
            .join('<br/>')
          return `<div style="font-size:10px;color:#94a3b8">${time}</div>${rows}`
        },
      },
      dataZoom: timelineSync ? [{
        type: 'inside' as const,
        xAxisIndex: 0,
        startValue: rangeStart.getTime(),
        endValue:   rangeEnd.getTime(),
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseWheel: false,
      }] : [],
      // El objetivo va PRIMERO para quedar detrás de las líneas reales.
      series: [
        ...(targetS ? [targetS] : []),
        ...machineSeries,
        ...gapSeries,
        ...(avgS ? [avgS] : []),
      ],
    }
  }, [series, avgSeries, targetSeries, stoppedWithTarget, timeAxis, rangeStart, rangeEnd, maxRate, expectedRate, timelineSync, showAvg, highlightRanges, showGap])

  if (timeAxis.length < 2) return null

  return (
    <ReactECharts
      ref={echartsRef}
      option={option}
      style={{ height: 120, width: '100%' }}
      onChartReady={onChartReady}
      onEvents={{
        mousemove: onMouseMove,
        mouseout:  onMouseOut,
        dataZoom:  onDataZoom,
      }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
