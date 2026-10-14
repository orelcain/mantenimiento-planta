import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * `true` si dentro de la app hay una entrada anterior a la que volver. React Router guarda el
 * índice de la entrada en `history.state.idx`: 0 = primera entrada de la sesión (enlace directo,
 * QR, recarga). NO usar `history.length`: cuenta también lo que había en la pestaña antes de abrir
 * la app y `navigate(-1)` podía sacar al usuario de ella (bug del HMI Grader).
 */
export function hayHistorialInterno(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  return idx > 0
}

/**
 * Función «volver» de las herramientas: atrás en el historial si se llegó navegando dentro de la
 * app (así vuelve exactamente al lugar de donde se entró: hub, ficha del equipo…); si no, a
 * `volverA`. El gesto atrás del sistema recorre el mismo historial, así que los dos coinciden.
 */
export function useVolver(volverA: string): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    if (hayHistorialInterno()) navigate(-1)
    else navigate(volverA, { replace: true })
  }, [navigate, volverA])
}
