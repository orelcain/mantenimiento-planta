/**
 * Agregar un equipo (nodo de jerarquía) a un repuesto, N:M. Función pura: el Hub y la ficha de
 * Bodega escriben el mismo patch. El código del equipo es el `codigo` del nodo; si no lo tiene,
 * queda marcado como `s/c:<nombre>` (sin código) para que se pueda quitar después.
 */
export interface NodoEquipo {
  id: string
  nombre: string
  codigo?: string
}

export function agregarEquipoARepuesto(
  rep: { equipos?: readonly string[]; equiposCodigos?: readonly string[] },
  node: NodoEquipo,
): { equipos: string[]; equiposCodigos: string[] } | null {
  if ((rep.equipos || []).includes(node.id)) return null
  return {
    equipos: [...(rep.equipos || []), node.id],
    equiposCodigos: [...(rep.equiposCodigos || []), (node.codigo || '').trim() || `s/c:${node.nombre}`],
  }
}
