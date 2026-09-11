/**
 * Tendencia del P0% a lo largo de un período.
 *
 * Módulo aparte del componente para poder testearlo (mismo motivo que
 * `graderPurezaNivel`).
 *
 * **El defecto que corrige:** la tendencia se calculaba comparando el promedio
 * de los PRIMEROS 7 días contra el de los ÚLTIMOS 7 (`slice(0,7)` contra
 * `slice(-7)`). Con menos de 14 días esas dos ventanas **comparten días**:
 *
 * | días del período | días compartidos |
 * |---|---|
 * | 7  | 7 de 7 (100 %) — la ventana consigo misma, delta 0 |
 * | 8  | 6 de 7 (86 %) |
 * | 10 | 4 de 7 (57 %) |
 * | 12 | 2 de 7 (29 %) |
 * | 14+| 0 |
 *
 * No es un caso raro: la temporada 2026-27 arrancó con **7 días de datos en
 * agosto y 4 en septiembre**, así que el período por defecto de la página daba
 * **8 días (86 % de solape)** y el «último trimestre» **12 días (29 %)** — justo
 * cuando más se mira, al arrancar la temporada. Con las ventanas solapadas el
 * delta se diluye por construcción y la etiqueta tiende a «Estable».
 *
 * Ahora se comparan las **dos mitades del período**, que nunca se solapan, y se
 * publica cuántos días tiene cada lado para que el número se pueda juzgar.
 */

/** Cuánto tiene que moverse el P0 (en puntos porcentuales) para no ser «estable». */
export const UMBRAL_TENDENCIA_PP = 0.3

/** Mínimo de días por mitad. Con menos, un solo día manda sobre el promedio. */
export const MIN_DIAS_POR_MITAD = 3

export type DireccionTendencia = 'better' | 'worse' | 'stable'

export interface TendenciaPeriodo {
  direccion: DireccionTendencia
  /** Promedio de la primera mitad. */
  inicioPct: number
  /** Promedio de la segunda mitad. */
  finPct: number
  /** fin − inicio, en puntos porcentuales. */
  deltaPp: number
  /** Días que promedia CADA mitad — van en pantalla: sostienen el número. */
  diasPorMitad: number
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const r2 = (x: number) => Math.round(x * 100) / 100

/**
 * @param serieDiaria P0% por día, en orden cronológico.
 * @returns null si no hay días suficientes para partir el período en dos
 *   mitades independientes con base mínima.
 */
export function tendenciaDelPeriodo(serieDiaria: readonly number[]): TendenciaPeriodo | null {
  const mitad = Math.floor(serieDiaria.length / 2)
  if (mitad < MIN_DIAS_POR_MITAD) return null

  // `slice(0, mitad)` y `slice(-mitad)` no se tocan nunca: con longitud impar el
  // día del medio queda fuera de las dos, que es lo correcto.
  const inicio = promedio(serieDiaria.slice(0, mitad) as number[])
  const fin = promedio(serieDiaria.slice(-mitad) as number[])
  const delta = r2(fin - inicio)

  return {
    direccion: delta < -UMBRAL_TENDENCIA_PP ? 'better' : delta > UMBRAL_TENDENCIA_PP ? 'worse' : 'stable',
    inicioPct: r2(inicio),
    finPct: r2(fin),
    deltaPp: delta,
    diasPorMitad: mitad,
  }
}

/**
 * ¿Alcanzan los días para hablar de «la mejor semana» del período?
 *
 * Con 8 días solo hay DOS ventanas de 7 posibles y comparten 6 días: elegir «la
 * mejor» entre esas dos no distingue nada, pero se lee como si hubiera habido
 * muchas candidatas. Se exige un período de al menos dos semanas.
 */
export const MIN_DIAS_MEJOR_SEMANA = 14

export function hayMejorSemana(totalDias: number): boolean {
  return totalDias >= MIN_DIAS_MEJOR_SEMANA
}
