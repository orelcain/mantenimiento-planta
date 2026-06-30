/**
 * useAriaAlerts — carga TODOS los avisos proactivos de ARIA (KPI de turno fuera de
 * umbral + preventivas vencidas + equipos en condición crítica + incidencias críticas
 * viejas) para la tarjeta del dashboard. Reusa incidencias y equipos ya cargados en el
 * store (sin re-leer Firestore); preventivas y KPI se cargan aparte.
 *
 * Recalcula al montar y cuando cambia el conteo de incidencias/equipos (no en cada
 * cambio de referencia, para no disparar lecturas de Firestore de más).
 */
import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { getAllProactiveAlerts, type AriaAlert } from '@/services/aria/proactiveAlerts'

export function useAriaAlerts(): { alerts: AriaAlert[]; loading: boolean } {
  const incidents = useAppStore((s) => s.incidents)
  const equipment = useAppStore((s) => s.equipment)
  const [alerts, setAlerts] = useState<AriaAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getAllProactiveAlerts({ incidents, equipment })
      .then((a) => { if (active) setAlerts(a) })
      .catch(() => { if (active) setAlerts([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents.length, equipment.length])

  return { alerts, loading }
}
