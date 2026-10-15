/**
 * Origen de una foto de repuesto, deducido de la ruta de Storage:
 * `repuestos/<id>/<sap>/fotos/...` = bodega, `.../manual/...` = recorte del manual.
 */
export type OrigenFoto = 'bodega' | 'manual' | 'otra'

export function origenDeFoto(url: string): OrigenFoto {
  if (!url) return 'otra'
  let ruta = url.split('?')[0] ?? ''
  try {
    ruta = decodeURIComponent(ruta)
  } catch {
    /* URL con % mal formado: se usa tal cual */
  }
  if (ruta.includes('/fotos/')) return 'bodega'
  if (ruta.includes('/manual/')) return 'manual'
  return 'otra'
}
