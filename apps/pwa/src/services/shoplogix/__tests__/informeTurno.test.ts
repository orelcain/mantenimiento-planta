import { describe, expect, it } from 'vitest'
import { armarInformeTurno, horasMin, nombreCausa, redondearMatriz, repartirEnteros, resumirTendencia } from '../informeTurno'
import { kpisDeTurno } from '../kpisMantencionTurno'
import type { UpstreamLineSnapshot } from '../types'

const NB = String.fromCharCode(160)
const T0 = Date.UTC(2026, 9, 1, 7, 15)
const en = (min: number) => new Date(T0 + min * 60_000)

function estado(desde: number, hasta: number, type: string, name: string, reason = '') {
  return { startAt: en(desde), endAt: en(hasta), durationSec: (hasta - desde) * 60, type, name, reason, color: '', isCurrent: false }
}

function maquina(id: number, states: ReturnType<typeof estado>[], ciclos: number) {
  return {
    machineid: String(id), machineName: `Evisceradora ${id}`, machineType: 'baader', dateKey: '2026-10-01', shiftId: 'Turno 2',
    shiftStart: en(0), shiftEnd: en(465), scheduledStart: en(0), scheduledEnd: en(465),
    totalCycles: ciclos, expectedTotalCycles: ciclos * 2, totalPieces: ciclos, expectedTotalPieces: ciclos * 2,
    intervals: [], states, comments: [],
  }
}

/** Baader 2 casi todo el fallo; Baader 3 sin falla; microdetenciones y colación en todas. */
function snapshot(): UpstreamLineSnapshot {
  const base = (extra: ReturnType<typeof estado>[]) => [
    estado(0, 200, 'uptime', 'Produciendo'),
    ...extra,
    estado(300, 345, 'break', 'Detencion', 'COLACION'),
    estado(345, 350.5, 'downtime', 'Micro Detencion'),
    estado(350.5, 465, 'uptime', 'Produciendo'),
  ]
  return {
    machines: [
      maquina(1, base([estado(200, 227, 'downtime', 'Detencion', 'PERNOS/RESORTES'), estado(227, 300, 'uptime', 'Produciendo')]), 4675),
      maquina(2, base([estado(200, 290, 'downtime', 'Detencion', 'LOGICA'), estado(290, 300, 'uptime', 'Produciendo')]), 1578),
      maquina(3, base([estado(200, 300, 'uptime', 'Produciendo')]), 4327),
    ],
  } as unknown as UpstreamLineSnapshot
}

describe('repartirEnteros', () => {
  it('reparte por restos mayores y conserva el total', () => {
    expect(repartirEnteros([13.5, 13.8, 23], 50)).toEqual([13, 14, 23])
    expect(repartirEnteros([0, 0], 0)).toEqual([0, 0])
  })
})

describe('redondearMatriz', () => {
  it('cierra filas y columnas con el caso real del 1 de octubre', () => {
    const m = [[339.2, 27, 13.5, 19.4, 65.8], [161, 228, 13.8, 21.4, 41.4], [344.2, 0, 23, 28.2, 69.6]]
    const r = redondearMatriz(m)
    r.celdas.forEach((f, i) => expect(f.reduce((a, b) => a + b, 0)).toBe(r.filas[i]))
    r.columnas.forEach((c, j) => expect(r.celdas.reduce((a, f) => a + f[j]!, 0)).toBe(c))
    r.celdas.forEach((f, i) => f.forEach((v, j) => expect(Math.abs(v - m[i]![j]!)).toBeLessThanOrEqual(1)))
  })
})

describe('textos', () => {
  it('formatea horas y causas', () => {
    expect(horasMin(228)).toBe(`3${NB}h${NB}48`)
    expect(horasMin(45)).toBe(`45${NB}min`)
    expect(horasMin(180)).toBe(`3${NB}h`)
    expect(nombreCausa('LOGICA')).toBe('Lógica de control')
    expect(nombreCausa('FALTA DE AGUA')).toBe('Falta de agua')
  })
})

describe('armarInformeTurno', () => {
  const inf = armarInformeTurno(kpisDeTurno(snapshot())!, { enCurso: false })

  it('el título dice qué pasó y usa la máquina dominante', () => {
    expect(inf.titular).toBe(`La Baader 2 estuvo 1${NB}h${NB}30 en falla y la línea hizo la mitad del objetivo`)
    expect(inf.maquinaDestacada).toBe('Baader 2')
    expect(inf.bajada).toContain('la Baader 3 cerró sin falla')
  })

  it('cada máquina y la línea cierran', () => {
    for (const f of [...inf.filas, inf.linea]) {
      expect(f.produjo + f.falla + f.sinAnotar + f.proceso + f.planificado).toBe(f.total)
      expect(f.sinAnotar + f.proceso + f.planificado).toBe(f.otras)
    }
    expect(inf.linea.piezas).toBe(10580)
  })

  it('las microdetenciones no van a cuenta de Mantención y las causas cierran', () => {
    const falla = inf.grupos.find((g) => g.id === 'falla')!
    expect(falla.min).toBe(inf.linea.falla)
    expect(falla.lineas.map((l) => l.causa)).toEqual(['Lógica de control', 'Pernos y resortes'])
    expect(inf.grupos.find((g) => g.id === 'sin-anotar')?.titulo).toBe('Sin anotar: microdetenciones')
    expect(inf.totalDetenido).toBe(inf.grupos.reduce((a, g) => a + g.min, 0))
    expect(inf.totalDetenido).toBe(inf.linea.falla + inf.linea.sinAnotar + inf.linea.proceso + inf.linea.planificado)
  })

  it('en curso cambia los verbos', () => {
    const v = armarInformeTurno(kpisDeTurno(snapshot())!, { enCurso: true })
    expect(v.titular).toMatch(/^La Baader 2 lleva .* la línea va en la mitad del objetivo$/)
  })
})

describe('resumirTendencia', () => {
  const p = (d: string, m: number) => ({ dateKey: d, porMaquina: [{ fallaMin: m }] })
  it('lee el caso real: 5 de 12 sin falla y este el segundo más alto', () => {
    const v = [0, 0, 395, 0, 6, 25, 0, 97, 30, 0, 56, 255]
    const r = resumirTendencia(v.map((m, i) => p(`2026-09-${String(i + 10).padStart(2, '0')}`, m)), '2026-09-21')!
    expect(r.texto).toBe(`5 de 12 turnos cerraron sin falla técnica. Mediana 16${NB}min; este, el segundo más alto.`)
  })
  it('sin historia suficiente no dibuja', () => {
    expect(resumirTendencia([p('2026-09-01', 3)], '2026-09-01')).toBeNull()
  })
})
