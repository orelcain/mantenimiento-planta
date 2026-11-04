/**
 * El globo de la micro con los casos REALES del 02-11-2026 (Chonchi Turno 2 y Filete Turno Día) y los textos de la spec del PR 3: lo que el usuario lee, línea
 * por línea, con sus marcas (① ✕ ▼ ▽ y la píldora «en observación»). Por defecto el globo trae TRES piezas (encabezado en una línea, UNA línea de causa y la
 * tabla de pz/min); «Ver detalle» parte cerrado y abre la forma, la observación, la leyenda de ▽, las reglas que no aplicaron y el pie. Cada cifra sale del
 * doc, no se escribe a mano.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { calibracionDe } from '../causasCalibracion'
import { GloboMicro } from '../GraficoRitmoVivo'
import type { MicroClasificada } from '../microCausa'
import { CHONCHI_0211_T2, FILETE_0211_DIA, buscarMicro, clasificarDoc, type DocMicro } from './microFixtures'
import { lineasDelGlobo } from './globoTexto'

afterEach(() => cleanup())

const chonchi = clasificarDoc(CHONCHI_0211_T2, { planta: 'chonchi' })
const filete = clasificarDoc(FILETE_0211_DIA, { planta: 'filete' })
/** `fijo` (PC, un clic en la marca): el globo recibe el mouse y trae el botón «Ver detalle»; sin él (solo el mouse encima) trae una pista en vez del botón. */
const globoDe = (q: MicroClasificada, { compacto = false, abierto = false, planta = 'chonchi', fijo = true, onCerrar = () => {} } = {}) => {
  render(<GloboMicro q={q} compacto={compacto} fijo={compacto ? undefined : fijo} onCerrar={onCerrar} cal={calibracionDe(planta)} />)
  const globo = screen.getByRole(compacto || fijo ? 'group' : 'tooltip')
  if (abierto) fireEvent.click(globo.querySelector('.gm-ver')!)
  return globo
}

describe('GloboMicro v3 · casos reales', () => {
  it('Chonchi 15:10:00 Ev 1 · «Otra Baader paró · a la vez»: por defecto, encabezado en una línea, UNA línea de causa con su ① y la tabla; «Ver detalle» cerrado', () => {
    expect(lineasDelGlobo(globoDe(buscarMicro(chonchi, '15:10:00', 'Evisceradora 1')))).toEqual([
      'Ev 1 · micro de 45 s (+~20 s sin anotar) · 15:10:00',
      'Causa posible: Otra Baader paró · Ev 2 con micro a la vez ①',
      'pz/min | 15:08 | 15:09 | 15:10 | 15:11 | Esperado',
      'Ev 1 | 14 | ▽ 10 | ① ▼ 5 | 11 | 18',
      'Ev 2 | 15 | ▽ 12 | ① ▼ 5 | 15 | 16',
      'Ev 3 | 16 | 14 | 8 | 16 | 16',
      'Ver detalle (cerrado)',
    ])
  })

  it('Chonchi 15:10:00 Ev 1, con «Ver detalle» abierto: la forma con su duración, la leyenda de ▽, las reglas que no aplicaron (✕) y el pie', () => {
    expect(lineasDelGlobo(globoDe(buscarMicro(chonchi, '15:10:00', 'Evisceradora 1'), { abierto: true })).slice(6)).toEqual([
      'Ver detalle (abierto)',
      'Forma: a la vez. Ev 1 45 s · Ev 2 30 s.',
      '▽ la detención pudo empezar en este minuto: Shoplogix la anota con 15 a 30 s de atraso',
      '✕ No es arranque: la última detención de 10 min o más de Ev 1 terminó a las 13:35',
      '✕ No es «Al volver de una detención»: la última detención de Ev 1 terminó hace 9 min 30 s',
      'Causa posible no prueba que eso la provocó: lo calcula el monitor y se confirma en terreno.',
    ])
  })

  it('Chonchi 10:02:13 Ev 2 · «detención previa»: Ev 1 se detuvo 1 min 30 s antes por acumulación; el ① cae en la celda de esa detención (k − 2)', () => {
    const q = buscarMicro(chonchi, '10:02:13', 'Evisceradora 2')
    const cerrado = lineasDelGlobo(globoDe(q))
    expect(cerrado.slice(0, 2)).toEqual([
      'Ev 2 · micro de 60 s (+~20 s sin anotar) · 10:02:13',
      expect.stringMatching(/^Causa posible: Otra Baader paró · Ev 1 se detuvo 1 min 30 s antes por Acumulación.* ①$/),
    ])
    expect(cerrado[3]).toMatch(/^Ev 1 \| ① \d+ \|/)
    cleanup()
    expect(lineasDelGlobo(globoDe(q, { abierto: true })).slice(7)).toEqual([
      'Forma: detención previa. La detención de Ev 1 fue no programada y duró 1 min 30 s.',
      '▽ la detención pudo empezar en este minuto: Shoplogix la anota con 15 a 30 s de atraso',
      '✕ No es arranque: ya pasaron 10 min desde que Ev 2 empezó a producir (09:23) y no tuvo detenciones de 10 min o más',
      '✕ No es «Al volver de una detención»: la última detención de Ev 2 terminó hace 30 min 30 s',
      'Causa posible no prueba que eso la provocó: lo calcula el monitor y se confirma en terreno.',
    ])
  })

  it('Chonchi 15:19:45 Ev 1 · «en cadena»: Ev 2 y Ev 3 con micro 30 s después, y la forma con las tres duraciones', () => {
    const q = buscarMicro(chonchi, '15:19:45', 'Evisceradora 1')
    expect(lineasDelGlobo(globoDe(q))[1]).toBe('Causa posible: Otra Baader paró · Ev 2 y Ev 3 con micro 30 s después ①')
    cleanup()
    expect(lineasDelGlobo(globoDe(q, { abierto: true })).filter((l) => l.startsWith('Forma'))).toEqual(['Forma: en cadena. Ev 1 15 s · Ev 2 1 min 15 s · Ev 3 1 min.'])
  })

  it('Chonchi 15:18:45 Ev 1 · «Al volver de una detención» EN OBSERVACIÓN en Chonchi: la píldora en la línea de causa y la explicación en el detalle', () => {
    const q = buscarMicro(chonchi, '15:18:45', 'Evisceradora 1')
    expect(lineasDelGlobo(globoDe(q))[1]).toBe('Causa posible: Al volver de una detención · su detención terminó 1 min 15 s antes [en observación]')
    cleanup()
    const abierto = lineasDelGlobo(globoDe(q, { abierto: true }))
    expect(abierto.slice(6, 8)).toEqual([
      'Ver detalle (abierto)',
      'La detención de Ev 1 duró 2 min 30 s.',
    ])
    expect(abierto[8]).toBe('En observación: en Chonchi, en las 8 semanas al 02-11-2026, estas micro no fueron más seguidas que en cualquier otro momento del turno. No suman a la causa probable.')
    /* Sin calibración (otra línea) no hay píldora ni explicación de observación. */
    cleanup()
    const sinCal = lineasDelGlobo(globoDe(q, { planta: 'otra-linea', abierto: true }))
    expect(sinCal[1]).toBe('Causa posible: Al volver de una detención · su detención terminó 1 min 15 s antes')
    expect(sinCal.join('\n')).not.toMatch(/observación/)
  })

  it('Chonchi 10:17:43 Ev 1 · Sin contexto (en v4.8.0 salía «Ritmo bajo»): «Sin contexto · los datos aún no muestran su causa», sin «Causa posible» y con el pie «Los datos aún no la explican»', () => {
    const q = buscarMicro(chonchi, '10:17:43', 'Evisceradora 1')
    expect(lineasDelGlobo(globoDe(q)).slice(0, 2)).toEqual(['Ev 1 · micro de 15 s (+~20 s sin anotar) · 10:17:43', 'Sin contexto · los datos aún no muestran su causa'])
    cleanup()
    const abierto = lineasDelGlobo(globoDe(q, { abierto: true }))
    expect(abierto.slice(6)).toEqual([
      'Ver detalle (abierto)',
      '✕ No es arranque: ya pasaron 10 min desde que Ev 1 empezó a producir (09:23) y no tuvo detenciones de 10 min o más',
      '✕ No es «Otra Baader paró»: ninguna otra Baader se detuvo a ±15 s, las otras dos no tuvieron micro en cadena (entre 22,5 y 52,5 s antes o después) y no hubo una detención previa por acumulación, atascamiento, materia prima o ajuste del operador (entre 22,5 s y 2 min antes)',
      '✕ No es «Al volver de una detención»: la última detención de Ev 1 terminó hace 15 min 30 s',
      'Los datos aún no la explican. Hay que verlo en terreno.',
    ])
  })

  it('Filete 14:40:00 · Sin contexto: una sola fila en la tabla, sin «Otra Baader paró» entre las reglas y con el pie «Los datos aún no la explican»', () => {
    const q = buscarMicro(filete, '14:40:00', 'Linea 1')
    expect(lineasDelGlobo(globoDe(q, { planta: 'filete', abierto: true }))).toEqual([
      'Linea 1 · micro de 30 s (+~20 s sin anotar) · 14:40:00',
      'Sin contexto · los datos aún no muestran su causa',
      'pz/min | 14:38 | 14:39 | 14:40 | 14:41 | Esperado',
      'Linea 1 | 14 | ▽ 11 | ▼ 6 | 13 | 20',
      'Ver detalle (abierto)',
      '▽ la detención pudo empezar en este minuto: Shoplogix la anota con 15 a 30 s de atraso',
      '✕ No es arranque: la última detención de 10 min o más de Linea 1 terminó a las 14:16',
      '✕ No es «Al volver de una detención»: la última detención de Linea 1 terminó hace 23 min 30 s',
      'Los datos aún no la explican. Hay que verlo en terreno.',
    ])
  })

  it('Chonchi 15:13:00 Ev 1 · «a la vez» por detención: Ev 2 con micro y Ev 3 detenida 2 min 15 s, y ▽ también en el 5 de Ev 3', () => {
    const q = buscarMicro(chonchi, '15:13:00', 'Evisceradora 1')
    const l = lineasDelGlobo(globoDe(q, { abierto: true }))
    expect(l[1]).toMatch(/^Causa posible: Otra Baader paró · Ev 2 con micro a la vez y Ev 3 se detuvo a la vez .*①$/)
    expect(l.slice(2, 6)).toEqual([
      'pz/min | 15:11 | 15:12 | 15:13 | 15:14 | Esperado',
      'Ev 1 | 11 | ▽ 9 | ① ▼ 7 | 4 | 18',
      'Ev 2 | 15 | ▽ 7 | ① ▼ 7 | 5 | 16',
      'Ev 3 | 16 | ▽ 5 | ① 0 | 0 | 16',
    ])
    expect(l).toContain('Forma: a la vez. Ev 1 15 s · Ev 2 15 s · Ev 3 detención de 2 min 15 s.')
  })

  it('el celular (una columna) dice lo mismo que PC, con el botón de cerrar y sin la columna doble', () => {
    const q = buscarMicro(chonchi, '10:17:43', 'Evisceradora 1')
    const pc = lineasDelGlobo(globoDe(q, { abierto: true }))
    cleanup()
    const movil = globoDe(q, { compacto: true, abierto: true })
    expect(lineasDelGlobo(movil)).toEqual(pc)
    expect(movil.querySelector('.gm-cols')).toBeNull()
    expect(screen.getByRole('button', { name: 'Cerrar la lectura de la micro' })).toBeTruthy()
    expect(movil.getAttribute('aria-label')).toBe('Micro detención y su causa posible')
  })

  it('las marcas llevan el color de SU causa: ▼ y ▽ de «Otra Baader paró» en el de esa causa; los cuadros usan los tokens de causa', () => {
    const globo = globoDe(buscarMicro(chonchi, '15:10:00', 'Evisceradora 1'))
    const llenos = Array.from(globo.querySelectorAll('tbody [data-glifo="▼"] path')).map((p) => p.getAttribute('fill'))
    const huecos = Array.from(globo.querySelectorAll('tbody [data-glifo="▽"] path')).map((p) => p.getAttribute('stroke'))
    expect(llenos).toEqual(['var(--v2-ext)', 'var(--v2-ext)'])
    expect(huecos).toEqual(['var(--v2-ext)', 'var(--v2-ext)'])
    expect((globo.querySelector('.gm-causa4 .sw') as HTMLElement).style.background).toBe('var(--v2-ext)')
    cleanup()
    const volver = globoDe(buscarMicro(chonchi, '15:18:45', 'Evisceradora 1'))
    expect((volver.querySelector('.gm-causa4 .sw') as HTMLElement).style.background).toBe('var(--v2-causa-paro)')
    cleanup()
    const sin = globoDe(buscarMicro(filete, '14:40:00', 'Linea 1'), { planta: 'filete' })
    expect((sin.querySelector('.gm-causa4 .sw') as HTMLElement).style.background).toBe('var(--v2-causa-sin)')
  })

  it('el ▽ de una Baader cuya detención fue una detención (sin ▼ propio en k) toma el color de la causa del globo', () => {
    const globo = globoDe(buscarMicro(chonchi, '15:13:00', 'Evisceradora 1'))
    /* Ev 3 no tiene micro en 15:13 (lo suyo es una detención): no hay ▼ en su fila, pero sí ▽ en 15:12. */
    const fila3 = Array.from(globo.querySelectorAll('tbody tr'))[2]!
    expect(fila3.querySelectorAll('[data-glifo="▼"]')).toHaveLength(0)
    const hueco = fila3.querySelector('[data-glifo="▽"] path')!
    expect(hueco.getAttribute('stroke')).toBe('var(--v2-ext)')
  })
})

describe('GloboMicro v3 · «Ver detalle»: cerrado por defecto y se abre con clic, toque y teclado', () => {
  const q = () => buscarMicro(chonchi, '15:10:00', 'Evisceradora 1')

  it('parte cerrado: el botón dice aria-expanded=false y el detalle no está en el árbol', () => {
    const globo = globoDe(q())
    const b = screen.getByRole('button', { name: /Ver detalle/ })
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(globo.querySelector('.gm-dc')).toBeNull()
    expect(b.getAttribute('aria-controls')).toBeTruthy()
  })

  it('con un clic abre, con otro cierra, y el botón controla el detalle', () => {
    const globo = globoDe(q())
    const b = screen.getByRole('button', { name: /Ver detalle/ })
    fireEvent.click(b)
    expect(b.getAttribute('aria-expanded')).toBe('true')
    const dc = globo.querySelector('.gm-dc')!
    expect(dc).toBeTruthy()
    expect(dc.id).toBe(b.getAttribute('aria-controls'))
    fireEvent.click(b)
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(globo.querySelector('.gm-dc')).toBeNull()
  })

  it('con el dedo (celular, una columna): un toque lo abre', () => {
    globoDe(q(), { compacto: true })
    const b = screen.getByRole('button', { name: /Ver detalle/ })
    /* Un toque es touchstart + touchend + el clic que el navegador sintetiza. */
    fireEvent.touchStart(b)
    fireEvent.touchEnd(b)
    fireEvent.click(b)
    expect(b.getAttribute('aria-expanded')).toBe('true')
  })

  it('con el teclado: es un botón nativo que se alcanza con Tab (tabIndex ≠ −1), recibe el foco y Enter/espacio disparan su clic', () => {
    globoDe(q())
    const b = screen.getByRole('button', { name: /Ver detalle/ }) as HTMLButtonElement
    expect(b.tagName).toBe('BUTTON')
    expect(b.type).toBe('button')
    expect(b.tabIndex).toBeGreaterThanOrEqual(0)
    b.focus()
    expect(document.activeElement).toBe(b)
    /* El navegador convierte Enter y espacio sobre un botón en un clic: es lo que dispara `.click()`. */
    act(() => { b.click() })
    expect(b.getAttribute('aria-expanded')).toBe('true')
  })

  it('PC con el mouse solo encima de la marca: NO hay botón «Ver detalle» (el globo no recibe el mouse); una pista que no es botón dice cómo abrirlo', () => {
    const globo = globoDe(q(), { fijo: false })
    expect(screen.queryByRole('button')).toBeNull()
    expect(globo.querySelector('.gm-ver')).toBeNull()
    expect(globo.querySelector('.gm-dc')).toBeNull()
    expect(lineasDelGlobo(globo).slice(-1)).toEqual(['(pista) Clic en la marca para ver el detalle'])
    expect(globo.querySelector('.gm-pista')!.tagName).toBe('P')
    expect(globo.className).toContain('pointer-events-none')
  })

  it('PC con el globo fijo: el botón real «Ver detalle» con 44 px de toque (`tap-44`, como la ✕) y una ✕ que cierra, también de 44 px', () => {
    const cerrar = vi.fn()
    const globo = globoDe(q(), { fijo: true, onCerrar: cerrar })
    const ver = screen.getByRole('button', { name: /Ver detalle/ })
    expect(ver.className).toContain('tap-44')
    expect(globo.querySelector('.gm-pista')).toBeNull()
    const x = screen.getByRole('button', { name: 'Cerrar la lectura de la micro' })
    expect(x.className).toContain('tap-44')
    fireEvent.click(x)
    expect(cerrar).toHaveBeenCalledTimes(1)
    expect(globo.className).toContain('fijo')
  })

  it('en el celular «Ver detalle» también lleva `tap-44`; y al soltar el globo fijo (vuelve a flotar) el detalle abierto se cierra', () => {
    globoDe(q(), { compacto: true })
    expect(screen.getByRole('button', { name: /Ver detalle/ }).className).toContain('tap-44')
    cleanup()
    const { rerender } = render(<GloboMicro q={q()} cal={calibracionDe('chonchi')} fijo />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalle/ }))
    expect(document.querySelector('.gm-dc')).not.toBeNull()
    rerender(<GloboMicro q={q()} cal={calibracionDe('chonchi')} fijo={false} />)
    expect(document.querySelector('.gm-dc')).toBeNull()
    rerender(<GloboMicro q={q()} cal={calibracionDe('chonchi')} fijo />)
    expect(screen.getByRole('button', { name: /Ver detalle/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('al abrir «Ver detalle» el globo crece y se trae a la vista entero (`scrollIntoView` lo mínimo); cerrado no se mueve, y cerrarlo no vuelve a moverlo', () => {
    const visto = vi.fn()
    const antes = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = visto
    try {
      globoDe(q(), { compacto: true })
      expect(visto).not.toHaveBeenCalled()
      const b = screen.getByRole('button', { name: /Ver detalle/ })
      fireEvent.click(b)
      expect(visto).toHaveBeenCalledTimes(1)
      expect(visto.mock.calls[0]![0]).toMatchObject({ block: 'nearest' })
      expect(visto.mock.instances[0]).toBe(screen.getByRole('group'))
      fireEvent.click(b)
      expect(visto).toHaveBeenCalledTimes(1)
    } finally {
      HTMLElement.prototype.scrollIntoView = antes
    }
  })

  it('«en observación» dice el motivo que es: sin exceso (Chonchi, «Al volver») o pocas micro (Yal, «en cadena», 15 en las 8 semanas) — dos mensajes opuestos', () => {
    const volver = buscarMicro(chonchi, '15:18:45', 'Evisceradora 1')
    const a = lineasDelGlobo(globoDe(volver, { abierto: true }))
    expect(a).toContain('En observación: en Chonchi, en las 8 semanas al 02-11-2026, estas micro no fueron más seguidas que en cualquier otro momento del turno. No suman a la causa probable.')
    cleanup()
    /* La misma forma «en cadena» con la calibración de Yal: en observación porque hubo solo 15 micro así, no porque no hayan sido más seguidas. */
    const cadena = buscarMicro(chonchi, '15:19:45', 'Evisceradora 1')
    const b = lineasDelGlobo(globoDe(cadena, { abierto: true, planta: 'yal' }))
    expect(b).toContain('En observación: en Yal, en las 8 semanas, hubo solo 15 micro así, muy pocas para estimar. No suman a la causa probable.')
    expect(b.join('\n')).not.toMatch(/no fueron más seguidas/)
    expect(b[1]).toMatch(/\[en observación\]$/)
    cleanup()
    /* En Chonchi esa misma forma está activa: ni píldora ni explicación. */
    const c = lineasDelGlobo(globoDe(cadena, { abierto: true }))
    expect(c.join('\n')).not.toMatch(/observación/)
  })

  it('un globo fijo (PC, un clic en la marca) recibe el mouse; el que flota no lo frena', () => {
    const { unmount } = render(<GloboMicro q={q()} cal={calibracionDe('chonchi')} />)
    expect(screen.getByRole('tooltip').className).toContain('pointer-events-none')
    unmount()
    render(<GloboMicro q={q()} cal={calibracionDe('chonchi')} fijo />)
    const g = screen.getByRole('group')
    expect(g.className).not.toContain('pointer-events-none')
    expect(g.hasAttribute('data-globo-minuto')).toBe(true)
  })
})

describe('GloboMicro v3 · la leyenda de ▽ solo sale cuando la tabla muestra un ▽ (339 micro reales de los 10 turnos validados)', () => {
  it('con «Ver detalle» abierto, la leyenda está si y solo si hay al menos un ▽ en la tabla; y nunca hay ▽ sin su leyenda', () => {
    const leer = <T,>(archivo: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', archivo), 'utf8')) as T
    const { turnos } = leer<{ turnos: Array<{ id: string; planta: 'Chonchi' | 'Filete'; doc: Omit<DocMicro, '_fuente'> }> }>('turnos_validados.json')
    const todos = [
      { id: 'T2', planta: 'Chonchi' as const, doc: CHONCHI_0211_T2 as Omit<DocMicro, '_fuente'> },
      { id: 'Dia', planta: 'Filete' as const, doc: FILETE_0211_DIA as Omit<DocMicro, '_fuente'> },
      ...turnos,
    ]
    let n = 0
    let conLeyenda = 0
    let sinLeyenda = 0
    for (const t of todos) {
      const slug = t.planta === 'Chonchi' ? 'chonchi' : 'filete'
      for (const q of clasificarDoc({ _fuente: t.id, ...t.doc }, { planta: slug })) {
        const { container, unmount } = render(<GloboMicro q={q} fijo onCerrar={() => {}} cal={calibracionDe(slug)} />)
        fireEvent.click(container.querySelector('.gm-ver')!)
        const triangulos = container.querySelectorAll('tbody [data-glifo="▽"]').length
        const leyenda = container.querySelectorAll('.gm-ley-tri').length
        expect(leyenda > 0, `${t.planta} ${t.id} ${q.nombre} ${q.inicioMs}: ▽ en la tabla = ${triangulos}, leyenda = ${leyenda}`).toBe(triangulos > 0)
        if (leyenda > 0) conLeyenda++
        else sinLeyenda++
        unmount()
        n++
      }
    }
    expect(n).toBe(339)
    /* El caso existe en los dos sentidos: hay globos con ▽ y globos sin él. */
    expect(conLeyenda).toBeGreaterThan(0)
    expect(sinLeyenda).toBeGreaterThan(0)
  })
})

/**
 * Exporta el texto final de los globos (uno por bloque, con el caso en la primera línea) para el revisor de claridad. Solo corre si se pide la ruta de salida:
 * `TEXTOS_GLOBO_SALIDA=<ruta.txt> pnpm exec vitest run src/pages/monitor/__tests__/GloboMicro.reales.test.tsx`. Es el MISMO texto que los tests de arriba verifican
 * línea por línea. (Se escribe con fs en UTF-8: por un pipe de PowerShell se corrompen los acentos.)
 */
describe('GloboMicro · exportar los textos para el revisor', () => {
  it.skipIf(!process.env.TEXTOS_GLOBO_SALIDA)('escribe el texto de los casos reales en TEXTOS_GLOBO_SALIDA', () => {
    const casos = [
      { caso: 'CASO 1 · Chonchi, Turno 2 del 02-11 · Ev 1 15:10:00 · Otra Baader paró · a la vez', q: buscarMicro(chonchi, '15:10:00', 'Evisceradora 1'), planta: 'chonchi' },
      { caso: 'CASO 2 · Chonchi, Turno 2 del 02-11 · Ev 2 10:02:13 · Otra Baader paró · detención previa', q: buscarMicro(chonchi, '10:02:13', 'Evisceradora 2'), planta: 'chonchi' },
      { caso: 'CASO 3 · Chonchi, Turno 2 del 02-11 · Ev 1 15:18:45 · Al volver de una detención (en observación)', q: buscarMicro(chonchi, '15:18:45', 'Evisceradora 1'), planta: 'chonchi' },
      { caso: 'CASO 4 · Filete, Turno Día del 02-11 · Linea 1 14:40:00 · Sin contexto', q: buscarMicro(filete, '14:40:00', 'Linea 1'), planta: 'filete' },
    ]
    const bloques = casos.map(({ caso, q, planta }) => {
      const lineas = lineasDelGlobo(globoDe(q, { abierto: true, planta }))
      cleanup()
      return [caso, ...lineas].join('\n')
    })
    writeFileSync(process.env.TEXTOS_GLOBO_SALIDA!, `${bloques.join('\n\n')}\n`, 'utf8')
    expect(bloques).toHaveLength(4)
  })
})
