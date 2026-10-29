/**
 * Una sola fuente de cifras para el Duelo (PC, celular y TV): puntaje firme/en juego, «hechas a la misma hora»,
 * arranque desde el inicio planificado, ventaja del ganador en la tabla de jornadas, micro detención y lo que pide la
 * carrera v6 (ventaja minuto a minuto, proyección, frase de empate, pines de detenciones y corte común).
 * Fixtures sintéticos chicos.
 */
import { describe, expect, it } from 'vitest'
import type { ForecastHistoryShift, PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import {
  compararTurnos, construirDuelo, corteDelDuelo, costoDeMantencionPeriodo, detencionesHastaElCorte, duelosDeTurnos, fraseDeEmpate, modoArranqueDe,
  pinesDeDetenciones, piezasALaMismaHora, proyeccionAlCierre, puntajeJornada, resumenDeStat, ritmoActualDeCurva, serieVentaja,
  type DatosDuelo, type EventoTurno, type ResumenTurno,
} from '../duelo'
import { arranqueDeTurno, curvaDeSerieMinuto, type SerieMinuto } from '../dueloSerie'
import {
  filasJornadas, filasRiel, filasSinRival, matrizMicro, microALaMismaHora, microDelEquipo, puntajeRiel, ventajaDelGanador, type MicroLado,
} from '../dueloDatosPC'

const resumen = (p: Partial<ResumenTurno>): ResumenTurno => ({
  shiftDocId: '2026-10-28_Turno Dia', dateKey: '2026-10-28', jornada: '2026-10-28', h0: '07:00', shiftId: 'Turno Dia', esNoche: false, equipo: 'rebolledo', cerrado: false,
  piezas: 12000, dispMin: 420, fallasN: 0, fallaMin: 0, piezasMant: 0, ritmo: 30, microMinH: 2, arranqueMin: 10, arranqueModo: 'primera-pieza', iniProdMin: 10,
  ultimaHoraPz: 1500, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 90 }], ...p,
})

// ── C1: el marcador es uno solo ──────────────────────────────────────────────

describe('puntajeJornada: firmes y en juego', () => {
  // A va adelante en carrera (a la misma hora), ritmo y micro; en arranque va mejor, pero el cierre aún no existe; en el puesto va atrás.
  const abierto = () => compararTurnos(
    resumen({ ritmo: 31, microMinH: 1, arranqueMin: 5, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 80 }] }),
    resumen({ equipo: 'cardenas', ritmo: 30, microMinH: 2, arranqueMin: 12, cerrado: true, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 95 }] }),
    { carreraEnVivo: { a: 5000, b: 4900 } },
  )

  it('con la jornada abierta, carrera, ritmo y micro son firmes; arranque y alimentación quedan en juego', () => {
    const m = abierto()
    const p = puntajeJornada(m)!
    expect(p.firmes).toEqual({ a: 3, b: 0 })
    expect(p.enJuego).toBe(2)
    expect(p.detalleEnJuego.map((x) => [x.indicador, x.quienVaAdelante])).toEqual([['arranque', 'a'], ['alimentacion', 'b']])
    expect(p.cerrada).toBe(false)
    // El marcador crudo suma los provisionales (3 – 1): justo la diferencia que antes mostraba el celular contra el PC.
    expect([m.puntosA, m.puntosB]).toEqual([3, 1])
  })

  it('PC y celular leen lo mismo: el riel solo pone los firmes del puntaje en Cárdenas y Rebolledo', () => {
    const m = abierto()
    const puntaje = puntajeJornada(m)
    const dRebolledo = { hoy: { equipo: 'rebolledo', cerrado: false }, puntaje } as unknown as DatosDuelo
    const dCardenas = { hoy: { equipo: 'cardenas', cerrado: false }, puntaje } as unknown as DatosDuelo
    expect(puntajeRiel(dRebolledo)).toMatchObject({ c: 0, r: 3, enJuego: 2, provisional: true })
    expect(puntajeRiel(dCardenas)).toMatchObject({ c: 3, r: 0, enJuego: 2, provisional: true })
    expect(puntajeRiel(dRebolledo)!.detalleEnJuego.map((x) => x.adelante)).toEqual(['r', 'c'])
  })

  it('con la jornada cerrada todo pasa a firme y no queda nada en juego', () => {
    const a = resumen({ cerrado: true, piezas: 12500, ritmo: 31, microMinH: 1, arranqueMin: 5, ultimaHoraPz: 1600, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 80 }] })
    const b = resumen({ equipo: 'cardenas', cerrado: true, ritmo: 30, microMinH: 2, arranqueMin: 12, ultimaHoraPz: 1500, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 95 }] })
    const m = compararTurnos(a, b)
    const p = puntajeJornada(m)!
    expect(p).toMatchObject({ firmes: { a: m.puntosA, b: m.puntosB }, enJuego: 0, cerrada: true })
    expect(p.firmes).toEqual({ a: 4, b: 1 })
  })

  it('un «sin duelo» no tiene puntaje', () => {
    const m = compararTurnos(resumen({ cerrado: true, dispMin: 100 }), resumen({ equipo: 'cardenas', cerrado: true, dispMin: 400 }))
    expect(m.sinDuelo).toBe(true)
    expect(puntajeJornada(m)).toBeNull()
  })
})

// ── C2: «a la misma hora» ────────────────────────────────────────────────────

describe('piezasALaMismaHora: un solo valor para todo', () => {
  const rival = [{ minutes: 15, pieces: 2500 }, { minutes: 20, pieces: 3300 }, { minutes: 70, pieces: 10000 }]

  it('interpola en el minuto de producción, redondea a piezas enteras y pasado el cierre da el total', () => {
    expect(piezasALaMismaHora(rival, 17)).toBe(2820)
    expect(piezasALaMismaHora(rival, 17.3)).toBe(2868)
    expect(piezasALaMismaHora(rival, 17.005)).toBe(2821) // 2820,8 → entero más cercano, no hacia abajo
    expect(piezasALaMismaHora(rival, 500)).toBe(10000)
    expect(piezasALaMismaHora([], 10)).toBeNull()
  })

  it('con la serie minuto a minuto real la cifra no depende del escalón de 5 o 15 min', () => {
    const s: SerieMinuto = { desde: '2026-10-28T07:00:00.000Z', maquinas: [{ id: 'm0', esperado: 20, cycles: [0, 0, 0, 10, 20, 20, 20, 20, 20, 20] }] }
    const fina = curvaDeSerieMinuto(s)
    // Primera pieza en el minuto 3; el origen es el inicio de su tramo de 5 min (07:00): al minuto 8 lleva 10 + 20 × 4 = 90.
    expect(piezasALaMismaHora(fina, 8)).toBe(90)
    expect(piezasALaMismaHora(fina, 4)).toBe(10)
  })

  describe('en el duelo completo', () => {
    const tras = (inicio: string, min: number) => new Date(Date.parse(inicio) + min * 60_000).toISOString()
    const inicio = '2026-11-02T07:00:00.000Z'
    const live = {
      scheduledStart: inicio, plannedEnd: '2026-11-02T15:00:00.000Z', totalPieces: 3100,
      series: [{ t: tras(inicio, 10), pieces: 1000 }, { t: tras(inicio, 15), pieces: 1000 }, { t: tras(inicio, 20), pieces: 1100 }],
      timeBreakdown: { producingMin: 100, windowMin: 120, plannedMin: 0, recoverableMin: 0, planned: [], recoverable: [] },
      mantencion: { porMaquina: [{ microMin: 2 }] },
      machines: [{ name: 'Evisceradora 1', pieces: 3100, targetCpm: 19, uptimeSec: 6000 }],
    } as unknown as PublicMonitorLive
    const curvaHoy = [{ minutes: 5, pieces: 1000 }, { minutes: 10, pieces: 2000 }, { minutes: 15, pieces: 3000 }]
    const rivalCurve = {
      shiftDocId: '2026-11-01_Turno Noche', dateKey: '2026-11-01', shiftId: 'Turno Noche', h0: '21:00',
      curve: [{ m: 5, p: 800 }, { m: 10, p: 1700 }, { m: 15, p: 2500 }, { m: 20, p: 3300 }, { m: 480, p: 10000 }], total: 10000, producingMin: 400,
    }
    const nocheStat = {
      shiftDocId: '2026-11-01_Turno Noche', dateKey: '2026-11-01', shiftId: 'Turno Noche', total: 10000, producingMin: 400, windowMin: 480, plannedMin: 60,
      duelo: { h0: '21:00', ini: 10, uh: 1500, mic: 30, alim: [{ n: 'Evisceradora 1', f: 85 }] },
    } as unknown as ShiftStat
    const forecast = [] as ForecastHistoryShift[]

    it('cabecera, indicador, marcador y ventaja salen de la misma cifra (ahora = minuto 17 de producción)', () => {
      const t0 = Date.parse(tras(inicio, 10))
      const d = construirDuelo({
        shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3100, ahoraMs: t0 + 17.3 * 60_000, cerrado: false, curvaHoy,
        stats: [nocheStat], forecast, rivalCurve,
      })!
      expect(d.carrera!.minuto).toBe(17)
      expect(d.carrera!.fantasmaPz).toBe(2820)
      expect(d.carrera!.diferencia).toBe(3100 - 2820)
      const carreraFila = d.marcador!.kpis.find((k) => k.id === 'carrera')!.filas[0]!
      expect(carreraFila.b).toBe(d.carrera!.fantasmaPz)
      const riel = filasRiel({ d, lados: { cardenas: null, rebolledo: null }, compacto: false }).find((f) => f.id === 'carrera')!
      expect([riel.c, riel.r].sort()).toEqual([3100, 2820].sort())
      const ultimo = d.carrera!.ventaja[d.carrera!.ventaja.length - 1]!
      expect(ultimo.minuto).toBe(17)
      expect(ultimo.ventaja).toBe(280)
      expect(ultimo.hechas[d.hoy.equipo]).toBe(3100)
      expect(ultimo.hechas[d.carrera!.rivalEquipo]).toBe(2820)
      expect(ultimo.lider).toBe(d.hoy.equipo)
    })
  })
})

describe('serieVentaja: la ventaja minuto a minuto de la carrera v6', () => {
  const a = { equipo: 'cardenas' as const, curva: [{ minutes: 10, pieces: 100 }, { minutes: 20, pieces: 300 }] }
  const b = { equipo: 'rebolledo' as const, curva: [{ minutes: 10, pieces: 150 }, { minutes: 20, pieces: 250 }] }

  it('dice quién lidera y por cuánto en cada minuto, y el cruce se ve', () => {
    const s = serieVentaja(a, b, 20, 5)
    expect(s.map((p) => p.minuto)).toEqual([0, 5, 10, 15, 20])
    expect(s[2]).toMatchObject({ minuto: 10, lider: 'rebolledo', ventaja: 50 })
    expect(s[3]).toMatchObject({ lider: null, ventaja: 0 }) // 200 y 200
    expect(s[4]).toMatchObject({ lider: 'cardenas', ventaja: 50 })
    expect(s.every((p) => p.ventaja >= 0)).toBe(true)
  })

  it('sin curva o con el mismo equipo no inventa nada', () => {
    expect(serieVentaja({ ...a, curva: [] }, b, 20)).toEqual([])
    expect(serieVentaja(a, { ...b, equipo: 'cardenas' }, 20)).toEqual([])
  })
})

// ── C3: micro detención ──────────────────────────────────────────────────────

describe('micro detención: minutos de las 3 Baader hasta la misma hora ÷ horas ÷ 3 máquinas', () => {
  it('fórmula: 3 + 0 min en 2 h con 3 Baader son 0,5 min por hora por máquina', () => {
    const f = microALaMismaHora([2, 1, 3], 120, 3)!
    expect(f.totalMin).toBe(3)
    expect(f.horas).toBe(2)
    expect(f.minPorHoraPorMaquina).toBeCloseTo(0.5, 5)
  })

  it('la hora a medias entra en proporción a lo transcurrido', () => {
    // 90 min: 1.ª hora entera (4) y media hora de la 2.ª (6 × 0,5) = 7 min en 1,5 h y 3 máquinas.
    const f = microALaMismaHora([4, 6], 90, 3)!
    expect(f.totalMin).toBe(7)
    expect(f.minPorHoraPorMaquina).toBeCloseTo(7 / 1.5 / 3, 5)
  })

  it('sin micro por hora o sin máquinas es «sin dato», no cero', () => {
    expect(microALaMismaHora(null, 120, 3)).toBeNull()
    expect(microALaMismaHora([1], 120, 0)).toBeNull()
    expect(microALaMismaHora([1], 0, 3)).toBeNull()
  })

  const micro: MicroLado = {
    h: [3, 1, 2], total: 6,
    m: [{ n: 'Baader 1', min: 1 }, { n: 'Baader 2', min: 3.5 }, { n: 'Baader 3', min: 1.5 }],
    hm: [[1, 0, 0], [1.5, 1, 1], [0.5, 0, 1]],
  }

  it('la matriz Baader × hora: minutos por celda, total por Baader y la Baader peor', () => {
    const mx = matrizMicro(micro)
    expect(mx.conCeldas).toBe(true)
    expect(mx.horas).toBe(3)
    expect(mx.maquinas.map((x) => x.celdas)).toEqual([[1, 0, 0], [1.5, 1, 1], [0.5, 0, 1]])
    expect(mx.baaderPeor).toEqual({ n: 'Baader 2', min: 3.5 })
    expect(mx.celdaPeor).toEqual({ n: 'Baader 2', hora: 1, min: 1.5 })
    expect(mx.totalPorHora).toEqual([3, 1, 2])
    expect(mx.totalTurno).toBe(6)
  })

  it('sin la matriz publicada: totales y Baader peor sí, celdas no (no reparte el total por hora entre máquinas)', () => {
    const mx = matrizMicro({ ...micro, hm: null })
    expect(mx.conCeldas).toBe(false)
    expect(mx.maquinas.every((x) => x.celdas.length === 0)).toBe(true)
    expect(mx.celdaPeor).toBeNull()
    expect(mx.baaderPeor?.n).toBe('Baader 2')
  })

  it('el equipo trae el total del turno, la cifra hasta la misma hora y la matriz de una sola fuente', () => {
    const e = microDelEquipo(micro, 120)
    expect(e.totalTurno).toBe(6)
    expect(e.nMaquinas).toBe(3)
    expect(e.minPorHoraPorMaquina).toBeCloseTo(4 / 2 / 3, 5)
    expect(e.matriz.baaderPeor?.n).toBe('Baader 2')
  })
})

// ── C4: arranque desde el inicio planificado ─────────────────────────────────

describe('arranque desde scheduledStart', () => {
  const inicioPlanMs = Date.parse('2026-10-28T07:00:00.000Z')
  /** Desde 06:00: la 1.ª hora es del turno anterior (la línea ya iba a ritmo); el nuevo parte a las 07:00. */
  const serie = (despues: number[], esperado: number | null = 10): SerieMinuto => ({
    desde: '2026-10-28T06:00:00.000Z',
    maquinas: [{ id: 'm0', esperado, cycles: [...Array(60).fill(10), ...despues] }],
  })

  it('Eviscerado: minutos hasta que la línea sostiene el 90 % del ritmo esperado; lo de antes del inicio no cuenta', () => {
    // 7 minutos detenida y desde el 8.º a 10 pz/min (el 100 %).
    const s = serie([...Array(7).fill(0), ...Array(20).fill(10)])
    expect(arranqueDeTurno({ modo: 'ritmo90', inicioPlanMs, serie: s })).toBe(7)
  })

  it('un minuto suelto no es arranque, y 9 pz/min (el 90 %) sostenido sí', () => {
    const suelto = serie([10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(arranqueDeTurno({ modo: 'ritmo90', inicioPlanMs, serie: suelto })).toBeNull()
    const noventa = serie([...Array(3).fill(2), ...Array(10).fill(9)])
    expect(arranqueDeTurno({ modo: 'ritmo90', inicioPlanMs, serie: noventa })).toBe(3)
  })

  it('Eviscerado sin esperado, sin serie o sin llegar al 90 % es «sin dato», no cero', () => {
    expect(arranqueDeTurno({ modo: 'ritmo90', inicioPlanMs, serie: serie([5, 5, 5, 5, 5, 5, 5, 5], null) })).toBeNull()
    expect(arranqueDeTurno({ modo: 'ritmo90', inicioPlanMs, serie: serie([5, 5, 5, 5, 5, 5, 5, 5]) })).toBeNull()
    expect(arranqueDeTurno({ modo: 'ritmo90', inicioPlanMs })).toBeNull()
  })

  it('Filete: minutos hasta la primera pieza TRAS el inicio planificado (las del turno anterior no cuentan)', () => {
    expect(arranqueDeTurno({ modo: 'primera-pieza', inicioPlanMs, serie: serie([0, 0, 0, 0, 3, 8]) })).toBe(4)
    expect(arranqueDeTurno({ modo: 'primera-pieza', inicioPlanMs, serie: serie([5, 8]) })).toBe(0)
  })

  it('Filete sin serie minuto a minuto usa los tramos de 5 min: el que termina antes del inicio es del turno anterior', () => {
    const tramos = [
      { t: '2026-10-28T06:55:00.000Z', pieces: 50 },
      { t: '2026-10-28T07:00:00.000Z', pieces: 0 },
      { t: '2026-10-28T07:05:00.000Z', pieces: 20 },
    ]
    expect(arranqueDeTurno({ modo: 'primera-pieza', inicioPlanMs, tramos })).toBe(5)
    expect(arranqueDeTurno({ modo: 'ritmo90', inicioPlanMs, tramos })).toBeNull()
  })

  it('el modo sale de la línea: carros (Baader 142, Eviscerado) mide al 90 %, silletas (Filete) la primera pieza', () => {
    expect(modoArranqueDe('carros')).toBe('ritmo90')
    expect(modoArranqueDe('silletas')).toBe('primera-pieza')
    expect(modoArranqueDe(null)).toBe('primera-pieza')
  })

  it('un turno cerrado lo mide desde su inicio planificado (dateKey + h0) con la serie archivada', () => {
    const stat = {
      shiftDocId: '2026-10-28_Turno Dia', dateKey: '2026-10-28', shiftId: 'Turno Dia', total: 9000, producingMin: 400,
      duelo: { h0: '07:00', ini: 0, uh: 1000, mic: 5, alim: [] },
    } as unknown as ShiftStat
    const r = resumenDeStat(stat, null, { modo: 'ritmo90', serie: serie([...Array(7).fill(0), ...Array(20).fill(10)]) })!
    expect(r.arranqueModo).toBe('ritmo90')
    expect(r.arranqueMin).toBe(7)
    expect(r.iniProdMin).toBe(0) // el eje de producción sigue partiendo de la primera pieza
    // Sin serie: Eviscerado queda sin dato; Filete cae a la primera pieza publicada (`ini`).
    expect(resumenDeStat(stat, null, { modo: 'ritmo90' })!.arranqueMin).toBeNull()
    expect(resumenDeStat(stat, null, { modo: 'primera-pieza' })!.arranqueMin).toBe(0)
  })
})

// ── C6: ventaja de la tabla de jornadas con el signo del ganador ─────────────

describe('filasJornadas: la ventaja va con el signo del ganador', () => {
  const dFilas = (nocheEq: 'cardenas' | 'rebolledo', pzNoche: number, pzDia: number, puntosNoche: Partial<ResumenTurno>, puntosDia: Partial<ResumenTurno>) => {
    const diaEq = nocheEq === 'cardenas' ? 'rebolledo' : 'cardenas'
    const noche = resumen({ shiftDocId: '2026-10-27_Turno Noche', dateKey: '2026-10-27', esNoche: true, h0: '21:00', equipo: nocheEq, cerrado: true, piezas: pzNoche, ...puntosNoche })
    const dia = resumen({ equipo: diaEq, cerrado: true, piezas: pzDia, ...puntosDia })
    const duelos = duelosDeTurnos([noche, dia])
    return { hoyKey: '2026-10-28', hoy: dia, rival: noche, esperando: null, duelos } as unknown as DatosDuelo
  }
  const gana = { ritmo: 40, microMinH: 0.5, arranqueMin: 1, ultimaHoraPz: 3000 }
  const pierde = { ritmo: 20, microMinH: 3, arranqueMin: 20, ultimaHoraPz: 100 }

  it('gana la noche con más piezas y gana el día con más piezas: ambas ventajas son positivas', () => {
    const n = filasJornadas(dFilas('cardenas', 15000, 14000, gana, pierde))[0]!
    expect(n).toMatchObject({ ganador: 'cardenas', dif: 1000, liderPiezas: 'cardenas' })
    const d = filasJornadas(dFilas('cardenas', 14000, 15000, pierde, gana))[0]!
    expect(d).toMatchObject({ ganador: 'rebolledo', dif: 1000, liderPiezas: 'rebolledo' })
  })

  it('el que gana por puntos con menos piezas queda en negativo, gane la noche o el día', () => {
    const n = filasJornadas(dFilas('cardenas', 13000, 14000, gana, pierde))[0]!
    expect(n).toMatchObject({ ganador: 'cardenas', dif: -1000, liderPiezas: 'rebolledo' })
    const d = filasJornadas(dFilas('cardenas', 14000, 13000, pierde, gana))[0]!
    expect(d).toMatchObject({ ganador: 'rebolledo', dif: -1000, liderPiezas: 'cardenas' })
  })

  it('ventajaDelGanador no depende de si el ganador fue la noche o el día', () => {
    expect(ventajaDelGanador(true, 500)).toBe(500)
    expect(ventajaDelGanador(false, -500)).toBe(500)
    expect(ventajaDelGanador(true, -200)).toBe(-200)
    expect(ventajaDelGanador(false, 200)).toBe(-200)
  })
})

// ── «Minutos a buen ritmo» ya no es indicador ────────────────────────────────

describe('minutos a buen ritmo: ni fila ni punto', () => {
  it('ni con rival ni corriendo solo aparece en el riel', () => {
    const m = compararTurnos(resumen({ cerrado: true }), resumen({ equipo: 'cardenas', cerrado: true }))
    const d = { hoy: resumen({ cerrado: true }), rival: resumen({ equipo: 'cardenas', cerrado: true }), marcador: m } as unknown as DatosDuelo
    expect(filasRiel({ d, lados: { cardenas: null, rebolledo: null }, compacto: false }).some((f) => f.id === 'sostenida')).toBe(false)
    expect(filasSinRival(d, null).some((f) => f.id === 'sostenida')).toBe(false)
  })
})

// ── C5: corte común ──────────────────────────────────────────────────────────

describe('corte de las detenciones y de «Por qué se perdió tiempo»', () => {
  it('en curso es el último tramo de 5 min cerrado y lo dice en el rótulo; cerrado es el turno completo', () => {
    const c = corteDelDuelo(false, 262.7)
    expect(c).toMatchObject({ hastaAhora: true, minuto: 260, hora: 5 })
    expect(c.etiqueta).toContain('hasta ahora')
    expect(c.etiqueta).toContain('260')
    expect(corteDelDuelo(true, 471)).toMatchObject({ hastaAhora: false, minuto: 471, hora: 8 })
  })

  const ev = (desde: number, hasta: number, causa = 'KNURO', programada = false): EventoTurno => ({ causa, corta: causa, desde, hasta, programada })

  it('las detenciones se recortan en el corte: la que lo cruza se corta y la que viene después no entra', () => {
    const c = corteDelDuelo(false, 100)
    const r = detencionesHastaElCorte([ev(10, 20), ev(95, 130), ev(100, 110)], c)
    expect(r.map((e) => [e.desde, e.hasta])).toEqual([[10, 20], [95, 100]])
    expect(detencionesHastaElCorte([ev(95, 130)], corteDelDuelo(true, 100))).toHaveLength(1)
  })

  it('los pines dicen desde qué minuto de producción, cuánto duró y si es falla técnica (Mantención)', () => {
    const pines = pinesDeDetenciones([ev(30, 45, 'KNURO'), ev(60, 90, 'COLACION', true), ev(100, 110, 'FALTA MMPP')])
    expect(pines[0]).toMatchObject({ desdeMin: 30, duracionMin: 15, fallaTecnica: true, dueno: 'mantencion' })
    expect(pines[1]).toMatchObject({ programada: true, fallaTecnica: false, dueno: 'prog' })
    expect(pines[2]).toMatchObject({ fallaTecnica: false, dueno: 'externo' })
  })
})

// ── Proyección y frase de empate ─────────────────────────────────────────────

describe('29-10: el Duelo dice lo mismo que El turno a la misma hora', () => {
  it('con la «Al cierre» de El turno, la proyección es ESA y el ritmo es el implícito', () => {
    const curva = [{ minutes: 0, pieces: 0 }, { minutes: 100, pieces: 3000 }]
    const p = proyeccionAlCierre({ equipo: 'rebolledo', curva, hechas: 3000, minuto: 100, finPrevistoMin: 280, cerrado: false, techo: 50, oficial: 8400 })
    expect(p.proyeccion).toBe(8400)
    expect(p.ritmoActual).toBeCloseTo((8400 - 3000) / 180, 5)
    expect(p.oficial).toBe(true)
    // Sin la oficial, la de siempre (30 min de curva).
    expect(proyeccionAlCierre({ equipo: 'rebolledo', curva, hechas: 3000, minuto: 100, finPrevistoMin: 280, cerrado: false, techo: 50 }).proyeccion).toBeCloseTo(3000 + 30 * 180, 3)
  })
  it('micro en vivo: el rival cerrado se mide hasta el mismo minuto, no con su turno entero', () => {
    const r = resumen({})
    const hoy = { ...r, cerrado: false, microMinH: 1.5 }
    const rival = { ...r, shiftDocId: '2026-10-28_Turno 1', equipo: 'cardenas' as const, cerrado: true, microMinH: 0.7 }
    // Noche real del 28-10: 15,2 min de micro en 8 h, pero 12,8 hasta el minuto 292 (4 h 52 min).
    const microNoche = [4, 0.8, 2.3, 4, 2, 1.3, 0.3, 0.5]
    const enVivo = { a: microALaMismaHora([5.8, 7.5, 2, 2.8, 2.8], 292, 3)!.minPorHoraPorMaquina, b: microALaMismaHora(microNoche, 292, 3)!.minPorHoraPorMaquina }
    const fila = compararTurnos(hoy, rival, { microEnVivo: enVivo }).kpis.find((k) => k.id === 'micro')!.filas[0]!
    expect(fila.b).toBeCloseTo((4 + 0.8 + 2.3 + 4 + 2 * 52 / 60) / (292 / 60) / 3, 5) // 0,9 y no 0,7
    expect(fila.a).toBeCloseTo(enVivo.a, 5)
    // Cerrado, manda el turno completo.
    expect(compararTurnos({ ...hoy, cerrado: true }, rival, { microEnVivo: enVivo }).kpis.find((k) => k.id === 'micro')!.filas[0]!.b).toBe(0.7)
  })
})

describe('proyección al cierre y frase de empate', () => {
  /** 30 pz/min constantes durante 100 min. */
  const curva = [{ minutes: 0, pieces: 0 }, { minutes: 50, pieces: 1500 }, { minutes: 100, pieces: 3000 }]

  it('ritmo actual de los últimos 30 min y proyección = hechas + ritmo × minutos que quedan', () => {
    expect(ritmoActualDeCurva(curva)).toBeCloseTo(30, 5)
    const p = proyeccionAlCierre({ equipo: 'cardenas', curva, hechas: 3000, minuto: 100, finPrevistoMin: 280, cerrado: false, techo: 42 })
    expect(p.minutosQueQuedan).toBe(180)
    expect(p.proyeccion).toBeCloseTo(3000 + 30 * 180, 3)
    const c = proyeccionAlCierre({ equipo: 'rebolledo', curva, hechas: 9000, minuto: 480, finPrevistoMin: 480, cerrado: true, techo: 42 })
    expect(c).toMatchObject({ proyeccion: 9000, minutosQueQuedan: 0, ritmoActual: null, cerrado: true })
  })

  it('el que va atrás necesita (meta del rival − hechas) ÷ minutos que quedan, contra su ritmo y su techo', () => {
    const hoy = proyeccionAlCierre({ equipo: 'cardenas', curva, hechas: 3000, minuto: 100, finPrevistoMin: 280, cerrado: false, techo: 42 })
    const rival = proyeccionAlCierre({ equipo: 'rebolledo', curva, hechas: 9000, minuto: 480, finPrevistoMin: 480, cerrado: true, techo: 42 })
    const f = fraseDeEmpate(hoy, rival)!
    expect(f.equipo).toBe('cardenas')
    expect(f.metaPz).toBe(9000)
    expect(f.necesitaPzMin).toBeCloseTo((9000 - 3000) / 180, 5) // 33,3 pz/min
    expect(f.ritmoActual).toBeCloseTo(30, 5)
    expect(f.alcanzable).toBe(true)
    const fuera = fraseDeEmpate({ ...hoy, techo: 32 }, rival)!
    expect(fuera.alcanzable).toBe(false)
  })

  it('sin con qué calcular, parejos o el que va atrás ya cerró, no hay frase', () => {
    const hoy = proyeccionAlCierre({ equipo: 'cardenas', curva, hechas: 3000, minuto: 100, finPrevistoMin: null, cerrado: false, techo: null })
    expect(hoy.proyeccion).toBeNull()
    const rival = proyeccionAlCierre({ equipo: 'rebolledo', curva, hechas: 9000, minuto: 480, finPrevistoMin: 480, cerrado: true, techo: null })
    expect(fraseDeEmpate(hoy, rival)).toBeNull()
    expect(fraseDeEmpate(rival, { ...rival, equipo: 'cardenas' })).toBeNull()
    const atrasCerrado = { ...rival, hechas: 5000, proyeccion: 5000 }
    expect(fraseDeEmpate(atrasCerrado, { ...rival, equipo: 'cardenas', hechas: 6000, proyeccion: 6000 })).toBeNull()
  })
})

// ── Costo de Mantención con el período a la vista ────────────────────────────

describe('costoDeMantencionPeriodo', () => {
  const t = (p: Partial<ResumenTurno>) => resumen({ cerrado: true, fallasN: 1, fallaMin: 30, piezasMant: 900, ...p })
  const todos = [
    t({ shiftDocId: 'a', jornada: '2026-10-28', equipo: 'rebolledo' }),
    t({ shiftDocId: 'b', jornada: '2026-10-28', equipo: 'cardenas', fallaMin: 10, piezasMant: 300 }),
    t({ shiftDocId: 'c', jornada: '2026-10-30', equipo: 'rebolledo', piezasMant: 100 }),
    t({ shiftDocId: 'd', jornada: '2026-11-10', equipo: 'rebolledo', piezasMant: 7000 }), // otro ciclo
  ]

  it('«hoy» es la jornada y «ciclo» las dos semanas: cada uno dice su período', () => {
    const hoy = costoDeMantencionPeriodo(todos, { jornada: '2026-10-28' }, 'hoy')
    expect(hoy.etiqueta).toBe('jornada 28/10')
    expect(hoy.equipos.rebolledo.piezasPerdidas).toBe(900)
    expect(hoy.equipos.cardenas.piezasPerdidas).toBe(300)
    const ciclo = costoDeMantencionPeriodo(todos, { jornada: '2026-10-28' }, 'ciclo')
    expect(ciclo.etiqueta).toBe('ciclo 26/10 al 08/11')
    expect(ciclo.equipos.rebolledo.piezasPerdidas).toBe(1000)
    expect(ciclo.equipos.rebolledo.turnos).toBe(2)
  })
})
