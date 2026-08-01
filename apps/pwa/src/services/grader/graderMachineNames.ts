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
 * Etiqueta corta y estable de una máquina: `Baader N`.
 *
 * Cubre lo que emite Shoplogix hoy: "Evisceradora 2", "YAL Evisceradora 3",
 * "Baader 142 / 1". Un nombre sin número al final se devuelve tal cual — antes
 * se recortaba a 4 letras y salían cosas ilegibles como "Line" o "Grad".
 */
export function shortMachineName(name: string): string {
  const mSlash = name.match(/\/\s*(\d+)\s*$/)
  if (mSlash) return `Baader ${mSlash[1]}`
  const mNum = name.match(/(\d+)\s*$/)
  if (mNum) return `Baader ${mNum[1]}`
  return name
}
