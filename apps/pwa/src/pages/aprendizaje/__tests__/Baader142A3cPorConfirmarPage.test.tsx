// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { PartesPlano, ParteFisica } from '@/hooks/usePartesPlano'
import { useAuthStore } from '@/store/authStore'
import { Baader142A3cPorConfirmarPage } from '../Baader142A3cPorConfirmarPage'

const mocks = vi.hoisted(() => ({
  partes: null as unknown,
  /** docs de planoVinculos tal como los lee el hook (con `maquina`, o sin ella los viejos). */
  docs: [] as Record<string, unknown>[],
}))

vi.mock('@/hooks/usePartesPlano', () => ({ usePartesPlano: () => mocks.partes }))
// El hook real agrupa y filtra con las funciones puras de vinculoTerreno: se reusan acá.
vi.mock('@/hooks/usePlanoVinculos', async () => {
  const u = await vi.importActual<typeof import('@/utils/aprendizaje/vinculoTerreno')>('@/utils/aprendizaje/vinculoTerreno')
  return {
    usePlanoVinculos: (slug: string, maquina?: 'baader-n2' | 'baader-n3' | null) => {
      const porAparato = u.agruparVinculos(slug, mocks.docs as { aparato: string; maquina?: 'baader-n2' }[])
      const vinculos = new Map<string, unknown>()
      porAparato.forEach((e, aparato) => {
        const v = u.vinculoActivo(slug, e, maquina)
        if (v) vinculos.set(aparato, v)
      })
      return {
        vinculos,
        porAparato,
        confirmar: vi.fn(async () => {}),
        subirFoto: vi.fn(async () => 'https://foto'),
        resumen: { confirmados: 0, corregidos: 0, total: 0 },
        error: null,
      }
    },
  }
})
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
const RUTA = '/aprendizaje/baader-142/tarjeta-a3c/por-confirmar'
/** Un doc del 888 (N2 por defecto). `maquina: null` = confirmación vieja, sin máquina. */
const doc = (aparato: string, extra: Record<string, unknown> = {}, maquina: string | null = 'baader-n2') => ({
  id: `baader-142-888__${aparato}${maquina ? `__${maquina}` : ''}`,
  planoSlug: 'baader-142-888',
  aparato,
  ...(maquina ? { maquina } : {}),
  confirmadoPor: 'u1',
  ...extra,
})
const montar = (url = `${RUTA}?maquina=n2`) =>
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
  mocks.docs = []
  localStorage.clear()
  useAuthStore.setState({ isAuthenticated: true })
  fijarMedia(false)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Baader142A3cPorConfirmarPage', () => {
  it('cabecera, KPI y grupos con conteos', async () => {
    mocks.docs = [doc('B1', { estado: 'confirmado', codigo: '42303109', confirmadoPorNombre: 'Ana' })]
    montar()
    expect(screen.getByText('Por confirmar en terreno')).toBeTruthy()
    await screen.findByText(/1 · Excavador B/)
    const kpi = screen.getByTestId('kpi-por-confirmar').textContent ?? ''
    expect(kpi).toContain('de 14 prioritarios resueltos en N2')
    expect(kpi).toContain('N2: 1 de 5 en todo el plano')
    expect(kpi).toContain('Plano 888 · N2 y N3')
    expect(screen.getByText(/5 episodios · 0\/3 en N2/)).toBeTruthy()
    expect(screen.getByText(/N1 corrige pasos perdidos/)).toBeTruthy()
    expect(screen.getByText('Resto')).toBeTruthy()
    expect(screen.getByText(/2 elementos · 1 resueltos en N2/)).toBeTruthy()
  })

  it('fila pendiente muestra lectura y candidatos en vivo; confirmada, código · quién', async () => {
    mocks.docs = [doc('B1', { estado: 'confirmado', codigo: '42303109', confirmadoPorNombre: 'Ana' })]
    montar()
    await screen.findByTestId('fila-SM5')
    const sm5 = screen.getByTestId('fila-SM5').textContent ?? ''
    expect(sm5).toContain('Leer placa del motor')
    expect(sm5).toContain('41702013')
    expect(sm5).toContain('Pendiente')
    expect(sm5).toContain('N3: pendiente')
    expect(screen.getByTestId('fila-B5').textContent).toContain('Candidatos en la ficha')
    const b1 = screen.getByTestId('fila-B1').textContent ?? ''
    expect(b1).toContain('Confirmado')
    expect(b1).toContain('42303109 · Ana')
    expect(b1).toContain('N3: pendiente')
  })

  it('sin sesión no afirma confirmaciones', async () => {
    useAuthStore.setState({ isAuthenticated: false })
    mocks.docs = [doc('SM5', { estado: 'confirmado' })]
    montar()
    await screen.findByTestId('fila-SM5')
    expect(screen.getByText('Inicia sesión para ver lo confirmado')).toBeTruthy()
    expect(screen.queryByText('Confirmado')).toBeNull()
    expect(screen.getByTestId('fila-SM5').textContent).toContain('Pendiente')
    expect(screen.queryByTestId('selector-maquina')).toBeNull()
  })

  it('teléfono: tocar una fila abre el Sheet con la ficha y deja ?el=', async () => {
    montar()
    fireEvent.click(await screen.findByTestId('fila-SM5'))
    await waitFor(() => expect(screen.getByTestId('ruta').textContent).toContain('el=SM5'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('repuesto-a3c')).toBeTruthy()
  })

  it('PC: selecciona la primera pendiente y muestra su ficha en el panel; otra fila cambia la ficha', async () => {
    fijarMedia(true)
    mocks.docs = [doc('SM5', { estado: 'confirmado' })]
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
    montar(`${RUTA}?el=SM5&maquina=n2`)
    const panel = await screen.findByTestId('panel-ficha')
    expect(panel.textContent).toContain('SM5')
  })

  it('?el= con un código que no está en la lista se ignora y vale la primera pendiente', async () => {
    fijarMedia(true)
    montar(`${RUTA}?el=B999&maquina=n2`)
    const panel = await screen.findByTestId('panel-ficha')
    expect(panel.textContent).not.toContain('B999')
    expect(panel.textContent).toContain('SM5')
  })

  describe('máquina (N2 | N3)', () => {
    it('elegir una fila conserva ?maquina= (y el resto de la query)', async () => {
      montar(`${RUTA}?maquina=n3&x=1`)
      fireEvent.click(await screen.findByTestId('fila-SM5'))
      await waitFor(() => expect(screen.getByTestId('ruta').textContent).toContain('el=SM5'))
      const q = new URLSearchParams(screen.getByTestId('ruta').textContent?.split('?')[1])
      expect(q.get('maquina')).toBe('n3')
      expect(q.get('x')).toBe('1')
      expect(q.get('el')).toBe('SM5')
    })

    it('cerrar la ficha quita ?el= pero deja ?maquina=', async () => {
      montar(`${RUTA}?maquina=n2&el=SM5`)
      await screen.findByRole('dialog')
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => expect(screen.getByTestId('ruta').textContent).not.toContain('el=SM5'))
      expect(screen.getByTestId('ruta').textContent).toContain('maquina=n2')
    })

    it('cambiar de máquina mantiene el elemento y re-evalúa lo resuelto', async () => {
      fijarMedia(true)
      mocks.docs = [doc('B1', { estado: 'confirmado', codigo: '42303109', confirmadoPorNombre: 'Ana' }, 'baader-n2')]
      montar(`${RUTA}?maquina=n2&el=SM5`)
      await screen.findByTestId('panel-ficha')
      expect(screen.getByTestId('fila-B1').textContent).toContain('Confirmado')
      fireEvent.click(screen.getByRole('tab', { name: 'N3' }))
      await waitFor(() => expect(screen.getByTestId('ruta').textContent).toContain('maquina=n3'))
      expect(screen.getByTestId('ruta').textContent).toContain('el=SM5')
      const b1 = screen.getByTestId('fila-B1').textContent ?? ''
      expect(b1).toContain('Pendiente')
      expect(b1).toContain('N2: 42303109')
      expect(screen.getByTestId('kpi-por-confirmar').textContent).toContain('de 14 prioritarios resueltos en N3')
    })

    it('piezas distintas: la línea gris de la otra máquina dice «distinta» en azul', async () => {
      mocks.docs = [
        doc('B1', { estado: 'confirmado', codigo: '42303109' }, 'baader-n2'),
        doc('B1', { estado: 'confirmado', codigo: '42303107' }, 'baader-n3'),
        doc('B2', { estado: 'confirmado', codigo: '42303109' }, 'baader-n2'),
        doc('B2', { estado: 'confirmado', codigo: '42303109' }, 'baader-n3'),
      ]
      montar()
      await screen.findByTestId('fila-B1')
      const otraB1 = screen.getByTestId('otra-B1-N3')
      expect(otraB1.textContent).toBe('N3: 42303107, distinta')
      expect(otraB1.className).toContain('text-brand-ink')
      const otraB2 = screen.getByTestId('otra-B2-N3')
      expect(otraB2.textContent).toBe('N3: 42303109, igual')
      expect(otraB2.className).not.toContain('text-brand-ink')
    })

    it('KPI: barra de la máquina elegida y dos chicas (la otra y «En ambas»)', async () => {
      mocks.docs = [
        doc('SM5', { estado: 'confirmado' }, 'baader-n2'),
        doc('SM5', { estado: 'no_aplica' }, 'baader-n3'),
        doc('B5', { estado: 'confirmado' }, 'baader-n2'),
      ]
      montar()
      await screen.findByTestId('fila-SM5')
      const kpi = screen.getByTestId('kpi-por-confirmar').textContent ?? ''
      expect(kpi).toContain('2 de 14 prioritarios resueltos en N2')
      const otras = screen.getByTestId('kpi-otras').textContent ?? ''
      expect(otras).toContain('N3')
      expect(otras).toContain('En ambas1/14')
    })

    it('la confirmación vieja sin máquina no cuenta y la fila lo avisa', async () => {
      mocks.docs = [doc('SM5', { estado: 'confirmado', codigo: '41702013' }, null)]
      montar()
      await screen.findByTestId('fila-SM5')
      const sm5 = screen.getByTestId('fila-SM5').textContent ?? ''
      expect(sm5).toContain('Pendiente')
      expect(sm5).toContain('antes sin indicar máquina')
      expect(screen.getByTestId('kpi-por-confirmar').textContent).toContain('0 de 14 prioritarios resueltos en N2')
    })

    it('sin máquina elegida: ningún segmento marcado, todo pendiente y KPI «en ambas»', async () => {
      montar(RUTA)
      await screen.findByTestId('fila-SM5')
      for (const t of screen.getAllByRole('tab')) expect(t.getAttribute('aria-selected')).toBe('false')
      expect(screen.getByTestId('selector-maquina').textContent).toContain('¿En cuál máquina estás?')
      expect(screen.getByTestId('fila-SM5').textContent).toContain('N2: pendiente')
      expect(screen.getByTestId('fila-SM5').textContent).toContain('N3: pendiente')
      expect(screen.getByTestId('kpi-por-confirmar').textContent).toContain('prioritarios resueltos en ambas')
    })
  })
})
