/**
 * Cuántos equipos cuelgan de cada nodo, contando todo lo que hay abajo.
 *
 * POR QUÉ
 * -------
 * En el árbol de jerarquías cada equipo cuelga de su propio nodo hoja: de las
 * 552 etiquetas que muestra la pantalla, **las 552 dicen "1 equipos"**. O sea,
 * el único número que se ve nunca informa nada, y con el árbol contraído no hay
 * forma de saber cuántos equipos tiene un área sin expandir 191 nodos y contar
 * de a uno.
 *
 * Con el total del subárbol, "PLANTA CHONCHI" dice cuántos equipos tiene abajo
 * sin abrir nada.
 */

export interface NodoConHijos {
  id: string
  children?: NodoConHijos[]
}

/**
 * Devuelve, por nodo, el total de equipos de su subárbol (incluidos los suyos).
 * Un nodo repetido en el árbol se cuenta una sola vez.
 */
export function contarEquiposPorSubarbol(
  raices: readonly NodoConHijos[],
  equiposPorNodo: ReadonlyMap<string, { length: number }>,
): Map<string, number> {
  const total = new Map<string, number>()
  const visitados = new Set<string>()

  const recorrer = (nodo: NodoConHijos): number => {
    // Segunda aparición del mismo id (árbol mal armado o ciclo): aporta 0, para
    // no inflar el total del padre contando lo mismo dos veces.
    if (visitados.has(nodo.id)) return 0
    visitados.add(nodo.id)

    let suma = equiposPorNodo.get(nodo.id)?.length ?? 0
    for (const hijo of nodo.children ?? []) suma += recorrer(hijo)

    total.set(nodo.id, suma)
    return suma
  }

  for (const raiz of raices) recorrer(raiz)
  return total
}

/** "1 equipo" / "48 equipos" — el plural estaba fijo en "equipos". */
export function etiquetaEquipos(cantidad: number): string {
  return cantidad === 1 ? '1 equipo' : `${cantidad} equipos`
}
