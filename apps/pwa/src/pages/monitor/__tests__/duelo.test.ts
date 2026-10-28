/**
 * Duelo de equipos: rotación por semana, correcciones, puntos, empate, turno
 * corto, ciclo, rachas y récords. Usa la taxonomía REAL (`duenoDe`): «KNURO» es
 * una falla técnica (Mantención) y «FALTA MMPP» es externa.
 */
import { describe, expect, it } from 'vitest'
import type { ForecastHistoryShift, PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import {
  bandaDeCurvas, bandasDeHoras, curvaConContador, referenciaPropia, causaCorta, cicloDe, compararTurnos, construirDuelo, costoMantencion, curvaDeForecast, duelosDeTurnos,
  equipoCorregido, equipoDelTurno, esNocheDesdeHora, etiquetaHora, eventosCrudosDeLive, eventosEnEjeProduccion, fantasmaDeJornada,
  fechaCorreccion, filasKpiAKpi, franjasEntre, horaTranscurrida, jornadaDe, llenadoDePuesto, marcadorDeCiclo, marcadorDePeriodo,
  minutoDelDia, nombreCorto, nombreEquipo, nombresEfectivos, periodosDisponibles, piezasAlMinuto, rachasPorEquipo, recordsDe,
  referenciaMismoHorario, relojDeMinuto, curvaDeCv, fantasmaDeStat, resumenDeStat, ritmoHoraAHora, rivalDirecto, rotuloFantasma, rotuloTurno,
  semanaIso, semanasDesdeAncla, tendenciaSemanal,
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
  shiftDocId: '2026-10-26_Turno Dia', dateKey: '2026-10-26', jornada: '2026-10-26', h0: '07:00', shiftId: 'Turno Dia', esNoche: false, equipo: 'rebolledo', cerrado: true,
  piezas: 12000, dispMin: 420, fallasN: 0, fallaMin: 0, piezasMant: 0, ritmo: 30, microMinH: 2, arranqueMin: 10, ultimaHoraPz: 1500,
  puestos: [{ clave: 'evisceradora 1', etiqueta: 'Ev 1', llenado: 90 }], ...p,
})

describe('equipoDelTurno: rotación por paridad de semana ISO, contada por jornada', () => {
  it('la semana del ancla (26-10-2026): día = Rebolledo, noche = Cárdenas', () => {
    expect(equipoDelTurno('2026-10-26_Turno Dia', false)).toBe('rebolledo')
    expect(equipoDelTurno('2026-10-26_Turno Noche', true)).toBe('cardenas')
    expect(equipoDelTurno('2026-10-30_Turno Dia', false)).toBe('rebolledo') // viernes
  })

  it('el domingo de día todavía es de la semana del lunes anterior', () => {
    expect(semanasDesdeAncla('2026-11-01')).toBe(0)
    expect(equipoDelTurno('2026-11-01_Turno Dia', false)).toBe('rebolledo')
  })

  it('la noche que parte el domingo a las 21:00 es la jornada del lunes: cuenta en la semana nueva', () => {
    // Domingo 1-nov 21:00 → jornada lunes 2-nov (semana 2-nov: la noche es de Rebolledo).
    expect(jornadaDe('2026-11-01', true)).toBe('2026-11-02')
    expect(equipoDelTurno('2026-11-01_Turno Noche', true)).toBe('rebolledo')
    // El domingo de día sigue en la semana vieja y lo hace el otro equipo: ese día y esa noche NO son rivales de la misma jornada.
    expect(equipoDelTurno('2026-11-01_Turno Dia', false)).toBe('rebolledo')
    // La noche del domingo 25-oct es la jornada del lunes 26-oct (ancla): noche = Cárdenas, y el día del lunes = Rebolledo.
    expect(equipoDelTurno('2026-10-25_Turno Noche', true)).toBe('cardenas')
    expect(equipoDelTurno('2026-10-26_Turno Dia', false)).toBe('rebolledo')
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

describe('jornadaDe: la fecha de producción', () => {
  it('toda noche pasa a la jornada del día siguiente al de su documento; el día se queda', () => {
    expect(jornadaDe('2026-10-27', true)).toBe('2026-10-28')
    expect(jornadaDe('2026-10-28', false)).toBe('2026-10-28')
  })

  it('bordes de mes y de año', () => {
    expect(jornadaDe('2026-10-31', true)).toBe('2026-11-01')
    expect(jornadaDe('2026-12-31', true)).toBe('2027-01-01')
    expect(jornadaDe('2028-02-28', true)).toBe('2028-02-29')
  })

  it('el turno jornada se arma igual cualquiera sea la hora de inicio que traiga la noche (08:00, 21:00 o 04:00)', () => {
    for (const h0 of ['21:00', '23:30', '04:00']) {
      expect(resumenDeStat(stat('2026-10-26_Turno 1', {}, { h0 }))!.jornada).toBe('2026-10-27')
    }
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

describe('rival por jornada, ciclo, rachas y récords', () => {
  /** Una jornada = la noche que parte la víspera + el día de esa fecha. */
  const vispera = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const jornadaDeStats = (dia: string, pzNoche: number, pzDia: number, dispNoche = 420, dispDia = 420) => [
    { ...resumenDeStat(stat(`${vispera(dia)}_Turno Noche`, { total: pzNoche }))!, dispMin: dispNoche },
    { ...resumenDeStat(stat(`${dia}_Turno Dia`, { total: pzDia }))!, dispMin: dispDia },
  ]

  it('el rival directo es el otro horario de la MISMA jornada, hecho por el otro equipo', () => {
    const todos = [...jornadaDeStats('2026-10-27', 10000, 12000), ...jornadaDeStats('2026-10-28', 10000, 12000)]
    const noche = todos.find((r) => r.shiftDocId === '2026-10-26_Turno Noche')!
    const dia = todos.find((r) => r.shiftDocId === '2026-10-27_Turno Dia')!
    expect(noche.jornada).toBe('2026-10-27')
    expect(rivalDirecto(noche, todos)!.shiftDocId).toBe('2026-10-27_Turno Dia')
    expect(rivalDirecto(dia, todos)!.shiftDocId).toBe('2026-10-26_Turno Noche')
    expect(rivalDirecto(dia, todos)!.equipo).not.toBe(dia.equipo)
  })

  it('una noche cuyo día todavía no juega no tiene rival de jornada: no compite con nadie', () => {
    const todos = jornadaDeStats('2026-10-27', 10000, 12000)
    const nocheNueva = resumenDeStat(stat('2026-10-27_Turno Noche', { total: 3000 }))! // jornada 28-oct
    expect(nocheNueva.jornada).toBe('2026-10-28')
    expect(rivalDirecto(nocheNueva, todos)).toBeNull()
    // Su día es el del 28-oct, no el del 27: el turno día de la jornada anterior NO es su rival.
    expect(rivalDirecto(nocheNueva, [...todos, nocheNueva])).toBeNull()
  })

  it('si el supuesto rival lo hizo el mismo equipo (corrección manual) no hay duelo', () => {
    const ov = { '2026-10-27_Turno Dia': 'cardenas' as const }
    const noche = resumenDeStat(stat('2026-10-26_Turno Noche'), ov)!
    const dia = resumenDeStat(stat('2026-10-27_Turno Dia'), ov)!
    expect(noche.equipo).toBe(dia.equipo)
    expect(rivalDirecto(noche, [noche, dia])).toBeNull()
  })

  it('el ciclo dura dos semanas y empieza en el ancla', () => {
    expect(cicloDe('2026-10-26')).toEqual({ indice: 0, inicio: '2026-10-26', fin: '2026-11-08' })
    expect(cicloDe('2026-11-08').indice).toBe(0)
    expect(cicloDe('2026-11-09').indice).toBe(1)
    expect(cicloDe('2026-10-25').indice).toBe(-1)
    expect(cicloDe('2026-10-12')).toEqual({ indice: -1, inicio: '2026-10-12', fin: '2026-10-25' })
  })

  it('cada jornada es un partido: los puntos van al equipo que hizo cada turno', () => {
    // Jornada 27-oct: el día de Rebolledo (12.000 pz) le gana a la noche de Cárdenas (10.000): carrera y ritmo.
    const duelos = duelosDeTurnos(jornadaDeStats('2026-10-27', 10000, 12000))
    const c0 = marcadorDeCiclo(duelos, 0, 0)
    expect(c0.vigente).toBe(true)
    expect(c0.puntos).toEqual({ rebolledo: 2, cardenas: 0 })
    expect(c0.ganados).toEqual({ rebolledo: 1, cardenas: 0 })
    expect(c0.jugados).toEqual({ rebolledo: 1, cardenas: 1 })
    const previo = marcadorDeCiclo(duelos, -1, 0)
    expect(previo.vigente).toBe(false)
    expect(previo.puntos.rebolledo + previo.puntos.cardenas).toBe(0)
  })

  it('un turno sin su rival de jornada no suma ni cuenta como jugado', () => {
    const solo = duelosDeTurnos([resumenDeStat(stat('2026-10-27_Turno Dia'))!])
    expect(solo[0]!.marcador).toBeNull()
    expect(marcadorDeCiclo(solo, 0, 0).jugados).toEqual({ rebolledo: 0, cardenas: 0 })
  })

  it('rachas: se suman las jornadas ganadas y una derrota corta la racha', () => {
    const turnos = [
      ...jornadaDeStats('2026-10-27', 10000, 12000), // Rebolledo (día) gana
      ...jornadaDeStats('2026-10-28', 9500, 12500), // Rebolledo gana
      // Semana 2-nov: la noche (que parte el domingo) es de Rebolledo y el día de Cárdenas.
      ...jornadaDeStats('2026-11-03', 11000, 10000), // Rebolledo (noche) gana
      ...jornadaDeStats('2026-11-04', 11000, 13000), // Cárdenas (día) gana: corta la racha de Rebolledo
    ]
    const r = rachasPorEquipo(duelosDeTurnos(turnos))
    expect(r.rebolledo).toEqual({ actual: 0, mejor: 3 })
    expect(r.cardenas).toEqual({ actual: 1, mejor: 1 })
  })

  it('rachas: una jornada sin duelo ni corta ni suma', () => {
    const turnos = [
      ...jornadaDeStats('2026-10-27', 10000, 12000), // Rebolledo gana
      ...jornadaDeStats('2026-10-28', 9500, 12500, 100, 420), // la noche es un turno corto: sin duelo
      ...jornadaDeStats('2026-10-29', 9500, 12600), // Rebolledo gana
    ]
    const r = rachasPorEquipo(duelosDeTurnos(turnos))
    expect(r.rebolledo).toEqual({ actual: 2, mejor: 2 })
  })

  it('récords: lo mejor de la ventana, con el equipo y la jornada', () => {
    const turnos = [
      resumenDeStat(stat('2026-10-27_Turno Dia', { total: 15000 }))!,
      resumenDeStat(stat('2026-10-26_Turno Noche', { total: 11000 }))!,
      resumenDeStat(stat('2026-11-01_Turno Noche', { total: 9000 }))!,
    ]
    const r = recordsDe(duelosDeTurnos(turnos))
    expect(r.find((x) => x.id === 'piezas-dia')).toMatchObject({ valor: 15000, equipo: 'rebolledo', dateKey: '2026-10-27' })
    // La noche récord parte el 26-oct y es de la jornada del 27.
    expect(r.find((x) => x.id === 'piezas-noche')).toMatchObject({ valor: 11000, equipo: 'cardenas', dateKey: '2026-10-27' })
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
  const tras = (inicio: string, min: number) => new Date(Date.parse(inicio) + min * 60_000).toISOString()
  const liveDe = (inicio: string, fin: string, ciclos = 3980) => ({
    scheduledStart: inicio,
    plannedEnd: fin,
    totalPieces: ciclos,
    series: [
      { t: tras(inicio, 10), pieces: 1000 },
      { t: tras(inicio, 15), pieces: 1000 },
      { t: tras(inicio, 20), pieces: 1000 },
      { t: tras(inicio, 25), pieces: 980 },
    ],
    timeBreakdown: { producingMin: 100, windowMin: 120, plannedMin: 0, recoverableMin: 0, planned: [{ reason: 'COLACION', min: 30, count: 1 }], recoverable: [] },
    mantencion: { porMaquina: [{ microMin: 2 }] },
    machines: [{ name: 'Evisceradora 1', pieces: ciclos, targetCpm: 19, uptimeSec: 6000 }],
    stopReasons: ['COLACION', 'FALTA MMPP'],
    stopEvents: [
      { r: 0, f: tras(inicio, 40), s: 1800, m: 0 },
      { r: 1, f: tras(inicio, 50), s: 120, m: 0 },
    ],
  }) as unknown as PublicMonitorLive
  const live = liveDe('2026-11-02T07:00:00.000Z', '2026-11-02T15:00:00.000Z')
  const curvaHoy = [{ minutes: 5, pieces: 1000 }, { minutes: 10, pieces: 2000 }, { minutes: 15, pieces: 3000 }, { minutes: 20, pieces: 3980 }]
  const forecast: ForecastHistoryShift[] = [{
    shiftDocId: '2026-10-26_Turno Dia', dateKey: '2026-10-26',
    curve: [{ m: 5, p: 900 }, { m: 10, p: 1800 }, { m: 15, p: 2700 }, { m: 20, p: 3720 }, { m: 60, p: 12000 }],
    total: 12000, producingMin: 400, micro: null,
  }]
  /** La noche de la jornada del 2-nov: parte el domingo 1-nov a las 21:00; la hizo Rebolledo (noche de la semana 2-nov). */
  const nocheDeLaJornada = {
    shiftDocId: '2026-11-01_Turno Noche', dateKey: '2026-11-01', shiftId: 'Turno Noche', h0: '21:00',
    curve: [{ m: 5, p: 800 }, { m: 10, p: 1700 }, { m: 15, p: 2500 }, { m: 20, p: 3300 }, { m: 480, p: 10000 }], total: 10000, producingMin: 400,
  }

  it('el día de Cárdenas corre contra la noche de la MISMA jornada y va ganando a la 1ª hora', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy,
      stats: [stat('2026-10-26_Turno Dia'), stat('2026-11-01_Turno Noche')], forecast, rivalCurve: nocheDeLaJornada,
    })!
    expect(d.hoy.equipo).toBe('cardenas')
    expect(d.hoy.jornada).toBe('2026-11-02')
    expect(d.rival?.shiftDocId).toBe('2026-11-01_Turno Noche')
    expect(d.rival?.equipo).toBe('rebolledo')
    expect(d.abreJornada).toBe(false)
    expect(d.esperando).toBeNull()
    expect(d.carrera?.fantasmaInfo?.tipo).toBe('jornada')
    expect(rotuloFantasma(d.carrera!.fantasmaInfo!, 'Rebolledo')).toBe('Rebolledo · noche 02/11')
    expect(rotuloTurno('Cárdenas', d.hoy)).toBe('Cárdenas · día 02/11')
    expect(d.carrera?.hora).toBe(1)
    // El fantasma a la MISMA hora de producción (no su total): 3.300 pz a los 20 min, no 10.000.
    expect(d.carrera?.fantasmaPz).toBe(3300)
    expect(d.carrera?.diferencia).toBe(680)
    expect(d.marcador?.kpis[0]!.ganador).toBe('a')
    expect(d.marcador?.ganador).toBe('pendiente')
    expect(d.listos).toEqual({ con: 2, de: 2 })
    expect(d.corregido).toBe(false)
  })

  it('el mismo horario de la semana anterior queda como dato secundario, sin puntos', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy,
      stats: [stat('2026-10-26_Turno Dia'), stat('2026-11-01_Turno Noche')], forecast, rivalCurve: nocheDeLaJornada,
    })!
    expect(d.semanaAnterior?.fantasma.tipo).toBe('ultimo')
    expect(d.semanaAnterior?.fantasma.shiftDocId).toBe('2026-10-26_Turno Dia')
    expect(d.semanaAnterior?.pzAHora).toBe(3720)
    expect(d.semanaAnterior?.diferencia).toBe(260)
  })

  /** `cv` de 15 en 15 min: el último valor es el cierre y cae en el minuto `cvm`. */
  const cvNoche = { cv: [800, 1700, 2500, 3300, 10000], cvp: 15, cvm: 70 }
  const cvDia = { cv: [900, 1800, 2700, 3600, 12000], cvp: 15, cvm: 70 }

  it('curvaDeCv: pasos fijos de cvp y el último punto en cvm; sin curva, vacío', () => {
    expect(curvaDeCv({ cv: [10, 20, 30], cvp: 15, cvm: 40 })).toEqual([
      { minutes: 15, pieces: 10 }, { minutes: 30, pieces: 20 }, { minutes: 40, pieces: 30 },
    ])
    expect(curvaDeCv({ cv: [10, 20, 30], cvp: 15 })).toEqual([
      { minutes: 15, pieces: 10 }, { minutes: 30, pieces: 20 }, { minutes: 45, pieces: 30 },
    ])
    expect(curvaDeCv({ cv: [], cvp: 15 })).toEqual([])
    expect(curvaDeCv({ cv: [5] })).toEqual([])
    expect(curvaDeCv(undefined)).toEqual([])
  })

  it('turno PASADO (el día de Cárdenas, cerrado): la carrera trae la curva de la noche de su jornada, de `cv`', () => {
    const liveDia = liveDe('2026-11-02T07:00:00.000Z', '2026-11-02T15:00:00.000Z')
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live: liveDia, piezas: 3980, cerrado: true, curvaHoy, rivalCurve: null,
      stats: [stat('2026-11-01_Turno Noche', { total: 10000 }, cvNoche)], forecast: [],
    })!
    expect(d.rival?.shiftDocId).toBe('2026-11-01_Turno Noche')
    expect(d.carrera?.fantasmaInfo?.tipo).toBe('jornada')
    expect(d.carrera?.fantasmaInfo?.shiftDocId).toBe('2026-11-01_Turno Noche')
    expect(d.carrera?.fantasmaInfo?.equipo).toBe('rebolledo')
    expect(d.carrera?.fantasmaInfo?.total).toBe(10000)
    expect(d.carrera?.fantasma?.length).toBe(5)
    // A los 20 min de producción: entre 800 (15 min) y 1.700 (30 min).
    expect(d.carrera?.fantasmaPz).toBeCloseTo(800 + (5 / 15) * 900, 5)
  })

  it('turno vigente: manda `rivalCurve` (más resolución) y `cv` queda de respaldo', () => {
    const stats = [stat('2026-11-01_Turno Noche', { total: 10000 }, cvNoche)]
    const base = { shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy, stats, forecast: [] as ForecastHistoryShift[] }
    expect(construirDuelo({ ...base, rivalCurve: nocheDeLaJornada })!.carrera?.fantasmaPz).toBe(3300)
    const respaldo = construirDuelo({ ...base, rivalCurve: null })!
    expect(respaldo.carrera?.fantasmaInfo?.tipo).toBe('jornada')
    expect(respaldo.carrera?.fantasma?.length).toBe(5)
  })

  it('noche PASADA con su día ya publicado: corre contra el día de su jornada', () => {
    // Noche del 1-nov 21:00 = jornada 2-nov, de Rebolledo; su día (2-nov, Cárdenas) ya cerró con curva.
    const liveNoche = liveDe('2026-11-01T21:00:00.000Z', '2026-11-02T05:00:00.000Z')
    const d = construirDuelo({
      shiftDocId: '2026-11-01_Turno Noche', live: liveNoche, piezas: 3980, cerrado: true, curvaHoy, rivalCurve: null,
      stats: [stat('2026-11-02_Turno Dia', { total: 12000 }, cvDia)], forecast: [],
    })!
    expect(d.hoy.jornada).toBe('2026-11-02')
    expect(d.abreJornada).toBe(true)
    expect(d.rival?.shiftDocId).toBe('2026-11-02_Turno Dia')
    expect(d.esperando).toBeNull()
    expect(d.carrera?.fantasmaInfo?.shiftDocId).toBe('2026-11-02_Turno Dia')
    expect(d.carrera?.fantasmaInfo?.equipo).toBe('cardenas')
    expect(d.carrera?.fantasmaInfo?.esNoche).toBe(false)
    expect(d.carrera?.bandaPropia).toBe(false)
    expect(d.carrera?.fantasmaPz).not.toBeNull()
  })

  it('noche pasada cuyo día aún no existe: queda esperando, sin fantasma', () => {
    const liveNoche = liveDe('2026-11-01T21:00:00.000Z', '2026-11-02T05:00:00.000Z')
    const d = construirDuelo({
      shiftDocId: '2026-11-01_Turno Noche', live: liveNoche, piezas: 3980, cerrado: true, curvaHoy, rivalCurve: null,
      stats: [stat('2026-10-26_Turno Dia', {}, cvDia)], forecast: [],
    })!
    expect(d.rival).toBeNull()
    expect(d.esperando).toBe('cardenas')
    expect(d.carrera?.fantasmaInfo).toBeNull()
  })

  it('día pasado sin noche en su jornada: sin rival ni fantasma', () => {
    const liveDia = liveDe('2026-11-02T07:00:00.000Z', '2026-11-02T15:00:00.000Z')
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live: liveDia, piezas: 3980, cerrado: true, curvaHoy, rivalCurve: null,
      stats: [stat('2026-10-26_Turno Noche', {}, cvNoche)], forecast: [],
    })!
    expect(d.rival).toBeNull()
    expect(d.carrera?.fantasmaInfo).toBeNull()
  })

  it('turno pasado cuyo rival no trae `cv` (aún no rearmado o sin curva): hay rival pero no fantasma', () => {
    const liveDia = liveDe('2026-11-02T07:00:00.000Z', '2026-11-02T15:00:00.000Z')
    for (const sinCurva of [{}, { cv: [], cvp: 15 }]) {
      const d = construirDuelo({
        shiftDocId: '2026-11-02_Turno Dia', live: liveDia, piezas: 3980, cerrado: true, curvaHoy, rivalCurve: null,
        stats: [stat('2026-11-01_Turno Noche', {}, sinCurva)], forecast: [],
      })!
      expect(d.rival?.shiftDocId).toBe('2026-11-01_Turno Noche')
      expect(d.carrera?.fantasmaInfo).toBeNull()
      expect(d.carrera?.fantasmaPz).toBeNull()
    }
    expect(fantasmaDeStat(resumen({ shiftDocId: '2026-11-01_Turno Noche' }), [stat('2026-11-01_Turno Noche')])).toBeNull()
  })

  it('la noche en curso abre la jornada: sin rival, sin fantasma, sin marcador y con su propia referencia', () => {
    const liveNoche = liveDe('2026-11-02T21:00:00.000Z', '2026-11-03T05:00:00.000Z')
    const diaPrevio = { ...nocheDeLaJornada, shiftDocId: '2026-11-02_Turno Dia', dateKey: '2026-11-02', shiftId: 'Turno Dia', h0: '07:20' }
    // Dos noches anteriores del mismo equipo (Rebolledo) con curva, para su promedio propio.
    const propias: ForecastHistoryShift[] = ['2026-10-05_Turno Noche', '2026-10-19_Turno Noche'].map((id) => ({
      shiftDocId: id, dateKey: id.slice(0, 10), curve: [{ m: 15, p: 500 }, { m: 30, p: 1000 }, { m: 60, p: 2200 }], total: 9000, producingMin: 400, micro: null,
    }))
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Noche', live: liveNoche, piezas: 3980, cerrado: false, curvaHoy,
      stats: [stat('2026-11-02_Turno Dia'), stat('2026-10-05_Turno Noche'), stat('2026-10-19_Turno Noche')], forecast: propias, rivalCurve: diaPrevio,
    })!
    // La noche del 2-nov es de la jornada del 3-nov y de la semana 2-nov: la hace Rebolledo; el día del 2-nov (otra jornada) NO es su rival.
    expect(d.hoy.jornada).toBe('2026-11-03')
    expect(d.hoy.equipo).toBe('rebolledo')
    expect(d.abreJornada).toBe(true)
    expect(d.rival).toBeNull()
    expect(d.marcador).toBeNull()
    expect(d.kpiAKpi).toEqual([])
    expect(d.carrera?.fantasmaInfo).toBeNull()
    expect(d.carrera?.fantasmaPz).toBeNull()
    expect(d.carrera?.diferencia).toBeNull()
    expect(d.semanaAnterior).toBeNull()
    expect(d.esperando).toBeNull()
    // Su referencia en gris es SU promedio de noche; el inicio del turno día viene del último día publicado.
    expect(d.carrera?.bandaPropia).toBe(true)
    expect(d.carrera?.banda?.turnos).toBe(2)
    expect(d.inicioDia).toBe('07:00')
    expect(d.ciclo.jugados).toEqual({ rebolledo: 0, cardenas: 0 })
  })

  it('la noche cerrada sin su día queda «esperando» al otro equipo y sin puntos', () => {
    const liveNoche = liveDe('2026-11-02T21:00:00.000Z', '2026-11-03T05:00:00.000Z')
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Noche', live: liveNoche, piezas: 9000, cerrado: true, curvaHoy,
      stats: [stat('2026-11-02_Turno Dia')], forecast: [],
    })!
    expect(d.esperando).toBe('cardenas')
    expect(d.rival).toBeNull()
    expect(d.marcador).toBeNull()
    expect(d.ciclo.puntos).toEqual({ rebolledo: 0, cardenas: 0 })
    expect(d.ciclo.jugados).toEqual({ rebolledo: 0, cardenas: 0 })
  })

  it('la noche cerrada con su día ya cerrado sí se compara y suma puntos', () => {
    const liveNoche = liveDe('2026-11-02T21:00:00.000Z', '2026-11-03T05:00:00.000Z')
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Noche', live: liveNoche, piezas: 11000, cerrado: true, curvaHoy,
      stats: [stat('2026-11-03_Turno Dia', { total: 9000, windowMin: 120, plannedMin: 0 })], forecast: [],
    })!
    expect(d.esperando).toBeNull()
    expect(d.rival?.shiftDocId).toBe('2026-11-03_Turno Dia')
    expect(d.marcador?.ganador).toBe('a')
    expect(d.ciclo.puntos.rebolledo).toBe(d.marcador?.puntosA)
  })

  it('un día sin noche en su jornada corre solo, con su propia referencia', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy, stats: [stat('2026-10-26_Turno Dia')], forecast,
    })!
    expect(d.rival).toBeNull()
    expect(d.marcador).toBeNull()
    expect(d.esperando).toBeNull()
    expect(d.carrera?.bandaPropia).toBe(true)
  })

  it('el total y el punto actual son el contador en vivo, no el último tramo de la curva', () => {
    // La curva llega a 3.980 pz en el minuto 20; el contador en vivo ya marca 4.500 y corresponde al minuto 25 de producción.
    const t0 = Date.parse('2026-11-02T07:10:00.000Z')
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 4500, ahoraMs: t0 + 25 * 60_000, cerrado: false, curvaHoy, stats: [], forecast: [],
    })!
    expect(d.hoy.piezas).toBe(4500)
    expect(d.carrera?.hoyPz).toBe(4500)
    expect(d.carrera?.hoy[d.carrera.hoy.length - 1]).toEqual({ minutes: 25, pieces: 4500 })
    expect(d.carrera?.minuto).toBe(25)
  })

  it('si el contador ya cuenta pero aún no hay ningún tramo con piezas, la carrera existe con ese total', () => {
    const vacia = { ...live, series: [] } as unknown as PublicMonitorLive
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live: vacia, piezas: 11, cerrado: false, curvaHoy: [], stats: [], forecast: [],
    })!
    expect(d.carrera?.hoyPz).toBe(11)
    expect(d.hoy.piezas).toBe(11)
  })

  it('las paradas de hoy se ubican en el eje de horas de producción (restando el arranque)', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy, stats: [], forecast: [],
    })!
    // Primera pieza a las 07:10 (arranque 10 min). La colación de 30 min parte a las 07:40 → minuto 30 de producción.
    expect(d.hoy.arranqueMin).toBe(10)
    const colacion = d.carrera!.eventosHoy.find((e) => e.corta === 'Colación')!
    expect(colacion).toMatchObject({ desde: 30, hasta: 60, programada: true })
    // La falta de MMPP de 2 min no llega a 5 min: no se marca.
    expect(d.carrera!.eventosHoy.some((e) => e.corta === 'Falta de MMPP')).toBe(false)
  })

  it('con una corrección manual el turno cambia de equipo, el aviso lo dice y no queda rival del mismo equipo', () => {
    const d = construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado: false, curvaHoy,
      stats: [stat('2026-10-26_Turno Dia'), stat('2026-11-01_Turno Noche')], forecast, overrides: { '2026-11-02_Turno Dia': 'rebolledo' },
      overridesMeta: { '2026-11-02_Turno Dia': { uid: 'u1', at: '2026-10-27T23:05:00.000Z' } },
    })!
    expect(d.hoy.equipo).toBe('rebolledo')
    expect(d.corregido).toBe(true)
    expect(d.correccion).toEqual({ uid: 'u1', at: '2026-10-27T23:05:00.000Z' })
    // Rebolledo contra Rebolledo no es un duelo: la noche del 1-nov también es de Rebolledo.
    expect(d.rival).toBeNull()
  })

  it('sin la hora de inicio del turno no se arma el duelo', () => {
    expect(construirDuelo({
      shiftDocId: '2026-11-02_Turno Dia', live: { ...live, scheduledStart: null } as PublicMonitorLive,
      piezas: 0, cerrado: false, curvaHoy: [], stats: [], forecast: [],
    })).toBeNull()
  })
})

describe('horas de producción transcurridas', () => {
  it('el minuto transcurrido cae en su hora: 0–59 = 1ª, 60–119 = 2ª', () => {
    expect(horaTranscurrida(0)).toBe(1)
    expect(horaTranscurrida(59.9)).toBe(1)
    expect(horaTranscurrida(60)).toBe(2)
    expect(horaTranscurrida(472)).toBe(8)
    expect(horaTranscurrida(-5)).toBe(1)
    expect(etiquetaHora(3)).toBe('3ª hora')
  })

  it('las bandas del eje: la última queda a medias y no se marca como completa', () => {
    const b = bandasDeHoras(150)
    expect(b.map((x) => [x.n, x.desde, x.hasta, x.completa])).toEqual([[1, 0, 60, true], [2, 60, 120, true], [3, 120, 150, false]])
    expect(bandasDeHoras(120).length).toBe(2)
    expect(bandasDeHoras(0)).toEqual([])
  })

  it('el reloj de cada equipo sale de su hora de inicio más el arranque, y da la vuelta a medianoche', () => {
    expect(minutoDelDia('21:00')).toBe(1260)
    expect(minutoDelDia('sin hora')).toBeNull()
    expect(relojDeMinuto(1260 + 10 + 3 * 60)).toBe('00:10') // 21:00 + 10 min de arranque + 3 h de producción
    expect(relojDeMinuto(440)).toBe('07:20')
  })

  it('el ritmo hora a hora sale de la curva acumulada: pz entre dos marcas ÷ minutos cubiertos', () => {
    const hoy = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 2400 }, { minutes: 120, pieces: 4200 }, { minutes: 150, pieces: 5100 }]
    const rival = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 2000 }, { minutes: 120, pieces: 4400 }, { minutes: 180, pieces: 6800 }]
    const h = ritmoHoraAHora(hoy, rival)
    expect(h.map((x) => x.hora)).toEqual([1, 2, 3])
    expect(h[0]).toMatchObject({ a: 40, b: 2000 / 60, parcialA: false, parcialB: false })
    expect(h[1]).toMatchObject({ a: 30, b: 40 })
    // La 3ª hora de hoy llegó a 150 min: 900 pz en 30 min = 30 pz/min, marcada como parcial.
    expect(h[2]).toMatchObject({ a: 30, parcialA: true, parcialB: false })
  })

  it('una hora con menos de 15 min cubiertos no se muestra, y una curva corta no inventa horas', () => {
    const hoy = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 2400 }, { minutes: 70, pieces: 2800 }]
    const h = ritmoHoraAHora(hoy, [])
    expect(h.map((x) => x.hora)).toEqual([1])
    expect(h[0]!.b).toBeNull()
    expect(ritmoHoraAHora([], [])).toEqual([])
  })
})

describe('paradas del turno sobre el eje de horas', () => {
  const crudos = [
    { n: 'COLACION', o: 240, d: 30, p: 1 as const },
    { n: 'FALTA MMPP', o: 100, d: 12 },
    { n: 'ATASCAMIENTO', o: 0, d: 8 }, // termina antes del arranque (minuto 8 < 10)
  ]

  it('se resta el arranque para pasar de «desde el inicio planificado» a «desde la primera pieza»', () => {
    const e = eventosEnEjeProduccion(crudos, 10)
    expect(e.map((x) => [x.corta, x.desde, x.hasta, x.programada])).toEqual([
      ['Falta de MMPP', 90, 102, false],
      ['Colación', 230, 260, true],
    ])
  })

  it('lo que terminó antes de la primera pieza se descarta y lo que la cruza se recorta en 0', () => {
    const e = eventosEnEjeProduccion([{ n: 'ATASCAMIENTO', o: 0, d: 8 }, { n: 'CAMBIO', o: 5, d: 20 }], 10)
    expect(e.map((x) => [x.causa, x.desde, x.hasta])).toEqual([['CAMBIO', 0, 15]])
  })

  it('sin el arranque no se adivina dónde caen', () => {
    expect(eventosEnEjeProduccion(crudos, null)).toEqual([])
    expect(eventosEnEjeProduccion(undefined, 10)).toEqual([])
  })

  it('nombre corto de la causa para el globo', () => {
    expect(causaCorta('COLACION')).toBe('Colación')
    expect(causaCorta('Colación 1')).toBe('Colación')
    expect(causaCorta('FALTA MMPP')).toBe('Falta de MMPP')
    expect(causaCorta('ATASCAMIENTO')).toBe('Atascamiento')
    expect(causaCorta('UNA CAUSA MUY LARGA QUE NO CABE EN EL GLOBO')).toHaveLength(26)
  })

  it('las paradas de hoy se unen entre máquinas por causa y solo quedan las de 5 min o más', () => {
    const live = {
      scheduledStart: '2026-11-02T07:00:00.000Z',
      stopReasons: ['FALTA MMPP', 'KNURO'],
      timeBreakdown: { planned: [], recoverable: [] },
      stopEvents: [
        { r: 0, f: '2026-11-02T08:00:00.000Z', s: 240, m: 0 },
        { r: 0, f: '2026-11-02T08:02:00.000Z', s: 240, m: 1 }, // se solapa con la anterior: una sola marca de 6 min
        { r: 0, f: '2026-11-02T10:00:00.000Z', s: 200, m: 0 }, // 3 min: no llega
        { r: 1, f: '2026-11-02T09:00:00.000Z', s: 600, m: 2 },
      ],
    } as unknown as PublicMonitorLive
    expect(eventosCrudosDeLive(live)).toEqual([
      { n: 'FALTA MMPP', o: 60, d: 6 },
      { n: 'KNURO', o: 120, d: 10 },
    ])
  })
})

describe('franja, KPI a KPI y tendencia semanal', () => {
  it('la franja cambia de color donde se cruzan las curvas', () => {
    const a = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 1000 }, { minutes: 120, pieces: 1600 }]
    const b = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 600 }, { minutes: 120, pieces: 2400 }]
    const t = franjasEntre(a, b, 120)
    expect(t.map((x) => x.adelante)).toEqual(['a', 'b'])
    // La diferencia pasa de +400 (min 60) a −800 (min 120): se cruzan en el minuto 80.
    const cruce = t[0]!.puntos[t[0]!.puntos.length - 1]!
    expect(cruce.m).toBeCloseTo(80, 0)
    expect(cruce.a).toBeCloseTo(cruce.b)
    expect(franjasEntre(a, [], 120)).toEqual([])
  })

  it('KPI a KPI: las barras arrancan en cero y el largo es proporcional al mayor', () => {
    const a = resumen({ piezas: 12500, ritmo: 31, microMinH: 1, arranqueMin: 5, ultimaHoraPz: 1600 })
    const b = resumen({ equipo: 'cardenas', piezas: 12000 })
    const filas = filasKpiAKpi(compararTurnos(a, b))
    expect(filas.map((f) => f.rotulo)).toEqual(['Piezas con Mantención sumada', 'Ritmo', 'Micro detención', 'Hasta la primera pieza', 'Piezas de la última hora'])
    expect(filas[0]).toMatchObject({ kpi: 'carrera', a: 12500, b: 12000, fa: 1, ganador: 'a', mejor: 'mayor' })
    expect(filas[0]!.fb).toBeCloseTo(0.96)
    expect(filas[2]).toMatchObject({ kpi: 'micro', mejor: 'menor', ganador: 'a' })
    expect(filas[2]!.fa).toBeCloseTo(0.5)
    expect(filasKpiAKpi(null)).toEqual([])
  })

  it('KPI a KPI: un dato que falta no es una barra de cero y un turno sin duelo no tiene filas', () => {
    const a = resumen({ ritmo: null })
    const filas = filasKpiAKpi(compararTurnos(a, resumen({ equipo: 'cardenas' })))
    expect(filas[1]).toMatchObject({ a: null, fa: 0, ganador: 'sin-dato' })
    expect(filasKpiAKpi(compararTurnos(resumen({ dispMin: 100 }), resumen({ equipo: 'cardenas' })))).toEqual([])
  })

  it('tendencia semanal: piezas por turno de cada equipo, por semana de producción y con su horario', () => {
    const rs = [
      resumenDeStat(stat('2026-10-26_Turno Dia', { total: 12000 }))!, // jornada 26-oct: Rebolledo, día
      resumenDeStat(stat('2026-10-27_Turno Dia', { total: 13000 }))!,
      resumenDeStat(stat('2026-10-26_Turno Noche', { total: 10000 }))!, // jornada 27-oct: Cárdenas, noche
      resumenDeStat(stat('2026-11-01_Turno Noche', { total: 11000 }))!, // jornada lunes 2-nov: semana nueva, Rebolledo
      resumenDeStat(stat('2026-11-03_Turno Dia', { total: 9000 }))!, // Cárdenas, día
    ]
    const t = tendenciaSemanal(rs)
    expect(t.map((s) => s.lunes)).toEqual(['2026-10-26', '2026-11-02'])
    expect(t[0]!.equipos.rebolledo).toEqual({ prom: 12500, turnos: 2, horario: 'dia' })
    expect(t[0]!.equipos.cardenas).toEqual({ prom: 10000, turnos: 1, horario: 'noche' })
    expect(t[1]!.equipos.rebolledo).toEqual({ prom: 11000, turnos: 1, horario: 'noche' })
    expect(t[1]!.equipos.cardenas).toEqual({ prom: 9000, turnos: 1, horario: 'dia' })
    expect(tendenciaSemanal([])).toEqual([])
  })
})

describe('el mismo horario de la semana anterior y el fantasma de la jornada', () => {
  const hoy = { shiftDocId: '2026-11-02_Turno Dia', dateKey: '2026-11-02', jornada: '2026-11-02', shiftId: 'Turno Dia', esNoche: false, equipo: 'cardenas' as const }
  const f = (id: string, base: number): ForecastHistoryShift => ({
    shiftDocId: id, dateKey: id.slice(0, 10), curve: [{ m: 15, p: base }, { m: 30, p: base * 2 }, { m: 60, p: base * 4 }], total: base * 40, producingMin: 400, micro: null,
  })

  it('el fantasma es el ÚLTIMO turno del rival en el mismo horario, y la banda promedia los anteriores', () => {
    const forecast = [f('2026-10-12_Turno Dia', 100), f('2026-10-19_Turno Dia', 999), f('2026-10-26_Turno Dia', 300)]
    const r = referenciaMismoHorario(hoy, forecast, [])
    // Rebolledo hizo el día del 26-oct y del 12-oct; el 19-oct lo hizo Cárdenas (no es su rival).
    expect(r.fantasma?.tipo).toBe('ultimo')
    expect(r.fantasma?.shiftDocId).toBe('2026-10-26_Turno Dia')
    expect(r.fantasma?.total).toBe(12000)
    expect(r.banda?.turnos).toBe(2)
    expect(rotuloFantasma(r.fantasma!, 'Rebolledo')).toBe('Rebolledo · día 26/10')
  })

  it('si el último turno del rival no trae curva todavía, el fantasma es el promedio y lo dice con su nombre', () => {
    const forecast = [f('2026-10-12_Turno Dia', 100), f('2026-09-28_Turno Dia', 300)]
    const stats = [stat('2026-10-26_Turno Dia')] // existe, pero su curva aún no está publicada
    const r = referenciaMismoHorario(hoy, forecast, stats)
    expect(r.fantasma?.tipo).toBe('promedio')
    expect(r.fantasma?.turnos).toBe(2)
    expect(rotuloFantasma(r.fantasma!, 'Rebolledo')).toBe('Rebolledo · promedio de 2 turnos')
  })

  it('sin turnos del rival no hay fantasma ni banda', () => {
    expect(referenciaMismoHorario(hoy, [f('2026-10-19_Turno Dia', 100)], [])).toEqual({ fantasma: null, banda: null })
  })

  it('el fantasma de la jornada trae reloj y paradas del rival, ya en el eje de producción', () => {
    const rc = {
      shiftDocId: '2026-11-01_Turno Noche', dateKey: '2026-11-01', shiftId: 'Turno Noche', h0: '21:00',
      curve: [{ m: 5, p: 800 }, { m: 10, p: 1700 }, { m: 15, p: 2500 }], total: 9000, producingMin: 400,
    }
    const st = stat('2026-11-01_Turno Noche', {}, { ini: 10, ev: [{ n: 'COLACION', o: 250, d: 30, p: 1 }] })
    const g = fantasmaDeJornada(hoy, rc, [st])!
    expect(g.tipo).toBe('jornada')
    expect(g.equipo).toBe('rebolledo')
    expect(g.inicioMin).toBe(21 * 60 + 10)
    expect(g.eventos).toEqual([{ causa: 'COLACION', corta: 'Colación', desde: 240, hasta: 270, programada: true }])
    // Un rival que es del mismo horario, o del mismo equipo, no es el de la jornada.
    expect(fantasmaDeJornada({ ...hoy, esNoche: true }, rc, [st])).toBeNull()
    expect(fantasmaDeJornada(hoy, rc, [st], { '2026-11-01_Turno Noche': 'cardenas' })).toBeNull()
    expect(fantasmaDeJornada(hoy, null, [])).toBeNull()
  })

  it('el día del 27/10 en curso contra «2026-10-26_Turno 1»: es la noche de la MISMA jornada, no un provisional', () => {
    const dia = { shiftDocId: '2026-10-27_Turno 2', dateKey: '2026-10-27', jornada: '2026-10-27', shiftId: 'Turno 2', esNoche: false, equipo: 'rebolledo' as const }
    // Sin importar la hora de inicio que publique la noche, su jornada es el 27/10.
    for (const h0 of ['21:00', '04:00']) {
      const rc = { shiftDocId: '2026-10-26_Turno 1', dateKey: '2026-10-26', shiftId: 'Turno 1', h0, curve: [{ m: 5, p: 800 }, { m: 10, p: 1700 }, { m: 15, p: 2500 }], total: 9000, producingMin: 400 }
      const g = fantasmaDeJornada(dia, rc, [])!
      expect(g.tipo).toBe('jornada')
      expect(g.jornada).toBe('2026-10-27')
      expect(rotuloFantasma(g, 'Cárdenas')).toBe('Cárdenas · noche 27/10')
    }
    // La noche que abre la jornada no tiene fantasma: el día de la jornada anterior NO se le pone enfrente.
    const nocheHoy = { shiftDocId: '2026-10-27_Turno 1', dateKey: '2026-10-27', jornada: '2026-10-28', shiftId: 'Turno 1', esNoche: true, equipo: 'cardenas' as const }
    const rcDia = { shiftDocId: '2026-10-27_Turno 2', dateKey: '2026-10-27', shiftId: 'Turno 2', h0: '07:20', curve: [{ m: 5, p: 800 }, { m: 10, p: 1700 }, { m: 15, p: 2500 }], total: 9000, producingMin: 400 }
    expect(fantasmaDeJornada(nocheHoy, rcDia, [])).toBeNull()
  })

  it('curvaConContador: el último punto llega a «ahora» con el total en vivo', () => {
    const curva = [{ minutes: 5, pieces: 100 }, { minutes: 10, pieces: 229 }]
    expect(curvaConContador(curva, 387, 14)).toEqual([...curva, { minutes: 14, pieces: 387 }])
    // Sin hora de «ahora» o en el mismo minuto, se corrige el último punto en vez de duplicar el eje.
    expect(curvaConContador(curva, 387)).toEqual([curva[0], { minutes: 10, pieces: 387 }])
    expect(curvaConContador(curva, 387, 10)).toEqual([curva[0], { minutes: 10, pieces: 387 }])
    // Un contador que va por detrás o en cero no recorta la curva.
    expect(curvaConContador(curva, 200, 14)).toEqual(curva)
    expect(curvaConContador(curva, 0, 14)).toEqual(curva)
    // Filete: el contador cuenta 11 pero aún no hay tramo con piezas.
    expect(curvaConContador([], 11, 3)).toEqual([{ minutes: 3, pieces: 11 }])
    expect(curvaConContador([], 0)).toEqual([])
  })

  it('referenciaPropia: promedio y rango del MISMO equipo en el mismo horario; sin turnos propios, nada', () => {
    const hoy = { shiftDocId: '2026-11-02_Turno Noche', dateKey: '2026-11-02', jornada: '2026-11-03', shiftId: 'Turno Noche', esNoche: true, equipo: 'rebolledo' as const }
    const f = (id: string, base: number): ForecastHistoryShift => ({ shiftDocId: id, dateKey: id.slice(0, 10), curve: [{ m: 15, p: base }, { m: 30, p: base * 2 }, { m: 60, p: base * 4 }], total: 1, producingMin: 1, micro: null })
    // Rebolledo hizo las noches del 5-oct y del 19-oct (semanas impares); la del 12-oct la hizo Cárdenas.
    const ref = referenciaPropia(hoy, [f('2026-10-05_Turno Noche', 100), f('2026-10-12_Turno Noche', 999), f('2026-10-19_Turno Noche', 300)], [])
    expect(ref?.turnos).toBe(2)
    expect(ref?.media[ref.media.length - 1]!.pieces).toBe(800)
    expect(referenciaPropia(hoy, [f('2026-10-19_Turno Noche', 300)], [])?.turnos).toBe(1)
    expect(referenciaPropia(hoy, [f('2026-10-12_Turno Noche', 999)], [])).toBeNull()
  })

  it('la corrección manual guarda quién y cuándo, y se muestra en hora de Chile', () => {
    expect(fechaCorreccion('2026-10-27T23:05:00.000Z')).toBe('27/10 20:05')
    expect(fechaCorreccion('basura')).toBeNull()
    expect(fechaCorreccion(undefined)).toBeNull()
  })
})

describe('marcador por semana y por mes', () => {
  const vispera = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const jornada = (dia: string, pzNoche: number, pzDia: number) => [
    resumenDeStat(stat(`${vispera(dia)}_Turno Noche`, { total: pzNoche }))!,
    resumenDeStat(stat(`${dia}_Turno Dia`, { total: pzDia }))!,
  ]

  it('semana 44: puntos, ganados, empatados, perdidos y piezas por turno de cada equipo', () => {
    const duelos = duelosDeTurnos([
      ...jornada('2026-10-27', 10000, 12000), // día (Rebolledo) gana
      ...jornada('2026-10-28', 10000, 12000), // día gana
      ...jornada('2026-10-29', 12000, 12000), // empate total
    ])
    const m = marcadorDePeriodo(duelos, 'semana', '2026-10-26', '2026-10-29')
    expect(m.etiqueta).toBe('Semana 44')
    expect(m.inicio).toBe('2026-10-26')
    expect(m.fin).toBe('2026-11-01')
    expect(m.vigente).toBe(true)
    expect(m.puntos).toEqual({ rebolledo: 4, cardenas: 0 })
    expect(m.ganados).toEqual({ rebolledo: 2, cardenas: 0 })
    expect(m.empatados).toEqual({ rebolledo: 1, cardenas: 1 })
    expect(m.perdidos).toEqual({ rebolledo: 0, cardenas: 2 })
    expect(m.turnos).toEqual({ rebolledo: 3, cardenas: 3 })
    expect(m.piezasProm.rebolledo).toBe(12000)
    expect(m.piezasProm.cardenas).toBeCloseTo(32000 / 3)
    expect(m.ganador).toBe('rebolledo')
  })

  it('una semana sin turnos no tiene ganador ni promedios inventados', () => {
    const m = marcadorDePeriodo([], 'semana', '2026-11-09', '2026-11-10')
    expect(m.ganador).toBeNull()
    expect(m.puntos).toEqual({ rebolledo: 0, cardenas: 0 })
    expect(m.piezasProm).toEqual({ rebolledo: null, cardenas: null })
  })

  it('empate de puntos: la jornada empatada reparte «empatados» y el período se declara empate', () => {
    const m = marcadorDePeriodo(duelosDeTurnos(jornada('2026-10-29', 12000, 12000)), 'semana', '2026-10-26', '2026-10-29')
    expect(m.ganador).toBe('empate')
    expect(m.empatados).toEqual({ rebolledo: 1, cardenas: 1 })
  })

  it('el mes es calendario y se cuenta por jornada: la noche del 31-oct es del 1-nov', () => {
    const duelos = duelosDeTurnos([
      ...jornada('2026-10-30', 10000, 12000), // 30-oct
      ...jornada('2026-11-01', 10000, 12000), // la noche parte el 31-oct a las 21:00: jornada del 1-nov
    ])
    const oct = marcadorDePeriodo(duelos, 'mes', '2026-10', '2026-11-01')
    const nov = marcadorDePeriodo(duelos, 'mes', '2026-11', '2026-11-01')
    expect(oct.etiqueta).toBe('octubre 2026')
    expect(oct.inicio).toBe('2026-10-01')
    expect(oct.fin).toBe('2026-10-31')
    expect(oct.turnos).toEqual({ rebolledo: 1, cardenas: 1 })
    expect(nov.turnos).toEqual({ rebolledo: 1, cardenas: 1 })
    expect(nov.vigente).toBe(true)
    expect(oct.vigente).toBe(false)
    // La semana del 26-oct cruza el cambio de mes: tiene las dos jornadas.
    expect(marcadorDePeriodo(duelos, 'semana', '2026-10-26', '2026-11-01').turnos).toEqual({ rebolledo: 2, cardenas: 2 })
  })

  it('febrero bisiesto y número de semana ISO en los bordes del año', () => {
    expect(marcadorDePeriodo([], 'mes', '2028-02', '2028-02-10').fin).toBe('2028-02-29')
    expect(marcadorDePeriodo([], 'mes', '2026-02', '2026-02-10').fin).toBe('2026-02-28')
    expect(semanaIso('2026-10-26')).toBe(44)
    expect(semanaIso('2026-12-28')).toBe(53)
    expect(semanaIso('2027-01-04')).toBe(1)
  })

  it('los períodos disponibles van del más nuevo al más viejo e incluyen siempre el de hoy', () => {
    const duelos = duelosDeTurnos(jornada('2026-10-27', 10000, 12000))
    expect(periodosDisponibles(duelos, '2026-11-10', 'semana')).toEqual(['2026-11-09', '2026-10-26'])
    expect(periodosDisponibles(duelos, '2026-11-10', 'mes')).toEqual(['2026-11', '2026-10'])
    expect(periodosDisponibles([], '2026-11-10', 'mes')).toEqual(['2026-11'])
  })
})
