/**
 * Cabecera del turno en la piel Apple: una línea de texto de 15 px, sin fondo.
 * El resultado depende de la hora en que corre el test, así que se aceptan las
 * dos formas que puede tomar (sin turno activo, o turno programado sin actividad).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CurrentShiftChip } from '../CurrentShiftChip'

vi.mock('@/services/grader/graderModuleConfig.service', () => ({
  getModuleRanges: vi.fn(async () => null),
}))
vi.mock('@/services/shoplogix/shoplogixShift.service', () => ({
  listShiftInfosForDay: vi.fn(async () => []),
}))
vi.mock('@/hooks/useUpstreamLineSnapshot', () => ({
  useUpstreamLineSnapshot: () => ({ snapshot: null, source: 'none', loading: false, syncedAt: null }),
}))

function chip() {
  return render(
    <MemoryRouter>
      <CurrentShiftChip plantLineId="chonchi-eviscerado" />
    </MemoryRouter>,
  )
}

describe('CurrentShiftChip · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    document.documentElement.removeAttribute('data-skin')
  })

  it('es una línea de texto sin fondo ni borde', async () => {
    const { container } = chip()
    await waitFor(() => expect(container.textContent?.length ?? 0).toBeGreaterThan(0))
    const texto = container.textContent ?? ''
    expect(/Sin turno activo ahora\.|, programado\. Sin actividad todavía\./.test(texto)).toBe(true)
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toMatch(/bg-(warning|success|muted)/)
    expect(raiz.className).not.toContain('rounded-ctl')
    expect(raiz.className).not.toContain('border')
  })

  it('no lleva punto de color si no hay detención en curso', async () => {
    const { container } = chip()
    await waitFor(() => expect(container.textContent?.length ?? 0).toBeGreaterThan(0))
    expect(container.querySelector('.rounded-full.bg-ink-crit')).toBeNull()
  })

  it('con la piel anterior sigue la píldora de siempre', async () => {
    document.documentElement.removeAttribute('data-skin')
    const { container } = chip()
    await waitFor(() => expect(container.textContent?.length ?? 0).toBeGreaterThan(0))
    expect((container.firstElementChild as HTMLElement).className).toContain('rounded-ctl')
  })
})
