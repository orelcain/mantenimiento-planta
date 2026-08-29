/**
 * La cuota que pide producción viene en TONELADAS; el monitor cuenta PIEZAS.
 *
 * POR QUÉ EXISTE
 * --------------
 * Orel (26-08): «están pidiendo toneladas, no cantidad de piezas… y para hacer
 * 70 toneladas depende del peso promedio del pescado, entonces a veces la hacen
 * con 15.000 o más».
 *
 * Shoplogix entrega ciclos, no kilos: en el payload del monitor no hay ni un
 * campo de peso. Así que la conversión se hace acá, con el peso promedio que
 * dice quien carga la cuota, y el pedido original se guarda al lado para poder
 * mostrarlo y recalcularlo cuando cambia el calibre.
 */

/** Un salmón fuera de este rango es un dedo de más, no un pescado. */
export const PESO_MIN_KG = 0.5
export const PESO_MAX_KG = 25

export interface CuotaConvertida {
  piezas: number
  /** Para mostrar de dónde salió: "70 t a 4,6 kg". */
  detalle: string
}

export function piezasDeToneladas(
  toneladas: number,
  pesoPromedioKg: number,
): CuotaConvertida {
  if (!(toneladas > 0)) throw new Error('Las toneladas tienen que ser mayores que cero.')
  if (!(pesoPromedioKg >= PESO_MIN_KG && pesoPromedioKg <= PESO_MAX_KG)) {
    throw new Error(`El peso promedio tiene que estar entre ${PESO_MIN_KG} y ${PESO_MAX_KG} kg.`)
  }
  const piezas = Math.round((toneladas * 1000) / pesoPromedioKg)
  /* En gramos: el calibre se habla en gramos en planta (Orel, 29-08). */
  const g = Math.round(pesoPromedioKg * 1000).toLocaleString('es-CL')
  const t = toneladas.toLocaleString('es-CL', { maximumFractionDigits: 1 })
  return { piezas, detalle: `${t} t a ${g} g` }
}

/** El camino inverso, para mostrar cuántas toneladas van con lo producido. */
export function toneladasDePiezas(piezas: number, pesoPromedioKg: number): number | null {
  if (!(piezas >= 0) || !(pesoPromedioKg > 0)) return null
  return (piezas * pesoPromedioKg) / 1000
}

/** Un registro del historial de pesos del turno (hora de PLANTA, wall). */
export interface RegistroPeso {
  atWall: string
  pesoKg: number
}

export interface TramoDePeso {
  /** Desde cuándo rige este peso (wall ms del primer tramo que cubre). */
  desdeWallMs: number
  pesoKg: number
  piezas: number
  toneladas: number
}

/**
 * Las toneladas del turno POR TRAMOS: cada peso registrado rige desde su hora
 * hasta el registro siguiente (Orel, 28-08: «el peso promedio es una variable
 * cambiante… a tal hora se registró tal peso, después se puso otro según la
 * pesca y el lote»).
 *
 * Lo producido ANTES del primer registro se valoriza con ese primer peso — el
 * registro de las 10:00 describe el calibre que venía pasando, no solo el que
 * viene. Con UN registro esto equivale al cálculo plano de siempre.
 *
 * ⚠ `serie` y `registros.atWall` tienen que venir en la MISMA base (wall de
 * planta): el backend publica `atWall` ya convertido. No mezclar con UTC real.
 */
export function toneladasPorTramos(
  serie: ReadonlyArray<{ t?: string | null; pieces?: number | null }>,
  registros: readonly RegistroPeso[],
): { total: number; tramos: TramoDePeso[] } | null {
  const regs = (registros ?? [])
    .filter((r) => r.pesoKg > 0 && !Number.isNaN(Date.parse(r.atWall)))
  if (regs.length === 0) return null

  const tramos: TramoDePeso[] = regs.map((r) => ({
    desdeWallMs: Date.parse(r.atWall),
    pesoKg: r.pesoKg,
    piezas: 0,
    toneladas: 0,
  }))

  for (const p of serie ?? []) {
    const t = p.t ? Date.parse(p.t) : NaN
    const pz = p.pieces ?? 0
    if (Number.isNaN(t) || pz <= 0) continue
    // El último registro cuyo inicio es ≤ al tramo; antes del primero, el primero.
    let i = 0
    for (let j = 0; j < tramos.length; j++) {
      if (tramos[j]!.desdeWallMs <= t) i = j
    }
    tramos[i]!.piezas += pz
  }

  let total = 0
  for (const tr of tramos) {
    tr.toneladas = (tr.piezas * tr.pesoKg) / 1000
    total += tr.toneladas
  }
  return { total, tramos }
}
