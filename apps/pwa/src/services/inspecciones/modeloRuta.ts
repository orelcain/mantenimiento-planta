/**
 * Rutas de inspección: recorrer un área de la planta equipo por equipo y dejar los hallazgos.
 *
 * Hermana de la inspección post-aseo, con el mismo motor y DOS diferencias de fondo:
 *
 * 1. **No termina en una firma.** El post-aseo entrega la planta y por eso hay que completarlo.
 *    Una ruta entrega *hallazgos*, así que se puede guardar a medias: exigir «completa o nada»
 *    cortaría la serie justo el día que llamaron a una falla, y cuatro equipos mirados valen
 *    cuatro veces más que cero (Orel, 26-09-2026).
 * 2. **El producto es la SERIE, no el recorrido.** Una ronda suelta dice poco; «esta cinta salió
 *    no conforme en 3 de las últimas 5 rondas» justifica intervenir antes de que la línea pare.
 *    Eso es `tendenciaDeEquipo`.
 *
 * Y una decisión que viene de por qué murió el papel: **no se impone frecuencia**. La app no dice
 * «toca hoy»; dice cuánto hace que no se recorre y ordena por eso.
 */

export type ResultadoEquipo = 'conforme' | 'no-conforme'

export interface EquipoDeRuta {
  id: string
  nombre: string
  /** Qué hay que revisar, tal como lo dice el registro en papel. */
  actividad: string
  /**
   * El punto existe pero todavía no se sabe a qué equipo pertenece: en las áreas 1 y 2 el Excel
   * nunca llenó esa columna. Se muestra igual —la actividad es el punto— y queda marcado, porque
   * sin equipo el hallazgo no se puede ligar a la jerarquía ni al diagrama de líneas.
   */
  sinEquipo?: boolean
}

export interface RutaInspeccion {
  id: string
  nombre: string
  equipos: EquipoDeRuta[]
}

/** Un paso por una ruta. Se guarda aunque quede a medias. */
export interface Recorrido {
  id: string
  plantId: string
  rutaId: string
  /** Turno en que se hizo: los hallazgos son eventos de ese turno. */
  turnoId: string
  fechaTurno: string
  /** ISO. */
  iniciadoEn: string
  iniciadoPorNombre: string
  resultados: Record<string, ResultadoEquipo>
  /** Lo que se vio y no amerita abrir un evento. */
  notas?: Record<string, string>
  /** Cuándo se marcó cada equipo (ISO): distingue un recorrido de un marcado de un tirón. */
  marcas?: Record<string, string>
  /** ISO. Se cierra a mano; sin cerrar sigue disponible para seguir. */
  cerradoEn?: string | null
}

export interface ResumenRecorrido {
  total: number
  revisados: number
  conformes: number
  noConformes: number
  conObservacion: number
  /** De la primera marca a la última. `null` con menos de dos. */
  minutosDeRecorrido: number | null
  completo: boolean
}

export function resumenDeRecorrido(ruta: RutaInspeccion, r: Pick<Recorrido, 'resultados' | 'notas' | 'marcas'>): ResumenRecorrido {
  let conformes = 0
  let noConformes = 0
  for (const e of ruta.equipos) {
    const v = r.resultados[e.id]
    if (v === 'conforme') conformes += 1
    else if (v === 'no-conforme') noConformes += 1
  }
  const marcas = ruta.equipos
    .map((e) => r.marcas?.[e.id])
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime())
    .filter((t) => Number.isFinite(t))
  const revisados = conformes + noConformes
  return {
    total: ruta.equipos.length,
    revisados,
    conformes,
    noConformes,
    conObservacion: ruta.equipos.filter((e) => (r.notas?.[e.id] ?? '').trim()).length,
    minutosDeRecorrido: marcas.length > 1 ? Math.round((Math.max(...marcas) - Math.min(...marcas)) / 60000) : null,
    completo: revisados === ruta.equipos.length && ruta.equipos.length > 0,
  }
}

/** Días desde el último recorrido de una ruta. `null` = nunca se ha recorrido. */
export function diasDesde(iso: string | null | undefined, ahora: Date = new Date()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86400000))
}

/**
 * Las rutas ordenadas por la que lleva MÁS sin recorrerse, con las nunca recorridas primero.
 * Es toda la «obligación» que hay: un número, no una alarma.
 */
export function rutasPorAtencion(
  rutas: readonly RutaInspeccion[],
  ultimo: ReadonlyMap<string, string>,
  ahora: Date = new Date(),
): Array<{ ruta: RutaInspeccion; dias: number | null }> {
  return rutas
    .map((ruta) => ({ ruta, dias: diasDesde(ultimo.get(ruta.id), ahora) }))
    .sort((a, b) => {
      if (a.dias == null && b.dias == null) return a.ruta.nombre.localeCompare(b.ruta.nombre)
      if (a.dias == null) return -1
      if (b.dias == null) return 1
      return b.dias - a.dias
    })
}

export interface PasoDeTendencia {
  recorridoId: string
  /** ISO del recorrido. */
  en: string
  resultado: ResultadoEquipo
  nota?: string
}

export interface TendenciaEquipo {
  pasos: PasoDeTendencia[]
  noConformes: number
  /** No conformes seguidos contando desde el último hacia atrás. */
  seguidosAlFinal: number
  /** La frase corta que se muestra; `null` cuando no hay nada que decir todavía. */
  veredicto: string | null
}

/**
 * La historia de un equipo a través de los recorridos, del más viejo al más nuevo.
 *
 * El veredicto solo habla cuando hay algo real que decir: con una sola ronda o sin hallazgos no
 * inventa un patrón. Repetirse es lo que distingue un desgaste de un incidente.
 */
export function tendenciaDeEquipo(
  equipoId: string,
  recorridos: readonly Recorrido[],
  maximo = 6,
): TendenciaEquipo {
  const pasos = recorridos
    .filter((r) => !!r.resultados[equipoId])
    .sort((a, b) => a.iniciadoEn.localeCompare(b.iniciadoEn))
    .slice(-maximo)
    .map((r) => ({
      recorridoId: r.id,
      en: r.iniciadoEn,
      resultado: r.resultados[equipoId] as ResultadoEquipo,
      ...((r.notas?.[equipoId] ?? '').trim() ? { nota: (r.notas?.[equipoId] ?? '').trim() } : {}),
    }))

  const noConformes = pasos.filter((p) => p.resultado === 'no-conforme').length
  let seguidosAlFinal = 0
  for (let i = pasos.length - 1; i >= 0 && pasos[i]?.resultado === 'no-conforme'; i -= 1) seguidosAlFinal += 1

  let veredicto: string | null = null
  if (seguidosAlFinal >= 2) {
    veredicto = `No conforme en las ${seguidosAlFinal} últimas rondas seguidas.`
  } else if (noConformes >= 2) {
    veredicto = `No conforme en ${noConformes} de las últimas ${pasos.length} rondas.`
  }
  return { pasos, noConformes, seguidosAlFinal, veredicto }
}
