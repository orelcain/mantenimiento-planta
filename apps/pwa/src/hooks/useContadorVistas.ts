import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store'
import { registrarVistaModulo } from '@/services/moduloVistas/moduloVistas.service'

/**
 * Cuenta una vista del módulo actual cada vez que cambia la ruta (con dedupe
 * por sesión/día/módulo dentro del servicio). Se monta UNA vez, en MainLayout:
 * ese layout solo existe con sesión, así que el monitor público y el pase de
 * bitácora nunca pasan por aquí.
 */
export function useContadorVistas(): void {
  const { pathname } = useLocation() // pathname del router: ya viene sin el basename
  const user = useAuthStore((s) => s.user)
  const uid = user?.id
  const activo = user?.activo === true && !user?.paseBitacora

  useEffect(() => {
    void registrarVistaModulo({ pathname, usuario: uid ? { id: uid, activo } : null })
  }, [pathname, uid, activo])
}
