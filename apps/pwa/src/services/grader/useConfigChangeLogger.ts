/**
 * Hook que envuelve `setPhysicalConfig` y registra los cambios en Firestore.
 *
 * Uso:
 *   const [physicalConfig, _setPhysicalConfig] = useState<GraderPhysicalConfig>(...)
 *   const setPhysicalConfig = useConfigChangeLogger(physicalConfig, _setPhysicalConfig)
 *
 * A partir de ahí, cada llamada a `setPhysicalConfig(fn)` ejecuta el setter
 * y luego, en background, calcula el diff vs el valor anterior y persiste en
 * `graderConfigChangeLog`.
 *
 * El registro es best-effort: si Firestore falla, no se rompe la UI
 * (sólo se logea un warning a la consola).
 */

import { useCallback, useRef } from 'react'
import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import { useAuthStore } from '@/store'
import { diffPhysicalConfig, logConfigChanges } from './graderConfigChangeLog.service'
import type { GraderPhysicalConfig } from './types'

type Setter = Dispatch<SetStateAction<GraderPhysicalConfig>>

export function useConfigChangeLogger(
  current: GraderPhysicalConfig,
  rawSetter: Setter,
  options?: { reason?: string; enabledRef?: MutableRefObject<boolean> },
): Setter {
  const user = useAuthStore((s) => s.user)
  const prevRef = useRef(current)
  prevRef.current = current

  return useCallback<Setter>(
    (update) => {
      rawSetter((prev) => {
        const next = typeof update === 'function' ? (update as (p: GraderPhysicalConfig) => GraderPhysicalConfig)(prev) : update
        const enabled = options?.enabledRef ? options.enabledRef.current : true
        if (enabled && user && next !== prev) {
          // best-effort: no await
          const diffs = diffPhysicalConfig(prev as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
          if (diffs.length > 0) {
            const entries = diffs.map((d) => ({
              field: d.field,
              prevValue: d.prevValue,
              nextValue: d.nextValue,
              reason: options?.reason,
              changedBy: user.id,
            }))
            logConfigChanges(entries).catch((err) => {
              console.warn('[useConfigChangeLogger] Error logueando cambios:', err)
            })
          }
        }

        return next
      })
    },
    [rawSetter, user, options?.reason, options?.enabledRef],
  )
}
