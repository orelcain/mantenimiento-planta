/**
 * monitorPerdidas.ts — cuánto costó cada parada, en piezas.
 *
 * ── Por qué NO se usa el promedio del turno ─────────────────────────────────
 *
 * Valorizar todas las paradas al ritmo promedio SOBREESTIMA lo que se le imputa
 * a cada una, y eso cae directo sobre Mantención: "se perdieron X piezas por esa
 * detención" tiene que aguantar que alguien lo revise con los datos en la mano.
 *
 * Lo vio Orel el 14-08 mirando el turno de Filete: el promedio andando del turno
 * era 13,5 pz/min, pero justo antes del corte de agua la línea venía a 12,1, y
 * en los tramos previos había bajado a 8,5 y 10,9. Esas piezas no se iban a
 * producir igual. Medido sobre ese turno: con el promedio, las paradas
 * recuperables suman 719 pz; con el ritmo que la línea traía en cada momento,
 * 662 — **un 8% menos**. El corte de agua solo baja de 146 a 131. Cincuenta y
 * siete piezas que no corresponde imputarle a nadie.
 *
 * (Verificado contra el turno `filete/2026-08-14_Turno Dia`: 40 eventos, de los
 * cuales 4 —los del arranque— no tenían 30 min hacia atrás y usaron el promedio.)
 *
 * ── El método ──────────────────────────────────────────────────────────────
 *
 * Para cada evento, el ritmo local es la MEDIANA de los tramos productivos de
 * los 30 minutos anteriores. Mediana y no promedio: un solo tramo raro no puede
 * mover la cifra. Solo hacia atrás, porque la pregunta es "¿a qué velocidad
 * venía la línea cuando se cortó?" — lo de después ya está contaminado por el
 * arranque post-parada.
 *
 * ⚠ El ritmo de un tramo se calcula sobre su tiempo ANDANDO, no sobre los 5
 * minutos: un tramo con 2 minutos de parada produce menos sin ser más lento. Y
 * los tramos con parada quedan fuera de la ventana (`paro < 1 min`): mezclarlos
 * arrastraría la referencia hacia abajo y subestimaría la pérdida, que es el
 * error opuesto y también miente.
 *
 * ⚠ Sin tramos limpios en la ventana se cae al promedio del turno, y el
 * resultado dice cuántos eventos quedaron así: un número que se apoya en el
 * respaldo no se puede defender igual que uno medido.
 */
import type { MonitorSeriesPoint } from './monitorHourly'

/** Lo que costó una causa, sumando sus eventos. */
export interface CostoDeCausa {
  reason: string
  min: number
  piezas: number
  eventos: number
  /** Ritmo con que se valorizó, en pz/min. Es el promedio ponderado de sus eventos. */
  cpm: number
}

export interface CostoDeParadas {
  porCausa: CostoDeCausa[]
  totalPiezas: number
  totalMin: number
  /** Eventos que no tuvieron ritmo local y cayeron al promedio del turno. */
  sinLocal: number
  /** Cuántos eventos se valorizaron en total. */
  eventos: number
}

/** Mediana; null con la lista vacía. */
function mediana(v: number[]): number | null {
  if (v.length === 0) return null
  const o = [...v].sort((a, b) => a - b)
  return o[Math.floor(o.length / 2)]!
}

/**
 * Minutos parados y ritmo de cada tramo de 5 min.
 *
 * Exportada para poder auditarla: el ritmo local sale de acá y conviene poder
 * mirarlo tramo por tramo cuando alguien discute una cifra.
 */
export function ritmosPorTramo(
  series: MonitorSeriesPoint[],
  stopEvents: Array<{ r: number; f: string; s: number }>,
): Array<{ paroMin: number; upMin: number; cpm: number | null }> {
  const t0 = Date.parse(series[0]!.t)
  const PASO = 5 * 60_000
  const paro = series.map(() => 0)
  for (const e of stopEvents) {
    const a = Date.parse(e.f)
    if (Number.isNaN(a)) continue
    const b = a + e.s * 1000
    for (let i = 0; i < series.length; i++) {
      const ta = t0 + i * PASO
      const solape = Math.min(b, ta + PASO) - Math.max(a, ta)
      if (solape > 0) paro[i]! += solape / 60_000
    }
  }
  return series.map((p, i) => {
    const paroMin = Math.min(5, paro[i]!)
    const upMin = Math.max(0, 5 - paroMin)
    // Con menos de 2 minutos andando el ritmo del tramo es ruido: 3 piezas en
    // 20 segundos darían 9 pz/min sin que eso signifique nada.
    return { paroMin, upMin, cpm: upMin >= 2 ? (p.pieces || 0) / upMin : null }
  })
}

/**
 * El costo en piezas de las paradas recuperables, cada una al ritmo que la
 * línea traía cuando ocurrió.
 */
export function costoDeParadas(args: {
  series?: MonitorSeriesPoint[] | null
  stopEvents?: Array<{ r: number; f: string; s: number }> | null
  stopReasons?: string[] | null
  /** Causas que se imputan. Las de convenio NO entran acá. */
  recuperables: string[]
  /** Promedio del turno andando, como respaldo cuando no hay tramos limpios. */
  cpmGlobal: number
  /** Ventana hacia atrás para el ritmo local, en minutos. */
  ventanaMin?: number
  /**
   * Cuántas máquinas tiene la línea.
   *
   * ⚠ Cada evento de `stopEvents` es la parada de UNA máquina, pero el ritmo
   * local sale de `series`, que son las piezas de la LÍNEA. Multiplicar los
   * minutos de una máquina por el ritmo de tres era cobrar la parada tres
   * veces: en Chonchi (3 Baader) la "Detención" del turno del 24-08 sumaba
   * 239 min de máquina y salía valorizada en 10.871 pz, cuando la línea
   * completa solo estuvo detenida 67 min. Con una sola máquina —Filete— el
   * divisor es 1 y no cambia nada.
   */
  maquinas?: number | null
}): CostoDeParadas | null {
  const { series, stopEvents, stopReasons, cpmGlobal } = args
  if (!series || series.length === 0 || !stopEvents || !stopReasons) return null
  if (!(cpmGlobal > 0)) return null
  const imputables = new Set(args.recuperables)
  if (imputables.size === 0) return null
  const maquinas = args.maquinas && args.maquinas > 0 ? args.maquinas : 1

  const t0 = Date.parse(series[0]!.t)
  if (Number.isNaN(t0)) return null
  const PASO = 5 * 60_000
  const tramos = ritmosPorTramo(series, stopEvents)
  const V = Math.max(1, Math.round((args.ventanaMin ?? 30) / 5))

  const acc = new Map<string, { min: number; piezas: number; eventos: number }>()
  let sinLocal = 0
  let eventos = 0

  for (const e of stopEvents) {
    const causa = stopReasons[e.r]
    if (!causa || !imputables.has(causa)) continue
    const a = Date.parse(e.f)
    if (Number.isNaN(a) || !(e.s > 0)) continue

    const i0 = Math.floor((a - t0) / PASO)
    const ventana: number[] = []
    for (let i = i0 - V; i < i0; i++) {
      const t = tramos[i]
      /*
       * Solo tramos LIMPIOS y CON producción.
       *
       * Los que tuvieron parada arrastran la referencia hacia abajo. Y los que
       * están en cero sin parada registrada tampoco sirven: son la rampa del
       * arranque —los dos primeros tramos del turno, antes de la primera
       * pieza— o una detención que el sensor no etiquetó. Contarlos como
       * "la línea iba a 0" haría que una parada costara 0 piezas, que es
       * subestimar, el error opuesto y también falso.
       */
      if (i >= 0 && t && t.cpm != null && t.cpm > 0 && t.paroMin < 1) ventana.push(t.cpm)
    }
    const local = mediana(ventana)
    if (local == null) sinLocal++
    const cpm = local ?? cpmGlobal
    const min = e.s / 60
    eventos++
    const prev = acc.get(causa) ?? { min: 0, piezas: 0, eventos: 0 }
    acc.set(causa, {
      min: prev.min + min,
      // El ritmo es de la LÍNEA y la parada es de UNA máquina (ver `maquinas`).
      piezas: prev.piezas + (min * cpm) / maquinas,
      eventos: prev.eventos + 1,
    })
  }

  const porCausa: CostoDeCausa[] = [...acc.entries()]
    .map(([reason, v]) => ({
      reason,
      min: v.min,
      piezas: v.piezas,
      eventos: v.eventos,
      // Se informa el ritmo de LÍNEA (el que se muestra al explicar la cifra),
      // no el de una máquina: las piezas ya vienen divididas.
      cpm: v.min > 0 ? (v.piezas * maquinas) / v.min : cpmGlobal,
    }))
    .sort((a, b) => b.piezas - a.piezas)

  return {
    porCausa,
    totalPiezas: porCausa.reduce((a, c) => a + c.piezas, 0),
    totalMin: porCausa.reduce((a, c) => a + c.min, 0),
    sinLocal,
    eventos,
  }
}
