/**
 * Cola de fotos que hay que borrar de Storage y todavía no se pudo.
 *
 * Una foto subida a un evento que nunca se guardó (el técnico canceló, se fue a
 * otra pantalla, se quedó sin batería) es basura que NADIE puede encontrar
 * después: no hay documento que la referencie. Hasta ahora el borrado era
 * `catch(() => undefined)` y con la señal de planta cayéndose cada tanto, cada
 * falla dejaba un archivo pagándose para siempre (techo de costo del proyecto).
 *
 * La cola vive en `localStorage` para sobrevivir a que se cierre la app, y se
 * vacía sola al abrir la bitácora y cada vez que vuelve la señal.
 */

const CLAVE = 'bitacora.fotosPorBorrar'
/** Tope de seguridad: si algo se descontrola, no llenar el localStorage. */
const TOPE = 200

export interface AlmacenSimple {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
}

function almacenPorDefecto(): AlmacenSimple | null {
  try {
    return window.localStorage
  } catch {
    // Modo privado o almacenamiento bloqueado: la cola no es crítica.
    return null
  }
}

export function leerBorradosPendientes(almacen: AlmacenSimple | null = almacenPorDefecto()): string[] {
  if (!almacen) return []
  try {
    const crudo = almacen.getItem(CLAVE)
    if (!crudo) return []
    const lista: unknown = JSON.parse(crudo)
    return Array.isArray(lista) ? lista.filter((p): p is string => typeof p === 'string' && p.length > 0) : []
  } catch {
    return []
  }
}

function escribir(paths: readonly string[], almacen: AlmacenSimple | null): void {
  if (!almacen) return
  try {
    almacen.setItem(CLAVE, JSON.stringify(paths.slice(-TOPE)))
  } catch {
    // Sin espacio: se pierde la cola, no la bitácora.
  }
}

/** Anota una foto para borrarla más tarde (sin duplicar). */
export function encolarBorrado(path: string, almacen: AlmacenSimple | null = almacenPorDefecto()): void {
  if (!path) return
  const actual = leerBorradosPendientes(almacen)
  if (actual.includes(path)) return
  escribir([...actual, path], almacen)
}

export function quitarBorrado(path: string, almacen: AlmacenSimple | null = almacenPorDefecto()): void {
  const actual = leerBorradosPendientes(almacen)
  if (!actual.includes(path)) return
  escribir(actual.filter((p) => p !== path), almacen)
}

/**
 * Reintenta los borrados pendientes. Lo que vuelva a fallar queda en la cola
 * para el próximo intento: nunca se pierde la anotación.
 */
export async function purgarBorradosPendientes(
  borrar: (path: string) => Promise<void>,
  almacen: AlmacenSimple | null = almacenPorDefecto(),
): Promise<{ borradas: number; pendientes: number }> {
  const cola = leerBorradosPendientes(almacen)
  if (!cola.length) return { borradas: 0, pendientes: 0 }
  const fallidas: string[] = []
  let borradas = 0
  for (const path of cola) {
    try {
      await borrar(path)
      borradas++
    } catch {
      fallidas.push(path)
    }
  }
  escribir(fallidas, almacen)
  return { borradas, pendientes: fallidas.length }
}
