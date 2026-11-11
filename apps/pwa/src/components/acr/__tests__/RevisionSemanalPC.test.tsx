// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AccionAcr, Acr } from '@/services/acr/acr.types'

vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => true }))
vi.mock('@/services/acr/acrFirestore', () => ({ guardarAcr: vi.fn() }))

import { RevisionSemanalSheet } from '../RevisionSemanalSheet'

const accion = (id: string, fuerza: AccionAcr['fuerza'], extra: Partial<AccionAcr> = {}): AccionAcr => ({
  id, texto: `Acción ${id}`, fuerza, causaId: null, responsable: 'Eléctrico', fechaLimite: '2099-01-01', estado: 'pendiente', ...extra,
})
const acr = (id: string, acciones: AccionAcr[], extra: Partial<Acr> = {}) => ({
  id, equipo: 'BAADER 200', definicion: `Falla ${id}`, fechaTurno: '2026-09-24', minutosDetencion: 6, acciones, ...extra,
}) as unknown as Acr

const ACRS = [
  acr('fuerte', [accion('f1', 'fuerte')], { minutosDetencion: null }),
  acr('debil', [accion('m1', 'media', { responsable: '' }), accion('d1', 'debil', { fechaLimite: '2020-01-01' })], { equipo: 'EVISCERADORA BAADER 142 N1' }),
]

function montar(puedeEditar = true) {
  const onGuardar = vi.fn<(a: Acr) => void>()
  render(<RevisionSemanalSheet open onClose={vi.fn()} acrs={ACRS} periodo="21-09-2026 → 27-09-2026" puedeEditar={puedeEditar} onGuardar={onGuardar} />)
  return { onGuardar }
}

afterEach(() => cleanup())

describe('Revisión semanal en PC', () => {
  it('titula con el porcentaje y el período', () => {
    montar()
    expect(screen.getByText('33 % de las acciones son fuertes')).toBeTruthy()
    expect(screen.getByText('21-09-2026 → 27-09-2026 · 3 acciones en 2 análisis')).toBeTruthy()
  })

  it('agrupa por falla, con la más débil primero y sus acciones ordenadas', () => {
    montar()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Falla debil', 'Falla fuerte'])
    const textos = screen.getAllByText(/^Acción /).map((e) => e.textContent)
    expect(textos).toEqual(['Acción d1', 'Acción m1', 'Acción f1'])
    expect(screen.getByText('EVISCERADORA BAADER 142 N1 · 6 min · 24-09')).toBeTruthy()
    expect(screen.getByText('BAADER 200 · 24-09')).toBeTruthy()
  })

  it('muestra vencida y sin asignar', () => {
    montar()
    expect(screen.getByText('Vencida')).toBeTruthy()
    expect(screen.getByText('Sin asignar')).toBeTruthy()
  })

  it('cambiar la fuerza guarda y actualiza el título', () => {
    const { onGuardar } = montar()
    const grupo = screen.getByRole('group', { name: 'Fuerza de la acción: Acción d1' })
    fireEvent.click(grupo.querySelectorAll('button')[2]!)
    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(onGuardar.mock.calls[0]![0].acciones.find((a) => a.id === 'd1')!.fuerza).toBe('fuerte')
    expect(screen.getByText('67 % de las acciones son fuertes')).toBeTruthy()
  })

  it('elegir la fuerza que ya tiene no guarda', () => {
    const { onGuardar } = montar()
    const grupo = screen.getByRole('group', { name: 'Fuerza de la acción: Acción d1' })
    fireEvent.click(grupo.querySelectorAll('button')[0]!)
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('quien solo lee no tiene selector', () => {
    montar(false)
    expect(screen.queryByRole('group', { name: /Fuerza de la acción/ })).toBeNull()
    expect(screen.getByText('Solo lectura: la fuerza la cambia un supervisor.')).toBeTruthy()
  })

  it('conserva los anclajes del tutorial una sola vez', () => {
    montar()
    expect(document.querySelectorAll('[data-tutorial="t-revision"]').length).toBe(1)
    expect(document.querySelectorAll('[data-tutorial="t-rev-fila"]').length).toBe(1)
  })
})
