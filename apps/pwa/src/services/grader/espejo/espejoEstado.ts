/**
 * Estado del lector del espejo del grader (lógica pura): si está vivo, hace cuánto
 * avisó y qué frase mostrar cuando trae un error. El reloj se inyecta (`ahoraMs`)
 * para que se pueda probar.
 */

/** El lector late cada 5 min; vivo = último latido hace ≤ 12 min (contrato). */
export const VIVO_MAX_MIN = 12
/** Tope de filas que Matrix entrega con «límite de registros» marcado. */
export const LIMITE_FILAS_MATRIX = 10_000

/** Documento `graderEspejoEstado/{equipo}` ya leído (`ultimoLatido` en ms). */
export interface EstadoLector {
  equipo: string
  linea: string
  ultimoLatidoMs: number | null
  leidoEn: string | null
  informe: string | null
  estado: {
    error?: string
    limite?: boolean
    filasTabla?: number
    piezas?: number
    primera?: string
    ultima?: string
    gate0?: number
    version?: string
    rango?: string[]
    relectura?: boolean
    /** Desde e1.1: la lectura quedó a medias y sigue en el ciclo siguiente. */
    parcial?: boolean
    /** Desde e1.1: filas de la tabla que faltan por recorrer. */
    pendientes?: number
    /** Desde e1.1: segundos del último ciclo y filas-pieza leídas en él. */
    seg?: number
    leidas?: number
  }
}

/** Minutos enteros desde el último latido; `null` si nunca latió. Nunca negativo. */
export function minutosDesde(ultimoLatidoMs: number | null, ahoraMs: number): number | null {
  if (ultimoLatidoMs === null) return null
  return Math.max(0, Math.floor((ahoraMs - ultimoLatidoMs) / 60_000))
}

export function estaVivo(ultimoLatidoMs: number | null, ahoraMs: number): boolean {
  const m = minutosDesde(ultimoLatidoMs, ahoraMs)
  return m !== null && m <= VIVO_MAX_MIN
}

/** De varios equipos de la línea, el que avisó más recientemente. */
export function elegirEstado(estados: readonly EstadoLector[]): EstadoLector | null {
  let mejor: EstadoLector | null = null
  for (const e of estados) {
    if (!mejor || (e.ultimoLatidoMs ?? -1) > (mejor.ultimoLatidoMs ?? -1)) mejor = e
  }
  return mejor
}

/** «hace 2 min», «hace 1 h 05 min». */
export function textoHace(minutos: number): string {
  if (minutos < 1) return 'hace menos de 1 min'
  if (minutos < 60) return `hace ${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${String(m).padStart(2, '0')} min`
}

const FRASE_ERROR: Record<string, string> = {
  'otro-informe': 'Matrix tiene otro informe en pantalla: deja «Pieza pieza Grader».',
  'sin-matrix': 'El lector no encuentra Matrix abierto en el PC de planta.',
  'sin-tabla': 'Matrix no muestra la tabla del informe: carga «Pieza pieza Grader» y vuelve a buscar.',
  'licencia-en-pantalla': 'Matrix muestra un aviso de licencia en pantalla: ciérralo para que el lector siga.',
  'tope-10-min': 'La lectura de Matrix pasó los 10 minutos y se cortó sin enviar piezas. Instala el lector nuevo o acorta el rango de fechas.',
  'sin-boton': 'El lector no encuentra el botón «Actualizar» de Matrix.',
  'invoke-fallo': 'Matrix no respondió al botón «Actualizar».',
  'tabla-inestable': 'La tabla de Matrix no terminó de cargar en 2 minutos.',
  'tabla-cambio': 'La tabla de Matrix cambió mientras se leía: se reintenta en el ciclo siguiente.',
  'excepcion': 'El lector tuvo un error inesperado: revisa su registro en el PC de planta.',
}

/** Códigos que no son un problema (el lector solo informa en qué está). */
const SIN_AVISO = new Set(['iniciando'])

/**
 * Frase para el error que reporta el lector; `null` si no hay error. Un código que
 * la PWA no conoce igual se avisa (antes se callaba y la tarjeta mostraba «Vivo»
 * con 0 piezas sin decir nada).
 */
export function fraseDeError(error: string | undefined | null): string | null {
  if (!error || SIN_AVISO.has(error)) return null
  return FRASE_ERROR[error] ?? `El lector avisó un problema («${error}»): revisa su registro en el PC de planta.`
}

/** «2026-11-19 05:20:01» → «19-11 05:20»; `null` si no tiene ese formato. */
export function fechaCortaDeFila(fechaHora: string | undefined | null): string | null {
  const m = fechaHora ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(fechaHora) : null
  return m ? `${m[3]}-${m[2]} ${m[4]}:${m[5]}` : null
}

/**
 * Con 0 piezas del turno pero piezas leídas por el lector: lo dice en vez de
 * mostrar «0 piezas» (20-11: Matrix tenía el rango desde el día anterior).
 */
export function avisoSinPiezasDelTurno(estado: EstadoLector['estado']): string | null {
  const n = estado.piezas ?? 0
  if (n <= 0) return null
  const ult = fechaCortaDeFila(estado.ultima)
  const cifra = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return ult
    ? `Hay ${cifra} piezas leídas, ninguna de este turno (la última es del ${ult}).`
    : `Hay ${cifra} piezas leídas, ninguna de este turno.`
}

/** Lectura a medias que sigue sola (lector e1.1); `null` si está al día. */
export function avisoAvance(estado: EstadoLector['estado']): string | null {
  if (estado.parcial !== true) return null
  const n = estado.pendientes ?? 0
  if (n <= 0) return 'Poniéndose al día con Matrix.'
  const cifra = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `Poniéndose al día con Matrix: faltan ${cifra} filas por leer.`
}

/** Aviso del tope de 10 000 filas de Matrix, o `null`. */
export function avisoLimite(estado: EstadoLector['estado']): string | null {
  if (estado.limite === true && (estado.filasTabla ?? 0) >= LIMITE_FILAS_MATRIX) {
    return 'Matrix está cortando en 10 000 registros: desmarca el límite o acorta el rango.'
  }
  return null
}

/** Convierte un `Timestamp` de Firestore (o algo parecido) a ms; `null` si no es válido. */
export function aMs(v: unknown): number | null {
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as { toMillis: unknown }).toMillis === 'function') {
    const n = (v as { toMillis: () => number }).toMillis()
    return Number.isFinite(n) ? n : null
  }
  return null
}
