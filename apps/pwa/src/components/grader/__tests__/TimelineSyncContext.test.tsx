/**
 * Tests del TimelineSyncContext — verifica:
 *   - Provider expone range/setRange/connectGroupId
 *   - setRange es idempotente (no causa re-render cuando el valor es igual)
 *   - useTimelineSync lanza error fuera del provider
 *   - useTimelineSyncOptional devuelve null fuera del provider
 *   - El groupId default es 'timeline-sync', se puede sobreescribir
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { TimelineSyncProvider } from '../TimelineSyncContext'
import { useTimelineSync, useTimelineSyncOptional } from '../useTimelineSync'
import type { ReactNode } from 'react'

function wrap(groupId?: string) {
  return ({ children }: { children: ReactNode }) =>
    <TimelineSyncProvider groupId={groupId}>{children}</TimelineSyncProvider>
}

describe('TimelineSyncContext', () => {
  it('provee range=null, hover=null, lotChanges=[] y groupId default', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    expect(result.current.range).toBeNull()
    expect(result.current.hover).toBeNull()
    expect(result.current.lotChanges).toEqual([])
    expect(result.current.connectGroupId).toBe('timeline-sync')
    expect(typeof result.current.setRange).toBe('function')
    expect(typeof result.current.setHover).toBe('function')
    expect(typeof result.current.setLotChanges).toBe('function')
  })

  it('respeta el groupId pasado al Provider', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap('group-feb-26') })
    expect(result.current.connectGroupId).toBe('group-feb-26')
  })

  it('setRange actualiza el rango', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    act(() => result.current.setRange({ startMs: 1000, endMs: 2000 }))
    expect(result.current.range).toEqual({ startMs: 1000, endMs: 2000 })
    act(() => result.current.setRange(null))
    expect(result.current.range).toBeNull()
  })

  it('setRange es idempotente con el mismo objeto', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    const obj = { startMs: 100, endMs: 200 }
    act(() => result.current.setRange(obj))
    const firstRange = result.current.range
    act(() => result.current.setRange(obj))
    // Mismo identity: no hay nueva referencia
    expect(result.current.range).toBe(firstRange)
  })

  it('setRange es idempotente con valores estructuralmente iguales', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    act(() => result.current.setRange({ startMs: 100, endMs: 200 }))
    const firstRange = result.current.range
    // Nueva referencia pero mismos valores → no actualiza
    act(() => result.current.setRange({ startMs: 100, endMs: 200 }))
    expect(result.current.range).toBe(firstRange)
  })

  it('setRange null → null es idempotente', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    expect(result.current.range).toBeNull()
    act(() => result.current.setRange(null))
    expect(result.current.range).toBeNull()
  })

  it('useTimelineSync lanza error fuera del provider', () => {
    // Silenciar error de React 18 para este test
    const consoleError = console.error
    console.error = () => {}
    try {
      expect(() => renderHook(() => useTimelineSync())).toThrow(
        /must be used inside <TimelineSyncProvider>/,
      )
    } finally {
      console.error = consoleError
    }
  })

  it('useTimelineSyncOptional devuelve null fuera del provider', () => {
    const { result } = renderHook(() => useTimelineSyncOptional())
    expect(result.current).toBeNull()
  })

  it('useTimelineSyncOptional devuelve el value dentro del provider', () => {
    const { result } = renderHook(() => useTimelineSyncOptional(), { wrapper: wrap() })
    expect(result.current).not.toBeNull()
    expect(result.current?.range).toBeNull()
    expect(result.current?.hover).toBeNull()
  })

  it('setHover actualiza el estado de hover', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    act(() => result.current.setHover({ ms: 1700000000000, originId: 'chart-A' }))
    expect(result.current.hover).toEqual({ ms: 1700000000000, originId: 'chart-A' })
    act(() => result.current.setHover(null))
    expect(result.current.hover).toBeNull()
  })

  it('setHover es idempotente con valores estructuralmente iguales', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    act(() => result.current.setHover({ ms: 100, originId: 'X' }))
    const firstHover = result.current.hover
    act(() => result.current.setHover({ ms: 100, originId: 'X' }))
    expect(result.current.hover).toBe(firstHover)
  })

  it('setLotChanges actualiza la lista de cambios de lote', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    const lots = [{ ms: 1000, lot: '142' }, { ms: 2000, lot: '143' }]
    act(() => result.current.setLotChanges(lots))
    expect(result.current.lotChanges).toEqual(lots)
  })

  it('setLotChanges es idempotente con arrays estructuralmente iguales', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    const lotsA = [{ ms: 1000, lot: '142' }]
    const lotsB = [{ ms: 1000, lot: '142' }]  // mismo contenido, distinta ref
    act(() => result.current.setLotChanges(lotsA))
    const first = result.current.lotChanges
    act(() => result.current.setLotChanges(lotsB))
    expect(result.current.lotChanges).toBe(first)  // misma referencia
  })

  it('setLotChanges detecta cambios cuando longitud o contenido cambian', () => {
    const { result } = renderHook(() => useTimelineSync(), { wrapper: wrap() })
    act(() => result.current.setLotChanges([{ ms: 1000, lot: '142' }]))
    act(() => result.current.setLotChanges([{ ms: 1000, lot: '142' }, { ms: 2000, lot: '143' }]))
    expect(result.current.lotChanges).toHaveLength(2)
    act(() => result.current.setLotChanges([{ ms: 1000, lot: 'OTHER' }, { ms: 2000, lot: '143' }]))
    expect(result.current.lotChanges[0]!.lot).toBe('OTHER')
  })
})
