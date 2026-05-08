/**
 * useDevModulesVisibility — Visibilidad por-dispositivo de los items del sidebar
 * marcados con `inDevelopment: true`.
 *
 * Por default todos están ocultos (incluido para admin), evitando ruido visual
 * de módulos a medio terminar. Desde `/admin/dev-modules` el admin activa los
 * que quiera ver en su dispositivo.
 *
 * Persiste en localStorage `mant_dev_modules_visible` como JSON
 * `Record<href, boolean>`. NO se sincroniza entre dispositivos a propósito —
 * cada admin decide qué probar en su PC.
 *
 * Para que MainLayout y la página admin se mantengan sincronizados sin
 * refrescar, despachamos un CustomEvent local cuando cambia el set.
 */
import { useEffect, useState, useCallback } from 'react'

const KEY = 'mant_dev_modules_visible'
const EVENT = 'mant:dev-modules-changed'

type VisibilityMap = Record<string, boolean>

function readMap(): VisibilityMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as VisibilityMap
    }
    return {}
  } catch {
    return {}
  }
}

function writeMap(map: VisibilityMap): void {
  localStorage.setItem(KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useDevModulesVisibility() {
  const [map, setMap] = useState<VisibilityMap>(() => readMap())

  useEffect(() => {
    const onChange = () => setMap(readMap())
    window.addEventListener(EVENT, onChange)
    // `storage` event para sincronizar entre tabs del mismo origen.
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const isVisible = useCallback((href: string) => map[href] === true, [map])

  const setVisible = useCallback((href: string, visible: boolean) => {
    const next = { ...readMap(), [href]: visible }
    writeMap(next)
  }, [])

  const reset = useCallback(() => {
    writeMap({})
  }, [])

  return { isVisible, setVisible, reset, map }
}
