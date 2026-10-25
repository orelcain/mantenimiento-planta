/**
 * Telemetría de vistas por pantalla y pestaña (25-10-2026).
 *
 * Objetivo: medir ~2 semanas qué pestañas del Análisis de Turno y qué monitores
 * se miran de verdad, ANTES de recortar nada. Mismo patrón que `registrarUso`
 * del módulo de planos (colección `planoUsos`): se escribe en `pantallaUsos`,
 * solo se CREA, y la telemetría jamás molesta al usuario.
 *
 * - Sin sesión no escribe (las aperturas anónimas del monitor público ya las
 *   cuenta `publicShiftMonitorStats`; no se duplican acá).
 * - Dedupe por sesión del navegador: misma pantalla + vista + día = 1 escritura.
 * - `dia` va en hora de Santiago, NO en UTC: a las 21:30 de Chile UTC ya es
 *   "mañana" y el día de uso quedaba corrido.
 */

export type PantallaVista = 'turno' | 'periodo' | 'monitor'

const TZ = 'America/Santiago'
const MAX_VISTA = 40

/** `YYYY-MM-DD` del instante dado, en hora de Santiago. */
export function diaSantiago(fecha: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fecha)
}

/** Recorta la vista al máximo que acepta la regla (40). */
export function vistaNormalizada(vista: string): string {
  return vista.trim().slice(0, MAX_VISTA)
}

/** Clave de dedupe en `sessionStorage`. */
export function claveVista(pantalla: PantallaVista, vista: string, dia: string): string {
  return `vista:${pantalla}:${vistaNormalizada(vista)}:${dia}`
}

export async function registrarVista(
  pantalla: PantallaVista,
  vista: string,
  extra?: { plantLineId?: string },
): Promise<void> {
  try {
    const v = vistaNormalizada(vista)
    if (!v) return
    const { auth: a, db: base } = await import('@/services/firebase')
    // Al abrir un link directo (monitor) la sesión aún se está restaurando:
    // sin esperar, esa vista se perdería y el monitor quedaría subcontado.
    await a.authStateReady?.()
    if (!a.currentUser) return
    const dia = diaSantiago()
    const clave = claveVista(pantalla, v, dia)
    if (sessionStorage.getItem(clave)) return
    sessionStorage.setItem(clave, '1')
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
    const plantLineId = extra?.plantLineId?.slice(0, 60)
    const registro = {
      plantId: 'chonchi',
      pantalla,
      vista: v,
      ...(plantLineId ? { plantLineId } : {}),
      uid: a.currentUser.uid,
      dia,
    }
    // El dev local escribe en la base de producción: si contara, las pruebas
    // inflarían la medición (ya pasa con moduloVistas). En dev solo se anota.
    if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
      // eslint-disable-next-line no-console
      console.info('[registrarVista] (dev, no se escribe)', registro)
      return
    }
    await addDoc(collection(base, 'pantallaUsos'), { ...registro, ts: serverTimestamp() })
  } catch (err) {
    // La telemetría jamás molesta al usuario; en desarrollo se avisa para que
    // una regla que rechaza la escritura no se pierda en silencio.
    // eslint-disable-next-line no-console
    if (import.meta.env.DEV) console.warn('[registrarVista] no se pudo registrar', err)
  }
}
