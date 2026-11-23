/**
 * «Línea manual por hora» (mockup v4, versión 5) con el 18-11 Turno 1 real a las 04:30: horas con el hueco del espejo
 * «sin lectura», negativos chicos «≈ 0», la colación «detenida» y el horario estimado de la entrada manual.
 */
import { describe, expect, it } from 'vitest'
import extra from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { cubetasDe } from '@/services/grader/espejo/espejoMinutos'
import { armarGraderVivo } from '../graderVivoDatos'
import { datosGrafico, detenciones, seriesEje } from '../graficoVivoDatos'
import {
  BARRA_MIN_PCT,
  MANUAL_DETENIDA_MIN,
  MANUAL_EXCESO_PZ_MIN,
  MANUAL_TRAMO_MIN,
  TOPE_MANUAL_PZ,
  filasManual,
  horasMin,
  resumenTramos,
  textoFila,
  tramosManual,
} from '../lineaManualDatos'

const T0 = Date.parse(extra.t0)
const HUECO = ['2026-11-18T23:39:26', '2026-11-19T00:28:51'] as const
const PROGRAMADA = /COLACION|REUNION|EJERCICIO|Limpieza/i

function a0430() {
  const t = turnoReal('2026-11-18-turno_1')
  const hasta = 435
  const lim = new Date(T0 + hasta * 60_000).toISOString()
  const piezas = t.piezas.filter((p) => p.ts >= extra.t0 && p.ts < lim && !(p.ts >= HUECO[0] && p.ts < HUECO[1]))
  const n = Math.max(0, Math.floor((T0 + hasta * 60_000 - Date.parse(t.baader.desde)) / 60_000) - 3)
  return armarGraderVivo({
    cubetas: cubetasDe(piezas),
    inicioMs: T0,
    finMs: T0 + 12 * 60 * 60_000,
    baader: { desde: t.baader.desde, maquinas: t.baader.maquinas.map((m) => ({ cycles: m.cycles.slice(0, n) })) },
    paradas: extra.paradas.map((p) => ({ desdeMs: Date.parse(p.desde), hastaMs: Date.parse(p.hasta), dueno: PROGRAMADA.test(p.causa) ? 'programado' as const : 'externo' as const })),
    minutosSinLatido: 0,
    turnoEnCurso: true,
    leidoHastaMs: T0 + hasta * 60_000,
  })
}

describe('Línea manual, 18-11 T1 a las 04:30', () => {
  const d = a0430()
  const filas = filasManual(d.manual, d.serie.t0Ms, detenciones(d.paradas, d.retraso.min, d.serie.hastaMin), d.serie.hastaMin, true)
  const ej = seriesEje(d)
  const tr = tramosManual(ej.grader, ej.baader)

  it('constantes del mockup: escala 0–450, exceso > 5 pz/min por 3 min, detenida desde 15 min', () => {
    expect([TOPE_MANUAL_PZ, MANUAL_EXCESO_PZ_MIN, MANUAL_TRAMO_MIN, MANUAL_DETENIDA_MIN, BARRA_MIN_PCT]).toEqual([450, 5, 3, 15, 1.5])
  })

  it('las horas como el mockup: sin lectura en el hueco, ≈ 0 en los negativos, la colación detenida y la hora en curso', () => {
    expect(filas.map((f) => [f.hora, textoFila(f)])).toEqual([
      ['22:00', '+38'],
      ['23:00', 'sin lectura'],
      ['00:00', 'sin lectura'],
      ['01:00', '+4 · detenida'],
      ['02:00', '−11 · ≈ 0'],
      ['03:00', '−45 · ≈ 0'],
      ['04:00', 'en curso'],
    ])
  })

  it('la barra va desde 0 con la escala fija', () => {
    const f = filas[0]!
    expect(f.tipo === 'barra' && f.pct).toBeCloseTo((38 / 450) * 100, 5)
  })

  it('horario estimado: 9 tramos, 30 min, ≈ 506 pz (hallazgo: el mockup decía 10 tramos y ≈ 634)', () => {
    expect(resumenTramos(tr)).toEqual({ n: 9, min: 30, pz: 506 })
    // Ningún tramo cae en el hueco del espejo (23:39 → 00:28 = min 144 a 194).
    expect(tr.every(([a, b]) => b <= 144 || a >= 194)).toBe(true)
  })

  it('la franja del gráfico usa los mismos tramos y el tooltip lo avisa', () => {
    expect(datosGrafico(d).manual).toEqual(tr)
  })

  it('tramos: 3 min seguidos sobre 5 pz marcan, 2 no; un minuto sin lectura corta', () => {
    expect(tramosManual([20, 20, 20, 0], [10, 10, 10, 0])).toEqual([[0, 3, 30]])
    expect(tramosManual([20, 20, 0], [10, 10, 0])).toEqual([])
    expect(tramosManual([20, null, 20, 20], [10, 10, 10, 10])).toEqual([])
    expect(tramosManual([20, 20, 20], null)).toEqual([])
    expect(horasMin(180)).toBe('3 h 00 min')
    expect(horasMin(45)).toBe('45 min')
  })
})
