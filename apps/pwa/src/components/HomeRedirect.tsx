/**
 * HomeRedirect — redirige `/` según viewport:
 *
 *   • Mobile (< 768px / Tailwind `md` breakpoint): redirige a `/dashboard`
 *     que renderiza el `<MobileHomeGrid />` con accesos directos. Esta
 *     experiencia es independiente del default config porque mobile no
 *     usa el dashboard "legacy" ni necesita ir a Análisis de Turno
 *     directo — el grid es el home esperado.
 *
 *   • Desktop (≥ 768px): redirige a la ruta configurada en Firestore
 *     (`appConfig/defaultRoute`). Fallback: DEFAULT_HOME_PATH.
 *
 * Mientras carga la config muestra null (página en blanco breve, suele
 * resolver < 200ms gracias al cache de Firestore).
 */
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DEFAULT_HOME_PATH, loadDefaultRouteConfig } from '@/services/defaultRouteConfig'

const DESKTOP_BREAKPOINT_PX = 768  // Tailwind `md`

export function HomeRedirect() {
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    // Mobile: home grid de accesos directos.
    if (typeof window !== 'undefined' && window.innerWidth < DESKTOP_BREAKPOINT_PX) {
      setTarget('/dashboard')
      return
    }
    // Desktop: ruta configurada o fallback.
    let cancelled = false
    loadDefaultRouteConfig()
      .then((cfg) => {
        if (cancelled) return
        setTarget(cfg?.path ?? DEFAULT_HOME_PATH)
      })
      .catch(() => {
        if (!cancelled) setTarget(DEFAULT_HOME_PATH)
      })
    return () => { cancelled = true }
  }, [])

  if (!target) return null
  return <Navigate to={target} replace />
}
