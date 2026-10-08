// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ParteFisica } from '@/hooks/usePartesPlano'
import { SolicitarAltaSheet, type DatosEnvioAlta } from '../SolicitarAltaSheet'

afterEach(cleanup)

const pieza = (extra: Partial<ParteFisica> = {}): ParteFisica => ({
  nr: '42203183', es: 'Relé en miniatura', de: 'Miniaturrelais 24V DC', fig: '120 (2014)', hoja: null, pos: '321', confianza: 'catalogo', nivel: 'pieza', ...extra,
})

const montar = (props: Partial<React.ComponentProps<typeof SolicitarAltaSheet>> = {}) => {
  const onEnviar = vi.fn(async (_d: DatosEnvioAlta) => {})
  const onClose = vi.fn()
  render(
    <SolicitarAltaSheet
      open
      onClose={onClose}
      codigo="42203183"
      pieza={pieza()}
      elemento="K20"
      maquina="baader-n2"
      elementos={['K20', 'K22']}
      onEnviar={onEnviar}
      {...props}
    />,
  )
  return { onEnviar, onClose }
}

describe('SolicitarAltaSheet', () => {
  it('lista de solo lectura de lo que recibe bodega, con la tensión de la descripción alemana', () => {
    montar()
    const t = screen.getByTestId('alta-sheet').textContent ?? ''
    expect(t).toContain('Código de fabricante42203183')
    expect(t).toContain('DescripciónRelé en miniatura 24V DC')
    expect(t).toContain('Catálogo 2014 · fig. 120 · pos. 321'.replace('Catálogo ', ''))
    expect(t).toContain('DóndeK20 en N2')
    expect(t).toContain('Mismo código en el plano')
    expect(t).toContain('K20, K22 · 2 elementos')
    expect(t).toContain('Viene del plano 888 y del catálogo; no se edita aquí.')
    // solo lectura: el único texto escribible es la nota (más cantidad)
    expect(screen.getAllByRole('textbox').map(e => e.getAttribute('aria-label'))).toEqual(['Unidades', 'Nota'])
  })

  it('un código del catálogo no lleva avisos', () => {
    montar()
    expect(screen.queryAllByRole('note')).toHaveLength(0)
  })

  it('conjunto + propuesto + catálogo 2006 (N1): los tres avisos, y el envío sigue habilitado', () => {
    montar({ pieza: pieza({ nivel: 'conjunto', confianza: 'propuesto', generacion: 'N1 (catálogo 2006)' }), onConfirmarEnTerreno: vi.fn() })
    expect(screen.getAllByRole('note')).toHaveLength(3)
    expect(screen.getByText(/Es un conjunto/)).toBeTruthy()
    expect(screen.getByText(/Código propuesto, no confirmado en terreno/)).toBeTruthy()
    expect(screen.getByText('Código del catálogo 2006 (N1): revisa que sirva para N2 y N3.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar a bodega' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('sin onConfirmarEnTerreno no hay botón de confirmar', () => {
    montar({ pieza: pieza({ confianza: 'propuesto' }) })
    expect(screen.queryByRole('button', { name: 'Confirmar en terreno primero' })).toBeNull()
  })

  it('cantidad: arranca en 1, no baja de 1, sube con «Más», acepta escribir y acota a 1–999', () => {
    montar()
    const campo = screen.getByLabelText('Unidades') as HTMLInputElement
    expect(campo.value).toBe('1')
    expect((screen.getByRole('button', { name: 'Menos' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    expect(campo.value).toBe('2')
    fireEvent.change(campo, { target: { value: '12' } })
    expect(campo.value).toBe('12')
    fireEvent.change(campo, { target: { value: '5000' } })
    expect(campo.value).toBe('999')
    expect((screen.getByRole('button', { name: 'Más' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(campo, { target: { value: 'abc' } })
    expect(campo.value).toBe('1')
  })

  it('el pie de la cantidad dice cuántas veces lo usa el plano, o que un conjunto cubre varios', () => {
    montar()
    expect(screen.getByText('El plano lo usa 2 veces por máquina.')).toBeTruthy()
    cleanup()
    montar({ pieza: pieza({ nivel: 'conjunto' }), elementos: ['Y1', 'Y2', 'Y3', 'Y4'], elemento: 'Y1' })
    expect(screen.getByText('Un solo conjunto cubre Y1–Y4.')).toBeTruthy()
  })

  it('envía cantidad, nota y foto', async () => {
    const { onEnviar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'De respaldo' } })
    const archivo = new File(['x'], 'e.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Foto de la etiqueta'), { target: { files: [archivo] } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a bodega' }))
    await waitFor(() => expect(onEnviar).toHaveBeenCalledWith({ cantidad: 2, observaciones: 'De respaldo', archivo }))
  })

  it('mientras envía, el botón dice «Enviando…» y no se puede repetir', async () => {
    let fin: () => void = () => {}
    const { onEnviar } = montar({ onEnviar: vi.fn(() => new Promise<void>(r => { fin = r })) })
    void onEnviar
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a bodega' }))
    const b = (await screen.findByRole('button', { name: 'Enviando…' })) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    fin()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar a bodega' })).toBeTruthy())
  })

  it('«Volver a solicitar» llega con la nota y la cantidad anteriores', () => {
    montar({ inicial: { cantidad: 4, observaciones: 'Nota anterior' } })
    expect((screen.getByLabelText('Nota') as HTMLTextAreaElement).value).toBe('Nota anterior')
    expect((screen.getByLabelText('Unidades') as HTMLInputElement).value).toBe('4')
  })

  it('código leído en la etiqueta: lo rotula y no repite la figura del catálogo', () => {
    montar({ codigo: '42203199', codigoLeido: true, pieza: pieza({ confianza: 'propuesto' }) })
    const t = screen.getByTestId('alta-sheet').textContent ?? ''
    expect(t).toContain('Código de fabricante (leído en la etiqueta)42203199')
    expect(t).not.toContain('Catálogo120')
    expect(screen.queryByText(/Código propuesto/)).toBeNull()
  })

  it('Cancelar cierra', () => {
    const { onClose } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('SolicitarAltaSheet · táctil', () => {
  it('«Confirmar en terreno primero» mide 44 px (no el size sm de 36)', () => {
    montar({ pieza: pieza({ confianza: 'propuesto' }), onConfirmarEnTerreno: vi.fn() })
    const b = screen.getByRole('button', { name: 'Confirmar en terreno primero' })
    expect(b.className).toContain('h-[44px]')
    expect(b.className).not.toContain('h-9')
  })
})
