/**
 * BotonMonitorLinea: solo aparece en líneas con Shoplogix y abre el monitor de
 * LÍNEA (no el de un turno), con la pestaña abierta antes de esperar al backend.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const crear = vi.fn()
vi.mock('@/services/shoplogix/publicShiftMonitor.service', () => ({
  createPublicShiftMonitor: (p: unknown) => crear(p),
}))

import { BotonMonitorLinea } from '../BotonMonitorLinea'
import { getPlantLineConfig } from '@/config/plantLines'

afterEach(() => {
  cleanup()
  crear.mockReset()
  vi.restoreAllMocks()
})

describe('BotonMonitorLinea', () => {
  it('no aparece en una línea sin Shoplogix', () => {
    render(<BotonMonitorLinea linea={getPlantLineConfig('acopio-general')} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('abre la pestaña antes de pedir el token y la lleva al monitor de la línea', async () => {
    const ventana = { location: { href: '' }, close: vi.fn() }
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window)
    crear.mockResolvedValue({ token: 'tok-123' })
    const linea = getPlantLineConfig('chonchi-filete')
    render(<BotonMonitorLinea linea={linea} />)

    fireEvent.click(screen.getByRole('button', { name: /monitor/i }))

    expect(abrir).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(ventana.location.href).toContain('monitor/tok-123'))
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ mode: 'line', plantLineId: 'chonchi-filete', plantSlug: linea.plantSlug }))
  })

  it('si el backend falla, cierra la pestaña vacía y muestra el error', async () => {
    const ventana = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window)
    crear.mockRejectedValue(new Error('Sin permiso'))
    render(<BotonMonitorLinea linea={getPlantLineConfig('chonchi-eviscerado')} />)

    fireEvent.click(screen.getByRole('button', { name: /monitor/i }))

    expect((await screen.findByRole('alert')).textContent).toBe('Sin permiso')
    expect(ventana.close).toHaveBeenCalled()
  })
})
