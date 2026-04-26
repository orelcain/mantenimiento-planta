/** Formatea un número entero con separadores de miles en es-CL (puntos). */
export const fmt = (n: number): string => n.toLocaleString('es-CL')

/** Formatea un número con decimales fijos en es-CL. */
export const fmtDec = (n: number, decimals = 2): string =>
  n.toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
