// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/store', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { isAuthenticated: true, user: { rol: 'tecnico' } }
      return sel ? sel(s) : s
    },
    { getState: () => ({ user: { rol: 'tecnico' } }) },
  ),
  usePermissionsStore: () => ({ canSee: () => true }),
}))
vi.mock('@/services/incidents', () => ({ getIncidents: async () => [], resolveIncident: async () => {} }))
vi.mock('@/services/variadoresAportes', () => ({ crearAporte: async () => {}, aportesDePosicion: async () => [] }))
vi.mock('@/services/learningContent', () => ({
  listProcedures: async () => [], listManualSections: async () => [], listFlows: async () => [],
  listDiagnosis: async () => [], listQuiz: async () => [], listGlossary: async () => [], listBibliografia: async () => [],
}))
vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({ useRepuestosByCodigos: () => ({ data: [], resueltos: new Map(), isLoading: false }) }))
vi.mock('@/hooks/repuestos/useMarkedCommonParts', () => ({ useMarkedCommonParts: () => ({ parts: [] }) }))

import { VariadoresPage } from '../VariadoresPage'
import { MachineLearningPage } from '../MachineLearningPage'

beforeEach(() => {
  window.history.replaceState({ idx: 0 }, '')
  window.scrollTo = (() => {}) as typeof window.scrollTo
})
afterEach(cleanup)

describe('Variadores · una sola forma de pestañas', () => {
  it('las cuatro vistas son un SegmentedControl de 48 px (Modelo · Equipo · Parámetro · Marcas)', () => {
    render(
      <MemoryRouter initialEntries={['/aprendizaje/variadores']}>
        <VariadoresPage />
      </MemoryRouter>,
    )
    const lista = screen.getByRole('tablist', { name: 'Vista' })
    expect(lista.className).toContain('h-[48px]')
    const rotulos = Array.from(lista.querySelectorAll('[role="tab"]')).map((t) => t.textContent)
    expect(rotulos).toEqual(['Modelo', 'Equipo', 'Parámetro', 'Marcas'])
    fireEvent.click(screen.getByRole('tab', { name: 'Marcas' }))
    expect(screen.getByRole('tab', { name: 'Marcas' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('Ficha de máquina · «Sección ▾»', () => {
  it('abre un Sheet con las secciones y elegir una cambia la sección activa', () => {
    render(
      <MemoryRouter initialEntries={['/aprendizaje/maquina/baader-142']}>
        <Routes><Route path="/aprendizaje/maquina/:slug" element={<MachineLearningPage />} /></Routes>
      </MemoryRouter>,
    )
    const selector = screen.getByRole('button', { name: /^Sección/ })
    fireEvent.click(selector)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Procedimientos/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Procedimientos' })).toBeTruthy()
  })
})
