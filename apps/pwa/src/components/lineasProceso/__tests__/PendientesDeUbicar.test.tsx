import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PendientesDeUbicar, type OpcionUbicar } from '../PendientesDeUbicar'
import type { EquipoPendiente } from '@/services/lineasProceso/pendientesDeUbicar'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

afterEach(cleanup)

/**
 * El caso real (Orel, 21-09-2026): «baader 143» escrito a mano, que era la BAADER 142 N1. Desde
 * la bandeja del editor se elige el equipo real y se corrigen todos sus eventos de una vez.
 */
const evento = (id: string, descripcion: string): EventoBitacora =>
  ({ id, plantId: 'chonchi', turnoId: '2026-09-21_noche', fechaTurno: '2026-09-21', banda: 'noche', tipo: 'correctivo', equipo: 'baader 143', equipoId: null, descripcion, pendiente: false, fotos: [], registradoPor: 'Danilo' }) as unknown as EventoBitacora

const grupo: EquipoPendiente = { clave: 'baader 143', nombre: 'baader 143', ultimo: '2026-09-21', eventos: [evento('1', 'Cuchillo trabado'), evento('2', 'Ajuste de guías')] }
const opciones: OpcionUbicar[] = [
  { id: 'n1', nombre: 'EVISCERADORA BAADER 142 N1', codigo: '720004410', ruta: 'Eviscerado', peso: 1 / 3 },
  { id: 'g1', nombre: 'GRADER MS4', codigo: '720004980', ruta: 'Emparrillado', peso: 1 },
]

function pintar(grupos: EquipoPendiente[] = [grupo]) {
  const props = { grupos, opciones, onElegir: vi.fn(), onCrearManual: vi.fn(), onDescartar: vi.fn() }
  render(<PendientesDeUbicar {...props} />)
  return props
}

describe('la bandeja de nombrados a mano', () => {
  it('lista cada nombre con cuántos eventos y el último', () => {
    pintar()
    expect(screen.getByRole('button', { name: /baader 143.*2 eventos.*21-09/i })).toBeTruthy()
  })

  it('abrir un nombre muestra sus eventos y las tres salidas', () => {
    pintar()
    fireEvent.click(screen.getByRole('button', { name: /baader 143/i }))
    expect(screen.getByText(/Cuchillo trabado/)).toBeTruthy()
    expect(screen.getByLabelText(/es este equipo/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /crear elemento manual/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /no es un equipo/i })).toBeTruthy()
  })

  it('la búsqueda casa todas las palabras en cualquier orden, y elegir corrige el grupo entero', () => {
    const { onElegir } = pintar()
    fireEvent.click(screen.getByRole('button', { name: /baader 143/i }))
    fireEvent.change(screen.getByLabelText(/es este equipo/i), { target: { value: '142 baader' } })
    expect(screen.queryByText('GRADER MS4')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /EVISCERADORA BAADER 142 N1/ }))
    expect(onElegir).toHaveBeenCalledWith(grupo, { id: 'n1', nombre: 'EVISCERADORA BAADER 142 N1', codigo: '720004410' })
  })

  it('la pista dice si ya está en el diagrama y con cuánto', () => {
    pintar()
    fireEvent.click(screen.getByRole('button', { name: /baader 143/i }))
    fireEvent.change(screen.getByLabelText(/es este equipo/i), { target: { value: 'baader' } })
    expect(screen.getByText(/en el diagrama, 33 %/)).toBeTruthy()
  })

  it('«no es un equipo» y «crear manual» avisan con el nombre tal cual', () => {
    const { onDescartar, onCrearManual } = pintar()
    fireEvent.click(screen.getByRole('button', { name: /baader 143/i }))
    fireEvent.click(screen.getByRole('button', { name: /no es un equipo/i }))
    expect(onDescartar).toHaveBeenCalledWith(grupo)
    fireEvent.click(screen.getByRole('button', { name: /crear elemento manual/i }))
    expect(onCrearManual).toHaveBeenCalledWith('baader 143')
  })

  it('sin pendientes lo dice, sin inventar', () => {
    pintar([])
    expect(screen.getByText(/Ninguno: todo lo escrito en la bitácora/)).toBeTruthy()
  })

  /** HIG «Boxes»: filas con filete dentro de la tarjeta de la bandeja, no tarjetas rellenas. */
  it('las filas son de lista, no tarjetas dentro de la tarjeta', () => {
    pintar()
    const fila = screen.getByRole('button', { name: /baader 143/i })
    expect(fila.className).not.toMatch(/bg-|rounded-ctl/)
    expect(fila.parentElement?.className).toMatch(/border-b/)
  })
})
