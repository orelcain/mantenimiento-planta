import { describe, it, expect } from 'vitest'
import { programarSemana, asignacionesDe, veredictoDe } from '../ruedaProgramacion'
import { balance, tareasIniciales } from '../ruedaCarga'
import { estadoInicial } from '../ruedaVentanas'
import type { ConfigCarga, TareaMantencion } from '../ruedaCarga'
import {
  SLOTS_POR_DIA,
  diaVacio,
  pintarRango,
  slotAHora,
  slotDeHora,
  type MaquinaRueda,
} from '../ruedaVentanas'

function maquina(id: string, rangos: Array<[number, number, string]> = []): MaquinaRueda {
  let areas = '0'.repeat(SLOTS_POR_DIA)
  for (const [h1, h2, v] of rangos) areas = pintarRango(areas, slotDeHora(h1), slotDeHora(h2), v)
  return {
    id,
    nombre: id,
    semana: Array.from({ length: 7 }, () => ({ areas, mant: diaVacio().mant })),
  }
}

function tarea(over: Partial<TareaMantencion> = {}): TareaMantencion {
  return {
    id: 't', nombre: 'Tarea', maquinaId: null, tipo: 'rutina',
    minutos: 60, personas: 1, vecesPorSemana: 1, requiereDetencion: true, activa: true,
    ...over,
  }
}

const cfg = (dotacion = 2): ConfigCarga => ({ dotacion, reservaCorrectivasPct: 0 })

describe('programarSemana · ubicación', () => {
  it('ubica una tarea en una máquina libre y dice en qué condición queda', () => {
    const p = programarSemana([maquina('a')], [tarea({ maquinaId: 'a' })], cfg())
    expect(p.asignaciones).toHaveLength(1)
    expect(p.asignaciones[0]!.condicion).toBe('limpia')
    expect(p.noAsignadas).toHaveLength(0)
  })

  it('respeta la duración: 45 min ocupan 9 tramos de 5', () => {
    const p = programarSemana([maquina('a')], [tarea({ maquinaId: 'a', minutos: 45 })], cfg())
    expect(p.asignaciones[0]!.largo).toBe(9)
  })

  it('una tarea que exige detención NO se programa con la máquina corriendo', () => {
    const m = [maquina('a', [[0, 24, 'P']])] // corriendo todo el día, toda la semana
    const p = programarSemana(m, [tarea({ maquinaId: 'a', requiereDetencion: true })], cfg())
    expect(p.asignaciones).toHaveLength(0)
    expect(p.noAsignadas[0]!.motivo).toBe('sin-hueco')
  })

  it('una tarea que no exige detención sí cabe con la máquina corriendo', () => {
    const m = [maquina('a', [[0, 24, 'P']])]
    const p = programarSemana(m, [tarea({ maquinaId: 'a', requiereDetencion: false })], cfg())
    expect(p.asignaciones).toHaveLength(1)
    expect(p.asignaciones[0]!.condicion).toBe('marcha')
  })

  it('NUNCA programa encima de higiene, ni aunque la tarea admita trabajar en marcha', () => {
    const m = [maquina('a', [[0, 24, 'H']])]
    const p = programarSemana(m, [tarea({ maquinaId: 'a', requiereDetencion: false })], cfg())
    expect(p.asignaciones).toHaveLength(0)
  })

  it('no cabe en un hueco más corto que la tarea', () => {
    // Solo 30 min libres al día; la tarea pide 60.
    const m = [maquina('a', [[0, 24, 'P']])]
    for (const d of m[0]!.semana) {
      d.areas = pintarRango(d.areas, slotDeHora(10), slotDeHora(10, 30), '0')
    }
    const p = programarSemana(m, [tarea({ maquinaId: 'a', minutos: 60 })], cfg())
    expect(p.asignaciones).toHaveLength(0)
    expect(p.noAsignadas[0]!.motivo).toBe('sin-hueco')
  })

  it('el hueco justo sí sirve', () => {
    const m = [maquina('a', [[0, 24, 'P']])]
    for (const d of m[0]!.semana) {
      d.areas = pintarRango(d.areas, slotDeHora(10), slotDeHora(11), '0')
    }
    const p = programarSemana(m, [tarea({ maquinaId: 'a', minutos: 60 })], cfg())
    expect(p.asignaciones).toHaveLength(1)
    expect(slotAHora(p.asignaciones[0]!.inicio)).toBe('10:00')
  })
})

describe('programarSemana · restricciones que no se pueden violar', () => {
  it('dos tareas no se pisan en la misma máquina', () => {
    const m = [maquina('a', [[0, 24, 'P']])]
    for (const d of m[0]!.semana) d.areas = pintarRango(d.areas, slotDeHora(10), slotDeHora(12), '0')
    const p = programarSemana(
      m,
      [
        tarea({ id: 't1', nombre: 'A', maquinaId: 'a', minutos: 60 }),
        tarea({ id: 't2', nombre: 'B', maquinaId: 'a', minutos: 60 }),
      ],
      cfg(4),
    )
    expect(p.asignaciones).toHaveLength(2)
    const [x, y] = [...p.asignaciones].sort((a, b) => a.inicio - b.inicio)
    expect(x!.inicio + x!.largo).toBeLessThanOrEqual(y!.inicio)
  })

  it('no compromete más gente que la dotación en el mismo instante', () => {
    const m = [maquina('a'), maquina('b')]
    const p = programarSemana(
      m,
      [
        tarea({ id: 't1', nombre: 'A', maquinaId: 'a', personas: 2, minutos: 120 }),
        tarea({ id: 't2', nombre: 'B', maquinaId: 'b', personas: 2, minutos: 120 }),
      ],
      cfg(2), // solo 2 personas: no pueden ir a la vez
    )
    expect(p.asignaciones).toHaveLength(2)
    // Comprobación directa sobre el resultado: en ningún tramo se pasa de 2.
    for (let dia = 0; dia < 7; dia++) {
      const uso = new Array(SLOTS_POR_DIA).fill(0)
      for (const a of asignacionesDe(p, dia)) {
        for (let k = 0; k < a.largo; k++) uso[a.inicio + k] += a.personas
      }
      expect(Math.max(...uso)).toBeLessThanOrEqual(2)
    }
  })

  it('distingue «no hay ventana» de «hay ventana pero no hay gente»', () => {
    // Máquina libre todo el día, pero la dotación ya se la lleva otra tarea.
    const m = [maquina('a'), maquina('b')]
    const p = programarSemana(
      m,
      [
        tarea({ id: 'grande', nombre: 'Grande', maquinaId: 'a', personas: 2, minutos: 60 * 24, vecesPorSemana: 7 }),
        tarea({ id: 'chica', nombre: 'Chica', maquinaId: 'b', personas: 2, minutos: 60, vecesPorSemana: 1 }),
      ],
      cfg(2),
    )
    const fallo = p.noAsignadas.find((n) => n.tareaId === 'chica')
    expect(fallo?.motivo).toBe('sin-gente')
  })
})

describe('programarSemana · reparto en la semana', () => {
  it('no apila todas las ejecuciones el mismo día', () => {
    const p = programarSemana([maquina('a')], [tarea({ maquinaId: 'a', vecesPorSemana: 3 })], cfg())
    const dias = new Set(p.asignaciones.map((a) => a.dia))
    expect(p.asignaciones).toHaveLength(3)
    expect(dias.size).toBe(3)
  })

  it('numera las ejecuciones para poder decir «2 de 3»', () => {
    const p = programarSemana([maquina('a')], [tarea({ maquinaId: 'a', vecesPorSemana: 3 })], cfg())
    expect(p.asignaciones.map((a) => a.ocurrencia).sort()).toEqual([1, 2, 3])
  })

  it('ubica lo que puede y reporta el resto, en vez de fallar entero', () => {
    // Cabe una sola vez al día en 1 hora libre; se piden 10 a la semana.
    const m = [maquina('a', [[0, 24, 'P']])]
    for (const d of m[0]!.semana) d.areas = pintarRango(d.areas, slotDeHora(10), slotDeHora(11), '0')
    const p = programarSemana(m, [tarea({ maquinaId: 'a', minutos: 60, vecesPorSemana: 10 })], cfg())
    expect(p.asignaciones).toHaveLength(7) // una por día
    expect(p.noAsignadas).toHaveLength(3)
    expect(p.porTarea[0]).toMatchObject({ ubicadas: 7, pedidas: 10 })
  })
})

describe('programarSemana · casos borde', () => {
  it('una tarea apagada no se programa', () => {
    const p = programarSemana([maquina('a')], [tarea({ maquinaId: 'a', activa: false })], cfg())
    expect(p.asignaciones).toHaveLength(0)
    expect(p.noAsignadas).toHaveLength(0)
  })

  it('una tarea que apunta a una máquina inexistente se reporta, no se traga', () => {
    const p = programarSemana([maquina('a')], [tarea({ maquinaId: 'fantasma' })], cfg())
    expect(p.noAsignadas[0]!.motivo).toBe('sin-maquina')
  })

  it('las transversales no bloquean ninguna máquina', () => {
    const m = [maquina('a')]
    const p = programarSemana(
      m,
      [
        tarea({ id: 'tv', nombre: 'Transversal', maquinaId: null, minutos: 60 }),
        tarea({ id: 'maq', nombre: 'De máquina', maquinaId: 'a', minutos: 60 }),
      ],
      cfg(4),
    )
    expect(p.asignaciones).toHaveLength(2)
  })

  it('una transversal que exige detención no cabe si TODAS las máquinas corren', () => {
    const m = [maquina('a', [[0, 24, 'P']]), maquina('b', [[0, 24, 'P']])]
    const p = programarSemana(m, [tarea({ maquinaId: null, requiereDetencion: true })], cfg())
    expect(p.asignaciones).toHaveLength(0)
  })

  it('sin máquinas no revienta', () => {
    const p = programarSemana([], [tarea({ maquinaId: null, requiereDetencion: false })], cfg())
    expect(p.asignaciones.length + p.noAsignadas.length).toBe(1)
  })

  it('las horas-hombre ubicadas cuadran con lo asignado', () => {
    const p = programarSemana(
      [maquina('a')],
      [tarea({ maquinaId: 'a', minutos: 60, personas: 2, vecesPorSemana: 2 })],
      cfg(2),
    )
    expect(p.asignaciones).toHaveLength(2)
    expect(p.minutosUbicados).toBe(2 * 60 * 2) // 2 ejecuciones × 60 min × 2 personas
  })

  it('lo más difícil se ubica primero: la larga con detención gana el hueco', () => {
    // Un único hueco de 2 h en la semana, dos tareas que lo quieren.
    const m = [maquina('a', [[0, 24, 'P']])]
    m[0]!.semana[0]!.areas = pintarRango(m[0]!.semana[0]!.areas, slotDeHora(10), slotDeHora(12), '0')
    const p = programarSemana(
      m,
      [
        tarea({ id: 'corta', nombre: 'Corta', maquinaId: 'a', minutos: 30, requiereDetencion: true }),
        tarea({ id: 'larga', nombre: 'Larga', maquinaId: 'a', minutos: 120, requiereDetencion: true }),
      ],
      cfg(4),
    )
    expect(p.asignaciones.map((a) => a.tareaId)).toContain('larga')
    expect(p.noAsignadas.map((n) => n.tareaId)).toContain('corta')
  })
})

describe('veredictoDe · el plan no puede prometer lo que no ubica', () => {
  it('con horas de sobra pero sin huecos donde entren, NO dice que cabe', () => {
    // Este es el caso real que apareció con el plan semilla y dotación 1: la
    // suma de horas alcanzaba de lejos (13,7 h contra 107 h) y aun así la mitad
    // de las ejecuciones se quedaba sin hora.
    const s = estadoInicial()
    const cfg = { dotacion: 1, reservaCorrectivasPct: 30 }
    const b = balance(s.maquinas, tareasIniciales(), cfg)
    const v = veredictoDe(programarSemana(s.maquinas, tareasIniciales(), cfg))

    expect(b.alcanza).toBe(true)      // los totales dicen que sí
    expect(v.cabe).toBe(false)        // el encaje dice que no
    expect(v.ubicadas).toBeLessThan(v.pedidas)
  })

  it('con dotación suficiente, el plan semilla entra completo', () => {
    const s = estadoInicial()
    const v = veredictoDe(
      programarSemana(s.maquinas, tareasIniciales(), { dotacion: 2, reservaCorrectivasPct: 30 }),
    )
    expect(v.cabe).toBe(true)
    expect(v.ubicadas).toBe(v.pedidas)
  })

  it('nombra el motivo dominante de lo que no entró', () => {
    const m = [maquina('a', [[0, 24, 'P']])]
    const v = veredictoDe(
      programarSemana(m, [tarea({ maquinaId: 'a', requiereDetencion: true, vecesPorSemana: 3 })], cfg()),
    )
    expect(v.motivoPrincipal).toBe('sin-hueco')
  })

  it('sin tareas activas no declara victoria', () => {
    const v = veredictoDe(programarSemana([maquina('a')], [], cfg()))
    expect(v.cabe).toBe(false)
    expect(v.pedidas).toBe(0)
  })
})
