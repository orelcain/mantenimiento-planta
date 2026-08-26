/**
 * Rueda de ventanas de intervención — dominio.
 *
 * El día se parte en 288 tramos de 5 minutos y se describe con DOS capas
 * independientes sobre el mismo tramo:
 *
 *   capa `areas` → quién ocupa el equipo: Proceso / Higiene / Colación / nadie
 *   capa `mant`  → si Mantención entra ahí (1) o no (0)
 *
 * El cruce de ambas es el entregable, y por eso son dos capas y no una: con una
 * sola, «Mantención interviniendo mientras Higiene lava» se guarda como si el
 * tramo estuviera simplemente bloqueado, y se pierde justo el dato que hay que
 * poder mostrar — las horas que se trabaja con agua encima.
 *
 * Las dos capas se guardan como strings de 288 caracteres (no arrays) para que
 * un día completo pese ~600 bytes en Firestore y la semana de una máquina entre
 * holgada en un solo documento.
 */

import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { setDoc as trackedSetDoc } from './firestoreTracked'
import {
  CONFIG_CARGA_POR_DEFECTO,
  tareasIniciales,
  type ConfigCarga,
  type TareaMantencion,
} from './ruedaCarga'
import type { Anclaje } from './ruedaProgramacion'

export const SLOTS_POR_DIA = 288
export const MINUTOS_POR_SLOT = 5
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/**
 * Quién ocupa el tramo. `0` = nadie.
 *
 * `X` no es un capricho: en esta planta Higiene entra normalmente DURANTE la
 * colación de producción, así que ese tramo tiene dos ocupantes reales a la vez.
 * Modelarlo como `C` diría que la colación es ventana aprovechable —  que es
 * justo lo contrario de lo que pasa— y modelarlo como `H` perdería que ahí
 * además la línea está parada. `X` guarda los dos hechos.
 */
export type Ocupante = 'P' | 'H' | 'C' | 'X' | '0'
export const OCUPANTES: Ocupante[] = ['P', 'H', 'C', 'X', '0']

/** En qué condición puede entrar Mantención a un tramo. */
export type Condicion = 'limpia' | 'colacion' | 'marcha' | 'agua'

export interface DiaRueda {
  /** 288 chars de `Ocupante`. */
  areas: string
  /** 288 chars de '0' | '1'. */
  mant: string
}

export interface MaquinaRueda {
  id: string
  nombre: string
  /** Siempre 7 posiciones, lunes = 0. */
  semana: DiaRueda[]
  /**
   * Si alguien ya comparó el horario de ESTA máquina con la operación real.
   *
   * Empezó siendo un único flag para todo el plan, y eso obligaba a desconfiar
   * de las seis máquinas hasta terminar la última. En terreno se confirman de a
   * una, así que el estado también va de a una: lo confirmado se puede usar como
   * evidencia aunque el resto siga siendo base de ejemplo.
   */
  revisadoEnTerreno?: boolean
}

export interface RuedaState {
  maquinas: MaquinaRueda[]
  /** @deprecated Migrado a `MaquinaRueda.revisadoEnTerreno`; se lee para convertir documentos viejos. */
  /** Trabajo rutinario y preventivo a encajar en las ventanas. Ver `ruedaCarga`. */
  tareas?: TareaMantencion[]
  configCarga?: ConfigCarga
  /** Ejecuciones movidas a mano en la programación. Ver `ruedaProgramacion`. */
  anclajes?: Anclaje[]
  revisadoEnTerreno?: boolean
  updatedAtClient?: number
  updatedBy?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Condición de intervención
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nadie encima = intervención limpia. Que el tramo esté marcado como Mantención
 * no cambia la condición: lo que manda es quién MÁS está en el equipo.
 */
export function condicionDe(ocupante: string): Condicion {
  // Donde hay higiene manda higiene, esté o no la línea parada por colación.
  if (ocupante === 'H' || ocupante === 'X') return 'agua'
  if (ocupante === 'C') return 'colacion'
  if (ocupante === 'P') return 'marcha'
  return 'limpia'
}

export const CONDICION_LABEL: Record<Condicion, string> = {
  limpia: 'Limpia',
  colacion: 'En colación',
  marcha: 'Máquina corriendo',
  agua: 'Con agua encima',
}

export const CONDICION_DETALLE: Record<Condicion, string> = {
  limpia: 'Nadie más en el equipo',
  colacion: 'Línea parada y sin higiene encima',
  marcha: 'Solo intervención no invasiva',
  agua: 'Higiene lavando el mismo tramo',
}

export const OCUPANTE_LABEL: Record<Ocupante, string> = {
  P: 'Proceso',
  H: 'Higiene',
  C: 'Colación sola',
  X: 'Higiene en colación',
  '0': 'Sin nadie',
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción y edición
// ─────────────────────────────────────────────────────────────────────────────

export function diaVacio(): DiaRueda {
  return { areas: '0'.repeat(SLOTS_POR_DIA), mant: '0'.repeat(SLOTS_POR_DIA) }
}

export function slotDeHora(hora: number, minuto = 0): number {
  return Math.floor((hora * 60 + minuto) / MINUTOS_POR_SLOT)
}

/** Pinta [desde, hasta) en una capa. Envuelve por medianoche si hasta < desde. */
export function pintarRango(capa: string, desde: number, hasta: number, valor: string): string {
  const out = capa.split('')
  const largo = hasta > desde ? hasta - desde : hasta + SLOTS_POR_DIA - desde
  for (let k = 0; k < largo; k++) out[(desde + k) % SLOTS_POR_DIA] = valor
  return out.join('')
}

export function pintarSlot(capa: string, slot: number, valor: string): string {
  if (slot < 0 || slot >= SLOTS_POR_DIA) return capa
  return capa.slice(0, slot) + valor + capa.slice(slot + 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuantificación
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenDia {
  /** Tramos por ocupante. */
  ocupacion: Record<Ocupante, number>
  /** Tramos de intervención, repartidos por la condición en que se entra. */
  condicion: Record<Condicion, number>
  /** Total de tramos marcados como intervención. */
  intervencion: number
  /** Tramos que no ocupa nadie: el techo de ventana disponible. */
  libres: number
}

export function contarDia(dia: DiaRueda): ResumenDia {
  const ocupacion: Record<Ocupante, number> = { P: 0, H: 0, C: 0, X: 0, '0': 0 }
  const condicion: Record<Condicion, number> = { limpia: 0, colacion: 0, marcha: 0, agua: 0 }
  let intervencion = 0

  for (let i = 0; i < SLOTS_POR_DIA; i++) {
    const bruto = dia.areas[i] ?? '0'
    const ocupante: Ocupante = (OCUPANTES as string[]).includes(bruto) ? (bruto as Ocupante) : '0'
    ocupacion[ocupante]++
    if (dia.mant[i] === '1') {
      intervencion++
      condicion[condicionDe(ocupante)]++
    }
  }

  return { ocupacion, condicion, intervencion, libres: ocupacion['0'] }
}

export interface ResumenSemana {
  porDia: ResumenDia[]
  libres: number
  agua: number
  higiene: number
  /** Tramos de colación que higiene se lleva: la ventana que parecía existir. */
  colacionTomada: number
  intervencion: number
}

export function contarSemana(maquina: MaquinaRueda): ResumenSemana {
  const porDia = maquina.semana.map(contarDia)
  return {
    porDia,
    libres: porDia.reduce((a, r) => a + r.libres, 0),
    agua: porDia.reduce((a, r) => a + r.condicion.agua, 0),
    // Higiene ocupa el equipo tanto si lava solo como si lo hace en la colación.
    higiene: porDia.reduce((a, r) => a + r.ocupacion.H + r.ocupacion.X, 0),
    colacionTomada: porDia.reduce((a, r) => a + r.ocupacion.X, 0),
    intervencion: porDia.reduce((a, r) => a + r.intervencion, 0),
  }
}

export interface BloqueRueda {
  inicio: number
  largo: number
  /** Tramos del bloque en que higiene ocupa el equipo. */
  conAgua: number
}

/**
 * Bloques contiguos de intervención. Une el que cruza medianoche: una ventana de
 * 23:00 a 02:00 es UNA ventana de 3 h, no dos pedazos, y esa distinción es la que
 * decide si alcanza a hacerse el trabajo.
 */
export function bloquesIntervencion(dia: DiaRueda): BloqueRueda[] {
  const N = SLOTS_POR_DIA
  const activo = (i: number) => dia.mant[((i % N) + N) % N] === '1'

  let offset = 0
  if (activo(0) && activo(N - 1)) {
    let j = 0
    while (j < N && activo(j)) j++
    if (j === N) return [{ inicio: 0, largo: N, conAgua: contarAgua(dia, 0, N) }]
    offset = j
  }

  const out: BloqueRueda[] = []
  let inicio = -1
  for (let k = 0; k < N; k++) {
    const i = (k + offset) % N
    if (activo(i)) {
      if (inicio < 0) inicio = i
    } else if (inicio >= 0) {
      const largo = ((i - inicio) + N) % N
      out.push({ inicio, largo, conAgua: contarAgua(dia, inicio, largo) })
      inicio = -1
    }
  }
  if (inicio >= 0) {
    const largo = ((offset - inicio) + N) % N || N
    out.push({ inicio, largo, conAgua: contarAgua(dia, inicio, largo) })
  }
  return out
}

function contarAgua(dia: DiaRueda, inicio: number, largo: number): number {
  let n = 0
  for (let k = 0; k < largo; k++) {
    const oc = dia.areas[(inicio + k) % SLOTS_POR_DIA]
    if (oc === 'H' || oc === 'X') n++
  }
  return n
}

export interface TramoAgrupado {
  inicio: number
  largo: number
  valor: string
}

/**
 * Tramos contiguos con el mismo valor. Dibujar 288 elementos por capa es caro y
 * además se ve peor: los bordes entre tramos iguales dejan costuras.
 */
export function agruparTramos(capa: string): TramoAgrupado[] {
  const out: TramoAgrupado[] = []
  let inicio = 0
  for (let i = 1; i <= SLOTS_POR_DIA; i++) {
    if (i === SLOTS_POR_DIA || capa[i] !== capa[inicio]) {
      out.push({ inicio, largo: i - inicio, valor: capa[inicio] ?? '0' })
      inicio = i
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Formato
// ─────────────────────────────────────────────────────────────────────────────

export function slotAHora(slot: number): string {
  const total = (((slot % SLOTS_POR_DIA) + SLOTS_POR_DIA) % SLOTS_POR_DIA) * MINUTOS_POR_SLOT
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** «2 h 30». Para leer duraciones sin traducir decimales mentalmente. */
export function slotsAHorasMinutos(slots: number): string {
  const total = slots * MINUTOS_POR_SLOT
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h} h ${String(m).padStart(2, '0')}`
}

/** «2,5». Para comparar de un vistazo en KPIs y columnas. */
export function slotsAHorasDecimal(slots: number): string {
  return ((slots * MINUTOS_POR_SLOT) / 60).toFixed(1).replace('.', ',')
}

// ─────────────────────────────────────────────────────────────────────────────
// Base de partida
// ─────────────────────────────────────────────────────────────────────────────

/** Perfil de operación de la máquina: cuántos turnos procesa al día. */
export type PerfilOperacion = 'simple' | 'doble'

/**
 * Semana tipo de arranque. NO es el horario real de planta: es un patrón
 * razonable para que la rueda no arranque vacía y se pueda corregir encima. Lo
 * declara `revisadoEnTerreno` en el estado, y la UI lo advierte mientras sea
 * falso, para que estas horas no se usen como evidencia sin haberse verificado.
 */
export function baseDia(perfil: PerfilOperacion, dia: number): DiaRueda {
  let areas = '0'.repeat(SLOTS_POR_DIA)
  const mant = '0'.repeat(SLOTS_POR_DIA)

  if (dia === 6) return { areas, mant }

  if (dia === 5) {
    areas = pintarRango(areas, slotDeHora(8), slotDeHora(13), 'P')
    areas = pintarRango(areas, slotDeHora(13), slotDeHora(17), 'H')
    return { areas, mant }
  }

  if (perfil === 'doble') {
    areas = pintarRango(areas, slotDeHora(8), slotDeHora(13), 'P')
    areas = pintarRango(areas, slotDeHora(13), slotDeHora(14), 'X')
    areas = pintarRango(areas, slotDeHora(14), slotDeHora(21), 'P')
    areas = pintarRango(areas, slotDeHora(21), slotDeHora(22), 'X')
    areas = pintarRango(areas, slotDeHora(22), SLOTS_POR_DIA, 'P')
    areas = pintarRango(areas, slotDeHora(0), slotDeHora(4), 'H')
  } else {
    areas = pintarRango(areas, slotDeHora(8), slotDeHora(13), 'P')
    areas = pintarRango(areas, slotDeHora(13), slotDeHora(14), 'X')
    areas = pintarRango(areas, slotDeHora(14), slotDeHora(19), 'P')
    areas = pintarRango(areas, slotDeHora(19), slotDeHora(22), 'H')
  }

  return { areas, mant }
}

export function baseSemana(perfil: PerfilOperacion): DiaRueda[] {
  return Array.from({ length: 7 }, (_, d) => baseDia(perfil, d))
}

/** Cuántas máquinas tienen el horario confirmado contra la operación real. */
export function confirmadas(maquinas: MaquinaRueda[]): MaquinaRueda[] {
  return maquinas.filter((m) => m.revisadoEnTerreno === true)
}

export function sinConfirmar(maquinas: MaquinaRueda[]): MaquinaRueda[] {
  return maquinas.filter((m) => m.revisadoEnTerreno !== true)
}

export function maquinaNueva(id: string, nombre: string, perfil: PerfilOperacion = 'simple'): MaquinaRueda {
  return { id, nombre, semana: baseSemana(perfil) }
}

const MAQUINAS_INICIALES: Array<[string, string, PerfilOperacion]> = [
  ['grader', 'Grader MS4/12', 'doble'],
  ['baader142-n1', 'Baader 142 · N1', 'simple'],
  ['baader142-n2', 'Baader 142 · N2', 'doble'],
  ['baader142-n3', 'Baader 142 · N3', 'doble'],
  ['baader200', 'Baader 200 · Filete', 'simple'],
  ['gea', 'GEA', 'simple'],
]

export function estadoInicial(): RuedaState {
  return {
    maquinas: MAQUINAS_INICIALES.map(([id, nombre, perfil]) => maquinaNueva(id, nombre, perfil)),
    tareas: tareasIniciales(),
    configCarga: { ...CONFIG_CARGA_POR_DEFECTO },
    anclajes: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia
// ─────────────────────────────────────────────────────────────────────────────

export const RUEDA_FIRESTORE_PATH = ['rueda_ventanas_state', 'current'] as const

function esDiaValido(d: unknown): d is DiaRueda {
  const x = d as DiaRueda | null
  return (
    !!x &&
    typeof x.areas === 'string' && x.areas.length === SLOTS_POR_DIA &&
    typeof x.mant === 'string' && x.mant.length === SLOTS_POR_DIA
  )
}

/**
 * Normaliza lo que venga de Firestore. Un documento a medio escribir no debe
 * dejar la pantalla en blanco: cada máquina inválida se reemplaza por una base
 * y se sigue, en vez de tirar todo el estado.
 */
export function normalizarEstado(data: unknown): RuedaState | null {
  const raw = data as Partial<RuedaState> | null
  if (!raw || !Array.isArray(raw.maquinas) || raw.maquinas.length === 0) return null

  // Documento viejo con el flag global: si estaba confirmado, lo estaban todas.
  const revisadoGlobal = raw.revisadoEnTerreno === true

  const maquinas: MaquinaRueda[] = raw.maquinas
    .filter((m): m is MaquinaRueda => !!m && typeof m.id === 'string' && typeof m.nombre === 'string')
    .map((m) => ({
      id: m.id,
      nombre: m.nombre,
      semana:
        Array.isArray(m.semana) && m.semana.length === 7 && m.semana.every(esDiaValido)
          ? m.semana.map((d) => ({ areas: d.areas, mant: d.mant }))
          : baseSemana('simple'),
      revisadoEnTerreno: m.revisadoEnTerreno === true || revisadoGlobal,
    }))

  if (!maquinas.length) return null

  // Las tareas llegaron después que las máquinas: un documento guardado antes no
  // las trae, y quedarse sin ninguna dejaría la vista de carga vacía sin
  // explicación. Se repone la semilla, que además es editable.
  const tareas: TareaMantencion[] = Array.isArray(raw.tareas)
    ? raw.tareas.filter(
        (t): t is TareaMantencion =>
          !!t && typeof t.id === 'string' && typeof t.nombre === 'string' &&
          typeof t.minutos === 'number' && typeof t.personas === 'number',
      )
    : tareasIniciales()

  const anclajes: Anclaje[] = Array.isArray(raw.anclajes)
    ? raw.anclajes.filter(
        (a): a is Anclaje =>
          !!a && typeof a.tareaId === 'string' && typeof a.ocurrencia === 'number' &&
          typeof a.dia === 'number' && typeof a.inicio === 'number',
      )
    : []

  const cfg = raw.configCarga
  return {
    maquinas,
    tareas,
    anclajes,
    configCarga: {
      dotacion:
        typeof cfg?.dotacion === 'number' && cfg.dotacion > 0
          ? cfg.dotacion
          : CONFIG_CARGA_POR_DEFECTO.dotacion,
      reservaCorrectivasPct:
        typeof cfg?.reservaCorrectivasPct === 'number'
          ? cfg.reservaCorrectivasPct
          : CONFIG_CARGA_POR_DEFECTO.reservaCorrectivasPct,
    },
    updatedAtClient: raw.updatedAtClient,
    updatedBy: raw.updatedBy,
  }
}

export async function cargarRueda(): Promise<RuedaState | null> {
  const snap = await getDoc(doc(db, RUEDA_FIRESTORE_PATH[0], RUEDA_FIRESTORE_PATH[1]))
  if (!snap.exists()) return null
  return normalizarEstado(snap.data())
}

export async function guardarRueda(state: RuedaState, uid: string | null): Promise<void> {
  await trackedSetDoc(
    doc(db, RUEDA_FIRESTORE_PATH[0], RUEDA_FIRESTORE_PATH[1]),
    {
      maquinas: state.maquinas,
      tareas: state.tareas ?? [],
      configCarga: state.configCarga ?? CONFIG_CARGA_POR_DEFECTO,
      anclajes: state.anclajes ?? [],
      updatedAt: serverTimestamp(),
      updatedAtClient: Date.now(),
      updatedBy: uid ?? 'anon',
    },
    { merge: true },
  )
}
