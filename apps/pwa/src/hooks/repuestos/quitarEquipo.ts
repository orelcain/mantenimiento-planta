/**
 * Quitar un equipo de la asignación N:M de un repuesto.
 *
 * `equipos` (nodeIds) y `equiposCodigos` (código SAP del equipo) se escriben juntos al asignar,
 * pero NO siempre quedan paralelos: la fusión por SAP une cada arreglo por separado, y hay
 * códigos `s/c:<nombre>` para nodos sin código. Por eso el código se quita por VALOR cuando se
 * conoce, y por posición solo si los dos arreglos tienen el mismo largo. Si no se puede saber
 * cuál es, `equiposCodigos` queda como estaba: un código de más es inofensivo, uno de menos
 * borraría el de otro equipo.
 */
export interface AsignacionDeEquipos {
  equipos?: string[]
  equiposCodigos?: string[]
}

export interface EquipoAQuitar {
  nodeId: string
  /** Código SAP del equipo (`equipment.codigo`), si se conoce. */
  codigo?: string
  /** Nombre del nodo: los equipos sin código se guardaron como `s/c:<nombre>`. */
  nombre?: string
}

/** Devuelve el parche `{ equipos, equiposCodigos }`, o `null` si el repuesto no tenía ese equipo. */
export function quitarEquipoDeRepuesto(
  rep: AsignacionDeEquipos,
  equipo: EquipoAQuitar,
): { equipos: string[]; equiposCodigos: string[] } | null {
  const equipos = rep.equipos ?? []
  const codigos = rep.equiposCodigos ?? []
  const idx = equipos.indexOf(equipo.nodeId)
  if (idx < 0) return null

  const nuevosEquipos = equipos.filter((id) => id !== equipo.nodeId)

  const candidatos = [(equipo.codigo ?? '').trim(), equipo.nombre ? `s/c:${equipo.nombre}` : '']
    .filter(Boolean)
  const porValor = codigos.findIndex((c) => candidatos.includes((c ?? '').trim()))
  let nuevosCodigos = codigos
  if (porValor >= 0) nuevosCodigos = codigos.filter((_, i) => i !== porValor)
  else if (candidatos.length === 0 && codigos.length === equipos.length) nuevosCodigos = codigos.filter((_, i) => i !== idx)

  return { equipos: nuevosEquipos, equiposCodigos: nuevosCodigos }
}
