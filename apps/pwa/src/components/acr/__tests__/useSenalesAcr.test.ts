import { describe, expect, it, vi } from 'vitest'
import type { Acr, AccionAcr } from '@/services/acr/acr.types'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import type { EventoRepeticion } from '@/services/acr/repeticion'
import { MAX_IDS_POR_CONSULTA, trocear } from '@/services/acr/acrLogica'

// El hook importa Firestore; la función pura no lo necesita.
vi.mock('@/services/acr/acrFirestore', () => ({
  escucharAcrDeEventos: vi.fn(),
  listarEventosRecientes: vi.fn(),
}))

import { calcularSenales } from '../useSenalesAcr'

/** Casos de 24-09-2026 (mismos eventos que `repeticion.test.ts`). */
const HOY = new Date(2026, 8, 24)

const N1 = {
  id: 'n1',
  tipo: 'falla',
  equipo: 'EVISCERADORA BAADER 142 N1',
  descripcion: 'Se corta resorte ingreso chapaleta baader 1. Se reemplaza y normaliza',
  fechaTurno: '2026-09-24',
  minutosParada: 7,
} as EventoBitacora

const N2: EventoRepeticion = {
  id: 'n2',
  equipo: 'EVISCERADORA BAADER 142 N2',
  descripcion: 'Se corta resorte ingreso chapaleta baader 2. Se reemplaza y normaliza',
  fechaTurno: '2026-09-24',
  minutosParada: 8,
}

const SIN_REPETIR = {
  id: 'solo',
  tipo: 'falla',
  equipo: 'KNURO N1',
  descripcion: 'Pusher con golpes irregulares',
  fechaTurno: '2026-09-24',
  minutosParada: 15,
} as EventoBitacora

const accion = (fuerza: AccionAcr['fuerza']): AccionAcr => ({
  id: `a-${fuerza}-${Math.random()}`,
  texto: 'x',
  fuerza,
  causaId: 'c1',
  responsable: '',
  fechaLimite: null,
  estado: 'pendiente',
} as AccionAcr)

function acrDe(id: string, eventoIds: string[], creado: number, acciones: AccionAcr[]): Acr {
  return { id, eventoBitacoraIds: eventoIds, createdAt: new Date(creado), acciones } as Acr
}

describe('trocear (tandas de 30 ids para array-contains-any)', () => {
  it('el límite es 30', () => {
    expect(MAX_IDS_POR_CONSULTA).toBe(30)
  })

  it('sin ids no hay tandas', () => {
    expect(trocear([])).toEqual([])
  })

  it('hasta 30 ids van en una sola tanda', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `e${i}`)
    expect(trocear(ids)).toEqual([ids])
  })

  it('31 ids → tandas de 30 y 1', () => {
    const ids = Array.from({ length: 31 }, (_, i) => `e${i}`)
    const tandas = trocear(ids)
    expect(tandas.map((t) => t.length)).toEqual([30, 1])
    expect(tandas.flat()).toEqual(ids)
  })

  it('61 ids → 30, 30 y 1, sin perder ni repetir ninguno', () => {
    const ids = Array.from({ length: 61 }, (_, i) => `e${i}`)
    const tandas = trocear(ids)
    expect(tandas.map((t) => t.length)).toEqual([30, 30, 1])
    expect(tandas.flat()).toEqual(ids)
  })
})

describe('calcularSenales', () => {
  it('una falla con detención sin repetición ni análisis no tiene señal', () => {
    const mapa = calcularSenales([SIN_REPETIR], [], [], HOY)
    expect(mapa.has('solo')).toBe(false)
  })

  it('solo cuentan los eventos que aplicaAnalisis (falla o correctivo con detención)', () => {
    const novedad = { ...N1, id: 'nov', tipo: 'novedad' } as EventoBitacora
    const sinParada = { ...N1, id: 'sin', minutosParada: null } as EventoBitacora
    const mapa = calcularSenales([novedad, sinParada], [N2], [], HOY)
    expect(mapa.size).toBe(0)
  })

  it('se repite: la señal trae la repetición y N incluye el evento actual', () => {
    const mapa = calcularSenales([N1], [N2], [], HOY)
    const senal = mapa.get('n1')
    expect(senal?.tipo).toBe('repite')
    if (senal?.tipo !== 'repite') return
    expect(senal.repeticion.eventoIds).toContain('n1')
    expect(senal.repeticion.eventoIds.length).toBe(2)
  })

  it('analizado gana sobre repetición', () => {
    const acr = acrDe('acr-1', ['n1'], 1000, [accion('fuerte'), accion('debil')])
    const mapa = calcularSenales([N1], [N2], [acr], HOY)
    expect(mapa.get('n1')).toEqual({ tipo: 'analizado', acr })
  })

  it('si hay varios ACR del evento, manda el más reciente', () => {
    const viejo = acrDe('viejo', ['n1'], 1000, [])
    const nuevo = acrDe('nuevo', ['n1'], 5000, [accion('fuerte')])
    const mapa = calcularSenales([N1], [], [viejo, nuevo], HOY)
    const senal = mapa.get('n1')
    expect(senal?.tipo === 'analizado' && senal.acr.id).toBe('nuevo')
  })

  it('un ACR de otro evento no cuenta', () => {
    const otro = acrDe('otro', ['x-9'], 1000, [])
    const mapa = calcularSenales([N1], [], [otro], HOY)
    expect(mapa.has('n1')).toBe(false)
  })
})
