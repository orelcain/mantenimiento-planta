/**
 * Duelo de equipos: rotación por semana, correcciones, puntos, empate, turno
 * corto, ciclo, rachas y récords. Usa la taxonomía REAL (`duenoDe`): «KNURO» es
 * una falla técnica (Mantención) y «FALTA MMPP» es externa.
 */
import { describe, expect, it } from 'vitest'
import type { ForecastHistoryShift, PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import {
  bandaDeCurvas, cicloDe, compararTurnos, construirDuelo, costoMantencion, curvaDeForecast, duelosDeTurnos,
  equipoCorregido, equipoDelTurno, esNocheDesdeHora, llenadoDePuesto, marcadorDeCiclo, nombreCorto, nombreEquipo,
  nombresEfectivos, piezasAlMinuto, rachasPorEquipo, recordsDe, resumenDeStat, rivalDirecto, semanasDesdeAncla,
  type ResumenTurno,
} from '../duelo'

/** Un turno cerrado de `shiftStats` con los datos del duelo. */
const stat = (id: string, p: Partial<ShiftStat> = {}, duelo: Partial<NonNullable<ShiftStat['duelo']>> = {}): ShiftStat => ({
  shiftDocId: id,
  dateKey: id.slice(0, 10),
  shiftId: id.slice(11),
  total: 12000,
  producingMin: 400,
  windowMin: 480,
  plannedMin: 60,
  recoverableMin: 0,
  recoverable: [],
  duelo: {
    h0: id.includes('Noche') ? '21:00' : '07:00',
    ini: 10, uh: 1500, mic: 30,
    alim: [{ n: 'Evisceradora 1', f: 90 }, { n: 'Evisceradora 2', f: 85 }],
    ...duelo,
  },
  ...p,
})

/** Resumen listo para comparar, con valores neutros que cada prueba pisa. */
const resumen = (p: Partial<ResumenTurno>): ResumenTurno => ({
  shiftDocId: '2026-10-26_Turno Dia', dateKey: '2026-10-26', shiftId: 'Turno Dia', esNoche: false, equipo: 'rebolledo', cerrado: true,
  piezas: 12000, dispMin: 420, fallasN: 0, fallaMin: 0, piezasMant: 0, ritmo: 30, microMinH: 2, arranqueMin: 10, ultimaHoraPz: 1500,
  puestos: [{ clave: 'evisceradora 1', etiqueta: 'Ev 1', llenado: 90 }], ...p,
})

describe('equipoDelTurno: rotación por paridad de semana ISO', () => {
  it('la semana del ancla (26-10-2026): día = Rebolledo, noche = Cárdenas', () => {
    expect(equipoDelTurno('2026-10-26_Turno Dia', false)).toBe('rebolledo')
    expect(equipoDelTurno('2026-10-26_Turno Noche', true)).toBe('cardenas')
    expect(equipoDelTurno('2026-10-30_Turno Dia', false)).toBe('rebolledo') // viernes
  })

  it('el domingo todavía es de la semana del lunes anterior', () => {
    expect(semanasDesdeAncla('2026-11-01')).toBe(0)
    expect(equipoDelTurno('2026-11-01_Turno Noche', true)).toBe('cardenas')
  })

  it('alterna cada semana, hacia adelante y hacia atrás', () => {
    expect(equipoDelTurno('2026-11-02_Turno Dia', false)).toBe('cardenas')
    expect(equipoDelTurno('2026-11-02_Turno Noche', true)).toBe('rebolledo')
    expect(equipoDelTurno('2026-11-09_Turno Dia', false)).toBe('rebolledo')
    expect(equipoDelTurno('2026-10-19_Turno Dia', false)).toBe('cardenas') // una semana antes del ancla
    expect(equipoDelTurno('2026-10-12_Turno Dia', false)).toBe('rebolledo') // dos antes (negativos bien resueltos)
  })

  it('una corrección manual gana a la rotación y se reconoce como corregida', () => {
    const ov = { '2026-10-26_Turno Dia': 'cardenas' as const }
    expect(equipoDelTurno('2026-10-26_Turno Dia', false, ov)).toBe('cardenas')
    expect(equipoCorregido('2026-10-26_Turno Dia', false, ov)).toBe(true)
    expect(equipoCorregido('2026-10-26_Turno Noche', true, ov)).toBe(false)
    // Una corrección que coincide con la rotación no es una corrección.
    expect(equipoCorregido('2026-10-26_Turno Dia', false, { '2026-10-26_Turno Dia': 'rebolledo' })).toBe(false)
  })
})

describe('día o noche por el inicio planificado, no por el nombre', () => {
  it('05:00–16:59 es día; el resto, noche', () => {
    expect(esNocheDesdeHora('05:00')).toBe(false)
    expect(esNocheDesdeHora('07:15')).toBe(false)
    expect(esNocheDesdeHora('16:59')).toBe(false)
    expect(esNocheDesdeHora('17:00')).toBe(true)
    expect(esNocheDesdeHora('21:45')).toBe(true)
    expect(esNocheDesdeHora('00:30')).toBe(true)
    expect(esNocheDesdeHora('04:59')).toBe(true)
    expect(esNocheDesdeHora(null)).toBeNull()
    expect(esNocheDesdeHora('sin hora')).toBeNull()
  })

  it('un turno llamado «Noche» que arranca de día es de día', () => {
    const r = resumenDeStat(stat('2026-10-26_Turno Noche', {}, { h0: '08:00' }))!
    expect(r.esNoche).toBe(false)
    expect(r.equipo).toBe('rebolledo')
  })

  it('un turno sin los datos del duelo (aún no rearmado) no entra: no se adivina', () => {
    const { duelo: _d, ...sinDuelo } = stat('2026-10-26_Turno Dia')
    expect(resumenDeStat(sinDuelo as ShiftStat)).toBeNull()
    expect(resumenDeStat(stat('2026-10-26_Turno Dia', {}, { h0: undefined }))).toBeNull()
  })
})

describe('nombres', () => {
  it('sin nombre cargado: Grupo 1 / Grupo 2; Eviscerado trae a sus supervisores', () => {
    expect(nombreEquipo('rebolledo')).toBe('Grupo 1')
    expect(nombreEquipo('cardenas', {})).toBe('Grupo 2')
    expect(nombreCorto('rebolledo', { rebolledo: 'Francisco Rebolledo' })).toBe('Rebolledo')
    expect(nombreCorto('cardenas')).toBe('Grupo 2')
    expect(nombresEfectivos(null, 'carros')).toEqual({ rebolledo: 'Francisco Rebolledo', cardenas: 'Cristian Cárdenas' })
    expect(nombresEfectivos(null, 'silletas')).toEqual({ rebolledo: undefined, cardenas: undefined })
  })

  it('lo que carga el admin gana a lo de fábrica, y un nombre vacío no lo borra', () => {
    const n = nombresEfectivos({ equipos: { rebolledo: ' Ana Soto ', cardenas: '  ' } }, 'carros')
    expect(n.rebolledo).toBe('Ana Soto')
    expect(n.cardenas).toBe('Cristian Cárdenas')
  })
})

describe('compararTurnos: un punto por KPI y por puesto', () => {
  it('suma un punto por cada KPI ganado', () => {
    const a = resumen({ piezas: 12500, ritmo: 31, microMinH: 1, arranqueMin: 5, ultimaHoraPz: 1600 })
    const b = resumen({ equipo: 'cardenas', piezas: 12000 })
    const m = compararTurnos(a, b)
    expect(m.kpis.map((k) => k.ganador)).toEqual(['a', 'a', 'a', 'a'])
    expect(m.puestos[0]!.ganador).toBe('empate') // 90 contra 90
    expect(m.puntosA).toBe(4)
    expect(m.puntosB).toBe(0)
    expect(m.ganador).toBe('a')
  })

  it('menos micro detención y menos minutos al arranque ganan', () => {
    const a = resumen({ microMinH: 3, arranqueMin: 20 })
    const b = resumen({ equipo: 'cardenas', microMinH: 1, arranqueMin: 5 })
    const m = compararTurnos(a, b)
    expect(m.kpis.find((k) => k.id === 'micro')!.ganador).toBe('b')
    expect(m.kpis.find((k) => k.id === 'arranque')!.ganador).toBe('b')
  })

  it('arranque y cierre: si se reparten es empate; si uno empata decide el otro', () => {
    const reparten = compararTurnos(resumen({ arranqueMin: 5, ultimaHoraPz: 1000 }), resumen({ equipo: 'cardenas', arranqueMin: 20, ultimaHoraPz: 1500 }))
    expect(reparten.kpis.find((k) => k.id === 'arranque')!.ganador).toBe('empate')
    const decide = compararTurnos(resumen({ arranqueMin: 10, ultimaHoraPz: 1800 }), resumen({ equipo: 'cardenas', arranqueMin: 10, ultimaHoraPz: 1500 }))
    expect(decide.kpis.find((k) => k.id === 'arranque')!.ganador).toBe('a')
  })

  it('empate total: nadie suma y el turno queda empatado', () => {
    const m = compararTurnos(resumen({}), resumen({ equipo: 'cardenas' }))
    expect(m.puntosA).toBe(0)
    expect(m.puntosB).toBe(0)
    expect(m.ganador).toBe('empate')
  })

  it('las fallas técnicas NO restan puntos: sus piezas se suman al equipo en la carrera', () => {
    // A hizo 600 pz menos porque una falla técnica lo frenó 20 min (30 pz/min): con eso sumado, gana.
    const a = resumen({ piezas: 11500, fallaMin: 20, fallasN: 1, piezasMant: 600 })
    const b = resumen({ equipo: 'cardenas', piezas: 12000 })
    const carrera = compararTurnos(a, b).kpis.find((k) => k.id === 'carrera')!
    expect(carrera.filas[0]!.a).toBe(12100)
    expect(carrera.ganador).toBe('a')
  })

  it('un dato que falta es «sin dato», no un cero que pierde', () => {
    const m = compararTurnos(resumen({ microMinH: null }), resumen({ equipo: 'cardenas', microMinH: 1 }))
    expect(m.kpis.find((k) => k.id === 'micro')!.ganador).toBe('sin-dato')
    expect(m.puntosB).toBe(0)
    expect(m.enJuego).toBe(4) // 3 KPI con dato + 1 puesto
  })

  it('un punto por puesto ganado, cruzando por nombre y sin nombres de operadores', () => {
    const a = resumen({ puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 95 }, { clave: 'ev2', etiqueta: 'Ev 2', llenado: 70 }, { clave: 'ev3', etiqueta: 'Ev 3', llenado: 80 }] })
    const b = resumen({ equipo: 'cardenas', puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 90 }, { clave: 'ev2', etiqueta: 'Ev 2', llenado: 85 }] })
    const m = compararTurnos(a, b)
    expect(m.puestos.map((p) => [p.etiqueta, p.ganador])).toEqual([['Ev 1', 'a'], ['Ev 2', 'b']]) // Ev 3 no tiene rival
  })

  it('turno corto (menos del 60 % de los minutos del rival): sin duelo, sin puntos', () => {
    const corto = compararTurnos(resumen({ dispMin: 200, piezas: 99999 }), resumen({ equipo: 'cardenas', dispMin: 420 }))
    expect(corto.sinDuelo).toBe(true)
    expect(corto.ganador).toBe('sin-duelo')
    expect(corto.puntosA + corto.puntosB).toBe(0)
    // Justo en el borde (60 %) todavía hay duelo.
    expect(compararTurnos(resumen({ dispMin: 252 }), resumen({ equipo: 'cardenas', dispMin: 420 })).sinDuelo).toBe(false)
  })

  it('turno en curso: la carrera compara a igual tiempo y es provisoria; la última hora queda pendiente', () => {
    const a = resumen({ cerrado: false, ultimaHoraPz: null })
    const b = resumen({ equipo: 'cardenas' })
    const m = compararTurnos(a, b, { carreraEnVivo: { a: 3980, b: 3720 } })
    expect(m.kpis.find((k) => k.id === 'carrera')!.ganador).toBe('a')
    expect(m.kpis.find((k) => k.id === 'arranque')!.filas[1]!.ganador).toBe('pendiente')
    expect(m.ganador).toBe('pendiente')
    // Sin curva del rival a esa hora, la carrera espera al cierre.
    expect(compararTurnos(a, b).kpis.find((k) => k.id === 'carrera')!.ganador).toBe('pendiente')
  })
})

describe('llenadoDePuesto', () => {
  it('piezas ÷ (esperado × minutos andando), con tope 100', () => {
    expect(llenadoDePuesto(3600, 19, 4 * 3600)).toBe(79)
    expect(llenadoDePuesto(99999, 19, 3600)).toBe(100)
    expect(llenadoDePuesto(100, 0, 3600)).toBeNull()
    expect(llenadoDePuesto(100, 19, 0)).toBeNull()
    expect(llenadoDePuesto(100, null, undefined)).toBeNull()
  })
})

describe('rival directo, ciclo, rachas y récords', () => {
  // Cuatro semanas completas, un turno de día y uno de noche por semana. Semana 0 = ancla.
  const semana = (lunes: string) => [`${lunes}_Turno Dia`, `${lunes}_Turno Noche`]
  const lunes = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
  const todos = lunes.flatMap(semana)
  /** El equipo del día gana +500 pz en cada semana; la noche empata en todo. */
  const resumenes = todos.map((id) => {
    const esNoche = id.includes('Noche')
    const r = resumenDeStat(stat(id, { total: esNoche ? 10000 : 12000 }))!
    return r
  })

  it('el rival directo es el último turno anterior del mismo horario hecho por el otro equipo', () => {
    const hoy = resumenes.find((r) => r.shiftDocId === '2026-11-02_Turno Dia')!
    const rival = rivalDirecto(hoy, resumenes)!
    expect(rival.shiftDocId).toBe('2026-10-26_Turno Dia')
    expect(rival.equipo).not.toBe(hoy.equipo)
    // La noche se mide contra la noche, nunca contra el día.
    const noche = resumenes.find((r) => r.shiftDocId === '2026-11-02_Turno Noche')!
    expect(rivalDirecto(noche, resumenes)!.shiftDocId).toBe('2026-10-26_Turno Noche')
    // El primer turno de la ventana no tiene a quién ganarle.
    expect(rivalDirecto(resumenes.find((r) => r.shiftDocId === '2026-10-12_Turno Dia')!, resumenes)).toBeNull()
  })

  it('el ciclo dura dos semanas y empieza en el ancla', () => {
    expect(cicloDe('2026-10-26')).toEqual({ indice: 0, inicio: '2026-10-26', fin: '2026-11-08' })
    expect(cicloDe('2026-11-08').indice).toBe(0)
    expect(cicloDe('2026-11-09').indice).toBe(1)
    expect(cicloDe('2026-10-25').indice).toBe(-1)
    expect(cicloDe('2026-10-12')).toEqual({ indice: -1, inicio: '2026-10-12', fin: '2026-10-25' })
  })

  it('el marcador del ciclo reparte los puntos al equipo que hizo cada turno', () => {
    // Todos los turnos del día (12.000 pz) y de la noche (10.000) son idénticos entre semanas: todo empata,
    // salvo que movamos uno. En la semana del 2-nov el día (Cárdenas) hace 1.000 pz más que el día de Rebolledo del 26-oct.
    const conGanador = [...todos].map((id) => resumenDeStat(stat(id, { total: id === '2026-11-02_Turno Dia' ? 13000 : (id.includes('Noche') ? 10000 : 12000) }))!)
    const duelos = duelosDeTurnos(conGanador)
    const c0 = marcadorDeCiclo(duelos, 0, 0)
    expect(c0.vigente).toBe(true)
    expect(c0.inicio).toBe('2026-10-26')
    expect(c0.puntos.cardenas).toBe(2) // carrera y ritmo del día del 2-nov, que es de Cárdenas
    expect(c0.puntos.rebolledo).toBe(0)
    expect(c0.jugados.cardenas).toBe(2) // su día y su noche... 26-oct noche y 2-nov día
    expect(c0.ganados.cardenas).toBe(1)
    const previo = marcadorDeCiclo(duelos, -1, 0)
    expect(previo.vigente).toBe(false)
    expect(previo.puntos.rebolledo + previo.puntos.cardenas).toBe(0)
  })

  const base = (id: string, total: number, dispMin = 420) => ({ ...resumenDeStat(stat(id, { total }))!, dispMin })

  it('rachas: se suman las victorias seguidas de cada equipo', () => {
    const turnos = [
      base('2026-10-12_Turno Dia', 11000), // Rebolledo (semana -2): sin rival
      base('2026-10-19_Turno Dia', 11500), // Cárdenas gana a Rebolledo
      base('2026-10-26_Turno Dia', 12000), // Rebolledo gana a Cárdenas
      base('2026-11-02_Turno Dia', 12500), // Cárdenas gana
      base('2026-11-09_Turno Dia', 13000), // Rebolledo gana
      base('2026-11-16_Turno Dia', 13500), // Cárdenas gana
    ]
    const r = rachasPorEquipo(duelosDeTurnos(turnos))
    // Cada equipo gana todos sus turnos: Cárdenas el 19-oct, 2-nov y 16-nov; Rebolledo el 26-oct y 9-nov.
    expect(r.cardenas).toEqual({ actual: 3, mejor: 3 })
    expect(r.rebolledo).toEqual({ actual: 2, mejor: 2 })
  })

  it('rachas: una derrota la corta (la mejor queda guardada)', () => {
    const turnos = [
      base('2026-10-19_Turno Noche', 9000), // Rebolledo (noche, semana -1): sin rival
      base('2026-10-26_Turno Noche', 9500), // Cárdenas gana
      base('2026-11-02_Turno Noche', 9800), // Rebolledo gana
      base('2026-11-09_Turno Noche', 9700), // Cárdenas pierde (9.700 < 9.800)
      base('2026-11-16_Turno Noche', 9600), // Rebolledo pierde (9.600 < 9.700)
    ]
    const r = rachasPorEquipo(duelosDeTurnos(turnos))
    expect(r.cardenas).toEqual({ actual: 0, mejor: 1 })
    expect(r.rebolledo).toEqual({ actual: 0, mejor: 1 })
  })

  it('rachas: un turno sin duelo ni la corta ni la suma', () => {
    const turnos = [
      base('2026-10-19_Turno Noche', 9000),
      base('2026-10-26_Turno Noche', 9500), // Cárdenas gana
      base('2026-11-02_Turno Noche', 9800), // Rebolledo gana
      base('2026-11-09_Turno Noche', 9900, 100), // Cárdenas: turno corto, sin duelo
      base('2026-11-16_Turno Noche', 9000), // Rebolledo contra un turno corto: sin duelo
    ]
    const r = rachasPorEquipo(duelosDeTurnos(turnos))
    expect(r.cardenas).toEqual({ actual: 1, mejor: 1 })
    expect(r.rebolledo).toEqual({ actual: 1, mejor: 1 })
  })

  it('récords: lo mejor de la ventana, con el equipo y el día', () => {
    const turnos = [
      resumenDeStat(stat('2026-10-26_Turno Dia', { total: 15000 }))!,
      resumenDeStat(stat('2026-10-26_Turno Noche', { total: 11000 }))!,
      resumenDeStat(stat('2026-11-02_Turno Noche', { total: 9000 }))!,
    ]
    const r = recordsDe(duelosDeTurnos(turnos))
    const dia = r.find((x) => x.id === 'piezas-dia')!
    expect(dia).toMatchObject({ valor: 15000, equipo: 'rebolledo', dateKey: '2026-10-26' })
    const noche = r.find((x) => x.id === 'piezas-noche')!
    expect(noche).toMatchObject({ valor: 11000, equipo: 'cardenas' })
  })

  it('costo de Mantención: piezas perdidas = minutos de falla × ritmo andando del propio turno', () => {
    // 40 min de máquina de KNURO en una línea de 3 máquinas → la línea perdió 10 min; ritmo 12000 / 400 = 30 pz/min.
    const t = stat('2026-10-26_Turno Dia', {
      recoverableMin: 10,
      recoverable: [{ reason: 'KNURO', min: 40, count: 2 }],
    })
    const costo = costoMantencion([resumenDeStat(t)!])
    expect(costo.rebolledo.fallasN).toBe(2)
    expect(costo.rebolledo.fallaMin).toBeCloseTo(10)
    expect(costo.rebolledo.piezasPerdidas).toBeCloseTo(300)
    expect(costo.rebolledo.minPorFalla).toBeCloseTo(5)
    expect(costo.cardenas.minPorFalla).toBeNull()
  })

  it('una causa externa no es costo de Mantención', () => {
    const t = stat('2026-10-26_Turno Dia', { recoverableMin: 10, recoverable: [{ reason: 'FALTA MMPP', min: 10, count: 1 }] })
    const r = resumenDeStat(t)!
    expect(r.fallaMin).toBe(0)
    expect(r.piezasMant).toBe(0)
    // El tiempo disponible sí es el de la ventana menos el convenio (no se descuenta lo externo).
    expect(r.dispMin).toBe(420)
  })
})

describe('curvas', () => {
  const curva = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 1000 }, { minutes: 120, pieces: 2400 }]

  it('interpola, y pasado el final devuelve el total (ese turno ya terminó)', () => {
    expect(piezasAlMinuto(curva, 30)).toBe(500)
    expect(piezasAlMinuto(curva, 90)).toBe(1700)
    expect(piezasAlMinuto(curva, 999)).toBe(2400)
    expect(piezasAlMinuto([], 10)).toBeNull()
    expect(piezasAlMinuto(curva, 0)).toBe(0)
  })

  it('una curva con tramos vacíos al frente corre el eje al primer tramo con piezas', () => {
    const c = curvaDeForecast([{ m: 15, p: 0 }, { m: 30, p: 0 }, { m: 45, p: 300 }, { m: 60, p: 700 }])
    expect(c[0]).toEqual({ minutes: 15, pieces: 300 })
    expect(c[1]).toEqual({ minutes: 30, pieces: 700 })
    expect(curvaDeForecast([{ m: 15, p: 200 }])[0]).toEqual({ minutes: 15, pieces: 200 })
  })

  it('banda del rival: promedio y rango; con un solo turno no hay banda', () => {
    const a = [{ minutes: 0, pieces: 0 }, { minutes: 30, pieces: 1000 }]
    const b = [{ minutes: 0, pieces: 0 }, { minutes: 30, pieces: 2000 }]
    const banda = bandaDeCurvas([a, b])!
    expect(banda.turnos).toBe(2)
    const fin = banda.media[banda.media.length - 1]!
    expect(fin).toEqual({ minutes: 30, pieces: 1500 })
    expect(banda.min[banda.min.length - 1]!.pieces).toBe(1000)
    expect(banda.max[banda.max.length - 1]!.pieces).toBe(2000)
    expect(bandaDeCurvas([a])).toBeNull()
  })
})

describe('construirDuelo: de punta a punta con un turno en curso', () => {
  const live = {
    scheduledStart: '2026-11-02T07:00:00.000Z',
    plannedEnd: '2026-11-02T15:00:00.000Z',
    totalPieces: 3980,
    series: [
      { t: '2026-11-02T07:10:00.000Z', pieces: 1000 },
      { t: '2026-11-02T07:15:00.000Z', pieces: 1000 },
      { t: '2026-11-02T07:20:00.000Z', pieces: 1000 },
      { t: '2026-11-02T07:25:00.000Z', pieces: 980 },
    ],
    timeBreakdown: { producingMin: 100, windowMin: 120, plannedMin: 0, recoverableMin: 0, planned: [], recoverable: [] },
    mantencion: { porMaquina: [{ microMin: 2 }] },
    machines: [{ name: 'Evisceradora 1', pieces: 3980, targetCpm: 19, uptimeSec: 6000 }],
  } as unknown as PublicMonitorLive
  const curvaHoy = [{ minutes: 5, pieces: 1000 }, { minutes: 10, pieces: 2000 }, { minutes: 15, pieces: 3000 }, { minutes: 20, pieces: 3980 }]
  const forecast: ForecastHistoryShift[] = [{
    shiftDocId: '2026-10-26_Turno Dia', dateKey: '2026-10-26',
    curve: [{ m: 5, p: 900 }, { m: 10, p: 1800 }, { m: 15, p: 2700 }, { m: 20, p: 3720 }, { m: 60, p: 12000 }],
    total: 12000, producingMin: 400, micro: null,
  }]

  it('el turno de Cárdenas (semana 2-nov) corre contra el último de Rebolledo y va ganando a la hora 1', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy,
      stats: [stat('2026-10-26_Turno Dia')], forecast,
    })!
    expect(d.hoy.equipo).toBe('cardenas')
    expect(d.rival?.equipo).toBe('rebolledo')
    expect(d.carrera?.hora).toBe(1)
    expect(d.carrera?.fantasmaPz).toBe(3720)
    expect(d.carrera?.diferencia).toBe(260)
    expect(d.marcador?.kpis[0]!.ganador).toBe('a')
    expect(d.marcador?.ganador).toBe('pendiente')
    expect(d.listos).toEqual({ con: 1, de: 1 })
    expect(d.corregido).toBe(false)
  })

  it('con una corrección manual el turno cambia de equipo y el aviso lo dice', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy,
      stats: [stat('2026-10-26_Turno Dia')], forecast, overrides: { '2026-11-02_Turno Dia': 'rebolledo' },
    })!
    expect(d.hoy.equipo).toBe('rebolledo')
    expect(d.corregido).toBe(true)
    // Rebolledo contra Rebolledo no es un duelo: el rival tiene que ser el otro equipo (no hay ninguno anterior).
    expect(d.rival).toBeNull()
  })

  it('día contra noche de hoy: dato sin puntos, a igual tiempo de turno', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy, stats: [], forecast: [],
      rivalCurve: { shiftDocId: '2026-11-01_Turno Noche', dateKey: '2026-11-01', shiftId: 'Turno Noche', h0: '21:00', curve: [{ m: 5, p: 800 }, { m: 10, p: 1700 }, { m: 15, p: 2500 }, { m: 20, p: 3300 }, { m: 480, p: 10000 }], total: 10000, producingMin: 400 },
    })!
    expect(d.diaNoche?.esNoche).toBe(true)
    expect(d.diaNoche?.rivalPz).toBe(3300)
    expect(d.diaNoche?.diferencia).toBe(680)
    // El domingo 1-nov noche es de la semana anterior al ancla+1: lo hizo Cárdenas, igual que el día de hoy.
    expect(d.diaNoche?.mismoEquipo).toBe(true)
  })

  it('sin la hora de inicio del turno no se arma el duelo', () => {
    expect(construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live: { ...live, scheduledStart: null } as PublicMonitorLive,
      piezas: 0, cerrado: false, curvaHoy: [], stats: [], forecast: [],
    })).toBeNull()
  })
})
