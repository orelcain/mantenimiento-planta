import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PanelInspeccion } from '../PanelInspeccion'
import { PAUTA_POST_ASEO, resumenDeInspeccion, type Inspeccion } from '@/services/inspecciones/modeloInspeccion'

afterEach(cleanup)

/**
 * El error que encontró Orel (21-09-2026): el aviso decía «la inspección quedó a medias» y al
 * abrirla no dejaba marcar nada. Estaba atada al turno vigente, y el recorrido empieza a las
 * 04:00 con el turno cerrando a las 08:00 — así que al día siguiente quedaba muerta.
 *
 * Invitar a terminar algo que no se puede terminar es peor que no avisar.
 */
const inspeccion = (p: Partial<Inspeccion> = {}): Inspeccion => ({
  id: 'chonchi_2026-09-21_noche',
  plantId: 'chonchi',
  turnoId: '2026-09-21_noche',
  fechaTurno: '2026-09-21',
  banda: 'noche',
  pautaId: PAUTA_POST_ASEO.id,
  pautaVersion: 1,
  iniciadaEn: '2026-09-21T07:02:00.000Z',
  iniciadaPorNombre: 'Danilo Cortes',
  resultados: { mecanico: 'corregido' },
  notas: { mecanico: 'Cinta azul rozaba con la estructura, se corrige' },
  ...p,
})

function pintar(insp: Inspeccion, editable = true) {
  const props = {
    pauta: PAUTA_POST_ASEO,
    inspeccion: insp,
    desviaciones: [],
    resumen: resumenDeInspeccion(PAUTA_POST_ASEO, insp, []),
    editable,
    onIniciar: vi.fn(),
    onMarcar: vi.fn(),
    onNuevaDesviacion: vi.fn(),
    onAnotar: vi.fn(),
    onAbrirEvento: vi.fn(),
    onLiberar: vi.fn(),
    onDeshacerLiberacion: vi.fn(),
  }
  render(<PanelInspeccion {...props} />)
  return props
}

describe('una inspección a medias se puede terminar', () => {
  it('los puntos sin revisar siguen marcables aunque el turno ya haya cerrado', () => {
    pintar(inspeccion())
    const conformes = screen.getAllByRole('button', { name: /conforme/i })
    expect(conformes.length).toBeGreaterThan(0)
    expect(conformes.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('marcar un punto llama a onMarcar: el panel no está inerte', () => {
    const { onMarcar } = pintar(inspeccion())
    fireEvent.click(screen.getAllByRole('button', { name: /conforme/i })[1] as HTMLElement)
    expect(onMarcar).toHaveBeenCalled()
  })

  it('con todos los puntos revisados se puede entregar la planta', () => {
    const todos = Object.fromEntries(PAUTA_POST_ASEO.criterios.map((c) => [c.id, 'conforme' as const]))
    pintar(inspeccion({ resultados: todos }))
    const entregar = screen.getAllByRole('button', { name: /entregar la planta/i })
    expect(entregar.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })
})

describe('lo que SÍ cierra la inspección es la entrega', () => {
  const liberada = inspeccion({
    resultados: Object.fromEntries(PAUTA_POST_ASEO.criterios.map((c) => [c.id, 'conforme' as const])),
    liberacion: { estado: 'conforme', en: '2026-09-21T11:00:00.000Z', porNombre: 'Danilo Cortes' },
  })

  it('una vez entregada, los puntos quedan fijos', () => {
    pintar(liberada)
    expect(screen.getAllByRole('button', { name: /conforme/i }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('pero deshacer la entrega sigue disponible', () => {
    pintar(liberada)
    expect(screen.getByRole('button', { name: /deshacer la entrega/i })).toBeTruthy()
  })
})
