/**
 * Qué área mira el hub de Repuestos y de qué nodos puede contar repuestos sin mentir.
 *
 * POR QUÉ EXISTE
 * --------------
 * Medido el 14-09 en la jerarquía: **456 de 648 equipos cuelgan de OTRO equipo** (BOMBA VACIO
 * EN SECO N1 ← EVISCERADORA BAADER 142 N2 ← EVISCERADO). Elegir uno desde el buscador de la
 * barra lateral guardaba su `parentId` como «área»: un equipo. Al volver, el hub decía
 * «Selecciona un área» y listaba 552 repuestos de la Baader sin decir de dónde salían.
 *
 * Y aun con un área válida: el hub carga SOLO el área guardada (`loadArea`), pero la barra
 * contaba repuestos de TODAS las áreas con esos datos parciales. Quien volvía tras mirar
 * PLANTA YAL leía «PLANTA CHONCHI · 1961 rep» — son 4.409 — y PATIO y ACOPIO sin conteo.
 */

/**
 * Sube desde un nodo hasta el primero que NO es un equipo: esa es su área.
 * `padreDeEquipo` tiene solo los nodos-equipo (nodeId → parentId).
 */
export function areaContenedora(
  nodeId: string | null | undefined,
  padreDeEquipo: ReadonlyMap<string, string | null | undefined>,
): string | null {
  let actual = nodeId ?? null
  for (let saltos = 0; actual && padreDeEquipo.has(actual) && saltos < 25; saltos++) {
    actual = padreDeEquipo.get(actual) ?? null
  }
  return actual && !padreDeEquipo.has(actual) ? actual : null
}

/**
 * Los conteos de la barra que se pueden mostrar: todos si el catálogo completo está en memoria;
 * si no, solo los de las áreas cargadas y lo que cuelga de ellas. Un número parcial dicho como
 * total es peor que no mostrar número.
 */
export function conteosConfiables(
  conteos: Readonly<Record<string, number>>,
  catalogoCompleto: boolean,
  areasCargadas: readonly string[],
  estaDebajo: (nodeId: string, areaId: string) => boolean,
): Record<string, number> {
  if (catalogoCompleto) return { ...conteos }
  const out: Record<string, number> = {}
  for (const [nodo, n] of Object.entries(conteos)) {
    if (areasCargadas.some((a) => a === nodo || estaDebajo(nodo, a))) out[nodo] = n
  }
  return out
}
