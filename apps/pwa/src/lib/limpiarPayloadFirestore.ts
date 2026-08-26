/**
 * Quitar `undefined` de un payload antes de escribirlo en Firestore, SIN
 * destruir los objetos especiales del SDK.
 *
 * POR QUÉ EXISTE
 * --------------
 * Varios servicios tenían su propia copia de un "stripUndefined" que recorría
 * **cualquier** objeto campo por campo y lo reconstruía. Eso convierte:
 *
 *   Timestamp          →  { seconds, nanoseconds }   (un mapa cualquiera)
 *   serverTimestamp()  →  { _methodName: 'serverTimestamp' }
 *   Date               →  { }                        (no tiene campos propios)
 *
 * y Firestore guarda esos objetos tal cual. Al leerlos, el parser no los
 * reconoce y cae al `new Date()` de emergencia: **el documento queda fechado
 * hoy, para siempre**.
 *
 * Ya pasó dos veces: en el Gantt (604 de 609 tareas fechadas hoy) y en
 * Evidencias Fotográficas (la única evidencia, del 9 de enero, aparecía como de
 * hoy porque `createdAt` quedó guardado como `{_methodName:'serverTimestamp'}`).
 *
 * Solo los objetos literales se recorren; el resto se devuelve intacto.
 */

export function esObjetoLiteral(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function quitarUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => quitarUndefined(item))
      .filter((item) => item !== undefined) as unknown as T
  }

  if (esObjetoLiteral(value)) {
    const salida: Record<string, unknown> = {}
    for (const [clave, valor] of Object.entries(value)) {
      if (valor === undefined) continue
      salida[clave] = quitarUndefined(valor)
    }
    return salida as T
  }

  return value
}

/**
 * Fecha escondida en un id generado por la app (`1767980073991-88piw3a`).
 *
 * Sirve de rescate cuando el `createdAt` del documento quedó ilegible: el id
 * trae el instante exacto en que se creó, así que es un dato real y no un
 * invento. Devuelve `undefined` si el id no tiene esa forma o si la fecha cae
 * fuera de lo razonable.
 */
export function fechaDesdeId(id: string): Date | undefined {
  const soloDigitos = /^(\d{13})(?:[-_].*)?$/.exec(id)
  if (!soloDigitos) return undefined
  const ms = Number(soloDigitos[1])
  const fecha = new Date(ms)
  if (Number.isNaN(fecha.getTime())) return undefined
  const anio = fecha.getUTCFullYear()
  if (anio < 2020 || anio > 2100) return undefined
  return fecha
}
