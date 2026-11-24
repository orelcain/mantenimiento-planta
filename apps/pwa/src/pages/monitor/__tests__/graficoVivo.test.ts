/**
 * Gráfico «Piezas por minuto» (mockup v4, versión 5): eje adaptable, modo del P0, barras por dueño y la opción de
 * ECharts, con el 18-11 Turno 1 real a las 04:30 (hueco del espejo de 23:39 a 00:28).
 */
import { describe, expect, it } from 'vitest'
import extra from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { cubetasDe } from '@/services/grader/espejo/espejoMinutos'
import type { StoredGate0Record } from '@/services/grader/graderGate0Store'
import { armarGraderVivo } from '../graderVivoDatos'
import {
  MAX_MARCAS,
  P0_15_SOBRE_MIN,
  ROTULO_HUECO_MIN_PX,
  ZOOM_MIN_MIN,
  barrasP0,
  conAlfa,
  datosGrafico,
  limitarVentana,
  zoomAncla,
  marcasEje,
  modoP0,
  opcionGrafico,
  pasoEje,
  seguirVentana,
  ventanaInicial,
  type TemaGrafico,
} from '../graficoVivoDatos'

const T0 = Date.parse(extra.t0) // 21:15 del 18-11
const MIN_DIA0 = Math.floor(T0 / 60_000)
const HUECO = ['2026-11-18T23:39:26', '2026-11-19T00:28:51'] as const
const PUERTA0: StoredGate0Record[] = extra.puerta0.map(([s, e, g, n]) => ({
  ts: new Date(T0 + s! * 1000).toISOString(),
  pieces: n!,
  error: extra.errores[e!] ?? '',
  weightKg: g! / 1000,
}))
const TEMA: TemaGrafico = { acento: '#2e75b6', gris: '#888', mant: '#c2780a', ext: '#5f6b75', reja: '#eee', mal: '#c9645d', texto: '#111', textoSuave: '#666', fondo: '#fff' }

function a0430(conPesca = true) {
  const t = turnoReal('2026-11-18-turno_1')
  const hasta = 435
  const lim = new Date(T0 + hasta * 60_000).toISOString()
  const piezas = t.piezas.filter((p) => p.ts >= extra.t0 && p.ts < lim && !(p.ts >= HUECO[0] && p.ts < HUECO[1]))
  const n = Math.max(0, Math.floor((T0 + hasta * 60_000 - Date.parse(t.baader.desde)) / 60_000) - 3)
  return armarGraderVivo({
    cubetas: cubetasDe(piezas),
    inicioMs: T0,
    finMs: T0 + 12 * 60 * 60_000,
    baader: { desde: t.baader.desde, maquinas: t.baader.maquinas.map((m) => ({ cycles: m.cycles.slice(0, n) })) },
    paradas: [],
    minutosSinLatido: 0,
    turnoEnCurso: true,
    leidoHastaMs: T0 + hasta * 60_000,
    piezas: conPesca ? piezas : undefined,
    gate0Exacto: conPesca ? PUERTA0.filter((r) => r.ts < lim) : null,
  })
}

describe('constantes aprobadas (versión 5)', () => {
  it('zoom mínimo 5 min, 8 marcas, barras de 15 min sobre 60 min, rótulo del hueco desde 70 px', () => {
    expect([ZOOM_MIN_MIN, MAX_MARCAS, P0_15_SOBRE_MIN, ROTULO_HUECO_MIN_PX]).toEqual([5, 8, 60, 70])
  })

  it('con 60 min a la vista el P0 va por minuto; con 61, en tramos de 15', () => {
    expect(modoP0({ a: 0, b: 60 })).toBe('min')
    expect(modoP0({ a: 0, b: 61 })).toBe('15')
  })
})

describe('eje x adaptable', () => {
  const caso = (a: number, b: number, px: number) => {
    const v = { a, b }
    const { paso } = pasoEje(MIN_DIA0, v, px)
    return { paso, marcas: marcasEje(MIN_DIA0, v, paso).map((m) => new Date(T0 + m * 60_000).toISOString().slice(11, 16)) }
  }

  it('todo el turno a 1280 px: cada 2 h, en horas pares del reloj', () => {
    const r = caso(0, 720, 1236)
    expect(r.paso).toBe(120)
    expect(r.marcas[0]).toBe('22:00')
    expect(r.marcas.length).toBeLessThanOrEqual(MAX_MARCAS)
  })

  it('última hora (03:30–04:30) a 1280 px: cada 10 min', () => {
    const r = caso(375, 435, 1236)
    expect(r.paso).toBe(10)
    expect(r.marcas).toEqual(['03:30', '03:40', '03:50', '04:00', '04:10', '04:20', '04:30'])
  })

  it('10 min a 375 px: cada 2 min y nunca más de 8 marcas', () => {
    const r = caso(425, 435, 331)
    expect(r.paso).toBe(2)
    expect(r.marcas.length).toBeLessThanOrEqual(MAX_MARCAS)
  })
})

describe('ventana', () => {
  it('nunca menos de 5 min ni fuera del turno leído', () => {
    expect(limitarVentana({ a: 100, b: 101 }, 435)).toEqual({ a: 100, b: 105 })
    expect(limitarVentana({ a: 420, b: 500 }, 435)).toEqual({ a: 355, b: 435 })
  })

  it('pegada al final sigue al dato; si la persona la movió, se queda', () => {
    expect(seguirVentana({ a: 375, b: 435 }, 435, 436)).toEqual({ a: 376, b: 436 })
    expect(seguirVentana({ a: 100, b: 160 }, 435, 436)).toEqual({ a: 100, b: 160 })
  })

  it('en el celular abre en la última hora; en pantalla ancha, todo el turno leído', () => {
    expect(ventanaInicial(435, true)).toEqual({ a: 375, b: 435 })
    expect(ventanaInicial(435, false)).toEqual({ a: 0, b: 435 })
  })
})

describe('barras de P0 (18-11 T1, 04:30)', () => {
  const d = a0430()
  const pp = d.pesca!.p0Dueno.porPieza

  it('por minuto, Mantención + Seteo suman las piezas de Gate 0 de la serie', () => {
    const b = barrasP0(d, pp, 'min')
    for (const x of b) expect(x.mant + x.seteo).toBe(d.serie.g0[x.x0])
    expect(b.reduce((s, x) => s + x.mant, 0)).toBeGreaterThan(0)
  })

  it('en tramos de 15, la pila da el mismo % que la alerta «P0 alto»', () => {
    const b = barrasP0(d, pp, '15')
    d.p0.forEach((t, i) => {
      const x = b[i]!
      if (!x.gris) expect(x.mant + x.seteo).toBeCloseTo(t.pct ?? 0, 9)
    })
  })

  it('el tramo que toca el hueco del espejo va gris', () => {
    const b = barrasP0(d, pp, '15')
    const hueco = b.find((x) => x.rotulo.startsWith('23:30'))!
    expect(hueco.gris).toBe(true)
    expect(hueco.rotulo).toMatch(/sin lectura$/)
  })

  it('sin piezas una a una no hay reparto: todo el alto va en una sola pila', () => {
    for (const x of barrasP0(d, null, 'min')) expect(x.mant).toBe(0)
  })
})

describe('datos y opción del gráfico', () => {
  const d = a0430()
  const g = datosGrafico(d)

  it('las Baader van corridas el retraso hacia adelante; el grader se corta en el hueco', () => {
    const L = d.retraso.min
    expect(g.baader![200]).toBe(d.baader![200 - L])
    const h = g.huecos.find(([a]) => a > 100)!
    expect(new Date(T0 + h[0] * 60_000).toISOString().slice(11, 16)).toMatch(/^23:(3\d|4\d)$/)
    expect(g.grader[h[0]]).toBeNull()
  })

  it('el rótulo «sin lectura» sale a 1280 px y se oculta en una banda angosta a 375', () => {
    const rotulos = (px: number, v = { a: 0, b: 435 }) => {
      const o = opcionGrafico(g, v, '', TEMA, px) as { series: Array<{ id: string; markArea?: { data: Array<[{ label: { show: boolean } }]> } }> }
      return o.series.find((s) => s.id === 'baader')!.markArea!.data.map((x) => x[0].label.show)
    }
    expect(rotulos(1280)).toContain(true)
    expect(rotulos(375).every((x) => !x)).toBe(true)
  })

  it('con más de 60 min a la vista, raya de 3,5 % en el panel de P0; con 60, no', () => {
    const raya = (v: { a: number; b: number }) => {
      const o = opcionGrafico(g, v, '', TEMA, 1280) as { series: Array<{ id: string; markLine?: unknown }> }
      return o.series.find((s) => s.id === 'p0')!.markLine != null
    }
    expect(raya({ a: 0, b: 435 })).toBe(true)
    expect(raya({ a: 375, b: 435 })).toBe(false)
  })

  it('el minimapa abarca todo el turno y el dataZoom lleva la ventana (una sola fuente de verdad)', () => {
    const v = { a: 375, b: 435 }
    const o = opcionGrafico(g, v, '', TEMA, 375) as {
      xAxis: Array<{ min: number; max: number }>
      dataZoom: Array<{ id: string; startValue: number; endValue: number }>
    }
    for (const x of o.xAxis) { expect(x.min).toBe(0); expect(x.max).toBe(g.hasta) }
    const slider = o.dataZoom.find((z) => z.id === 'dz-slider')!
    expect([slider.startValue, slider.endValue]).toEqual([v.a, v.b])
  })

  it('conAlfa pasa rgb() a rgba() y deja otros formatos', () => {
    expect(conAlfa('rgb(46, 117, 182)', 0.2)).toBe('rgba(46, 117, 182, 0.2)')
    expect(conAlfa('#2e75b6', 0.2)).toBe('#2e75b6')
  })

  it('sin piezas una a una (sin pesca), el gráfico se arma igual', () => {
    const g2 = datosGrafico(a0430(false))
    expect(g2.porPieza).toBeNull()
    expect(() => opcionGrafico(g2, { a: 0, b: 435 }, '', TEMA, 375)).not.toThrow()
  })
})

describe('zoomAncla (rueda, pellizco y arrastre)', () => {
  it('acerca dejando fijo el minuto bajo el cursor', () => {
    const v = zoomAncla({ a: 0, b: 400 }, 0.5, 0.25, 435)
    expect(v).toEqual({ a: 50, b: 250 }) // el minuto 100 (25 %) sigue al 25 % del ancho
  })
  it('aleja y respeta los bordes del turno', () => {
    expect(zoomAncla({ a: 100, b: 200 }, 10, 0.5, 435)).toEqual({ a: 0, b: 435 })
  })
  it('no baja del zoom mínimo', () => {
    const v = zoomAncla({ a: 100, b: 110 }, 0.01, 0.5, 435)
    expect(v.b - v.a).toBe(ZOOM_MIN_MIN)
  })
  it('el desplazamiento mueve la ventana sin cambiar su largo', () => {
    expect(zoomAncla({ a: 100, b: 160 }, 1, 0.5, 435, 20)).toEqual({ a: 120, b: 180 })
  })
})
