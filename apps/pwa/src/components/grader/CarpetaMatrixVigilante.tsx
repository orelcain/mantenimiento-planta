/**
 * Vigilante de la carpeta de Matrix. Va montado en el armazón de la app (no en
 * una página): revisa al iniciar, cada 5 min y al volver la pestaña a primer
 * plano. Solo admin y solo en navegadores con showDirectoryPicker. La revisión
 * la hace `revisarCarpeta` (misma función que la carga manual); las acciones
 * viven en services/grader/carpetaMatrixAcciones.ts.
 */
import { useEffect } from "react"
import { useAuthStore, useIsAdmin } from "@/store"
import { useCarpetaMatrixEstado } from "@/store/carpetaMatrixEstado"
import { carpetaMatrixStore } from "@/services/grader/carpetaMatrixStore"
import { CM_INTERVALO_MS } from "@/services/grader/carpetaMatrix"
import { logger } from "@/lib/logger"
import { revisarSiToca, soportaCarpetaMatrix } from "@/services/grader/carpetaMatrixAcciones"

export function CarpetaMatrixVigilante() {
  const esAdmin = useIsAdmin()
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!esAdmin || !userId || !soportaCarpetaMatrix()) return
    let vivo = true
    const revisarTodo = async () => {
      if (!vivo) return
      try {
        const handle = await carpetaMatrixStore.leerHandle()
        if (!vivo) return
        if (!handle) {
          useCarpetaMatrixEstado.getState().actualizar({ estado: 'sin-autorizar' })
          return
        }
        await revisarSiToca(handle)
      } catch (e) {
        logger.error('Carpeta Matrix: no se pudo leer IndexedDB', e instanceof Error ? e : new Error(String(e)))
        useCarpetaMatrixEstado.getState().actualizar({ estado: 'error', errorTexto: 'No se pudo leer la carpeta guardada.' })
      }
    }
    void revisarTodo()
    const timer = window.setInterval(() => void revisarTodo(), CM_INTERVALO_MS)
    const alVolver = () => {
      if (document.visibilityState === 'visible') void revisarTodo()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [esAdmin, userId])

  return null
}
