/**
 * HomeRedirect — redirige `/` a la ruta configurada en Firestore
 * (`appConfig/defaultRoute`). Fallback: DEFAULT_HOME_PATH.
 *
 * Mientras carga la config muestra null (página en blanco breve, suele
 * resolver < 200ms gracias al cache de Firestore). Si la config falla,
 * cae al default sin bloquear al usuario.
 */
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DEFAULT_HOME_PATH, loadDefaultRouteConfig } from '@/services/defaultRouteConfig'

export function HomeRedirect() {
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
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
