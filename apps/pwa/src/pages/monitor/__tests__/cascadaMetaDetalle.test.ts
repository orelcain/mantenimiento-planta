/**
 * El «Ver detalle» de la cascada a la meta, sobre el turno Chonchi del 03-11 (perillas 17 · 16 · 16, motivo «por el Knuro» en la
 * Ev 1; metas 18 · 16 · 16). Regla: cada lista REPARTE el escalón de `cascadaPorMeta`, así que sus sumas tienen que cerrar exacto.
 * Las cifras esperadas se escriben a mano (las del encargo y las del mockup aprobado): no salen del código que se prueba.
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import { cascadaPorMeta, type BaaderCascada, type CascadaArgs, type CascadaPorMeta, type PiezasVista } from '../cascadaPerilla'
import { paradasDetalle, type EntradaRitmoVivo, type ParadaDetalle } from '../ritmoVivo'
import type { PerillasDeLinea } from '../perilla'
import { detalleCascadaMeta, etiquetaVista, type DetalleVistaMeta, type HoraMeta, type RenglonMeta } from '../cascadaMetaDetalle'

const N = fixture.maquinas[0]!.cycles.length
const T0 = Date.parse(fixture.desde)
const IDS = fixture.maquinas.map((m) => m.id)
const desde = fixture.desde

const serie: CascadaArgs['serie'] = {
  desde,
  maquinas: fixture.maquinas.map(({ id, nombre, esperado, cycles }) => ({ id, nombre, esperado, cycles })),
}

/* Cada minuto con detención del fixture, como una parada de Shoplogix (r = índice del motivo, s = segundos, m = Baader). */
const stopEvents: NonNullable<EntradaRitmoVivo['stopEvents']> = []
fixture.maquinas.forEach((m, mi) => m.det.forEach((d, k) => {
  const r = m.raz[k]!
  if (d > 0 && r >= 0) stopEvents.push({ r, f: new Date(T0 + k * 60_000).toISOString(), s: d, m: mi })
}))
const paradas = paradasDetalle({ stopEvents, stopReasons: fixture.razones, stopMachines: IDS, enCurso: [] })

const CON_MOTIVO: PerillasDeLinea = {
  actual: {
    [IDS[0]!]: { cpm: 17, desde, motivo: 'por el Knuro' },
    [IDS[1]!]: { cpm: 16, desde },
    [IDS[2]!]: { cpm: 16, desde },
  },
  historial: [],
}

const args = (over: Partial<CascadaArgs> = {}): CascadaArgs => ({ serie, n: N, paradas, perillas: CON_MOTIVO, ...over })
const cascada: CascadaPorMeta = cascadaPorMeta(args())
const detalle = detalleCascadaMeta(args(), cascada)
const ev1: BaaderCascada = cascada.baaders[0]!
const ev2: BaaderCascada = cascada.baaders[1]!
const ev3: BaaderCascada = cascada.baaders[2]!

const suma = (lista: RenglonMeta[] | null | undefined) => (lista ?? []).reduce((a, r) => a + r.piezas, 0)
const sumaHoras = (lista: HoraMeta[]) => lista.reduce((a, h) => a + h.piezas, 0)
const sumaDueno = (lista: RenglonMeta[], dueno: 'aguas' | 'mantOp') => lista.filter((r) => r.dueno === dueno).reduce((a, r) => a + r.piezas, 0)
const porNombre = (lista: RenglonMeta[], nombre: string) => lista.find((r) => r.nombre.toLowerCase() === nombre.toLowerCase())

/** Cada lista de una vista suma exacto el escalón de esa vista. */
function cuadraExacto(v: PiezasVista, d: DetalleVistaMeta) {
  expect(suma(d.detenciones.causa)).toBe(v.detenciones.piezas)
  expect(sumaHoras(d.detenciones.hora)).toBe(v.detenciones.piezas)
  if (d.detenciones.baader) expect(suma(d.detenciones.baader)).toBe(v.detenciones.piezas)
  expect(sumaHoras(d.micro.hora)).toBe(v.micro.piezas)
  if (d.micro.baader) expect(suma(d.micro.baader)).toBe(v.micro.piezas)
  expect(sumaHoras(d.vacios.hora)).toBe(v.vacios)
  if (d.vacios.baader) expect(suma(d.vacios.baader)).toBe(v.vacios)
}

/** Las causas por dueño cierran contra el dueño de la vista: aguas arriba = `aguas`; el resto = `piezas − aguas`. */
function cuadraDueno(v: PiezasVista, d: DetalleVistaMeta) {
  expect(sumaDueno(d.detenciones.causa, 'aguas')).toBe(v.detenciones.aguas)
  expect(sumaDueno(d.detenciones.causa, 'mantOp')).toBe(v.detenciones.piezas - v.detenciones.aguas)
}

describe('cada lista reparte su escalón: la línea y cada Baader', () => {
  it('la línea: causas, Baader y horas de detenciones; Baader y horas de micro; Baader y horas de vacíos suman exacto', () => {
    cuadraExacto(cascada.linea, detalle.linea)
    expect(cascada.linea.detenciones.piezas).toBe(465)
    expect(cascada.linea.micro.piezas).toBe(339)
    expect(cascada.linea.vacios).toBe(2227)
  })

  it('cada Baader: sus causas y sus horas suman exacto su escalón; sin listas por Baader (ella es una sola)', () => {
    for (const b of cascada.baaders) {
      const d = detalle.porBaader[b.id]!
      cuadraExacto(b, d)
      expect(d.detenciones.baader).toBeNull()
      expect(d.micro.baader).toBeNull()
      expect(d.vacios.baader).toBeNull()
    }
  })

  it('las causas por dueño: las de aguas arriba suman `aguas` y las de Mantención y operación, `piezas − aguas` (línea y Baader)', () => {
    cuadraDueno(cascada.linea, detalle.linea)
    for (const b of cascada.baaders) cuadraDueno(b, detalle.porBaader[b.id]!)
  })
})

describe('cifras del turno Chonchi 03-11 (perillas 17 · 16 · 16)', () => {
  it('línea por causa: Ajuste operador 207 y Cambio lote / MMPP 135 (Mantención y operación); limpieza de ducto 123 (aguas arriba)', () => {
    const causas = detalle.linea.detenciones.causa
    expect(porNombre(causas, 'Ajuste operador')).toMatchObject({ piezas: 207, dueno: 'mantOp' })
    expect(porNombre(causas, 'Cambio lote / MMPP')).toMatchObject({ piezas: 135, dueno: 'mantOp' })
    expect(porNombre(causas, 'limpieza de ducto')).toMatchObject({ piezas: 123, dueno: 'aguas' })
  })

  it('las causas van de mayor a menor y ninguna sale en cero', () => {
    const piezas = detalle.linea.detenciones.causa.map((r) => r.piezas)
    expect(piezas.every((p) => p > 0)).toBe(true)
    expect([...piezas].sort((a, b) => b - a)).toEqual(piezas)
  })

  it('vacíos por Baader: Ev 2 1.049 · Ev 1 590 · Ev 3 588, de mayor a menor', () => {
    expect(detalle.linea.vacios.baader?.map((r) => [r.nombre, r.piezas])).toEqual([
      ['Ev 2', 1049],
      ['Ev 1', 590],
      ['Ev 3', 588],
    ])
  })

  it('detenciones por Baader: piezas, partes por dueño, minutos y veces de la cascada', () => {
    const fila = detalle.linea.detenciones.baader?.find((r) => r.nombre === 'Ev 1')
    expect(fila).toMatchObject({ piezas: ev1.detenciones.piezas, min: Math.round(ev1.detenciones.min), veces: ev1.detenciones.veces })
    expect(fila?.partes).toEqual(ev1.detenciones.aguas > 0
      ? { mantOp: ev1.detenciones.piezas - ev1.detenciones.aguas, aguas: ev1.detenciones.aguas }
      : { mantOp: ev1.detenciones.piezas })
  })

  it('horas: 8 horas, de «21» a «04», en orden; «21» es parcial de 35 min y las demás, completas', () => {
    const horas = detalle.linea.detenciones.hora
    expect(horas.map((h) => h.hora)).toEqual(['21', '22', '23', '00', '01', '02', '03', '04'])
    expect(horas.find((h) => h.hora === '21')?.parcialMin).toBe(35)
    expect(horas.filter((h) => h.hora !== '21').every((h) => h.parcialMin === undefined)).toBe(true)
  })

  it('el nombre de la Baader es «Ev 1», no «Evisceradora 1»', () => {
    expect(etiquetaVista('Evisceradora 1')).toBe('Ev 1')
    expect(etiquetaVista('Evisceradora 3')).toBe('Ev 3')
  })

  it('promedio de micro: segundos de micro del fixture ÷ paradas micro que tocan el turno', () => {
    const iMicro = fixture.razones.findIndex((r) => /micro\s*detenc/i.test(r))
    let segMicro = 0
    fixture.maquinas.forEach((m) => m.det.forEach((d, k) => { if (m.raz[k] === iMicro) segMicro += d }))
    const finTurno = T0 + N * 60_000
    const paradasMicro = [...paradas.values()].flat().filter((p) => /micro\s*detenc/i.test(p.razon ?? '') && p.iniMs < finTurno && p.finMs > T0)
    expect(segMicro).toBeGreaterThan(0)
    expect(detalle.linea.micro.segundosPromedio).toBeCloseTo(segMicro / paradasMicro.length, 6)
  })
})

describe('Baader sin meta: no entra en la línea y las sumas siguen exactas', () => {
  /* Ev 1 con esperado 0: sin meta de Shoplogix. Su perilla (17) sigue en el mapa, pero la Baader no entra en la cuenta. */
  const serieSinMeta: CascadaArgs['serie'] = {
    desde,
    maquinas: serie.maquinas.map((m, i) => (i === 0 ? { ...m, esperado: 0 } : m)),
  }
  const cSinMeta = cascadaPorMeta(args({ serie: serieSinMeta }))
  const dSinMeta = detalleCascadaMeta(args({ serie: serieSinMeta }), cSinMeta)

  it('la línea no lista la Ev 1 en sus Baader, y sus listas cierran con la suma de Ev 2 y Ev 3', () => {
    expect(cSinMeta.baaders[0]!.sinMeta).toBe(true)
    expect(dSinMeta.linea.detenciones.baader?.map((r) => r.nombre)).not.toContain('Ev 1')
    expect(dSinMeta.linea.vacios.baader?.map((r) => r.nombre)).not.toContain('Ev 1')
    expect(dSinMeta.linea.micro.baader?.map((r) => r.nombre)).not.toContain('Ev 1')
    expect(cSinMeta.linea.detenciones.piezas).toBe(ev2.detenciones.piezas + ev3.detenciones.piezas)
    cuadraExacto(cSinMeta.linea, dSinMeta.linea)
    cuadraDueno(cSinMeta.linea, dSinMeta.linea)
  })

  it('la Ev 1 sin meta lleva todo en cero en su detalle', () => {
    const d = dSinMeta.porBaader[cSinMeta.baaders[0]!.id]!
    expect(suma(d.detenciones.causa)).toBe(0)
    expect(sumaHoras(d.detenciones.hora)).toBe(0)
    expect(sumaHoras(d.vacios.hora)).toBe(0)
  })
})

describe('sin perillas, todo cuadra igual', () => {
  it('cada lista de la línea y de cada Baader suma exacto su escalón', () => {
    const c = cascadaPorMeta(args({ perillas: null }))
    const d = detalleCascadaMeta(args({ perillas: null }), c)
    cuadraExacto(c.linea, d.linea)
    for (const b of c.baaders) cuadraExacto(b, d.porBaader[b.id]!)
  })
})

describe('sin paradas: listas vacías, horas en cero y sin promedio de micro', () => {
  it('no hay causas, las horas van en cero y el promedio de micro es null', () => {
    const vacio = new Map<string, ParadaDetalle[]>()
    const c = cascadaPorMeta(args({ paradas: vacio }))
    const d = detalleCascadaMeta(args({ paradas: vacio }), c)
    expect(d.linea.detenciones.causa).toEqual([])
    expect(d.linea.micro.segundosPromedio).toBeNull()
    expect(d.linea.detenciones.hora).toHaveLength(8)
    expect(sumaHoras(d.linea.detenciones.hora)).toBe(0)
  })
})

describe('vacíos por hora: el minuto con menos de 30 s andando no pesa (sintético de una Baader)', () => {
  /* Una Baader de 120 min desde las 22:00, sin ciclos (nada producido), vara 18 sin perilla. Un minuto (22:05) con 40 s de parada
     sin razón: andando 20 s, bajo el mínimo de 30 s. Pesos: 22 h = 59 × 18 + 0 = 1.062; 23 h = 60 × 18 = 1.080. Vacíos = 18 × 120 = 2.160. */
  const t0 = Date.parse('2026-11-03T22:00:00.000Z')
  const sintetica: CascadaArgs['serie'] = {
    desde: new Date(t0).toISOString(),
    maquinas: [{ id: 'u', nombre: 'Evisceradora 1', esperado: 18, cycles: Array.from({ length: 120 }, () => 0) }],
  }
  const parada: ParadaDetalle = { tipo: 'detencion', iniMs: t0 + 5 * 60_000, finMs: t0 + 5 * 60_000 + 40_000, durS: 40, inicioCrudoMs: t0 + 5 * 60_000, razon: null }
  const sargs: CascadaArgs = { serie: sintetica, n: 120, paradas: new Map([['u', [parada]]]), perillas: null }

  it('la hora con el minuto de 20 s andando no recibe ese minuto: 22 h = 1.071 y 23 h = 1.089', () => {
    const c = cascadaPorMeta(sargs)
    const d = detalleCascadaMeta(sargs, c)
    expect(c.linea.vacios).toBe(2160)
    cuadraExacto(c.linea, d.linea)
    expect(d.linea.vacios.hora.map((h) => [h.hora, h.piezas])).toEqual([['22', 1071], ['23', 1089]])
  })
})
