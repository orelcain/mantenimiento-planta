// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GaleriaRepuestos, type FilaGaleria, type NombreGaleria } from '../GaleriaRepuestos'

const B = 'https://x/o/repuestos%2Fa%2F1%2F'
const BODEGA = `${B}fotos%2Fa.webp?alt=media`
const MANUAL = `${B}manual%2Fb.jpg?alt=media`

interface Fila extends FilaGaleria { fotos: string[]; comun?: string }
const fila = (n: string, fotos: string[], extra: Partial<Fila> = {}): Fila =>
  ({ rowKey: n, textoBreve: `PIEZA ${n}`, codigoSAP: `SAP${n}`, stockStatus: 'ok', fotos, ...extra })

const STOCK = { ok: { label: 'Disponible', dot: 'bg-fill-ok', text: 'text-ink-ok' } }
const nombreDe = (r: Fila): NombreGaleria => (r.comun ? { titulo: r.comun, oficial: r.textoBreve } : { titulo: r.textoBreve })

function montar(rows: Fila[], conCamara = true) {
  const props = { onAbrirFicha: vi.fn(), onAbrirFoto: vi.fn(), onAgregarFoto: conCamara ? vi.fn() : undefined }
  render(<GaleriaRepuestos<Fila> rows={rows} fotosDe={(r) => r.fotos} nombreDe={nombreDe} stockMeta={STOCK} {...props} />)
  return props
}

afterEach(cleanup)

describe('GaleriaRepuestos (una sola grilla)', () => {
  it('muestra todos en el orden recibido, con y sin foto, sin segmentos ni porcentaje', () => {
    montar([fila('1', [BODEGA]), fila('2', [MANUAL]), fila('3', [])])
    const titulos = screen.getAllByText(/^PIEZA \d$/).map((e) => e.textContent)
    expect(titulos).toEqual(['PIEZA 1', 'PIEZA 2', 'PIEZA 3'])
    expect(screen.queryByText(/con foto real/)).toBeNull()
    expect(screen.queryByText(/Sin foto \(/)).toBeNull()
  })

  it('el nombre común va primero y el oficial debajo', () => {
    montar([fila('1', [BODEGA], { comun: 'Válvula de agua' })])
    const titulo = screen.getByText('Válvula de agua')
    const oficial = screen.getByText('PIEZA 1')
    expect(titulo.compareDocumentPosition(oficial) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('clic en la foto abre el visor; clic en el texto abre la ficha', () => {
    const p = montar([fila('1', [MANUAL, BODEGA])])
    fireEvent.click(screen.getByRole('button', { name: 'Abrir foto de PIEZA 1' }))
    expect(p.onAbrirFoto).toHaveBeenCalledWith(expect.objectContaining({ rowKey: '1' }), 1) // portada = la de bodega
    fireEvent.click(screen.getByText('PIEZA 1'))
    expect(p.onAbrirFicha).toHaveBeenCalled()
  })

  it('sin foto: botón «Agregar foto» solo si hay permiso', () => {
    const p = montar([fila('3', [])])
    fireEvent.click(screen.getByRole('button', { name: 'Agregar foto a PIEZA 3' }))
    expect(p.onAgregarFoto).toHaveBeenCalled()
    cleanup()
    montar([fila('3', [])], false)
    expect(screen.queryByRole('button', { name: /Agregar foto/ })).toBeNull()
    expect(screen.getByText('Sin foto')).toBeTruthy()
  })

  it('«Mostrar más» agrega de a 48', () => {
    montar(Array.from({ length: 60 }, (_, i) => fila(String(i), [])))
    expect(screen.getAllByText(/^SAP\d+$/)).toHaveLength(48)
    fireEvent.click(screen.getByRole('button', { name: /Mostrar más/ }))
    expect(screen.getAllByText(/^SAP\d+$/)).toHaveLength(60)
  })
})
