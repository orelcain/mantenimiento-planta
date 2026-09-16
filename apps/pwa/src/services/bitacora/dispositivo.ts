import type { DispositivoBitacora } from './bitacora.types'

/**
 * Qué equipo es este, para la presencia («Danilo · celular») y para firmar
 * desde dónde se hizo cada cambio. No identifica a la persona: eso lo dice el
 * técnico elegido en la bitácora.
 */

const CLAVE_ID = 'bitacora.dispositivoId.v1'
let idEnMemoria: string | null = null

/** Id estable de ESTE navegador (sobrevive a cerrar la app; no es un dato personal). */
export function idDispositivo(): string {
  if (idEnMemoria) return idEnMemoria
  let id: string | null = null
  try {
    id = window.localStorage.getItem(CLAVE_ID)
  } catch {
    // Almacenamiento bloqueado: un id por sesión alcanza.
  }
  if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    const aleatorio = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random()}`
    id = `d-${aleatorio.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`
    try {
      window.localStorage.setItem(CLAVE_ID, id)
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  }
  idEnMemoria = id
  return id
}

/** Celular = pantalla angosta o puntero táctil; lo demás, PC. */
export function dispositivoActual(): DispositivoBitacora {
  try {
    const angosta = window.matchMedia('(max-width: 767px)').matches
    const tactil = window.matchMedia('(pointer: coarse)').matches
    return angosta || tactil ? 'celular' : 'pc'
  } catch {
    return 'pc'
  }
}
