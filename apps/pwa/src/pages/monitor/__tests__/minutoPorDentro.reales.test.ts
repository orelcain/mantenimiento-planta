/**
 * «El minuto por dentro» con los casos REALES del 02-11-2026 (Chonchi Turno 2 y Filete Turno Día, los docs de `fixtures/`): tramosDelMinuto,
 * andandoDelMinuto, faltaronDelMinuto, duracionExacta, el piso al segundo y los 5 episodios de detención de la columna derecha.
 * Cada cifra sale del doc; los valores esperados son los que el monitor muestra (revisados contra la serie y las paradas del doc a mano).
 */
import { describe, expect, it } from 'vitest'
import { agruparEventos } from '@/services/shoplogix/monitorEventos'
import {
  andandoDelMinuto, andandoSegundos, duracionExacta, episodiosParada, esParadaMicro, faltaronDelMinuto, filasBaader, minutosConParada, paradasEnEje, relojConSegundos, ritmoAndando, tramosDelMinuto,
} from '../ejeTurno'
import { lecturaDelMinuto, type BaaderMinuto } from '../minutoPorDentro'
import { clasificarMicros } from '../microCausa'
import { paradasDetalle } from '../ritmoVivo'
import { CHONCHI_0211_T2, FILETE_0211_DIA, entradaDeDoc, type DocMicro } from './microFixtures'

const HH = (hhmm: string, desde: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(desde)
  return (h! * 60 + m!) - (d.getUTCHours() * 60 + d.getUTCMinutes())
}

/** Lo que la página arma para el globo del minuto `hhmm`: lo mismo que `lecturaDeMinuto` del gráfico, desde el doc. */
function lecturaDeDoc(doc: DocMicro, hhmm: string) {
  const entrada = entradaDeDoc(doc)
  const paradas = paradasDetalle({ stopEvents: entrada.stopEvents, stopReasons: entrada.stopReasons, stopMachines: entrada.stopMachines, enCurso: [] })
  const desde = doc.pulse.serieMinuto.desde
  const k = HH(hhmm, desde)
  const n = doc.pulse.serieMinuto.maquinas[0]!.cycles.length
  const filas = filasBaader({ desde, maquinas: entrada.serie!.maquinas.map((m) => ({ ...m })) }, n, { stopEvents: entrada.stopEvents, stopReasons: entrada.stopReasons, stopMachines: entrada.stopMachines, enCurso: [] })
  const iniMs = Date.parse(desde) + k * 60_000
  const baaders: BaaderMinuto[] = entrada.serie!.maquinas.map((q, i) => {
    const tramos = tramosDelMinuto(paradas.get(q.id), iniMs)
    const andandoS = andandoSegundos(tramos)
    const piezas = q.cycles[k]!
    const llenado = filas[i]!.llenados[k] ?? null
    return { id: q.id, nombre: `Ev ${i + 1}`, esperado: q.esperado, piezas, tono: filas[i]!.celdas[k]!.tono, tramos, andandoS, ritmo: ritmoAndando(piezas, andandoS, llenado) }
  })
  return lecturaDelMinuto({ iniMs, baaders, micros: clasificarMicros(entrada) })
}

describe('piso al segundo de las paradas (una sola regla)', () => {
  it('el inicio se baja al segundo y el fin es el inicio más la duración: el fin de la colación del Filete cae en 14:16:29, no en 14:16:29,949', () => {
    const entrada = entradaDeDoc(FILETE_0211_DIA)
    const p = paradasDetalle({ stopEvents: entrada.stopEvents, stopReasons: entrada.stopReasons, stopMachines: entrada.stopMachines, enCurso: [] })
    const colacion = [...p.values()][0]!.find((x) => x.tipo === 'programada' && x.razon === 'COLACION' && x.durS === 597)!
    expect(relojConSegundos(colacion.finMs)).toBe('14:16:29')
    /* El doc la guarda con milisegundos (13:21:32,949 + 2.700 s + 597 s) y las dos colaciones del Filete van pegadas. */
    expect(colacion.inicioCrudoMs % 1000).toBe(949)
    expect(colacion.iniMs % 1000).toBe(0)
    expect(colacion.finMs - colacion.iniMs).toBe(colacion.durS * 1000)
  })
  it('clasifica cada parada: micro, programada (por su motivo) y detención', () => {
    const entrada = entradaDeDoc(CHONCHI_0211_T2)
    const todas = [...paradasDetalle({ stopEvents: entrada.stopEvents, stopReasons: entrada.stopReasons, stopMachines: entrada.stopMachines, enCurso: [] }).values()].flat()
    const porRazon = (tipo: string) => [...new Set(todas.filter((x) => x.tipo === tipo).map((x) => x.razon))].sort()
    expect(porRazon('micro')).toEqual(['Micro Detencion'])
    expect(porRazon('programada')).toEqual(['COLACION', 'DETENCION PROGRAMADA', 'EJERCICIO COMPENSATORIO - Paro', 'REUNION INICIO TURNO'])
    expect(porRazon('detencion')).toEqual(['ACUMULACION RECHAZO', 'Detencion'])
  })
  it('una parada en curso es una detención abierta, sin fin ni motivo', () => {
    const p = paradasDetalle({ stopEvents: [], stopReasons: [], stopMachines: [], enCurso: [{ id: 'a', desdeMs: Date.UTC(2026, 10, 2, 15, 13, 0, 400) }] })
    expect(p.get('a')).toEqual([expect.objectContaining({ tipo: 'detencion', abierta: true, razon: null, iniMs: Date.UTC(2026, 10, 2, 15, 13, 0), finMs: Number.POSITIVE_INFINITY })])
  })
})

describe('duracionExacta', () => {
  it('«45 s», «1 min», «2 min 15 s», «1 h 2 min 5 s»', () => {
    expect(duracionExacta(45)).toBe('45 s')
    expect(duracionExacta(60)).toBe('1 min')
    expect(duracionExacta(135)).toBe('2 min 15 s')
    expect(duracionExacta(150)).toBe('2 min 30 s')
    expect(duracionExacta(3725)).toBe('1 h 2 min 5 s')
    expect(duracionExacta(0)).toBe('0 s')
  })
})

describe('tramosDelMinuto y andandoDelMinuto', () => {
  const ev = (hhmm: string, nombre: number) => {
    const entrada = entradaDeDoc(CHONCHI_0211_T2)
    const p = paradasDetalle({ stopEvents: entrada.stopEvents, stopReasons: entrada.stopReasons, stopMachines: entrada.stopMachines, enCurso: [] })
    const id = entrada.serie!.maquinas[nombre - 1]!.id
    const iniMs = Date.parse(entrada.serie!.desde) + HH(hhmm, entrada.serie!.desde) * 60_000
    return tramosDelMinuto(p.get(id), iniMs)
  }
  it('15:10, Ev 1: una micro de 45 s desde :00 → andando 15 s', () => {
    const t = ev('15:10', 1)
    expect(t.map((x) => [x.tipo, x.desdeS, x.hastaS])).toEqual([['micro', 0, 45]])
    expect(andandoDelMinuto(t)).toEqual([[45, 60]])
    expect(andandoSegundos(t)).toBe(15)
  })
  it('15:13, Ev 3: una detención de 2 min 15 s desde :00 → 0 s andando; en 15:14 sigue (todo el minuto) y en 15:15 queda 45 s andando', () => {
    expect(andandoSegundos(ev('15:13', 3))).toBe(0)
    expect(ev('15:14', 3).map((x) => [x.tipo, x.desdeS, x.hastaS])).toEqual([['detencion', 0, 60]])
    const t = ev('15:15', 3)
    expect(t.map((x) => [x.tipo, x.desdeS, x.hastaS])).toEqual([['detencion', 0, 15]])
    expect(andandoSegundos(t)).toBe(45)
  })
  it('una parada que cruza minutos conserva su inicio y su duración exactos en cada tramo', () => {
    const t = ev('15:14', 3)[0]!
    expect(relojConSegundos(t.parada.iniMs)).toBe('15:13:00')
    expect(relojConSegundos(t.parada.finMs)).toBe('15:15:15')
    expect(t.parada.durS).toBe(135)
  })
  it('sin paradas anda los 60 s', () => {
    expect(andandoDelMinuto([])).toEqual([[0, 60]])
    expect(tramosDelMinuto(undefined, 0)).toEqual([])
  })
})

describe('el globo del minuto · casos reales', () => {
  it('Chonchi 15:10: Ev 1 anduvo 15 s sin ritmo medible; Ev 2 anduvo 30 s a 10 pz/min (63 %, ámbar)', () => {
    const L = lecturaDeDoc(CHONCHI_0211_T2, '15:10')
    const [e1, e2] = L.filas
    expect(e1).toMatchObject({ nombre: 'Ev 1', andandoS: 15, ritmo: null, estado: 'poco' })
    expect(e2).toMatchObject({ nombre: 'Ev 2', andandoS: 30, ritmo: 10, pct: 63, tono: 'atento', estado: 'ritmo' })
    /* La micro de Ev 1 y la de Ev 2 salen cada una con su hora y su duración exactas. */
    expect(L.micros.map((m) => [m.baader, m.desde, m.hasta, m.durS])).toEqual([['Ev 1', '15:10:00', '15:10:45', 45], ['Ev 2', '15:10:00', '15:10:30', 30]])
  })
  it('Chonchi 15:13: faltaron 36 = 16 por detención + 8,5 por micro + 11,5 por ritmo; las micro de Ev 1 y Ev 2 (15 s) y la detención de Ev 3 (2 min 15 s) van cada una por separado', () => {
    const L = lecturaDeDoc(CHONCHI_0211_T2, '15:13')
    expect(L.piezas).toBe(14)
    expect(L.esperadoBruto).toBe(50)
    expect(L.faltaron).toMatchObject({ esperado: 50, piezas: 14, faltaron: 36, detencion: 16, micro: 8.5, ritmo: 11.5 })
    const [e1, e2, e3] = L.filas
    expect(e1).toMatchObject({ andandoS: 45, pct: 52, tono: 'atento' })
    expect(e1!.ritmo).toBeCloseTo(9.33, 2)
    expect(e2).toMatchObject({ andandoS: 45, pct: 58 })
    expect(e2!.ritmo).toBeCloseTo(9.33, 2)
    expect(e3).toMatchObject({ andandoS: 0, estado: 'detenida' })
    expect(L.detenciones.map((d) => [d.baader, d.desde, d.hasta, d.durS, d.dueno])).toEqual([['Ev 3', '15:13:00', '15:15:15', 135, 'sin-imputar']])
    expect(L.micros.map((m) => [m.baader, m.desde, m.hasta, m.durS, m.causa])).toEqual([['Ev 1', '15:13:00', '15:13:15', 15, 'linea'], ['Ev 2', '15:13:00', '15:13:15', 15, 'linea']])
    expect(L.mismoSegundo).toBe('Las 3 pararon en el mismo segundo: 15:13:00')
  })
  it('las tres partes suman lo que faltó, exacto y con un decimal, en cada minuto de los dos turnos', () => {
    for (const [doc, ini, fin] of [[CHONCHI_0211_T2, '09:20', '15:24'], [FILETE_0211_DIA, '09:40', '15:20']] as const) {
      const [h0, m0] = ini.split(':').map(Number)
      const [h1, m1] = fin.split(':').map(Number)
      for (let t = h0! * 60 + m0!; t < h1! * 60 + m1!; t++) {
        const hhmm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
        const F = lecturaDeDoc(doc, hhmm).faltaron!
        expect(Math.round((F.detencion + F.micro + F.ritmo) * 10)).toBe(Math.round(F.faltaron * 10))
      }
    }
  })
  it('Filete 14:16: 31 s andando, 15,5 pz/min (77 %, bien); los 29 s de colación no cuentan y el esperado es el de los 31 s: 10,3, faltaron 2,3', () => {
    const L = lecturaDeDoc(FILETE_0211_DIA, '14:16')
    expect(L.filas[0]).toMatchObject({ andandoS: 31, tono: 'bien', pct: 77 })
    expect(L.filas[0]!.ritmo).toBeCloseTo(15.48, 2)
    expect(L.piezas).toBe(8)
    expect(L.esperadoBruto).toBe(20)
    expect(L.faltaron).toMatchObject({ esperado: 10.3, faltaron: 2.3, detencion: 0, micro: 0, ritmo: 2.3, programadaS: [29] })
    expect(L.programado).toEqual({ s: 29, motivo: 'Colación' })
    expect(L.programadas.map((p) => [p.motivo, p.hasta])).toEqual([['Colación', '14:16:29']])
  })
  it('Filete 14:21: una micro de 15 s (5 por micro) y 8 por ritmo', () => {
    const L = lecturaDeDoc(FILETE_0211_DIA, '14:21')
    expect(L.faltaron).toMatchObject({ faltaron: 13, micro: 5, detencion: 0, ritmo: 8 })
    expect(L.micros.map((m) => [m.desde, m.durS])).toEqual([['14:21:30', 15]])
  })
  it('Chonchi 10:03: la micro explica más de lo que faltó, así que «por ritmo» queda negativo en los datos (el globo lo dice en palabras)', () => {
    const L = lecturaDeDoc(CHONCHI_0211_T2, '10:03')
    expect(L.faltaron).toMatchObject({ esperado: 50, piezas: 42, faltaron: 8, detencion: 0, micro: 10.9, ritmo: -2.9 })
  })
})

describe('faltaronDelMinuto', () => {
  it('sin esperado de alguna Baader o con una sin el minuto no se calcula', () => {
    expect(faltaronDelMinuto([{ esperado: null, piezas: 3 }], [[]])).toBeNull()
    expect(faltaronDelMinuto([{ esperado: 18, piezas: null }], [[]])).toBeNull()
    expect(faltaronDelMinuto([], [])).toBeNull()
  })
  it('sin paradas todo lo que falta es «ritmo»', () => {
    expect(faltaronDelMinuto([{ esperado: 18, piezas: 13 }, { esperado: 16, piezas: 16 }], [[], []])).toMatchObject({ esperado: 34, piezas: 29, faltaron: 5, detencion: 0, micro: 0, ritmo: 5 })
  })
})

describe('columna derecha: detenciones (sin micro) con el piso al segundo', () => {
  /** El pipeline de la página: agruparEventos → paradasEnEje → episodiosParada, con las causas del doc. */
  const paradasDe = (doc: DocMicro) => {
    const desde = doc.pulse.serieMinuto.desde
    const nombres = Object.fromEntries(doc.live.machines.map((m) => [m.id, m.name]))
    const recoverable = doc.live.stopReasons.filter((r) => !doc.live.timeBreakdown.planned.some((p) => p.reason === r)).map((reason) => ({ reason, min: 1, count: 1 }))
    const grupos = agruparEventos({
      tb: { ...doc.live.timeBreakdown, recoverable } as never,
      stopEvents: doc.live.stopEvents, stopReasons: doc.live.stopReasons, stopMachines: doc.live.stopMachines, nombresMaquina: nombres, costo: null, cpmGlobal: null, t0: desde, ventana: null,
    })
    const paradas = paradasEnEje(grupos, Date.parse(desde), Date.parse(desde))
    const lim = { min: 0, max: doc.pulse.serieMinuto.maquinas[0]!.cycles.length }
    return { paradas, lim }
  }
  it('Chonchi 02-11: 5 detenciones (sin micro). Sin el piso al segundo eran 6: la de Ev 1 termina 15:17:30,564 y la de Ev 2 empieza 15:17:30,607', () => {
    const { paradas, lim } = paradasDe(CHONCHI_0211_T2)
    const sinMicro = paradas.filter((p) => !esParadaMicro(p))
    expect(episodiosParada(sinMicro, lim)).toBe(5)
  })
  it('el piso no cambia los minutos de reloj con alguna Baader detenida (micro incluida)', () => {
    const { paradas, lim } = paradasDe(CHONCHI_0211_T2)
    expect(minutosConParada(paradas, lim)).toBeGreaterThan(0)
  })
  it('Filete 02-11: el piso no mueve nada (4 detenciones)', () => {
    const { paradas, lim } = paradasDe(FILETE_0211_DIA)
    expect(episodiosParada(paradas.filter((p) => !esParadaMicro(p)), lim)).toBe(4)
  })
})
