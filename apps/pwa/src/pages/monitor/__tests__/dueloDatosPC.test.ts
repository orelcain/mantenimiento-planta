/**
 * Duelo en PC (5b): minutos sostenidos a ≥ 90 %, ritmo y hora ganada, micro por hora y por máquina, «Por qué» en
 * minutos de LÍNEA, KPI a KPI con Cárdenas siempre a la izquierda, jornadas del mes y semana a semana.
 * Usa la taxonomía REAL (`duenoDe`): «KNURO» es de Mantención y «FALTA MMPP» es externa.
 */
import { describe, expect, it } from 'vitest'
import type { PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import { construirDuelo } from '../duelo'
import {
  arranqueEnSerie, causasDeLinea, causasDeLive, causasDeStat, construirLados, construirPorQue, duenoPQ, escalaSemanas, esperadoDeLinea, filasJornadas,
  filasRiel, horasDeCurva, horasGanadas, maxMinutosEje, microDeLive, microDeStat, periodosRiel, puntajeRiel, semanasPC, sinProgramadas,
  letraEquipo, microDeHoy, sostenidaDeSerie, sumaDeLinea, turnosDelPeriodo, type LadoEje, type SerieMinuto,
} from '../dueloDatosPC'

// ── Serie minuto a minuto ────────────────────────────────────────────────────

const serie = (cycles: number[][], esperados: Array<number | null> = [19, 16, 16], desde = '2026-10-27T07:12:00.000Z'): SerieMinuto => ({
  desde,
  maquinas: cycles.map((c, i) => ({ id: `m${i}`, esperado: esperados[i] ?? null, cycles: c })),
})

describe('minutos sostenidos a ≥ 90 % del esperado', () => {
  it('suma la línea minuto a minuto y su esperado; sin esperado en alguna máquina no hay esperado de línea', () => {
    const s = sumaDeLinea(serie([[10, 20], [10, 16], [10, 16]]))!
    expect(s.suma).toEqual([30, 52])
    expect(s.esperado).toBe(51)
    expect(sumaDeLinea(serie([[1], [1], [1]], [19, null, 16]))!.esperado).toBeNull()
    expect(sumaDeLinea(null)).toBeNull()
    expect(sumaDeLinea({ desde: 'x', maquinas: [] })).toBeNull()
  })

  it('el arranque salta un pico suelto seguido de más de 60 min de vacío (misma regla que el backend)', () => {
    const pico = [3, ...Array(70).fill(0), 40, 41]
    expect(arranqueEnSerie(pico)).toBe(71)
    expect(arranqueEnSerie([0, 0, 5, 0, 6])).toBe(2)
    expect(arranqueEnSerie([0, 0, 0])).toBe(-1)
  })

  it('cuenta los minutos de la línea con ≥ 90 % de 51 (45,9) y los ubica desde el tramo de 5 min de la primera pieza', () => {
    // 07:12 + 2 min = 07:14 es la primera pieza; el tramo de 5 min arranca a las 07:10, así que ese minuto es el 4.
    const s = sostenidaDeSerie(serie([[0, 0, 19, 19, 19, 5], [0, 0, 16, 16, 16, 5], [0, 0, 16, 16, 12, 5]]))!
    expect(s.esperado).toBe(51)
    expect(s.minutos).toEqual([4, 5, 6]) // 51, 51 y 47 pasan; 15 no
    const justo = sostenidaDeSerie(serie([[0, 19], [0, 14], [0, 13]]))! // 46 ≥ 45,9
    expect(justo.minutos.length).toBe(1)
    const fuera = sostenidaDeSerie(serie([[0, 19], [0, 14], [0, 12]]))! // 45 < 45,9
    expect(fuera.minutos).toEqual([])
  })

  it('sin serie, sin piezas o sin esperado no hay dato (no se inventa)', () => {
    expect(sostenidaDeSerie(null)).toBeNull()
    expect(sostenidaDeSerie(serie([[0, 0], [0, 0], [0, 0]]))).toBeNull()
    expect(sostenidaDeSerie(serie([[5, 5], [5, 5], [5, 5]], [19, null, 16]))).toBeNull()
  })
})

// ── Ritmo por hora y hora ganada ─────────────────────────────────────────────

const curva = (...pts: Array<[number, number]>) => pts.map(([minutes, pieces]) => ({ minutes, pieces }))

describe('ritmo por hora y hora ganada', () => {
  it('el ritmo de cada hora sale de las piezas entre dos marcas de la curva', () => {
    const h = horasDeCurva(curva([30, 900], [60, 1800], [120, 3000], [165, 3750]))
    expect(h.map((x) => x.v)).toEqual([30, 20, 750 / 45])
    expect(h.map((x) => x.parcial)).toEqual([false, false, true])
  })

  it('una hora con menos de 15 min cubiertos no se muestra (null)', () => {
    const h = horasDeCurva(curva([60, 1800], [66, 1900]))
    expect(h.length).toBe(1)
  })

  const lado = (horas: Array<[number | null, boolean?]>, enCurso = false) =>
    ({ horas: horas.map(([v, parcial]) => ({ v, parcial: parcial ?? false })), enCurso })

  it('gana la hora quien rinde más pz/min; las parejas son empate y no cuentan', () => {
    const g = horasGanadas(lado([[30], [20], [25], [10]]), lado([[28], [24], [25.02], [null]]))
    expect(g.horas.map((x) => x?.ganador ?? null)).toEqual(['cardenas', 'rebolledo', 'empate', null])
    expect(g.cardenas).toBe(1)
    expect(g.rebolledo).toBe(1)
  })

  it('la hora a medias de un turno en curso se muestra pero no cuenta', () => {
    const g = horasGanadas(lado([[30], [31, true]], true), lado([[20], [20]]))
    expect(g.horas[1]).toMatchObject({ ganador: 'cardenas', cuenta: false })
    expect(g.cardenas).toBe(1)
    // un turno CERRADO que terminó a media hora sí la cuenta
    expect(horasGanadas(lado([[30], [31, true]]), lado([[20], [20]])).cardenas).toBe(2)
  })
})

// ── Micro por hora y por máquina ─────────────────────────────────────────────

describe('micro detención por hora y por máquina', () => {
  it('del turno que se mira: microH y microMin por máquina de `mantencion`', () => {
    const m = microDeLive({ mantencion: { porMaquina: [{ name: 'Ev 1', microMin: 4.5 }, { name: 'Ev 2', microMin: 3 }], microH: [5, 2.5] } } as unknown as PublicMonitorLive)
    expect(m.h).toEqual([5, 2.5])
    expect(m.m).toEqual([{ n: 'Ev 1', min: 4.5 }, { n: 'Ev 2', min: 3 }])
    expect(m.total).toBe(7.5)
  })

  it('un doc anterior al micro por hora (sin microH) no inventa horas: queda null', () => {
    const m = microDeLive({ mantencion: { porMaquina: [{ name: 'Ev 1', microMin: 4 }] } } as unknown as PublicMonitorLive)
    expect(m.h).toBeNull()
    expect(m.total).toBe(4)
    expect(microDeLive({ mantencion: null } as unknown as PublicMonitorLive)).toEqual({ h: null, m: null, total: null })
  })

  it('de un turno cerrado: micH, micM con los nombres de los puestos, mic como total; `[]` es sin dato', () => {
    const st = { duelo: { mic: 7.5, alim: [{ n: 'Evisceradora 1' }, { n: 'Evisceradora 2' }], micH: [5, 2.5], micM: [4.5, 3] } } as unknown as ShiftStat
    expect(microDeStat(st)).toEqual({ h: [5, 2.5], m: [{ n: 'Evisceradora 1', min: 4.5 }, { n: 'Evisceradora 2', min: 3 }], total: 7.5 })
    expect(microDeStat({ duelo: { alim: [], micH: [], micM: [] } } as unknown as ShiftStat)).toEqual({ h: null, m: null, total: null })
    expect(microDeStat(undefined)).toEqual({ h: null, m: null, total: null })
  })
})

describe('micro del turno que se mira cuando su live es anterior al micro por hora', () => {
  it('toma de shiftStats lo que el live no trae, sin mezclar reglas dentro de un mismo dato', () => {
    const viejo = { mantencion: { porMaquina: [{ name: 'Ev 1', microMin: 4 }, { name: 'Ev 2', microMin: 3.5 }] } } as unknown as PublicMonitorLive
    const st = { duelo: { mic: 7.5, alim: [{ n: 'Evisceradora 1' }, { n: 'Evisceradora 2' }], micH: [5, 2.5], micM: [4, 3.5] } } as unknown as ShiftStat
    const m = microDeHoy(viejo, st)
    expect(m.h).toEqual([5, 2.5])
    expect(m.m).toEqual([{ n: 'Ev 1', min: 4 }, { n: 'Ev 2', min: 3.5 }]) // por máquina, del live
    expect(m.total).toBe(7.5)
    expect(microDeHoy(viejo, undefined).h).toBeNull()
    const nuevo = { mantencion: { porMaquina: [{ name: 'Ev 1', microMin: 1 }], microH: [1] } } as unknown as PublicMonitorLive
    expect(microDeHoy(nuevo, st).h).toEqual([1])
  })
})

// ── Por qué: minutos de línea por dueño ──────────────────────────────────────

describe('«Por qué» en minutos de LÍNEA, los mismos que «El turno»', () => {
  it('usa equivMin y, si no, lineMin; nunca los minutos de máquina', () => {
    const c = causasDeLinea([
      { reason: 'KNURO', min: 30, lineMin: 10, equivMin: 4 },
      { reason: 'FALTA MMPP', min: 12, lineMin: 12 },
    ])!
    expect(c).toEqual([{ causa: 'KNURO', min: 4 }, { causa: 'FALTA MMPP', min: 12 }])
  })

  it('un turno que aún no trae minutos de línea es «sin dato»: ni se escala ni se usan los minutos de máquina', () => {
    expect(causasDeLinea([{ reason: 'KNURO', min: 30, count: 2 }])).toBeNull()
    expect(causasDeLinea([{ reason: 'KNURO', min: 30, lineMin: 10 }, { reason: 'MMPP', min: 8 }])).toBeNull()
    expect(causasDeLinea(undefined)).toBeNull()
    expect(causasDeLinea([])).toEqual([])
  })

  it('cada causa va a su dueño; la micro detención es de operación', () => {
    expect(duenoPQ('KNURO')).toBe('mant')
    expect(duenoPQ('FALTA MMPP')).toBe('ext')
    expect(duenoPQ('Micro Detencion')).toBe('mic')
    expect(duenoPQ('DETENCION')).toBe('sin')
  })

  it('las programadas salen de las paradas con `p` de duelo.ev y solo cuentan dentro de las horas de producción', () => {
    const t = { shiftDocId: 'x', dateKey: '2026-10-27', shiftId: 'a', total: 1, producingMin: 1, recoverable: [], duelo: { alim: [], ini: 10, cv: [100, 200], cvp: 15, cvm: 28, ev: [{ n: 'COLACION', o: 20, d: 30, p: 1 }, { n: 'KNURO', o: 10, d: 8 }, { n: 'DETENCION PROGRAMADA', o: 30, d: 300, p: 1 }] } } as unknown as ShiftStat
    // La colación (min 10→40 del eje) se pasa del último minuto (28): cuentan 18; la del cierre empieza en el 20 → 8.
    expect(causasDeStat(t).programadas).toBe(18 + 8)
  })

  it('del turno que se mira: sus causas del timeBreakdown y las programadas de sus paradas ya ubicadas', () => {
    const live = { timeBreakdown: { producingMin: 300, windowMin: 400, plannedMin: 40, recoverableMin: 12, planned: [], recoverable: [{ reason: 'KNURO', min: 36, count: 2, lineMin: 12, equivMin: 12 }] } } as unknown as PublicMonitorLive
    const r = causasDeLive(live, [{ causa: 'COLACION', corta: 'Colación', desde: 100, hasta: 140, programada: true }, { causa: 'KNURO', corta: 'Knuro', desde: 10, hasta: 20, programada: false }], 120)
    expect(r.causas).toEqual([{ causa: 'KNURO', min: 12 }])
    expect(r.programadas).toBe(20)
  })
})

// ── Una jornada completa: noche de Cárdenas y día de Rebolledo ───────────────

const statDe = (id: string, over: Partial<ShiftStat> & { duelo?: Partial<NonNullable<ShiftStat['duelo']>> } = {}): ShiftStat => {
  const { duelo, ...resto } = over
  const noche = id.includes('Noche')
  return {
    shiftDocId: id, dateKey: id.slice(0, 10), shiftId: id.slice(11),
    total: noche ? 15000 : 13500, producingMin: 420, windowMin: 465, plannedMin: 45, recoverableMin: 14,
    recoverable: [
      { reason: 'KNURO', min: 30, count: 2, lineMin: 10, equivMin: 6 },
      { reason: 'FALTA MMPP', min: 8, count: 1, lineMin: 4, equivMin: 4 },
    ],
    porMaquina: [{ n: 'Ev 1', p: 5000 }, { n: 'Ev 2', p: 5000 }],
    duelo: {
      h0: noche ? '21:15' : '07:15', ini: 15, uh: noche ? 1900 : 1700, mic: 8, v90: noche ? 100 : 80,
      alim: [{ n: 'Evisceradora 1', f: noche ? 90 : 80 }, { n: 'Evisceradora 2', f: 85 }],
      ev: [{ n: 'COLACION', o: 40, d: 30, p: 1 }, { n: 'KNURO', o: 60, d: 8 }],
      cv: noche ? [1000, 2200, 3600, 5000] : [900, 2000, 3000, 4000], cvp: 15, cvm: noche ? 60 : 60,
      micH: [5, 3], micM: [4, 4], ...duelo,
    },
    ...resto,
  }
}

const NOCHE = '2026-10-26_Turno Noche'
const DIA = '2026-10-27_Turno Dia'

const liveDia = {
  scheduledStart: '2026-10-27T07:15:00.000Z', plannedEnd: '2026-10-27T15:00:00.000Z', totalPieces: 13500,
  series: [{ t: '2026-10-27T07:30:00.000Z', pieces: 900 }, { t: '2026-10-27T07:35:00.000Z', pieces: 1100 }, { t: '2026-10-27T07:40:00.000Z', pieces: 1000 }, { t: '2026-10-27T07:45:00.000Z', pieces: 1000 }, { t: '2026-10-27T14:30:00.000Z', pieces: 1700 }],
  timeBreakdown: { producingMin: 420, windowMin: 465, plannedMin: 45, recoverableMin: 14, planned: [], recoverable: [{ reason: 'KNURO', min: 30, count: 2, lineMin: 10, equivMin: 6 }, { reason: 'FALTA MMPP', min: 8, count: 1, lineMin: 4, equivMin: 4 }] },
  mantencion: { porMaquina: [{ name: 'Ev 1', microMin: 6 }, { name: 'Ev 2', microMin: 2 }], microH: [4, 4] },
  machines: [{ name: 'Evisceradora 1', pieces: 6750, targetCpm: 19, uptimeSec: 20000 }, { name: 'Evisceradora 2', pieces: 6750, targetCpm: 16, uptimeSec: 20000 }],
  stopReasons: ['KNURO'], stopEvents: [{ r: 0, f: '2026-10-27T08:00:00.000Z', s: 600, m: 0 }],
} as unknown as PublicMonitorLive

const jornadaCerrada = () => construirDuelo({
  shiftDocId: DIA, live: liveDia, piezas: 13500, cerrado: true,
  curvaHoy: [{ minutes: 15, pieces: 900 }, { minutes: 30, pieces: 2000 }, { minutes: 45, pieces: 3000 }, { minutes: 60, pieces: 4000 }],
  stats: [statDe(NOCHE), statDe(DIA)], forecast: [],
})!

describe('construirLados: Cárdenas arriba y Rebolledo abajo', () => {
  it('pone cada turno de la jornada en la casilla de su equipo, con su micro y sus minutos sostenidos', () => {
    const d = jornadaCerrada()
    expect(d.hoy.equipo).toBe('rebolledo')
    const l = construirLados({ d, nombres: {}, live: liveDia, stats: [statDe(NOCHE), statDe(DIA)], serieHoy: null, series: [] })
    expect(l.cardenas?.shiftDocId).toBe(NOCHE)
    expect(l.rebolledo?.shiftDocId).toBe(DIA)
    expect(l.rebolledo?.esHoy).toBe(true)
    expect(l.cardenas?.esHoy).toBe(false)
    expect(l.cardenas?.rotulo).toBe('Grupo 2 · noche 27/10')
    expect(l.cardenas?.v90).toBe(100)
    expect(l.rebolledo?.micro.h).toEqual([4, 4])
    expect(l.cardenas?.micro.h).toEqual([5, 3])
    expect(l.cardenas?.total).toBe(5000)
  })

  it('sin la serie minuto a minuto, la franja queda sin dato pero el número publicado se conserva', () => {
    const d = jornadaCerrada()
    const l = construirLados({ d, nombres: {}, live: liveDia, stats: [statDe(NOCHE), statDe(DIA)], serieHoy: null, series: [] })
    expect(l.cardenas?.sost).toBeNull()
    expect(l.cardenas?.v90).toBe(100)
    const nocheSinV90 = statDe(NOCHE)
    delete nocheSinV90.duelo!.v90
    const sinV90 = construirLados({ d, nombres: {}, live: liveDia, stats: [nocheSinV90, statDe(DIA)], serieHoy: null, series: [] })
    expect(sinV90.cardenas?.v90).toBeNull()
  })

  it('el eje llega a 8 h como mínimo y crece por hora hasta las 12', () => {
    expect(maxMinutosEje([{ finMin: 450 }, null])).toBe(480)
    expect(maxMinutosEje([{ finMin: 481 }, { finMin: 300 }])).toBe(540)
    expect(maxMinutosEje([{ finMin: 900 }])).toBe(720)
    expect(maxMinutosEje([{ finMin: 100 }], 500)).toBe(540)
  })

  it('esperado de la línea: de la serie y, si no hay, de las metas de las máquinas; sin ninguna, null', () => {
    expect(esperadoDeLinea(serie([[1], [1], [1]]), { machines: [] })).toBe(51)
    expect(esperadoDeLinea(null, liveDia)).toBe(35)
    expect(esperadoDeLinea(null, { machines: [{ targetCpm: null }] } as unknown as PublicMonitorLive)).toBeNull()
  })
})

describe('construirPorQue: jornada, semana y mes', () => {
  const stats = [statDe(NOCHE), statDe(DIA)]
  const entrada = (periodo: 'jornada' | 'semana' | 'mes') => ({ d: jornadaCerrada(), live: liveDia, stats, periodo })

  it('la jornada junta el turno que se mira (live) y su rival (stats), cada uno en su equipo', () => {
    const p = construirPorQue(entrada('jornada'))
    expect(p.causas.rebolledo!.min.mant).toBe(6) // equivMin de KNURO
    expect(p.causas.rebolledo!.min.ext).toBe(4)
    expect(p.causas.cardenas!.min.mant).toBe(6)
    expect(p.causas.cardenas!.min.prog).toBe(30)
    expect(sinProgramadas(p.causas.cardenas)).toBe(10)
    expect(p.causas.cardenas!.det.mant).toEqual([{ n: 'KNURO', min: 6 }])
  })

  it('el micro por Baader sale de micM (rival) y de la mantención del live (turno que se mira)', () => {
    const p = construirPorQue(entrada('jornada'))
    expect(p.micro.rebolledo).toEqual([{ n: 'Ev 1', min: 6 }, { n: 'Ev 2', min: 2 }])
    expect(p.micro.cardenas).toEqual([{ n: 'Evisceradora 1', min: 4 }, { n: 'Evisceradora 2', min: 4 }])
  })

  it('las piezas que Mantención quitó se muestran solo en la jornada', () => {
    expect(construirPorQue(entrada('jornada')).piezasMant.rebolledo).not.toBeNull()
    expect(construirPorQue(entrada('mes')).piezasMant.rebolledo).toBeNull()
  })

  it('semana y mes suman los turnos CERRADOS del periodo; un turno sin causas en minutos de línea cuenta como sin dato', () => {
    const turnos = turnosDelPeriodo(entrada('mes').d, 'mes')
    expect(turnos.map((t) => t.shiftDocId).sort()).toEqual([NOCHE, DIA].sort())
    const sinLinea = [statDe(NOCHE, { recoverable: [{ reason: 'KNURO', min: 30, count: 2 }], recoverableMin: undefined, total: 15000 }), statDe(DIA)]
    const p = construirPorQue({ ...entrada('mes'), stats: sinLinea })
    expect(p.causas.cardenas!.sinDato).toBe(1)
    expect(p.causas.cardenas!.min.mant).toBe(0)
  })

  it('el rival que no está en shiftStats no se inventa: ese lado queda sin causas', () => {
    const p = construirPorQue({ ...entrada('jornada'), stats: [statDe(DIA)] })
    expect(p.causas.cardenas).toBeNull()
  })
})

describe('riel: KPI a KPI, marcador, periodos y jornadas', () => {
  const d = jornadaCerrada()
  const lados = construirLados({ d, nombres: {}, live: liveDia, stats: [statDe(NOCHE), statDe(DIA)], serieHoy: null, series: [] })

  it('Cárdenas siempre a la izquierda, aunque el turno que se mira sea de Rebolledo', () => {
    const filas = filasRiel({ d, lados, compacto: false, unidad: 'carros' })
    const car = filas.find((f) => f.id === 'carrera')!
    expect(car.c).toBeGreaterThan(car.r!) // la noche de Cárdenas (15.000) contra el día de Rebolledo (13.500)
    expect(car.gan).toBe('c')
    const ar = filas.find((f) => f.id === 'arranque')!
    expect(ar.cTxt).toBe('15 · 1.900')
    expect(ar.rTxt).toBe('15 · 1.700')
    expect(filas.find((f) => f.id === 'alim-evisceradora 1')?.sub).toContain('carros')
    expect(filas[filas.length - 1]).toMatchObject({ id: 'sostenida', c: 100, r: 80, gan: 'info' })
  })

  it('en pantalla angosta las alimentaciones se juntan en una fila de puntos', () => {
    const ancho = filasRiel({ d, lados, compacto: false })
    const corto = filasRiel({ d, lados, compacto: true })
    expect(ancho.filter((f) => f.id.startsWith('alim')).length).toBe(2)
    expect(corto.filter((f) => f.id.startsWith('alim')).length).toBe(1)
    expect(corto.find((f) => f.id === 'alim')!.cTxt).toMatch(/pt$/)
  })

  it('el marcador cerrado es el oficial (con Cárdenas a la izquierda) y el de un turno en curso es provisional', () => {
    const filas = filasRiel({ d, lados, compacto: false })
    const p = puntajeRiel(d, filas)!
    expect(p.provisional).toBe(false)
    expect(p.c + p.r).toBeGreaterThan(0)
    expect(p.c).toBe(d.hoy.equipo === 'cardenas' ? d.marcador!.puntosA : d.marcador!.puntosB)
    const enCurso = puntajeRiel({ ...d, hoy: { ...d.hoy, cerrado: false } }, filas.map((f) => (f.id.startsWith('alim') ? { ...f, gan: 'pend' as const } : f)))!
    expect(enCurso.provisional).toBe(true)
    expect(enCurso.pendientes).toBe(2)
  })

  it('semana y mes: jornadas ganadas y puntos por equipo; el mes lleva su nombre', () => {
    const p = periodosRiel(d)
    expect(p.mes.etiqueta).toBe('Octubre')
    expect(p.semana.etiqueta).toMatch(/^Semana \d+$/)
    expect(p.mes.jc + p.mes.jr).toBeGreaterThan(0)
  })

  it('las jornadas del mes traen la noche, el día, los puntos y la diferencia a favor del ganador', () => {
    const f = filasJornadas(d)
    expect(f[0]).toMatchObject({ jornada: '2026-10-27', ganador: 'cardenas', vivo: null })
    expect(f[0]!.noche).toEqual({ eq: 'cardenas', pz: 15000 })
    expect(f[0]!.dia).toEqual({ eq: 'rebolledo', pz: 13500 })
    expect(f[0]!.dif).toBe(1500)
    expect(f[0]!.puntos!.c + f[0]!.puntos!.r).toBeGreaterThan(0)
  })

  it('una jornada en curso abre la tabla con «por jugar» donde falta el rival', () => {
    const enVivo = construirDuelo({
      shiftDocId: '2026-10-27_Turno Noche', live: { ...liveDia, scheduledStart: '2026-10-27T21:15:00.000Z', plannedEnd: '2026-10-28T05:00:00.000Z' } as PublicMonitorLive, piezas: 3000, cerrado: false,
      curvaHoy: [{ minutes: 15, pieces: 900 }, { minutes: 30, pieces: 2000 }], stats: [statDe(NOCHE), statDe(DIA)], forecast: [],
    })!
    const f = filasJornadas(enVivo)
    expect(f[0]).toMatchObject({ vivo: 'noche en curso', dia: null, ganador: null })
    expect(f[0]!.noche?.pz).toBe(3000)
  })

  it('semana a semana: las últimas semanas con sus jornadas ganadas, y la escala parte en miles y nunca en cero falso', () => {
    const s = semanasPC(d)
    expect(s.length).toBeGreaterThan(0)
    expect(s[0]!.etiqueta).toMatch(/^S\d+ · \d\d\/\d\d$/)
    const { lo, hi } = escalaSemanas(s)
    expect(hi - lo).toBeGreaterThanOrEqual(3000)
    expect(lo % 1000).toBe(0)
    const prom = s.flatMap((x) => [x.cardenas?.prom, x.rebolledo?.prom]).filter((v): v is number => v != null)
    expect(Math.min(...prom)).toBeGreaterThan(lo)
    expect(Math.max(...prom)).toBeLessThan(hi)
    expect(escalaSemanas([])).toEqual({ lo: 0, hi: 1000 })
  })
})

describe('la letra que identifica a cada equipo', () => {
  it('con apellidos es la inicial; con «Grupo» es G1 / G2 (una letra suelta no diría de quién habla)', () => {
    expect(letraEquipo('cardenas', { cardenas: 'Cristian Cárdenas', rebolledo: 'Francisco Rebolledo' })).toBe('C')
    expect(letraEquipo('rebolledo', { cardenas: 'Cristian Cárdenas', rebolledo: 'Francisco Rebolledo' })).toBe('R')
    expect(letraEquipo('cardenas', {})).toBe('G2')
    expect(letraEquipo('rebolledo', {})).toBe('G1')
  })
})

describe('LadoEje es lo que el lienzo pinta', () => {
  it('trae las horas de ritmo de su curva y la raya de su total', () => {
    const d = jornadaCerrada()
    const l = construirLados({ d, nombres: {}, live: liveDia, stats: [statDe(NOCHE), statDe(DIA)], serieHoy: null, series: [] })
    const c = l.cardenas as LadoEje
    expect(c.finMin).toBe(60)
    expect(c.horas.length).toBe(1)
    expect(c.horas[0]!.v).toBeCloseTo(5000 / 60, 5)
  })
})
