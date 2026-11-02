/**
 * El clasificador sobre los dos docs REALES del 02-11-2026 (Chonchi Turno 2 y Filete Turno Día), con las cifras verificadas aparte con
 * el script de la validación (5 turnos de Chonchi, 262 micro: Arranque 26 · Línea común 52 · Tras detención 3 · Ritmo bajo 34 ·
 * Sin contexto 147). Lo que se protege es la fidelidad: cada cifra del globo es la del doc, y la regla dice lo mismo que los datos.
 */
import { describe, expect, it } from 'vitest'
import { matchImputacion } from '@/services/shoplogix/imputacionTaxonomy'
import { RITMO_BAJO, contarPorCausa, numerosPorCelda, type CausaMicro, type MicroClasificada } from '../microCausa'
import { CHONCHI_0211_T2, FILETE_0211_DIA, buscarMicro, clasificarDoc, type DocMicro } from './microFixtures'

const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ')
const EV1 = 'Evisceradora 1'
const PROHIBIDAS = /falta de pescado|baja velocidad|carros|venían lentas/i
/** Lo que es una inferencia por el atraso de Shoplogix y NO puede decirse como hecho: tiene que ser «probablemente» o «pudo». */
const COMO_HECHO = /ya venía de antes|ya estaba parando|la parada ya venía/i
const textos = (q: MicroClasificada) => [...q.razones.flatMap((r) => [r.cifra, r.texto, r.detalle ?? '']), ...q.descartadas.flatMap((d) => [d.titulo, d.texto]), q.tabla.leyendaInicio ?? ''].map(sp)

describe('microCausa · Chonchi 02-11 Turno 2 (casos reales)', () => {
  const micros = clasificarDoc(CHONCHI_0211_T2)

  it('15:10:00 Ev 1, micro de 45 s: Línea común · ① «2 de 3» (Ev 2, 30 s) · ② Ev 3 «8 de 16» sin parada anotada · «ritmo bajo» no se revisó', () => {
    const q = buscarMicro(micros, '15:10:00', EV1)
    expect(q.duracionS).toBe(45)
    expect(q.causa).toBe('linea')
    expect(q.razones).toHaveLength(2)
    expect(sp(q.razones[0]!.cifra)).toBe('2 de 3')
    expect(sp(q.razones[0]!.texto)).toBe('Baader con micro anotada a la misma hora')
    expect(sp(q.razones[0]!.detalle)).toBe('Ev 1 45 s · Ev 2 30 s')
    expect(sp(q.razones[1]!.cifra)).toBe('8 de 16 pz')
    expect(sp(q.razones[1]!.texto)).toBe('Ev 3 también bajó en el minuto 15:10 (esperado: 16)')
    expect(sp(q.razones[1]!.detalle)).toBe('sin parada anotada: posible micro muy corta (de 0 s)')
    /* Los números de las razones caen en la celda que las prueba: ① en Ev 1 y Ev 2 a las 15:10, ② en Ev 3 a las 15:10. */
    expect([...numerosPorCelda(q).entries()]).toEqual([['0:0', [1]], ['1:0', [1]], ['2:0', [2]]])
    /* Reglas que no aplicaron: Arranque y Tras detención con su cifra y su límite; «ritmo bajo» no se revisó. */
    expect(q.descartadas.map((d) => [d.regla, d.estado])).toEqual([['arranque', 'no'], ['paro', 'no'], ['ritmo', 'sin']])
    expect(q.descartadas.map((d) => sp(d.titulo))).toEqual(['No es arranque:', 'No es tras detención:', 'No se revisó «ritmo bajo»:'])
    expect(sp(q.descartadas[0]!.texto)).toBe('la última detención de 10 min o más de Ev 1 terminó a las 13:35')
    expect(sp(q.descartadas[1]!.texto)).toBe('la última detención de Ev 1 terminó hace 9,5 min')
    /* «Ya venía de antes» es una inferencia (Shoplogix anota con atraso): se dice «probablemente», no como hecho. */
    expect(sp(q.descartadas[2]!.texto)).toBe(
      'Shoplogix anota con 15 a 30 s de atraso y la micro quedó en los primeros 15 s del minuto: probablemente empezó en el minuto 15:09, así que ese minuto no se puede comparar con su ritmo normal',
    )
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
    expect(sp(q.tabla.leyendaInicio)).toBe('la parada pudo empezar en este minuto (Shoplogix la anota con 15 a 30 s de atraso)')
  })

  it('10:17:43 Ev 1: Ritmo bajo ✓, porque 10 < 12 = 0,75 × 16 (ritmo propio 16)', () => {
    const q = buscarMicro(micros, '10:17:43', EV1)
    expect(q.duracionS).toBe(15)
    expect(q.causa).toBe('ritmo')
    expect(10).toBeLessThan(RITMO_BAJO * 16)
    expect(q.razones).toHaveLength(1)
    expect(sp(q.razones[0]!.cifra)).toBe('10 de 16 pz')
    expect(sp(q.razones[0]!.texto)).toBe('Ev 1 en el minuto 10:16, el minuto anterior a la micro')
    expect(sp(q.razones[0]!.detalle)).toBe('Su ritmo normal (15 min previos, sin paradas): 16 pz/min. Menos de 12 (el 75 %) cuenta como poco.')
    expect(q.razones[0]!.celdas).toEqual([{ fila: 0, d: -1 }])
    expect(q.tabla.filas[0]!.piezas).toEqual([14, 10, 5, 16])
    expect(q.tabla.filas.every((f) => !f.inicioPrevio)).toBe(true)
    expect(q.tabla.leyendaInicio).toBeNull()
    expect(q.descartadas.map((d) => [d.regla, d.estado, sp(d.titulo), sp(d.texto)])).toEqual([
      ['arranque', 'no', 'No es arranque:', 'ya pasaron 10 min desde que empezó el turno (09:15) y Ev 1 no tuvo detenciones de 10 min o más'],
      ['linea', 'no', 'No es línea común:', 'ninguna otra Baader tuvo micro ni detención en los 15 s antes o después'],
      ['paro', 'no', 'No es tras detención:', 'la última detención de Ev 1 terminó hace 15,5 min'],
    ])
  })

  it('15:13:00 Ev 1: Línea común por DETENCIÓN (Ev 3 entra en una detención) y, si se quita la micro simultánea de Ev 2, sigue siéndolo', () => {
    const q = buscarMicro(micros, '15:13:00', EV1)
    expect(q.causa).toBe('linea')
    expect(sp(q.razones[0]!.cifra)).toBe('3 de 3')
    expect(sp(q.razones[0]!.texto)).toBe('Baader con parada anotada a la misma hora')
    expect(sp(q.razones[0]!.detalle)).toBe('Ev 1 micro de 15 s · Ev 2 micro de 15 s · Ev 3 detención de 2 min 15 s')
    /* Sin la micro de Ev 2 (15:13:00.535): queda la detención de Ev 3 (15:13:00.529) y la causa NO cambia. */
    const sinEv2: DocMicro = { ...CHONCHI_0211_T2, live: { ...CHONCHI_0211_T2.live, stopEvents: CHONCHI_0211_T2.live.stopEvents.filter((e) => !(e.m === 1 && e.f.startsWith('2026-11-02T15:13:00.5'))) } }
    expect(sinEv2.live.stopEvents).toHaveLength(CHONCHI_0211_T2.live.stopEvents.length - 1)
    const q2 = buscarMicro(clasificarDoc(sinEv2), '15:13:00', EV1)
    expect(q2.causa).toBe('linea')
    expect(sp(q2.razones[0]!.cifra)).toBe('2 de 3')
    expect(sp(q2.razones[0]!.detalle)).toBe('Ev 1 micro de 15 s · Ev 3 detención de 2 min 15 s')
    /* Control: sin la micro de Ev 2 NI la detención de Ev 3 ya no hay nada a ±15 s, y deja de ser Línea común. */
    const sinAmbas: DocMicro = { ...sinEv2, live: { ...sinEv2.live, stopEvents: sinEv2.live.stopEvents.filter((e) => !(e.m === 2 && e.f.startsWith('2026-11-02T15:13:00.5'))) } }
    const q3 = buscarMicro(clasificarDoc(sinAmbas), '15:13:00', EV1)
    expect(q3.causa).not.toBe('linea')
    expect(sp(q3.descartadas.find((d) => d.regla === 'linea')!.texto)).toBe('ninguna otra Baader tuvo micro ni detención en los 15 s antes o después')
  })

  it('15:13:00 Ev 1: el ▽ también va en Ev 3 (su detención quedó anotada en :00-:14, como las micro), y solo donde hay una parada simultánea', () => {
    const q = buscarMicro(micros, '15:13:00', EV1)
    expect(q.tabla.filas.map((f) => [f.nombre, f.microEnK, f.inicioPrevio])).toEqual([['Ev 1', 'linea', true], ['Ev 2', 'linea', true], ['Ev 3', null, true]])
    /* Sin la micro de Ev 2 y sin la detención de Ev 3, solo queda el ▽ de la propia Ev 1. */
    const sola: DocMicro = { ...CHONCHI_0211_T2, live: { ...CHONCHI_0211_T2.live, stopEvents: CHONCHI_0211_T2.live.stopEvents.filter((e) => !((e.m === 1 || e.m === 2) && e.f.startsWith('2026-11-02T15:13:00.5'))) } }
    expect(buscarMicro(clasificarDoc(sola), '15:13:00', EV1).tabla.filas.map((f) => f.inicioPrevio)).toEqual([true, false, false])
  })

  it('cada ▽ del turno responde a la regla (la propia micro o una parada simultánea a ±15 s anotada en :00-:14), recontada desde el doc', () => {
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
        return eventos.some((e) => e.fila === j && (e.micro || !e.programada) && Math.abs(e.ini - q.inicioMs) <= 15_000 && Math.floor((e.ini - t0) / 60_000) === q.minuto && enInicio(e.ini))
      })
      expect(q.tabla.filas.map((f) => f.inicioPrevio), `${q.nombre} ${new Date(q.inicioMs).toISOString().slice(11, 19)}`).toEqual(esperado)
      marcadas += esperado.filter(Boolean).length
    }
    expect(marcadas).toBeGreaterThan(0)
  })

  it('el turno 02-11 T2 completo: 46 micro, Arranque 0 · Línea común 17 · Tras detención 1 · Ritmo bajo 6 · Sin contexto 22 (lo que da el script validado)', () => {
    expect(micros).toHaveLength(46)
    expect(contarPorCausa(micros)).toEqual({ arranque: 0, linea: 17, paro: 1, ritmo: 6, sin: 22 })
  })

  it('con el inicio de la SERIE como inicio del turno (lo que le pasa el gráfico) el reparto de este turno es el mismo', () => {
    const conSerie = clasificarDoc(CHONCHI_0211_T2, { inicioTurnoMs: Date.parse(CHONCHI_0211_T2.pulse.serieMinuto.desde) })
    expect(contarPorCausa(conSerie)).toEqual({ arranque: 0, linea: 17, paro: 1, ritmo: 6, sin: 22 })
  })

  it('las paradas programadas son las de la taxonomía de la app y coinciden con las que el propio doc declara en timeBreakdown.planned', () => {
    for (const doc of [CHONCHI_0211_T2, FILETE_0211_DIA]) {
      const programadas = doc.live.stopReasons.filter((r) => matchImputacion(r).bucket === 'planificado').sort()
      const delDoc = doc.live.timeBreakdown.planned.map((p) => p.reason).sort()
      expect(programadas).toEqual(delDoc)
      expect(doc.live.stopReasons.filter((r) => /micro detencion/i.test(r) && matchImputacion(r).bucket === 'planificado')).toEqual([])
    }
  })

  it('ninguna de las 46 micro dice «falta de pescado», «baja velocidad», «carros» ni «venían lentas», ni afirma como hecho que la parada «ya venía de antes»', () => {
    for (const q of micros) for (const t of textos(q)) { expect(t).not.toMatch(PROHIBIDAS); expect(t).not.toMatch(COMO_HECHO) }
  })

  it('cada cifra del globo es la de su celda en la tabla (nada se escribe a mano ni se redondea distinto)', () => {
    const revisar = (q: MicroClasificada) => {
      const celda = (fila: number, d: number) => q.tabla.filas[fila]!.piezas[d + 2]
      for (const r of q.razones) {
        /* El «de N» del ritmo bajo puede llevar un decimal con coma (su ritmo escalado por los segundos que la Baader anduvo). */
        const m = /^(\d+) de ([\d,]+)(?: pz)?$/.exec(sp(r.cifra))
        if (/también bajó en el minuto/.test(r.texto)) {
          const c = r.celdas[0]!
          expect(Number(m![1])).toBe(celda(c.fila, c.d))
          expect(Number(m![2])).toBe(q.tabla.filas[c.fila]!.esperado)
        } else if (/el minuto anterior a la micro/.test(r.texto) && /ritmo normal/.test(r.detalle ?? '')) {
          expect(Number(m![1])).toBe(celda(q.fila, -1))
        } else if (/^Baader con una (micro|parada) anotada/.test(sp(r.texto))) {
          expect(Number(m![1])).toBe(new Set(r.celdas.map((c) => c.fila)).size)
          expect(Number(m![2])).toBe(q.tabla.filas.length)
        } else if (/venían bajo su ritmo/.test(r.texto)) {
          expect(Number(m![1])).toBe(q.tabla.filas.length)
          expect(r.celdas.every((c) => c.d === -1)).toBe(true)
        }
        /* Toda razón con celdas apunta a celdas que existen en la tabla. */
        for (const c of r.celdas) expect(q.tabla.filas[c.fila]).toBeDefined()
      }
      /* Una sola Baader es «la de la micro». */
      expect(q.tabla.filas.filter((f) => f.ella)).toHaveLength(1)
      expect(q.tabla.filas.find((f) => f.ella)!.id).toBe(q.maquinaId)
    }
    for (const q of micros) revisar(q)
    for (const q of clasificarDoc(FILETE_0211_DIA)) revisar(q)
  })
})

describe('microCausa · Filete 02-11 Turno Día (casos reales)', () => {
  const micros = clasificarDoc(FILETE_0211_DIA)

  it('14:40:00: Sin contexto (primeros 15 s del minuto; en Filete no se rotula Ritmo bajo)', () => {
    const q = buscarMicro(micros, '14:40:00', 'Linea 1')
    expect(q.duracionS).toBe(30)
    expect(q.causa).toBe('sin')
    expect(q.razones).toEqual([])
    expect(q.tabla.filas).toHaveLength(1)
    expect(q.tabla.filas.map((f) => [f.nombre, ...f.piezas, f.esperado])).toEqual([['Linea 1', 14, 11, 6, 13, 20]])
    expect(q.descartadas.map((d) => [d.regla, d.estado])).toEqual([['arranque', 'no'], ['paro', 'no'], ['ritmo', 'sin']])
    expect(sp(q.descartadas[0]!.texto)).toBe('la última detención de 10 min o más de Linea 1 terminó a las 14:16')
    expect(sp(q.descartadas[1]!.texto)).toBe('la última detención de Linea 1 terminó hace 23,5 min')
    /* El motivo es el que se midió (en Filete la mayoría de los minutos ya va bajo lo esperado), no que su ritmo «cambie mucho». */
    expect(sp(q.descartadas[2]!.titulo)).toBe('«Ritmo bajo» no se usa con una sola Baader:')
    expect(q.descartadas[2]!.texto).toBe('en Filete la mayoría de los minutos ya va bajo lo esperado y no serviría para explicar una micro')
  })

  it('en Filete ninguna micro sale Línea común ni Ritmo bajo (una sola Baader); el turno completo da lo que el script validado', () => {
    expect(micros).toHaveLength(20)
    const c = contarPorCausa(micros)
    expect(c).toEqual({ arranque: 2, linea: 0, paro: 0, ritmo: 0, sin: 18 })
    for (const q of micros) {
      expect((['linea', 'ritmo'] as CausaMicro[]).includes(q.causa)).toBe(false)
      expect(q.tabla.filas).toHaveLength(1)
      for (const t of textos(q)) expect(t).not.toMatch(PROHIBIDAS)
    }
  })
})
