import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JackKnifeGrafico } from '../JackKnifeGrafico'
import type { CalculoJK } from '@/services/shoplogix/jackKnife'

afterEach(cleanup)

const CALC: CalculoJK = {
  pts: [
    { k: 'Pernos / Resortes', ev: 15, min: 216, mttr: 14.4, q: 'agu' },
    { k: 'Lógica', ev: 48, min: 597, mttr: 12.4, q: 'cro' },
  ],
  N: 63,
  D: 813,
  un: 20,
  um: 12,
  cob: null,
  barras: [],
  desde: 0,
  hasta: 0,
}

describe('JackKnifeGrafico: anillo de acción fuerte hecha', () => {
  it('la causa con anillo lo dice en su nombre accesible', () => {
    render(<JackKnifeGrafico calc={CALC} anillos={new Set(['Pernos / Resortes'])} />)
    const conAnillo = screen.getByRole('button', { name: /^Pernos \/ Resortes:.*, con acción fuerte hecha$/ })
    expect(conAnillo).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Lógica:/ }).getAttribute('aria-label')).not.toContain('acción fuerte')
  })

  it('sin anillos el gráfico queda igual, sin la marca', () => {
    render(<JackKnifeGrafico calc={CALC} />)
    expect(screen.getByRole('button', { name: /^Pernos \/ Resortes:/ }).getAttribute('aria-label')).not.toContain('acción fuerte')
  })
})
