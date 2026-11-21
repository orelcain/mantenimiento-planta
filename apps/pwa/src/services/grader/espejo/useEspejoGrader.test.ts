import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

type Cb = (snap: unknown) => void
interface Escucha { ruta: string; ok: Cb }
const escuchas: Escucha[] = []

vi.mock('@/services/firestoreTracked', () => ({
  collection: (_db: unknown, ...partes: string[]) => ({ ruta: partes.join('/') }),
  query: (ref: unknown) => ref,
  where: () => null,
  onSnapshot: (ref: { ruta: string }, ok: Cb) => {
    escuchas.push({ ruta: ref.ruta, ok })
    return () => {}
  },
}))
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('../graderDatosHasta', () => ({ useSesionFirebase: () => 'con' }))

const { useEspejoGrader } = await import('./useEspejoGrader')

/** Última suscripción abierta sobre una ruta (las anteriores ya se dieron de baja). */
function ultima(ruta: string): Escucha {
  const hit = [...escuchas].reverse().find((e) => e.ruta === ruta)
  if (!hit) throw new Error(`sin suscripción a ${ruta}`)
  return hit
}

/** Fila del contrato (12 celdas unidas por TAB). */
const FILA = [
  '2026-11-19', '00:02:39', '4,32 kg', '1', '720.260.738', '9', 'Premium', 'CONGELADO',
  '8 - 10 LB', 'HG', 'A', '#0',
].join('\t')

function snapHoras(filas: string[]) {
  return { docs: [{ id: 'h1', data: () => ({ filas }) }] }
}

describe('useEspejoGrader: caché al cambiar de línea', () => {
  it('no muestra piezas ni estado de la línea anterior al cambiar de línea', () => {
    escuchas.length = 0
    const { result, rerender } = renderHook(
      ({ linea }: { linea: string }) => useEspejoGrader(linea, ['2026-11-19']),
      { initialProps: { linea: 'chonchi' } },
    )
    act(() => {
      ultima('graderEspejo/chonchi__2026-11-19/horas').ok(snapHoras([FILA]))
      ultima('graderEspejoEstado').ok({
        docs: [{ id: 'L1', data: () => ({ equipo: 'L1', linea: 'chonchi', estado: {} }) }],
      })
    })
    expect(result.current.piezas).toHaveLength(1)
    expect(result.current.estado).not.toBeNull()

    rerender({ linea: 'otra' })

    // Antes del primer snapshot de la línea nueva no debe quedar nada de «chonchi».
    expect(result.current.piezas).toHaveLength(0)
    expect(result.current.estado).toBeNull()
  })
})
