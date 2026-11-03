/**
 * El resumen de las causas de las micro bajo el carril «Micro» (`ResumenCausas.tsx`, variante V2 del mockup p4 con los arreglos de la prueba de 5 s):
 * la cifra «~8 de 46», la barra con lo probable en sólido y lo posible rayado, la leyenda, el rótulo «micro · tiempo detenido» y los chips cuya marca es el
 * mismo dibujo de su tramo. Con los datos reales de Chonchi, Turno 2 del 02-11-2026 (46 micro: 3 · 18 · 1 · 24) y la calibración de Chonchi.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { calibracionDe } from '../causasCalibracion'
import { GloboMicro } from '../GraficoRitmoVivo'
import { ResumenCausasMicro } from '../ResumenCausas'
import { CHONCHI_0211_T2, FILETE_0211_DIA, clasificarDoc, type DocMicro } from './microFixtures'
import { PROHIBIDAS } from './vocabulario'

afterEach(() => cleanup())

const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ')
const micros = clasificarDoc(CHONCHI_0211_T2, { planta: 'chonchi' })
const cal = calibracionDe('chonchi')
const resumen = (extra: Partial<Parameters<typeof ResumenCausasMicro>[0]> = {}) =>
  render(<ResumenCausasMicro micros={micros} planta="chonchi" cal={cal} microTotal={null} nBaader={3} {...extra} />)

describe('ResumenCausasMicro · Chonchi 02-11 Turno 2', () => {
  it('la cifra dice «~8 de 46 · con causa probable · estimado» (en el celular, «est.»)', () => {
    const { container } = resumen()
    expect(sp(container.querySelector('.rv-cz-cifra')!.textContent)).toBe('~8 de 46')
    expect(sp(container.querySelector('.rv-cz-rot')!.textContent)).toBe('con causa probable · estimadoest.')
    expect(sp(container.querySelector('.rv-cz-rot .solo-pc')!.textContent)).toBe('estimado')
    expect(sp(container.querySelector('.rv-cz-rot .solo-mv')!.textContent)).toBe('est.')
    /* La cifra y «de 46» no se parten entre renglones: espacio duro. */
    expect(container.querySelector('.rv-cz-de')!.textContent).toContain('\u00a0')
  })

  it('con el total del turno conocido, junto a la cifra va «(+M de 0 s)»; con el total igual a las que se ven, no', () => {
    expect(sp(resumen({ microTotal: 53 }).container.querySelector('.rv-cz-cifra')!.textContent)).toBe('~8 de 46 (+7 de 0 s)')
    cleanup()
    expect(sp(resumen({ microTotal: 46 }).container.querySelector('.rv-cz-cifra')!.textContent)).toBe('~8 de 46')
  })

  it('los chips dicen cuántas son probables y el tiempo detenido: «Arranque ~1 de 3 · 1 min 15 s», «Otra Baader paró ~7 de 18 · 11 min 30 s», «Al volver de una detención 1 · 15 s» y «Sin contexto 24 · 10 min 45 s»', () => {
    const { container } = resumen()
    expect(Array.from(container.querySelectorAll('.rv-mc-chip')).map((c) => sp(c.textContent))).toEqual([
      'Arranque ~1 de 3 · 1 min 15 s',
      'Otra Baader paró ~7 de 18 · 11 min 30 s',
      'Al volver de una detención 1 · 15 sen observación',
      'Sin contexto 24 · 10 min 45 s',
    ])
    /* El tiempo lleva rótulo: una línea muted sobre los chips. */
    expect(sp(container.querySelector('.rv-cz-rotchips')!.textContent)).toBe('micro · tiempo detenido')
  })

  it('la píldora «en observación» sale solo en la causa cuyas micro son de una forma en observación (en Chonchi, «Al volver de una detención»)', () => {
    const { container } = resumen()
    const pildoras = Array.from(container.querySelectorAll('.rv-mc-chip .pill')).map((p) => [p.closest('.rv-mc-chip')!.getAttribute('data-causa'), sp(p.textContent)])
    expect(pildoras).toEqual([['paro', 'en observación']])
    /* En Yal esa misma forma está activa: no hay píldora, y la cifra de la causa lleva «~». */
    cleanup()
    const yal = render(<ResumenCausasMicro micros={micros} planta="yal" cal={calibracionDe('yal')} microTotal={null} nBaader={3} />)
    expect(yal.container.querySelectorAll('.rv-mc-chip .pill')).toHaveLength(0)
    expect(sp(yal.container.querySelector('.rv-mc-chip[data-causa="paro"]')!.textContent)).toBe('Al volver de una detención ~0 de 1 · 15 s')
  })

  it('la barra: un tramo por causa, de ancho PROPORCIONAL a las micro (3 · 18 · 1 · 24), en el orden Arranque → Otra Baader paró → Al volver → Sin contexto', () => {
    const { container } = resumen()
    const tramos = Array.from(container.querySelectorAll('.rv-cz-barra .s')) as HTMLElement[]
    expect(tramos.map((t) => [t.getAttribute('data-causa'), Number(t.style.flexGrow)])).toEqual([['arranque', 3], ['linea', 18], ['paro', 1], ['sin', 24]])
    /* Los anchos son proporcionales: flex-grow = micro, flex-basis 0 (en la hoja de estilos). */
    const suma = tramos.reduce((a, t) => a + Number(t.style.flexGrow), 0)
    expect(suma).toBe(46)
    /* Dentro de cada causa, lo probable es sólido y lo posible va rayado, también proporcionales: Arranque 1 + 2, Otra Baader paró 7 + 11. */
    const partes = (t: HTMLElement) => Array.from(t.children).map((c) => [c.tagName, Number((c as HTMLElement).style.flexGrow)])
    expect(partes(tramos[0]!)).toEqual([['B', 1], ['U', 2]])
    expect(partes(tramos[1]!)).toEqual([['B', 7], ['U', 11]])
    /* Una causa en observación va TODA rayada (sin parte sólida) y «Sin contexto» solo con contorno. */
    expect(partes(tramos[2]!)).toEqual([['U', 1]])
    expect(tramos[3]!.classList.contains('borde')).toBe(true)
    expect(tramos[3]!.children).toHaveLength(0)
    expect(container.querySelector('.rv-cz-barra')!.getAttribute('role')).toBe('img')
    /* Para quien no la ve: cuántas son probables de cada causa, y la causa en observación solo con su cantidad. */
    expect(container.querySelector('.rv-cz-barra')!.getAttribute('aria-label')).toBe('46 micro: ~1 de 3 Arranque, ~7 de 18 Otra Baader paró, 1 Al volver de una detención, 24 Sin contexto')
  })

  it('las hojas de estilo dibujan lo que dice el spec: barra de 16 px, 2 px entre causas, rayado a 135° de 1,5 px cada 4,5 px, contorno interior de 1 px y de 1,5 px para «Sin contexto»', () => {
    const css = readFileSync(resolve(__dirname, '..', 'monitorGlass.css'), 'utf8')
    expect(css).toMatch(/\.rv-cz-barra \{ display: flex; gap: 2px; height: 16px;/)
    expect(css).toContain('repeating-linear-gradient(135deg, var(--c) 0 1.5px, transparent 1.5px 4.5px)')
    expect(css).toContain('box-shadow: inset 0 0 0 1px var(--c)')
    expect(css).toContain('.rv-cz-barra .s.borde { background: none; box-shadow: inset 0 0 0 1.5px var(--c); }')
    expect(css).toMatch(/\.rv-cz-cifra \{ font-size: 34px; line-height: 38px; font-weight: 600;/)
    expect(css).toMatch(/\.rv-cz-rotchips \{[^}]*font-size: 12px/)
  })

  it('la marca de cada chip es el MISMO dibujo de su tramo: sólido y rayado, rayado, contorno', () => {
    const { container } = resumen()
    const marca = (k: string) => container.querySelector(`.rv-mc-chip[data-causa="${k}"] .rv-sw`)!
    expect(marca('arranque').getAttribute('data-marca')).toBe('mixto')
    expect(marca('arranque').children).toHaveLength(2)
    expect(marca('linea').getAttribute('data-marca')).toBe('mixto')
    expect(marca('paro').getAttribute('data-marca')).toBe('rayado')
    expect(marca('sin').getAttribute('data-marca')).toBe('borde')
    /* El color es el de la causa en los chips y en los tramos. */
    expect((marca('linea') as HTMLElement).style.getPropertyValue('--c')).toBe('var(--v2-ext)')
    expect((container.querySelector('.rv-cz-barra .s[data-causa="linea"]') as HTMLElement).style.getPropertyValue('--c')).toBe('var(--v2-ext)')
  })

  it('la leyenda «■ causa probable · ▨ causa posible» va bajo la barra', () => {
    const { container } = resumen()
    const ley = container.querySelector('.rv-cz-ley')!
    expect(ley.querySelector('.lg.sol')).not.toBeNull()
    expect(ley.querySelector('.lg.ray')).not.toBeNull()
    expect(sp(ley.textContent)).toBe('causa probablecausa posible')
  })

  it('sin calibración no hay «~»: «46 micro», chips con solo micro y tiempo, sin leyenda ni «con causa probable», y el ⓘ lo dice', () => {
    const { container } = resumen({ cal: null, planta: 'otra-linea' })
    expect(sp(container.querySelector('.rv-cz-cifra')!.textContent)).toBe('46 micro')
    expect(container.querySelector('.rv-cz-rot')).toBeNull()
    expect(container.querySelector('.rv-cz-ley')).toBeNull()
    expect(Array.from(container.querySelectorAll('.rv-mc-chip')).map((c) => sp(c.textContent))).toEqual([
      'Arranque 3 · 1 min 15 s', 'Otra Baader paró 18 · 11 min 30 s', 'Al volver de una detención 1 · 15 s', 'Sin contexto 24 · 10 min 45 s',
    ])
    expect(container.querySelector('.pill')).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' })) })
    expect(sp(container.querySelector('.rv-cz-info')!.textContent)).toContain('Esta línea todavía no tiene calibración: no se estima la causa probable.')
  })

  it('el ⓘ abre con un clic y se cierra con Escape; trae las seis reglas en el orden en que se evalúan y «Este turno, Otra Baader paró 18 = a la vez 15 · en cadena 1 · detención previa 2.»', () => {
    const { container } = resumen()
    const b = screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' })
    expect(b.getAttribute('aria-expanded')).toBe('false')
    act(() => { fireEvent.click(b) })
    expect(b.getAttribute('aria-expanded')).toBe('true')
    const panel = container.querySelector('.rv-cz-info')!
    expect(Array.from(panel.querySelectorAll('ol li b')).map((x) => sp(x.textContent))).toEqual([
      'Arranque', 'Otra Baader paró · a la vez', 'Al volver de una detención', 'Otra Baader paró · en cadena', 'Otra Baader paró · detención previa', 'Sin contexto',
    ])
    expect(sp(panel.textContent)).toContain('Este turno, Otra Baader paró 18 = a la vez 15 · en cadena 1 · detención previa 2.')
    expect(sp(panel.textContent)).toContain('Causa probable (~8)')
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(container.querySelector('.rv-cz-info')).toBeNull()
  })

  it('con Yal el ⓘ dice «hasta 1 min 30 s» para «Al volver de una detención» (la calibración de Yal), y con Chonchi «hasta 2 min»', () => {
    const { container } = render(<ResumenCausasMicro micros={micros} planta="yal" cal={calibracionDe('yal')} microTotal={null} nBaader={3} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' })) })
    expect(sp(container.querySelector('.rv-cz-info')!.textContent)).toContain('Al volver de una detención: hasta 1 min 30 s después de que terminó una detención de esa misma Baader.')
    cleanup()
    const ch = resumen()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' })) })
    expect(sp(ch.container.querySelector('.rv-cz-info')!.textContent)).toContain('Al volver de una detención: hasta 2 min después de que terminó una detención de esa misma Baader.')
  })
})

describe('el render del resumen y del globo por defecto no dicen «casualidad», «azar», «paro» ni «parada(s)»', () => {
  it('el resumen cerrado y con el ⓘ abierto, en Chonchi con y sin calibración y en Filete', () => {
    const casos: Array<[string, Parameters<typeof ResumenCausasMicro>[0]]> = [
      ['Chonchi', { micros, planta: 'chonchi', cal, microTotal: 53, nBaader: 3 }],
      ['sin calibración', { micros, planta: null, cal: null, microTotal: 53, nBaader: 3 }],
      ['Yal', { micros, planta: 'yal', cal: calibracionDe('yal'), microTotal: null, nBaader: 3 }],
      ['Filete', { micros: clasificarDoc(FILETE_0211_DIA, { planta: 'filete' }), planta: 'filete', cal: calibracionDe('filete'), microTotal: 25, nBaader: 1 }],
    ]
    for (const [nombre, props] of casos) {
      const { container } = render(<ResumenCausasMicro {...props} />)
      expect(sp(container.textContent), `${nombre}, cerrado`).not.toMatch(PROHIBIDAS)
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' })) })
      expect(sp(container.textContent), `${nombre}, con el ⓘ abierto`).not.toMatch(PROHIBIDAS)
      for (const el of container.querySelectorAll('[title],[aria-label]')) expect(sp(`${el.getAttribute('title')} ${el.getAttribute('aria-label')}`), nombre).not.toMatch(PROHIBIDAS)
      cleanup()
    }
  })

  it('el globo por defecto (cerrado) de las 339 micro reales de los 10 turnos validados', () => {
    const leer = <T,>(archivo: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', archivo), 'utf8')) as T
    const { turnos } = leer<{ turnos: Array<{ id: string; planta: 'Chonchi' | 'Filete'; doc: Omit<DocMicro, '_fuente'> }> }>('turnos_validados.json')
    const todos = [
      { id: 'T2', planta: 'Chonchi' as const, doc: CHONCHI_0211_T2 as Omit<DocMicro, '_fuente'> },
      { id: 'Dia', planta: 'Filete' as const, doc: FILETE_0211_DIA as Omit<DocMicro, '_fuente'> },
      ...turnos,
    ]
    let n = 0
    for (const t of todos) {
      const slug = t.planta === 'Chonchi' ? 'chonchi' : 'filete'
      for (const q of clasificarDoc({ _fuente: t.id, ...t.doc }, { planta: slug })) {
        const { container, unmount } = render(<GloboMicro q={q} cal={calibracionDe(slug)} />)
        const globo = container.querySelector('.gm')!
        expect(sp(globo.textContent), `${t.planta} ${t.id} ${q.nombre} ${q.inicioMs}`).not.toMatch(PROHIBIDAS)
        expect(globo.getAttribute('aria-label')).toBe('Micro detención y su causa posible')
        unmount()
        n++
      }
    }
    expect(n).toBe(339)
  })
})
