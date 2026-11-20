import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { agruparPorDia, listaNavegable, useTurnoArchivo, vecinoEnLista, _limpiarCacheArchivo } from '../turnosArchivo'
import type { TurnoMonitorEntrada } from '@/services/shoplogix/publicShiftMonitor.service'

const entrada = (id: string, ini: string, pz: number, extra = false): TurnoMonitorEntrada => ({
  shiftDocId: id,
  dateKey: id.slice(0, 10),
  shiftId: id.slice(11),
  live: { scheduledStart: `${id.slice(0, 10)}T${ini}:00.000Z`, totalPieces: pz } as TurnoMonitorEntrada['live'],
  ...(extra ? { extraordinario: { desde: `${id.slice(0, 10)}T${ini}:00.000Z`, hasta: `${id.slice(0, 10)}T23:00:00.000Z` } } : {}),
})

// Chonchi: «Turno 1» arranca 21:30 y «Turno 2» 09:00.
const vistas = [
  entrada('2026-11-20_Turno 2', '09:00', 7000),
  entrada('2026-11-19_Turno 1', '21:30', 5000),
  entrada('2026-11-19_Turno 2', '09:00', 6000),
]

describe('listaNavegable', () => {
  it('pone el vigente primero y ordena el resto por fecha y arranque real', () => {
    const lista = listaNavegable(vistas, {
      archivoTurnos: [
        { id: '2026-11-19_Turno 1', ini: '21:30', pz: 5000 }, // repetido con el doc: se queda el del doc
        { id: '2026-10-25_Turno 2', ini: '09:00', pz: 6100 },
        { id: '2026-10-25_Turno 1', ini: '21:30', pz: 4900 },
      ],
    })
    expect(lista.map(t => t.shiftDocId)).toEqual([
      '2026-11-20_Turno 2',
      '2026-11-19_Turno 1',
      '2026-11-19_Turno 2',
      '2026-10-25_Turno 1',
      '2026-10-25_Turno 2',
    ])
    expect(lista[1]!.enDoc).toBe(true)
    expect(lista[3]!.enDoc).toBe(false)
    expect(lista[3]!.piezas).toBe(4900)
  })

  it('sin `archivoTurnos` (doc viejo) cae a `shiftStats`', () => {
    const lista = listaNavegable(vistas, {
      shiftStats: [{ shiftDocId: '2026-10-30_Turno 2', dateKey: '2026-10-30', shiftId: 'Turno 2', total: 5500, producingMin: 400 }],
    })
    expect(lista[lista.length - 1]).toMatchObject({ shiftDocId: '2026-10-30_Turno 2', piezas: 5500, enDoc: false })
  })

  it('marca el turno del sensor y toma su hora de las piezas reales', () => {
    const lista = listaNavegable([vistas[0]!, entrada('2026-11-19_Unscheduled@16:15', '16:15', 9553, true)], {})
    expect(lista[1]).toMatchObject({ extraordinario: true, ini: '16:15' })
  })

  it('sin vistas no hay lista', () => {
    expect(listaNavegable([], { archivoTurnos: [{ id: '2026-10-25_Turno 1', ini: null, pz: 1 }] })).toEqual([])
  })
})

describe('vecinoEnLista y agruparPorDia', () => {
  const lista = listaNavegable(vistas, { archivoTurnos: [{ id: '2026-10-25_Turno 2', ini: '09:00', pz: 6100 }] })
  it('+1 va al más viejo, −1 al más nuevo, y en los bordes no hay', () => {
    expect(vecinoEnLista(lista, '2026-11-19_Turno 2', 1)?.shiftDocId).toBe('2026-10-25_Turno 2')
    expect(vecinoEnLista(lista, '2026-10-25_Turno 2', -1)?.shiftDocId).toBe('2026-11-19_Turno 2')
    expect(vecinoEnLista(lista, '2026-10-25_Turno 2', 1)).toBeNull()
    expect(vecinoEnLista(lista, '2026-11-20_Turno 2', -1)).toBeNull()
    expect(vecinoEnLista(lista, 'no-existe', 1)).toBeNull()
  })
  it('agrupa por día sin reordenar', () => {
    expect(agruparPorDia(lista).map(g => [g.dateKey, g.turnos.length])).toEqual([
      ['2026-11-20', 1], ['2026-11-19', 2], ['2026-10-25', 1],
    ])
  })
})

describe('useTurnoArchivo', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { _limpiarCacheArchivo(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('no pide nada si el turno ya viaja en el doc', () => {
    const { result } = renderHook(() => useTurnoArchivo('tok', '2026-11-19_Turno 1', true, true))
    expect(result.current.estado).toBe('nada')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pide el turno una vez, lo entrega y lo recuerda tras remontar', async () => {
    const e = entrada('2026-10-25_Turno 2', '09:00', 6100)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, entrada: e }) })
    const a = renderHook(() => useTurnoArchivo('tok', e.shiftDocId, false, true))
    expect(a.result.current.estado).toBe('cargando')
    await waitFor(() => expect(a.result.current.estado).toBe('ok'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ token: 'tok', shiftDocId: e.shiftDocId })
    a.unmount()
    // La página se remonta al navegar: el turno ya está, sin otro pedido.
    const b = renderHook(() => useTurnoArchivo('tok', e.shiftDocId, false, true))
    expect(b.result.current).toMatchObject({ estado: 'ok', entrada: e })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('si la función responde error (o aún no existe) ofrece reintentar', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    const { result } = renderHook(() => useTurnoArchivo('tok', '2026-10-25_Turno 2', false, true))
    await waitFor(() => expect(result.current.estado).toBe('error'))
    const e = entrada('2026-10-25_Turno 2', '09:00', 6100)
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ entrada: e }) })
    if (result.current.estado === 'error') result.current.reintentar()
    await waitFor(() => expect(result.current.estado).toBe('ok'))
  })

  it('descarta una respuesta de OTRO turno', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ entrada: entrada('2026-10-24_Turno 1', '21:30', 1) }) })
    const { result } = renderHook(() => useTurnoArchivo('tok', '2026-10-25_Turno 2', false, true))
    await waitFor(() => expect(result.current.estado).toBe('error'))
  })
})
