/**
 * Bandera mínima «hay una pantalla completa en el teléfono» — hoy solo la usa el detalle de
 * Repuestos. La burbuja del chat (`fixed bottom-24 right-4`) tapaba la fila «Dónde se usa» y la
 * barra inferior de «Solicitar repuesto»; mientras la bandera esté levantada se esconde.
 *
 * Es un contador (no un booleano) para que dos pantallas superpuestas no se pisen al cerrar.
 * Sin Context ni Provider: el chat y el detalle viven lejos en el árbol y no hace falta más.
 */
import { useSyncExternalStore } from 'react'

let abiertas = 0
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

/** Levanta la bandera; devuelve la función que la baja (ideal para el cleanup de un efecto). */
export function levantarPantallaCompletaMovil(): () => void {
  abiertas += 1
  avisar()
  let bajada = false
  return () => {
    if (bajada) return
    bajada = true
    abiertas = Math.max(0, abiertas - 1)
    avisar()
  }
}

const suscribir = (f: () => void) => {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

/** `true` mientras alguna pantalla completa móvil esté abierta. */
export function usePantallaCompletaMovil(): boolean {
  return useSyncExternalStore(suscribir, () => abiertas > 0, () => false)
}
