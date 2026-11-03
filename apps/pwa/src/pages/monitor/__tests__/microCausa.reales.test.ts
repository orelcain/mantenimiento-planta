/**
 * El clasificador sobre los dos docs REALES del 02-11-2026 (Chonchi Turno 2 y Filete Turno Día), con las cifras de la referencia ejecutable `causas_v3.py`
 * (Chonchi T2: 46 micro, Arranque 3 · a la vez 15 · en cadena 1 · detención previa 2 · Al volver de una detención 1 · Sin contexto 24; Filete Día: 20 micro,
 * 2 · 0 · 0 · 0 · 0 · 18). Lo que se protege es la fidelidad: cada cifra del globo es la del doc, y la regla dice lo mismo que los datos.
 *
 * v3 (03-11-2026) retiró «Ritmo bajo» de las causas de micro: la micro de Chonchi 10:17:43 que en v4.8.0 salía «Ritmo bajo» ahora sale Sin contexto.
 */
import { describe, expect, it } from 'vitest'
import { matchImputacion } from '@/services/shoplogix/imputacionTaxonomy'
import { contarPorCausa, contarPorForma, motivoLegible, type MicroClasificada } from '../microCausa'
import { detalleForma, lineaCausa } from '../textosCausas'
import { CHONCHI_0211_T2, FILETE_0211_DIA, buscarMicro, clasificarDoc, type DocMicro } from './microFixtures'

const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ')
const EV1 = 'Evisceradora 1'
const PROHIBIDAS = /falta de pescado|baja velocidad|carros|venían lentas/i
/** Lo que es una inferencia por el atraso de Shoplogix y NO puede decirse como hecho: tiene que ser «probablemente» o «pudo». */
const COMO_HECHO = /ya venía de antes|ya estaba parando|la parada ya venía/i
const textos = (q: MicroClasificada) => {
  const l = lineaCausa(q.evidencia)
  return [l.prefijo ?? '', l.nombre, l.detalle, detalleForma(q.evidencia, { fila: q.fila, nombre: 'Ev', durS: q.duracionS }) ?? '', ...q.descartadas.flatMap((d) => [d.titulo, d.texto]), q.tabla.leyendaInicio ?? ''].map(sp)
}
const detalleDe = (q: MicroClasificada) => sp(lineaCausa(q.evidencia).detalle)

describe('microCausa v3 · Chonchi 02-11 Turno 2 (casos reales)', () => {
  const micros = clasificarDoc(CHONCHI_0211_T2, { planta: 'chonchi' })

  it('15:10:00 Ev 1, micro de 45 s: «Otra Baader paró · a la vez» (Ev 2 con micro de 30 s a la vez), ① en Ev 1 y Ev 2, y las reglas que no aplicaron', () => {
    const q = buscarMicro(micros, '15:10:00', EV1)
    expect(q.duracionS).toBe(45)
    expect(q).toMatchObject({ causa: 'linea', modo: 'a_la_vez', forma: 'linea_a_la_vez' })
    expect(lineaCausa(q.evidencia)).toMatchObject({ prefijo: 'Causa posible:', nombre: 'Otra Baader paró' })
    expect(detalleDe(q)).toBe('Ev 2 con micro a la vez')
    expect(sp(detalleForma(q.evidencia, { fila: 0, nombre: 'Ev 1', durS: 45 }))).toBe('Forma: a la vez. Ev 1 45 s · Ev 2 30 s.')
    /* El ① cae en la celda que lo prueba: Ev 1 y Ev 2 a las 15:10 (v3 ya no lleva el ② de «Ev 3 también bajó», que era una nota de ritmo). */
    expect(q.celdas).toEqual([{ fila: 0, d: 0 }, { fila: 1, d: 0 }])
    expect(q.descartadas.map((d) => [d.regla, sp(d.titulo), sp(d.texto)])).toEqual([
      ['arranque', 'No es arranque:', 'la última detención de 10 min o más de Ev 1 terminó a las 13:35'],
      ['paro', 'No es «Al volver de una detención»:', 'la última detención de Ev 1 terminó hace 9 min 30 s'],
    ])
    for (const t of textos(q)) expect(t).not.toMatch(COMO_HECHO)
  })

  it('15:10:00 Ev 1: la tabla es la del doc (k−2 … k+1 y Esperado) y lleva ▽ en 15:09 para Ev 1 y Ev 2', () => {
    const q = buscarMicro(micros, '15:10:00', EV1)
    expect(q.tabla.horas).toEqual(['15:08', '15:09', '15:10', '15:11'])
    expect(q.tabla.filas.map((f) => [f.nombre, ...f.piezas, f.esperado])).toEqual([
      ['Ev 1', 14, 10, 5, 11, 18],
      ['Ev 2', 15, 12, 5, 15, 16],
      ['Ev 3', 16, 14, 8, 16, 16],
    ])
    expect(q.tabla.filas.map((f) => f.ella)).toEqual([true, false, false])
    expect(q.tabla.filas.map((f) => f.microEnK)).toEqual(['linea', 'linea', null])
    expect(q.tabla.filas.map((f) => f.inicioPrevio)).toEqual([true, true, false])
    expect(sp(q.tabla.leyendaInicio)).toBe('la detención pudo empezar en este minuto: Shoplogix la anota con 15 a 30 s de atraso')
  })

  it('10:17:43 Ev 1: en v4.8.0 salía «Ritmo bajo» (10 < 12 = 0,75 × 16); en v3 la regla se retiró y sale Sin contexto, con sus tres reglas descartadas', () => {
    const q = buscarMicro(micros, '10:17:43', EV1)
    expect(q.duracionS).toBe(15)
    expect(q.causa).toBe('sin')
    expect(lineaCausa(q.evidencia)).toEqual({ prefijo: null, nombre: 'Sin contexto', detalle: 'nada alrededor en los datos' })
    expect(q.celdas).toEqual([])
    expect(q.tabla.filas[0]!.piezas).toEqual([14, 10, 5, 16])
    expect(q.tabla.filas.every((f) => !f.inicioPrevio)).toBe(true)
    expect(q.tabla.leyendaInicio).toBeNull()
    expect(q.descartadas.map((d) => [d.regla, sp(d.titulo), sp(d.texto)])).toEqual([
      ['arranque', 'No es arranque:', 'ya pasaron 10 min desde que Ev 1 empezó a producir (09:23) y no tuvo detenciones de 10 min o más'],
      ['linea', 'No es «Otra Baader paró»:', 'ninguna otra Baader se detuvo a ±15 s, las otras dos no tuvieron micro en cadena (entre 22,5 y 52,5 s antes o después) y no hubo una detención previa por acumulación, atascamiento, materia prima o ajuste del operador (entre 22,5 s y 2 min antes)'],
      ['paro', 'No es «Al volver de una detención»:', 'la última detención de Ev 1 terminó hace 15 min 30 s'],
    ])
  })

  it('10:02:13 Ev 2: «detención previa» (Ev 1 se detuvo 1 min 30 s antes por acumulación de rechazo), con el ① en la celda de la detención y ▽ en el minuto anterior', () => {
    const q = buscarMicro(micros, '10:02:13', 'Evisceradora 2')
    expect(q).toMatchObject({ causa: 'linea', modo: 'tras_paro_otra', duracionS: 60 })
    expect(detalleDe(q)).toBe(`Ev 1 se detuvo 1 min 30 s antes por ${sp(motivoLegible('ACUMULACION RECHAZO'))}`)
    expect(sp(detalleForma(q.evidencia, { fila: 1, nombre: 'Ev 2', durS: 60 }))).toBe('Forma: detención previa. La detención de Ev 1 fue no programada y duró 1 min 30 s.')
    expect(q.celdas).toEqual([{ fila: 0, d: -2 }])
    expect(q.tabla.filas.map((f) => f.inicioPrevio)).toEqual([false, true, false])
  })

  it('15:19:45 Ev 1: «en cadena» (Ev 2 y Ev 3 con micro 30 s después, en el minuto siguiente)', () => {
    const q = buscarMicro(micros, '15:19:45', EV1)
    expect(q).toMatchObject({ causa: 'linea', modo: 'en_cadena', duracionS: 15 })
    expect(detalleDe(q)).toBe('Ev 2 y Ev 3 con micro 30 s después')
    expect(sp(detalleForma(q.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))).toBe('Forma: en cadena. Ev 1 15 s · Ev 2 1 min 15 s · Ev 3 1 min.')
    expect(q.celdas).toEqual([{ fila: 0, d: 0 }, { fila: 1, d: 1 }, { fila: 2, d: 1 }])
  })

  it('15:18:45 Ev 1: «Al volver de una detención» (su detención terminó 1 min 15 s antes); la detención de Ev 2 antes era «sin imputar» y no cuenta', () => {
    const q = buscarMicro(micros, '15:18:45', EV1)
    expect(q).toMatchObject({ causa: 'paro', modo: null, forma: 'paro' })
    expect(lineaCausa(q.evidencia)).toMatchObject({ prefijo: 'Causa posible:', nombre: 'Al volver de una detención' })
    expect(detalleDe(q)).toBe('su detención terminó 1 min 15 s antes')
    expect(sp(detalleForma(q.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))).toBe('La detención de Ev 1 duró 2 min 30 s.')
    expect(q.descartadas.map((d) => [d.regla, sp(d.titulo)])).toEqual([['arranque', 'No es arranque:'], ['linea', 'No es «Otra Baader paró»:']])
    expect(sp(q.descartadas[1]!.texto)).toBe('Ev 2 se detuvo 1 min 15 s antes, pero sin imputar, y eso no cuenta. Ninguna otra Baader coincidió a la vez ni en cadena')
  })

  it('15:13:00 Ev 1: «a la vez» por DETENCIÓN (Ev 3 entra en una detención) y, si se quita la micro simultánea de Ev 2, sigue siéndolo', () => {
    const q = buscarMicro(micros, '15:13:00', EV1)
    expect(q.causa).toBe('linea')
    expect(q.modo).toBe('a_la_vez')
    expect(detalleDe(q)).toMatch(/^Ev 2 con micro a la vez y Ev 3 se detuvo a la vez/)
    expect(sp(detalleForma(q.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))).toBe('Forma: a la vez. Ev 1 15 s · Ev 2 15 s · Ev 3 detención de 2 min 15 s.')
    /* Sin la micro de Ev 2 (15:13:00.535): queda la detención de Ev 3 (15:13:00.529) y la causa NO cambia. */
    const sinEv2: DocMicro = { ...CHONCHI_0211_T2, live: { ...CHONCHI_0211_T2.live, stopEvents: CHONCHI_0211_T2.live.stopEvents.filter((e) => !(e.m === 1 && e.f.startsWith('2026-11-02T15:13:00.5'))) } }
    expect(sinEv2.live.stopEvents).toHaveLength(CHONCHI_0211_T2.live.stopEvents.length - 1)
    const q2 = buscarMicro(clasificarDoc(sinEv2, { planta: 'chonchi' }), '15:13:00', EV1)
    expect(q2.modo).toBe('a_la_vez')
    expect(detalleDe(q2)).toMatch(/^Ev 3 se detuvo a la vez/)
    expect(sp(detalleForma(q2.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))).toBe('Forma: a la vez. Ev 1 15 s · Ev 3 detención de 2 min 15 s.')
    /* Control: sin la micro de Ev 2 NI la detención de Ev 3 ya no hay nada a ±15 s, y deja de ser «a la vez». */
    const sinAmbas: DocMicro = { ...sinEv2, live: { ...sinEv2.live, stopEvents: sinEv2.live.stopEvents.filter((e) => !(e.m === 2 && e.f.startsWith('2026-11-02T15:13:00.5'))) } }
    const q3 = buscarMicro(clasificarDoc(sinAmbas, { planta: 'chonchi' }), '15:13:00', EV1)
    expect(q3.modo).not.toBe('a_la_vez')
  })

  it('15:13:00 Ev 1: el ▽ también va en Ev 3 (su detención quedó anotada en :00-:14, como las micro), y solo donde hay una detención simultánea', () => {
    const q = buscarMicro(micros, '15:13:00', EV1)
    expect(q.tabla.filas.map((f) => [f.nombre, f.microEnK, f.inicioPrevio])).toEqual([['Ev 1', 'linea', true], ['Ev 2', 'linea', true], ['Ev 3', null, true]])
    /* Sin la micro de Ev 2 y sin la detención de Ev 3, solo queda el ▽ de la propia Ev 1. */
    const sola: DocMicro = { ...CHONCHI_0211_T2, live: { ...CHONCHI_0211_T2.live, stopEvents: CHONCHI_0211_T2.live.stopEvents.filter((e) => !((e.m === 1 || e.m === 2) && e.f.startsWith('2026-11-02T15:13:00.5'))) } }
    expect(buscarMicro(clasificarDoc(sola, { planta: 'chonchi' }), '15:13:00', EV1).tabla.filas.map((f) => f.inicioPrevio)).toEqual([true, false, false])
  })

  it('cada ▽ del turno responde a la regla (la propia micro o una detención simultánea a ±15 s anotada en :00-:14), recontada desde el doc', () => {
    /* Recuento independiente de `clasificarMicros`: desde los eventos crudos del doc. */
    const nombres = new Map(CHONCHI_0211_T2.live.machines.map((m) => [m.id, m.name]))
    const filaDe = CHONCHI_0211_T2.pulse.serieMinuto.maquinas.map((m) => m.id)
    const t0 = Date.parse(CHONCHI_0211_T2.pulse.serieMinuto.desde)
    const eventos = CHONCHI_0211_T2.live.stopEvents.map((e) => {
      const razon = CHONCHI_0211_T2.live.stopReasons[e.r]!
      return {
        fila: filaDe.indexOf(CHONCHI_0211_T2.live.stopMachines[e.m]!),
        ini: Date.parse(e.f),
        micro: /^micro detenc/i.test(razon),
        programada: matchImputacion(razon).bucket === 'planificado',
        s: e.s,
      }
    }).filter((e) => e.s > 0)
    expect(nombres.size).toBe(3)
    const enInicio = (ms: number) => (((ms - t0) % 60_000) + 60_000) % 60_000 < 15_000
    let marcadas = 0
    for (const q of micros) {
      const esperado = q.tabla.filas.map((_, j) => {
        if (q.minuto < 1) return false
        if (j === q.fila) return enInicio(q.inicioMs)
        return eventos.some((e) => e.fila === j && (e.micro || !e.programada) && Math.abs(Math.floor(e.ini / 1000) - Math.floor(q.inicioMs / 1000)) <= 15 && Math.floor((e.ini - t0) / 60_000) === q.minuto && enInicio(e.ini))
      })
      expect(q.tabla.filas.map((f) => f.inicioPrevio), `${q.nombre} ${new Date(q.inicioMs).toISOString().slice(11, 19)}`).toEqual(esperado)
      marcadas += esperado.filter(Boolean).length
    }
    expect(marcadas).toBeGreaterThan(0)
  })

  it('el turno 02-11 T2 completo: 46 micro, Arranque 3 · Otra Baader paró 18 (a la vez 15 · en cadena 1 · detención previa 2) · Al volver de una detención 1 · Sin contexto 24', () => {
    expect(micros).toHaveLength(46)
    expect(contarPorCausa(micros)).toEqual({ arranque: 3, linea: 18, paro: 1, sin: 24 })
    expect(contarPorForma(micros)).toEqual({ arranque: 3, linea_a_la_vez: 15, linea_en_cadena: 1, linea_tras_paro_otra: 2, paro: 1, sin: 24 })
  })

  it('con el inicio de la SERIE como inicio del turno (lo que le pasa el gráfico) el reparto de este turno es el mismo', () => {
    const conSerie = clasificarDoc(CHONCHI_0211_T2, { planta: 'chonchi', inicioTurnoMs: Date.parse(CHONCHI_0211_T2.pulse.serieMinuto.desde) })
    expect(contarPorCausa(conSerie)).toEqual({ arranque: 3, linea: 18, paro: 1, sin: 24 })
  })

  it('las detenciones programadas son las de la taxonomía de la app y coinciden con las que el propio doc declara en timeBreakdown.planned', () => {
    for (const doc of [CHONCHI_0211_T2, FILETE_0211_DIA]) {
      const programadas = doc.live.stopReasons.filter((r) => matchImputacion(r).bucket === 'planificado').sort()
      const delDoc = doc.live.timeBreakdown.planned.map((p) => p.reason).sort()
      expect(programadas).toEqual(delDoc)
      expect(doc.live.stopReasons.filter((r) => /micro detencion/i.test(r) && matchImputacion(r).bucket === 'planificado')).toEqual([])
    }
  })

  it('ninguna de las 46 micro dice «falta de pescado», «baja velocidad», «carros» ni «venían lentas», ni afirma como hecho que la detención «ya venía de antes»', () => {
    for (const q of micros) for (const t of textos(q)) { expect(t).not.toMatch(PROHIBIDAS); expect(t).not.toMatch(COMO_HECHO) }
  })

  it('las celdas que prueban la causa existen en la tabla y son las que dice la forma (nada se escribe a mano)', () => {
    const revisar = (q: MicroClasificada) => {
      for (const c of q.celdas) {
        expect(q.tabla.filas[c.fila]).toBeDefined()
        expect([-2, -1, 0, 1]).toContain(c.d)
      }
      if (q.evidencia.forma === 'linea_a_la_vez' || q.evidencia.forma === 'linea_en_cadena') {
        /* La propia micro más una celda por cada otra Baader de la evidencia (cada una en su Baader). */
        expect(new Set(q.celdas.map((c) => c.fila))).toEqual(new Set([q.fila, ...q.evidencia.otras.map((o) => o.fila)]))
      } else if (q.evidencia.forma === 'linea_tras_paro_otra') {
        expect(q.celdas.length).toBeLessThanOrEqual(1)
      } else {
        expect(q.celdas).toEqual([])
      }
      /* Una sola Baader es «la de la micro». */
      expect(q.tabla.filas.filter((f) => f.ella)).toHaveLength(1)
      expect(q.tabla.filas.find((f) => f.ella)!.id).toBe(q.maquinaId)
    }
    for (const q of micros) revisar(q)
    for (const q of clasificarDoc(FILETE_0211_DIA, { planta: 'filete' })) revisar(q)
  })
})

describe('microCausa v3 · Filete 02-11 Turno Día (casos reales)', () => {
  const micros = clasificarDoc(FILETE_0211_DIA, { planta: 'filete' })

  it('14:40:00: Sin contexto (primeros 15 s del minuto; con una sola Baader no existe «Otra Baader paró»)', () => {
    const q = buscarMicro(micros, '14:40:00', 'Linea 1')
    expect(q.duracionS).toBe(30)
    expect(q.causa).toBe('sin')
    expect(q.celdas).toEqual([])
    expect(q.tabla.filas).toHaveLength(1)
    expect(q.tabla.filas.map((f) => [f.nombre, ...f.piezas, f.esperado])).toEqual([['Linea 1', 14, 11, 6, 13, 20]])
    expect(q.descartadas.map((d) => d.regla)).toEqual(['arranque', 'paro'])
    expect(sp(q.descartadas[0]!.texto)).toBe('la última detención de 10 min o más de Linea 1 terminó a las 14:16')
    expect(sp(q.descartadas[1]!.texto)).toBe('la última detención de Linea 1 terminó hace 23 min 30 s')
  })

  it('en Filete ninguna micro sale «Otra Baader paró» (una sola Baader); el turno completo da lo que la referencia ejecutable', () => {
    expect(micros).toHaveLength(20)
    expect(contarPorCausa(micros)).toEqual({ arranque: 2, linea: 0, paro: 0, sin: 18 })
    for (const q of micros) {
      expect(q.causa).not.toBe('linea')
      expect(q.tabla.filas).toHaveLength(1)
      for (const t of textos(q)) expect(t).not.toMatch(PROHIBIDAS)
    }
  })
})
