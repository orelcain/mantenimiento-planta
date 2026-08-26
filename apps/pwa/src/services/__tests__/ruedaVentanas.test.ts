import { describe, it, expect } from 'vitest'
import {
  SLOTS_POR_DIA,
  baseDia,
  bloquesIntervencion,
  condicionDe,
  contarDia,
  contarSemana,
  diaVacio,
  estadoInicial,
  maquinaNueva,
  normalizarEstado,
  confirmadas,
  sinConfirmar,
  pintarRango,
  pintarSlot,
  slotAHora,
  slotDeHora,
  slotsAHorasDecimal,
  slotsAHorasMinutos,
  type DiaRueda,
} from '../ruedaVentanas'

/** Arma un día pintando rangos por hora, para que los tests se lean como el turno. */
function armar(areas: Array<[number, number, string]>, mant: Array<[number, number]> = []): DiaRueda {
  let a = '0'.repeat(SLOTS_POR_DIA)
  let m = '0'.repeat(SLOTS_POR_DIA)
  for (const [h1, h2, v] of areas) a = pintarRango(a, slotDeHora(h1), slotDeHora(h2), v)
  for (const [h1, h2] of mant) m = pintarRango(m, slotDeHora(h1), slotDeHora(h2), '1')
  return { areas: a, mant: m }
}

const HORA = 12 // tramos de 5 min por hora

describe('condicionDe', () => {
  it('higiene encima es la única condición de choque', () => {
    expect(condicionDe('H')).toBe('agua')
    expect(condicionDe('C')).toBe('colacion')
    expect(condicionDe('P')).toBe('marcha')
    expect(condicionDe('0')).toBe('limpia')
  })

  it('higiene en colación sigue siendo agua encima: manda higiene', () => {
    expect(condicionDe('X')).toBe('agua')
  })

  it('un ocupante desconocido cae en limpia, no revienta', () => {
    expect(condicionDe('Z')).toBe('limpia')
    expect(condicionDe('')).toBe('limpia')
  })
})

describe('contarDia', () => {
  it('la ocupación siempre suma el día completo', () => {
    const d = armar([[8, 13, 'P'], [13, 14, 'C'], [19, 22, 'H']])
    const r = contarDia(d)
    const suma = r.ocupacion.P + r.ocupacion.H + r.ocupacion.C + r.ocupacion.X + r.ocupacion['0']
    expect(suma).toBe(SLOTS_POR_DIA)
  })

  it('el desglose por condición suma exactamente lo pintado como intervención', () => {
    const d = armar([[8, 13, 'P'], [19, 22, 'H']], [[11, 14], [20, 23]])
    const r = contarDia(d)
    const suma = r.condicion.limpia + r.condicion.colacion + r.condicion.marcha + r.condicion.agua
    expect(suma).toBe(r.intervencion)
    expect(r.intervencion).toBe(6 * HORA)
  })

  it('mide el choque: intervenir 20:00-23:00 con higiene hasta las 22:00 son 2 h con agua', () => {
    const d = armar([[19, 22, 'H']], [[20, 23]])
    const r = contarDia(d)
    expect(r.condicion.agua).toBe(2 * HORA)
    expect(r.condicion.limpia).toBe(1 * HORA)
  })

  it('marcar un tramo como mantención no lo vuelve libre: libres cuenta ocupación, no intención', () => {
    const d = armar([[8, 20, 'P']], [[8, 20]])
    const r = contarDia(d)
    expect(r.libres).toBe(12 * HORA) // las 12 h que nadie ocupa, no las 24
    expect(r.condicion.marcha).toBe(12 * HORA)
  })

  it('un día vacío es 24 h libres y cero intervención', () => {
    const r = contarDia(diaVacio())
    expect(r.libres).toBe(SLOTS_POR_DIA)
    expect(r.intervencion).toBe(0)
  })
})

describe('la ventana en disputa', () => {
  it('intervenir en la colación que higiene ocupa cuenta como agua, no como colación', () => {
    const d = armar([[13, 14, 'X']], [[13, 14]])
    const r = contarDia(d)
    expect(r.condicion.agua).toBe(1 * HORA)
    expect(r.condicion.colacion).toBe(0)
  })

  it('la colación sin higiene sí es aprovechable', () => {
    const d = armar([[13, 14, 'C']], [[13, 14]])
    const r = contarDia(d)
    expect(r.condicion.colacion).toBe(1 * HORA)
    expect(r.condicion.agua).toBe(0)
  })

  it('la semana suma como higiene tanto el lavado solo como el de la colación', () => {
    const m = maquinaNueva('x', 'X', 'simple')
    const r = contarSemana(m)
    expect(r.higiene).toBeGreaterThan(0)
    expect(r.colacionTomada).toBeGreaterThan(0)
    expect(r.higiene).toBeGreaterThanOrEqual(r.colacionTomada)
  })

  it('un bloque que cae en colación-con-higiene se reporta con agua', () => {
    const d = armar([[13, 14, 'X']], [[12, 15]])
    const bloque = bloquesIntervencion(d)[0]!
    expect(bloque.largo).toBe(3 * HORA)
    expect(bloque.conAgua).toBe(1 * HORA)
  })
})

describe('bloquesIntervencion', () => {
  it('une el bloque que cruza medianoche en una sola ventana', () => {
    const d = armar([], [[23, 24], [0, 2]])
    const bloques = bloquesIntervencion(d)
    expect(bloques).toHaveLength(1)
    expect(bloques[0]!.largo).toBe(3 * HORA)
    expect(slotAHora(bloques[0]!.inicio)).toBe('23:00')
  })

  it('separa bloques que no se tocan', () => {
    const d = armar([], [[2, 4], [10, 11]])
    const bloques = bloquesIntervencion(d)
    expect(bloques).toHaveLength(2)
    expect(bloques.map((b) => b.largo).sort((a, b) => a - b)).toEqual([1 * HORA, 2 * HORA])
  })

  it('reporta cuántos minutos del bloque son con agua encima', () => {
    const d = armar([[19, 22, 'H']], [[20, 23]])
    const bloque = bloquesIntervencion(d)[0]!
    expect(bloque.largo).toBe(3 * HORA)
    expect(bloque.conAgua).toBe(2 * HORA)
  })

  it('el día entero intervenido es un bloque de 24 h', () => {
    const d = armar([], [[0, 24]])
    const bloques = bloquesIntervencion(d)
    expect(bloques).toHaveLength(1)
    expect(bloques[0]!.largo).toBe(SLOTS_POR_DIA)
  })

  it('sin intervención no hay bloques', () => {
    expect(bloquesIntervencion(diaVacio())).toHaveLength(0)
  })
})

describe('pintarRango', () => {
  it('envuelve por medianoche cuando el fin es menor que el inicio', () => {
    const capa = pintarRango('0'.repeat(SLOTS_POR_DIA), slotDeHora(23), slotDeHora(1), 'H')
    expect(capa[slotDeHora(23)]).toBe('H')
    expect(capa[slotDeHora(0)]).toBe('H')
    expect(capa[slotDeHora(1)]).toBe('0')
    expect(capa.split('').filter((c) => c === 'H')).toHaveLength(2 * HORA)
  })

  it('el rango es semiabierto: no pinta el tramo final', () => {
    const capa = pintarRango('0'.repeat(SLOTS_POR_DIA), slotDeHora(8), slotDeHora(9), 'P')
    expect(capa[slotDeHora(9)]).toBe('0')
  })
})

describe('pintarSlot', () => {
  it('cambia un solo tramo y conserva el largo', () => {
    const capa = pintarSlot('0'.repeat(SLOTS_POR_DIA), 100, 'H')
    expect(capa).toHaveLength(SLOTS_POR_DIA)
    expect(capa[100]).toBe('H')
    expect(capa[99]).toBe('0')
  })

  it('ignora índices fuera de rango sin corromper la capa', () => {
    const base = '0'.repeat(SLOTS_POR_DIA)
    expect(pintarSlot(base, -1, 'H')).toBe(base)
    expect(pintarSlot(base, SLOTS_POR_DIA, 'H')).toBe(base)
  })
})

describe('formato', () => {
  it('traduce tramos a hora de reloj', () => {
    expect(slotAHora(0)).toBe('00:00')
    expect(slotAHora(1)).toBe('00:05')
    expect(slotAHora(SLOTS_POR_DIA)).toBe('00:00') // fin de día = vuelta al inicio
    expect(slotAHora(slotDeHora(13, 30))).toBe('13:30')
  })

  it('muestra duraciones en horas y minutos, y en decimal con coma', () => {
    expect(slotsAHorasMinutos(30)).toBe('2 h 30')
    expect(slotsAHorasMinutos(0)).toBe('0 h 00')
    expect(slotsAHorasDecimal(30)).toBe('2,5')
  })
})

describe('base de partida', () => {
  it('el domingo queda entero libre para mantención mayor', () => {
    const r = contarDia(baseDia('doble', 6))
    expect(r.libres).toBe(SLOTS_POR_DIA)
  })

  it('el perfil doble deja menos ventana libre que el simple', () => {
    const doble = contarDia(baseDia('doble', 0)).libres
    const simple = contarDia(baseDia('simple', 0)).libres
    expect(doble).toBeLessThan(simple)
  })

  it('la base arranca sin intervenciones pintadas: eso lo decide Mantención', () => {
    for (let d = 0; d < 7; d++) {
      expect(contarDia(baseDia('doble', d)).intervencion).toBe(0)
    }
  })

  it('la semana de una máquina suma 168 h de calendario', () => {
    const r = contarSemana(maquinaNueva('x', 'X', 'doble'))
    const total = r.porDia.reduce(
      (a, d) => a + d.ocupacion.P + d.ocupacion.H + d.ocupacion.C + d.ocupacion.X + d.ocupacion['0'],
      0,
    )
    expect(total).toBe(7 * SLOTS_POR_DIA)
  })
})

describe('normalizarEstado', () => {
  it('acepta un estado bien formado', () => {
    const state = normalizarEstado(estadoInicial())
    expect(state?.maquinas).toHaveLength(6)
    expect(state?.maquinas[0]!.semana).toHaveLength(7)
  })

  it('rechaza basura y documentos sin máquinas', () => {
    expect(normalizarEstado(null)).toBeNull()
    expect(normalizarEstado({})).toBeNull()
    expect(normalizarEstado({ maquinas: [] })).toBeNull()
  })

  it('una máquina con la semana corrupta se repone con una base, no tumba el resto', () => {
    const state = normalizarEstado({
      maquinas: [
        { id: 'a', nombre: 'A', semana: [{ areas: 'corto', mant: 'corto' }] },
        { id: 'b', nombre: 'B', semana: maquinaNueva('b', 'B').semana },
      ],
    })
    expect(state?.maquinas).toHaveLength(2)
    expect(state?.maquinas[0]!.semana).toHaveLength(7)
    expect(state?.maquinas[0]!.semana[0]!.areas).toHaveLength(SLOTS_POR_DIA)
  })

  it('una máquina nueva arranca sin confirmar', () => {
    const state = normalizarEstado({ maquinas: [maquinaNueva('a', 'A')] })
    expect(state?.maquinas[0]!.revisadoEnTerreno).toBe(false)
  })

  it('migra el flag global viejo: si el plan estaba confirmado, lo estaban todas', () => {
    // Documentos guardados antes del 26-08 llevaban un único `revisadoEnTerreno`
    // para todo el plan. Perderlo obligaría a reconfirmar máquina por máquina.
    const state = normalizarEstado({
      maquinas: [maquinaNueva('a', 'A'), maquinaNueva('b', 'B')],
      revisadoEnTerreno: true,
    })
    expect(confirmadas(state!.maquinas)).toHaveLength(2)
  })

  it('sin flag global, cada máquina conserva el suyo', () => {
    const a = { ...maquinaNueva('a', 'A'), revisadoEnTerreno: true }
    const b = maquinaNueva('b', 'B')
    const state = normalizarEstado({ maquinas: [a, b] })
    expect(confirmadas(state!.maquinas).map((m) => m.id)).toEqual(['a'])
    expect(sinConfirmar(state!.maquinas).map((m) => m.id)).toEqual(['b'])
  })

  it('el flag global no puede DESconfirmar una máquina ya confirmada', () => {
    const a = { ...maquinaNueva('a', 'A'), revisadoEnTerreno: true }
    const state = normalizarEstado({ maquinas: [a], revisadoEnTerreno: false })
    expect(state?.maquinas[0]!.revisadoEnTerreno).toBe(true)
  })
})
