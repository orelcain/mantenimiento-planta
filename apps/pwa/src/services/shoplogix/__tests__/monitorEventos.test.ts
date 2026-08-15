/**
 * Los eventos del turno, agrupados por dueño de la pérdida.
 *
 * ⚠ Lo que se protege acá es que no se le cuelgue a Mantención algo que no es
 * suyo, y al revés: que las fallas de máquina no queden escondidas en "sin
 * imputar" donde nadie las mide.
 *
 * Los casos salen del turno real de Filete del 14-08 y de las 21 causas
 * observadas en sus últimos 12 turnos.
 */
import { describe, it, expect } from 'vitest'
import { agruparEventos, minutosDeMantencion } from '../monitorEventos'
import type { PublicMonitorLive } from '../publicShiftMonitor.service'

const T0 = '2026-08-14T07:45:00.000Z'
const ev = (r: number, min: number, dur: number) => ({
  r,
  f: new Date(Date.parse(T0) + min * 60_000).toISOString(),
  s: dur * 60,
})

/** El 14-08: nada de máquina, todo operación / abastecimiento / sin imputar. */
const TB_14_08: PublicMonitorLive['timeBreakdown'] = {
  windowMin: 405,
  producingMin: 291,
  plannedMin: 63,
  recoverableMin: 52,
  planned: [
    { reason: 'COLACION', min: 56, count: 2, lineMin: 56 },
    { reason: 'REUNION INICIO TURNO', min: 2, count: 1, lineMin: 2 },
  ],
  recoverable: [
    { reason: 'FALLA OPERACIONAL', min: 14, count: 4, lineMin: 14 },
    { reason: 'AGUA', min: 11, count: 1, lineMin: 11 },
    { reason: 'Micro Detencion', min: 10, count: 23, lineMin: 10 },
    { reason: 'ACUMULACION', min: 9, count: 3, lineMin: 9 },
    { reason: 'ATASCAMIENTO', min: 8, count: 4, lineMin: 8 },
  ],
}

const COSTO = {
  porCausa: [
    { reason: 'FALLA OPERACIONAL', min: 14, piezas: 183, eventos: 4, cpm: 13.1 },
    { reason: 'Micro Detencion', min: 10, piezas: 135, eventos: 23, cpm: 12.3 },
    { reason: 'AGUA', min: 11, piezas: 131, eventos: 1, cpm: 12.1 },
    { reason: 'ACUMULACION', min: 9, piezas: 117, eventos: 3, cpm: 12.6 },
    { reason: 'ATASCAMIENTO', min: 8, piezas: 96, eventos: 4, cpm: 11.6 },
  ],
  totalPiezas: 662, totalMin: 52, sinLocal: 0, eventos: 40,
}

describe('agruparEventos', () => {
  it('⚠⚠ el 14-08 no tuvo ni un minuto de máquina', () => {
    const g = agruparEventos({ tb: TB_14_08, costo: COSTO })
    expect(minutosDeMantencion(g)).toBe(0)
    expect(g.map((x) => x.dueno)).toEqual(['externo', 'sin-imputar', 'programado'])
  })

  it('reparte según el árbol del curso, no según nuestro criterio', () => {
    const g = agruparEventos({ tb: TB_14_08, costo: COSTO })
    const externo = g.find((x) => x.dueno === 'externo')!
    // FALLA OPERACIONAL (Operacionales), AGUA (Abastecimiento), ATASCAMIENTO (MMPP)
    expect(externo.causas.map((c) => c.reason)).toEqual(['FALLA OPERACIONAL', 'AGUA', 'ATASCAMIENTO'])
    expect(externo.piezas).toBe(410)
    expect(externo.causas[0]!.categoria).toBe('Operacional')
    expect(externo.causas[1]!.categoria).toBe('Abastecimiento')
    expect(externo.causas[2]!.categoria).toBe('MMPP')
  })

  it('⚠ lo que nadie imputó se muestra como tal, no repartido', () => {
    const g = agruparEventos({ tb: TB_14_08, costo: COSTO })
    const sin = g.find((x) => x.dueno === 'sin-imputar')!
    expect(sin.causas.map((c) => c.reason)).toEqual(['Micro Detencion', 'ACUMULACION'])
    expect(sin.piezas).toBe(252)
    expect(sin.causas[0]!.categoria).toBeNull()
  })

  it('⚠⚠ el convenio NO se convierte a piezas', () => {
    const g = agruparEventos({ tb: TB_14_08, costo: COSTO })
    const prog = g.find((x) => x.dueno === 'programado')!
    expect(prog.piezas).toBeNull()
    expect(prog.causas.every((c) => c.piezas == null)).toBe(true)
    expect(prog.min).toBe(58)
  })

  it('una falla de la Baader 200 sí cae en Mantención', () => {
    // Antes de extender el árbol, estos 80 min vivían en "sin imputar".
    const tb = {
      ...TB_14_08,
      recoverable: [{ reason: 'Baader 200/CUCHILLERIA DORSAL', min: 80, count: 5, lineMin: 80 }],
    }
    const g = agruparEventos({ tb, costo: null, cpmGlobal: 10 })
    expect(g[0]!.dueno).toBe('mantencion')
    expect(g[0]!.causas[0]!.categoria).toBe('Mecánica')
    expect(g[0]!.causas[0]!.extension).toBe(true)   // la hoja no es del curso
    expect(g[0]!.piezas).toBe(800)                  // respaldo: 80 min x 10 pz/min
  })

  it('las causas se ordenan por lo que costaron, no por minutos', () => {
    const g = agruparEventos({ tb: TB_14_08, costo: COSTO })
    const sin = g.find((x) => x.dueno === 'sin-imputar')!
    // Micro (10 min, 135 pz) por delante de ACUMULACION (9 min, 117 pz)
    expect(sin.causas[0]!.piezas).toBeGreaterThan(sin.causas[1]!.piezas!)
  })

  it('el detalle de cada causa viene de la más larga a la más corta', () => {
    const g = agruparEventos({
      tb: { ...TB_14_08, recoverable: [{ reason: 'AGUA', min: 11, count: 3, lineMin: 11 }] },
      stopReasons: ['AGUA'],
      stopEvents: [ev(0, 10, 2), ev(0, 60, 8), ev(0, 90, 1)],
      cpmGlobal: 10,
    })
    expect(g[0]!.causas[0]!.paradas.map((p) => p.min)).toEqual([8, 2, 1])
  })

  it('⚠ dos eventos pegados son UNA parada: la misma vara que la fila', () => {
    // El caso real del 14-08: dos Micro a las 14:44 con 8 s entre medio. La
    // fila cuenta tramos de grilla (23×) y el detalle listaba eventos (28) —
    // dos números para lo mismo. Fundidos, el episodio mide su largo total.
    const g = agruparEventos({
      tb: { ...TB_14_08, recoverable: [{ reason: 'Micro Detencion', min: 1, count: 1, lineMin: 1 }] },
      stopReasons: ['Micro Detencion'],
      stopEvents: [
        { r: 0, f: '2026-08-14T14:44:00.000Z', s: 12 },
        { r: 0, f: '2026-08-14T14:44:20.000Z', s: 12 },   // hueco de 8 s: se funde
        { r: 0, f: '2026-08-14T14:46:00.000Z', s: 12 },   // hueco de 88 s: aparte
      ],
    })
    const paradas = g.find((x) => x.dueno === 'sin-imputar')!.causas[0]!.paradas
    expect(paradas).toHaveLength(2)
    // El episodio fundido mide de 14:44:00 a 14:44:32 — 32 s, no 24.
    expect(Math.round(paradas[0]!.min * 60)).toBe(32)
  })

  it('⚠ la hora sale del ISO tal cual: es hora de planta, no UTC local', () => {
    const g = agruparEventos({
      tb: { ...TB_14_08, recoverable: [{ reason: 'AGUA', min: 11, count: 1, lineMin: 11 }] },
      stopReasons: ['AGUA'],
      stopEvents: [{ r: 0, f: '2026-08-14T12:43:00.000Z', s: 660 }],
    })
    expect(g[0]!.causas[0]!.paradas[0]!.hora).toBe('12:43')
  })

  it('sin desglose de tiempo no inventa grupos', () => {
    expect(agruparEventos({ tb: null })).toEqual([])
  })
})
