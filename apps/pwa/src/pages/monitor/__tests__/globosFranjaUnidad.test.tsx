/**
 * Los globos de la franja cambian con la unidad de la máquina («carros» o «silletas») y con la cantidad de máquinas: con una sola,
 * dicen «la máquina», no «la Baader». Con varias y carros, los textos de siempre.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GloboCarros, GloboRitmo } from '../GlobosFranja'

afterEach(cleanup)

const dialogo = (container: HTMLElement) => container.querySelector('[role="dialog"]')

describe('GloboCarros: unidad y máquina', () => {
  it('Filete (una máquina, silletas): «Silletas con pieza», «las silletas» y «la máquina»; nada de carros ni Baader', () => {
    const { container } = render(
      <GloboCarros nombre="Fileteadora" carros={54} conPerilla perilla={17} meta={null} unidad="silletas" unica />,
    )
    const t = container.textContent ?? ''
    expect(dialogo(container)?.getAttribute('aria-label')).toBe('Silletas con pieza de la Fileteadora')
    expect(t).toContain('54 % de las silletas llevaron pieza.')
    expect(t).toContain('Solo cuentan los minutos en que la máquina anduvo 30 s o más')
    expect(t).toContain('la ocupación de silletas que muestra la pantalla de la máquina')
    expect(t).not.toContain('Baader')
    expect(t).not.toMatch(/carros/i)
  })

  it('Eviscerado (varias Baader, carros): los textos de siempre', () => {
    const { container } = render(
      <GloboCarros nombre="Ev 1" carros={54} conPerilla perilla={17} meta={null} unidad="carros" unica={false} />,
    )
    const t = container.textContent ?? ''
    expect(dialogo(container)?.getAttribute('aria-label')).toBe('Carros con pieza de la Ev 1')
    expect(t).toContain('54 % de los carros llevaron pieza.')
    expect(t).toContain('la Baader anduvo 30 s o más')
    expect(t).toContain('la ocupación de carros que muestra la pantalla de la Baader')
  })
})

describe('GloboRitmo: con una sola máquina', () => {
  it('Filete: «con la máquina detenida» y «se compara silletas con pieza»', () => {
    const { container } = render(
      <GloboRitmo
        linea={false}
        nombre="Fileteadora"
        n={10}
        total={20}
        umbral={12}
        vara={{ cpm: 17, fuente: 'perilla', modo: 'calibrado' }}
        detenida={3}
        bajo={5}
        carros={40}
        unidad="silletas"
        unica
        onVerDesglose={() => {}}
      />,
    )
    const t = container.textContent ?? ''
    expect(t).toContain('De los otros 10, 3 con la máquina detenida y 5 bajo 12.')
    expect(t).toContain('Con la pantalla de la máquina se compara silletas con pieza: 40 %.')
    expect(t).not.toContain('Baader')
  })
})
