import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JackKnifeGrafico } from '../JackKnifeGrafico'
import { calcularJackKnife, prepararTurnos, type ResumenJK, type TurnoCrudo } from '@/services/shoplogix/jackKnife'
import { buscarComponente, puntoDeComponente } from '@/services/shoplogix/buscadorComponente'
import fixture from '@/services/shoplogix/__tests__/fixtures/jk-chonchi-expulsador.json'

const crudos: TurnoCrudo[] = (fixture as { id: string; jackKnife: ResumenJK }[]).map((t) => {
  const [dateKey, shiftId] = t.id.split('_')
  return { id: t.id, dateKey: dateKey!, shiftId: shiftId!, jackKnife: t.jackKnife }
})
const { turnos } = prepararTurnos(crudos)
const calc = calcularJackKnife(turnos, 0, turnos.length - 1, 'imp')
const res = buscarComponente(turnos, [], 'expulsador')

afterEach(() => cleanup())

describe('JackKnifeGrafico · punto del componente buscado', () => {
  it('sin la prop el gráfico queda igual que con null', () => {
    const a = render(<JackKnifeGrafico calc={calc} ancho={900} />)
    const htmlSin = a.container.innerHTML
    cleanup()
    const b = render(<JackKnifeGrafico calc={calc} ancho={900} componente={null} />)
    expect(b.container.innerHTML).toBe(htmlSin)
  })

  it('con el componente pinta su etiqueta y el punto en la escala de datos', () => {
    const { container } = render(
      <JackKnifeGrafico
        calc={calc}
        ancho={900}
        componente={{ causas: new Set(['Knuro']), punto: puntoDeComponente(res), etiqueta: 'expulsador' }}
      />,
    )
    expect(screen.getByText('expulsador')).toBeTruthy()
    // Un círculo extra (el punto) respecto de la vista sin componente.
    const sinComp = render(<JackKnifeGrafico calc={calc} ancho={900} />).container
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(sinComp.querySelectorAll('circle').length)
  })
})
