/**
 * Bandera mínima «esconder la burbuja del chat en el teléfono». La usan el detalle de Repuestos
 * (pantalla completa) y todo el módulo Repuestos bajo el corte móvil: la burbuja
 * (`fixed bottom-24 right-4`) tapaba la estrella de las filas, la fila «Dónde se usa» y la barra
 * inferior de «Solicitar repuesto». Mientras la bandera esté levantada se esconde; ARIA sigue a un
 * toque desde el menú ⋯ de Repuestos mediante `abrirAria`.
 *
 * Es un contador (no un booleano) para que dos pantallas superpuestas no se pisen al cerrar.
 * Sin Context ni Provider: el chat y el detalle viven lejos en el árbol y no hace falta más.
 */
import { useSyncExternalStore } from 'react'

let abiertas = 0
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

/** Levanta la bandera; devuelve la función que la baja (ideal para el cleanup de un efecto). */
export function ocultarBurbujaChat(): () => void {
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

/** `true` mientras alguien pida esconder la burbuja del chat. */
export function useBurbujaChatOculta(): boolean {
  return useSyncExternalStore(suscribir, () => abiertas > 0, () => false)
}

/** Nombres anteriores, se conservan para no romper a quien aún los importe. */
export const levantarPantallaCompletaMovil = ocultarBurbujaChat
export const usePantallaCompletaMovil = useBurbujaChatOculta

/* ───────── Abrir ARIA desde fuera del chat ───────── */

type AbrirAria = (consulta?: string) => void
let abrirAriaFn: AbrirAria | null = null
let consultaPendiente: { consulta?: string } | null = null

/** El ChatBot registra aquí cómo se abre. Devuelve la baja. Si alguien pidió abrir antes, se atiende al registrar. */
export function registrarAbrirAria(fn: AbrirAria): () => void {
  abrirAriaFn = fn
  if (consultaPendiente) {
    const p = consultaPendiente
    consultaPendiente = null
    fn(p.consulta)
  }
  return () => { if (abrirAriaFn === fn) abrirAriaFn = null }
}

/** Abre el chat de ARIA; con `consulta`, la deja escrita en el campo (no la envía). */
export function abrirAria(consulta?: string): void {
  if (abrirAriaFn) abrirAriaFn(consulta)
  else consultaPendiente = { consulta }
}
