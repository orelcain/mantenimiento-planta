/**
 * ¿Alcanza el tiempo? — capacidad de Mantención contra la carga de trabajo.
 *
 * La rueda dice CUÁNDO se puede entrar. Esto responde la pregunta siguiente, que
 * es la que de verdad importa para planificar el turno: con la gente que tengo y
 * las ventanas que me dejan, ¿me da el tiempo para lo que hay que hacer?
 *
 * Las dos magnitudes se miden en HORAS-HOMBRE para poder compararlas:
 *   capacidad = tiempo × personas que caben trabajando a la vez
 *   carga     = duración × personas que pide cada tarea × veces por semana
 *
 * El detalle que hace la cuenta honesta: en un tramo no se puede usar más gente
 * que máquinas disponibles, ni más máquinas que gente. Por eso la capacidad de
 * cada tramo es `min(máquinas disponibles, dotación)` y no el producto — sumar
 * «6 máquinas × 4 personas» daría una capacidad que no existe, porque una
 * persona no puede estar en dos máquinas a la vez.
 */

import {
  MINUTOS_POR_SLOT,
  SLOTS_POR_DIA,
  condicionDe,
  type MaquinaRueda,
} from './ruedaVentanas'

// ─────────────────────────────────────────────────────────────────────────────
// Dónde tiene tiempo la planta (mirada de conjunto)
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántas máquinas hay en cada condición, tramo a tramo. */
export interface DisponibilidadTramo {
  /** Nadie encima: se puede intervenir a fondo. */
  libres: number
  /** Línea parada por colación, sin higiene. */
  parada: number
  /** Higiene lavando: se puede entrar, pero se los retrasa. */
  agua: number
  /** Máquina corriendo: solo intervención no invasiva. */
  marcha: number
}

export function disponibilidadPorTramo(
  maquinas: MaquinaRueda[],
  diaIdx: number,
): DisponibilidadTramo[] {
  const out: DisponibilidadTramo[] = Array.from({ length: SLOTS_POR_DIA }, () => ({
    libres: 0,
    parada: 0,
    agua: 0,
    marcha: 0,
  }))

  for (const m of maquinas) {
    const dia = m.semana[diaIdx]
    if (!dia) continue
    for (let i = 0; i < SLOTS_POR_DIA; i++) {
      const tramo = out[i]
      if (!tramo) continue
      switch (condicionDe(dia.areas[i] ?? '0')) {
        case 'limpia':
          tramo.libres++
          break
        case 'colacion':
          tramo.parada++
          break
        case 'agua':
          tramo.agua++
          break
        case 'marcha':
          tramo.marcha++
          break
      }
    }
  }
  return out
}

export interface VentanaPlanta {
  inicio: number
  largo: number
  /** Máquinas sin nadie encima durante todo el bloque. */
  maquinaIds: string[]
}

/**
 * Bloques de tiempo en que el MISMO conjunto de máquinas está libre. Se corta
 * cuando entra o sale una máquina del conjunto, porque ahí cambia lo que se
 * puede hacer: una ventana de 4 h con cinco máquinas y otra de 4 h con una sola
 * no son la misma oportunidad, aunque duren igual.
 */
export function ventanasDePlanta(
  maquinas: MaquinaRueda[],
  diaIdx: number,
  minimoTramos = 3,
): VentanaPlanta[] {
  const firmaDe = (i: number): string =>
    maquinas
      .filter((m) => {
        const dia = m.semana[diaIdx]
        return dia ? condicionDe(dia.areas[i] ?? '0') === 'limpia' : false
      })
      .map((m) => m.id)
      .join('|')

  const out: VentanaPlanta[] = []
  let inicio = 0
  let firma = firmaDe(0)

  const cerrar = (fin: number) => {
    if (firma && fin - inicio >= minimoTramos) {
      out.push({ inicio, largo: fin - inicio, maquinaIds: firma.split('|') })
    }
  }

  for (let i = 1; i <= SLOTS_POR_DIA; i++) {
    const f = i === SLOTS_POR_DIA ? null : firmaDe(i)
    if (f !== firma) {
      cerrar(i)
      inicio = i
      firma = f ?? ''
    }
  }
  return out
}

/**
 * Ventanas de mejor a peor. El puntaje son HORAS-MÁQUINA (duración × máquinas
 * libres), no la duración sola: dos ventanas de 4 h no valen igual si una tiene
 * seis máquinas y la otra tres. Ordenar solo por largo hacía que el titular
 * anunciara la peor de dos ventanas empatadas en duración.
 */
export function ordenarVentanas(ventanas: VentanaPlanta[]): VentanaPlanta[] {
  const puntaje = (v: VentanaPlanta) => v.largo * v.maquinaIds.length
  return [...ventanas].sort((a, b) => puntaje(b) - puntaje(a) || b.largo - a.largo)
}

// ─────────────────────────────────────────────────────────────────────────────
// Trabajo a meter en esas ventanas
// ─────────────────────────────────────────────────────────────────────────────

export type TipoTarea = 'rutina' | 'preventiva'

export interface TareaMantencion {
  id: string
  nombre: string
  /** `null` = transversal, no atada a una máquina (engrase general, orden de taller). */
  maquinaId: string | null
  tipo: TipoTarea
  /** Duración de UNA ejecución, en minutos. */
  minutos: number
  /** Cuántas personas se necesitan a la vez. */
  personas: number
  vecesPorSemana: number
  /**
   * Si necesita la máquina detenida. Las que no la necesitan (inspecciones,
   * lecturas, engrase en marcha) pueden hacerse aunque la línea esté corriendo,
   * y por eso compiten por una capacidad distinta.
   */
  requiereDetencion: boolean
  activa: boolean
}

export interface ConfigCarga {
  /** Personas de Mantención por turno. */
  dotacion: number
  /**
   * Porcentaje de la capacidad que se aparta para lo que aparezca. Sin esta
   * reserva el plan «alcanza» justo, y la primera falla del lunes lo tumba.
   */
  reservaCorrectivasPct: number
}

export const CONFIG_CARGA_POR_DEFECTO: ConfigCarga = {
  dotacion: 2,
  reservaCorrectivasPct: 30,
}

/** Horas-hombre que pide una tarea en una semana. */
export function cargaSemanalMinutos(t: TareaMantencion): number {
  return t.minutos * t.personas * t.vecesPorSemana
}

export interface Capacidad {
  /** Minutos-hombre con la máquina detenida (nadie encima o línea parada). */
  conDetencionMin: number
  /** Minutos-hombre totales, incluyendo trabajo con la máquina corriendo. */
  totalMin: number
  /** Minutos-hombre que se ganarían entrando donde higiene está lavando. */
  pisandoHigieneMin: number
}

/**
 * Capacidad de la semana. `agua` NO se suma a la capacidad disponible: entrar
 * mientras higiene lava retrasa a higiene, así que es tiempo que existe pero que
 * cuesta un conflicto. Se devuelve aparte para poder decir «si además pisamos a
 * higiene, ganaríamos N horas» sin darlo por descontado en el plan.
 */
export function capacidadSemanal(maquinas: MaquinaRueda[], config: ConfigCarga): Capacidad {
  let conDetencion = 0
  let total = 0
  let pisando = 0

  for (let dia = 0; dia < 7; dia++) {
    const disp = disponibilidadPorTramo(maquinas, dia)
    for (const tramo of disp) {
      const detenidas = tramo.libres + tramo.parada
      const trabajables = detenidas + tramo.marcha
      conDetencion += Math.min(detenidas, config.dotacion) * MINUTOS_POR_SLOT
      total += Math.min(trabajables, config.dotacion) * MINUTOS_POR_SLOT
      pisando += Math.min(tramo.agua, config.dotacion) * MINUTOS_POR_SLOT
    }
  }

  return { conDetencionMin: conDetencion, totalMin: total, pisandoHigieneMin: pisando }
}

export interface Balance {
  capacidad: Capacidad
  /** Minutos-hombre de tareas que exigen la máquina detenida. */
  cargaConDetencionMin: number
  /** Minutos-hombre de todas las tareas activas. */
  cargaTotalMin: number
  /** Capacidad que queda tras apartar la reserva para correctivas. */
  disponibleConDetencionMin: number
  disponibleTotalMin: number
  reservaMin: number
  holguraConDetencionMin: number
  holguraTotalMin: number
  alcanza: boolean
  /** Qué porcentaje de la capacidad útil consume el trabajo planificado. */
  ocupacionPct: number
}

export function balance(
  maquinas: MaquinaRueda[],
  tareas: TareaMantencion[],
  config: ConfigCarga,
): Balance {
  const capacidad = capacidadSemanal(maquinas, config)
  const activas = tareas.filter((t) => t.activa)

  const cargaTotalMin = activas.reduce((a, t) => a + cargaSemanalMinutos(t), 0)
  const cargaConDetencionMin = activas
    .filter((t) => t.requiereDetencion)
    .reduce((a, t) => a + cargaSemanalMinutos(t), 0)

  const pct = Math.min(Math.max(config.reservaCorrectivasPct, 0), 90) / 100
  const reservaMin = capacidad.totalMin * pct
  const disponibleTotalMin = capacidad.totalMin - reservaMin
  const disponibleConDetencionMin = capacidad.conDetencionMin * (1 - pct)

  const holguraTotalMin = disponibleTotalMin - cargaTotalMin
  const holguraConDetencionMin = disponibleConDetencionMin - cargaConDetencionMin

  return {
    capacidad,
    cargaConDetencionMin,
    cargaTotalMin,
    disponibleConDetencionMin,
    disponibleTotalMin,
    reservaMin,
    holguraConDetencionMin,
    holguraTotalMin,
    // Las dos condiciones importan: puede sobrar tiempo en total y aun así no
    // haber suficientes horas de máquina detenida, que es donde se hace el
    // trabajo pesado. Decir «alcanza» mirando solo el total sería engañar.
    alcanza: holguraTotalMin >= 0 && holguraConDetencionMin >= 0,
    ocupacionPct: disponibleTotalMin > 0 ? (cargaTotalMin * 100) / disponibleTotalMin : 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formato y semilla
// ─────────────────────────────────────────────────────────────────────────────

/** «12 h 30» a partir de minutos. Las horas-hombre se leen igual que las horas. */
export function minutosAHorasTexto(min: number): string {
  const signo = min < 0 ? '−' : ''
  const abs = Math.round(Math.abs(min))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${signo}${h} h ${String(m).padStart(2, '0')}`
}

export function minutosAHorasDecimal(min: number): string {
  return (min / 60).toFixed(1).replace('.', ',')
}

/**
 * Tareas de arranque. Son las que Orel nombró como rutinarias; las duraciones y
 * dotaciones son estimaciones para poder empezar a jugar con el plan, NO tiempos
 * medidos. Se editan en la vista.
 */
export function tareasIniciales(): TareaMantencion[] {
  const base: Array<Omit<TareaMantencion, 'id' | 'activa'>> = [
    { nombre: 'Cambio de cuchillos', maquinaId: 'baader200', tipo: 'rutina', minutos: 45, personas: 2, vecesPorSemana: 3, requiereDetencion: true },
    { nombre: 'Montaje y desmontaje de cintas', maquinaId: null, tipo: 'rutina', minutos: 60, personas: 2, vecesPorSemana: 2, requiereDetencion: true },
    { nombre: 'Engrase de equipos', maquinaId: null, tipo: 'rutina', minutos: 90, personas: 1, vecesPorSemana: 2, requiereDetencion: false },
    { nombre: 'Revisión de tensado de cintas', maquinaId: null, tipo: 'preventiva', minutos: 30, personas: 1, vecesPorSemana: 1, requiereDetencion: true },
    { nombre: 'Inspección de rodamientos', maquinaId: 'grader', tipo: 'preventiva', minutos: 40, personas: 1, vecesPorSemana: 1, requiereDetencion: false },
    { nombre: 'Limpieza de tableros eléctricos', maquinaId: null, tipo: 'preventiva', minutos: 60, personas: 1, vecesPorSemana: 1, requiereDetencion: true },
  ]
  return base.map((t, i) => ({ ...t, id: `seed-${i}`, activa: true }))
}
