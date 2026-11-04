/**
 * DesglosePiezas (A2-2a): el «Ver desglose» de la franja con el turno real de Chonchi (noche 03-11, Evisceradora 1 con perilla 17). Las
 * cifras esperadas son las del spec (calibración del 04-11) y las del desglose de A2-1a; se escriben a mano, no salen del código que se
 * prueba. Lo que no es cifra (nombres, sufijos, la detención de la línea) se prueba con casos chicos.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import { DesglosePiezas } from '../DesglosePiezas'
import { detencionLinea, nombreCausa, sufijoRitmo, tiempoTexto } from '../desgloseVista'
import { desgloseDe, type Desglose } from '../desglose'
import type { ParadaDetalle, TipoParada } from '../ritmoVivo'
import type { VaraUmbral } from '../perilla'

const ev1 = fixture.maquinas.find((m) => m.nombre === 'Evisceradora 1')!
const N = ev1.cycles.length
const con = ev1.det.map((s) => s > 0)
const razon = ev1.raz.map((i) => (i >= 0 ? (fixture.razones[i] ?? null) : null))
const VARA: VaraUmbral = { cpm: 17, fuente: 'perilla', modo: 'calibrado' }

/* Las paradas que el desglose necesita para nombrar y agrupar: una por motivo, con su tipo (como `paradasDetalle`). */
const TIPO_DE: Record<string, TipoParada> = {
  COLACION: 'programada',
  'EJERCICIO COMPENSATORIO - Paro': 'programada',
  'REUNION INICIO TURNO': 'programada',
  'Micro Detencion': 'micro',
}
const paradas: ParadaDetalle[] = [...new Set(razon.filter((r): r is string => r != null))].map((r) => ({
  tipo: TIPO_DE[r] ?? 'detencion', iniMs: 0, finMs: 0, durS: 0, inicioCrudoMs: 0, razon: r,
}))

const desglose = (): Desglose => desgloseDe({ cycles: ev1.cycles, n: N, vara: VARA, con, razon })!

afterEach(() => {
  cleanup()
  globalThis.localStorage?.clear()
})

const renderEv1 = (cambio = false) => render(
  <DesglosePiezas nombre="Evisceradora 1" linea={false} n={N} desglose={desglose()} vara={VARA} paradas={paradas} cambio={cambio} onCerrar={() => {}} />,
)

/** El % de la fila (la celda «N %» de la fila). */
const pctDeFila = (fila: Element): number => {
  const celda = Array.from(fila.querySelectorAll('span')).find((s) => /^\d+ %$/.test(s.textContent ?? ''))
  return Number(celda?.textContent?.replace(' %', ''))
}

describe('filas y porcentajes de la Evisceradora 1', () => {
  it('muestra las 19 filas, de 18 o más a 0 (la fila «18 o más» es el tope)', () => {
    const { container } = renderEv1()
    const filas = container.querySelectorAll('[data-fila]')
    expect(filas.length).toBe(19)
    expect(container.querySelector('[data-fila="v:18"]')?.textContent).toContain('18o más')
    expect(container.querySelector('[data-fila="v:0"]')?.textContent).toContain('0detenida')
  })

  it('a ritmo suma 61 %: 5 de 18 o más, 42 de 17 (perilla) y 14 de 16, la cifra del frente', () => {
    const { container } = renderEv1()
    const ritmo = container.querySelector('[data-zona="ritmo"]')!
    const filas = Array.from(ritmo.querySelectorAll('[data-fila]'))
    expect(filas.map((f) => pctDeFila(f))).toEqual([5, 42, 14])
    expect(filas.reduce((a, f) => a + pctDeFila(f), 0)).toBe(61)
    expect(ritmo.textContent).toContain('17perilla')
  })

  it('todo suma 100 %: las filas de todas las zonas y el total del turno', () => {
    const { container, getAllByText } = renderEv1()
    const todas = Array.from(container.querySelectorAll('[data-fila]'))
    expect(todas.reduce((a, f) => a + pctDeFila(f), 0)).toBe(100)
    expect(getAllByText('100 %').length).toBeGreaterThan(0)
  })

  it('cada zona suma su % y las filas bajo 16 suman lo que dice el pie del spec', () => {
    const { container } = renderEv1()
    /* «Bajo U» explica todos sus minutos: 111 con 0 < pieza < 16 = 22 con detención registrada + 89 sin ella (15 de marcha inicial y 74 de falta). */
    expect(container.textContent).toContain('Bajo 16: 111 min, 22 con detención registrada y 89 sin ella (15 de marcha inicial y 74 de falta de pescado).')
    /* Descuenta TODAS las programadas del fixture (colación 56 + reunión 2 + ejercicio 4 = 62 min), no solo la colación. */
    expect(container.textContent).toContain('Sin la detención programada: a ritmo 276 de 393 min (70 %).')
    expect(container.textContent).not.toContain('Sin colación')
  })

  it('el «de Y» del pie es el tiempo de producción de la cascada (produccionMin), no el turno menos la programada', () => {
    const { container } = render(
      <DesglosePiezas nombre="Evisceradora 1" linea={false} n={N} desglose={desglose()} vara={VARA} paradas={paradas} produccionMin={399} cambio={false} onCerrar={() => {}} />,
    )
    expect(container.textContent).toContain('Sin la detención programada: a ritmo 276 de 399 min (69 %).')
  })
})

describe('unidad min | h', () => {
  it('en h, los 455 minutos son 7 h 35 en el total, en el subtítulo y en la cabecera; el selector se recuerda', () => {
    const { container, getByText } = renderEv1()
    const grupo = container.querySelector('[role="group"][aria-label="Unidad del tiempo"]')!
    fireEvent.click(grupo.querySelectorAll('button')[1]!)
    expect(getByText('7 h 35')).toBeTruthy()
    expect(container.textContent).toContain('7 h 35 del turno · perilla 17 pz/min')
    expect(container.textContent).toContain('horas')
    expect(globalThis.localStorage?.getItem('monitor.desglose.unidad')).toBe('h')
  })

  it('en min, el total son 455 y el subtítulo dice minutos del turno', () => {
    const { container } = renderEv1()
    expect(container.textContent).toContain('455 minutos del turno · perilla 17 pz/min')
    expect(tiempoTexto(455, 'min')).toBe('455')
    expect(tiempoTexto(455, 'h')).toBe('7 h 35')
  })
})

describe('detención: el detalle de la fila 0 y sus causas', () => {
  it('«Ver detalle» muestra colación 55 min, y las causas en programadas, micro y otras detenciones', () => {
    const { container, getByText } = renderEv1()
    fireEvent.click(getByText('Ver detalle', { exact: false }))
    expect(container.textContent).toContain('colación 55 min · otras programadas 4 · micro 2 · otras detenciones 7')
    for (const grupo of ['programadas', 'micro', 'otras detenciones']) {
      expect(container.textContent).toContain(grupo)
    }
    expect(container.textContent).toContain('Ocultar detalle')
  })

  it('la limpieza de ducto marcada «programada» por el legado va en otras detenciones, no en programadas (B-2)', () => {
    /* `paradasDetalle` la marca programada (legado LIMPIEZA); la fila 0 tiene 4 min de limpieza y 3 de ajuste del operador. */
    const legado = paradas.map((p) => (p.razon === 'Limpieza de Ducto' ? { ...p, tipo: 'programada' as const } : p))
    const { container, getByText } = render(
      <DesglosePiezas nombre="Evisceradora 1" linea={false} n={N} desglose={desglose()} vara={VARA} paradas={legado} cambio={false} onCerrar={() => {}} />,
    )
    fireEvent.click(getByText('Ver detalle', { exact: false }))
    expect(container.textContent).toContain('colación 55 min · otras programadas 4 · micro 2 · otras detenciones 7')
  })

  it('las causas reparten el % de la fila 0: colación 12 % de los 15 %', () => {
    const { container, getByText } = renderEv1()
    fireEvent.click(getByText('Ver detalle', { exact: false }))
    const colacion = Array.from(container.querySelectorAll('div')).find((d) => d.textContent?.startsWith('Colación') && d.textContent.includes('55'))!
    expect(colacion.textContent).toContain('12 %')
  })

  it('el nombre de la causa sale de la taxonomía, sin « - Paro»', () => {
    expect(nombreCausa('COLACION')).toBe('Colación')
    expect(nombreCausa('EJERCICIO COMPENSATORIO - Paro')).toBe('Ejercicio compensatorio')
    expect(nombreCausa('AJUSTE OPERADOR')).toBe('Ajuste operador')
    /* Un motivo que la taxonomía no conoce sale en minúsculas (A2-2b). */
    expect(nombreCausa('Limpieza de Ducto')).toBe('limpieza de ducto')
  })
})

describe('aviso de la vara que cambió y textos de la vara', () => {
  it('si la perilla cambió en el turno, dice que el desglose usa la vigente', () => {
    const { container } = renderEv1(true)
    expect(container.textContent).toContain('La perilla cambió durante el turno: el desglose usa la vigente (17).')
  })

  it('el rótulo «a ritmo» dice de dónde sale el umbral', () => {
    expect(sufijoRitmo({ cpm: 17, fuente: 'perilla', modo: 'calibrado' }, false)).toBe('(perilla − 1)')
    expect(sufijoRitmo({ cpm: 17, fuente: 'perilla', modo: 'optimo' }, false)).toBe('(la perilla)')
    expect(sufijoRitmo({ cpm: 16, fuente: 'shoplogix' }, false)).toBe('(75 % de la meta)')
    expect(sufijoRitmo({ cpm: 49, fuente: 'perilla', modo: 'calibrado' }, true)).toBe('(suma de umbrales)')
    expect(sufijoRitmo({ cpm: 49, fuente: 'shoplogix' }, true)).toBe('(75 % de la vara)')
  })
})

describe('detención de la línea: la suma de sus Baaders', () => {
  const minuto = (ini: number, fin: number, razon: string): ParadaDetalle => ({
    tipo: 'detencion', iniMs: ini, finMs: fin, durS: (fin - ini) / 1000, inicioCrudoMs: ini, razon,
  })
  const T0 = Date.UTC(2026, 10, 4, 1, 0, 0)

  it('un minuto está detenido si alguna Baader lo está; su motivo es el de la Baader con más segundos detenidos', () => {
    const a = [minuto(T0, T0 + 60_000, 'AJUSTE OPERADOR')]
    const b = [minuto(T0, T0 + 30_000, 'COLACION')]
    const { con: c, razon: r } = detencionLinea([a, b], T0, 2)
    expect(c).toEqual([true, false])
    expect(r).toEqual(['AJUSTE OPERADOR', null])
  })

  it('sin paradas, ningún minuto está detenido', () => {
    const { con: c, razon: r } = detencionLinea([undefined, []], T0, 3)
    expect(c).toEqual([false, false, false])
    expect(r).toEqual([null, null, null])
  })
})
