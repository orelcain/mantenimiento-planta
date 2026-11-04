/**
 * El panel «Carros con pieza, por máquina · últimos 15 minutos» (`RitmoVivoAmpliado`). Lo que se protege: que la cifra de cada
 * Baader sea el PROMEDIO de la ventana y no el último minuto, que la raya diga su entero («17 o más» con perilla, «12 o más»
 * sin ella) y que la vara bajo el nombre sea la perilla o la meta de Shoplogix. jsdom no mide: el ancho se simula.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularRitmoVivo, type EntradaRitmoVivo } from '../ritmoVivo'
import { RitmoVivoAmpliado } from '../RitmoVivoV2'

const T0 = Date.parse('2026-10-27T11:00:00.000Z')
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString()

/* 14 minutos cerrados por Baader. Ev 1 con perilla 17 desde el inicio: 13 minutos a 14 pz y el último a 17. Σ 199 de 238 = 84 %.
   Ev 2 sin perilla, meta Shoplogix 16: 13 minutos a 12 pz y el último a 16. Σ 172 de 224 = 77 %. El último minuto daría 100 % en las dos. */
const entrada: EntradaRitmoVivo = {
  serie: {
    desde: iso(0),
    maquinas: [
      { id: 'ev1', nombre: 'Evisceradora 1', esperado: 19, cycles: [...Array.from({ length: 13 }, () => 14), 17] },
      { id: 'ev2', nombre: 'Evisceradora 2', esperado: 16, cycles: [...Array.from({ length: 13 }, () => 12), 16] },
    ],
  },
  acumulado: null,
  enCurso: [],
  perillas: { actual: { ev1: { cpm: 17, desde: iso(0) } }, historial: [] },
}

beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 })
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const renderPanel = () => {
  const r = calcularRitmoVivo(entrada, 'carros')!
  return render(<RitmoVivoAmpliado r={r} turno={null} cerrado={false} marca={null} onQuitarMarca={() => {}} />)
}

describe('panel de 15 minutos: cifra promedio, raya en el umbral y vara bajo el nombre', () => {
  it('la cifra de cada Baader es el promedio de la ventana, no el porcentaje del último minuto', () => {
    renderPanel()
    expect(screen.getByText('Carros con pieza, por máquina · últimos 15 minutos')).toBeTruthy()
    expect(screen.getByText('84 %')).toBeTruthy()
    expect(screen.getByText('77 %')).toBeTruthy()
    expect(screen.queryByText('100 %')).toBeNull()
  })

  it('la raya dice su entero: 17 o más con perilla, 12 o más sin ella, y la vara va bajo el nombre', () => {
    renderPanel()
    expect(screen.getByText('17 o más')).toBeTruthy()
    expect(screen.getByText('12 o más')).toBeTruthy()
    expect(screen.getByText('perilla 17')).toBeTruthy()
    expect(screen.getByText('Shoplogix 16')).toBeTruthy()
  })
})
