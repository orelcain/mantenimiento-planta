/**
 * La ubicación de un equipo, corta, para el listado.
 *
 * **El problema:** en el Centro Técnico Documental hay seis KNURO, seis
 * EVISCERADORA BAADER 142 y varios más que **se llaman igual en las dos
 * plantas** — el nombre no distingue nada y el código SAP hay que sabérselo de
 * memoria. La fila mostraba nombre, código y apodo, así que no se sabía cuál
 * era cuál hasta abrir el equipo.
 *
 * El dato ya estaba: `equipment.hierarchyPath` trae la ruta entera
 * (`Aquachile Antarfood Chonchi > PLANTA YAL > PROCESO > EVISCERADO >
 * EVISCERADORA BAADER 142 N1`). Entera no entra en una fila, así que se resume
 * en lo que de verdad distingue: **la planta y el área donde está**.
 *
 * Se descartan los dos extremos: la raíz es la empresa y es igual para todos, y
 * el último tramo es el equipo mismo, que ya se muestra al lado.
 */

/** Nivel que no aporta nada: aparece en todas las rutas. */
const RELLENO = new Set(['PROCESO'])

/**
 * @param hierarchyPath la ruta completa, con `>` de separador
 * @returns algo como `PLANTA YAL · EVISCERADO`, o null si no hay con qué
 */
export function ubicacionCorta(hierarchyPath?: string): string | null {
  const partes = (hierarchyPath ?? '')
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean)

  // Sin la empresa (primera) y sin el equipo (última).
  const medio = partes.slice(1, -1).filter((p) => !RELLENO.has(p.toUpperCase()))
  if (medio.length === 0) return null
  if (medio.length === 1) return medio[0]!

  // La planta y el área: el primer tramo y el último son los que ubican.
  const planta = medio[0]!
  const area = medio[medio.length - 1]!
  return planta === area ? planta : `${planta} · ${area}`
}
