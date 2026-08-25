/**
 * Leer una fecha que viene de Firestore sin confiar en su tipo.
 *
 * POR QUÉ EXISTE
 * --------------
 * El mismo campo no siempre llega igual. En `baader200-sections`, de 23
 * documentos **14 tienen `updatedAt` como Timestamp y 9 como número** (epoch en
 * milisegundos). El parser hacía `data.updatedAt?.toDate()`: con los 9 números
 * eso es `TypeError: toDate is not a function`, la carga entera se caía y la
 * pantalla de la Baader 200 se quedaba para siempre en "Selecciona una sección
 * del menú", con las 23 secciones invisibles.
 *
 * Un solo documento con el tipo equivocado tumbaba la pantalla completa.
 *
 * Acepta: `Date`, `Timestamp` (cualquier objeto con `toDate`), el mapa plano en
 * que se convierte un Timestamp mal guardado (`{seconds}` / `{_seconds}`),
 * número de milisegundos y string ISO. Devuelve `undefined` si no reconoce nada
 * — quien llama decide qué mostrar, en vez de recibir un "hoy" inventado.
 */
export function aFechaSegura(valor: unknown): Date | undefined {
  if (valor == null) return undefined

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? undefined : valor
  }

  if (typeof valor === 'object') {
    const conToDate = valor as { toDate?: () => Date }
    if (typeof conToDate.toDate === 'function') {
      const fecha = conToDate.toDate()
      return Number.isNaN(fecha.getTime()) ? undefined : fecha
    }

    const crudo = valor as {
      seconds?: unknown; _seconds?: unknown
      nanoseconds?: unknown; _nanoseconds?: unknown
    }
    const segundos = typeof crudo.seconds === 'number'
      ? crudo.seconds
      : (typeof crudo._seconds === 'number' ? crudo._seconds : null)
    if (segundos !== null) {
      const nanos = typeof crudo.nanoseconds === 'number'
        ? crudo.nanoseconds
        : (typeof crudo._nanoseconds === 'number' ? crudo._nanoseconds : 0)
      const fecha = new Date(segundos * 1000 + Math.round(nanos / 1e6))
      return Number.isNaN(fecha.getTime()) ? undefined : fecha
    }
    return undefined
  }

  if (typeof valor === 'number' || typeof valor === 'string') {
    const fecha = new Date(valor)
    return Number.isNaN(fecha.getTime()) ? undefined : fecha
  }

  return undefined
}
