// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
const xlsx = vi.hoisted(() => ({
  filas: [] as unknown[],
  archivo: '',
  falla: false,
}))
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: (f: unknown[]) => { xlsx.filas = f; return {} },
    book_new: () => ({}),
    book_append_sheet: () => {},
  },
  writeFile: (_wb: unknown, nombre: string) => { if (xlsx.falla) throw new Error('disco lleno'); xlsx.archivo = nombre },
}))
vi.mock('../enlacesPieza', () => ({
  // El 92152025 tiene dibujo (hoja 28) y manual (pág. 85); el resto no.
  useFigurasDespiece: () => ({ '92152025': [{ hoja: 28, fig: '6-3', slug: 'baader-200-despiece', maquina: 'BAADER 200' }] }),
  rutaDibujo: (f: Record<string, { hoja: number; slug: string }[]> | null, c: string) =>
    f?.[c]?.[0] ? `/aprendizaje/planos/${f[c][0].slug}?hoja=${f[c][0].hoja}&ap=${c}` : null,
  useManualesPieza: () => ({
    manualDe: (c: string) => (c === '92152025' ? { url: 'https://docs.example/manual-200.pdf#page=85', pagina: 85 } : null),
    cargando: false,
  }),
}))
import { MemoryRouter } from 'react-router-dom'
import { InventarioMaquinaView, CLAVE_VOLVER_INVENTARIO } from '../InventarioMaquinaView'
import type { InventarioLinea, InventarioSesion, BodegaMergedItem } from '@/hooks/repuestos/useBodega'

// Líneas reales del cuaderno BAADER 200 (25-09-26).
const base = { codigoSAP: '', textoBreve: '', descripcion: '', nombreComun: '', stockSistema: null, notaCuaderno: '' }
const LINEAS: InventarioLinea[] = [
  { ...base, id: 'u1-002', ubicacion: 'Ubicación 1', codigoFabricante: '92152025', codigoCuaderno: '92152025',
    codigoSAP: '3300051215', textoBreve: 'RODILLO 92152025', cantidad: 5, stockSistema: 6, estado: 'validado' },
  { ...base, id: 'u5-004', ubicacion: 'Ubicación 5', codigoFabricante: '2001202002', codigoCuaderno: '2001202002',
    codigoSAP: '3300017418', textoBreve: 'CHAPA GUIA 2001202002', cantidad: 1, stockSistema: 18, estado: 'validado' },
  { ...base, id: 'u3-008', ubicacion: 'Ubicación 3', codigoFabricante: '92481630', codigoCuaderno: '92481630',
    cantidad: 7, estado: 'dudoso', motivo: 'codigo', sugerencia: '92461630',
    detalleDuda: 'No existe. 92461630 = Bulón con gollete (SAP 3300011830).' },
  { ...base, id: 'u1-005', ubicacion: 'Ubicación 1', codigoFabricante: '37310102', codigoCuaderno: '37310102',
    codigoSAP: '3300011820', cantidad: 6, estado: 'dudoso', motivo: 'sap', detalleDuda: 'El texto del SAP cita otro código.' },
]
const ITEMS = [
  { codigoSAP: '3300011830', codigoFabricante: '92461630', textoBreve: 'BULON 92461630', stockActual: 9, bodegaId: 'b1' },
  { codigoSAP: '3300051215', codigoFabricante: '92152025', textoBreve: 'RODILLO 92152025', stockActual: 6, bodegaId: 'b2' },
] as unknown as BodegaMergedItem[]
const SESION = { id: 's1', nombre: 'Inventario BAADER 200 bodega 25-09-26', estado: 'en_curso', tipo: 'maquina',
  maquina: 'BAADER 200', creadoPor: 'u', creadoPorNombre: 'x', totalItems: 4, contados: 4, conDiferencia: 2,
  createdAt: new Date() } as InventarioSesion

async function montar() {
  const validarLinea = vi.fn().mockResolvedValue(undefined)
  const aplicarAjusteInventario = vi.fn().mockResolvedValue({ actualizados: 2, creados: 0, cuadran: 0 })
  const bodega = { items: ITEMS, loadLineas: vi.fn().mockResolvedValue(LINEAS), validarLinea, aplicarAjusteInventario } as never
  const { container } = render(
    <MemoryRouter>
      <InventarioMaquinaView sesion={SESION} bodega={bodega} user={{ id: 'u1', nombre: 'Tester' }} onVolver={() => {}} />
    </MemoryRouter>)
  await screen.findAllByText('RODILLO 92152025')
  const pc = within(container.querySelector('[data-vista="pc"]') as HTMLElement)
  const cel = within(container.querySelector('[data-vista="celular"]') as HTMLElement)
  return { validarLinea, aplicarAjusteInventario, pc, cel, raiz: within(container) }
}
const filasTabla = (pc: ReturnType<typeof within>) =>
  pc.getAllByRole('row').slice(2).map((r: HTMLElement) => r.textContent ?? '')

afterEach(cleanup)

describe('celular', () => {
  it('Inventario muestra solo lo validado, con contado vs sistema', async () => {
    const { cel } = await montar()
    expect(cel.getByText('RODILLO 92152025')).toBeTruthy()
    expect(cel.getByText(/sist\. 6 \(-1\)/)).toBeTruthy()
    expect(cel.queryByText(/92481630/)).toBeNull()
  })

  it('valida un dudoso con la sugerencia y trae el SAP del maestro', async () => {
    const { cel, validarLinea } = await montar()
    fireEvent.click(cel.getByRole('tab', { name: /Dudosos/ }))
    expect(await cel.findByDisplayValue('92461630')).toBeTruthy()
    expect(cel.getByText('BULON 92461630')).toBeTruthy()
    fireEvent.click(cel.getAllByRole('button', { name: /Validar/ })[0]!)
    await waitFor(() => expect(validarLinea).toHaveBeenCalled())
    const [, lineaId, datos] = validarLinea.mock.calls[0]!
    expect(lineaId).toBe('u3-008')
    expect(datos).toMatchObject({ codigoFabricante: '92461630', cantidad: 7, codigoSAP: '3300011830', stockSistema: 9 })
  })

  it('un SAP que no corresponde no se vuelve a ofrecer', async () => {
    const { cel } = await montar()
    fireEvent.click(cel.getByRole('tab', { name: /Dudosos/ }))
    expect(await cel.findByPlaceholderText(/El actual \(3300011820\) es de otra pieza/)).toBeTruthy()
  })
})

describe('PC: tabla', () => {
  it('muestra TODAS las líneas (validadas y dudosas) en una sola tabla', async () => {
    const { pc } = await montar()
    expect(filasTabla(pc)).toHaveLength(4)
    expect(pc.getByText(/4 de 4 líneas · 19 unidades/)).toBeTruthy()
  })

  it('filtra por ubicación y se combina con el estado; el pie sigue al filtro', async () => {
    const { pc } = await montar()
    fireEvent.change(pc.getByLabelText('Filtrar ubicación'), { target: { value: 'Ubicación 1' } })
    expect(filasTabla(pc)).toHaveLength(2)
    fireEvent.change(pc.getByLabelText('Filtrar estado'), { target: { value: 'dudoso' } })
    expect(filasTabla(pc)).toHaveLength(1)
    expect(pc.getByText(/1 de 4 líneas · 6 unidades · 2 filtros activos/)).toBeTruthy()
    fireEvent.click(pc.getByRole('button', { name: /Quitar filtros/ }))
    expect(filasTabla(pc)).toHaveLength(4)
  })

  it('ordenar por diferencia deja primero la que más falta', async () => {
    const { pc } = await montar()
    fireEvent.click(pc.getByRole('button', { name: /^Dif\./ }))
    expect(filasTabla(pc)[0]).toContain('CHAPA GUIA 2001202002')
    expect(filasTabla(pc)[0]).toContain('-17')
  })

  it('clic en una fila dudosa abre su formulario y valida', async () => {
    const { pc, validarLinea } = await montar()
    fireEvent.click(pc.getByText('92481630'))
    fireEvent.click(await pc.findByRole('button', { name: /Validar/ }))
    await waitFor(() => expect(validarLinea).toHaveBeenCalled())
    expect(validarLinea.mock.calls[0]![2]).toMatchObject({ codigoFabricante: '92461630', codigoSAP: '3300011830' })
  })
})

describe('Descargar Excel', () => {
  it('en el celular baja TODO el inventario (validadas y dudosas), por ubicación', async () => {
    xlsx.falla = false
    const { cel } = await montar()
    fireEvent.click(cel.getByRole('button', { name: /Descargar Excel/ }))
    await waitFor(() => expect(xlsx.archivo).toBe('Inventario BAADER 200 bodega 25-09-26.xlsx'))
    const filas = xlsx.filas as Record<string, unknown>[]
    expect(filas).toHaveLength(4)
    expect(filas.map(f => f['Ubicación'])).toEqual(['Ubicación 1', 'Ubicación 1', 'Ubicación 3', 'Ubicación 5'])
    expect(filas.find(f => f['Código fabricante'] === '92481630')?.['Estado']).toBe('Revisar código')
  })

  it('en el PC baja lo filtrado y lo dice en el nombre', async () => {
    xlsx.falla = false
    const { pc } = await montar()
    fireEvent.change(pc.getByLabelText('Filtrar ubicación'), { target: { value: 'Ubicación 5' } })
    fireEvent.click(pc.getByRole('button', { name: /Descargar Excel/ }))
    await waitFor(() => expect(xlsx.archivo).toBe('Inventario BAADER 200 bodega 25-09-26 (filtrado).xlsx'))
    expect(xlsx.filas).toHaveLength(1)
    expect((xlsx.filas[0] as Record<string, unknown>)['Diferencia']).toBe(-17)
  })

  it('si falla, lo avisa en pantalla', async () => {
    xlsx.falla = true
    const { cel } = await montar()
    fireEvent.click(cel.getByRole('button', { name: /Descargar Excel/ }))
    expect(await cel.findByText(/No se pudo generar el Excel: disco lleno/)).toBeTruthy()
  })
})

describe('ir al dibujo y al manual', () => {
  it('PC: íconos con la ruta al despiece y a la página del manual, en otra pestaña', async () => {
    const { pc } = await montar()
    const dib = pc.getByRole('link', { name: 'Ver 92152025 en el dibujo' })
    expect(dib.getAttribute('href')).toContain('/aprendizaje/planos/baader-200-despiece?hoja=28&ap=92152025')
    expect(dib.getAttribute('target')).toBe('_blank')
    expect(pc.getByRole('link', { name: /Ver 92152025 en el manual, página 85/ }).getAttribute('href')).toBe('https://docs.example/manual-200.pdf#page=85')
    // la que no tiene dibujo no ofrece enlace
    expect(pc.queryByRole('link', { name: 'Ver 2001202002 en el dibujo' })).toBeNull()
  })

  it('celular: tocar la fila abre dibujo / manual / corregir, y el dibujo deja la marca para volver', async () => {
    sessionStorage.clear()
    const { cel } = await montar()
    fireEvent.click(cel.getByText('RODILLO 92152025'))
    expect(await screen.findByText('Ver en el manual · pág. 85')).toBeTruthy()
    expect(screen.getByText('Corregir o recontar')).toBeTruthy()
    fireEvent.click(screen.getByText('Ver en el dibujo'))
    expect(sessionStorage.getItem(CLAVE_VOLVER_INVENTARIO)).toBe('s1')
  })
})

describe('ajustar stock según el conteo', () => {
  it('muestra el plan (qué baja, qué sube, precisión de antes) y lo aplica al confirmar', async () => {
    const { raiz, aplicarAjusteInventario } = await montar()
    fireEvent.click(raiz.getByRole('button', { name: /Ajustar stock según el conteo \(2\)/ }))
    expect(raiz.getByText(/2 repuestos cambian de stock: 2 bajan y 0 suben/)).toBeTruthy()
    expect(raiz.getByText(/No se tocan 2 dudosas/)).toBeTruthy()
    expect(raiz.getByText(/0 de 2/)).toBeTruthy()
    fireEvent.click(raiz.getByRole('button', { name: /^Ajustar stock$/ }))
    await waitFor(() => expect(aplicarAjusteInventario).toHaveBeenCalled())
    const plan = aplicarAjusteInventario.mock.calls[0]![2]
    expect(plan.cambian.map((a: { codigoSAP: string; sistema: number; contado: number }) => [a.codigoSAP, a.sistema, a.contado]))
      .toEqual([['3300051215', 6, 5], ['3300017418', 18, 1]])
    expect(await raiz.findByText(/Stock ajustado: 2 actualizados/)).toBeTruthy()
  })
})
