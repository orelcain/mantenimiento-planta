import { describe, it, expect } from 'vitest'
import { normHub, textoBuscable, coincide } from '../learningHubSearch'
import { LEARNING_MACHINES } from '../learningMachines'

/**
 * El buscador del hub miraba SOLO el nombre de la máquina. El técnico escribe
 * lo que lee en la placa —`A600`, `M3210`, `MS4`, `TP-6000`, `GR8251`— y todos
 * esos modelos están en la bajada de su propia ficha: el hub contestaba
 * "Sin resultados" teniendo la ficha completa de esa máquina.
 *
 * El test corre contra el catálogo REAL, así que también protege el dato: si
 * alguien reescribe una bajada y le saca el modelo, esto falla.
 */
const buscar = (q: string) =>
  LEARNING_MACHINES
    .filter(m => coincide(textoBuscable(m.name, m.description, m.area), normHub(q)))
    .map(m => m.slug)

describe('buscador del hub · el modelo grabado en la máquina', () => {
  const casos: Array<[string, string]> = [
    ['A600', 'marel-hg'],
    ['M3210', 'marel-hg'],
    ['MS4', 'grader'],
    ['TP-6000', 'enzunchadora-n2'],
    ['GR8251', 'marel-filete'],
    ['E-Pack', 'fishken'],
    ['Vistus', 'detector-metales'],
    ['PowerPak', 'termoformadora-gea'],
  ]
  for (const [consulta, slug] of casos) {
    it(`"${consulta}" lleva a ${slug}`, () => {
      expect(buscar(consulta)).toContain(slug)
    })
  }

  it('sigue encontrando por nombre', () => {
    expect(buscar('fishken')).toContain('fishken')
  })

  it('no inventa coincidencias', () => {
    expect(buscar('zzzz-no-existe')).toEqual([])
  })
})
