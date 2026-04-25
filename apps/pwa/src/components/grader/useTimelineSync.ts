/**
 * Hooks para consumir TimelineSyncContext.
 *
 * Separados del Provider en su propio archivo para mantener fast-refresh
 * compatible (la regla `react-refresh/only-export-components` requiere que
 * los archivos `.tsx` con componentes no exporten también constantes/funciones).
 */

import { useContext } from 'react'
import { TimelineSyncContext, type TimelineSyncValue } from './TimelineSyncContext'

/**
 * Hook principal — exige estar dentro de un <TimelineSyncProvider>.
 * Úsalo en componentes que NECESITAN el sync (ej. el Grader chart, los
 * Baader Gantts migrados a ECharts).
 */
export function useTimelineSync(): TimelineSyncValue {
  const ctx = useContext(TimelineSyncContext)
  if (!ctx) {
    throw new Error('useTimelineSync must be used inside <TimelineSyncProvider>')
  }
  return ctx
}

/**
 * Hook seguro — devuelve null si no hay Provider en el árbol.
 * Útil para componentes opt-in que pueden vivir tanto dentro como fuera del
 * provider (ej. durante la migración progresiva de un panel).
 */
export function useTimelineSyncOptional(): TimelineSyncValue | null {
  return useContext(TimelineSyncContext)
}
