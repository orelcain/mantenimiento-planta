// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DetalleExpedientePC } from '../DetalleExpedientePC'

afterEach(cleanup)

// «Qué se repite», Chonchi, últimos 10 turnos hasta el turno 2 del 6-11-2026; la misma estructura que dibuja AnalisisV2.
const cuerpo = (
  <div className="an-d">
    <div className="an-d-resp"><div className="an-d-resp-t">Falta MMPP Logistica quitó más (3 h 9 min, en 2 turnos).</div></div>
    <div className="an-d-sec"><h4><span className="an-d-n">1</span>Lo que más tiempo quitó</h4><p>Falta MMPP Logistica</p></div>
    <div className="an-d-sec"><h4><span className="an-d-n">2</span>Lo que vuelve cada turno</h4><p>Micro Detencion</p></div>
    <div className="an-d-sec"><h4><span className="an-d-n">3</span>Lo de Mantención entre las causas</h4><p>CINTAS (MECANICA)</p></div>
  </div>
)

const abrir = () => render(
  <DetalleExpedientePC abierto titulo="¿Qué causa nos quita más tiempo y cuál vuelve siempre?" sub="Últimos 10 turnos · 5 h 53 min perdidas ≈ 13.582 pz" onClose={() => {}}>
    {cuerpo}
  </DetalleExpedientePC>,
)

describe('detalle de Análisis en PC como expediente', () => {
  it('la pregunta y su contexto van al costado', () => {
    abrir()
    const costado = within(screen.getByRole('complementary', { name: 'La pregunta' }))
    expect(costado.getByText('¿Qué causa nos quita más tiempo y cuál vuelve siempre?')).toBeTruthy()
    expect(costado.getByText(/5 h 53 min perdidas/)).toBeTruthy()
  })

  it('el índice sale de las secciones del detalle, sin su número', () => {
    abrir()
    const indice = within(screen.getByRole('navigation', { name: 'Secciones' }))
    expect(indice.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1Lo que más tiempo quitó',
      '2Lo que vuelve cada turno',
      '3Lo de Mantención entre las causas',
    ])
  })

  it('tocar una sección del índice lleva a ella', () => {
    abrir()
    const h4 = screen.getByText('Lo que vuelve cada turno', { selector: 'h4' })
    const ir = vi.fn()
    h4.scrollIntoView = ir
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('button', { name: /Lo que vuelve cada turno/ }))
    expect(ir).toHaveBeenCalledTimes(1)
  })

  it('con una sola sección no hay índice', () => {
    render(
      <DetalleExpedientePC abierto titulo="¿Cuánto pesa Mantención?" onClose={() => {}}>
        <div className="an-d"><div className="an-d-sec"><h4><span className="an-d-n">1</span>La comparación</h4></div></div>
      </DetalleExpedientePC>,
    )
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull()
  })
})
