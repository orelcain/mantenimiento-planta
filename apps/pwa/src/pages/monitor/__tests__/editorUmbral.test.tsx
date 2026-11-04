/**
 * La tarjeta «Minutos a ritmo de la línea» (A2-2b) y su «Cambiar» en la cabecera de columnas: quién lo ve (solo admin, con datos de
 * línea), el rótulo «Umbral calibrado / óptimo» y «minutos a ritmo óptimo», el efecto por Baader con cada modo, Guardar apagado sin
 * cambio, la llamada a `setMonitorUmbralARitmo` y quién anotó (`leerUmbralARitmo`).
 *
 * Las cifras esperadas salen a mano del fixture, no del código que se prueba. Ev 1 con perilla 17 y esperado 18; sus 10 minutos
 * 17,17,17,17,17,16,16,15,15,15: calibrado (a ritmo desde 16) 7 de 10 = 70 %; óptimo (desde 17) 5 de 10 = 50 %. Ev 2 sin perilla y
 * meta 16, todos los minutos en 16: a ritmo desde 12 (75 % de la meta) y 100 %; no cambia con el modo.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { leerPerillasHistorial, leerUmbralARitmo, setMonitorPerilla, setMonitorUmbralARitmo } from '@/services/shoplogix/pinShiftEnd'
import { efectoDeModos, MinutoTurnoV2, type MinutoTurno } from '../MonitorV2'
import type { UmbralEditorDatos } from '../EditorUmbral'
import type { PerillasDeLinea } from '../perilla'

vi.mock('@/services/shoplogix/pinShiftEnd', () => ({
  setMonitorPerilla: vi.fn(),
  leerPerillasHistorial: vi.fn(),
  setMonitorUmbralARitmo: vi.fn(),
  leerUmbralARitmo: vi.fn(),
}))

const DESDE = '2026-11-04T01:00:00.000Z'
const PERILLAS: PerillasDeLinea = { actual: { ev1: { cpm: 17, desde: '2026-11-04T00:00:00.000Z' } }, historial: [] }
const PERILLAS_OPTIMO: PerillasDeLinea = { ...PERILLAS, modo: 'optimo' }
const TURNO: MinutoTurno = {
  desde: DESDE,
  maquinas: [
    { id: 'ev1', nombre: 'Evisceradora 1', esperado: 18, cycles: [17, 17, 17, 17, 17, 16, 16, 15, 15, 15] },
    { id: 'ev2', nombre: 'Evisceradora 2', esperado: 16, cycles: Array.from({ length: 10 }, () => 16) },
  ],
}
const UMBRAL: UmbralEditorDatos = { plantSlug: 'chonchi', por: 'orel@test' }

const renderFranja = (umbralEditor: UmbralEditorDatos | null, perillas: PerillasDeLinea | null = PERILLAS) =>
  render(<MinutoTurnoV2 d={TURNO} cerrado={false} perillas={perillas} carros={null} perillaEditor={null} umbralEditor={umbralEditor} />)

const comoAdmin = () => useAuthStore.setState({ user: { rol: 'admin', email: 'orel@test' } as never })
const botonGuardar = () => screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})
beforeEach(() => {
  vi.mocked(leerPerillasHistorial).mockResolvedValue([])
  vi.mocked(setMonitorPerilla).mockResolvedValue(undefined)
  vi.mocked(setMonitorUmbralARitmo).mockResolvedValue(undefined)
  vi.mocked(leerUmbralARitmo).mockResolvedValue({ vigente: null, historial: [] })
  useAuthStore.setState({ user: null })
})
afterEach(() => {
  cleanup()
  useAuthStore.setState({ user: null })
  vi.clearAllMocks()
})

describe('quién ve el «Cambiar» de la cabecera', () => {
  it('solo un admin con datos de línea lo ve: sin sesión, con supervisor o sin datos de línea no aparece', () => {
    const sinSesion = renderFranja(UMBRAL)
    expect(sinSesion.container.textContent).not.toContain('Cambiar')
    sinSesion.unmount()
    useAuthStore.setState({ user: { rol: 'supervisor', email: 'sup@test' } as never })
    const sup = renderFranja(UMBRAL)
    expect(sup.container.textContent).not.toContain('Cambiar')
    sup.unmount()
    comoAdmin()
    const sinDatos = renderFranja(null)
    expect(sinDatos.container.textContent).not.toContain('Umbral calibrado')
  })

  it('el admin ve «Umbral calibrado · Cambiar» a la izquierda de las columnas', () => {
    comoAdmin()
    const { container, getByRole } = renderFranja(UMBRAL)
    expect(container.textContent).toContain('Umbral calibrado · Cambiar')
    expect(getByRole('button', { name: 'Cambiar' }).getAttribute('aria-expanded')).toBe('false')
  })
})

describe('la cabecera según el modo', () => {
  it('calibrado: la columna dice «minutos a ritmo» y nada más', () => {
    const { container } = renderFranja(null)
    expect(container.textContent).toContain('minutos a ritmo')
    expect(container.textContent).not.toContain('minutos a ritmo óptimo')
  })

  it('óptimo: la columna dice «minutos a ritmo óptimo» y el rótulo del umbral dice óptimo', () => {
    comoAdmin()
    const { container } = renderFranja(UMBRAL, PERILLAS_OPTIMO)
    expect(container.textContent).toContain('minutos a ritmo óptimo')
    expect(container.textContent).toContain('Umbral óptimo · Cambiar')
  })
})

describe('la tarjeta', () => {
  it('«Cambiar» la abre y «Cancelar» la cierra', () => {
    comoAdmin()
    const { getByRole, getByText, queryByText, container } = renderFranja(UMBRAL)
    fireEvent.click(getByRole('button', { name: 'Cambiar' }))
    expect(getByRole('button', { name: 'Cambiar' }).getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Minutos a ritmo de la línea')
    fireEvent.click(getByText('Cancelar'))
    expect(queryByText('Minutos a ritmo de la línea')).toBeNull()
  })

  it('el efecto por Baader: Ev 1 calibrado 16 o más y 70 %, óptimo 17 o más y 50 %; Ev 2 sin perilla no cambia', () => {
    comoAdmin()
    const { getByRole, container } = renderFranja(UMBRAL)
    fireEvent.click(getByRole('button', { name: 'Cambiar' }))
    const filaEv1 = [...container.querySelectorAll('tr')].find((tr) => tr.textContent!.includes('Evisceradora 1'))!
    expect(filaEv1.textContent).toContain('16 o más70 %')
    expect(filaEv1.textContent).toContain('17 o más50 %')
    const filaEv2 = [...container.querySelectorAll('tr')].find((tr) => tr.textContent!.includes('Evisceradora 2'))!
    expect(filaEv2.textContent).toContain('sin perilla')
    expect(filaEv2.textContent).toContain('12 o más · 100 %, no cambia')
  })

  it('el modo vigente sale marcado en el segmentado', () => {
    comoAdmin()
    const { getByRole } = renderFranja(UMBRAL, PERILLAS_OPTIMO)
    fireEvent.click(getByRole('button', { name: 'Cambiar' }))
    expect(getByRole('radio', { name: 'Óptimo' }).getAttribute('aria-checked')).toBe('true')
    expect(getByRole('radio', { name: 'Calibrado' }).getAttribute('aria-checked')).toBe('false')
  })

  it('Guardar queda apagado sin cambio; elegir el otro modo lo habilita y volver al vigente lo apaga', () => {
    comoAdmin()
    const { getByRole, getByText } = renderFranja(UMBRAL)
    fireEvent.click(getByRole('button', { name: 'Cambiar' }))
    expect(botonGuardar().disabled).toBe(true)
    fireEvent.click(getByRole('radio', { name: 'Óptimo' }))
    expect(botonGuardar().disabled).toBe(false)
    fireEvent.click(getByRole('radio', { name: 'Calibrado' }))
    expect(botonGuardar().disabled).toBe(true)
    expect(getByText('Guardar').className).toContain('text-brand-foreground')
  })

  it('Guardar llama a setMonitorUmbralARitmo con la línea, el modo elegido y quien anota, y dice «guardado»', async () => {
    comoAdmin()
    const { getByRole, container } = renderFranja(UMBRAL)
    fireEvent.click(getByRole('button', { name: 'Cambiar' }))
    fireEvent.click(getByRole('radio', { name: 'Óptimo' }))
    fireEvent.click(getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(container.textContent).toContain('guardado · se aplica con el próximo dato'))
    expect(setMonitorUmbralARitmo).toHaveBeenCalledTimes(1)
    expect(setMonitorUmbralARitmo).toHaveBeenCalledWith({ plantSlug: 'chonchi', modo: 'optimo', por: 'orel@test' })
    expect(botonGuardar().disabled).toBe(true)
  })

  it('quién y cuándo: lee la anotación vigente y la muestra sin correo completo', async () => {
    comoAdmin()
    vi.mocked(leerUmbralARitmo).mockResolvedValue({
      vigente: { modo: 'optimo', desde: '2026-11-04T00:00:00.000Z', por: 'orel@test' },
      historial: [],
    })
    const { getByRole, container } = renderFranja(UMBRAL)
    fireEvent.click(getByRole('button', { name: 'Cambiar' }))
    await waitFor(() => expect(container.textContent).toContain('Anotado: óptimo desde 04-11 00:00 · orel'))
    expect(container.textContent).not.toContain('@')
    expect(leerUmbralARitmo).toHaveBeenCalledWith('chonchi')
  })

  it('sin anotación dice que el modo es el de omisión', async () => {
    comoAdmin()
    const { getByRole, container } = renderFranja(UMBRAL)
    fireEvent.click(getByRole('button', { name: 'Cambiar' }))
    await waitFor(() => expect(container.textContent).toContain('Sin anotación: el modo es el de omisión (calibrado).'))
  })
})

describe('efectoDeModos (puro)', () => {
  const varaPerilla = (n: number) => Array.from({ length: n }, () => ({ cpm: 17, fuente: 'perilla' as const }))
  const cycles = [17, 17, 17, 17, 17, 16, 16, 15, 15, 15]

  it('perilla 17: calibrado desde 16 (70 %), óptimo desde 17 (50 %)', () => {
    const e = efectoDeModos(cycles, varaPerilla(10), 10, 18)
    expect(e.calibrado).toEqual({ umbral: 16, pct: 70 })
    expect(e.optimo).toEqual({ umbral: 17, pct: 50 })
  })

  it('sin perilla (Shoplogix 16): los dos modos dan lo mismo', () => {
    const sin = Array.from({ length: 10 }, () => ({ cpm: 16, fuente: 'shoplogix' as const }))
    const e = efectoDeModos(Array.from({ length: 10 }, () => 16), sin, 10, 16)
    expect(e.calibrado).toEqual({ umbral: 12, pct: 100 })
    expect(e.optimo).toEqual(e.calibrado)
  })
})
