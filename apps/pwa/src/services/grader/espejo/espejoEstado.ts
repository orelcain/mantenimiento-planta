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
    /** Desde e1.2: resultado del rango automático (fechas del rango y casilla «Limitar»). */
    ajuste?: string
    /** Desde e1.2: la sesión de Windows del PC de planta estaba bloqueada en ese ciclo. */
    bloqueada?: boolean
    /** Desde e1.3: cómo arranca el lector («tarea» = tarea programada de Windows; «manual» = sin tarea). */
    arranque?: 'tarea' | 'manual' | string
    /** Desde e1.3: última actualización del lector («bajada eX», «confirmada eX», …). */
    actualiz?: string
    /** Desde e1.4: fin del modo «en vivo a pedido» (lee cada 60 s) en hora del PC, o '' si lee cada 5 min. */
    vivo?: string
    /**
     * Desde e1.6: recarga de historia (archivo RECARGA en el PC de planta). '' sin recarga; «leyendo <recorridas>/<filas>
     * <enviadas>», «con-limite», «terminada <enviadas> <primera> a <última>» o «cancelada <enviadas>».
     */
    recarga?: string
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
  'recarga-con-limite': 'La recarga de historia espera: «Limitar el informe a 10 000 registros» sigue marcada en Matrix. Desmárcala a mano.',
  'pantalla-bloqueada':'El PC de planta está con la sesión bloqueada: el lector no puede leer Matrix hasta que alguien la desbloquee. Si con bloqueo nunca lee, el camino es leer la base de datos de Matrix (sondeo).',
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

/**
 * Rango automático del lector e1.2: qué hizo con las fechas del rango y la casilla
 * «Limitar». `texto` va en la ficha; `aviso` (si no es `null`) se muestra en ámbar.
 * Un lector anterior a e1.2 no manda la clave: `null`.
 */
export function estadoAjuste(
  estado: EstadoLector['estado'],
  ahora: Date = new Date(),
): { texto: string; aviso: string | null } | null {
  const a = estado.ajuste
  if (a === undefined || a === null) return null
  switch (a) {
    case 'casilla-no-aplico':
      return {
        texto: 'no desmarcó «Limitar»',
        aviso: 'Matrix no dejó desmarcar «Limitar el informe a 10 000 registros»: el informe se corta en 10 000 filas. Desmárcala a mano.',
      }
    case 'fechas-fijas':
      return { texto: 'fechas a mano (Matrix no deja moverlas)', aviso: avisoFinRango(estado.rango, ahora) }
    case 'ok':
      return { texto: 'lo mueve el lector', aviso: null }
    case '':
      return { texto: 'todavía sin probar', aviso: null }
    case 'apagado':
      return { texto: 'apagado', aviso: null }
    case 'sin-controles':
      return {
        texto: 'no tocó nada',
        aviso: 'El lector no encontró justo las 2 fechas del rango y la casilla «Limitar»: no tocó nada y lee como antes. Saca una foto de Matrix.',
      }
    case 'solo-lectura':
      return {
        texto: 'no tocó nada',
        aviso: 'Las fechas del rango de Matrix no se dejan escribir: el lector no tocó nada y lee como antes.',
      }
    case 'no-aplico':
      return {
        texto: 'devuelto a como estaba',
        aviso: 'Matrix no aceptó el rango nuevo: el lector dejó las fechas como estaban y sigue sin moverlas.',
      }
    case 'no-filtra':
      return {
        texto: 'devuelto a como estaba',
        aviso: 'Matrix no filtró con el rango nuevo: el lector dejó las fechas como estaban y sigue sin moverlas.',
      }
    case 'no-devuelto':
      return {
        texto: 'no se pudo devolver',
        aviso: 'Matrix no aceptó el rango nuevo y el lector no pudo devolver las fechas: revísalas en Matrix.',
      }
    default:
      return { texto: a, aviso: `El rango automático avisó «${a}»: revisa el registro del lector.` }
  }
}

/** Horas antes del fin del rango en que se avisa que hay que moverlo (cubre un turno de noche que cruza medianoche). */
export const HORAS_AVISO_FIN_RANGO = 12

/**
 * e1.5: con las fechas fijas, el lector solo ve lo que cae antes del fin del rango de Matrix. Avisa cuando
 * faltan menos de {@link HORAS_AVISO_FIN_RANGO} h o ya pasó; antes, `null` (la ficha ya dice «fechas a mano»). El rango viene en hora del PC de planta
 * («yyyy-MM-dd HH:mm:ss»), la misma zona que la PWA en Chonchi.
 */
export function avisoFinRango(rango: string[] | undefined, ahora: Date): string | null {
  const fin = rango?.[1]
  const m = fin ? /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(fin) : null
  const pedir = 'Pon a mano en Matrix el fin del rango en 2 días más (por ejemplo, pasado mañana 00:00).'
  if (!m) return `Matrix no deja que el lector mueva las fechas del rango. ${pedir}`
  const [, y, mo, d, h, mi, s] = m
  const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  const corto = `${d}-${mo} ${h}:${mi}`
  const faltanH = (t.getTime() - ahora.getTime()) / 3_600_000
  if (faltanH <= 0) return `El rango de Matrix terminó el ${corto}: las piezas posteriores no se leen. ${pedir}`
  if (faltanH < HORAS_AVISO_FIN_RANGO) return `El rango de Matrix termina el ${corto}: después de esa hora no se lee nada. ${pedir}`
  return null
}

/** Desde e1.3: «solo (tarea de Windows)» / «manual (sin tarea)»; `null` si el lector no lo manda. */
export function textoArranque(arranque: string | undefined): string | null {
  if (arranque === undefined || arranque === '') return null
  if (arranque === 'tarea') return 'solo (tarea de Windows)'
  if (arranque === 'manual') return 'manual (sin tarea)'
  return arranque
}

/** Frase para la última actualización del lector e1.3 («bajada e1.3» → «e1.3 bajada, …»). `null` si no hay clave. */
export function fraseActualizacion(actualiz: string | undefined): string | null {
  if (actualiz === undefined || actualiz === '') return null
  const m = /^(bajada|puesta|confirmada|revertida|rechazada|hash-distinto|sin-descarga) (\S+)$/.exec(actualiz)
  if (!m) return actualiz
  const [, estado, v] = m
  switch (estado) {
    case 'bajada':
      return `${v} bajada, se pone en marcha en ≤ 5 min`
    case 'puesta':
      return `${v} puesta a prueba`
    case 'confirmada':
      return `${v} confirmada`
    case 'revertida':
      return `${v} no anduvo: volvió a la anterior`
    case 'rechazada':
      return `${v} rechazada antes (no se vuelve a bajar)`
    case 'hash-distinto':
      return `${v} descartada: la huella no coincide`
    case 'sin-descarga':
      return `no pudo bajar ${v}; reintenta`
    default:
      return actualiz
  }
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

/** «yyyy-MM-dd HH:mm:ss» del PC de planta → ms en wall-clock-as-UTC (la convención del monitor); `null` si no calza. */
export function msDeFechaPlanta(t: string | undefined | null): number | null {
  if (!t || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)) return null
  const ms = Date.parse(`${t.replace(' ', 'T')}.000Z`)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Hasta qué hora (ms, wall-clock-as-UTC) la última lectura del lector fue COMPLETA: sin error, sin tramo pendiente y
 * sin recarga de historia en curso (e1.6 la marca «parcial»). Nunca pasa el fin del rango de Matrix: con un rango viejo
 * (tras una recarga, o las fechas fijas vencidas) el lector no ve las piezas de hoy, y dar esos minutos por leídos haría
 * decir «grader sin piezas» con las Baader andando. `null` = no hay minutos que dar por cerrados.
 */
export function leidoHastaDelLector(e: EstadoLector | null): number | null {
  if (!e || !e.leidoEn || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(e.leidoEn)) return null
  const s = e.estado
  if (s.error || s.parcial === true || (s.pendientes ?? 0) > 0) return null
  // «2026-11-20T21:49:12-03:00» → hora de planta.
  const leido = Date.parse(`${e.leidoEn.slice(0, 19)}.000Z`)
  if (!Number.isFinite(leido)) return null
  const fin = msDeFechaPlanta(s.rango?.[1])
  return fin === null ? leido : Math.min(leido, fin)
}

/** ¿El rango de Matrix (hora del PC de planta) contiene `ahora`? `null` si no se sabe. */
function rangoIncluye(rango: string[] | undefined, ahora: Date): boolean | null {
  const a = msDeFechaPlanta(rango?.[0])
  const b = msDeFechaPlanta(rango?.[1])
  if (a === null || b === null) return null
  // `ahora` en la misma convención: la hora local de Chonchi escrita como si fuera UTC.
  const t = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), ahora.getHours(), ahora.getMinutes(), ahora.getSeconds())
  return a <= t && t < b
}

const cifraPunto = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Aviso para volver al rango de hoy tras una recarga, o `null` si el rango ya incluye ahora. */
function avisoVolverRango(rango: string[] | undefined, ahora: Date, que: string): string | null {
  if (rangoIncluye(rango, ahora) === true) return null
  return `${que} Vuelve a poner en Matrix el rango de hoy (inicio hoy 00:00, fin pasado mañana 00:00): hasta entonces el lector no ve las piezas del turno.`
}

/**
 * e1.6: frase de la recarga de historia para Diagnóstico Matrix (clave `recarga` del latido). `null` sin recarga.
 * `texto` va en la ficha; `aviso` pide algo a Orel (desmarcar «Limitar» o volver el rango de Matrix a hoy).
 */
export function fraseRecarga(
  recarga: string | undefined,
  rango: string[] | undefined,
  ahora: Date,
): { texto: string; aviso: string | null } | null {
  if (!recarga) return null
  let m = /^leyendo (\d+)\/(\d+) (\d+)$/.exec(recarga)
  if (m) {
    return { texto: `leyendo · ${cifraPunto(Number(m[1]))} de ${cifraPunto(Number(m[2]))} filas · ${cifraPunto(Number(m[3]))} piezas enviadas`, aviso: null }
  }
  if (recarga === 'con-limite') {
    // El aviso ya sale del error «recarga-con-limite» (fraseDeError): no se repite.
    return { texto: 'esperando · «Limitar» marcada', aviso: null }
  }
  m = /^terminada (\d+) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) a (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})$/.exec(recarga)
  if (m) {
    const p = fechaCortaDeFila(m[2])
    const u = fechaCortaDeFila(m[3])
    return {
      texto: `terminada · ${cifraPunto(Number(m[1]))} piezas (${p} a ${u})`,
      aviso: avisoVolverRango(rango, ahora, 'Recarga terminada.'),
    }
  }
  m = /^terminada (\d+)$/.exec(recarga)
  if (m) return { texto: `terminada · ${cifraPunto(Number(m[1]))} piezas (el rango estaba vacío o ya estaba todo)`, aviso: avisoVolverRango(rango, ahora, 'Recarga terminada.') }
  m = /^cancelada (\d+)$/.exec(recarga)
  if (m) return { texto: `cancelada · ${cifraPunto(Number(m[1]))} piezas enviadas`, aviso: avisoVolverRango(rango, ahora, 'Recarga cancelada.') }
  return { texto: recarga, aviso: null }
}

/** Orden para el PC de planta: crea el archivo RECARGA en la carpeta del lector. */
export const COMANDO_RECARGA = 'New-Item -ItemType File -Force "$env:LOCALAPPDATA\\espejo-grader\\RECARGA"'
