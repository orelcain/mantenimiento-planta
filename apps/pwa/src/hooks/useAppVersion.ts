/**
 * Hook para detectar actualizaciones de la aplicación
 * Verifica periódicamente si hay una nueva versión disponible
 */

import { useState, useEffect } from 'react'
import { APP_VERSION } from '@/constants/version'
import { logger } from '@/lib/logger'
import { getAssetUrl } from '@/lib/config'

const VERSION_CHECK_INTERVAL = 60000 // 1 minuto
const LAST_VERSION_KEY = 'app_last_version'

export function useAppVersion() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [newVersion, setNewVersion] = useState<string | null>(null)

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Usar getAssetUrl para obtener la ruta correcta con BASE_URL
        const versionUrl = getAssetUrl(`/version.json?t=${Date.now()}`)
        const response = await fetch(versionUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        })
        
        if (response.ok) {
          const data = await response.json()
          const serverVersion = data.version
          
          if (serverVersion && serverVersion !== APP_VERSION) {
            logger.info('New app version detected', {
              current: APP_VERSION,
              new: serverVersion,
            })
            setNewVersion(serverVersion)
            setHasUpdate(true)
          } else {
            // Si las versiones coinciden, ocultar el banner
            setHasUpdate(false)
            setNewVersion(null)
          }
        }
      } catch (_error) {
        // Silently fail si no hay conexión o el archivo no existe aún
        // logger.debug('Error checking version')
      }
    }

    // Verificar versión guardada al iniciar
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY)
    if (lastVersion && lastVersion !== APP_VERSION) {
      logger.info('App was updated', { from: lastVersion, to: APP_VERSION })
      
      // Limpiar storage del navegador para forzar recarga de datos
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name))
        })
      }
      
      // Limpiar session storage pero mantener user auth
      const authData = sessionStorage.getItem('auth-storage')
      sessionStorage.clear()
      if (authData) {
        sessionStorage.setItem('auth-storage', authData)
      }
    }
    
    // Guardar versión actual
    localStorage.setItem(LAST_VERSION_KEY, APP_VERSION)

    // Verificar periódicamente si hay actualizaciones
    checkVersion()
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  const reload = () => {
    // Guardar la nueva versión antes de recargar
    if (newVersion) {
      localStorage.setItem(LAST_VERSION_KEY, newVersion)
    }
    window.location.reload()
  }

  return {
    hasUpdate,
    newVersion,
    currentVersion: APP_VERSION,
    reload,
  }
}
