/**
 * Nombres de causa legibles (A2-2b): un motivo que la taxonomía no conoce sale en minúsculas y con las tildes que la taxonomía ya usa,
 * sin « - Paro»; uno que sí conoce sale con su nombre oficial. Y el globo abre y cierra SOLO con clic (el puntero encima no abre).
 * Las cifras y textos esperados están escritos a mano.
 */
import { describe, expect, it, vi } from 'vitest'
import { IMPUTACION_LEAVES } from '@/services/shoplogix/imputacionTaxonomy'
import { nombreCausa, useGlobo } from '../desgloseVista'

describe('nombreCausa', () => {
  it('«Micro Detencion» (lo que manda Shoplogix y la taxonomía no conoce) sale «micro detención»', () => {
    expect(nombreCausa('Micro Detencion')).toBe('micro detención')
  })

  it('quita « - Paro» y pasa a minúsculas, sin importar cómo llegue', () => {
    expect(nombreCausa('MICRO DETENCION - PARO')).toBe('micro detención')
    expect(nombreCausa('  Detencion - Paro ')).toBe('detención')
  })

  it('un motivo sin palabra en la taxonomía queda en minúsculas y sin inventar tilde', () => {
    expect(nombreCausa('Motivo Raro')).toBe('motivo raro')
  })

  it('un motivo que la taxonomía conoce sale con su nombre oficial, sin « - Paro»', () => {
    expect(nombreCausa('COLACION')).toBe('Colación')
    expect(nombreCausa('Ejercicio compensatorio - Paro')).toBe('Ejercicio compensatorio')
  })

  it('ninguna etiqueta conocida trae « - Paro» al salir', () => {
    for (const leaf of IMPUTACION_LEAVES.slice(0, 5)) {
      expect(nombreCausa(leaf.match[0]!)).not.toMatch(/- Paro/i)
    }
  })
})

describe('useGlobo', () => {
  it('no reacciona al puntero: solo expone clic (sin apertura por hover)', () => {
    const g = useGlobo(false, vi.fn())
    expect(Object.keys(g).sort()).toEqual(['aria-expanded', 'onClick'])
    expect(g['aria-expanded']).toBe(false)
  })

  it('el clic alterna: abre si está cerrado y cierra si está abierto', () => {
    const alCambiar = vi.fn()
    useGlobo(false, alCambiar).onClick()
    expect(alCambiar).toHaveBeenLastCalledWith(true)
    useGlobo(true, alCambiar).onClick()
    expect(alCambiar).toHaveBeenLastCalledWith(false)
  })
})
