import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { TurnoJK } from '@/services/shoplogix/jackKnife'
import { EscogerDetencionSheet } from '../EscogerDetencionSheet'

afterEach(cleanup)

function turno(id: string, dateKey: string, eventos: [string, number, number][], comentarios: [string, number, string][] = []): TurnoJK {
  return {
    id,
    dateKey,
    shiftId: 'Turno 2',
    resumen: { v: 1, eventos, sinImputar: [], sinImputarLinea: [], comentarios, conCausaMin: 0, sinCausaMin: 0, uptimeMin: 480 },
  }
}

const CAUSA = 'Empaquetadura Rota'

// Cinco detenciones de la causa (la ventana completa), tres comentarios con el mismo texto.
const TURNOS: TurnoJK[] = [
  turno('t1', '2026-09-21', [[CAUSA, 1000, 134]], [[CAUSA, 1000, 'Rotura Chapaleta']]),
  turno('t2', '2026-09-17', [[CAUSA, 2000, 60]], [[CAUSA, 2000, 'Empaquetadura Rota']]),
  turno('t3', '2026-09-09', [[CAUSA, 3000, 51]], [[CAUSA, 3000, 'Empaquetadura Rota']]),
  turno('t4', '2026-08-30', [[CAUSA, 4000, 40]], [[CAUSA, 4000, 'Empaquetadura Rota']]),
  turno('t5', '2026-08-20', [[CAUSA, 5000, 25]], []),
]

function abrir(onSeguir = vi.fn()) {
  render(
    <EscogerDetencionSheet
      open
      onClose={() => {}}
      causa={CAUSA}
      turnos={TURNOS}
      desde={0}
      hasta={TURNOS.length - 1}
      onSeguir={onSeguir}
    />,
  )
  return onSeguir
}

const radios = () => screen.getAllByRole('radio')

describe('EscogerDetencionSheet', () => {
  it('muestra las 4 más largas, con la primera elegida', () => {
    abrir()
    const lista = radios()
    expect(lista).toHaveLength(4)
    expect(lista[0]!.getAttribute('aria-checked')).toBe('true')
    expect(within(lista[0]!).getByText('134 min')).toBeTruthy()
    expect(within(lista[0]!).getByText('Rotura Chapaleta')).toBeTruthy()
    expect(screen.getByText('¿Cuál detención analizamos?')).toBeTruthy()
  })

  it('con más de 4 ofrece «Ver las N» y la nota del período', () => {
    abrir()
    expect(screen.getByRole('button', { name: 'Ver las 5' })).toBeTruthy()
    expect(screen.getByText('Las 4 más largas de 5 en este período.')).toBeTruthy()
  })

  it('«Ver las N» muestra todas las detenciones', () => {
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Ver las 5' }))
    expect(radios()).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'Ver las 5' })).toBeNull()
  })

  it('nota: un comentario repetido 2 veces o más se dice con su número', () => {
    abrir()
    expect(screen.getByText('«Empaquetadura Rota» se repite 3 veces.')).toBeTruthy()
  })

  it('cambiar la elección y «Seguir» entrega esa detención', () => {
    const onSeguir = abrir()
    fireEvent.click(radios()[2]!)
    expect(radios()[0]!.getAttribute('aria-checked')).toBe('false')
    expect(radios()[2]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(onSeguir).toHaveBeenCalledTimes(1)
    expect(onSeguir.mock.calls[0]![0]).toMatchObject({ turnoId: 't3', min: 51, inicioMs: 3000 })
  })

  it('el resumen «Pasa al análisis» sigue a la elección', () => {
    abrir()
    fireEvent.click(radios()[1]!)
    expect(screen.getAllByText('17-09-2026').length).toBeGreaterThan(0)
    expect(screen.queryByText('21-09-2026')).toBeNull()
    expect(screen.getByText('Qué se rompió')).toBeTruthy()
  })
})
