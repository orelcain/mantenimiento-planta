import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EventoBitacoraFila } from '../EventoBitacoraFila'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

afterEach(cleanup)

/** Forma del turno real del 23-09-2026 (día), reducida a lo que la fila usa. */
const evento = (p: Partial<EventoBitacora>): EventoBitacora =>
  ({
    id: 'e1',
    plantId: 'chonchi',
    turnoId: '2026-09-23_dia',
    fechaTurno: '2026-09-23',
    banda: 'dia',
    tipo: 'correctivo',
    equipo: 'BAADER 200',
    equipoCodigo: '720004417',
    equipoId: 'n1',
    titulo: null,
    descripcion: 'Se cambió punta trinquete reutilizada\nY se ajustan cuchillos',
    horaInicio: '',
    horaTermino: null,
    impacto: 'no-aplica',
    minutosParada: null,
    ventana: null,
    pendiente: false,
    estado: 'listo',
    fotos: [],
    repuestos: [],
    participantes: [],
    creadoPor: 'u1',
    autorNombre: 'Danilo Cortes',
    registradoPor: 'Danilo Cortes',
    ...p,
  }) as EventoBitacora

const foto = (n: number) => ({ url: `https://ejemplo/f${n}.jpg`, path: `p/f${n}.jpg`, etiqueta: 'foto' as const, ancho: 100, alto: 100 })

describe('EventoBitacoraFila compacta (registro corrido del celular)', () => {
  it('una línea de equipo y otra con «tipo · primera línea del texto», sin el texto completo', () => {
    render(<EventoBitacoraFila evento={evento({})} numero={9} onAbrir={() => {}} compacta />)
    expect(screen.getByText('Baader 200')).toBeTruthy()
    expect(screen.getByText('Correctivo · Se cambió punta trinquete reutilizada')).toBeTruthy()
    expect(screen.queryByText(/se ajustan cuchillos/)).toBeNull()
    expect(screen.getByLabelText('Sin fotos')).toBeTruthy()
  })

  it('la hora va primero cuando el evento la tiene', () => {
    render(<EventoBitacoraFila evento={evento({ horaInicio: '15:39', tipo: 'preventivo' })} onAbrir={() => {}} compacta />)
    expect(screen.getByText(/^15:39 · Preventivo · /)).toBeTruthy()
  })

  it('el impacto que costó a la línea se dice en la misma línea', () => {
    render(<EventoBitacoraFila evento={evento({ impacto: 'con-parada', minutosParada: 15 })} onAbrir={() => {}} compacta />)
    expect(screen.getByText(/^Detuvo 15 min/)).toBeTruthy()
  })

  it('una miniatura con el total; tocarla abre el visor en la primera foto, no el editor', () => {
    const onAbrir = vi.fn()
    const onVerFoto = vi.fn()
    const fotos = [foto(1), foto(2), foto(3)]
    render(<EventoBitacoraFila evento={evento({ fotos })} onAbrir={onAbrir} onVerFoto={onVerFoto} compacta />)
    const boton = screen.getByRole('button', { name: 'Ver las 3 fotos' })
    expect(boton.textContent).toContain('3')
    expect(boton.querySelectorAll('img')).toHaveLength(1)
    fireEvent.click(boton)
    expect(onVerFoto).toHaveBeenCalledWith(fotos, 0)
    expect(onAbrir).not.toHaveBeenCalled()
  })

  it('conserva el asa para reordenar un evento sin hora', () => {
    const onMover = vi.fn()
    render(<EventoBitacoraFila evento={evento({})} onAbrir={() => {}} onMover={onMover} compacta />)
    fireEvent.keyDown(screen.getByRole('button', { name: /Reordenar/ }), { key: 'ArrowUp' })
    expect(onMover).toHaveBeenCalledWith(-1)
  })

  it('un borrador dice «En redacción» y no lleva tipo', () => {
    render(<EventoBitacoraFila evento={evento({ estado: 'borrador' })} onAbrir={() => {}} compacta />)
    expect(screen.getByText(/^En redacción · /)).toBeTruthy()
  })
})
