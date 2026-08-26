/**
 * Turno 2 del 26-08 en Eviscerado de Planta Principal, con las tres Baader.
 * El monitor decía, en el mismo bloque y a cuatro renglones de distancia:
 *
 *     Paradas   2.066 pz   10%
 *     ...
 *     Las paradas evitables llevan 12 min con la línea entera detenida.
 *
 * 2.066 piezas en 12 minutos son 172 pz/min. La línea entera da 45.
 *
 * De dónde salía: el reparto sumaba los minutos de MÁQUINA de cada causa
 * (`min`) en vez de los de LÍNEA (`lineMin`), que es el único que se traduce a
 * piezas que no pasaron por el sensor. En el payload real de ese turno:
 *
 *     causa                 min   lineMin
 *     KNURO                  88         8
 *     Micro Detencion        39         3
 *     Detencion              10         3
 *     LOGICA                  8         0
 *     ACUMULACION RECHAZO     6         5
 *     ─────────────────────────────────
 *     suma                  151        19      (`recoverableMin` de línea: 12)
 *
 * Con tres máquinas eso infla las paradas hasta 12 veces. Y exagerar la pérdida
 * por paradas es tan malo como esconderla: el día que alguien divida 2.066
 * entre 12 minutos, se cae la credibilidad del tablero entero.
 *
 * `cascadaTurno.ts` ya usaba `lineMin`, con el comentario que lo explica. Eran
 * dos varas para lo mismo en la misma pantalla.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TiempoDelTurno } from '../MonitorShiftParts'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'

/** El desglose tal como lo publicó el backend ese turno. */
const TB = {
  windowMin: 475,
  producingMin: 392,
  plannedMin: 61,
  recoverableMin: 12,
  planned: [
    { reason: 'COLACION', min: 66, count: 3, lineMin: 58 },
    { reason: 'REUNION INICIO TURNO', min: 9, count: 1, lineMin: 5 },
    { reason: 'EJERCICIO COMPENSATORIO - Paro', min: 6, count: 2, lineMin: 3 },
  ],
  recoverable: [
    { reason: 'KNURO', min: 88, count: 14, lineMin: 8 },
    { reason: 'Micro Detencion', min: 39, count: 71, lineMin: 3 },
    { reason: 'Detencion', min: 10, count: 2, lineMin: 3 },
    { reason: 'LOGICA', min: 8, count: 1, lineMin: 0 },
    { reason: 'ACUMULACION RECHAZO', min: 6, count: 1, lineMin: 5 },
  ],
} as unknown as PublicMonitorLive['timeBreakdown']

/** El grupo `programado` que arma `agruparEventos` a partir de `tb.planned`. */
const GRUPOS = [{
  dueno: 'programado' as const,
  min: 81,          // 66 + 9 + 6, la suma por MÁQUINA
  piezas: null,
  causas: TB!.planned.map((x) => ({
    reason: x.reason, min: x.min, count: x.count,
    piezas: null, categoria: null, extension: false, paradas: [],
  })),
}]

const texto = () => render(
  <TiempoDelTurno tb={TB} meta={20_000} hechas={13_689} cpmAndando={34.9} cerrado grupos={GRUPOS} />,
).container.textContent ?? ''

describe('las paradas se valorizan en minutos de LÍNEA', () => {
  it('OJO: 12 min de línea a 34,9 pz/min son ~420 pz, no 2.066', () => {
    const t = texto()
    const m = /Paradas[^\d]*([\d.]+) pz/.exec(t)
    expect(m).not.toBeNull()
    const pz = Number(m![1]!.replace(/\./g, ''))
    // Con `lineMin` (12 de línea) el costo cae al orden de los 400.
    expect(pz).toBeLessThan(700)
    expect(pz).toBeGreaterThan(200)
  })

  it('el costo no puede pedir un ritmo que la línea no da', () => {
    const t = texto()
    const pz = Number(/Paradas[^\d]*([\d.]+) pz/.exec(t)![1]!.replace(/\./g, ''))
    // 12 minutos de línea detenida: cualquier cifra que implique más de 60
    // pz/min es imposible en una línea de tres Baader.
    expect(pz / 12).toBeLessThan(60)
  })

  it('OJO: «Programado» dice los minutos de LÍNEA, no la suma por máquina', () => {
    // 66 + 9 + 6 = 81 min de máquina; `plannedMin` de línea es 61. Mostrar 81
    // además rompe el reparto: 392 + 81 + 12 se pasa de la ventana de 475.
    const t = texto()
    expect(t).toMatch(/1 h 1 min/)
    expect(t).not.toMatch(/1 h 21 min/)
  })
})
