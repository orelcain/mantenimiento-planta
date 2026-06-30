/**
 * useAriaKpiAlerts — carga los avisos proactivos de ARIA (KPIs de turno fuera de
 * umbral) para la tarjeta del dashboard. Lectura puntual al montar; sin realtime.
 */
import { useEffect, useState } from 'react'
import { getKpiTurnoAlerts, type AriaAlert } from '@/services/aria/proactiveAlerts'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

export function useAriaKpiAlerts(plantSlug: PlantSlug = 'chonchi'): { alerts: AriaAlert[]; loading: boolean } {
  const [alerts, setAlerts] = useState<AriaAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getKpiTurnoAlerts(plantSlug)
      .then((a) => { if (active) setAlerts(a) })
      .catch(() => { if (active) setAlerts([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [plantSlug])

  return { alerts, loading }
}
