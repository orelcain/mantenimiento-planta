/**
 * cascadaPerilla (Fase B, núcleo): el turno noche de Chonchi del 03-11 con las perillas 17 · 16 · 16 (metas 18 · 16 · 16).
 * Las cifras esperadas son las del spec de la Fase B (mockup v5, 04-11) y se escriben a mano: no salen del código que se prueba.
 * El fixture entra por `paradasDetalle`, el mismo camino de producción: cada minuto con detención se vuelve una parada de Shoplogix.
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import { cascadaPorMeta, esAguasArriba, esProgramada, rendimientoPartido, tipoParaDesglose, type CascadaArgs } from '../cascadaPerilla'
import { paradasDetalle, type EntradaRitmoVivo } from '../ritmoVivo'
import type { PerillasDeLinea } from '../perilla'

const N = fixture.maquinas[0]!.cycles.length
const T0 = Date.parse(fixture.desde)
const IDS = fixture.maquinas.map((m) => m.id)

const serie: CascadaArgs['serie'] = {
  desde: fixture.desde,
  maquinas: fixture.maquinas.map(({ id, nombre, esperado, cycles }) => ({ id, nombre, esperado, cycles })),
}

/* Cada minuto con detención del fixture, como una parada de Shoplogix (r = índice del motivo, s = segundos, m = índice de la Baader). */
const stopEvents: NonNullable<EntradaRitmoVivo['stopEvents']> = []
fixture.maquinas.forEach((m, mi) => m.det.forEach((d, k) => {
  const r = m.raz[k]!
  if (d > 0 && r >= 0) stopEvents.push({ r, f: new Date(T0 + k * 60_000).toISOString(), s: d, m: mi })
}))
const paradas = paradasDetalle({ stopEvents, stopReasons: fixture.razones, stopMachines: IDS, enCurso: [] })

const desde = fixture.desde
const PERILLAS_17_16_16: PerillasDeLinea = {
  actual: {
    [IDS[0]!]: { cpm: 17, desde },
    [IDS[1]!]: { cpm: 16, desde },
    [IDS[2]!]: { cpm: 16, desde },
  },
  historial: [],
}
const PERILLAS_IGUAL_A_META: PerillasDeLinea = {
  actual: {
    [IDS[0]!]: { cpm: 18, desde },
    [IDS[1]!]: { cpm: 16, desde },
    [IDS[2]!]: { cpm: 16, desde },
  },
  historial: [],
}

const args = (perillas?: PerillasDeLinea | null): CascadaArgs => ({ serie, n: N, paradas, perillas })
const cascada = cascadaPorMeta(args(PERILLAS_17_16_16))
const linea = cascada.linea
const [ev1, ev2, ev3] = cascada.baaders

describe('cifras objetivo del turno Chonchi 03-11 (perillas 17 · 16 · 16)', () => {
  it('la línea: 394 min de producción (455 − 61 programada), podía 19.692, perilla 378, con la perilla 19.314', () => {
    expect(N).toBe(455)
    expect(Math.round(linea.minProduccion)).toBe(394)
    expect(Math.round(linea.minProgramada)).toBe(61)
    expect(linea.podia).toBe(19_692)
    expect(linea.perilla).toBe(378)
    expect(linea.podiaConPerilla).toBe(19_314)
  })

  it('la línea: detenciones −465 (29 min, 12 veces), micro −339 (21 min, 41 veces), vacíos −2.227 y hizo 16.283', () => {
    expect(linea.detenciones.min).toBeCloseTo(28.5, 6)
    expect(Math.round(linea.detenciones.min)).toBe(29)
    expect(linea.detenciones.veces).toBe(12)
    expect(linea.micro.min).toBeCloseTo(20.8, 6)
    expect(Math.round(linea.micro.min)).toBe(21)
    expect(linea.micro.veces).toBe(41)
    expect(linea.vacios).toBe(2_227)
    expect(linea.hizo).toBe(16_283)
  })

  it('Ev 1: 395 min (455 − 60), podía 7.114, perilla −378, con la perilla 6.736, detenciones −148 (9 min, 3 veces), micro −106 (6 min, 14 veces), vacíos −590, hizo 5.892', () => {
    expect(ev1!.nombre).toBe('Evisceradora 1')
    expect(Math.round(ev1!.minProduccion)).toBe(395)
    expect(Math.round(ev1!.minProgramada)).toBe(60)
    expect(ev1!.podia).toBe(7_114)
    expect(ev1!.perilla).toBe(378)
    expect(ev1!.podiaConPerilla).toBe(6_736)
    expect(ev1!.detenciones.veces).toBe(3)
    expect(Math.round(ev1!.detenciones.min)).toBe(9)
    expect(ev1!.micro.veces).toBe(14)
    expect(Math.round(ev1!.micro.min)).toBe(6)
    expect(ev1!.vacios).toBe(590)
    expect(ev1!.hizo).toBe(5_892)
  })

  it('Ev 2 hizo 5.031 y Ev 3 hizo 5.360: con perilla igual a la meta no restan nada', () => {
    expect(ev2!.hizo).toBe(5_031)
    expect(ev3!.hizo).toBe(5_360)
    expect(ev2!.perilla).toBe(0)
    expect(ev3!.perilla).toBe(0)
    expect(ev2!.podiaConPerilla).toBe(ev2!.podia)
    expect(ev3!.podiaConPerilla).toBe(ev3!.podia)
  })
})

describe('cuadre: cada vista cierra sola (podía − perilla − detenciones − micro − vacíos = hizo)', () => {
  it('la línea y las tres Baader cuadran al entero', () => {
    for (const v of [linea, ev1!, ev2!, ev3!]) expect(v.cuadra).toBe(true)
  })

  it('los vacíos no quedan negativos', () => {
    for (const v of [linea, ev1!, ev2!, ev3!]) expect(v.vacios).toBeGreaterThanOrEqual(0)
  })
})

describe('perilla', () => {
  it('sin perillas la pérdida es 0 y el resto queda igual que con perillas iguales a la meta', () => {
    const sinPerillas = cascadaPorMeta(args(null))
    const conMetas = cascadaPorMeta(args(PERILLAS_IGUAL_A_META))
    expect(sinPerillas.linea.perilla).toBe(0)
    for (const b of sinPerillas.baaders) expect(b.perilla).toBe(0)
    expect(sinPerillas).toEqual(conMetas)
  })

  it('una perilla por encima de la meta no resta (piso en 0): Ev 2 con 17 sobre su meta 16', () => {
    const conPerillaArriba: PerillasDeLinea = {
      actual: { ...PERILLAS_17_16_16.actual, [IDS[1]!]: { cpm: 17, desde } },
      historial: [],
    }
    const c = cascadaPorMeta(args(conPerillaArriba))
    expect(c.baaders[1]!.perilla).toBe(0)
    expect(c.linea.perilla).toBe(378)
    expect(c.linea.cuadra).toBe(true)
  })
})

describe('rendimiento partido', () => {
  it('faltan 13,7 pts = 2,0 de la perilla (378 pz) + 11,7 que faltaron para llegar a ella (2.213 pz)', () => {
    const r = rendimientoPartido(args(PERILLAS_17_16_16))
    expect(r.ptsFalta).toBeCloseTo(13.7286, 3)
    expect(r.ptsPerilla).toBeCloseTo(2.0027, 3)
    expect(r.ptsFaltoPerilla).toBeCloseTo(11.7259, 3)
    expect(r.piezasPerilla).toBe(378)
    expect(r.piezasFaltoPerilla).toBe(2_213)
  })

  it('el rendimiento sale de los minutos andando: 86,3 % con la base de 18.874 pz', () => {
    const r = rendimientoPartido(args(PERILLAS_17_16_16))
    expect(r.hizo).toBe(16_283)
    expect(Math.round(r.expMeta)).toBe(18_874)
    expect(r.rendimiento * 100).toBeCloseTo(86.27, 1)
  })
})

describe('dueños de lo que no se hizo (B-2)', () => {
  it('en cada vista, Mantención y operación + aguas arriba + producción = podía − hizo', () => {
    for (const v of [linea, ev1!, ev2!, ev3!]) {
      const d = v.duenos
      expect(d.mantOp + d.aguas + d.produccion).toBe(v.podia - v.hizo)
    }
  })

  it('la perilla es de producción: Ev 2 y Ev 3 (perilla igual a la meta) no tienen parte de producción', () => {
    expect(ev2!.duenos.produccion).toBe(0)
    expect(ev3!.duenos.produccion).toBe(0)
    expect(ev1!.duenos.produccion).toBe(378)
  })

  it('los vacíos son siempre aguas arriba', () => {
    for (const v of [linea, ev1!, ev2!, ev3!]) expect(v.duenos.aguas).toBeGreaterThanOrEqual(v.vacios)
  })

  it('aguas arriba = solo flujo de pescado: MMPP, abastecimiento, acopio, bombeo y ducto', () => {
    expect(esAguasArriba('Limpieza de Ducto')).toBe(true)
    expect(esAguasArriba('ACOPIO de pescado')).toBe(true)
    expect(esAguasArriba('Bombeo')).toBe(true)
    expect(esAguasArriba('FALTA MMPP')).toBe(true)
    expect(esAguasArriba('Atascamiento')).toBe(true)
    expect(esAguasArriba('AGUA')).toBe(true)
    expect(esAguasArriba('Micro Detencion')).toBe(false)
    expect(esAguasArriba('MOTORES')).toBe(false)
    expect(esAguasArriba('Cuchillería')).toBe(false)
  })

  it('«externo» que no es flujo de pescado es de Mantención y operación: AJUSTE OPERADOR, cambio de lote, cuota, personal', () => {
    expect(esAguasArriba('AJUSTE OPERADOR')).toBe(false)
    expect(esAguasArriba('CAMBIO LOTE / MMPP')).toBe(false)
    expect(esAguasArriba('CUMPLIMIENTO CUOTA')).toBe(false)
    expect(esAguasArriba('FALTA PERSONAL')).toBe(false)
  })

  it('programada = solo colación, reunión de inicio y ejercicio; limpieza de ducto NO es programada', () => {
    expect(esProgramada('COLACION')).toBe(true)
    expect(esProgramada('Reunión inicio turno')).toBe(true)
    expect(esProgramada('Ejercicio compensatorio - Paro')).toBe(true)
    expect(esProgramada('Limpieza de Ducto')).toBe(false)
  })
})

describe('piezas de la cascada para la vista (B-2)', () => {
  it('Ev 1: detenciones 148 pz, micro 106 pz, perdido 1.222 (podía 7.114 − hizo 5.892)', () => {
    expect(ev1!.detenciones.piezas).toBe(148)
    expect(ev1!.micro.piezas).toBe(106)
    expect(ev1!.perdido).toBe(1_222)
  })

  it('la vara vigente al final del turno: Ev 1 en 17 y Ev 2 en 16; sin perillas, la vara es la meta de Shoplogix (18)', () => {
    expect(ev1!.vara).toBe(17)
    expect(ev2!.vara).toBe(16)
    const sinPerillas = cascadaPorMeta(args(null))
    expect(sinPerillas.baaders[0]!.vara).toBe(18)
    expect(sinPerillas.linea.perdido).toBe(sinPerillas.linea.podia - sinPerillas.linea.hizo)
  })
})

describe('rendimiento por vista (fila «Al rendimiento le faltan», B-2)', () => {
  it('la línea: faltan 13,7 pts, 2.213 piezas bajo la perilla y 378 de la perilla más lenta', () => {
    expect(linea.rendimiento.ptsFalta).toBeCloseTo(13.7, 1)
    expect(linea.rendimiento.piezasPerilla).toBe(378)
    expect(linea.rendimiento.piezasFaltoPerilla).toBe(2_213)
  })

  it('cada Baader lleva su propio rendimiento; la línea suma sus minutos andando y sus piezas', () => {
    expect(ev1!.rendimiento.piezasPerilla).toBe(378)
    expect(ev2!.rendimiento.piezasPerilla).toBe(0)
    const sumaExp = [ev1!, ev2!, ev3!].reduce((a, b) => a + b.rendimiento.expMeta, 0)
    const sumaHizo = [ev1!, ev2!, ev3!].reduce((a, b) => a + b.rendimiento.hizo, 0)
    expect(linea.rendimiento.expMeta).toBeCloseTo(sumaExp, 6)
    expect(linea.rendimiento.hizo).toBe(sumaHizo)
    expect(linea.rendimiento.hizo).toBe(linea.hizo)
  })
})

describe('tipo de cada parada en el desglose (B-2)', () => {
  it('lo programado es solo colación, reunión y ejercicio; la limpieza de ducto marcada programada pasa a detención', () => {
    expect(tipoParaDesglose({ tipo: 'programada', razon: 'COLACION' })).toBe('programada')
    expect(tipoParaDesglose({ tipo: 'programada', razon: 'Limpieza de Ducto' })).toBe('detencion')
    expect(tipoParaDesglose({ tipo: 'micro', razon: 'Micro Detencion' })).toBe('micro')
    expect(tipoParaDesglose({ tipo: 'detencion', razon: 'AJUSTE OPERADOR' })).toBe('detencion')
  })
})
