import { describe, it, expect } from 'vitest'
import {
  SLOTS_POR_DIA,
  contarDia,
  contarSemana,
  copiarDia,
  maquinaNueva,
  pintarHoras,
  slotDeHora,
  slotAHora,
  sinConfirmar,
  type MaquinaRueda,
} from '../ruedaVentanas'
import {
  balance,
  disponibilidadPorTramo,
  ordenarVentanas,
  ventanasDePlanta,
  type ConfigCarga,
  type TareaMantencion,
} from '../ruedaCarga'
import { moverOcurrencia, programarSemana, veredictoDe } from '../ruedaProgramacion'

/**
 * Recorrido operativo completo, con un horario de planta plausible.
 *
 * Los demás tests prueban piezas; este prueba el CAMINO: cargar horas como se
 * cargan en la vista, y comprobar que el módulo responde las preguntas para las
 * que existe. Dos defectos salieron de aquí y no de los tests unitarios —el plan
 * amontonaba 5 de 9 ejecuciones el lunes, y al arrastrar sobre higiene el
 * mensaje decía «no hay hueco»— porque ninguno era un error de cálculo: eran
 * respuestas correctas e inservibles.
 *
 * Los horarios son inventados pero verosímiles; lo que se fija acá es el
 * comportamiento del módulo, no el horario de la planta.
 */

function dia(rangos: Array<[number, number, string]>) {
  let areas = '0'.repeat(SLOTS_POR_DIA)
  for (const [h1, h2, v] of rangos) areas = pintarHoras(areas, slotDeHora(h1), slotDeHora(h2), v)
  return { areas, mant: '0'.repeat(SLOTS_POR_DIA) }
}

/** Carga una máquina como lo haría alguien en «Cargar rápido»: un día y copiar. */
function cargar(
  id: string,
  nombre: string,
  laboral: Array<[number, number, string]>,
  sabado: Array<[number, number, string]>,
): MaquinaRueda {
  let m = maquinaNueva(id, nombre)
  m = { ...m, semana: m.semana.map(() => dia([])) }
  m.semana[0] = dia(laboral)
  m = copiarDia(m, 0, [1, 2, 3, 4])
  m.semana[5] = dia(sabado)
  return { ...m, revisadoEnTerreno: true }
}

function planta(): MaquinaRueda[] {
  const base = [
    cargar('grader', 'Grader MS4/12',
      [[8, 13, 'P'], [13, 14, 'X'], [14, 19, 'P'], [19, 22, 'H']],
      [[8, 13, 'P'], [13, 16, 'H']]),
    cargar('b142-n1', 'Baader 142 N1',
      [[8, 13, 'P'], [13, 14, 'X'], [14, 19, 'P'], [19, 22, 'H']],
      [[8, 13, 'P'], [13, 16, 'H']]),
    cargar('b142-n2', 'Baader 142 N2',
      [[8, 13, 'P'], [13, 14, 'X'], [14, 21, 'P'], [22, 0, 'P'], [0, 4, 'H']],
      [[8, 13, 'P'], [13, 16, 'H']]),
    cargar('b200', 'Baader 200 Filete',
      [[9, 13, 'P'], [13, 14, 'X'], [14, 18, 'P'], [18, 21, 'H']], []),
  ]
  // Una queda sin confirmar a propósito: es el estado normal mientras se levanta.
  return [...base.slice(0, 3), { ...base[3]!, revisadoEnTerreno: false }]
}

const TAREAS: TareaMantencion[] = [
  { id: 't1', nombre: 'Cambio de cuchillos', maquinaId: 'b200', tipo: 'rutina', minutos: 45, personas: 2, vecesPorSemana: 3, requiereDetencion: true, activa: true },
  { id: 't2', nombre: 'Montaje de cintas', maquinaId: null, tipo: 'rutina', minutos: 60, personas: 2, vecesPorSemana: 2, requiereDetencion: true, activa: true },
  { id: 't3', nombre: 'Engrase', maquinaId: null, tipo: 'rutina', minutos: 90, personas: 1, vecesPorSemana: 2, requiereDetencion: false, activa: true },
  { id: 't4', nombre: 'Inspección rodamientos', maquinaId: 'grader', tipo: 'preventiva', minutos: 40, personas: 1, vecesPorSemana: 1, requiereDetencion: false, activa: true },
  { id: 't5', nombre: 'Cambio correa N2', maquinaId: 'b142-n2', tipo: 'preventiva', minutos: 120, personas: 2, vecesPorSemana: 1, requiereDetencion: true, activa: true },
]

const CFG: ConfigCarga = { dotacion: 2, reservaCorrectivasPct: 30 }

describe('escenario real · cargar el horario', () => {
  it('copiar el lunes a Lun-Vie deja los cinco días iguales', () => {
    const m = planta()[0]!
    for (const d of [1, 2, 3, 4]) expect(m.semana[d]!.areas).toBe(m.semana[0]!.areas)
    expect(m.semana[5]!.areas).not.toBe(m.semana[0]!.areas) // el sábado es propio
  })

  it('el día cuadra: lo pintado suma 24 h', () => {
    const r = contarDia(planta()[0]!.semana[0]!)
    const suma = r.ocupacion.P + r.ocupacion.H + r.ocupacion.X + r.ocupacion.C + r.ocupacion['0']
    expect(suma).toBe(SLOTS_POR_DIA)
    expect(r.ocupacion.P).toBe(10 * 12) // 08-13 y 14-19
    expect(r.ocupacion.X).toBe(1 * 12) // la colación se la lleva higiene
  })

  it('las máquinas sin confirmar se pueden nombrar una a una', () => {
    expect(sinConfirmar(planta()).map((m) => m.nombre)).toEqual(['Baader 200 Filete'])
  })
})

describe('escenario real · quién ocupa cada tramo', () => {
  it('cada tramo reparte TODAS las máquinas entre las cuatro condiciones', () => {
    const disp = disponibilidadPorTramo(planta(), 0)
    for (const t of disp) {
      expect(t.libres + t.marcha + t.agua + t.parada).toBe(4)
    }
  })

  it('a la hora de colación no queda ninguna máquina libre: higiene las toma todas', () => {
    // El hallazgo estructural: el único hueco sin producción se lo lleva higiene.
    const t = disponibilidadPorTramo(planta(), 0)[slotDeHora(13, 30)]!
    expect(t.agua).toBe(4)
    expect(t.libres).toBe(0)
  })

  it('de madrugada la planta está libre', () => {
    const t = disponibilidadPorTramo(planta(), 0)[slotDeHora(6)]!
    expect(t.libres).toBe(4)
  })
})

describe('escenario real · dónde hay tiempo', () => {
  it('la mejor ventana del lunes es la de más horas-máquina, no la más larga', () => {
    const mejor = ordenarVentanas(ventanasDePlanta(planta(), 0))[0]!
    expect(slotAHora(mejor.inicio)).toBe('04:00')
    expect(mejor.maquinaIds).toHaveLength(4)
  })

  it('reporta las horas que higiene se lleva de la línea parada', () => {
    const s = contarSemana(planta()[0]!)
    expect(s.colacionTomada).toBeGreaterThan(0)
    expect(s.higiene).toBeGreaterThanOrEqual(s.colacionTomada)
  })
})

describe('escenario real · ¿alcanza el tiempo?', () => {
  it('con una sola persona el trabajo NO entra, aunque las horas sumen de sobra', () => {
    const cfg = { dotacion: 1, reservaCorrectivasPct: 30 }
    const b = balance(planta(), TAREAS, cfg)
    const v = veredictoDe(programarSemana(planta(), TAREAS, cfg))
    expect(b.alcanza).toBe(true) // los totales alcanzan…
    expect(v.cabe).toBe(false) // …y aun así no hay dónde ponerlo
    expect(v.motivoPrincipal).toBe('sin-gente')
  })

  it('con dos personas entra completo', () => {
    const v = veredictoDe(programarSemana(planta(), TAREAS, CFG))
    expect(v.cabe).toBe(true)
    expect(v.ubicadas).toBe(9)
  })
})

describe('escenario real · la programación', () => {
  it('reparte el trabajo en la semana en vez de amontonarlo el lunes', () => {
    // Antes de repartir por carga, el lunes se llevaba 5 de 9 ejecuciones y
    // martes, sábado y domingo quedaban vacíos. Un plan así no lo firma nadie.
    const prog = programarSemana(planta(), TAREAS, CFG)
    const porDia = new Array(7).fill(0)
    for (const a of prog.asignaciones) porDia[a.dia]++
    expect(Math.max(...porDia)).toBeLessThanOrEqual(3)
    expect(porDia.filter((n) => n > 0).length).toBeGreaterThanOrEqual(5)
  })

  it('nada queda programado sobre higiene', () => {
    const p = planta()
    const prog = programarSemana(p, TAREAS, CFG)
    for (const a of prog.asignaciones) {
      expect(a.condicion).not.toBe('agua')
    }
  })

  it('ninguna tarea que exige detención queda con la máquina corriendo', () => {
    const prog = programarSemana(planta(), TAREAS, CFG)
    for (const a of prog.asignaciones) {
      const t = TAREAS.find((x) => x.id === a.tareaId)!
      if (t.requiereDetencion) expect(a.condicion).not.toBe('marcha')
    }
  })
})

describe('escenario real · mover a mano', () => {
  it('mover al domingo, que está libre, funciona', () => {
    const r = moverOcurrencia(planta(), TAREAS, CFG, [], {
      tareaId: 't5', ocurrencia: 1, dia: 6, inicio: slotDeHora(10),
    })
    expect(r.ok).toBe(true)
  })

  it('al soltar sobre higiene dice que es higiene, no «no hay hueco»', () => {
    // «No hay hueco» es cierto e inútil: quien arrastra necesita saber con quién
    // choca, porque de eso depende si mueve la tarea o habla con higiene.
    const r = moverOcurrencia(planta(), TAREAS, CFG, [], {
      tareaId: 't4', ocurrencia: 1, dia: 0, inicio: slotDeHora(20),
    })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('higiene-encima')
  })

  it('al soltar sobre la línea corriendo dice que la máquina está produciendo', () => {
    const r = moverOcurrencia(planta(), TAREAS, CFG, [], {
      tareaId: 't5', ocurrencia: 1, dia: 0, inicio: slotDeHora(10),
    })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('maquina-corriendo')
  })
})
