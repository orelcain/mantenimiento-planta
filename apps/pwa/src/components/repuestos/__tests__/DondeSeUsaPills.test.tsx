// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DondeSeUsaPills } from '../DondeSeUsaPills'

const PLANTA: Record<string, string> = { b1: 'PLANTA CHONCHI', b2: 'PLANTA CHONCHI', b3: 'PLANTA CHONCHI', by: 'PLANTA QUELLON', k1: 'PLANTA CHONCHI', k2: 'PLANTA CHONCHI', k3: 'PLANTA CHONCHI', ky: 'PLANTA YAL', kq: 'PLANTA QUELLON', f1: 'PLANTA CHONCHI' }
const plantaDe = (id: string) => PLANTA[id]
const eq = (machineId: string, machineName: string) => ({ machineId, machineName })

afterEach(cleanup)

describe('DondeSeUsaPills', () => {
  const equipos = [
    eq('b1', 'EVISCERADORA BAADER 142 N1'), eq('b2', 'EVISCERADORA BAADER 142 N2'), eq('by', 'EVISCERADORA BAADER 142 N1'),
  ]

  it('una pill por planta con sus unidades; resalta la unidad en foco', () => {
    render(<DondeSeUsaPills equipos={[eq('k1', 'KNURO N1'), eq('k2', 'KNURO N2'), eq('kq', 'KNURO N1')]} plantaDe={plantaDe} enFocoId="k2" />)
    expect(screen.getByText('Knuro')).toBeTruthy()
    expect(screen.getByText('Chonchi')).toBeTruthy()
    expect(screen.getByText('Quellon')).toBeTruthy()
    const enFoco = document.querySelectorAll('[data-en-foco="true"]')
    expect(enFoco).toHaveLength(1)
    expect(enFoco[0]!.textContent).toBe('N2')
  })

  it('Baader 142: N1 es la antigua y N2/N3 la nueva', () => {
    render(<DondeSeUsaPills equipos={[eq('b2', 'EVISCERADORA BAADER 142 N2'), eq('b3', 'EVISCERADORA BAADER 142 N3')]} plantaDe={plantaDe} enFocoId="b3" />)
    expect(screen.getByText('nueva')).toBeTruthy()
    expect(screen.queryByText('N2')).toBeNull()
    expect(document.querySelector('[data-en-foco="true"]')!.textContent).toBe('nueva')
    cleanup()
    render(<DondeSeUsaPills equipos={[eq('b1', 'EVISCERADORA BAADER 142 N1')]} plantaDe={plantaDe} />)
    expect(screen.getByText('antigua')).toBeTruthy()
  })

  it('«todas» si va en todas las unidades; sin nombre de planta si hay una sola', () => {
    const total = (familia: string) => (familia === 'KNURO' ? 3 : undefined)
    render(<DondeSeUsaPills equipos={[eq('k1', 'KNURO N1'), eq('k2', 'KNURO N2'), eq('k3', 'KNURO N3')]} plantaDe={plantaDe} totalUnidades={total} />)
    expect(screen.getByText('todas')).toBeTruthy()
    expect(screen.queryByText('Chonchi')).toBeNull()
  })

  it('no muestra Yal (planta oculta en Repuestos)', () => {
    render(<DondeSeUsaPills equipos={[eq('k1', 'KNURO N1'), eq('ky', 'KNURO N1')]} plantaDe={plantaDe} />)
    expect(screen.queryByText('Yal')).toBeNull()
    expect(screen.getByText('N1')).toBeTruthy()
    cleanup()
    render(<DondeSeUsaPills equipos={[eq('ky', 'KNURO N1')]} plantaDe={plantaDe} />)
    expect(screen.getByText('Knuro · otra planta')).toBeTruthy()
  })

  it('atenúa (no oculta) la planta fuera de la faceta', () => {
    render(<DondeSeUsaPills equipos={equipos} plantaDe={plantaDe} faceta={{ nivel: 'planta', clave: 'PLANTA CHONCHI' }} />)
    const fuera = document.querySelectorAll('[data-fuera="true"]')
    expect(fuera).toHaveLength(1)
    expect(fuera[0]!.textContent).toContain('Quellon')
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
