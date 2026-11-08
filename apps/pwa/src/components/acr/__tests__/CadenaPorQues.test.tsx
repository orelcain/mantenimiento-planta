import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CadenaPorQues } from '../CadenaPorQues'
import type { PreguntarPorQue } from '@/services/acr/preguntarPorQue'

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
  preguntar = async () => '¿Por qué pasa eso?',
  onUsoAria = () => {},
  onAria = () => {},
  preguntaPractica = null,
}: {
  primero: string
  extras: string[]
  pantalla?: boolean
  onPantalla?: (abierta: boolean) => void
  preguntar?: PreguntarPorQue
  onUsoAria?: () => void
  onAria?: (abierta: boolean) => void
  preguntaPractica?: string | null
}) {
  const [p1, setP1] = useState(primero)
  const [xs, setXs] = useState(extras)
  const [abierta, setAbierta] = useState(pantalla)
  const [aria, setAria] = useState(false)
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
      preguntar={preguntar}
      equipo="Línea 3"
      onUsoAria={onUsoAria}
      ariaAbierta={aria}
      onAria={(v) => {
        setAria(v)
        onAria(v)
      }}
      preguntaPractica={preguntaPractica}
    />
  )
}

const botonAgregar = () => screen.getByRole('button', { name: /¿Y por qué\?/ })
const botonAria = () => screen.getByRole('button', { name: 'ARIA pregunta' })

describe('CadenaPorQues', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.removeItem('acr-porques-modo')
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
        preguntar={async () => '¿Por qué pasa eso?'}
        equipo="Línea 3"
        onUsoAria={() => {}}
        ariaAbierta={false}
        onAria={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('Porqué 1'), { target: { value: 'Nuevo' } })
    expect(onCambiarPrimero).toHaveBeenCalledWith('Nuevo')
  })
})

describe('CadenaPorQues · ARIA pregunta', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.removeItem('acr-porques-modo')
  })

  it('tocar «ARIA pregunta» llama a preguntar con la cadena y muestra la pregunta', async () => {
    const preguntar = vi.fn(async () => '¿Qué plan de revisión incluye el regulador?')
    render(<Caja primero="La chapaleta golpea" extras={['El cilindro entra sin regulador']} preguntar={preguntar} />)
    fireEvent.click(botonAria())
    expect(await screen.findByText('¿Qué plan de revisión incluye el regulador?')).toBeTruthy()
    expect(preguntar).toHaveBeenCalledWith({
      equipo: 'Línea 3',
      queSeRompio: 'Resorte de ingreso cortado',
      cadena: ['La chapaleta golpea', 'El cilindro entra sin regulador'],
    })
  })

  it('«Responder» agrega el porqué, llama onUsoAria y pide la siguiente pregunta', async () => {
    const preguntar = vi.fn().mockResolvedValueOnce('¿Primera pregunta?').mockResolvedValueOnce('¿Segunda pregunta?')
    const onUsoAria = vi.fn()
    render(<Caja primero="A" extras={[]} preguntar={preguntar} onUsoAria={onUsoAria} />)
    fireEvent.click(botonAria())
    await screen.findByText('¿Primera pregunta?')
    fireEvent.change(screen.getByLabelText('Tu respuesta a ARIA'), { target: { value: 'Respuesta B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    expect(onUsoAria).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Porqué 2') as HTMLTextAreaElement).value).toBe('Respuesta B')
    expect(await screen.findByText('¿Segunda pregunta?')).toBeTruthy()
    expect(preguntar).toHaveBeenLastCalledWith(expect.objectContaining({ cadena: ['A', 'Respuesta B'] }))
    expect((screen.getByLabelText('Tu respuesta a ARIA') as HTMLTextAreaElement).value).toBe('')
  })

  it('si preguntar rechaza, se ve el aviso, la tarjeta se cierra y no se pierde lo escrito', async () => {
    const preguntar = vi.fn().mockRejectedValue(new Error('sin respuesta'))
    const onAria = vi.fn()
    render(<Caja primero="A" extras={['B']} preguntar={preguntar} onAria={onAria} />)
    fireEvent.click(botonAria())

    expect(await screen.findByText('ARIA no respondió. Escribe tú.')).toBeTruthy()
    expect(onAria).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    expect((screen.getByLabelText('Porqué 2') as HTMLTextAreaElement).value).toBe('B')
  })

  it('sin porqué 1 el botón está deshabilitado', () => {
    render(<Caja primero="" extras={[]} />)
    expect(botonAria().hasAttribute('disabled')).toBe(true)
  })

  it('sin señal el botón está deshabilitado y se dice que se escribe a mano', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<Caja primero="A" extras={[]} />)
    expect(botonAria().hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Sin señal: escribe tú')).toBeTruthy()
  })

  it('con preguntaPractica (tutorial) muestra la pregunta fija y NO llama a preguntar', async () => {
    const preguntar = vi.fn(async () => '¿Otra?')
    render(<Caja primero="A" extras={[]} preguntar={preguntar} preguntaPractica="¿Pregunta fija del tutorial?" />)
    fireEvent.click(botonAria())
    expect(await screen.findByText('¿Pregunta fija del tutorial?')).toBeTruthy()
    expect(preguntar).not.toHaveBeenCalled()
  })

  it('no llama a la IA al montar aunque la preferencia guardada sea «aria»', () => {
    localStorage.setItem('acr-porques-modo', 'aria')
    const preguntar = vi.fn(async () => '¿Qué plan?')
    render(<Caja primero="A" extras={[]} preguntar={preguntar} />)
    expect(preguntar).not.toHaveBeenCalled()
  })
})
