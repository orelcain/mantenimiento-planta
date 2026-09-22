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
    onFijarHora: vi.fn(),
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

/**
 * §8 pide las desviaciones «corregidas **o controladas** antes de la puesta en marcha». Tocar
 * «No» solo ofrecía corregido o pendiente: la falla que se sobrellevó a mano toda la noche
 * para no detener el proceso no tenía dónde ir (Orel, 21-09-2026).
 */
describe('un punto se puede dejar controlado', () => {
  it('la pregunta ofrece las tres salidas', () => {
    pintar(inspeccion())
    fireEvent.click(screen.getAllByRole('button', { name: /^no$/i })[0] as HTMLElement)
    expect(screen.getByRole('button', { name: /lo corregí/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /pero está controlado/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /queda pendiente/i })).toBeTruthy()
  })

  it('controlado marca el punto y abre la desviación: el pendiente pasa al turno siguiente', () => {
    const { onMarcar, onNuevaDesviacion } = pintar(inspeccion())
    fireEvent.click(screen.getAllByRole('button', { name: /^no$/i })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: /pero está controlado/i }))
    expect(onMarcar).toHaveBeenCalledWith(expect.any(String), 'controlado')
    expect(onNuevaDesviacion).toHaveBeenCalled()
  })
})

/**
 * Una pauta del domingo completada el lunes a las 18:09 quedaba con siete marcas a las 18:09 y
 * un «recorrido de 833 min» que nadie caminó. La hora se puede corregir o dejar en blanco.
 */
describe('la hora del punto se puede corregir', () => {
  it('un punto marcado sin hora lo dice, y deja ponerla', () => {
    pintar(inspeccion())
    fireEvent.click(screen.getByRole('button', { name: /sin hora/i }))
    expect(screen.getByLabelText(/a qué hora se revisó/i)).toBeTruthy()
  })

  it('«Dejarlo sin hora» manda null: el correo no inventa ninguna', () => {
    const { onFijarHora } = pintar(inspeccion({ marcas: { mecanico: '2026-09-21T07:16:00.000Z' } }))
    fireEvent.click(screen.getAllByRole('button', { name: /^\d{2}:\d{2}$/ })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: /dejarlo sin hora/i }))
    expect(onFijarHora).toHaveBeenCalledWith('mecanico', null)
  })
})

/**
 * HIG «Boxes» (21-09-2026): un contenedor agrupa solo si es pequeño respecto al suyo, y no se
 * anida uno dentro de otro — los subgrupos se marcan con relleno y alineación. Cada punto de
 * la pauta es una card, y dentro llevaba hasta cuatro rectángulos rellenos más: la
 * observación, el bloque de la pregunta, el editor de hora y la fila de la desviación.
 *
 * Los botones y los campos NO entran en la regla: su relleno es la superficie del control.
 */
describe('sin cajas dentro de cajas', () => {
  const conNota = inspeccion({ notas: { mecanico: 'Cinta azul rozaba con la estructura' } })

  it('la observación es una línea con su punto, no un bloque ámbar a todo el ancho', () => {
    pintar(conNota)
    const nota = screen.getByRole('button', { name: /cinta azul rozaba/i })
    expect(nota.className).not.toMatch(/bg-/)
    expect(nota.className).not.toMatch(/rounded-ctl/)
  })

  it('la pregunta «¿quedó resuelto?» se separa con un filete, no con un panel relleno', () => {
    pintar(inspeccion())
    fireEvent.click(screen.getAllByRole('button', { name: /^no$/i })[0] as HTMLElement)
    const bloque = screen.getByText(/quedó resuelto antes de entregar/i).parentElement
    expect(bloque?.className).toMatch(/border-t/)
    expect(bloque?.className).not.toMatch(/bg-muted-foreground\/10/)
  })

  it('la liberación es una lista agrupada, no cuatro tarjetas apiladas', () => {
    const todos = Object.fromEntries(PAUTA_POST_ASEO.criterios.map((c) => [c.id, 'conforme' as const]))
    pintar(inspeccion({ resultados: todos }))
    const opcion = screen.getByRole('button', { name: /con pendientes controlados/i })
    expect(opcion.className).toMatch(/border-t/)
    expect(opcion.className).not.toMatch(/bg-primary\/8|bg-muted-foreground\/8/)
  })
})
