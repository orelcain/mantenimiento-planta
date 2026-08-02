/**
 * Nombre de máquina para toda la UI del módulo — fuente única.
 *
 * Shoplogix las nombra "Evisceradora 1/2/3" (verificado en su vista
 * Chronological de Planta Chonchi) y en planta se les dice "Baader". Antes cada
 * pantalla abreviaba por su cuenta: "M1" en la leyenda del gráfico, "Ev 1" en
 * las filas por máquina y "Evisceradora 1" en las tarjetas — tres nombres para
 * la misma máquina, a veces en la misma pantalla.
 *
 * Vive en `services/` y no junto a un componente para que lo puedan usar
 * también los servicios puros (plan de acción, insights) sin importar UI.
 */

/**
 * Etiqueta corta y estable de una máquina.
 *
 * Las evisceradoras de Chonchi y Yal se llaman "Baader N" en planta, así que se
 * traducen desde lo que emite Shoplogix ("Evisceradora 2", "YAL Evisceradora 3",
 * "Baader 142 / 1").
 *
 * ⚠ Cualquier otro nombre se devuelve TAL CUAL. Antes bastaba con que el nombre
 * terminara en un número para llamarlo "Baader N", y la Baader 200 de Filete
 * —que Shoplogix nombra "Linea 1"— aparecía como "Baader 1": un nombre que no
 * existe en planta y que además la confunde con las Baader 142 del eviscerado.
 */
export function shortMachineName(name: string): string {
  const mSlash = name.match(/^baader[^/]*\/\s*(\d+)\s*$/i)
  if (mSlash) return `Baader ${mSlash[1]}`
  const mEvisceradora = name.match(/evisceradora\s*(\d+)\s*$/i)
  if (mEvisceradora) return `Baader ${mEvisceradora[1]}`
  return name
}
