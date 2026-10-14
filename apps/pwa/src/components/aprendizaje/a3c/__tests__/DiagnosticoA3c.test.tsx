// @vitest-environment happy-dom
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { interiorSvg, type A3CDatos, type PaqueteA3c } from '@/data/baader142A3c'
import { TarjetaA3c } from '../TarjetaA3c'

// La ficha monta la sección «Repuesto» y la cabecera el indicador: sin red ni Firestore en estos tests.
vi.mock('@/hooks/usePartesPlano', () => ({ usePartesPlano: () => null }))
vi.mock('@/hooks/usePlanoVinculos', () => ({ usePlanoVinculos: () => ({ vinculos: new Map(), porAparato: new Map(), confirmar: async () => {}, subirFoto: async () => '', resumen: { confirmados: 0, corregidos: 0, total: 0 }, error: null }) }))
// RepuestoA3c lee la máquina de la URL/localStorage: acá no hay Router, se fija N2.
vi.mock('@/hooks/useMaquinaPlano', () => ({ useMaquinaPlano: () => ({ maquina: 'baader-n2', setMaquina: () => {}, maquinas: ['baader-n2', 'baader-n3'] }) }))
vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({ useRepuestosByCodigos: () => ({ bySap: new Map(), loading: false }) }))

const assets = resolve(__dirname, '../../../../../public/learning-assets/baader-142/a3c')
const paquete: PaqueteA3c = {
  datos: JSON.parse(readFileSync(resolve(assets, 'a3c-datos.json'), 'utf8')) as A3CDatos,
  dibujo: {
    '22': interiorSvg(readFileSync(resolve(assets, 'hoja22.svg'), 'utf8')),
    '23': interiorSvg(readFileSync(resolve(assets, 'hoja23.svg'), 'utf8')),
  },
}

const montar = (dosColumnas = false) =>
  render(<MemoryRouter><TarjetaA3c paquete={paquete} volverA="/aprendizaje/maquina/baader-142" etiquetaVolver="Baader 142" dosColumnas={dosColumnas} /></MemoryRouter>)

/** Abre el modo Diagnóstico (su UI es un chunk perezoso). */
async function abrir(dosColumnas = false) {
  montar(dosColumnas)
  fireEvent.click(screen.getByRole('tab', { name: 'Diagnóstico' }))
  await screen.findByTestId('diagnostico-a3c')
}
const teclado = () => within(screen.getByRole('group', { name: 'Teclado del código' }))
const escribir = (codigo: string) => [...codigo].forEach(c => fireEvent.click(teclado().getByRole('button', { name: c })))
const visor = () => screen.getByTestId('visor-codigo').textContent?.replace(/\s+/g, ' ').trim()

// El chunk perezoso se importa aquí, fuera del test: en la suite completa transformarlo y cargarlo
// tomaba 0,2–0,5 s en local y pasaba de 1 s en el CI, y el primer `findByTestId` (1 s por defecto)
// fallaba solo en el primer test. Con el módulo ya en caché, el `lazy()` de la tarjeta resuelve al tiro.
beforeAll(() => import('../diagnostico/DiagnosticoA3c'))
beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Tarjeta A3C · Diagnóstico', () => {
  it('el teclado arma el código, borra y avisa si el manual no lo tiene', async () => {
    await abrir()
    expect(visor()).toBe('E 8__')
    escribir('803')
    expect(visor()).toBe('E 803')
    fireEvent.click(teclado().getByRole('button', { name: 'Borrar' }))
    expect(visor()).toBe('E 80')
    escribir('6')
    expect(screen.getByText(/El manual no tiene ese código/)).toBeTruthy()
  })

  it('E 803: paso B3 con LED 44, X5.44 y «Manual 2005, p. 42»', async () => {
    await abrir()
    escribir('803')
    const paso = screen.getAllByTestId('paso-diagnostico')[0]!
    const p = within(paso)
    expect(p.getByText(/B3 · sensor de posición cero SM3/)).toBeTruthy()
    expect(p.getByText(/^44 · foto N2: apagado$/)).toBeTruthy()
    expect(p.getByText('X5.44')).toBeTruthy()
    expect(p.getByText('Manual 2005, p. 42')).toBeTruthy()
  })

  it('«Descartado / Sospechoso» exige antes confirmar «Máquina parada y asegurada»', async () => {
    await abrir()
    escribir('803')
    const paso = within(screen.getAllByTestId('paso-diagnostico')[0]!)
    const descartado = paso.getByRole('button', { name: 'Descartado' })
    expect((descartado as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(descartado)
    expect(descartado.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(/Prohibido rociar con spray/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Máquina parada y asegurada' }))
    fireEvent.click(descartado)
    expect(descartado.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Cerrar diagnóstico · 1 de 2 revisados/ })).toBeTruthy()
  })

  it('cambiar de código pide confirmar la seguridad otra vez; E 821 también se cierra', async () => {
    await abrir()
    escribir('803')
    fireEvent.click(screen.getByRole('button', { name: 'Máquina parada y asegurada' }))
    escribir('821')
    expect(screen.getByText(/Pulsar el pulsador I/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Cerrar diagnóstico' }) as HTMLButtonElement).disabled).toBe(true)
    escribir('803')
    expect((within(screen.getAllByTestId('paso-diagnostico')[0]!).getByRole('button', { name: 'Descartado' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('cerrar suma al contador local y lo guarda en el equipo', async () => {
    await abrir()
    expect(screen.getByTestId('contador-diagnosticos').textContent).toMatch(/^0 diagnósticos cerrados en este equipo · solo local$/)
    escribir('803')
    fireEvent.click(screen.getByRole('button', { name: 'Máquina parada y asegurada' }))
    fireEvent.click(screen.getByRole('button', { name: /Cerrar diagnóstico/ }))
    expect(screen.getByTestId('contador-diagnosticos').textContent).toMatch(/^1 diagnóstico cerrado/)
    expect(JSON.parse(localStorage.getItem('a3c-diagnostico-v1')!).cerrados).toBe(1)
    // Al cerrar, la confirmación de seguridad se pide de nuevo.
    expect(screen.getByRole('button', { name: 'Máquina parada y asegurada' })).toBeTruthy()
  })

  it('«Ver B3 en la tarjeta» vuelve a Explorar con B3 elegido y su LED 44 encendido', async () => {
    await abrir()
    escribir('803')
    fireEvent.click(screen.getByRole('button', { name: 'Ver B3 en la tarjeta' }))
    expect(screen.getByRole('tab', { name: 'Explorar' }).getAttribute('aria-selected')).toBe('true')
    expect(within(screen.getByTestId('franja-led')).getByText('LED 44')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Borne 44,/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('E 827 muestra su aviso y la pregunta para terreno', async () => {
    await abrir()
    escribir('827')
    expect(screen.getByRole('note').textContent).toMatch(/verificar en terreno/)
    expect(screen.getByText(/¿B15, B14 o los dos\?/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver B15 en la tarjeta' })).toBeTruthy()
  })

  it('pestaña Módulo: Centraje avisa la duda de dígitos; un código lleva a su resultado', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('tab', { name: 'Módulo' }))
    fireEvent.click(screen.getByRole('button', { name: /^Centraje/ }))
    const det = within(screen.getByTestId('detalle-modulo'))
    expect(det.getByRole('note').textContent).toMatch(/verificar en terreno/)
    expect(det.getByRole('button', { name: /^B1,/ })).toBeTruthy()
    fireEvent.click(det.getByRole('button', { name: 'E 801' }))
    expect(visor()).toBe('E 801')
  })

  it('pestaña LED: el 134 es B15 y lleva a E 827', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('tab', { name: 'LED' }))
    const t = within(screen.getByRole('group', { name: 'Teclado del LED' }))
    ;['1', '3', '4'].forEach(c => fireEvent.click(t.getByRole('button', { name: c })))
    const det = within(screen.getByTestId('detalle-led'))
    expect(det.getByText(/Borne X5\.134/)).toBeTruthy()
    expect(det.getByText('B15')).toBeTruthy()
    expect(det.getByText(/Lo ves encendido, igual que en la foto de la N2/)).toBeTruthy()
    fireEvent.click(det.getByRole('button', { name: 'E 827' }))
    expect(visor()).toBe('E 827')
  })

  it('PC: tres columnas y la regleta del paso elegido con su LED como señal', async () => {
    await abrir(true)
    escribir('803')
    const panel = within(screen.getByTestId('panel-regleta'))
    expect(panel.getByText(/Regleta X5 · 30–54/)).toBeTruthy()
    expect(panel.getByRole('button', { name: /^Borne 44,/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('panel-regleta').querySelectorAll('[role="group"] .a3c-punto.a3c-encendido')).toHaveLength(1)
    expect(panel.getByRole('button', { name: 'Plano · hoja 23' })).toBeTruthy()
  })
})
