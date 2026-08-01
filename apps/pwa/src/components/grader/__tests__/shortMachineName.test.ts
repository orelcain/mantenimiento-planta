/**
 * Nombre de máquina en la leyenda del gráfico de tasa.
 *
 * Shoplogix nombra las evisceradoras "Evisceradora 1/2/3" (verificado en su
 * vista Chronological de Planta Chonchi) y en planta se les dice "Baader". El
 * helper devolvía "M1", una nomenclatura que no usaba nadie — ni Shoplogix, ni
 * la planta, ni el resto de la app, que ya mostraba "Ev 1" y "Evisceradora 1".
 */
import { describe, it, expect } from 'vitest'
import { shortMachineName } from '../ProductionRateLineEC'

describe('shortMachineName', () => {
  it('nombra las evisceradoras de Shoplogix como las llama la planta', () => {
    expect(shortMachineName('Evisceradora 1')).toBe('Baader 1')
    expect(shortMachineName('Evisceradora 2')).toBe('Baader 2')
    expect(shortMachineName('Evisceradora 3')).toBe('Baader 3')
  })

  it('soporta el prefijo de planta de Yal', () => {
    expect(shortMachineName('YAL Evisceradora 3')).toBe('Baader 3')
  })

  it('soporta la forma con barra', () => {
    expect(shortMachineName('Baader 142 / 1')).toBe('Baader 1')
  })

  it('tolera espacios al final', () => {
    expect(shortMachineName('Evisceradora 2 ')).toBe('Baader 2')
  })

  it('un nombre sin número se deja tal cual, no se recorta a 4 letras', () => {
    // Antes devolvía "Line" para "Linea 1 Filete" sin número final: ilegible.
    expect(shortMachineName('Grader')).toBe('Grader')
    expect(shortMachineName('Baader 200')).toBe('Baader 200')
  })
})
