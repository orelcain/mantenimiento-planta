import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import fixture from '@/services/shoplogix/__tests__/fixtures/jk-chonchi-expulsador.json'
import { prepararTurnos, type ResumenJK, type TurnoCrudo } from '@/services/shoplogix/jackKnife'
import { JackKnifeBuscador } from '../JackKnifeBuscador'

vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  doc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(),
}))

const crudos: TurnoCrudo[] = (fixture as { id: string; jackKnife: ResumenJK }[]).map((t) => {
  const [dateKey, shiftId] = t.id.split('_')
  return { id: t.id, dateKey: dateKey!, shiftId: shiftId!, jackKnife: t.jackKnife }
})
const { turnos } = prepararTurnos(crudos)

afterEach(() => cleanup())

describe('JackKnifeBuscador · montaje', () => {
  it('muestra el campo de búsqueda con su nombre accesible', () => {
    render(<JackKnifeBuscador planta="chonchi" turnos={turnos} />)
    expect(screen.getByRole('searchbox', { name: 'Buscar componente o repuesto' })).toBeTruthy()
  })

  it('al buscar «expulsador» titula con las 16 detenciones y 270 min, y pone la línea de tiempo', async () => {
    render(<JackKnifeBuscador planta="chonchi" turnos={turnos} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar componente o repuesto' }), { target: { value: 'expulsador' } })
    expect(await screen.findByRole('heading', { name: /16 detenciones y 270 min en 6 turnos/ })).toBeTruthy()
    const tabla = screen.getByRole('table', { name: /Línea de tiempo de «expulsador»/ })
    expect(within(tabla).getAllByRole('row').length).toBeGreaterThan(1)
  })

  it('cada fila con detención ofrece «Registrar trabajo»', () => {
    render(<JackKnifeBuscador planta="chonchi" turnos={turnos} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar componente o repuesto' }), { target: { value: 'expulsador' } })
    expect(screen.getAllByRole('button', { name: 'Registrar trabajo' }).length).toBeGreaterThan(0)
  })
})
