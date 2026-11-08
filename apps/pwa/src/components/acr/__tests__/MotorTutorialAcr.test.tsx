import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MotorTutorialAcr } from '../MotorTutorialAcr'
import { CAPITULOS, INICIO_CAPITULO, PASOS_TUTORIAL } from '../tutorialAcr'

vi.mock('@/lib/ariaVoice', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }))

const montar = () => {
  const preparar = vi.fn()
  const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  render(
    <MotorTutorialAcr
      onCerrar={() => {}}
      onTerminar={() => {}}
      preparar={preparar}
      escribir={() => {}}
      accion={() => {}}
    />,
  )
  return { preparar, play }
}

describe('MotorTutorialAcr', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  /** Regresión del 08-11-2026: el motor montaba en «inactivo», nada sonaba y el botón decía «Seguir». */
  it('al montarse arranca en el paso 1, sonando, y prepara la práctica de ese paso', () => {
    const { preparar, play } = montar()
    expect(screen.getByText(/Hola, soy ARIA/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pausa/ })).toBeTruthy()
    expect(play).toHaveBeenCalled()
    expect(preparar).toHaveBeenCalledWith(0)
    expect(screen.getByText(`1/${CAPITULOS.length} · ${CAPITULOS[0]}`)).toBeTruthy()
  })

  it('el índice lista los 11 capítulos y saltar a uno sigue desde su primer paso', () => {
    const { preparar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Índice' }))
    const nav = screen.getByRole('navigation', { name: /Capítulos/ })
    expect(nav.querySelectorAll('button')).toHaveLength(11)

    fireEvent.click(screen.getByRole('button', { name: /Revisión semanal del supervisor/ }))
    const primero = INICIO_CAPITULO[10]!
    expect(preparar).toHaveBeenLastCalledWith(primero)
    expect(screen.getByText(PASOS_TUTORIAL[primero]!.texto)).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: /Capítulos/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Pausa/ })).toBeTruthy()
  })

  it('«Siguiente» pasa al paso 2 y lo prepara', () => {
    const { preparar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(preparar).toHaveBeenLastCalledWith(1)
    expect(screen.getByText(PASOS_TUTORIAL[1]!.texto)).toBeTruthy()
  })
})
