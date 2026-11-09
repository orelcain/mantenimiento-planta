import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccionDetalle } from '../AccionDetalle'
import type { AccionAcr, CausaAcr } from '@/services/acr/acr.types'

afterEach(cleanup)

const CAUSAS: CausaAcr[] = [
  { id: 'c1', texto: 'Resorte de la chapaleta sin revisión', nivel: 'latente', m6: null },
  { id: 'c2', texto: 'Operador sin capacitación', nivel: 'humana', m6: null },
]

const accion = (over: Partial<AccionAcr> = {}): AccionAcr => ({
  id: 'a1',
  texto: 'Agregar el resorte a la pauta',
  fuerza: 'fuerte',
  causaId: 'c1',
  responsable: '',
  fechaLimite: null,
  estado: 'pendiente',
  ...over,
})

const handlers = () => ({ onCausa: vi.fn(), onResponsable: vi.fn(), onFecha: vi.fn() })

describe('AccionDetalle (hoja Acción)', () => {
  it('muestra las causas como radios y marca la que ataca', () => {
    render(<AccionDetalle accion={accion()} causas={CAUSAS} tecnicos={['Ana Pérez']} {...handlers()} />)
    expect(screen.getByText('Ataca esta causa')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Resorte de la chapaleta/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Operador sin capacitación/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('tocar otra causa la cambia (guarda causaId)', () => {
    const h = handlers()
    render(<AccionDetalle accion={accion()} causas={CAUSAS} tecnicos={[]} {...h} />)
    fireEvent.click(screen.getByRole('radio', { name: /Operador sin capacitación/ }))
    expect(h.onCausa).toHaveBeenCalledWith('c2')
  })

  it('sin causas no muestra el grupo de causa', () => {
    render(<AccionDetalle accion={accion({ causaId: null })} causas={[]} tecnicos={[]} {...handlers()} />)
    expect(screen.queryByText('Ataca esta causa')).toBeNull()
    expect(screen.getByText('Quién y para cuándo')).toBeTruthy()
  })

  it('elegir un técnico actualiza el responsable', () => {
    const h = handlers()
    render(<AccionDetalle accion={accion()} causas={CAUSAS} tecnicos={['Ana Pérez', 'Luis Soto']} {...h} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Responsable' }), { target: { value: 'Luis Soto' } })
    expect(h.onResponsable).toHaveBeenCalledWith('Luis Soto')
  })

  it('«Otro nombre» abre el campo libre, que también actualiza el responsable', () => {
    const h = handlers()
    render(<AccionDetalle accion={accion()} causas={CAUSAS} tecnicos={['Ana Pérez']} {...h} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Responsable' }), { target: { value: '__otro__' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Otro nombre' }), { target: { value: 'Carlos' } })
    expect(h.onResponsable).toHaveBeenCalledWith('Carlos')
  })

  it('un responsable fuera de la lista se agrega como opción', () => {
    render(<AccionDetalle accion={accion({ responsable: 'Pedro Gil' })} causas={CAUSAS} tecnicos={['Ana Pérez']} {...handlers()} />)
    expect(screen.getByRole('option', { name: 'Pedro Gil' })).toBeTruthy()
  })

  it('poner la fecha la guarda en YYYY-MM-DD y limpiarla deja null', () => {
    const h = handlers()
    render(<AccionDetalle accion={accion({ fechaLimite: '2026-11-20' })} causas={CAUSAS} tecnicos={[]} {...h} />)
    expect(screen.getByText('20-11-2026')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Fecha límite'), { target: { value: '2026-12-01' } })
    expect(h.onFecha).toHaveBeenLastCalledWith('2026-12-01')
    fireEvent.change(screen.getByLabelText('Fecha límite'), { target: { value: '' } })
    expect(h.onFecha).toHaveBeenLastCalledWith(null)
  })
})
