/**
 * Jack-Knife en modo lectura (piel Apple): textos y tabla armados desde los datos
 * del cálculo. Puro: sin React ni Firestore.
 *
 * Referencia: mockup aprobado «Jack-Knife, A» (09-11-2026, jk-A.dc.html), con el
 * caso real de 12 de agosto a 9 de noviembre frente a 2 de febrero a 11 de agosto.
 */
import { ETIQUETA_VEREDICTO, nivelPrioridad, type CalculoJK, type CuadranteJK, type PuntoJK, type VeredictoJK } from './jackKnife'
import { repartirEnteros } from './informeTurno'
import { dec1 } from '@/utils/formatoNumeros'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/** Fila de una causa, con lo necesario para el texto y la tabla. */
export interface FilaLecturaJK {
  causa: string
  q: CuadranteJK
  ev: number
  /** Minutos totales de la causa en el período. */
  min: number
  /** Minutos promedio por evento. */
  mttr: number
  /** Veredicto frente al período de comparación. null si no hay comparación. */
  veredicto: VeredictoJK | null
  /** Minutos cada 10 turnos. Solo si la causa tiene datos en ambos períodos. */
  minAntes10?: number
  minAhora10?: number
}

const fechaLarga = (dateKey: string) => {
  const [, m, d] = dateKey.split('-')
  return `${Number(d)} de ${MESES[Number(m) - 1]}`
}

export interface TramoLectura { desdeKey: string; hastaKey: string; turnos: number }

/** «12 de agosto a 9 de noviembre, 146 turnos, frente a 2 de febrero a 11 de agosto, 86 turnos.» */
export function identidadLectura(ahora: TramoLectura, antes: TramoLectura | null): string {
  const tramo = (t: TramoLectura) =>
    `${t.desdeKey === t.hastaKey ? fechaLarga(t.desdeKey) : `${fechaLarga(t.desdeKey)} a ${fechaLarga(t.hastaKey)}`}, ${t.turnos} ${plural(t.turnos, 'turno', 'turnos')}`
  return antes ? `${tramo(ahora)}, frente a ${tramo(antes)}.` : `${tramo(ahora)}.`
}

/**
 * Titular: qué pasó con la detención de Mantención por turno.
 * «a la mitad» solo entre 45 y 55 % de baja.
 */
export function titularLectura(minAhora: number, minAntes: number | null): string {
  if (minAntes === null || minAntes <= 0) return `La detención de Mantención fue ${dec1(minAhora)} min por turno`
  const cambio = Math.round((1 - minAhora / minAntes) * 100) // positivo = bajó
  const detalle = `: de ${dec1(minAntes)} a ${dec1(minAhora)} min por turno`
  if (cambio === 0) return `La detención de Mantención se mantuvo${detalle}`
  if (cambio > 0) {
    const cuanto = cambio >= 45 && cambio <= 55 ? 'a la mitad' : `${cambio} %`
    return `La detención de Mantención bajó ${cuanto}${detalle}`
  }
  return `La detención de Mantención subió ${-cambio} %${detalle}`
}

/**
 * Bajada en dos frases: la causa que más mejoró, la que más empeoró y la que más
 * horas cuesta. Sin comparación queda solo la que más horas cuesta.
 */
export function bajadaLectura(filas: readonly FilaLecturaJK[]): string {
  const costosa = [...filas].sort((a, b) => b.min - a.min)[0]
  if (!costosa) return ''
  const comparables = filas.filter((f) => f.minAntes10 !== undefined && f.minAhora10 !== undefined)
  const cambio = (f: FilaLecturaJK) => f.minAhora10! - f.minAntes10!
  const mejor = comparables.filter((f) => f.veredicto === 'mejoro').sort((a, b) => cambio(a) - cambio(b))[0]
  const peor = comparables.filter((f) => f.veredicto === 'empeoro').sort((a, b) => cambio(b) - cambio(a))[0]
  const cuesta = `${costosa.ev} ${plural(costosa.ev, 'evento', 'eventos')} y ${dec1(costosa.min / 60)} horas`

  const frases: string[] = []
  if (mejor) {
    frases.push(`${mejor.causa} cayó de ${dec1(mejor.minAntes10!)} a ${dec1(mejor.minAhora10!)} min cada 10 turnos.`)
  }
  if (peor && peor.causa === costosa.causa) {
    frases.push(`${peor.causa} subió de ${dec1(peor.minAntes10!)} a ${dec1(peor.minAhora10!)} y hoy es la que más tiempo cuesta: ${cuesta}.`)
  } else if (peor) {
    frases.push(`${peor.causa} subió de ${dec1(peor.minAntes10!)} a ${dec1(peor.minAhora10!)}; hoy la que más tiempo cuesta es ${costosa.causa}: ${cuesta}.`)
  } else {
    frases.push(`${costosa.causa} es la que más tiempo cuesta: ${cuesta}.`)
  }
  return frases.join(' ')
}

/** Las causas de «Atacar ahora»: nivel 1 o 2, las dos primeras. */
export function causasAtacar(calc: CalculoJK): PuntoJK[] {
  return [...calc.pts]
    .filter((p) => nivelPrioridad(p, calc.un, calc.um) <= 2)
    .sort((a, b) => nivelPrioridad(a, calc.un, calc.um) - nivelPrioridad(b, calc.un, calc.um) || b.min - a.min)
    .slice(0, 2)
}

export const TITULO_CUADRANTE: Record<CuadranteJK, string> = {
  amb: 'Agudas y crónicas',
  agu: 'Agudas',
  cro: 'Crónicas',
  ok: 'Bajo control',
}
const ORDEN_CUADRANTE: CuadranteJK[] = ['amb', 'agu', 'cro', 'ok']

export interface FilaTablaLectura {
  causa: string
  ev: number
  mttr: number
  /** Horas con un decimal. */
  horas: string
  /** «mejoró», «empeoró», «sin historia»… Vacío sin comparación. */
  frente: string
}

export interface GrupoTablaLectura {
  q: CuadranteJK
  titulo: string
  ev: number
  horas: string
  filas: FilaTablaLectura[]
}

export interface TablaLectura {
  grupos: GrupoTablaLectura[]
  ev: number
  horas: string
  /** «4 mejoraron, 8 empeoraron. 2 sin historia y 1 desapareció. Cobertura de causa aproximada, 73 %.» */
  nota: string
}

/**
 * Tabla «Todas las causas» agrupada por cuadrante. Las horas se reparten en
 * décimas con restos mayores, así los grupos y el total cierran con lo que se ve.
 * Un grupo vacío no aparece.
 */
export function tablaLectura(
  filas: readonly FilaLecturaJK[],
  opciones: { cobertura: number | null; desaparecieron: number },
): TablaLectura {
  const porGrupo = ORDEN_CUADRANTE
    .map((q) => ({ q, filas: filas.filter((f) => f.q === q).sort((a, b) => b.min - a.min) }))
    .filter((g) => g.filas.length > 0)
  const todas = porGrupo.flatMap((g) => g.filas)
  // Una décima de hora son 6 minutos.
  const decimas = repartirEnteros(todas.map((f) => f.min / 6), Math.round(todas.reduce((a, f) => a + f.min / 6, 0)))

  let i = 0
  const grupos: GrupoTablaLectura[] = porGrupo.map((g) => {
    const ds = g.filas.map(() => decimas[i++]!)
    return {
      q: g.q,
      titulo: TITULO_CUADRANTE[g.q],
      ev: g.filas.reduce((a, f) => a + f.ev, 0),
      horas: dec1(ds.reduce((a, d) => a + d, 0) / 10),
      filas: g.filas.map((f, k) => ({
        causa: f.causa,
        ev: f.ev,
        mttr: f.mttr,
        horas: dec1(ds[k]! / 10),
        frente: f.veredicto ? ETIQUETA_VEREDICTO[f.veredicto] : '',
      })),
    }
  })

  const conComparacion = filas.some((f) => f.veredicto !== null)
  const cuenta = (v: VeredictoJK) => filas.filter((f) => f.veredicto === v).length
  const partes: string[] = []
  if (conComparacion) {
    const m = cuenta('mejoro')
    const e = cuenta('empeoro')
    const sh = cuenta('sinHistoria')
    const ap = cuenta('nueva')
    const d = opciones.desaparecieron
    partes.push(`${m} ${plural(m, 'mejoró', 'mejoraron')}, ${e} ${plural(e, 'empeoró', 'empeoraron')}.`)
    partes.push(`${sh} sin historia y ${d} ${plural(d, 'desapareció', 'desaparecieron')}.`)
    if (ap > 0) partes.push(`${ap} ${plural(ap, 'apareció', 'aparecieron')}.`)
  }
  if (opciones.cobertura !== null) partes.push(`Cobertura de causa aproximada, ${Math.round(opciones.cobertura * 100)} %.`)

  return {
    grupos,
    ev: grupos.reduce((a, g) => a + g.ev, 0),
    horas: dec1(decimas.reduce((a, d) => a + d, 0) / 10),
    nota: partes.join(' '),
  }
}
