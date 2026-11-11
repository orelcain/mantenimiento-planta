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
vi.mock('@/services/learningContent', () => ({ getMachineContentMeta: async () => ({ manual: 6, procedures: 10, flows: 6, diagnosis: 29, lastUpdatedAt: 0 }),
  listProcedures: async () => [], listManualSections: async () => [], listFlows: async () => [],
  listDiagnosis: async () => [], listQuiz: async () => [], listGlossary: async () => [], listBibliografia: async () => [],
}))
vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({ useRepuestosByCodigos: () => ({ data: [], resueltos: new Map(), isLoading: false }) }))
vi.mock('@/hooks/repuestos/useMarkedCommonParts', () => ({ useMarkedCommonParts: () => ({ parts: [] }) }))
// happy-dom mide 1024 px (= PC); esta suite prueba la vista de celular.
vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => false }))

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

describe('Ficha de máquina en celular · pestañas en la barra', () => {
  it('sin hoja «Sección ▾»: las pestañas cambian la sección activa', () => {
    render(
      <MemoryRouter initialEntries={['/aprendizaje/maquina/baader-142']}>
        <Routes><Route path="/aprendizaje/maquina/:slug" element={<MachineLearningPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /^Sección/ })).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'Secciones' })
    const proced = Array.from(nav.querySelectorAll('button')).find(b => b.textContent?.startsWith('Proced'))!
    fireEvent.click(proced)
    expect(proced.getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('heading', { level: 1, name: /Baader 142/ })).toBeTruthy()
  })
})
