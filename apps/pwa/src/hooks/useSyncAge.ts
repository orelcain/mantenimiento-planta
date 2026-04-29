/**
 * Hook: contador vivo de cuánto tiempo lleva el dato de Shoplogix sin actualizarse.
 *
 * Se actualiza cada 5 segundos y devuelve:
 *   - `label`      — texto legible ("hace 2m 34s", "hace 8m", etc.)
 *   - `colorClass` — clase Tailwind según urgencia
 *     · emerald (< 5 min)  — datos frescos (dentro de 1 ciclo de sync)
 *     · amber   (5-10 min) — datos de 1 ciclo atrás
 *     · red     (> 10 min) — datos con 2+ ciclos de delay
 *   - `seconds`    — segundos desde `syncedAt` (útil para animaciones)
 *   - `isStale`    — true si supera el umbral configurado (> 10 min)
 *
 * Uso:
 *   const age = useSyncAge(upstreamLine.syncedAt)
 *   <span className={age.colorClass}>{age.label}</span>
 */

import { useState, useEffect } from 'react'

const STALE_SEC       = 10 * 60   // > 10 min → rojo
const WARN_SEC        =  5 * 60   // > 5 min  → ámbar
const TICK_INTERVAL   =  5_000    // actualizar cada 5 s

export interface SyncAge {
  label: string
  colorClass: string
  bgClass: string
  seconds: number
  isStale: boolean
}

export function useSyncAge(syncedAt: Date | null | undefined): SyncAge {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL)
    return () => clearInterval(id)
  }, [])

  if (!syncedAt) {
    return {
      label:      'Sin sync',
      colorClass: 'text-muted-foreground',
      bgClass:    'bg-muted/40',
      seconds:    0,
      isStale:    true,
    }
  }

  const seconds = Math.max(0, Math.round((now - syncedAt.getTime()) / 1000))

  // Etiqueta legible
  let label: string
  if (seconds < 60) {
    label = `hace ${seconds}s`
  } else {
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    label = sec > 0 ? `hace ${min}m ${sec}s` : `hace ${min}m`
  }

  const isStale = seconds > STALE_SEC

  const colorClass = seconds < WARN_SEC
    ? 'text-emerald-400'
    : seconds < STALE_SEC
    ? 'text-amber-400'
    : 'text-red-400'

  const bgClass = seconds < WARN_SEC
    ? 'bg-emerald-500/10'
    : seconds < STALE_SEC
    ? 'bg-amber-500/10'
    : 'bg-red-500/10'

  return { label, colorClass, bgClass, seconds, isStale }
}
