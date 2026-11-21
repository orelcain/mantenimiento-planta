import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

type Cb = (snap: unknown) => void
interface Escucha { ruta: string; ok: Cb; mal?: () => void; activa: boolean }
const escuchas: Escucha[] = []

vi.mock('@/services/firestoreTracked', () => ({
  collection: (_db: unknown, ...partes: string[]) => ({ ruta: partes.join('/') }),
  doc: (_db: unknown, ...partes: string[]) => ({ ruta: partes.join('/') }),
  query: (ref: unknown) => ref,
  where: () => null,
  onSnapshot: (ref: { ruta: string }, ok: Cb, mal?: () => void) => {
    const e = { ruta: ref.ruta, ok, mal, activa: true }
    escuchas.push(e)
    return () => { e.activa = false }
  },
}))
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('../graderDatosHasta', () => ({ useSesionFirebase: () => 'con' }))

const { useEspejoGrader, ESPERA_RESUMEN_MS } = await import('./useEspejoGrader')

function ultima(ruta: string): Escucha {
  const hit = [...escuchas].reverse().find((e) => e.ruta === ruta && e.activa)
  if (!hit) throw new Error(`sin suscripción activa a ${ruta}`)
  return hit
}

function fila(fecha: string, hora: string): string {
  return [fecha, hora, '4,32 kg', '1', '720.260.738', '9', 'Premium', 'CONGELADO', '8 - 10 LB', 'HG', 'A', '#0'].join('\t')
}
const snapDoc = (filas: string[]) => ({ exists: () => filas.length > 0, data: () => ({ filas }) })
const VACIO = { exists: () => false, data: () => undefined }

/** Turno A del 20-11: 21:20 → 05:00 (wall-clock-as-UTC). */
const VENTANA = {
  sessionDate: '2026-11-20',
  shiftId: 'A',
  startMs: Date.parse('2026-11-20T21:20:00.000Z'),
  endMs: Date.parse('2026-11-21T05:00:00.000Z'),
}
const ESTADO = { docs: [{ id: 'L1', data: () => ({ equipo: 'L1', linea: 'chonchi', estado: {} }) }] }

function responderTodo() {
  for (const e of escuchas) if (e.activa && e.ruta.startsWith('graderEspejo/')) e.ok(VACIO)
  ultima('graderEspejoEstado').ok(ESTADO)
}

describe('useEspejoGrader: solo la ventana del turno', () => {
  it('escucha cada hora de la ventana (con margen) y nunca la colección de horas completa', () => {
    escuchas.length = 0
    renderHook(() => useEspejoGrader('chonchi', VENTANA))
    const rutas = escuchas.filter((e) => e.ruta.startsWith('graderEspejo/')).map((e) => e.ruta)
    // 20:00 del 20-11 a 06:00 del 21-11: 11 documentos de hora, ninguno del 19-11.
    expect(rutas).toHaveLength(11)
    expect(rutas[0]).toBe('graderEspejo/chonchi__2026-11-20/horas/20')
    expect(rutas).toContain('graderEspejo/chonchi__2026-11-21/horas/06')
    expect(rutas.every((r) => /\/horas\/\d{2}$/.test(r))).toBe(true)
  })

  it('reparte por turno con espera y no cuenta piezas fuera de la ventana', () => {
    vi.useFakeTimers()
    try {
      escuchas.length = 0
      const { result } = renderHook(() => useEspejoGrader('chonchi', VENTANA))
      act(() => responderTodo())
      act(() => {
        ultima('graderEspejo/chonchi__2026-11-20/horas/22').ok(snapDoc([fila('2026-11-20', '22:00:01'), fila('2026-11-20', '22:00:02')]))
        // 20:05 cae antes del margen de 1 h (20:20): se baja la hora pero no cuenta.
        ultima('graderEspejo/chonchi__2026-11-20/horas/20').ok(snapDoc([fila('2026-11-20', '20:05:00')]))
      })
      expect(result.current.piezas).toHaveLength(2)
      expect(result.current.cargandoPiezas).toBe(true) // el reparto todavía no corre
      act(() => { vi.advanceTimersByTime(ESPERA_RESUMEN_MS + 1) })
      expect(result.current.cargandoPiezas).toBe(false)
      expect(result.current.resumen?.total).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('al cambiar de línea no quedan piezas ni estado de la anterior', () => {
    escuchas.length = 0
    const { result, rerender } = renderHook(
      ({ linea }: { linea: string }) => useEspejoGrader(linea, VENTANA),
      { initialProps: { linea: 'chonchi' } },
    )
    act(() => {
      responderTodo()
      ultima('graderEspejo/chonchi__2026-11-20/horas/22').ok(snapDoc([fila('2026-11-20', '22:00:01')]))
    })
    expect(result.current.piezas).toHaveLength(1)
    expect(result.current.estado).not.toBeNull()
    rerender({ linea: 'otra' })
    expect(result.current.piezas).toHaveLength(0)
    expect(result.current.estado).toBeNull()
  })

  it('al cambiar de turno no muestra el reparto del turno anterior', () => {
    vi.useFakeTimers()
    try {
      escuchas.length = 0
      const { result, rerender } = renderHook(
        ({ v }: { v: typeof VENTANA }) => useEspejoGrader('chonchi', v),
        { initialProps: { v: VENTANA } },
      )
      act(() => responderTodo())
      act(() => { vi.advanceTimersByTime(ESPERA_RESUMEN_MS + 1) })
      expect(result.current.resumen).not.toBeNull()
      // Mismo horario, otro turno (Shoplogix lo renombró): el resumen viejo no vale.
      rerender({ v: { ...VENTANA, shiftId: 'B' } })
      expect(result.current.resumen).toBeNull()
      expect(result.current.cargandoPiezas).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('una hora que no se pudo leer se avisa (no pasa por «sin piezas»)', () => {
    escuchas.length = 0
    const { result } = renderHook(() => useEspejoGrader('chonchi', VENTANA))
    expect(result.current.errorPiezas).toBe(false)
    act(() => { ultima('graderEspejo/chonchi__2026-11-20/horas/22').mal?.() })
    expect(result.current.errorPiezas).toBe(true)
  })
})
