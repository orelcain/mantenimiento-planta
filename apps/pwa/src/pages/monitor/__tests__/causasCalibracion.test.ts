/**
 * La calibración estática de las causas v3 (`causasCalibracion.ts`) contra una COPIA del json de la corrida (`fixtures/calibracion_v3_2026-11-02.json`, de
 * `ARIA_MANTENIMIENTO_PLANTA/scripts/microdetenciones_2026-11-02_v3/resultados_v3/`), y la causa probable que sale de ella (`resumirCausas`):
 * `round(Σ_formas micro_forma × max(0, precisión))` con las formas «activas», redondeado UNA vez por causa; el total es la suma de las causas.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CALIBRACION_V3, NOMBRE_PLANTA, PARAMETROS_V3, SEMANAS_VENTANA, calibracionDe, fechaDMA, type CalibracionPlanta, type FormaCalibrada } from '../causasCalibracion'
import { estadoDeForma, formaDe, observacionDeForma, resumirCausas, type CausaMicro, type FormaMicro, type MicroClasificada, type ModoLinea } from '../microCausa'
import { CHONCHI_0211_T2, clasificarDoc } from './microFixtures'

interface JsonCal {
  fecha: string
  regla: { VENTANA_SEM: number; N_MIN: number }
  plantas: Record<string, { ventana: [string, string]; parametros: Record<string, number | boolean>; categorias: Record<string, { estado: string; precision_estimada: number; obs: number; lift: number; ic95: [number, number] }> }>
}
const J = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'calibracion_v3_2026-11-02.json'), 'utf8')) as JsonCal

describe('causasCalibracion · los valores son los del json de la corrida, copiados tal cual', () => {
  it('las plantas son las mismas del json: chonchi, yal y filete', () => {
    expect(Object.keys(CALIBRACION_V3).sort()).toEqual(Object.keys(J.plantas).sort())
    expect(Object.keys(CALIBRACION_V3).sort()).toEqual(['chonchi', 'filete', 'yal'])
  })

  for (const planta of ['chonchi', 'yal', 'filete'] as const) {
    it(`${planta}: ventana W37-W44, fecha 02-11-2026, parámetros y, por forma, estado y precisión estimada`, () => {
      const cal = CALIBRACION_V3[planta]
      const ref = J.plantas[planta]!
      expect(cal.ventana).toEqual(ref.ventana)
      expect(cal.ventana).toEqual(['2026-W37', '2026-W44'])
      expect(cal.fecha).toBe(J.fecha)
      expect(cal.fecha).toBe('2026-11-02')
      expect(cal.parametros).toEqual(ref.parametros)
      expect(Object.keys(cal.categorias).sort()).toEqual(Object.keys(ref.categorias).sort())
      for (const [forma, c] of Object.entries(cal.categorias)) {
        expect(c.estado, `${planta} ${forma} estado`).toBe(ref.categorias[forma]!.estado)
        expect(c.precision_estimada, `${planta} ${forma} precisión`).toBe(ref.categorias[forma]!.precision_estimada)
      }
    })
  }

  it('las 8 semanas de la ventana y los parámetros: Yal tiene TRAS = 90 s; Chonchi y Filete, los de v3 (ARR 10 min, TRAS 120 s, CAD_HI 52,5 s, OTR_HI 127,5 s)', () => {
    expect(SEMANAS_VENTANA).toBe(J.regla.VENTANA_SEM)
    expect(CALIBRACION_V3.yal.parametros.TRAS).toBe(90_000)
    for (const p of ['chonchi', 'filete'] as const) expect(CALIBRACION_V3[p].parametros).toMatchObject({ ARR: 600_000, TRAS: 120_000, CAD_HI: 52_500, OTR_HI: 127_500 })
    expect(PARAMETROS_V3).toEqual(CALIBRACION_V3.chonchi.parametros)
  })

  it('calibracionDe: por el plantSlug del doc (sin distinguir mayúsculas ni espacios); una línea sin calibración da null', () => {
    expect(calibracionDe('chonchi')).toMatchObject({ planta: 'chonchi', nombre: 'Chonchi', fecha: '2026-11-02' })
    expect(calibracionDe(' Yal ')?.nombre).toBe('Yal')
    expect(calibracionDe('filete')?.nombre).toBe('Filete')
    expect(NOMBRE_PLANTA).toEqual({ chonchi: 'Chonchi', yal: 'Yal', filete: 'Filete' })
    expect(calibracionDe(null)).toBeNull()
    expect(calibracionDe(undefined)).toBeNull()
    expect(calibracionDe('otra-linea')).toBeNull()
    expect(calibracionDe('constructor')).toBeNull()
    expect(fechaDMA('2026-11-02')).toBe('02-11-2026')
  })

  it('el motivo de cada forma «en observación» se DERIVA del json (obs, lift, ic95): pocas si obs < N_MIN; sin exceso si la cota baja del IC95 es ≤ 1; las activas no llevan motivo', () => {
    let enObservacion = 0
    for (const planta of ['chonchi', 'yal', 'filete'] as const) {
      for (const [forma, c] of Object.entries(CALIBRACION_V3[planta].categorias)) {
        const ref = J.plantas[planta]!.categorias[forma]!
        if (ref.estado === 'activa') {
          expect(c.motivo, `${planta} ${forma}`).toBeUndefined()
          expect(c.obs, `${planta} ${forma}`).toBeUndefined()
          continue
        }
        enObservacion++
        const esperado = ref.obs < J.regla.N_MIN ? 'pocas' : ref.ic95[0] <= 1 ? 'sin_exceso' : null
        expect(esperado, `${planta} ${forma}: el json no explica por qué está en observación`).not.toBeNull()
        expect(c.motivo, `${planta} ${forma} motivo`).toBe(esperado)
        expect(c.obs, `${planta} ${forma} obs`).toBe(ref.obs)
      }
    }
    expect(enObservacion).toBe(3)
    /* Los tres casos de hoy: Chonchi y Filete «Al volver» sin exceso (lift 0,808 y 1,044); Yal «en cadena» por pocas (15 < 30) aunque el lift dé 3,685. */
    expect(CALIBRACION_V3.chonchi.categorias.paro).toMatchObject({ motivo: 'sin_exceso', obs: 152 })
    expect(CALIBRACION_V3.filete.categorias.paro).toMatchObject({ motivo: 'sin_exceso', obs: 139 })
    expect(CALIBRACION_V3.yal.categorias.linea_en_cadena).toMatchObject({ motivo: 'pocas', obs: 15 })
    expect(J.plantas.yal!.categorias.linea_en_cadena!.lift).toBeGreaterThan(3)
  })

  it('observacionDeForma: el motivo y las micro de la ventana de una forma en observación; null si está activa, no calibrada, «sin contexto» o sin calibración', () => {
    expect(observacionDeForma(calibracionDe('yal'), 'linea_en_cadena')).toEqual({ motivo: 'pocas', obs: 15 })
    expect(observacionDeForma(calibracionDe('chonchi'), 'paro')).toEqual({ motivo: 'sin_exceso', obs: 152 })
    expect(observacionDeForma(calibracionDe('chonchi'), 'linea_en_cadena')).toBeNull()
    expect(observacionDeForma(calibracionDe('yal'), 'paro')).toBeNull()
    expect(observacionDeForma(calibracionDe('filete'), 'linea_a_la_vez')).toBeNull()
    expect(observacionDeForma(calibracionDe('chonchi'), 'sin')).toBeNull()
    expect(observacionDeForma(null, 'paro')).toBeNull()
  })

  it('el estado de cada forma sale de la calibración: «Al volver de una detención» en observación en Chonchi y Filete, activa en Yal; en cadena en observación solo en Yal', () => {
    const e = (p: string, f: FormaMicro) => estadoDeForma(calibracionDe(p), f)
    expect(e('chonchi', 'paro')).toBe('en observación')
    expect(e('filete', 'paro')).toBe('en observación')
    expect(e('yal', 'paro')).toBe('activa')
    expect(e('yal', 'linea_en_cadena')).toBe('en observación')
    expect(e('chonchi', 'linea_en_cadena')).toBe('activa')
    expect(e('chonchi', 'sin')).toBeNull()
    expect(e('filete', 'linea_a_la_vez')).toBeNull()
    expect(estadoDeForma(null, 'arranque')).toBeNull()
  })
})

/** Una micro mínima para contar: lo único que `resumirCausas` mira es la causa, la forma y la duración. */
const falsa = (causa: CausaMicro, modo: ModoLinea | null = null, duracionS = 15): MicroClasificada => ({ causa, modo, forma: formaDe(causa, modo), duracionS } as MicroClasificada)
const muchas = (n: number, causa: CausaMicro, modo: ModoLinea | null = null) => Array.from({ length: n }, () => falsa(causa, modo))
const prob = (micros: MicroClasificada[], cal: CalibracionPlanta | null) => resumirCausas(micros, cal)
const de = (r: ReturnType<typeof resumirCausas>, c: CausaMicro) => r.causas.find((x) => x.causa === c)!

describe('causa probable · el estimado agregado con la calibración', () => {
  it('Chonchi 02-11 Turno 2: Arranque ~1 y Otra Baader se detuvo ~7 (15 × 0,388 + 1 × 0,514 + 2 × 0,454 = 7,24), «Al volver» en observación, total ~8 de 46', () => {
    const micros = clasificarDoc(CHONCHI_0211_T2, { planta: 'chonchi' })
    const r = resumirCausas(micros, calibracionDe('chonchi'))
    expect(r.calibrada).toBe(true)
    expect(r.total).toBe(46)
    expect(r.causas.map((c) => [c.causa, c.n, c.probable, c.enObservacion])).toEqual([
      ['arranque', 3, 1, false],
      ['linea', 18, 7, false],
      ['paro', 1, 0, true],
      ['sin', 24, null, false],
    ])
    expect(r.probableTotal).toBe(8)
    expect(r.porModo).toEqual({ a_la_vez: 15, en_cadena: 1, tras_paro_otra: 2 })
    /* El tiempo detenido de cada causa es la suma de lo anotado: 1 min 15 s · 11 min 30 s · 15 s · 10 min 45 s. */
    expect(r.causas.map((c) => c.segundos)).toEqual([75, 690, 15, 645])
  })

  it('se redondea UNA vez por causa: 1 «a la vez» + 1 «detención previa» = 0,388 + 0,454 = 0,842 → ~1 (redondeando cada forma daría 0)', () => {
    const r = prob([falsa('linea', 'a_la_vez'), falsa('linea', 'tras_paro_otra')], CALIBRACION_V3.chonchi as CalibracionPlanta)
    expect(de(r, 'linea').probable).toBe(1)
  })

  it('el total es la SUMA de las causas ya redondeadas: Arranque 0,228 → 0 y a la vez 0,388 → 0 dan total 0, no round(0,616) = 1', () => {
    const r = prob([falsa('arranque'), falsa('linea', 'a_la_vez')], CALIBRACION_V3.chonchi as CalibracionPlanta)
    expect(de(r, 'arranque').probable).toBe(0)
    expect(de(r, 'linea').probable).toBe(0)
    expect(r.probableTotal).toBe(0)
  })

  it('sin calibración para la línea no hay estimado: ni por causa ni total, y nada «en observación»', () => {
    const r = prob([...muchas(5, 'arranque'), ...muchas(4, 'linea', 'a_la_vez'), ...muchas(2, 'paro'), ...muchas(9, 'sin')], null)
    expect(r.calibrada).toBe(false)
    expect(r.probableTotal).toBeNull()
    expect(r.causas.map((c) => [c.causa, c.n, c.probable, c.enObservacion])).toEqual([['arranque', 5, null, false], ['linea', 4, null, false], ['paro', 2, null, false], ['sin', 9, null, false]])
    expect(r.total).toBe(20)
  })

  it('una forma EN OBSERVACIÓN se muestra pero no suma: Yal con 3 «en cadena» (precisión 0,729, en observación) da ~0 y la causa queda en observación', () => {
    const solo = prob(muchas(3, 'linea', 'en_cadena'), calibracionDe('yal'))
    expect(de(solo, 'linea')).toMatchObject({ n: 3, probable: 0, enObservacion: true })
    expect(solo.probableTotal).toBe(0)
    /* Con una forma activa al lado (2 «a la vez» × 0,616 = 1,232) suma solo esa: ~1, y la causa ya no está toda en observación. */
    const mixta = prob([...muchas(3, 'linea', 'en_cadena'), ...muchas(2, 'linea', 'a_la_vez')], calibracionDe('yal'))
    expect(de(mixta, 'linea')).toMatchObject({ n: 5, probable: 1, enObservacion: false })
  })

  it('«Al volver de una detención»: en Chonchi (en observación) no suma ni con 10 micro; en Yal (activa, 0,315) sí: 10 × 0,315 = 3,15 → ~3', () => {
    expect(de(prob(muchas(10, 'paro'), calibracionDe('chonchi')), 'paro')).toMatchObject({ probable: 0, enObservacion: true })
    expect(de(prob(muchas(10, 'paro'), calibracionDe('yal')), 'paro')).toMatchObject({ probable: 3, enObservacion: false })
  })

  it('una precisión negativa nunca resta: max(0, precisión), aun con la forma «activa»', () => {
    const cal: CalibracionPlanta = { ventana: ['a', 'b'], fecha: '2026-11-02', parametros: PARAMETROS_V3, categorias: { arranque: { estado: 'activa', precision_estimada: -0.4 }, linea_a_la_vez: { estado: 'activa', precision_estimada: 0.5 } } }
    const r = prob([...muchas(10, 'arranque'), ...muchas(4, 'linea', 'a_la_vez')], cal)
    expect(de(r, 'arranque').probable).toBe(0)
    expect(de(r, 'linea').probable).toBe(2)
    expect(r.probableTotal).toBe(2)
  })

  it('Filete: Arranque activa (0,176) y «Al volver» en observación; sin micro de una causa, ni estimado ni observación', () => {
    const r = prob([...muchas(10, 'arranque'), ...muchas(6, 'paro'), ...muchas(20, 'sin')], calibracionDe('filete'))
    expect(r.causas.map((c) => [c.causa, c.probable, c.enObservacion])).toEqual([['arranque', 2, false], ['linea', 0, false], ['paro', 0, true], ['sin', null, false]])
    expect(r.probableTotal).toBe(2)
    /* Las formas que no están en la calibración de la planta (Filete no tiene «Otra Baader paró») no suman ni se marcan en observación. */
    const forma: FormaCalibrada = 'linea_a_la_vez'
    expect(CALIBRACION_V3.filete.categorias[forma]).toBeUndefined()
  })
})
