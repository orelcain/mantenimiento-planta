import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CadenaPorQues } from '../CadenaPorQues'

// El dictado (SpeechTextarea) no hace falta para probar la cadena: un textarea simple basta.
vi.mock('@/components/ui/SpeechTextarea', async () => {
  const React = await import('react')
  return {
    SpeechTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => React.createElement('textarea', props),
  }
})

/** Cadena con estado propio, para probar agregar y escribir como lo hace la tarjeta. */
function Caja({
  primero,
  extras,
  pantalla = false,
  onPantalla = () => {},
}: {
  primero: string
  extras: string[]
  pantalla?: boolean
  onPantalla?: (abierta: boolean) => void
}) {
  const [p1, setP1] = useState(primero)
  const [xs, setXs] = useState(extras)
  const [abierta, setAbierta] = useState(pantalla)
  return (
    <CadenaPorQues
      idBase="t"
      queSeRompio="Resorte de ingreso cortado"
      primero={p1}
      extras={xs}
      onCambiarPrimero={setP1}
      onCambiarExtras={setXs}
      pantallaAbierta={abierta}
      onPantalla={(v) => {
        setAbierta(v)
        onPantalla(v)
      }}
    />
  )
}

const botonAgregar = () => screen.getByRole('button', { name: /¿Y por qué\?/ })

describe('CadenaPorQues', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('agrega porqués hasta 5 y luego el botón queda deshabilitado', () => {
    render(<Caja primero="A" extras={[]} />)
    expect(botonAgregar().hasAttribute('disabled')).toBe(false)

    // Cada porqué nuevo arranca vacío: el botón se apaga hasta escribirlo.
    fireEvent.click(botonAgregar())
    expect(botonAgregar().hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('Porqué 2'), { target: { value: 'B' } })
    expect(botonAgregar().hasAttribute('disabled')).toBe(false)

    fireEvent.click(botonAgregar())
    fireEvent.change(screen.getByLabelText('Porqué 3'), { target: { value: 'C' } })
    fireEvent.click(botonAgregar())
    fireEvent.change(screen.getByLabelText('Porqué 4'), { target: { value: 'D' } })
    fireEvent.click(botonAgregar())
    fireEvent.change(screen.getByLabelText('Porqué 5'), { target: { value: 'E' } })

    expect(screen.getByText('5 de 5 · opcional')).toBeTruthy()
    expect(botonAgregar().hasAttribute('disabled')).toBe(true)
  })

  it('«Quitar» elimina ese porqué y los siguientes se corren', () => {
    render(<Caja primero="A" extras={['B', 'C']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar porqué 2' }))
    expect(screen.queryByLabelText('Porqué 3')).toBeNull()
    expect((screen.getByLabelText('Porqué 2') as HTMLTextAreaElement).value).toBe('C')
  })

  it('la pill «Latente candidata» va en el último porqué con texto, si hay un extra con texto', () => {
    render(<Caja primero="A" extras={['B', 'C', '']} />)
    const pills = screen.getAllByText('Latente candidata')
    expect(pills).toHaveLength(1)
    const pill = pills[0]!
    // Entre la etiqueta del porqué 3 (C) y su textarea; después del porqué 2 y antes del 3.
    expect(pill.compareDocumentPosition(screen.getByLabelText('Porqué 3')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText('Porqué 2').compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sin ningún extra con texto no hay pill', () => {
    render(<Caja primero="A" extras={['']} />)
    expect(screen.queryByText('Latente candidata')).toBeNull()
  })

  it('«Pantalla completa» pide abrirla', () => {
    const onPantalla = vi.fn()
    render(<Caja primero="A" extras={[]} onPantalla={onPantalla} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pantalla completa' }))
    expect(onPantalla).toHaveBeenCalledWith(true)
  })

  it('en la pantalla completa, editar el 1 llama a onCambiarPrimero', () => {
    const onCambiarPrimero = vi.fn()
    render(
      <CadenaPorQues
        idBase="t"
        queSeRompio="Resorte"
        primero="A"
        extras={['B']}
        onCambiarPrimero={onCambiarPrimero}
        onCambiarExtras={() => {}}
        pantallaAbierta
        onPantalla={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('Porqué 1'), { target: { value: 'Nuevo' } })
    expect(onCambiarPrimero).toHaveBeenCalledWith('Nuevo')
  })
})
