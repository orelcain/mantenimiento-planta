/**
 * @deprecated FASE 12 — redirige a /analisis-grader/turno/:shiftId.
 * Conservada para compatibilidad con links ?date=&shift= existentes.
 */

import { useSearchParams, Navigate } from 'react-router-dom'

export function AnalisisGraderDetallePage() {
  const [searchParams] = useSearchParams()
  const dateKey = searchParams.get('date')
  const shiftId = searchParams.get('shift')

  if (dateKey && shiftId) {
    return (
      <Navigate
        to={`/analisis-grader/turno/${dateKey}__${encodeURIComponent(shiftId)}`}
        replace
      />
    )
  }
  return <Navigate to="/analisis-grader" replace />
}
