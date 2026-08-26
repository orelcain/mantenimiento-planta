/**
 * Encajar el trabajo dentro de las ventanas reales.
 *
 * `ruedaCarga` compara totales y responde «¿cabe?». Eso no basta para planificar:
 * un total puede alcanzar y aun así no haber en toda la semana un solo hueco
 * contiguo de 45 minutos con la máquina detenida — y entonces el cambio de
 * cuchillos no se hace, aunque «sobren horas». Esto ubica cada ejecución en un
 * día y una hora concretos, o dice por qué no pudo.
 *
 * El algoritmo es voraz y a propósito: se puede explicar en una frase («lo más
 * difícil primero, al primer hueco que sirva»), y un plan que el planificador
 * entiende vale más que un óptimo que no puede defender frente a Producción.
 * No busca la mejor solución posible; busca una defendible y reproducible.
 */

import {
  MINUTOS_POR_SLOT,
  SLOTS_POR_DIA,
  condicionDe,
  type Condicion,
  type MaquinaRueda,
} from './ruedaVentanas'
import type { ConfigCarga, TareaMantencion } from './ruedaCarga'

export interface Asignacion {
  tareaId: string
  nombre: string
  /** 1-based, para mostrar «2 de 3». */
  ocurrencia: number
  dia: number
  inicio: number
  largo: number
  /** `null` en tareas transversales. */
  maquinaId: string | null
  personas: number
  /** En qué condición queda esa ejecución (limpia, colación, en marcha). */
  condicion: Condicion
  /** La puso una persona a mano, no el algoritmo. */
  anclada?: boolean
}

/**
 * Una ejecución movida a mano. Se guarda aparte de la programación porque la
 * programación se recalcula entera cada vez que cambia cualquier cosa: si el
 * movimiento viviera en el resultado, se perdería al tocar la dotación o
 * cualquier horario.
 */
export interface Anclaje {
  tareaId: string
  /** 1-based, igual que `Asignacion.ocurrencia`. */
  ocurrencia: number
  dia: number
  inicio: number
}

export type MotivoNoCabe = 'sin-hueco' | 'sin-gente' | 'sin-maquina' | 'anclaje-invalido'

export interface NoAsignada {
  tareaId: string
  nombre: string
  ocurrencia: number
  motivo: MotivoNoCabe
}

export interface Programacion {
  asignaciones: Asignacion[]
  noAsignadas: NoAsignada[]
  /** Por tarea: cuántas ejecuciones se lograron ubicar de las pedidas. */
  porTarea: Array<{ tarea: TareaMantencion; ubicadas: number; pedidas: number }>
  minutosUbicados: number
}

export const MOTIVO_TEXTO: Record<MotivoNoCabe, string> = {
  'sin-hueco': 'No hay ningún hueco contiguo lo bastante largo',
  'sin-gente': 'No queda gente libre cuando la máquina lo está',
  'sin-maquina': 'La máquina de la tarea no existe en el plan',
  'anclaje-invalido': 'La hora fijada a mano dejó de servir',
}

/** Condiciones en las que se puede trabajar según si la tarea exige detención. */
function condicionesValidas(requiereDetencion: boolean): Condicion[] {
  // `agua` nunca entra: programar encima de higiene es planificar un conflicto.
  return requiereDetencion ? ['limpia', 'colacion'] : ['limpia', 'colacion', 'marcha']
}

interface Estado {
  /** `personas[dia][slot]` = gente ya comprometida en ese instante. */
  personas: Uint8Array[]
  /** `maquina[dia][maquinaId][slot]` = 1 si ya hay una tarea nuestra ahí. */
  maquina: Map<string, Uint8Array>[]
}

function estadoVacio(): Estado {
  return {
    personas: Array.from({ length: 7 }, () => new Uint8Array(SLOTS_POR_DIA)),
    maquina: Array.from({ length: 7 }, () => new Map<string, Uint8Array>()),
  }
}

function ocupacionMaquina(estado: Estado, dia: number, maquinaId: string): Uint8Array {
  const porDia = estado.maquina[dia]!
  let arr = porDia.get(maquinaId)
  if (!arr) {
    arr = new Uint8Array(SLOTS_POR_DIA)
    porDia.set(maquinaId, arr)
  }
  return arr
}

/**
 * Orden de encaje: lo más difícil primero. Una tarea larga, que exige la máquina
 * detenida y varias personas, es la que menos huecos tiene donde caber; si se
 * deja para el final, las cortas ya le fragmentaron todas las ventanas.
 */
function dificultad(t: TareaMantencion): number {
  return (t.requiereDetencion ? 100000 : 0) + t.minutos * t.personas
}

export function programarSemana(
  maquinas: MaquinaRueda[],
  tareas: TareaMantencion[],
  config: ConfigCarga,
  anclajes: Anclaje[] = [],
): Programacion {
  const estado = estadoVacio()
  const asignaciones: Asignacion[] = []
  const noAsignadas: NoAsignada[] = []

  const porId = new Map(maquinas.map((m) => [m.id, m]))
  const activas = [...tareas.filter((t) => t.activa)].sort((a, b) => dificultad(b) - dificultad(a))

  const condicionEn = (maquina: MaquinaRueda, dia: number, slot: number): Condicion => {
    const d = maquina.semana[dia]
    return condicionDe(d?.areas[slot] ?? '0')
  }

  /** ¿Cabe la tarea en [inicio, inicio+largo) de ese día y esa máquina? */
  const cabeAqui = (
    t: TareaMantencion,
    dia: number,
    inicio: number,
    largo: number,
    maquina: MaquinaRueda | null,
  ): Condicion | null => {
    if (inicio + largo > SLOTS_POR_DIA) return null
    const validas = condicionesValidas(t.requiereDetencion)
    const personasDia = estado.personas[dia]!
    const ocupada = maquina ? ocupacionMaquina(estado, dia, maquina.id) : null

    // La condición de la ventana es la PEOR de sus tramos: si en el medio
    // arranca la línea, la tarea entera pasa a ser «en marcha».
    let peor: Condicion = 'limpia'
    for (let k = 0; k < largo; k++) {
      const slot = inicio + k
      if ((personasDia[slot] ?? 0) + t.personas > config.dotacion) return null
      if (ocupada && ocupada[slot]) return null
      if (maquina) {
        const c = condicionEn(maquina, dia, slot)
        if (!validas.includes(c)) return null
        if (c === 'marcha') peor = 'marcha'
        else if (c === 'colacion' && peor !== 'marcha') peor = 'colacion'
      } else if (t.requiereDetencion) {
        // Transversal que exige detención: basta con que ALGUNA máquina esté
        // parada en ese tramo — es trabajo de taller sobre un equipo cualquiera.
        const hayParada = maquinas.some((m) => {
          const c = condicionEn(m, dia, slot)
          return c === 'limpia' || c === 'colacion'
        })
        if (!hayParada) return null
      }
    }
    return peor
  }

  const marcar = (t: TareaMantencion, dia: number, inicio: number, largo: number, maquinaId: string | null) => {
    const personasDia = estado.personas[dia]!
    const ocupada = maquinaId ? ocupacionMaquina(estado, dia, maquinaId) : null
    for (let k = 0; k < largo; k++) {
      const slot = inicio + k
      personasDia[slot] = (personasDia[slot] ?? 0) + t.personas
      if (ocupada) ocupada[slot] = 1
    }
  }

  const largoDe = (t: TareaMantencion) => Math.max(1, Math.ceil(t.minutos / MINUTOS_POR_SLOT))
  const maquinaDe = (t: TareaMantencion) => (t.maquinaId ? porId.get(t.maquinaId) ?? null : null)

  /*
   * Los movimientos a mano se colocan PRIMERO y en bloque: si se resolvieran
   * junto con el resto, una tarea automática podría ocupar el hueco que una
   * persona ya había elegido, y el plan cambiaría solo bajo los pies de quien
   * lo acomodó.
   */
  const ancladasOk = new Set<string>()
  const clave = (tareaId: string, ocurrencia: number) => `${tareaId}#${ocurrencia}`

  for (const a of anclajes) {
    const t = activas.find((x) => x.id === a.tareaId)
    if (!t || a.ocurrencia < 1 || a.ocurrencia > t.vecesPorSemana) continue
    const maquina = maquinaDe(t)
    if (t.maquinaId && !maquina) continue
    const largo = largoDe(t)
    const cond = cabeAqui(t, a.dia, a.inicio, largo, maquina)
    if (!cond) continue // se resolverá automáticamente y se avisará
    marcar(t, a.dia, a.inicio, largo, t.maquinaId)
    asignaciones.push({
      tareaId: t.id,
      nombre: t.nombre,
      ocurrencia: a.ocurrencia,
      dia: a.dia,
      inicio: a.inicio,
      largo,
      maquinaId: t.maquinaId,
      personas: t.personas,
      condicion: cond,
      anclada: true,
    })
    ancladasOk.add(clave(t.id, a.ocurrencia))
  }

  for (const t of activas) {
    const largo = largoDe(t)
    const maquina = maquinaDe(t)

    if (t.maquinaId && !maquina) {
      for (let k = 0; k < t.vecesPorSemana; k++) {
        noAsignadas.push({ tareaId: t.id, nombre: t.nombre, ocurrencia: k + 1, motivo: 'sin-maquina' })
      }
      continue
    }

    for (let k = 0; k < t.vecesPorSemana; k++) {
      if (ancladasOk.has(clave(t.id, k + 1))) continue // ya la puso una persona
      // Repartir por la semana en vez de apilar todo el lunes: la ocurrencia k
      // empieza a buscar en el día que le tocaría si estuvieran repartidas, y
      // desde ahí recorre en círculo.
      const diaPreferido = Math.floor((k * 7) / Math.max(t.vecesPorSemana, 1))
      let ubicada = false
      let huboHuecoSinGente = false

      for (let d = 0; d < 7 && !ubicada; d++) {
        const dia = (diaPreferido + d) % 7
        for (let inicio = 0; inicio + largo <= SLOTS_POR_DIA; inicio++) {
          const cond = cabeAqui(t, dia, inicio, largo, maquina)
          if (cond) {
            marcar(t, dia, inicio, largo, t.maquinaId)
            asignaciones.push({
              tareaId: t.id,
              nombre: t.nombre,
              ocurrencia: k + 1,
              dia,
              inicio,
              largo,
              maquinaId: t.maquinaId,
              personas: t.personas,
              condicion: cond,
            })
            ubicada = true
            break
          }
          // Distinguir «no hay ventana» de «hay ventana pero no hay gente»:
          // llevan a decisiones distintas (negociar horario vs sumar dotación).
          if (!huboHuecoSinGente && maquina) {
            const validas = condicionesValidas(t.requiereDetencion)
            let ventanaOk = true
            for (let j = 0; j < largo; j++) {
              if (!validas.includes(condicionEn(maquina, dia, inicio + j))) {
                ventanaOk = false
                break
              }
            }
            if (ventanaOk) huboHuecoSinGente = true
          }
        }
      }

      if (!ubicada) {
        noAsignadas.push({
          tareaId: t.id,
          nombre: t.nombre,
          ocurrencia: k + 1,
          motivo: huboHuecoSinGente ? 'sin-gente' : 'sin-hueco',
        })
      }
    }
  }

  const porTarea = tareas
    .filter((t) => t.activa)
    .map((t) => ({
      tarea: t,
      ubicadas: asignaciones.filter((a) => a.tareaId === t.id).length,
      pedidas: t.vecesPorSemana,
    }))

  return {
    asignaciones: asignaciones.sort((a, b) => a.dia - b.dia || a.inicio - b.inicio),
    noAsignadas,
    porTarea,
    minutosUbicados: asignaciones.reduce((a, x) => a + x.largo * MINUTOS_POR_SLOT * x.personas, 0),
  }
}

export interface Veredicto {
  cabe: boolean
  ubicadas: number
  pedidas: number
  /** Motivo dominante de lo que no entró, para saber con quién hay que hablar. */
  motivoPrincipal: MotivoNoCabe | null
}

/**
 * El veredicto sale del ENCAJE, no de la suma de horas.
 *
 * Comparar totales decía «cabe» con 13,7 h de trabajo contra 107 h disponibles,
 * mientras la programación solo lograba ubicar 5 de 10 ejecuciones: las horas
 * existían, pero repartidas en huecos donde la tarea no entra, o con una sola
 * persona para dos cosas a la vez. Un plan que promete lo que no puede ubicar es
 * peor que no tener plan, así que manda lo que de verdad se pudo programar.
 */
export function veredictoDe(prog: Programacion): Veredicto {
  const pedidas = prog.porTarea.reduce((a, t) => a + t.pedidas, 0)
  const ubicadas = prog.porTarea.reduce((a, t) => a + t.ubicadas, 0)

  const cuenta = new Map<MotivoNoCabe, number>()
  for (const n of prog.noAsignadas) cuenta.set(n.motivo, (cuenta.get(n.motivo) ?? 0) + 1)
  const motivoPrincipal =
    [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return { cabe: pedidas > 0 && ubicadas === pedidas, ubicadas, pedidas, motivoPrincipal }
}

/**
 * Deja la ejecución en la hora pedida, reemplazando el anclaje anterior si lo
 * había. No valida: la validación es intentar programar con el anclaje puesto y
 * mirar si quedó donde se pidió — así la comprobación usa exactamente el mismo
 * motor que después dibuja el plan, y no puede divergir de él.
 */
export function conAnclaje(anclajes: Anclaje[], nuevo: Anclaje): Anclaje[] {
  const resto = anclajes.filter(
    (a) => !(a.tareaId === nuevo.tareaId && a.ocurrencia === nuevo.ocurrencia),
  )
  return [...resto, nuevo]
}

export function sinAnclaje(anclajes: Anclaje[], tareaId: string, ocurrencia: number): Anclaje[] {
  return anclajes.filter((a) => !(a.tareaId === tareaId && a.ocurrencia === ocurrencia))
}

export interface ResultadoMovimiento {
  ok: boolean
  anclajes: Anclaje[]
  programacion: Programacion
  /** Por qué no se pudo, cuando `ok` es falso. */
  motivo: MotivoNoCabe | null
}

/** Intenta mover una ejecución. Si no cabe ahí, devuelve el plan intacto. */
export function moverOcurrencia(
  maquinas: MaquinaRueda[],
  tareas: TareaMantencion[],
  config: ConfigCarga,
  anclajes: Anclaje[],
  destino: Anclaje,
): ResultadoMovimiento {
  const propuesta = conAnclaje(anclajes, destino)
  const programacion = programarSemana(maquinas, tareas, config, propuesta)
  const quedo = programacion.asignaciones.find(
    (a) =>
      a.tareaId === destino.tareaId &&
      a.ocurrencia === destino.ocurrencia &&
      a.dia === destino.dia &&
      a.inicio === destino.inicio,
  )
  if (quedo) return { ok: true, anclajes: propuesta, programacion, motivo: null }

  const fallo = programacion.noAsignadas.find(
    (n) => n.tareaId === destino.tareaId && n.ocurrencia === destino.ocurrencia,
  )
  return {
    ok: false,
    anclajes,
    programacion: programarSemana(maquinas, tareas, config, anclajes),
    motivo: fallo?.motivo ?? 'sin-hueco',
  }
}

/** Asignaciones de un día, para dibujar la fila de ese día. */
export function asignacionesDe(prog: Programacion, dia: number): Asignacion[] {
  return prog.asignaciones.filter((a) => a.dia === dia)
}
