// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { PartesPlano, ParteFisica } from '@/hooks/usePartesPlano'
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'
import type { RepuestoResuelto } from '@/hooks/repuestos/useRepuestosByCodigos'
import { useAuthStore } from '@/store/authStore'
import { RepuestoA3c } from '../RepuestoA3c'
import { IndicadorRepuestosA3c } from '../IndicadorRepuestosA3c'

const mocks = vi.hoisted(() => ({
  partes: null as unknown,
  vinculos: new Map<string, unknown>(),
  bySap: new Map<string, unknown>(),
  confirmar: vi.fn(async () => {}),
  subirFoto: vi.fn(async () => 'https://foto'),
}))

vi.mock('@/hooks/usePartesPlano', () => ({ usePartesPlano: () => mocks.partes }))
vi.mock('@/hooks/usePlanoVinculos', () => ({
  usePlanoVinculos: () => ({
    vinculos: mocks.vinculos,
    confirmar: mocks.confirmar,
    subirFoto: mocks.subirFoto,
    resumen: { confirmados: 0, corregidos: 0, total: 0 },
    error: null,
  }),
}))
vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({
  useRepuestosByCodigos: () => ({ bySap: mocks.bySap, loading: false }),
}))

const pieza = (extra: Partial<ParteFisica> = {}): ParteFisica => ({
  nr: '42303109', es: 'Sensores de proximidad inductivo', de: 'Ind', fig: '70-8', hoja: 89, pos: 'B1', confianza: 'catalogo', ...extra,
})
const partesBase = (): PartesPlano => ({
  despiece: 'baader-142-despiece',
  aparatos: {
    B1: [pieza({ sap: '3300012350', sapNombre: 'Sensor inductivo con cable', sapUbicacion: 'C-3' })],
    B10: [pieza({ nr: '42303077', pos: 'B10' })],
  },
  familias: { SM: { etiqueta: 'motor paso a paso', figuras: [{ fig: '70-1', hoja: 80, titulo: 'Motores', n: 3 }, { fig: '2-6', hoja: 9, titulo: 'Eje', n: 1 }] } },
})

function Ruta() {
  const l = useLocation()
  return <output data-testid="ruta">{l.pathname + l.search}</output>
}
const montar = (codigo: string, compacta = false) =>
  render(
    <MemoryRouter>
      <RepuestoA3c codigo={codigo} compacta={compacta} />
      <Ruta />
    </MemoryRouter>,
  )

beforeEach(() => {
  mocks.partes = partesBase()
  mocks.vinculos = new Map()
  mocks.bySap = new Map()
  mocks.confirmar.mockClear()
  mocks.subirFoto.mockClear()
  useAuthStore.setState({ isAuthenticated: true })
})
afterEach(cleanup)

describe('RepuestoA3c', () => {
  it('A: pieza exacta con SAP, stock en vivo y acciones', () => {
    mocks.bySap = new Map<string, RepuestoResuelto>([['3300012350', { id: 'x', codigoSAP: '3300012350', nombre: 'Sensor inductivo con cable', stockFisico: 4, ubicacion: 'C-3' }]])
    montar('B1')
    expect(screen.getByText('42303109')).toBeTruthy()
    expect(screen.getByText('Según catálogo')).toBeTruthy()
    expect(screen.getByText('3300012350')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver en Repuestos' }))
    expect(screen.getByTestId('ruta').textContent).toBe('/repuestos?q=3300012350')
  })

  it('A: «Ver dibujo» lleva a la hoja y la posición del despiece', () => {
    montar('B1')
    fireEvent.click(screen.getByRole('button', { name: /Ver dibujo · fig\. 70-8/ }))
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje/planos/baader-142-despiece?hoja=89&ap=B1')
  })

  it('A: stock 0 dice «Sin stock»', () => {
    mocks.bySap = new Map<string, RepuestoResuelto>([['3300012350', { id: 'x', codigoSAP: '3300012350', nombre: 'n', stockFisico: 0 }]])
    montar('B1')
    expect(screen.getByText('Sin stock')).toBeTruthy()
  })

  it('B: sin SAP muestra el hueco y el botón de alta hacia el buscador', () => {
    montar('B10')
    expect(screen.getByText('Sin código SAP en el maestro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver en Repuestos' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar alta de código' }))
    expect(screen.getByTestId('ruta').textContent).toBe('/repuestos?q=42303077')
  })

  it('C: solo familia, con las figuras y sin pregunta de confirmación', () => {
    montar('SM6-1')
    expect(screen.getByText('Solo familia')).toBeTruthy()
    expect(screen.getByText(/Lee la etiqueta en terreno/)).toBeTruthy()
    expect(screen.queryByText('¿Es la pieza instalada en esta máquina?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Fig\. 2-6/ }))
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje/planos/baader-142-despiece?hoja=9')
  })

  it('D: nada que mostrar no renderiza la sección; tampoco mientras el plano carga', () => {
    montar('Z9')
    expect(screen.queryByTestId('repuesto-a3c')).toBeNull()
    cleanup()
    mocks.partes = null
    montar('B1')
    expect(screen.queryByTestId('repuesto-a3c')).toBeNull()
  })

  it('varias piezas por aparato: lista cada una y la pregunta va solo en la primera', () => {
    mocks.partes = {
      ...partesBase(),
      aparatos: { B1: [pieza(), pieza({ nr: '99990001', es: 'Soporte' })] },
    }
    montar('B1')
    expect(screen.getAllByTestId('repuesto-pieza')).toHaveLength(2)
    expect(screen.getByText('99990001')).toBeTruthy()
    expect(screen.getAllByText('¿Es la pieza instalada en esta máquina?')).toHaveLength(1)
  })

  it('sin sesión: pide iniciar sesión y no ofrece botones que fallen', () => {
    useAuthStore.setState({ isAuthenticated: false })
    montar('B1')
    expect(screen.getByText('Inicia sesión para confirmar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sí, es esta' })).toBeNull()
  })

  it('«Sí, es esta» guarda confirmado con el código del catálogo', async () => {
    montar('B1')
    fireEvent.click(screen.getByRole('button', { name: 'Sí, es esta' }))
    await waitFor(() => expect(mocks.confirmar).toHaveBeenCalled())
    expect(mocks.confirmar).toHaveBeenCalledWith({ aparato: 'B1', estado: 'confirmado', codigo: '42303109', nota: undefined, foto: undefined })
  })

  it('«No existe aquí» guarda no_aplica sin código', async () => {
    montar('B1')
    fireEvent.click(screen.getByRole('button', { name: 'No existe aquí' }))
    await waitFor(() => expect(mocks.confirmar).toHaveBeenCalled())
    expect(mocks.confirmar).toHaveBeenCalledWith({ aparato: 'B1', estado: 'no_aplica', codigo: undefined, nota: undefined, foto: undefined })
  })

  it('«Es otra» exige el código de la etiqueta y guarda corregido', async () => {
    montar('B1')
    fireEvent.click(screen.getByRole('button', { name: 'Es otra' }))
    const guardar = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Código de la etiqueta'), { target: { value: ' 77770001 ' } })
    expect(guardar.disabled).toBe(false)
    fireEvent.click(guardar)
    await waitFor(() => expect(mocks.confirmar).toHaveBeenCalled())
    expect(mocks.confirmar).toHaveBeenCalledWith({ aparato: 'B1', estado: 'corregido', codigo: '77770001', nota: undefined, foto: undefined })
  })

  it('un vínculo confirmado cambia la Pill y reemplaza la pregunta por la línea de respuesta', () => {
    mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([['B1', { estado: 'confirmado', confirmadoPorNombre: 'Ana' }]])
    montar('B1')
    expect(screen.getByText('Confirmada en terreno')).toBeTruthy()
    expect(screen.queryByText('¿Es la pieza instalada en esta máquina?')).toBeNull()
    expect(screen.getByText(/Confirmada en esta máquina por Ana/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Corregir respuesta' }))
    expect(screen.getByText('¿Es la pieza instalada en esta máquina?')).toBeTruthy()
  })

  describe('candidatos (ninguno según catálogo: la etiqueta decide)', () => {
    const candidatosB1 = () => ({
      ...partesBase(),
      aparatos: {
        B1: [
          pieza({ confianza: 'propuesto', generacion: 'N1 (catálogo 2006)', razon: 'El 2006 es de la antigua.', sap: '3300012350' }),
          pieza({ nr: '42303107', fig: null, hoja: null, confianza: 'propuesto', generacion: 'N2/N3 (catálogo 2014)', sap: '3300098470' }),
        ],
      },
    })

    it('explica que la etiqueta decide, un botón por código y una sola pregunta', () => {
      mocks.partes = candidatosB1()
      montar('B1')
      expect(screen.getByTestId('repuesto-candidatos').textContent).toMatch(/2 códigos va en B1/)
      expect(screen.getAllByText('Propuesto')).toHaveLength(2)
      expect(screen.getByText('¿Qué código dice la etiqueta?')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Es 42303109' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Es 42303107' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Sí, es esta' })).toBeNull()
      expect(screen.getByText('El 2006 es de la antigua.')).toBeTruthy()
    })

    it('sin hoja de despiece no ofrece «Ver dibujo» y dice que es candidato', () => {
      mocks.partes = candidatosB1()
      montar('B1')
      expect(screen.getAllByRole('button', { name: /Ver dibujo/ })).toHaveLength(1)
      expect(screen.getByText(/Candidato · sin figura asignada · N2\/N3/)).toBeTruthy()
    })

    it('elegir un código guarda confirmado con ESE código', async () => {
      mocks.partes = candidatosB1()
      montar('B1')
      fireEvent.click(screen.getByRole('button', { name: 'Es 42303107' }))
      await waitFor(() => expect(mocks.confirmar).toHaveBeenCalled())
      expect(mocks.confirmar).toHaveBeenCalledWith({ aparato: 'B1', estado: 'confirmado', codigo: '42303107', nota: undefined, foto: undefined })
    })

    it('confirmado uno, el otro queda descartado', () => {
      mocks.partes = candidatosB1()
      mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([['B1', { estado: 'confirmado', codigo: '42303107', confirmadoPorNombre: 'Ana' }]])
      montar('B1')
      expect(screen.getByText('Confirmada en terreno')).toBeTruthy()
      expect(screen.getByText('Descartada en terreno')).toBeTruthy()
      expect(screen.getByText(/Confirmada en esta máquina \(42303107\) por Ana/)).toBeTruthy()
    })
  })

  it('un vínculo corregido muestra «Es otra pieza» y la etiqueta leída', () => {
    mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([['B1', { estado: 'corregido', codigo: '77770001' }]])
    montar('B1')
    expect(screen.getAllByText('Es otra pieza').length).toBeGreaterThan(0)
    expect(screen.getByText('77770001')).toBeTruthy()
  })
})

describe('IndicadorRepuestosA3c', () => {
  it('muestra N/M y confirmados, sin contar pseudo-elementos', () => {
    mocks.vinculos = new Map<string, Partial<VinculoTerreno>>([['B1', { estado: 'confirmado' }]])
    render(<IndicadorRepuestosA3c codigos={['A3C.P1', 'X5', 'B1', 'B10', 'Y3']} />)
    const t = screen.getByTestId('indicador-repuestos').textContent ?? ''
    expect(t).toContain('2/3')
    expect(t).toContain('1 confirmado en terreno')
  })

  it('sin sesión no afirma confirmaciones', () => {
    useAuthStore.setState({ isAuthenticated: false })
    render(<IndicadorRepuestosA3c codigos={['B1', 'B10']} />)
    const t = screen.getByTestId('indicador-repuestos').textContent ?? ''
    expect(t).toContain('2/2')
    expect(t).toContain('inicia sesión')
  })

  it('no se muestra mientras el plano no cargó', () => {
    mocks.partes = null
    render(<IndicadorRepuestosA3c codigos={['B1']} />)
    expect(screen.queryByTestId('indicador-repuestos')).toBeNull()
  })
})
