/**
 * Detenciones de etapa en la piel Apple: la página muestra solo el ranking (o
 * una línea y el botón si está vacío); el formulario vive en la hoja inferior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { ParoEtapaCapture } from '../ParoEtapaCapture'

vi.mock('@/services/paros', () => ({
  addParo: vi.fn(),
  deleteParo: vi.fn(),
  getParosByPlantLine: vi.fn(async () => []),
}))
vi.mock('@/store', () => ({
  useAuthStore: (selector: (s: { user: null }) => unknown) => selector({ user: null }),
}))

describe('ParoEtapaCapture · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('sin detenciones muestra la línea y el botón que abre el registro', async () => {
    render(<ParoEtapaCapture plantLineId="chonchi-eviscerado" />)
    expect(await screen.findByText('Sin detenciones de etapa registradas este mes.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Registrar detención de etapa' })).toBeTruthy()
  })

  it('el formulario no está en la página: aparece al abrir el botón', async () => {
    render(<ParoEtapaCapture plantLineId="chonchi-eviscerado" />)
    await screen.findByText('Sin detenciones de etapa registradas este mes.')
    expect(screen.queryByText('Duración (min)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar detención de etapa' }))
    expect(screen.getByText('Duración (min)')).toBeTruthy()
    expect(screen.getByText('Fecha y hora')).toBeTruthy()
  })

  it('el panel de la hoja trae el botón de registrar y el texto no lleva guiones ni puntos medios de la piel vieja', async () => {
    const { container } = render(<ParoEtapaCapture plantLineId="chonchi-eviscerado" />)
    await screen.findByText('Sin detenciones de etapa registradas este mes.')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar detención de etapa' }))
    expect(screen.getByRole('button', { name: 'Registrar detención' })).toBeTruthy()
    const texto = container.ownerDocument.body.textContent ?? ''
    expect(texto).not.toContain('·')
  })

  it('con la piel anterior sigue la tarjeta de siempre, con el formulario a la vista', async () => {
    document.documentElement.removeAttribute('data-skin')
    render(<ParoEtapaCapture plantLineId="chonchi-eviscerado" />)
    expect(await screen.findByText('Detenciones de etapa (línea)')).toBeTruthy()
    expect(screen.getByText('Duración (min)')).toBeTruthy()
  })
})
