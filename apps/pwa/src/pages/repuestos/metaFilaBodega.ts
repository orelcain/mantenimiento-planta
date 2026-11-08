/**
 * Segunda línea de una fila de Bodega en el celular: lo que sirve para encontrar la pieza.
 * Equipos y valor viven en la ficha; aparecen aquí solo si la lista está ordenada por ese dato.
 */
export interface DatosMetaBodega {
  codigoSAP?: string | null
  ubicacion?: string | null
  equipos: number
  valorTotal: number
}

export function metaFilaBodega(d: DatosMetaBodega, orden: string): string {
  return [
    d.codigoSAP,
    d.ubicacion,
    orden === 'equipos' && d.equipos > 0 && `${d.equipos} ${d.equipos === 1 ? 'equipo' : 'equipos'}`,
    orden === 'valor' && d.valorTotal > 0 && `$${d.valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`,
  ].filter(Boolean).join(', ')
}
