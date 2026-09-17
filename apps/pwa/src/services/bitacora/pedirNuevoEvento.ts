/**
 * El «+» del centro de la barra de pestañas abre «Nuevo evento» cuando se está
 * en la bitácora (mockup iOS 27 aprobado 17-09-2026). Antes había una barra
 * fija «Nuevo evento» encima de la de pestañas: tres capas flotando al pie
 * (esa barra, la de pestañas y el botón del chat).
 */

/** Evento de ventana que escucha la pantalla del turno para abrir el editor. */
export const EVENTO_NUEVO_EVENTO = 'bitacora:nuevo-evento'

/** La bitácora (turno o historial): ahí el «+» crea un evento, no una incidencia. */
export function enBitacora(ruta: string): boolean {
  return ruta === '/bitacora' || ruta.startsWith('/bitacora/') || ruta.startsWith('/bitacora?')
}

/** La pantalla del turno está montada: basta avisarle (conserva el turno que se mira). */
function enPantallaDelTurno(ruta: string): boolean {
  return ruta === '/bitacora' || ruta === '/bitacora/'
}

/** Abre «Nuevo evento»: en la pantalla del turno, con un aviso; desde el historial, navegando. */
export function pedirNuevoEvento(ruta: string, navegar: (a: string) => void): void {
  if (enPantallaDelTurno(ruta)) window.dispatchEvent(new Event(EVENTO_NUEVO_EVENTO))
  else navegar('/bitacora?nuevo=1')
}

const CLAVE_ROTULO = 'bitacora.rotuloMas.v1'
/** Cuántas veces se muestra el rótulo «Nuevo evento» sobre el «+» en un teléfono. */
export const VECES_ROTULO = 3

/** Suma una vista del rótulo y dice si todavía corresponde mostrarlo. */
export function tocaMostrarRotulo(): boolean {
  try {
    const vistas = Number(localStorage.getItem(CLAVE_ROTULO) ?? '0') || 0
    if (vistas >= VECES_ROTULO) return false
    localStorage.setItem(CLAVE_ROTULO, String(vistas + 1))
    return true
  } catch {
    return false
  }
}
