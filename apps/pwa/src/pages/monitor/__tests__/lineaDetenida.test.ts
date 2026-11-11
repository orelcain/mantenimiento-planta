/** D5 — «línea detenida»: el pulso, más fresco que el corte, la PROMUEVE a andando; nunca la degrada. */
import { describe, expect, it } from 'vitest'
import { lineaDetenida } from '../lineaDetenida'

describe('lineaDetenida', () => {
  it('el corte dice 0 produciendo, pero el pulso cuenta piezas: NO está detenida', () => {
    expect(lineaDetenida({ machinesProducing: 0, conCausa: true, pulsoPorMaquina: [0, 12.5, 0] })).toBe(false)
  })
  it('el corte dice 0 y el pulso también (o no hay pulso): detenida', () => {
    expect(lineaDetenida({ machinesProducing: 0, conCausa: true, pulsoPorMaquina: [0, 0] })).toBe(true)
    expect(lineaDetenida({ machinesProducing: 0, conCausa: true, pulsoPorMaquina: null })).toBe(true)
  })
  it('el pulso en cero no degrada a detenida una línea que el corte da andando', () => {
    expect(lineaDetenida({ machinesProducing: 2, conCausa: true, pulsoPorMaquina: [0, 0] })).toBe(false)
  })
  it('sin causa ni hora «desde», no hay detención que mostrar', () => {
    expect(lineaDetenida({ machinesProducing: 0, conCausa: false, pulsoPorMaquina: null })).toBe(false)
  })
})
