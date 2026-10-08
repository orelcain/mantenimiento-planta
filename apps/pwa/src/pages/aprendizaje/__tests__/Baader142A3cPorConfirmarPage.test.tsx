// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { PartesPlano, ParteFisica } from '@/hooks/usePartesPlano'
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'
import { useAuthStore } from '@/store/authStore'
import { Baader142A3cPorConfirmarPage } from '../Baader142A3cPorConfirmarPage'

const mocks = vi.hoisted(() => ({
  partes: null as unknown,
  vinculos: new Map<string, unknown>(),
}))

vi.mock('@/hooks/usePartesPlano', () => ({ usePartesPlano: () => mocks.partes }))
vi.mock('@/hooks/usePlanoVinculos', () => ({
  usePlanoVinculos: () => ({
    vinculos: mocks.vinculos,
    confirmar: vi.fn(async () => {}),
    subirFoto: vi.fn(async () => 'https://foto'),
    resumen: { confirmados: 0, corregidos: 0, total: 0 },
    error: null,
  }),
}))
vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({
  useRepuestosByCodigos: () => ({ bySap: new Map(), loading: false }),
}))
vi.mock('@/data/baader142A3c', () => ({
  cargarA3c: async () => ({
    dibujo: {},
    datos: {
      elementos: {
        SM5: { es: 'motor paso a paso' }, B5: { es: 'sensor' }, B25: { es: 'encoder' },
        B1: { es: 'sensor B1' }, B2: { es: 'sensor B2' }, 'A3C.P1': { es: 'pseudo' }, X5: { es: 'regleta' },
      },
    },
  }),
}))

const pieza = (extra: Partial<ParteFisica> = {}): ParteFisica => ({
  nr: '41702013', es: 'Motor paso a paso', de: 'SM', fig: '70-1', hoja: 80, pos: 'SM5', confianza: 'catalogo', ...extra,
})
const partesBase = (): PartesPlano => ({
  despiece: 'baader-142-despiece',
  aparatos: { SM5: [pieza()], B1: [pieza({ nr: '42303109', pos: 'B1' })] },
  familias: {},
})

function Ruta() {
  const l = useLocation()
  return <output data-testid="ruta">{l.pathname + l.search}</output>
}
const montar = (url = '/aprendizaje/baader-142/tarjeta-a3c/por-confirmar') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Baader142A3cPorConfirmarPage />
      <Ruta />
    </MemoryRouter>,
  )

const mediaPc = (pc: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: pc && q.includes('min-width'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
// happy-dom: `window.matchMedia` es la que lee el componente.
const fijarMedia = (pc: boolean) => {
  mediaPc(pc)
  window.matchMedia = globalThis.matchMedia
}

beforeEach(() => {
  mocks.partes = partesBase()
  mocks.vinculos = new Map()
  useAuthStore.setState({ isAuthenticated: true })
  fijarMedia(false)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Baader142A3cPorConfirmarPage', () => {
  it('cabecera, KPI y grupos con conteos', async () => {
    mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([
      ['B1', { estado: 'confirmado', codigo: '42303109', confirmadoPorNombre: 'Ana' }],
    ])
    montar()
    expect(screen.getByText('Por confirmar en terreno')).toBeTruthy()
    await screen.findByText(/1 · Excavador B/)
    const kpi = screen.getByTestId('kpi-por-confirmar').textContent ?? ''
    expect(kpi).toContain('de 14 prioritarios confirmados')
    expect(kpi).toContain('1 de 5 en todo el plano')
    expect(kpi).toContain('Plano 888 · N2 y N3')
    expect(screen.getByText(/5 episodios · 0\/3/)).toBeTruthy()
    expect(screen.getByText(/N1 corrige pasos perdidos/)).toBeTruthy()
    expect(screen.getByText('Resto')).toBeTruthy()
    expect(screen.getByText(/2 elementos · 1 confirmados/)).toBeTruthy()
  })

  it('fila pendiente muestra lectura y candidatos en vivo; confirmada, código · quién', async () => {
    mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([
      ['B1', { estado: 'confirmado', codigo: '42303109', confirmadoPorNombre: 'Ana' }],
    ])
    montar()
    await screen.findByTestId('fila-SM5')
    const sm5 = screen.getByTestId('fila-SM5').textContent ?? ''
    expect(sm5).toContain('Leer placa del motor')
    expect(sm5).toContain('41702013')
    expect(sm5).toContain('Pendiente')
    expect(screen.getByTestId('fila-B5').textContent).toContain('Candidatos en la ficha')
    const b1 = screen.getByTestId('fila-B1').textContent ?? ''
    expect(b1).toContain('Confirmado')
    expect(b1).toContain('42303109 · Ana')
  })

  it('sin sesión no afirma confirmaciones', async () => {
    useAuthStore.setState({ isAuthenticated: false })
    mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([['SM5', { estado: 'confirmado' }]])
    montar()
    await screen.findByTestId('fila-SM5')
    expect(screen.getByText('Inicia sesión para ver lo confirmado')).toBeTruthy()
    expect(screen.queryByText('Confirmado')).toBeNull()
    expect(screen.getByTestId('fila-SM5').textContent).toContain('Pendiente')
  })

  it('teléfono: tocar una fila abre el Sheet con la ficha y deja ?el=', async () => {
    montar()
    fireEvent.click(await screen.findByTestId('fila-SM5'))
    await waitFor(() => expect(screen.getByTestId('ruta').textContent).toContain('?el=SM5'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('repuesto-a3c')).toBeTruthy()
  })

  it('PC: selecciona la primera pendiente y muestra su ficha en el panel; otra fila cambia la ficha', async () => {
    fijarMedia(true)
    mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([['SM5', { estado: 'confirmado' }]])
    montar()
    const panel = await screen.findByTestId('panel-ficha')
    expect(panel.textContent).toContain('B5')
    expect(screen.getByTestId('fila-B5').getAttribute('aria-current')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('fila-B1'))
    await waitFor(() => expect(screen.getByTestId('panel-ficha').textContent).toContain('B1'))
    expect(screen.getByTestId('repuesto-a3c')).toBeTruthy()
  })

  it('?el= abre ese elemento directamente', async () => {
    fijarMedia(true)
    montar('/aprendizaje/baader-142/tarjeta-a3c/por-confirmar?el=SM5')
    const panel = await screen.findByTestId('panel-ficha')
    expect(panel.textContent).toContain('SM5')
  })

  it('?el= con un código que no está en la lista se ignora y vale la primera pendiente', async () => {
    fijarMedia(true)
    montar('/aprendizaje/baader-142/tarjeta-a3c/por-confirmar?el=B999')
    const panel = await screen.findByTestId('panel-ficha')
    expect(panel.textContent).not.toContain('B999')
    expect(panel.textContent).toContain('SM5')
  })
})
