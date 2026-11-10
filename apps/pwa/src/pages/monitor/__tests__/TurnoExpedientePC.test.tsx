// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'
import { PiezasExpedientePC, TurnoExpedientePC } from '../TurnoExpedientePC'
import { contraMetaHora, tituloCierre, tituloMaquinas, tituloPiezas, tituloRitmo, totalHoras, tramoSinProducir } from '../turnoExpediente'
import type { MonitorV2Props } from '../MonitorV2'
import type { RelojDeDatos } from '../useRelojDeDatos'

afterEach(cleanup)

const ultima = <T,>(a: T[]): T => a[a.length - 1]!

// Chonchi, P. Principal, turno 2 del viernes 6-11-2026 (el más cargado): la línea paró de 10:20 a 12:20 por falta de materia prima.
const hora = (desde: string, hasta: string, pieces: number, minutesCovered = 60): HourlyRow => ({
  hourStart: `2026-11-06T${desde}:00`, index: 0, from: `2026-11-06T${desde}:00`, to: `2026-11-06T${hasta}:00`,
  pieces, minutesCovered, piecesPerHour: pieces, partial: minutesCovered < 60,
})
const FILAS = [
  hora('07:20', '08:20', 2413), hora('08:20', '09:20', 1996), hora('09:20', '10:20', 788), hora('10:20', '11:20', 0),
  hora('11:20', '12:20', 0), hora('12:20', '13:20', 118), hora('13:20', '14:20', 2390), hora('14:20', '15:05', 1557, 45),
]
const POR_MAQ = [
  { nombre: 'Evisceradora 1', piezas: [758, 667, 248, 0, 0, 29, 859, 556] },
  { nombre: 'Evisceradora 2', piezas: [846, 742, 253, 0, 0, 45, 841, 508] },
  { nombre: 'Evisceradora 3', piezas: [809, 587, 287, 0, 0, 44, 690, 493] },
]
const maq = (name: string, piezas: number, status: 'produciendo' | 'detenida' = 'produciendo') => ({ name, status, desdeMin: status === 'detenida' ? 12 : null, ahora: null, promedio: 13.4, razon: status === 'detenida' ? 'Falta MMPP' : null, piezas, dispPct: 99 })

const P = {
  piezas: 9262, meta: 15000, cerrado: true, turnoId: '2026-11-06_Turno 2',
  horas: { filas: FILAS, metaPorHora: 1935, porMaquina: POR_MAQ },
  maquinas: [maq('Evisceradora 1', 3117), maq('Evisceradora 2', 3235), maq('Evisceradora 3', 2910)],
  ritmo: 38.2, ritmoNecesario: null, ritmoPedido: null, ritmoMedia15: null, setPoint: null, proyeccion: null, cierre: null,
  ritmoInfo: { recienteCpm: null, recienteMin: null, medianaCpm: 40.1, mejorCpm: 44.6, muestras: 20, setPointFecha: null, setPointMetodo: null },
  eje: null, aporte: null, curva: null,
} as unknown as MonitorV2Props
const RELOJ = { cuadro: () => ({ valor: null }), alCuadro: () => () => {} } as unknown as RelojDeDatos

describe('cuentas de las ventanas del Monitor', () => {
  it('el título de piezas dice cuánto, qué parte de la meta y el tramo sin producir', () => {
    expect(tituloPiezas(9262, 15000, FILAS)).toBe('9.262 piezas, 62 % de la meta; de 10:20 a 12:20 la línea no produjo')
    expect(tramoSinProducir(FILAS)).toEqual({ desde: '2026-11-06T10:20:00', hasta: '2026-11-06T12:20:00', horas: 2 })
  })
  it('sin horas en cero nombra la hora completa más baja; sin meta, solo las piezas', () => {
    const sinCero = FILAS.filter((h) => h.pieces > 0)
    expect(tituloPiezas(9262, 15000, sinCero)).toBe('9.262 piezas, 62 % de la meta; la hora más baja, de 12:20 a 13:20, dio 118')
    expect(tituloPiezas(9262, null, [])).toBe('9.262 piezas')
  })
  it('contra la meta proporciona la hora corta y el total suma las filas que se ven', () => {
    expect(contraMetaHora(FILAS[0]!, 1935)).toBe(478)
    expect(contraMetaHora(FILAS[7]!, 1935)).toBe(106)
    const t = totalHoras(FILAS, POR_MAQ, 1935)
    expect(t.linea).toBe(9262)
    expect(t.maquinas).toEqual([3117, 3235, 2910])
    expect(t.contraMeta).toBe(-5734)
  })
  it('los títulos de cierre, ritmo y máquinas dicen el dato', () => {
    expect(tituloCierre(15200, 15000, '15:05')).toBe('Al cierre de las 15:05 llegaría a 15.200 pz, 200 sobre la meta')
    expect(tituloCierre(14700, 15000, null)).toBe('Al cierre llegaría a 14.700 pz; faltarían 300 para la meta')
    expect(tituloCierre(null, 15000, null)).toBe('Sin proyección del cierre para este turno')
    expect(tituloRitmo({ ritmo: 38.2, necesario: 39.8, normal: 40.1, cerrado: false })).toBe('La línea anda a 38,2 pz/min; la meta pide 39,8')
    expect(tituloRitmo({ ritmo: 38.2, necesario: null, normal: 40.1, cerrado: true })).toBe('La línea anduvo a 38,2 pz/min; lo normal de esta línea es 40,1')
    expect(tituloMaquinas([{ name: 'Evisceradora 1', status: 'produciendo' }, { name: 'Evisceradora 2', status: 'detenida' }])).toBe('1 de 2 máquinas corriendo; Evisceradora 2 detenida')
  })
})

describe('ventana Piezas del turno en PC', () => {
  it('el costado dice piezas, meta, lo que faltó y cierra Por máquina con la Línea', () => {
    render(<PiezasExpedientePC abierta onClose={() => {}} p={P} mostradas={9262} grafico={null} previo={null} vsAyer={null} />)
    const costado = within(screen.getByRole('complementary', { name: 'Resumen de las piezas del turno' }))
    expect(costado.getByText('Piezas del turno · Turno 2 · 6 nov')).toBeTruthy()
    expect(costado.getByText('9.262 pz')).toBeTruthy()
    expect(costado.getByText('de una meta de 15.000')).toBeTruthy()
    expect(costado.getByText('Faltaron')).toBeTruthy()
    expect(costado.getByText('5.738 pz')).toBeTruthy()
    const filas = within(costado.getByRole('table', { name: 'Piezas por máquina' })).getAllByRole('row')
    expect(ultima(filas).textContent).toBe('Línea9.262')
  })
  it('el título dice el dato y Hora a hora cierra con el total del turno', () => {
    render(<PiezasExpedientePC abierta onClose={() => {}} p={P} mostradas={9262} grafico={null} previo={null} vsAyer={null} />)
    expect(screen.getByRole('heading', { level: 2, name: '9.262 piezas, 62 % de la meta; de 10:20 a 12:20 la línea no produjo' })).toBeTruthy()
    const filas = within(screen.getByRole('table', { name: 'Piezas por hora de la línea y de cada máquina' })).getAllByRole('row')
    expect(filas).toHaveLength(10)
    expect(within(filas[0]!).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Hora', 'Línea', 'Ev 1', 'Ev 2', 'Ev 3', 'Contra la meta'])
    expect(ultima(within(filas[4]!).getAllByRole('cell')).textContent).toBe('−1.935')
    expect(within(ultima(filas)).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Turno', '9.262', '3.117', '3.235', '2.910', '−5.734'])
  })
})

describe('ventanas Ritmo y Máquinas en PC', () => {
  it('Máquinas: título con las corriendo y tabla cerrada con la Línea', () => {
    const p = { ...P, maquinas: [maq('Evisceradora 1', 3117), maq('Evisceradora 2', 3235, 'detenida')] } as MonitorV2Props
    render(<TurnoExpedientePC clave="maquinas" onClose={() => {}} p={p} reloj={RELOJ} />)
    expect(screen.getByRole('heading', { level: 2, name: '1 de 2 máquinas corriendo; Evisceradora 2 detenida' })).toBeTruthy()
    const filas = within(screen.getByRole('table', { name: 'Estado y ritmo de cada máquina' })).getAllByRole('row')
    expect(filas[2]!.textContent).toContain('Falta MMPP, hace 12 min')
    expect(within(ultima(filas)).getAllByRole('cell')[4]!.textContent).toBe('6.352')
  })
  it('Ritmo: el costado lleva las referencias y el título compara con lo normal', () => {
    render(<TurnoExpedientePC clave="ritmo" onClose={() => {}} p={P} reloj={RELOJ} />)
    expect(screen.getByRole('heading', { level: 2, name: 'La línea anduvo a 38,2 pz/min; lo normal de esta línea es 40,1' })).toBeTruthy()
    const costado = within(screen.getByRole('complementary', { name: 'Resumen del ritmo' }))
    expect(costado.getByText('Lo normal de la línea')).toBeTruthy()
    expect(costado.getByText('44,6 pz/min')).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Ritmo de cada Baader y de la línea' })).toBeTruthy()
  })
  it('cerrada no dibuja nada', () => {
    const { container } = render(<TurnoExpedientePC clave={null} onClose={() => {}} p={P} reloj={RELOJ} />)
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
