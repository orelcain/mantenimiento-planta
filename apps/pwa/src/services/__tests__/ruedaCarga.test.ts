import { describe, it, expect } from 'vitest'
import {
  CONFIG_CARGA_POR_DEFECTO,
  balance,
  capacidadSemanal,
  cargaSemanalMinutos,
  disponibilidadPorTramo,
  minutosAHorasTexto,
  tareasIniciales,
  ordenarVentanas,
  ventanasDePlanta,
  type TareaMantencion,
} from '../ruedaCarga'
import {
  SLOTS_POR_DIA,
  diaVacio,
  pintarRango,
  slotAHora,
  slotDeHora,
  type MaquinaRueda,
} from '../ruedaVentanas'

const HORA = 12 // tramos de 5 min

/** Máquina con los 7 días iguales, descritos por rangos horarios. */
function maquina(id: string, rangos: Array<[number, number, string]>): MaquinaRueda {
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
    id: 't', nombre: 'T', maquinaId: null, tipo: 'rutina',
    minutos: 60, personas: 1, vecesPorSemana: 1, requiereDetencion: true, activa: true,
    ...over,
  }
}

describe('disponibilidadPorTramo', () => {
  it('clasifica cada máquina en su condición, tramo a tramo', () => {
    const m = [
      maquina('a', [[8, 20, 'P']]),
      maquina('b', [[8, 20, 'H']]),
      maquina('c', [[8, 20, 'C']]),
      maquina('d', []),
    ]
    const disp = disponibilidadPorTramo(m, 0)
    const alMediodia = disp[slotDeHora(12)]!
    expect(alMediodia).toEqual({ libres: 1, parada: 1, agua: 1, marcha: 1 })
    const a_las3 = disp[slotDeHora(3)]!
    expect(a_las3.libres).toBe(4) // de madrugada nadie ocupa nada
  })

  it('el total por tramo siempre es el número de máquinas', () => {
    const m = [maquina('a', [[8, 20, 'P']]), maquina('b', [[0, 24, 'H']])]
    for (const t of disponibilidadPorTramo(m, 0)) {
      expect(t.libres + t.parada + t.agua + t.marcha).toBe(2)
    }
  })
})

describe('ventanasDePlanta', () => {
  it('corta la ventana cuando cambia QUÉ máquinas están libres, no solo cuántas', () => {
    const m = [maquina('a', [[8, 12, 'P']]), maquina('b', [[10, 14, 'P']])]
    const v = ventanasDePlanta(m, 0)
    // 08–10 solo b libre · 10–12 ninguna... en realidad 10-12 ambas ocupadas
    const inicios = v.map((x) => slotAHora(x.inicio))
    expect(inicios).toContain('08:00') // arranca la ventana de «solo b»
    const ventana8 = v.find((x) => x.inicio === slotDeHora(8))!
    expect(ventana8.maquinaIds).toEqual(['b'])
    expect(ventana8.largo).toBe(2 * HORA)
  })

  it('no reporta ventanas donde no hay ninguna máquina libre', () => {
    const m = [maquina('a', [[0, 24, 'P']]), maquina('b', [[0, 24, 'H']])]
    expect(ventanasDePlanta(m, 0)).toHaveLength(0)
  })

  it('ignora los bloques más cortos que el mínimo, que son ruido de pintado', () => {
    const m = [maquina('a', [[0, 24, 'P']])]
    // 10 minutos libres (2 tramos) en medio del proceso
    m[0]!.semana[0]!.areas = pintarRango(m[0]!.semana[0]!.areas, slotDeHora(12), slotDeHora(12, 10), '0')
    expect(ventanasDePlanta(m, 0, 3)).toHaveLength(0)
    expect(ventanasDePlanta(m, 0, 2)).toHaveLength(1)
  })

  it('con todo libre, la ventana es el día entero', () => {
    const v = ventanasDePlanta([maquina('a', [])], 0)
    expect(v).toHaveLength(1)
    expect(v[0]!.largo).toBe(SLOTS_POR_DIA)
  })
})

describe('ordenarVentanas', () => {
  it('ante misma duración, gana la que tiene más máquinas libres', () => {
    const v = ordenarVentanas([
      { inicio: 0, largo: 48, maquinaIds: ['a', 'b', 'c'] },
      { inicio: 48, largo: 48, maquinaIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
    ])
    expect(v[0]!.maquinaIds).toHaveLength(6)
    expect(slotAHora(v[0]!.inicio)).toBe('04:00')
  })

  it('una ventana larga con una máquina puede valer más que una corta con varias', () => {
    const v = ordenarVentanas([
      { inicio: 0, largo: 12, maquinaIds: ['a', 'b'] },   // 24 horas-máquina
      { inicio: 24, largo: 60, maquinaIds: ['c'] },       // 60 horas-máquina
    ])
    expect(v[0]!.maquinaIds).toEqual(['c'])
  })

  it('no muta el arreglo de entrada', () => {
    const orig = [
      { inicio: 0, largo: 12, maquinaIds: ['a'] },
      { inicio: 24, largo: 60, maquinaIds: ['b'] },
    ]
    ordenarVentanas(orig)
    expect(orig[0]!.inicio).toBe(0)
  })
})

describe('capacidadSemanal', () => {
  it('no cuenta más gente que máquinas disponibles', () => {
    // 1 máquina siempre libre, 4 personas: la capacidad es 1 persona × 168 h,
    // no 4 — una persona no puede estar en dos máquinas a la vez.
    const cap = capacidadSemanal([maquina('a', [])], { dotacion: 4, reservaCorrectivasPct: 0 })
    expect(cap.conDetencionMin).toBe(7 * 24 * 60)
  })

  it('no cuenta más máquinas que gente', () => {
    const m = [maquina('a', []), maquina('b', []), maquina('c', [])]
    const cap = capacidadSemanal(m, { dotacion: 1, reservaCorrectivasPct: 0 })
    expect(cap.conDetencionMin).toBe(7 * 24 * 60) // una sola persona
  })

  it('el trabajo en marcha suma al total pero no a la capacidad con detención', () => {
    const m = [maquina('a', [[0, 24, 'P']])]
    const cap = capacidadSemanal(m, { dotacion: 1, reservaCorrectivasPct: 0 })
    expect(cap.conDetencionMin).toBe(0)
    expect(cap.totalMin).toBe(7 * 24 * 60)
  })

  it('las horas de higiene se reportan aparte y NO entran en la capacidad', () => {
    const m = [maquina('a', [[0, 24, 'H']])]
    const cap = capacidadSemanal(m, { dotacion: 1, reservaCorrectivasPct: 0 })
    expect(cap.totalMin).toBe(0)
    expect(cap.conDetencionMin).toBe(0)
    expect(cap.pisandoHigieneMin).toBe(7 * 24 * 60)
  })

  it('la colación cuenta como máquina detenida', () => {
    const m = [maquina('a', [[0, 24, 'C']])]
    const cap = capacidadSemanal(m, { dotacion: 1, reservaCorrectivasPct: 0 })
    expect(cap.conDetencionMin).toBe(7 * 24 * 60)
  })
})

describe('cargaSemanalMinutos', () => {
  it('multiplica duración por personas y por veces a la semana', () => {
    expect(cargaSemanalMinutos(tarea({ minutos: 45, personas: 2, vecesPorSemana: 3 }))).toBe(270)
  })
})

describe('balance', () => {
  const libre = [maquina('a', [])] // 168 h libres

  it('aparta la reserva de correctivas antes de decir que alcanza', () => {
    const b = balance(libre, [], { dotacion: 1, reservaCorrectivasPct: 30 })
    expect(b.reservaMin).toBeCloseTo(7 * 24 * 60 * 0.3, 5)
    expect(b.disponibleTotalMin).toBeCloseTo(7 * 24 * 60 * 0.7, 5)
  })

  it('no alcanza si la carga supera lo disponible', () => {
    const t = tarea({ minutos: 60, personas: 1, vecesPorSemana: 200 }) // 200 h-hombre
    const b = balance(libre, [t], { dotacion: 1, reservaCorrectivasPct: 0 })
    expect(b.alcanza).toBe(false)
    expect(b.holguraTotalMin).toBeLessThan(0)
  })

  it('NO dice que alcanza si sobra tiempo total pero falta con la máquina detenida', () => {
    // Todo el tiempo es con la línea corriendo: hay capacidad total, cero detenida.
    const enMarcha = [maquina('a', [[0, 24, 'P']])]
    const t = tarea({ minutos: 60, personas: 1, vecesPorSemana: 1, requiereDetencion: true })
    const b = balance(enMarcha, [t], { dotacion: 1, reservaCorrectivasPct: 0 })
    expect(b.holguraTotalMin).toBeGreaterThan(0)
    expect(b.holguraConDetencionMin).toBeLessThan(0)
    expect(b.alcanza).toBe(false)
  })

  it('las tareas desactivadas no pesan', () => {
    const t = tarea({ minutos: 600, personas: 4, vecesPorSemana: 7, activa: false })
    const b = balance(libre, [t], CONFIG_CARGA_POR_DEFECTO)
    expect(b.cargaTotalMin).toBe(0)
  })

  it('más dotación levanta la capacidad cuando hay máquinas donde ponerla', () => {
    const m = [maquina('a', []), maquina('b', [])]
    const uno = balance(m, [], { dotacion: 1, reservaCorrectivasPct: 0 })
    const dos = balance(m, [], { dotacion: 2, reservaCorrectivasPct: 0 })
    expect(dos.capacidad.totalMin).toBe(uno.capacidad.totalMin * 2)
  })

  it('la reserva se topa al 90% para no dejar la capacidad en cero', () => {
    const b = balance(libre, [], { dotacion: 1, reservaCorrectivasPct: 300 })
    expect(b.disponibleTotalMin).toBeCloseTo(7 * 24 * 60 * 0.1, 5)
  })

  it('el plan semilla se puede evaluar sin reventar', () => {
    const b = balance(libre, tareasIniciales(), CONFIG_CARGA_POR_DEFECTO)
    expect(b.cargaTotalMin).toBeGreaterThan(0)
    expect(Number.isFinite(b.ocupacionPct)).toBe(true)
  })

  it('sin capacidad, la ocupación no es NaN ni Infinity', () => {
    const b = balance([], [tarea()], CONFIG_CARGA_POR_DEFECTO)
    expect(b.ocupacionPct).toBe(0)
    expect(b.alcanza).toBe(false)
  })
})

describe('minutosAHorasTexto', () => {
  it('formatea horas y minutos, y marca el déficit con signo', () => {
    expect(minutosAHorasTexto(150)).toBe('2 h 30')
    expect(minutosAHorasTexto(-90)).toBe('−1 h 30')
    expect(minutosAHorasTexto(0)).toBe('0 h 00')
  })
})
