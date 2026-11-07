import { describe, it, expect } from 'vitest'
import {
  calcularJackKnife,
  comentariosDe,
  prepararTurnos,
  ventanaJK,
  SIN_IMPUTAR,
  type ResumenJK,
  type TurnoJK,
  type TurnoCrudo,
} from '../jackKnife'

const vacio = (): ResumenJK => ({
  v: 1,
  eventos: [],
  sinImputar: [],
  sinImputarLinea: [],
  comentarios: [],
  conCausaMin: 0,
  sinCausaMin: 0,
  uptimeMin: 480,
})

function turno(dateKey: string, shiftId: string, parcial: Partial<ResumenJK> = {}): TurnoJK {
  return { id: `${dateKey}_${shiftId}`, dateKey, shiftId, resumen: { ...vacio(), ...parcial } }
}

describe('prepararTurnos', () => {
  it('excluye Unscheduled sin contarlo como sin resumen, y los turnos sin uptime', () => {
    const crudos: TurnoCrudo[] = [
      { id: '2026-11-01_Turno 1', dateKey: '2026-11-01', shiftId: 'Turno 1', jackKnife: vacio() },
      { id: '2026-11-01_Unscheduled', dateKey: '2026-11-01', shiftId: 'Unscheduled', jackKnife: null },
      { id: '2026-11-02_Turno 1', dateKey: '2026-11-02', shiftId: 'Turno 1', jackKnife: null },
      { id: '2026-11-03_Turno 1', dateKey: '2026-11-03', shiftId: 'Turno 1', jackKnife: { ...vacio(), uptimeMin: 0 } },
    ]
    const r = prepararTurnos(crudos)
    expect(r.turnos.map((t) => t.id)).toEqual(['2026-11-01_Turno 1'])
    expect(r.sinResumen).toBe(1)
  })
})

describe('ventanaJK', () => {
  const turnos = [
    turno('2026-10-01', 'Turno 1'),
    turno('2026-10-20', 'Turno 1'),
    turno('2026-10-30', 'Turno 2'),
    turno('2026-11-05', 'Turno 1'),
    turno('2026-11-06', 'Turno 2'),
  ]

  it('último turno es solo el último', () => {
    expect(ventanaJK(turnos, 'turno')).toEqual({ desde: 4, hasta: 4 })
  })
  it('7 días cuenta hacia atrás desde el último turno', () => {
    expect(ventanaJK(turnos, '7')).toEqual({ desde: 3, hasta: 4 })
  })
  it('todo cubre la lista completa y vacío da hasta -1', () => {
    expect(ventanaJK(turnos, 'todo')).toEqual({ desde: 0, hasta: 4 })
    expect(ventanaJK([], '90')).toEqual({ desde: 0, hasta: -1 })
  })
})

describe('calcularJackKnife', () => {
  // Cuatro causas construidas a mano para cubrir los cuatro cuadrantes:
  //   A: 6 eventos de 20 min  → frecuente y larga  → amb (agudas y crónicas)
  //   B: 1 evento de 60 min   → rara y muy larga   → agu (agudas)
  //   C: 6 eventos de 2 min   → frecuente y corta  → cro (crónicas)
  //   D: 1 evento de 2 min    → rara y corta       → ok (bajo control)
  // N = 14, causas = 4 → un = 3,5. D = 194 min → um = 194/14.
  const ev = (causa: string, n: number, min: number) =>
    Array.from({ length: n }, (_, i) => [causa, i, min] as [string, number, number])
  const turnoCuatro = turno('2026-11-01', 'Turno 1', {
    eventos: [...ev('A', 6, 20), ...ev('B', 1, 60), ...ev('C', 6, 2), ...ev('D', 1, 2)],
    conCausaMin: 150,
    sinCausaMin: 50,
  })

  it('calcula umbrales y cuadrantes', () => {
    const r = calcularJackKnife([turnoCuatro], 0, 0, 'imp')
    expect(r.N).toBe(14)
    expect(r.D).toBe(194)
    expect(r.un).toBeCloseTo(3.5, 5)
    expect(r.um).toBeCloseTo(194 / 14, 5)
    const q = Object.fromEntries(r.pts.map((p) => [p.k, p.q]))
    expect(q).toEqual({ A: 'amb', B: 'agu', C: 'cro', D: 'ok' })
  })

  it('cobertura = con causa / (con + sin)', () => {
    const r = calcularJackKnife([turnoCuatro], 0, 0, 'imp')
    expect(r.cob).toBeCloseTo(0.75, 5)
  })

  it('solo suma los turnos de la ventana, pero el riel cubre todos', () => {
    const otro = turno('2026-11-02', 'Turno 1', { eventos: [['A', 0, 30]] })
    const turnos = [turnoCuatro, otro]
    const r = calcularJackKnife(turnos, 1, 1, 'imp')
    expect(r.N).toBe(1)
    expect(r.D).toBe(30)
    expect(r.barras).toEqual([194, 30])
  })

  it('vista sin imputar cuenta por máquina y no mezcla causas de Mantención', () => {
    const t = turno('2026-11-01', 'Turno 1', {
      eventos: [['A', 0, 20]],
      sinImputar: [['Evisceradora 1', 0, 5], ['Evisceradora 2', 0, 7]],
      sinImputarLinea: [[0, 9]],
    })
    const r = calcularJackKnife([t], 0, 0, 'sin')
    expect(r.pts.map((p) => p.k).sort()).toEqual(['Evisceradora 1', 'Evisceradora 2'])
    expect(r.N).toBe(2)
  })

  it('vista todas suma «Sin imputar» de la línea junto a las causas', () => {
    const t = turno('2026-11-01', 'Turno 1', {
      eventos: [['A', 0, 20]],
      sinImputarLinea: [[0, 9], [100, 3]],
    })
    const r = calcularJackKnife([t], 0, 0, 'todas')
    const sin = r.pts.find((p) => p.k === SIN_IMPUTAR)
    expect(sin?.ev).toBe(2)
    expect(sin?.min).toBe(12)
    expect(r.pts.find((p) => p.k === 'A')?.ev).toBe(1)
  })

  it('sin datos devuelve ceros sin dividir por cero', () => {
    const r = calcularJackKnife([], 0, -1, 'imp')
    expect(r.pts).toEqual([])
    expect(r.N).toBe(0)
    expect(r.um).toBe(0)
    expect(r.cob).toBeNull()
  })
})

describe('comentariosDe', () => {
  it('devuelve los más recientes de la causa, con fecha y turno', () => {
    const t1 = turno('2026-11-01', 'Turno 1', { comentarios: [['Knuro', 1, 'viejo'], ['Knuro', 2, 'otro']] })
    const t2 = turno('2026-11-02', 'Turno 2', {
      comentarios: [['Knuro', 3, 'a'], ['Correas', 4, 'no'], ['Knuro', 5, 'b'], ['Knuro', 6, 'c']],
    })
    const out = comentariosDe([t1, t2], 0, 1, 'Knuro', 3)
    expect(out.map((c) => c.texto)).toEqual(['c', 'b', 'a'])
    expect(out[0]).toMatchObject({ dateKey: '2026-11-02', shiftId: 'Turno 2' })
  })
})
