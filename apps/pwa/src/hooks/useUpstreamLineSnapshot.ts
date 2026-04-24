/**
 * Hook: carga el snapshot de la línea upstream (3 Evisceradoras Baader 142)
 * para un turno específico.
 *
 * Fuentes en orden de prioridad:
 *   1. Firestore (`shoplogix/chonchi/shifts/{dateKey}_{shiftId}/machines/*`)
 *      — escrito por Cloud Function `shoplogixSync`
 *   2. Demo data sintética (solo DEV, apagable con VITE_SHOPLOGIX_DEMO=0)
 *   3. null (panel muestra estado vacío "próximamente")
 *
 * Ver: docs/SHOPLOGIX_INTEGRATION_PLAN.md
 */

import { useState, useEffect } from 'react'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import { buildDemoLineSnapshot } from '@/services/shoplogix/shoplogixDemoData'
import { loadShoplogixShift } from '@/services/shoplogix/shoplogixShift.service'

export interface UseUpstreamLineSnapshotResult {
  snapshot: UpstreamLineSnapshot | null
  loading: boolean
  error: string | null
  syncedAt: Date | null
  /** Identifica la fuente de datos para debug. */
  source: 'firestore' | 'demo' | 'none'
}

/**
 * Flag: en DEV muestra demo data por defecto (para poder ver el panel
 * mientras no esté la integración con Firestore). Apagable con
 * `VITE_SHOPLOGIX_DEMO=0` en apps/pwa/.env.local para probar el estado vacío.
 * En producción: siempre false (nunca demo data).
 */
function isDemoEnabled(): boolean {
  const env = import.meta.env
  const flag = (env.VITE_SHOPLOGIX_DEMO ?? '').toString()
  if (flag === '0' || flag === 'false') return false
  if (flag === '1' || flag === 'true')  return true
  // Default: DEV=on, PROD=off
  return env.DEV === true
}

export function useUpstreamLineSnapshot(
  dateKey: string | null | undefined,
  shiftId: string | null | undefined,
): UseUpstreamLineSnapshotResult {
  const [snapshot, setSnapshot] = useState<UpstreamLineSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
  const [source, setSource] = useState<'firestore' | 'demo' | 'none'>('none')

  useEffect(() => {
    if (!dateKey || !shiftId) {
      setSnapshot(null)
      setSource('none')
      return
    }

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)

      // Helper: fallback a demo en DEV, o null
      const fallback = () => {
        if (isDemoEnabled()) {
          const demo = buildDemoLineSnapshot()
          if (!cancelled) {
            setSnapshot(demo)
            setSource('demo')
            setSyncedAt(new Date())
          }
        } else if (!cancelled) {
          setSnapshot(null)
          setSource('none')
          setSyncedAt(null)
        }
      }

      try {
        // 1. Intenta Firestore primero
        const { snapshot: fsSnap, syncedAt: fsSynced } = await loadShoplogixShift(dateKey, shiftId)
        if (fsSnap) {
          if (!cancelled) {
            setSnapshot(fsSnap)
            setSource('firestore')
            setSyncedAt(fsSynced)
          }
          return
        }
        // Firestore vacío → fallback
        fallback()
      } catch (e) {
        // Permission error (rules) o red caída → tratamos como "sin data" y fallback
        // No mostramos error al usuario: el panel siempre degrada gracefully.
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[useUpstreamLineSnapshot] Firestore error, usando fallback:', e instanceof Error ? e.message : e)
        }
        fallback()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [dateKey, shiftId])

  return { snapshot, loading, error, syncedAt, source }
}
