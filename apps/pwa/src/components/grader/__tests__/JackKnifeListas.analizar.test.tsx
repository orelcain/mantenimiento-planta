import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { JackKnifeListas } from '../JackKnifeListas'
import type { CalculoJK, TurnoJK } from '@/services/shoplogix/jackKnife'
import type { ResumenCausaJK } from '@/services/acr/acrHistorial'

afterEach(cleanup)

const TURNOS = [
  {
    id: '2026-09-24_Turno 1',
    dateKey: '2026-09-24',
    shiftId: 'Turno 1',
    resumen: { v: 1, eventos: [], sinImputar: [], sinImputarLinea: [], comentarios: [], conCausaMin: 0, sinCausaMin: 0, uptimeMin: 480 },
  },
] as unknown as TurnoJK[]

// Las dos son de nivel 1: aparecen en «Atacar ahora».
const CALC: CalculoJK = {
  pts: [
    { k: 'Pernos / Resortes', ev: 25, min: 300, mttr: 12, q: 'amb' },
    { k: 'Atasco de envasado', ev: 22, min: 280, mttr: 13, q: 'amb' },
  ],
  N: 47,
  D: 580,
  un: 10,
  um: 10,
  cob: null,
  barras: [],
  desde: 0,
  hasta: 0,
}

const SIN_ANALISIS: ResumenCausaJK = { total: 0, fuertesHechas: 0, acrs: [] }
const ANALISIS = new Map<string, ResumenCausaJK>([
  ['Pernos / Resortes', { total: 2, fuertesHechas: 0, acrs: [] }],
  ['Atasco de envasado', SIN_ANALISIS],
])

function montar(props: { onAnalizar?: (causa: string) => void; analisis?: ReadonlyMap<string, ResumenCausaJK> }) {
  render(
    <MemoryRouter>
      <JackKnifeListas calc={CALC} informe={null} turnos={TURNOS} analisis={props.analisis} onAnalizar={props.onAnalizar} />
    </MemoryRouter>,
  )
}

describe('JackKnifeListas: «Analizar» en Atacar ahora', () => {
  it('muestra «Analizar» solo en la causa sin análisis y llama con su nombre', () => {
    const onAnalizar = vi.fn()
    montar({ onAnalizar, analisis: ANALISIS })
    const botones = screen.getAllByRole('button', { name: 'Analizar' })
    expect(botones).toHaveLength(1)
    fireEvent.click(botones[0]!)
    expect(onAnalizar).toHaveBeenCalledWith('Atasco de envasado')
  })

  it('sin onAnalizar no aparece el botón', () => {
    montar({ analisis: ANALISIS })
    expect(screen.queryByRole('button', { name: 'Analizar' })).toBeNull()
  })

  it('sin el mapa de análisis (lámina, Yal) tampoco aparece', () => {
    montar({ onAnalizar: () => {} })
    expect(screen.queryByRole('button', { name: 'Analizar' })).toBeNull()
  })
})
