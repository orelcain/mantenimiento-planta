/**
 * Prioridad de confirmación en terreno de la Tarjeta A3C · BAADER 142 (planos N2 y N3).
 *
 * CURADO A MANO. Orden y resúmenes salen del ranking de fallas del 2026-10-07, armado con:
 * la bitácora de turno desde el 16-09-2026, el protocolo del Upgrade Kit (08 al 22-08-2026),
 * las incidencias registradas y el runbook de alarmas E8xx. Sin fallas registradas no significa que no fallen: la bitácora
 * parte el 16-09.
 *
 * Aquí NO hay códigos de pieza: los candidatos se leen en vivo de `partes.json` (plano 888) y la
 * confirmación vive en `planoVinculos`. `lectura` es la instrucción de qué mirar en el equipo.
 */

export type TipoElementoPrioritario = 'motor' | 'sensor' | 'encoder' | 'valvula' | 'sonda'

export interface ElementoPrioritario {
  /** Designación en el plano 888 (clave de `a3c-datos.elementos`). */
  codigo: string
  tipo: TipoElementoPrioritario
  /** Qué leer en el equipo para confirmar la pieza. */
  lectura: string
}

export interface ModuloPrioritario {
  id: string
  nombre: string
  episodios: number
  /** Una o dos líneas: qué falló y qué se hizo. */
  resumen: string
  /** De dónde sale el resumen. */
  fuentes: string[]
  elementos: ElementoPrioritario[]
}

const FUENTES_RANKING = ['Ranking de fallas 2026-10-07', 'Bitácora de turno desde 16-09-2026', 'Protocolo Upgrade Kit 08 al 22-08-2026']

export const PRIORIDAD_A3C: readonly ModuloPrioritario[] = [
  {
    id: 'excavador-b',
    nombre: 'Excavador B (Kratzer B)',
    episodios: 5,
    resumen: 'N1 corrige pasos perdidos en ~1 de cada 3 pescados (protocolo 08-08 y 22-08). N2: 4 paradas E825 y atasco 24-09. Causa raíz abierta.',
    fuentes: [...FUENTES_RANKING, 'Runbook alarmas E8xx'],
    elementos: [
      { codigo: 'SM5', tipo: 'motor', lectura: 'Leer placa del motor' },
      { codigo: 'B5', tipo: 'sensor', lectura: 'Leer etiqueta del sensor' },
      { codigo: 'B25', tipo: 'encoder', lectura: 'Leer etiqueta del encoder' },
    ],
  },
  {
    id: 'excavador-a',
    nombre: 'Excavador A (Kratzer A)',
    episodios: 3,
    resumen: 'N2: plato de polea suelto en el eje del SM4 (E824), reapretado; volvió el 21-08 con 370/1000.',
    fuentes: [...FUENTES_RANKING, 'Runbook alarmas E8xx'],
    elementos: [
      { codigo: 'SM4', tipo: 'motor', lectura: 'Leer placa del motor' },
      { codigo: 'B4', tipo: 'sensor', lectura: 'Leer etiqueta del sensor' },
      { codigo: 'B24', tipo: 'encoder', lectura: 'Leer etiqueta del encoder' },
    ],
  },
  {
    id: 'aspirador',
    nombre: 'Aspirador (Sauger)',
    episodios: 3,
    resumen: 'E803 no encuentra el punto cero; correa que salta un diente.',
    fuentes: [...FUENTES_RANKING, 'Runbook alarmas E8xx'],
    elementos: [
      { codigo: 'SM3', tipo: 'motor', lectura: 'Leer placa del motor' },
      { codigo: 'B3', tipo: 'sensor', lectura: 'Leer etiqueta del sensor' },
    ],
  },
  {
    id: 'extractor',
    nombre: 'Extractor (Ausschieber)',
    episodios: 3,
    resumen: 'N2: pernos sueltos y expulsor trabado.',
    fuentes: FUENTES_RANKING,
    elementos: [
      { codigo: 'B14', tipo: 'sensor', lectura: 'Leer etiqueta del sensor' },
      { codigo: 'B15', tipo: 'sensor', lectura: 'Leer etiqueta del sensor' },
      { codigo: 'Y8', tipo: 'valvula', lectura: 'Leer etiqueta de la válvula' },
      { codigo: 'Y9', tipo: 'valvula', lectura: 'Leer etiqueta de la válvula' },
    ],
  },
  {
    id: 'chapaleta-entrada',
    nombre: 'Chapaleta de entrada',
    episodios: 3,
    resumen: 'Resorte cortado en N1 y N2 (24-09); golpe fuerte en N3.',
    fuentes: FUENTES_RANKING,
    elementos: [{ codigo: 'Y1', tipo: 'valvula', lectura: 'Leer placa de la isla de válvulas' }],
  },
  {
    id: 'nivel-ciclon',
    nombre: 'Nivel del ciclón',
    episodios: 2,
    resumen: 'N1: sulfato y pin roto (enero y febrero 2026).',
    fuentes: FUENTES_RANKING,
    elementos: [{ codigo: 'B16', tipo: 'sonda', lectura: 'Leer etiqueta de la sonda' }],
  },
]

/** Total de elementos prioritarios (14). */
export const TOTAL_PRIORITARIOS = PRIORIDAD_A3C.reduce((n, m) => n + m.elementos.length, 0)
