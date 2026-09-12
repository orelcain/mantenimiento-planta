/**
 * La identidad estable de un repuesto entre vistas — UNA sola definición.
 *
 * Los favoritos del usuario (`repuestoFavs` en userPreferences) se guardan con esta clave y no
 * con el id del documento: un mismo repuesto aparece N veces en el catálogo, una por equipo, y
 * el favorito tiene que seguir a la pieza, no a una de sus filas.
 *
 * Estaba escrita a mano dentro de `useBodega`. Al necesitarla también en el Centro Técnico
 * Documental, copiarla habría creado dos definiciones de lo mismo — que es exactamente cómo
 * aparecieron los contadores que anunciaban un número y mostraban otro. Vive acá.
 */

export interface RepuestoIdentificable {
  id?: string
  codigoSAP?: string | null
  codigoFabricante?: string | null
}

/**
 * `sap` si lo tiene · `fab:<código de fabricante>` si no · `id:<docId>` como último recurso.
 *
 * El orden importa: el código SAP es la identidad real de la pieza para la empresa, y es lo que
 * permite que marcar un favorito en Bodega se vea marcado en el equipo y en el expediente.
 */
export function rowKeyDeRepuesto(rep: RepuestoIdentificable): string {
  const sap = (rep.codigoSAP || '').trim()
  if (sap) return sap
  const fab = (rep.codigoFabricante || '').trim()
  if (fab) return `fab:${fab}`
  return `id:${rep.id ?? ''}`
}
