/**
 * El ritmo de cada máquina de la línea, su suma y su promedio.
 *
 * POR QUÉ EXISTE
 * --------------
 * Orel, mirando el monitor con la línea en colación (26-08, 01:56):
 * «esos dos ritmos, ¿por qué son distintos? Ahora están en colación, el que
 * dice la verdad es el que dice 0… el que vale más es el ritmo real, ese
 * debería estar en grande, para saber el ritmo de cada Baader y el sumado de
 * las 3, y también el promedio de las 3».
 *
 * El payload trae `piecesPerHour` por máquina —piezas sobre el tiempo que ESA
 * máquina estuvo corriendo—, así que el dato ya está; lo que faltaba era
 * mostrarlo. La suma es lo que da la línea con las tres corriendo; el promedio
 * dice cómo viene cada una, y la diferencia entre ellos es lo que delata a la
 * que se quedó atrás.
 */

export interface MaquinaDelMonitor {
  name?: string | null
  piecesPerHour?: number | null
  pieces?: number | null
  status?: string | null
}

export interface RitmoDeMaquina {
  nombre: string
  cpm: number
  piezas: number
  detenida: boolean
}

export interface RitmosPorMaquina {
  maquinas: RitmoDeMaquina[]
  /** Lo que dan todas juntas, en pz/min. */
  suma: number
  /** Cómo viene cada una, en promedio. */
  promedio: number
}

export function ritmoPorMaquina(
  machines: readonly MaquinaDelMonitor[] | null | undefined,
): RitmosPorMaquina | null {
  // ⚠ `Number(null)` es 0 y `Number.isFinite(0)` es true: filtrar solo por
  // isFinite metía como "0 pz/min" a la máquina que no publicó su ritmo y
  // hundía el promedio de las otras.
  const utiles = (machines ?? []).filter(
    (m) => m?.piecesPerHour != null && Number.isFinite(Number(m.piecesPerHour)),
  )
  if (utiles.length === 0) return null

  const maquinas: RitmoDeMaquina[] = utiles.map((m, i) => ({
    nombre: (m.name ?? '').trim() || `Máquina ${i + 1}`,
    cpm: Number(m.piecesPerHour) / 60,
    piezas: Number(m.pieces ?? 0),
    detenida: (m.status ?? '').toLowerCase() !== 'produciendo',
  }))

  const suma = maquinas.reduce((a, m) => a + m.cpm, 0)
  return { maquinas, suma, promedio: suma / maquinas.length }
}

/**
 * Nombre corto para que las tres entren en una línea a 375 px:
 * "Evisceradora 2" → "Ev 2".
 */
export function nombreCorto(nombre: string): string {
  const m = /^(\D+?)\s*(\d+)$/.exec(nombre.trim())
  if (!m) return nombre.length > 10 ? `${nombre.slice(0, 9)}…` : nombre
  const palabra = m[1]!.trim()
  return `${palabra.slice(0, 2)} ${m[2]}`
}
