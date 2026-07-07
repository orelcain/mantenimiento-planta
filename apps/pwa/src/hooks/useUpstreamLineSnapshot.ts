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
import { subscribeShoplogixShiftAuto } from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { logger } from '@/lib/logger'

export interface UseUpstreamLineSnapshotResult {
  snapshot: UpstreamLineSnapshot | null
  loading: boolean
  error: string | null
  syncedAt: Date | null
  /** Identifica la fuente de datos para debug. */
  source: 'firestore' | 'demo' | 'none'
}

/**
 * Flag: demo data DESACTIVADA por defecto en cualquier entorno (incluido DEV).
 * Solo se activa con `VITE_SHOPLOGIX_DEMO=1` explícito en apps/pwa/.env.local.
 *
 * Razón: ya pasó que en operación se confunden cifras demo con cifras reales
 * (turnos en temporada baja mostraban 11.203 ciclos fake como si fueran del
 * turno actual). El default seguro es "no mostrar datos sintéticos jamás";
 * quien quiera ver el panel sin datos reales debe activarlo a mano.
 *
 * IMPORTANTE: la demo data está hecha con `CHONCHI_EVISCERADORAS` y simula
 * paros + bandas violetas del Baader. Si la planta NO es chonchi, los
 * markers visuales son fake (paros que NO existieron en esa planta) y
 * confunden la lectura del turno. Por eso bloqueamos demo para plantas
 * distintas de chonchi aunque la flag esté activa.
 */
function isDemoEnabled(plantSlug: PlantSlug): boolean {
  if (plantSlug !== 'chonchi') return false
  const flag = (import.meta.env.VITE_SHOPLOGIX_DEMO ?? '').toString()
  return flag === '1' || flag === 'true'
}

export function useUpstreamLineSnapshot(
  dateKey: string | null | undefined,
  shiftId: string | null | undefined,
  plantSlug: PlantSlug = 'chonchi',
): UseUpstreamLineSnapshotResult {
  const [snapshot, setSnapshot] = useState<UpstreamLineSnapshot | null>(null)
  // Inicial = true cuando hay dateKey/shiftId. Evita el flash de "sin datos
  // cargados aún" entre el primer render y el setLoading(true) del useEffect.
  const [loading, setLoading] = useState(Boolean(dateKey && shiftId))
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
  const [source, setSource] = useState<'firestore' | 'demo' | 'none'>('none')

  useEffect(() => {
    if (!dateKey || !shiftId) {
      setSnapshot(null)
      setSource('none')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    // Reset inmediato al cambiar de turno: sin esto, el snapshot del turno
    // ANTERIOR queda visible (y sus scheduledStart/End alimentan cálculos de
    // ventana) hasta que la nueva suscripción emite.
    setSnapshot(null)
    setSource('none')
    setSyncedAt(null)

    // Suscripción en tiempo real: el hook se actualiza automáticamente cada
    // vez que el Cloud Function escribe a Firestore (cada ~5 min en turno activo).
    // onSnapshot devuelve `unsubscribe`, que React llama en el cleanup.
    const unsubscribe = subscribeShoplogixShiftAuto(
      dateKey,
      shiftId,
      plantSlug,
      ({ snapshot: fsSnap, syncedAt: fsSynced }) => {
        if (fsSnap) {
          setSnapshot(fsSnap)
          setSource('firestore')
          setSyncedAt(fsSynced)
          setLoading(false)
          setError(null)
        } else {
          // Sin datos en Firestore → fallback demo (DEV chonchi) o vacío
          if (isDemoEnabled(plantSlug)) {
            setSnapshot(buildDemoLineSnapshot())
            setSource('demo')
            setSyncedAt(new Date())
          } else {
            setSnapshot(null)
            setSource('none')
            setSyncedAt(null)
            logger.warn('useUpstreamLineSnapshot: sin datos Firestore')
          }
          setLoading(false)
        }
      },
    )

    return unsubscribe
  }, [dateKey, shiftId, plantSlug])

  return { snapshot, loading, error, syncedAt, source }
}
