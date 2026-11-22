/**
 * Cobertura del grader en un turno: qué parte del turno tiene datos de Matrix,
 * qué tramo falta, por qué falta (cuando se puede saber) y si el hueco ya es
 * aviso según la cadencia de exporte comprometida en planta.
 *
 * ⚠ Marco horario único: los ts del grader (`startAt`/`endAt`) y los del turno
 * de Shoplogix son HORA DE PLANTA marcada como UTC («wall-clock-as-UTC»). Todo
 * se compara con `Date.parse` tal cual y se formatea con `getUTC*`; nunca se
 * convierte de zona. El «ahora» que entra aquí también es wall-clock-as-UTC
 * (`Date.now() - offset`), como `ahoraWallMs` del monitor.
 *
 * Sin dependencias del resto del módulo Grader: el monitor público la importa y
 * no debe arrastrar echarts al bundle.
 */

/** Cadencia de exporte de Matrix que la planta se compromete a cumplir. */
export type CadenciaExporte = '2h' | 'turno' | 'cierre'

export const CADENCIAS: ReadonlyArray<{ id: CadenciaExporte; rotulo: string; texto: string }> = [
  { id: '2h', rotulo: '2 h', texto: 'cada 2 h' },
  { id: 'turno', rotulo: 'Turno', texto: 'una vez por turno' },
  { id: 'cierre', rotulo: 'Cierre', texto: 'al cierre' },
]

export const CADENCIA_POR_DEFECTO: CadenciaExporte = '2h'

/** Meta de cobertura: % del turno transcurrido con datos del grader. */
export const META_COBERTURA_PCT = 90

/** Un hueco más corto que esto no se cuenta como «falta»: el exporte recién llegó. */
export const HUECO_MINIMO_MIN = 5

/** Con cadencia «cada 2 h», cuánto puede pasar desde el último dato antes de que el hueco sea aviso. */
const PLAZO_2H_MS = 2 * 60 * 60_000

const MIN = 60_000

/** Tramo `[desde, hasta)` en ms wall-clock-as-UTC. */
export interface Tramo {
  desde: number
  hasta: number
}

export type CausaFaltante = 'nadie' | 'cortado' | 'apagada' | 'sin-exporte'

export const CAUSA_TEXTO: Record<CausaFaltante, string> = {
  nadie: 'Nadie exportó',
  cortado: 'Exporte cortado en 10.000 piezas',
  apagada: 'Carga automática apagada',
  'sin-exporte': 'Sin exporte',
}

export interface CoberturaTurno {
  /** Ventana del turno (inicio → fin programado). */
  inicio: number
  fin: number
  /** «Ahora» acotado a la ventana: con el turno cerrado es el fin. */
  ahora: number
  cerrado: boolean
  /** Tramos con datos, unidos y recortados a `[inicio, ahora]`, en orden. */
  conDatos: Tramo[]
  /** Tramos sin datos dentro de `[inicio, ahora]` de al menos HUECO_MINIMO_MIN. */
  faltantes: Tramo[]
  /** El último tramo faltante (el que se debe exportar ahora), o null. */
  faltaCola: Tramo | null
  /** Último instante con datos dentro de la ventana, o null si el turno no tiene ninguno. */
  hasta: number | null
  /** % del tiempo transcurrido del turno con datos (0–100, entero). null si el turno aún no empieza. */
  pct: number | null
  /** El hueco de cola ya pasó el plazo de la cadencia. */
  aviso: boolean
}

function parse(iso: string | null | undefined): number {
  if (!iso) return NaN
  return Date.parse(iso)
}

/** Une tramos solapados o contiguos. Entrada sin orden; salida ordenada. */
export function unirTramos(tramos: ReadonlyArray<Tramo>): Tramo[] {
  const ok = tramos.filter((t) => Number.isFinite(t.desde) && Number.isFinite(t.hasta) && t.hasta > t.desde)
  ok.sort((a, b) => a.desde - b.desde)
  const out: Tramo[] = []
  for (const t of ok) {
    const ult = out[out.length - 1]
    if (ult && t.desde <= ult.hasta) ult.hasta = Math.max(ult.hasta, t.hasta)
    else out.push({ desde: t.desde, hasta: t.hasta })
  }
  return out
}

/**
 * Si el hueco de cola ya es aviso según la cadencia.
 * - «cada 2 h»: el siguiente exporte tocaba 2 h después del último dato (o del inicio, sin datos).
 * - «una vez por turno» y «al cierre»: el exporte llega al cierre; con el turno en curso nunca es aviso,
 *   con el turno cerrado sí (es igual en las dos: el mockup no distingue, no se inventa una diferencia).
 */
export function esAviso(params: {
  cadencia: CadenciaExporte
  faltaCola: Tramo | null
  cerrado: boolean
}): boolean {
  const { cadencia, faltaCola, cerrado } = params
  if (!faltaCola) return false
  if (cadencia === '2h') return faltaCola.hasta - faltaCola.desde > PLAZO_2H_MS || cerrado
  return cerrado
}

/**
 * Cobertura del turno. `resumenes` son los `[startAt, endAt]` de los resúmenes del grader
 * que se crucen con el turno (se cruzan por solape de tiempo, no por nombre de turno).
 * Devuelve null si la ventana del turno no es válida.
 */
export function calcularCobertura(params: {
  inicio: string | null | undefined
  fin: string | null | undefined
  ahoraWallMs: number
  resumenes: ReadonlyArray<{ startAt?: string | null; endAt?: string | null }>
  cadencia: CadenciaExporte
  /** Tramos que trae el espejo del grader (ms wall-clock): cuentan como datos igual que el Excel. */
  espejo?: ReadonlyArray<Tramo>
}): CoberturaTurno | null {
  const inicio = parse(params.inicio)
  const fin = parse(params.fin)
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null
  const cerrado = params.ahoraWallMs >= fin
  const ahora = Math.min(Math.max(params.ahoraWallMs, inicio), fin)

  const conDatos = unirTramos([
    ...params.resumenes.map((r) => ({
      desde: Math.max(parse(r.startAt), inicio),
      hasta: Math.min(parse(r.endAt), ahora),
    })),
    ...(params.espejo ?? []).map((t) => ({ desde: Math.max(t.desde, inicio), hasta: Math.min(t.hasta, ahora) })),
  ])

  const faltantes: Tramo[] = []
  let cursor = inicio
  for (const t of conDatos) {
    if (t.desde - cursor >= HUECO_MINIMO_MIN * MIN) faltantes.push({ desde: cursor, hasta: t.desde })
    cursor = t.hasta
  }
  if (ahora - cursor >= HUECO_MINIMO_MIN * MIN) faltantes.push({ desde: cursor, hasta: ahora })

  const ultimo = conDatos[conDatos.length - 1]
  const hasta = ultimo ? ultimo.hasta : null
  const ultimoFalta = faltantes[faltantes.length - 1]
  const faltaCola = ultimoFalta && ultimoFalta.hasta === ahora ? ultimoFalta : null

  const transcurrido = ahora - inicio
  const cubierto = conDatos.reduce((s, t) => s + (t.hasta - t.desde), 0)
  const pct = transcurrido > 0 ? Math.round((cubierto / transcurrido) * 100) : null

  return {
    inicio,
    fin,
    ahora,
    cerrado,
    conDatos,
    faltantes,
    faltaCola,
    hasta,
    pct,
    aviso: esAviso({ cadencia: params.cadencia, faltaCola, cerrado }),
  }
}

/** Estado local de la carpeta de Matrix (mismo conjunto que `EstadoCarpeta`, sin importarlo). */
export type EstadoCarpetaLocal =
  | 'sin-autorizar' | 'vigilando' | 'permiso' | 'cargado' | 'cortado' | 'viejo' | 'demasiados' | 'error'

/**
 * Por qué falta el tramo, solo cuando se puede saber. La única fuente es el
 * estado de la carga automática EN ESTE PC. `sin-autorizar` es también el
 * estado inicial en cualquier PC sin carpeta (o en una pestaña donde el
 * vigilante no corre, como el monitor): de ahí no se puede concluir nada, y
 * afirmar «apagada» repetiría el error de la etapa 0.
 */
export function causaFaltante(estadoLocal: EstadoCarpetaLocal | null | undefined): CausaFaltante {
  switch (estadoLocal) {
    case 'cortado': return 'cortado'
    case 'permiso': return 'apagada'
    case 'vigilando':
    case 'cargado':
    case 'viejo': return 'nadie'
    default: return 'sin-exporte'
  }
}

/** HH:MM de un instante wall-clock-as-UTC. */
export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** DD-MM HH:MM de un ISO o ms wall-clock-as-UTC. '' si no es válido. */
export function ddmmHhmm(valor: string | number | null | undefined): string {
  const ms = typeof valor === 'number' ? valor : parse(valor)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')} ${hhmm(ms)}`
}

/**
 * Último `endAt` entre resúmenes de una línea (etapa 0, «Datos del grader hasta»).
 * Solo cuentan resúmenes con piezas. Compara por instante, no por texto.
 */
export function ultimoEndAt(
  resumenes: ReadonlyArray<{ endAt?: string | null; totalPieces?: number }>,
): string | null {
  let mejor: string | null = null
  let mejorMs = -Infinity
  for (const r of resumenes) {
    if (!(Number(r.totalPieces) > 0)) continue
    const ms = parse(r.endAt)
    if (Number.isFinite(ms) && ms > mejorMs) { mejorMs = ms; mejor = r.endAt ?? null }
  }
  return mejor
}

/** «Ahora» en hora de planta marcada como UTC, para comparar con los ts del grader. */
export function ahoraWall(nowMs: number = Date.now()): number {
  return nowMs - new Date(nowMs).getTimezoneOffset() * MIN
}
