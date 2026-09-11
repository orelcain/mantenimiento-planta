/**
 * ¿Lo que le pasó al Grader vino de la línea?
 *
 * La pestaña Línea contestaba esa pregunta con DOS tarjetas —«Correlación con
 * upstream» (paros) y «Correlación Baader → P0%» (ritmo)— que juntas miden
 * 1.153 px a 375 px de ancho. Medido sobre el histórico (#937): la de paros
 * señala algo en **6 de 40 turnos** y la de ritmo alcanza R² ≥ 0,10 en **11 de
 * 28**. En la mayoría de los turnos ocupaban la pantalla entera para decir que
 * no había nada.
 *
 * El resultado del caso mayoritario —«las causas son internas del Grader»— sí
 * se mostraba, pero al pie de la primera tarjeta, en 12 px grises, después del
 * encabezado y del KPI. Y no es un «sin datos»: es un hallazgo operativo, y
 * además la evidencia de que Mantención está mirando en el lugar correcto. Acá
 * sube a ser el titular.
 *
 * (El docblock de `UpstreamCorrelationCard` dice que la tarjeta no se renderiza
 * cuando no hay correlación. Es un comentario viejo: el código solo se calla si
 * falta el snapshot o no hay paros.)
 *
 * Este módulo destila las dos evidencias en UN veredicto en prosa. El detalle
 * (tabla de paros y nube de puntos) sigue existiendo, pero bajo demanda.
 */

/** Cuánto del solape tiene que concentrar una máquina para nombrarla. */
export const CONCENTRACION_MIN = 0.5

export type TonoOrigen = 'ok' | 'warn' | 'crit'

export interface VeredictoOrigen {
  /** ok = interno del Grader · warn = hubo solape · crit = una máquina concentra. */
  tono: TonoOrigen
  /** La conclusión, en una frase. Es lo que se lee sin tocar nada. */
  veredicto: string
  /** Los números que la sostienen. */
  evidencia: string
}

export interface EntradaVeredictoOrigen {
  /** Paros del Grader que se correlacionaron (total del turno). */
  totalParos: number
  /** Cuántos de esos coincidieron con las Baader. */
  parosUpstream: number
  /** Segundos de paro del Grader atribuidos a la línea. */
  segUpstream: number
  /** Segundos de paro totales del turno, para el porcentaje. */
  segParosTotal: number
  /** Reparto del solape por máquina, ordenado desc. */
  porMaquina: readonly { machineName: string; totalOverlapSec: number }[]
  /**
   * Paros del Grader que cayeron en una parada PROGRAMADA de las Baader
   * (colación, reunión). No son causa, pero tampoco son «ninguna coincidencia»:
   * decir las dos cosas en dos renglones seguidos se leía como contradicción.
   */
  parosProgramados: number
  /**
   * Porcentaje de la variación del P0 que explica el ritmo de la línea, o null
   * si no hay puntos suficientes. Solo se considera cuando `ritmoExplica` es
   * true: bajo `SCATTER_R2_MIN` una pendiente es ruido con forma de hallazgo.
   */
  ritmoPctExplicado: number | null
  ritmoExplica: boolean
}

function minutos(seg: number): string {
  const m = Math.round(seg / 60)
  return `${m} min`
}

/**
 * Devuelve el veredicto, o null si no hay con qué opinar (sin paros).
 *
 * Las cuatro ramas son las del mockup de decisión. Ninguna dice «no se
 * detectó» ni «sin datos»: el caso mayoritario es un resultado, no una falla
 * de la app.
 */
export function veredictoOrigenDelTurno(
  e: EntradaVeredictoOrigen,
): VeredictoOrigen | null {
  if (e.totalParos <= 0) return null

  const pctRitmo = e.ritmoExplica && e.ritmoPctExplicado != null ? e.ritmoPctExplicado : null

  // ── Sin solape de paros ──────────────────────────────────────────────────
  if (e.parosUpstream <= 0) {
    // Con paros programados de por medio, «ninguno coincidió» a secas choca con
    // el aviso de colación: se dice en la misma frase que esa coincidencia
    // existe y que no cuenta como causa.
    const programados = e.parosProgramados > 0
      ? ` (${e.parosProgramados === e.totalParos ? 'los ' : ''}${e.parosProgramados} ` +
        `cayeron en colación o reunión, que no es causa)`
      : ''
    const sinImprevista =
      `Ninguno de los ${e.totalParos} paros coincidió con una parada imprevista de las ` +
      `Baader${programados}`

    if (pctRitmo != null) {
      return {
        tono: 'warn',
        veredicto: 'Los paros son internos, pero el ritmo de la línea pesa.',
        evidencia: `${sinImprevista}; aun así el ritmo explica el ${pctRitmo} % del P0 de este turno.`,
      }
    }
    const colaRitmo = e.ritmoPctExplicado != null
      ? `, y el ritmo de la línea explica solo el ${e.ritmoPctExplicado} % del P0`
      : ''
    return {
      tono: 'ok',
      veredicto: 'Las causas son internas del Grader.',
      evidencia: `${sinImprevista}${colaRitmo}.`,
    }
  }

  // ── Hubo solape ──────────────────────────────────────────────────────────
  const pctTiempo = e.segParosTotal > 0
    ? Math.round((e.segUpstream / e.segParosTotal) * 100)
    : 0
  const solapeTotal = e.porMaquina.reduce((a, m) => a + m.totalOverlapSec, 0)
  const lider = e.porMaquina[0]
  const concentracion = lider && solapeTotal > 0 ? lider.totalOverlapSec / solapeTotal : 0

  if (lider && concentracion >= CONCENTRACION_MIN) {
    return {
      tono: 'crit',
      veredicto: `${minutos(e.segUpstream)} vinieron de la línea, casi todos de ${lider.machineName}.`,
      evidencia:
        `${e.parosUpstream} de ${e.totalParos} paros coincidió con las Baader — ${pctTiempo} % del ` +
        `tiempo muerto. ${lider.machineName} concentra el ${Math.round(concentracion * 100)} % del solape.`,
    }
  }

  const colaReparto = e.porMaquina.length > 1
    ? ` El solape se reparte parejo entre las ${e.porMaquina.length}.`
    : ''
  return {
    tono: 'warn',
    veredicto: `${minutos(e.segUpstream)} de este turno vinieron de la línea.`,
    evidencia:
      `${e.parosUpstream} de ${e.totalParos} paros coincidió con las Baader — ${pctTiempo} % del ` +
      `tiempo muerto.${colaReparto}`,
  }
}
