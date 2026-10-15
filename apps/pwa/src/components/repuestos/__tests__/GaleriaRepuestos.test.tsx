// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GaleriaRepuestos, type FilaGaleria } from '../GaleriaRepuestos'

const B = 'https://x/o/repuestos%2Fa%2F1%2F'
const BODEGA = `${B}fotos%2Fa.webp?alt=media`
const MANUAL = `${B}manual%2Fb.jpg?alt=media`

interface Fila extends FilaGaleria { fotos: string[] }
const fila = (n: string, fotos: string[], extra: Partial<Fila> = {}): Fila =>
  ({ rowKey: n, textoBreve: `Pieza ${n}`, codigoSAP: `SAP${n}`, stockStatus: 'ok', stockActual: 0, fotos, ...extra })

const STOCK = { ok: { label: 'Disponible', dot: 'bg-fill-ok', text: 'text-ink-ok' } }

function montar(rows: Fila[]) {
  const props = {
    onAbrirFicha: vi.fn(),
    onAbrirFoto: vi.fn(),
    onAgregarFoto: vi.fn(),
  }
  render(<GaleriaRepuestos<Fila> rows={rows} fotosDe={(r) => r.fotos} stockMeta={STOCK} {...props} />)
  return props
}

afterEach(cleanup)

const ROWS = [
  fila('1', [BODEGA]),
  fila('2', [MANUAL]),
  fila('3', []),
  fila('4', [], { stockActual: 3 }),
  fila('5', [], { comunEn: ['b200'] }),
]

describe('GaleriaRepuestos', () => {
  it('por defecto muestra solo «Con foto real»', () => {
    montar(ROWS)
    expect(screen.getByText('Pieza 1')).toBeTruthy()
    expect(screen.queryByText('Pieza 2')).toBeNull()
    expect(screen.queryByText('Pieza 3')).toBeNull()
    expect(screen.getByText('20 % con foto real')).toBeTruthy()
  })

  it('«Sin foto» lista ordenada: común, con stock, resto', () => {
    montar(ROWS)
    fireEvent.click(screen.getByRole('tab', { name: /Sin foto/ }))
    const nombres = screen.getAllByText(/^Pieza \d$/).map((e) => e.textContent)
    expect(nombres).toEqual(['Pieza 5', 'Pieza 4', 'Pieza 3'])
    expect(screen.getByText('Común')).toBeTruthy()
  })

  it('cámara llama onAgregarFoto sin abrir la ficha', () => {
    const p = montar(ROWS)
    fireEvent.click(screen.getByRole('tab', { name: /Sin foto/ }))
    fireEvent.click(screen.getByLabelText('Agregar foto a Pieza 5'))
    expect(p.onAgregarFoto).toHaveBeenCalledTimes(1)
    expect(p.onAbrirFicha).not.toHaveBeenCalled()
  })

  it('clic en la foto abre el visor; clic en el texto abre la ficha', () => {
    const p = montar(ROWS)
    fireEvent.click(screen.getByLabelText('Abrir foto de Pieza 1'))
    expect(p.onAbrirFoto).toHaveBeenCalledWith(expect.objectContaining({ rowKey: '1' }), 0)
    fireEvent.click(screen.getByText('Pieza 1'))
    expect(p.onAbrirFicha).toHaveBeenCalledWith(expect.objectContaining({ rowKey: '1' }))
  })

  it('«Mostrar más» agrega tarjetas', () => {
    const muchas = Array.from({ length: 60 }, (_, i) => fila(`n${i}`, [BODEGA]))
    montar(muchas)
    expect(screen.getAllByLabelText(/^Abrir foto de/)).toHaveLength(48)
    fireEvent.click(screen.getByText(/Mostrar más/))
    expect(screen.getAllByLabelText(/^Abrir foto de/)).toHaveLength(60)
  })
})
