import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Sheet } from '../Sheet'

afterEach(cleanup)

const panel = () => screen.getByRole('dialog')

describe('Sheet: presentacionPC', () => {
  it('por defecto no cambia nada: sin botón de cerrar ni clases de ventana', () => {
    render(<Sheet open onClose={() => {}} title="Filtros" size="wide">Cuerpo</Sheet>)
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull()
    expect(panel().className).not.toContain('piel-ventana-in')
    expect(panel().className).not.toContain('lg:h-')
  })

  it('`ventana` agrega el botón de cerrar, que llama a onClose', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} title="Editar evento" presentacionPC="ventana">Cuerpo</Sheet>)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('`libre` deja el contenido al que lo usa: sin botón propio ni pie, y el título solo para lectores', () => {
    render(<Sheet open onClose={() => {}} title="Causa raíz" presentacionPC="libre" actions={undefined}>Cuerpo</Sheet>)
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull()
    expect(panel().className.split(' ')).toContain('lg:p-0')
    expect(screen.getByRole('heading', { name: 'Causa raíz' }).className).toContain('lg:sr-only')
  })

  it('`ventana` solo actúa desde lg: el celular conserva la hoja y su tirador', () => {
    render(<Sheet open onClose={() => {}} title="Editar evento" presentacionPC="ventana">Cuerpo</Sheet>)
    const clases = panel().className.split(' ')
    expect(clases).toContain('rounded-t-panel')
    expect(clases).toContain('piel-sheet-in')
    expect(clases).toContain('lg:rounded-panel')
    const tirador = panel().querySelector('.h-\\[5px\\]')
    expect(tirador?.className).toContain('lg:hidden')
  })
})
