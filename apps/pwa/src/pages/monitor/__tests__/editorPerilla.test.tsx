/**
 * El editor de la perilla en la franja (solo admin): quién ve el enlace, que Guardar queda apagado sin cambio, que Guardar llama a
 * `setMonitorPerilla` con la línea (`plantSlug`) y quien anota (`por`), que el mensaje «guardado» dura hasta el próximo dato
 * publicado, y que el historial de la máquina trae quién anotó. El servicio va mockeado: lo que se prueba es la UI y la llamada.
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { leerPerillasHistorial, setMonitorPerilla } from '@/services/shoplogix/pinShiftEnd'
import { MinutoTurnoV2, type MinutoTurno } from '../MonitorV2'
import type { PerillaEditorDatos } from '../EditorPerilla'
import type { PerillasDeLinea } from '../perilla'

vi.mock('@/services/shoplogix/pinShiftEnd', () => ({
  setMonitorPerilla: vi.fn(),
  leerPerillasHistorial: vi.fn(),
}))

const DESDE = '2026-11-04T01:00:00.000Z'
const PERILLAS: PerillasDeLinea = { actual: { ev1: { cpm: 17, desde: '2026-11-04T00:00:00.000Z' } }, historial: [] }
const TURNO: MinutoTurno = {
  desde: DESDE,
  maquinas: [
    { id: 'ev1', nombre: 'Evisceradora 1', esperado: 18, cycles: Array.from({ length: 10 }, () => 15) },
    { id: 'ev2', nombre: 'Evisceradora 2', esperado: 16, cycles: Array.from({ length: 10 }, () => 16) },
  ],
}
const EDITOR: PerillaEditorDatos = { plantSlug: 'chonchi', por: 'orel@test' }

const renderFranja = (perillaEditor: PerillaEditorDatos | null, perillas: PerillasDeLinea | null = PERILLAS) =>
  render(<MinutoTurnoV2 d={TURNO} cerrado={false} perillas={perillas} carros={null} perillaEditor={perillaEditor} />)

const comoAdmin = () => useAuthStore.setState({ user: { rol: 'admin', email: 'orel@test' } as never })

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})
beforeEach(() => {
  vi.mocked(leerPerillasHistorial).mockResolvedValue([])
  vi.mocked(setMonitorPerilla).mockResolvedValue(undefined)
  useAuthStore.setState({ user: null })
})
afterEach(() => {
  cleanup()
  useAuthStore.setState({ user: null })
  vi.clearAllMocks()
})

describe('quién ve el editor', () => {
  it('solo un admin ve el enlace: sin sesión o con supervisor no aparece', () => {
    const { container, unmount } = renderFranja(EDITOR)
    expect(container.textContent).not.toContain('Cambiar perilla')
    unmount()
    useAuthStore.setState({ user: { rol: 'supervisor', email: 'sup@test' } as never })
    const otro = renderFranja(EDITOR)
    expect(otro.container.textContent).not.toContain('Cambiar perilla')
  })

  it('el admin ve «Cambiar perilla» con perilla y «Anotar perilla» sin ella', () => {
    comoAdmin()
    const { container } = renderFranja(EDITOR)
    expect(container.textContent).toContain('Cambiar perilla')
    expect(container.textContent).toContain('Anotar perilla')
  })

  it('el admin sin datos de línea (la página no ofrece el editor) no ve el enlace', () => {
    comoAdmin()
    const { container } = renderFranja(null)
    expect(container.textContent).not.toContain('Cambiar perilla')
    expect(container.textContent).not.toContain('Anotar perilla')
  })
})

describe('el editor de una máquina con perilla', () => {
  it('Guardar queda apagado mientras el valor sea el vigente', () => {
    comoAdmin()
    const { getByText, getByRole } = renderFranja(EDITOR)
    fireEvent.click(getByText('Cambiar perilla'))
    expect((getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('subir habilita Guardar y bajar al vigente lo apaga de nuevo', () => {
    comoAdmin()
    const { getByText, getByRole } = renderFranja(EDITOR)
    fireEvent.click(getByText('Cambiar perilla'))
    fireEvent.click(getByRole('button', { name: 'Subir' }))
    expect((getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(getByRole('button', { name: 'Bajar' }))
    expect((getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Guardar llama a setMonitorPerilla con la línea (plantSlug), la máquina, el valor y quien anota', async () => {
    comoAdmin()
    const { getByText, getByRole, container } = renderFranja(EDITOR)
    fireEvent.click(getByText('Cambiar perilla'))
    fireEvent.click(getByRole('button', { name: 'Subir' }))
    fireEvent.click(getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(container.textContent).toContain('guardado · se aplica con el próximo dato'))
    expect(setMonitorPerilla).toHaveBeenCalledTimes(1)
    expect(setMonitorPerilla).toHaveBeenCalledWith({ plantSlug: 'chonchi', machineId: 'ev1', cpm: 18, por: 'orel@test' })
    expect((getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('el «guardado» dura hasta que llega un dato publicado nuevo', async () => {
    comoAdmin()
    const { getByText, getByRole, container, rerender } = renderFranja(EDITOR)
    fireEvent.click(getByText('Cambiar perilla'))
    fireEvent.click(getByRole('button', { name: 'Subir' }))
    fireEvent.click(getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(container.textContent).toContain('guardado · se aplica con el próximo dato'))
    /* Mismo dato: sigue el mensaje. Un dato publicado nuevo (otra referencia de perillas) lo quita. */
    rerender(<MinutoTurnoV2 d={TURNO} cerrado={false} perillas={PERILLAS} carros={null} perillaEditor={EDITOR} />)
    expect(container.textContent).toContain('guardado · se aplica con el próximo dato')
    rerender(<MinutoTurnoV2 d={TURNO} cerrado={false} perillas={{ ...PERILLAS }} carros={null} perillaEditor={EDITOR} />)
    expect(container.textContent).not.toContain('guardado · se aplica con el próximo dato')
  })

  it('el historial muestra solo las anotaciones de esta máquina, con quien anotó y sin correo completo', async () => {
    comoAdmin()
    vi.mocked(leerPerillasHistorial).mockResolvedValue([
      { machineId: 'ev1', cpm: 17, desde: '2026-11-04T00:00:00.000Z', por: 'orel@test' },
      { machineId: 'ev2', cpm: 16, desde: '2026-11-04T00:30:00.000Z', por: 'otro@test' },
    ])
    const { getByText, container } = renderFranja(EDITOR)
    fireEvent.click(getByText('Cambiar perilla'))
    await waitFor(() => expect(container.textContent).toContain('17 pz/min · desde 04-11 00:00 · orel'))
    expect(container.textContent).not.toContain('@')
    expect(container.textContent).not.toContain('otro')
    expect(leerPerillasHistorial).toHaveBeenCalledWith('chonchi')
  })
})

describe('el editor de una máquina sin perilla', () => {
  it('propone la meta de Shoplogix y Guardar queda habilitado (no hay vigente con que comparar)', () => {
    comoAdmin()
    const { getByText, getByRole, container } = renderFranja(EDITOR)
    fireEvent.click(getByText('Anotar perilla'))
    expect(container.textContent).toContain('Con 16: a ritmo con 15 o más por minuto · meta Shoplogix 16')
    expect((getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
