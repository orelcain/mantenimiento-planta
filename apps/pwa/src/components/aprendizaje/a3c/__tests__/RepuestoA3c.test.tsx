// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { PartesPlano, ParteFisica } from '@/hooks/usePartesPlano'
import type { RepuestoResuelto } from '@/hooks/repuestos/useRepuestosByCodigos'
import { useAuthStore } from '@/store/authStore'
import { RepuestoA3c } from '../RepuestoA3c'
import { IndicadorRepuestosA3c } from '../IndicadorRepuestosA3c'

const mocks = vi.hoisted(() => ({
  partes: null as unknown,
  /** docs de planoVinculos tal como los lee el hook (con `maquina` o sin ella, los viejos). */
  docs: [] as Record<string, unknown>[],
  /** la máquina con que RepuestoA3c pidió el hook. */
  maquinaPedida: null as unknown,
  bySap: new Map<string, unknown>(),
  confirmar: vi.fn(async () => {}),
  subirFoto: vi.fn(async () => 'https://foto'),
}))

vi.mock('@/hooks/usePartesPlano', () => ({ usePartesPlano: () => mocks.partes }))
// El hook real agrupa y filtra con las funciones puras de vinculoTerreno: se reusan acá.
vi.mock('@/hooks/usePlanoVinculos', async () => {
  const u = await vi.importActual<typeof import('@/utils/aprendizaje/vinculoTerreno')>('@/utils/aprendizaje/vinculoTerreno')
  return {
    usePlanoVinculos: (slug: string, maquina?: 'baader-n1' | 'baader-n2' | 'baader-n3' | null) => {
      mocks.maquinaPedida = maquina ?? null
      const porAparato = u.agruparVinculos(slug, mocks.docs as { aparato: string; maquina?: 'baader-n2' }[])
      const vinculos = new Map<string, unknown>()
      porAparato.forEach((e, aparato) => {
        const v = u.vinculoActivo(slug, e, maquina)
        if (v) vinculos.set(aparato, v)
      })
      return {
        vinculos,
        porAparato,
        confirmar: mocks.confirmar,
        subirFoto: mocks.subirFoto,
        resumen: { confirmados: 0, corregidos: 0, total: 0 },
        error: null,
      }
    },
  }
})
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
/** Un doc de `planoVinculos` del 888. Sin `maquina` (null) = confirmación vieja. */
const doc = (aparato: string, extra: Record<string, unknown> = {}, maquina: string | null = 'baader-n2') => ({
  id: `baader-142-888__${aparato}${maquina ? `__${maquina}` : ''}`,
  planoSlug: 'baader-142-888',
  aparato,
  ...(maquina ? { maquina } : {}),
  confirmadoPor: 'u1',
  ...extra,
})
const montar = (codigo: string, compacta = false, ruta = '/?maquina=n2') =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <RepuestoA3c codigo={codigo} compacta={compacta} />
      <Ruta />
    </MemoryRouter>,
  )

beforeEach(() => {
  mocks.partes = partesBase()
  mocks.docs = []
  mocks.maquinaPedida = null
  localStorage.clear()
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
    expect(screen.queryByText('¿Es la pieza instalada en N2?')).toBeNull()
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
    expect(screen.getAllByText('¿Es la pieza instalada en N2?')).toHaveLength(1)
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
    mocks.docs = [doc('B1', { estado: 'confirmado', confirmadoPorNombre: 'Ana' })]
    montar('B1')
    expect(screen.getByText('Confirmada en terreno')).toBeTruthy()
    expect(screen.queryByText('¿Es la pieza instalada en N2?')).toBeNull()
    expect(screen.getByText(/Confirmada en N2 por Ana/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Corregir respuesta de N2' }))
    expect(screen.getByText('¿Es la pieza instalada en N2?')).toBeTruthy()
  })

  describe('máquina (el 888 sirve a N2 y N3)', () => {
    it('sin máquina elegida: pregunta en cuál estás, botones desactivados y nada se guarda', () => {
      montar('B1', false, '/')
      expect(screen.getByTestId('elige-maquina')).toBeTruthy()
      expect(screen.getByText('¿En cuál máquina estás?')).toBeTruthy()
      for (const n of ['Sí, es esta', 'Es otra', 'No existe aquí']) {
        expect((screen.getByRole('button', { name: n }) as HTMLButtonElement).disabled, n).toBe(true)
      }
      expect(mocks.maquinaPedida).toBeNull()
    })

    it('elegir N3 en el selector la deja en la URL (conservando el resto) y habilita la pregunta', () => {
      montar('B1', false, '/?el=B1')
      fireEvent.click(screen.getByRole('tab', { name: 'N3' }))
      expect(screen.getByTestId('ruta').textContent).toBe('/?el=B1&maquina=n3')
      expect(screen.getByText('¿Es la pieza instalada en N3?')).toBeTruthy()
      expect((screen.getByRole('button', { name: 'Sí, es esta' }) as HTMLButtonElement).disabled).toBe(false)
      expect(screen.queryByTestId('elige-maquina')).toBeNull()
      expect(localStorage.getItem('plano-maquina:baader-142-888')).toBe('n3')
      expect(mocks.maquinaPedida).toBe('baader-n3')
    })

    it('la máquina sale de ?maquina= y, si falta, de la última elegida en el teléfono', () => {
      montar('B1', false, '/?maquina=n3')
      expect(mocks.maquinaPedida).toBe('baader-n3')
      expect(screen.getByText('¿Es la pieza instalada en N3?')).toBeTruthy()
      cleanup()
      localStorage.setItem('plano-maquina:baader-142-888', 'n2')
      montar('B1', false, '/')
      expect(mocks.maquinaPedida).toBe('baader-n2')
    })

    it('«En terreno»: una fila por máquina, la activa marcada «Aquí»', () => {
      mocks.docs = [doc('B1', { estado: 'confirmado', codigo: '42303109', confirmadoPorNombre: 'Ana' }, 'baader-n2')]
      montar('B1', false, '/?maquina=n3')
      const n2 = screen.getByTestId('en-terreno-N2').textContent ?? ''
      const n3 = screen.getByTestId('en-terreno-N3').textContent ?? ''
      expect(n2).toContain('Confirmado')
      expect(n2).toContain('42303109')
      expect(n2).toContain('Ana')
      expect(n2).not.toContain('Aquí')
      expect(n3).toContain('Pendiente')
      expect(n3).toContain('Aquí')
      // lo de N2 no responde la pregunta de N3
      expect(screen.getByText('¿Es la pieza instalada en N3?')).toBeTruthy()
      expect(screen.getByText('Según catálogo')).toBeTruthy()
    })

    it('piezas distintas por máquina: fila informativa y Pill azul, no «Es otra pieza»', () => {
      mocks.docs = [
        doc('B1', { estado: 'confirmado', codigo: '42303107' }, 'baader-n2'),
        doc('B1', { estado: 'confirmado', codigo: '42303109' }, 'baader-n3'),
      ]
      montar('B1')
      const f = screen.getByTestId('piezas-distintas').textContent ?? ''
      expect(f).toContain('Piezas distintas por máquina')
      expect(f).toContain('N2 lleva 42303107 y N3 lleva 42303109')
      expect(f).toContain('Pide el repuesto según la máquina')
      expect(screen.getByText('Distinta por máquina')).toBeTruthy()
      expect(screen.queryByText('Es otra pieza')).toBeNull()
    })

    it('misma pieza en ambas: sin aviso de piezas distintas', () => {
      mocks.docs = [
        doc('B1', { estado: 'confirmado', codigo: '42303109' }, 'baader-n2'),
        doc('B1', { estado: 'confirmado', codigo: '42303109' }, 'baader-n3'),
      ]
      montar('B1')
      expect(screen.queryByTestId('piezas-distintas')).toBeNull()
      expect(screen.queryByText('Distinta por máquina')).toBeNull()
    })

    it('la confirmación vieja sin máquina se muestra como pista y no confirma nada', () => {
      mocks.docs = [doc('B1', { estado: 'confirmado', confirmadoPorNombre: 'Ana' }, null)]
      montar('B1')
      expect(screen.getByTestId('en-terreno-previo').textContent).toContain('Confirmación anterior (sin máquina)')
      expect(screen.getByText('Según catálogo')).toBeTruthy()
      expect(screen.getByText('¿Es la pieza instalada en N2?')).toBeTruthy()
    })
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
      expect(screen.getByText('¿Qué código dice la etiqueta en N2?')).toBeTruthy()
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
      mocks.docs = [doc('B1', { estado: 'confirmado', codigo: '42303107', confirmadoPorNombre: 'Ana' })]
      montar('B1')
      expect(screen.getByText('Confirmada en terreno')).toBeTruthy()
      expect(screen.getByText('Descartada en terreno')).toBeTruthy()
      expect(screen.getByText(/Confirmada en N2 \(42303107\) por Ana/)).toBeTruthy()
    })
  })

  it('un vínculo corregido muestra «Es otra pieza» y la etiqueta leída', () => {
    mocks.docs = [doc('B1', { estado: 'corregido', codigo: '77770001' })]
    montar('B1')
    expect(screen.getAllByText('Es otra pieza').length).toBeGreaterThan(0)
    expect(screen.getByText('77770001')).toBeTruthy()
  })
})

describe('IndicadorRepuestosA3c', () => {
  it('muestra N/M y los resueltos en AMBAS máquinas, sin contar pseudo-elementos', () => {
    mocks.docs = [doc('B1', { estado: 'confirmado' }, 'baader-n2'), doc('B1', { estado: 'corregido', codigo: '77770001' }, 'baader-n3')]
    render(<MemoryRouter><IndicadorRepuestosA3c codigos={['A3C.P1', 'X5', 'B1', 'B10', 'Y3']} /></MemoryRouter>)
    const t = screen.getByTestId('indicador-repuestos').textContent ?? ''
    expect(t).toContain('2/3')
    expect(t).toContain('1 resuelto en ambas')
    expect(screen.getByTestId('indicador-por-maquina').textContent).toBe('N2 1 · N3 1')
    const enlace = screen.getByTestId('indicador-repuestos')
    expect(enlace.tagName).toBe('A')
    expect(enlace.getAttribute('href')).toBe('/aprendizaje/baader-142/tarjeta-a3c/por-confirmar')
  })

  it('resuelto solo en N2 no suma en ambas; la línea dice cuánto lleva cada una', () => {
    mocks.docs = [doc('B1', { estado: 'confirmado' }, 'baader-n2'), doc('B10', { estado: 'confirmado' }, 'baader-n2')]
    render(<MemoryRouter><IndicadorRepuestosA3c codigos={['B1', 'B10', 'Y3']} /></MemoryRouter>)
    expect(screen.getByTestId('indicador-repuestos').textContent).toContain('0 resueltos en ambas')
    expect(screen.getByTestId('indicador-por-maquina').textContent).toBe('N2 2 · N3 0')
  })

  it('la confirmación vieja sin máquina no cuenta', () => {
    mocks.docs = [doc('B1', { estado: 'confirmado' }, null)]
    render(<MemoryRouter><IndicadorRepuestosA3c codigos={['B1', 'B10']} /></MemoryRouter>)
    expect(screen.getByTestId('indicador-por-maquina').textContent).toBe('N2 0 · N3 0')
  })

  it('sin sesión no afirma confirmaciones', () => {
    useAuthStore.setState({ isAuthenticated: false })
    render(<MemoryRouter><IndicadorRepuestosA3c codigos={['B1', 'B10']} /></MemoryRouter>)
    const t = screen.getByTestId('indicador-repuestos').textContent ?? ''
    expect(t).toContain('2/2')
    expect(t).toContain('inicia sesión')
  })

  it('no se muestra mientras el plano no cargó', () => {
    mocks.partes = null
    render(<MemoryRouter><IndicadorRepuestosA3c codigos={['B1']} /></MemoryRouter>)
    expect(screen.queryByTestId('indicador-repuestos')).toBeNull()
  })
})
