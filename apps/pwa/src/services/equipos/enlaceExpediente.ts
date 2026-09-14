/**
 * El enlace al expediente de un equipo en el Centro Técnico Documental.
 *
 * **Para qué:** la lista de repuestos de un equipo vive en el expediente
 * (Aprendizaje → Centro Técnico Documental → el equipo → pestaña Recursos),
 * mientras el módulo Repuestos vive en Equipamiento. Desde Repuestos no había
 * forma de saltar al expediente del equipo que se estaba mirando: había que
 * cambiar de módulo y buscarlo de nuevo a mano.
 *
 * **Por qué `nodo` y no `eq`:** el expediente se abre con `?eq=<id del
 * Equipment>`, pero el módulo Repuestos trabaja con **nodeIds de `hierarchy`**
 * (`repuesto.equipos[]` los guarda, y el cache de equipos los usa como `id`).
 * Traducir uno en otro allá obligaría a cargar los equipos solo para armar un
 * link, así que el expediente acepta `?nodo=` y resuelve él mismo.
 */

/** Las pestañas del expediente, por su `value` en los Tabs. */
export type TabExpediente =
  | 'info' | 'ficha' | 'protocolo' | 'tablero'
  | 'recursos' | 'trabajos' | 'fotos' | 'notas' | 'qr'

export const RUTA_EXPEDIENTE = '/centro-tecnico-documental'

/**
 * @param nodeId el nodo de `hierarchy` del equipo
 * @param tab a qué pestaña entrar; por defecto la de repuestos y documentos
 * @param opciones.buscar texto con que llega filtrada la lista de materiales. Viniendo desde
 *   un repuesto concreto es su código: sin él se llegaba a la lista completa (476 posiciones en
 *   una Baader) y había que volver a buscar la pieza que se estaba mirando.
 */
export function rutaExpedienteEquipo(
  nodeId: string,
  tab: TabExpediente = 'recursos',
  opciones: { buscar?: string } = {},
): string {
  const p = new URLSearchParams({ nodo: nodeId, tab })
  const buscar = opciones.buscar?.trim()
  if (buscar) p.set('q', buscar)
  return `${RUTA_EXPEDIENTE}?${p.toString()}`
}
