import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LecturaEnVivoFila } from '../LecturaEnVivo'
import type { EstadoVivo } from '@/services/grader/espejo/lecturaVivo'

afterEach(cleanup)

const HASTA = new Date(2026, 10, 21, 14, 32).getTime()

function fila(estado: EstadoVivo, extra: Partial<Parameters<typeof LecturaEnVivoFila>[0]> = {}) {
  const onPedir = vi.fn()
  const onTerminar = vi.fn()
  render(<LecturaEnVivoFila estado={estado} pedidoNombre="Orel" version="e1.4" ocupado={false} error={null} onPedir={onPedir} onTerminar={onTerminar} {...extra} />)
  return { onPedir, onTerminar }
}

describe('LecturaEnVivoFila', () => {
  it('sin pedido: «Cada 5 min» y el botón «En vivo 15 min» pide', () => {
    const { onPedir } = fila({ modo: 'normal', hastaMs: null })
    expect(screen.getByText('Cada 5 min')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /En vivo 15 min/ }))
    expect(onPedir).toHaveBeenCalledOnce()
  })

  it('confirmado por el latido: «En vivo hasta 14:32» y «Volver a 5 min» termina', () => {
    const { onTerminar } = fila({ modo: 'vivo', hastaMs: HASTA })
    expect(screen.getByText('En vivo hasta 14:32')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a 5 min' }))
    expect(onTerminar).toHaveBeenCalledOnce()
  })

  it('pedido sin confirmar: no dice «En vivo hasta», avisa que tarda hasta 5 min', () => {
    fila({ modo: 'pedido', hastaMs: HASTA })
    expect(screen.queryByText('En vivo hasta 14:32')).toBeNull()
    expect(screen.getByText('En vivo pedido hasta 14:32')).toBeTruthy()
    expect(screen.getByText(/en 5 min o menos/)).toBeTruthy()
  })

  it('lector anterior a e1.4: pide publicar la versión nueva', () => {
    fila({ modo: 'sin-soporte', hastaMs: HASTA }, { version: 'e1.3' })
    expect(screen.getByText(/El lector e1\.3 no lee en vivo: publica la e1\.4/)).toBeTruthy()
  })

  it('muestra el error del guardado', () => {
    fila({ modo: 'normal', hastaMs: null }, { error: 'No se pudo guardar el pedido.' })
    expect(screen.getByRole('alert').textContent).toBe('No se pudo guardar el pedido.')
  })
})
