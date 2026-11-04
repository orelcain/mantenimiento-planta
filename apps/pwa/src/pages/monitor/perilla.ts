/**
 * perilla.ts — la velocidad de la perilla de cada Baader y la vara que sale de ella.
 *
 * La perilla es el ritmo (pz/min) que la máquina tiene configurado. Shoplogix dice
 * otro número, el esperado. Mientras haya una anotación vigente para esa máquina en
 * ese instante, la vara es la perilla; si no, cae al esperado de Shoplogix.
 *
 * Funciones puras: no leen Firestore ni el reloj. El tiempo entra como parámetro
 * (ms), así que lo que se prueba es lo que se usa.
 *
 * `varaMinuto` la usa `varaEnMinuto` (ritmoVivo.ts), que alimenta el llenado, la franja
 * y el gráfico del Ritmo en vivo. El Duelo, la cascada y el OEE no la usan: siguen con el
 * esperado de Shoplogix.
 */
/**
 * Lo que el monitor público ve de una perilla: velocidad y cuándo entró en vigor.
 * Quién la anotó no sale del servidor (functions/publicMonitor.js, normPerilla).
 */
export type PerillaPublica = { cpm: number; desde: string }

/** Forma de `live.perillas` en el monitor público (publicShiftMonitor.service.ts). */
export interface PerillasDeLinea {
  actual: Record<string, PerillaPublica>
  historial: Array<PerillaPublica & { machineId: string }>
}

/** De dónde sale la vara del minuto: la perilla de la máquina o el esperado de Shoplogix. */
export type FuenteVara = 'perilla' | 'shoplogix'

/**
 * Velocidad de la perilla vigente para una máquina en `tMs`: la anotación más
 * reciente con `desde <= tMs`. Null si la máquina no tenía ninguna hasta ese instante,
 * o si `tMs` no es un número finito (con NaN, cualquier anotación parecería vigente).
 *
 * Mira el historial Y la anotación `actual`. El historial se recorta a 100 entradas;
 * `actual` asegura que la anotación más nueva nunca se pierda por ese recorte.
 */
export function perillaEn(
  perillas: PerillasDeLinea | null | undefined,
  machineId: string,
  tMs: number,
): number | null {
  return perillaVigenteEn(perillas, machineId, tMs)?.cpm ?? null
}

/**
 * La anotación de perilla vigente para una máquina en `tMs`: su velocidad y su `desde`. Es la misma regla que `perillaEn`
 * (que se apoya en ella): la más reciente con `desde <= tMs`. Null si no había ninguna o si `tMs` no es finito. La franja
 * la usa para decir «anotada dd-mm» y para el editor.
 */
export function perillaVigenteEn(
  perillas: PerillasDeLinea | null | undefined,
  machineId: string,
  tMs: number,
): PerillaPublica | null {
  if (!perillas || !Number.isFinite(tMs)) return null
  const candidatas: PerillaPublica[] = [
    ...(perillas.historial ?? []).filter((h) => h.machineId === machineId),
    ...(perillas.actual?.[machineId] ? [perillas.actual[machineId]] : []),
  ]
  let vigente: { entrada: PerillaPublica; t: number } | null = null
  for (const c of candidatas) {
    const t = Date.parse(c.desde)
    if (!Number.isFinite(t) || !Number.isFinite(c.cpm) || t > tMs) continue
    if (!vigente || t >= vigente.t) vigente = { entrada: c, t }
  }
  return vigente ? vigente.entrada : null
}

/**
 * Vara del minuto para una máquina: la perilla vigente si la hay; si no, el esperado
 * de Shoplogix. `fuente` dice de dónde salió, para poder decirlo en pantalla. Si no
 * hay ninguno de los dos, `cpm` es null y la fuente queda en 'shoplogix'.
 */
export function varaMinuto(
  perillas: PerillasDeLinea | null | undefined,
  machineId: string,
  tMs: number,
  esperadoShoplogix: number | null,
): { cpm: number | null; fuente: FuenteVara } {
  const perilla = perillaEn(perillas, machineId, tMs)
  if (perilla !== null) return { cpm: perilla, fuente: 'perilla' }
  return { cpm: esperadoShoplogix, fuente: 'shoplogix' }
}

/**
 * Fracción de la perilla desde la que un minuto cuenta «a ritmo». Con perilla
 * anotada, «a ritmo» es la perilla completa (decisión de Orel, 04-11): con 17, 17 o
 * más. Es la única constante del umbral. Sin perilla no se usa: la vara de Shoplogix
 * conserva el 75 % de siempre (`tonoVara`).
 */
export const UMBRAL_A_RITMO_PERILLA = 1
const EPSILON_UMBRAL = 1e-9

/**
 * Umbral «a ritmo» entero de una perilla: el entero hacia arriba de
 * UMBRAL_A_RITMO_PERILLA × cpm. Con 17 da 17. El epsilon resta una cantidad ínfima
 * antes de redondear, para que un resultado exacto no suba a la unidad siguiente
 * por un error de coma flotante.
 */
export function umbralARitmo(cpm: number): number {
  return Math.ceil(cpm * UMBRAL_A_RITMO_PERILLA - EPSILON_UMBRAL)
}

/** Tono de un minuto contra su vara. `sin` = la Baader no tiene vara ni dato de ese minuto. */
export type TonoVara = 'bien' | 'atento' | 'mal' | 'sin'

/**
 * Tono de un minuto contra SU vara. Con perilla: «a ritmo» desde el umbral entero,
 * «bajo» desde la mitad de la perilla y «muy bajo» debajo. Con vara de Shoplogix: el
 * 75 % y el 50 % de siempre. No cambia `tonoDe` ni `tonoMinuto`, que comparte el Duelo.
 */
export function tonoVara(v: number, vara: { cpm: number | null; fuente: FuenteVara }): TonoVara {
  const cpm = vara.cpm
  if (cpm == null || !(cpm > 0)) return v > 0 ? 'bien' : 'sin'
  if (vara.fuente === 'perilla') {
    if (v >= umbralARitmo(cpm)) return 'bien'
    return v / cpm >= 0.5 ? 'atento' : 'mal'
  }
  const r = v / cpm
  return r >= 0.75 ? 'bien' : r >= 0.5 ? 'atento' : 'mal'
}

/**
 * Umbral «a ritmo» entero de una vara, según su fuente: con perilla, `umbralARitmo`
 * (17 → 17); con vara de Shoplogix, el 75 % redondeado hacia arriba (17 → 13, como
 * antes de la perilla). Null si no hay vara.
 */
export function umbralEntero(vara: { cpm: number | null; fuente: FuenteVara }): number | null {
  if (vara.cpm == null || !(vara.cpm > 0)) return null
  return vara.fuente === 'perilla' ? umbralARitmo(vara.cpm) : Math.ceil(vara.cpm * 0.75 - EPSILON_UMBRAL)
}

/**
 * Los dos enteros que separan los tonos de una vara, según `tonoVara` (la única regla): `aRitmo` es el primer entero «a ritmo»
 * (el de `umbralEntero`) y `bajo` el primero «bajo»; de `bajo` a `aRitmo - 1` es «bajo» y debajo de `bajo` es «muy bajo».
 * Si no hay ningún entero «bajo», `bajo` queda igual a `aRitmo`. Null sin vara.
 */
export function bandasEnteras(vara: { cpm: number | null; fuente: FuenteVara }): { aRitmo: number; bajo: number } | null {
  const aRitmo = umbralEntero(vara)
  if (aRitmo == null) return null
  let bajo = aRitmo
  for (let v = 0; v < aRitmo; v++) {
    if (tonoVara(v, vara) !== 'mal') { bajo = v; break }
  }
  return { aRitmo, bajo }
}

/** «04-11»: día y mes de un `desde`. Se corta el texto (no se convierte): el `desde` ya viene en hora de planta. */
export const diaMesPerilla = (desde: string): string => `${desde.slice(8, 10)}-${desde.slice(5, 7)}`
/** «01:20»: la hora de un `desde`, sin convertir zona (misma convención que `diaMesPerilla`). */
export const horaPerilla = (desde: string): string => desde.slice(11, 16)

/**
 * Rótulo de la raya «a ritmo» de una vara: «17 o más» con perilla, «12 o más» sin ella. Es el entero de `umbralEntero`, el mismo
 * que la franja escribe bajo «minutos a ritmo». Null sin vara.
 */
export function rotuloRaya(vara: { cpm: number | null; fuente: FuenteVara }): string | null {
  const umbral = umbralEntero(vara)
  return umbral == null ? null : `${umbral} o más`
}

/**
 * Tono de una cifra de carros con pieza (un porcentaje de la vara), con la misma regla que `tonoVara`: con perilla, «a ritmo» es la
 * perilla completa; sin perilla, el 75 % y el 50 % de siempre. Sin vara o sin cifra, `sin`.
 */
export function tonoDePorcentajeVara(pct: number | null, vara: { cpm: number | null; fuente: FuenteVara }): TonoVara {
  if (pct == null || vara.cpm == null || !(vara.cpm > 0)) return 'sin'
  return tonoVara((pct / 100) * vara.cpm, vara)
}

/**
 * Quién anotó, para mostrar. Una anotación puede traer el correo de la sesión (las anotaciones viejas): se muestra solo lo que va
 * antes de «@». Nunca un correo completo. Sin dato, o sin nada antes de «@», no hay nombre que mostrar: null.
 */
export function quienAnoto(por: string | null | undefined): string | null {
  const t = (por ?? '').trim()
  if (!t) return null
  const arroba = t.indexOf('@')
  if (arroba < 0) return t
  return t.slice(0, arroba).trim() || null
}

/**
 * Lo que se guarda como «por» al anotar una perilla: el nombre visible del usuario si lo tiene; si no, lo que va antes de «@» de su
 * correo. Así la anotación nueva no guarda el correo completo.
 */
export function porDeUsuario(u: { nombre?: string | null; apellido?: string | null; email?: string | null } | null | undefined): string | null {
  const nombre = `${u?.nombre ?? ''} ${u?.apellido ?? ''}`.trim()
  return nombre || quienAnoto(u?.email) || null
}
