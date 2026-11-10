// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/store', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { isAuthenticated: false, user: null }
      return sel ? sel(s) : s
    },
    { getState: () => ({ user: null }) },
  ),
  usePermissionsStore: () => ({ canSee: () => true }),
}))
vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => true }))
vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({ useRepuestosByCodigos: () => ({ data: [], resueltos: new Map(), isLoading: false }) }))
vi.mock('@/hooks/repuestos/useMarkedCommonParts', () => ({ useMarkedCommonParts: () => ({ parts: [] }) }))
const caso = (id: string, title: string, solution: string) => ({ id, title, symptom: '', possibleCauses: ['Causa de ' + id], solution, createdAt: 0, updatedAt: 0 })
vi.mock('@/services/learningContent', () => ({
  getMachineContentMeta: async () => ({ manual: 6, procedures: 10, flows: 6, diagnosis: 3, lastUpdatedAt: 0 }),
  listProcedures: async () => [], listManualSections: async () => [], listFlows: async () => [],
  listQuiz: async () => [], listGlossary: async () => [], listBibliografia: async () => [],
  listDiagnosis: async () => [
    caso('a', 'Códigos de error E77x', 'Identificar el código.'),
    caso('b', 'Esófago queda demasiado largo', 'Afilar la membrana.'),
    caso('c', 'E 770', 'El manual no entrega una solución separada para esta fila.'),
  ],
}))

import { MachineLearningPage } from '../MachineLearningPage'

afterEach(cleanup)

describe('Ficha de máquina en PC', () => {
  it('pestañas con su recuento y Diagnóstico como lista + caso', async () => {
    render(
      <MemoryRouter initialEntries={['/aprendizaje/maquina/baader-142']}>
        <Routes><Route path="/aprendizaje/maquina/:slug" element={<MachineLearningPage />} /></Routes>
      </MemoryRouter>,
    )
    const pestana = await screen.findByRole('button', { name: /^Diagnóstico\s*3$/ })
    // En PC no hay hoja «Sección ▾» ni portada: la barra la reemplaza.
    expect(screen.queryByRole('button', { name: /^Sección/ })).toBeNull()
    fireEvent.click(pestana)

    expect(await screen.findByRole('heading', { level: 3, name: 'Códigos de error E77x' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Síntomas' })).toBeTruthy()
    expect(screen.getByText(/1 sin solución del fabricante/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Esófago queda demasiado largo/ }))
    expect(screen.getByRole('heading', { level: 3, name: 'Esófago queda demasiado largo' })).toBeTruthy()
    expect(screen.getByText('Afilar la membrana.')).toBeTruthy()
  })
})
