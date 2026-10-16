// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DondeSeUsaPills } from '../DondeSeUsaPills'

const PLANTA: Record<string, string> = { b1: 'PLANTA CHONCHI', b2: 'PLANTA CHONCHI', by: 'PLANTA YAL', k1: 'PLANTA CHONCHI', f1: 'PLANTA CHONCHI' }
const plantaDe = (id: string) => PLANTA[id]
const eq = (machineId: string, machineName: string) => ({ machineId, machineName })

afterEach(cleanup)

describe('DondeSeUsaPills', () => {
  const equipos = [
    eq('b1', 'EVISCERADORA BAADER 142 N1'), eq('b2', 'EVISCERADORA BAADER 142 N2'), eq('by', 'EVISCERADORA BAADER 142 N1'),
  ]

  it('una pill por planta con sus unidades; resalta la unidad en foco', () => {
    render(<DondeSeUsaPills equipos={equipos} plantaDe={plantaDe} enFocoId="b2" />)
    expect(screen.getByText('Evisceradora Baader 142')).toBeTruthy()
    expect(screen.getByText('Chonchi')).toBeTruthy()
    expect(screen.getByText('Yal')).toBeTruthy()
    const enFoco = document.querySelectorAll('[data-en-foco="true"]')
    expect(enFoco).toHaveLength(1)
    expect(enFoco[0]!.textContent).toBe('N2')
  })

  it('atenúa (no oculta) la planta fuera de la faceta', () => {
    render(<DondeSeUsaPills equipos={equipos} plantaDe={plantaDe} faceta={{ nivel: 'planta', clave: 'PLANTA CHONCHI' }} />)
    const fuera = document.querySelectorAll('[data-fuera="true"]')
    expect(fuera).toHaveLength(1)
    expect(fuera[0]!.textContent).toContain('Yal')
  })

  it('con más de dos familias muestra dos y «+N familias»', () => {
    const muchas = [...equipos, eq('k1', 'KNURO N1'), eq('f1', 'FISHKEN N1')]
    render(<DondeSeUsaPills equipos={muchas} plantaDe={plantaDe} />)
    expect(screen.getByText('+1 familia')).toBeTruthy()
    expect(document.querySelectorAll('[data-testid="donde-se-usa"] > div')).toHaveLength(2)
  })

  it('con cuatro familias dice «+2 familias»', () => {
    const muchas = [...equipos, eq('k1', 'KNURO N1'), eq('f1', 'FISHKEN N1'), eq('f2', 'GRADER N1')]
    render(<DondeSeUsaPills equipos={muchas} plantaDe={plantaDe} />)
    expect(screen.getByText('+2 familias')).toBeTruthy()
  })

  it('sin equipos dice Transversal', () => {
    render(<DondeSeUsaPills equipos={[]} plantaDe={plantaDe} />)
    expect(screen.getByText('Transversal')).toBeTruthy()
  })
})
