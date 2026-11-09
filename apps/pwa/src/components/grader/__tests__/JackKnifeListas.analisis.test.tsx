import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { JackKnifeListas } from '../JackKnifeListas'
import type { CalculoJK } from '@/services/shoplogix/jackKnife'
import type { ResumenCausaJK } from '@/services/acr/acrHistorial'
import type { Acr } from '@/services/acr/acr.types'

afterEach(cleanup)

// Un turno vacío: `comentariosDe` lee el resumen del turno de la ventana.
const TURNOS = [
  {
    id: '2026-09-24_Turno 1',
    dateKey: '2026-09-24',
    shiftId: 'Turno 1',
    resumen: { v: 1, eventos: [], sinImputar: [], sinImputarLinea: [], comentarios: [], conCausaMin: 0, sinCausaMin: 0, uptimeMin: 480 },
  },
] as unknown as import('@/services/shoplogix/jackKnife').TurnoJK[]

// Pernos / Resortes es de nivel 1 (agudas y crónicas): aparece en «Atacar ahora».
const CALC: CalculoJK = {
  pts: [
    { k: 'Pernos / Resortes', ev: 25, min: 300, mttr: 12, q: 'amb' },
    { k: 'Lógica', ev: 3, min: 30, mttr: 10, q: 'ok' },
  ],
  N: 28,
  D: 330,
  un: 10,
  um: 10,
  cob: null,
  barras: [],
  desde: 0,
  hasta: 0,
}

const acr = (id: string, estado: Acr['estado']): Acr =>
  ({
    id,
    equipo: 'EVISCERADORA BAADER 142 N1',
    definicion: 'Se corta resorte ingreso chapaleta',
    estado,
    fechaTurno: '2026-09-24',
    acciones: [],
    causas: [],
    evidencias: [],
    verificacion: { criterio: '', dias: 30, resultado: 'pendiente' },
  }) as unknown as Acr

const ANALISIS = new Map<string, ResumenCausaJK>([
  ['Pernos / Resortes', { total: 2, fuertesHechas: 1, acrs: [acr('a1', 'cerrado'), acr('a2', 'borrador')] }],
])

describe('JackKnifeListas con análisis de causa raíz', () => {
  it('«Atacar ahora» marca la causa con su estado de análisis', () => {
    render(
      <MemoryRouter>
        <JackKnifeListas calc={CALC} informe={null} turnos={TURNOS} analisis={ANALISIS} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Acción fuerte hecha')).toBeTruthy()
  })

  it('sin análisis en la causa muestra «Sin análisis»', () => {
    render(
      <MemoryRouter>
        <JackKnifeListas calc={CALC} informe={null} turnos={TURNOS} analisis={new Map()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Sin análisis')).toBeTruthy()
  })

  it('con causa seleccionada que tiene análisis muestra el resumen y sus filas', () => {
    render(
      <MemoryRouter>
        <JackKnifeListas calc={CALC} informe={null} turnos={TURNOS} analisis={ANALISIS} causaSel="Pernos / Resortes" />
      </MemoryRouter>,
    )
    expect(screen.getByText('2 análisis, 1 con acción fuerte hecha')).toBeTruthy()
    expect(screen.getAllByText('EVISCERADORA BAADER 142 N1').length).toBe(2)
  })

  it('sin análisis y sin props no agrega marcas (la lámina y Yal quedan igual)', () => {
    render(
      <MemoryRouter>
        <JackKnifeListas calc={CALC} informe={null} turnos={TURNOS} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Sin análisis')).toBeNull()
    expect(screen.queryByText(/análisis, /)).toBeNull()
  })
})
