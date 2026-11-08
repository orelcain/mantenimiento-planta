import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MotorTutorialAcr } from '../MotorTutorialAcr'

vi.mock('@/lib/ariaVoice', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }))

/**
 * Regresión del 08-11-2026: el motor montaba en «inactivo», nada sonaba y el botón decía
 * «Seguir». Montar el motor tiene que dejar el tutorial corriendo en el paso 1.
 */
describe('MotorTutorialAcr', () => {
  it('al montarse arranca en el paso 1, sonando', () => {
    const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    render(<MotorTutorialAcr onCerrar={() => {}} onTerminar={() => {}} escribir={() => {}} accion={() => {}} />)
    expect(screen.getByText(/Hola, soy ARIA/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pausa/ })).toBeTruthy()
    expect(play).toHaveBeenCalled()
  })
})
