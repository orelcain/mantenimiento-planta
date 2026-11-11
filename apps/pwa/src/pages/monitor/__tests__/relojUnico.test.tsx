/**
 * Un solo reloj para TODO lo que se mueve (spec §2). El bug visto en producción: «Piezas del turno» 4.903 contra «Camino a la
 * meta» 4.922 en la misma pantalla, porque cada bloque leía otro reloj. Aquí se monta, bajo UN reloj de cola, un lector de cada
 * sitio que dice las piezas del turno y se verifica, en cada cuadro de 3 minutos de reproducción, que todos dicen lo mismo:
 *
 *   «Piezas del turno» (franja) = Σ Baader = Camino a la meta (hechas de `useCifrasVivas`) = punta de la curva
 *   = Duelo (PC: `CifraViva`; celular: `useCarreraViva`) = Modo TV (`CifraRepViva`) = «Por máquina» del ampliado.
 */
import { act, render } from '@testing-library/react'
import { computePaceToTarget, type PaceInput } from '@/services/shoplogix/monitorPace'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CifraViva } from '../CifraViva'
import { CifraRepViva, HechasDeReloj, PaceVivo } from '../HechasVivas'
import { PiezasBaader } from '../RitmoBaaders'
import { armarTope, type EntradaRep } from '../reproduccionMinuto'
import { useCarreraViva } from '../useCarreraViva'
import { useCifrasVivas, VistaVivaCtx, type VistaViva } from '../useCifrasVivas'
import { ReproduccionCtx, useReproduccion, useReproduccionMinuto, type Reproduccion } from '../useReproduccionMinuto'
import type { CuadroReloj, RelojDeDatos } from '../useRelojDeDatos'

const MIN = 60_000
const DESDE = Date.parse('2026-10-28T00:50:00.000Z')
const IDS = ['a', 'b', 'c']
const BASES = [12, 14, 16]
const serie = (n: number) => BASES.map((b, k) => Array.from({ length: n }, (_, i) => b + ((i * 7 + k * 3) % 5)))
const entrada = (n: number, ms = 0): EntradaRep => ({
  desdeMs: DESDE, pulsoAtMs: Date.parse('2026-10-28T03:56:05.000Z') + ms, paradas: {},
  maquinas: serie(n).map((c, k) => ({ id: IDS[k]!, nombre: `Evisceradora ${k + 1}`, modelo: 'Baader 142', esperado: 16, cycles: c })),
})

/** Lo que dice cada sitio, en el DOM, con el mismo componente o hook que usa la pantalla real. */
function Lectores() {
  const rep = useReproduccion()!
  /* Camino a la meta: sus «hechas» salen de `useCifrasVivas` (como `TiempoDelTurno`). */
  const camino = useCifrasVivas()
  /* Duelo en celular: `useCarreraViva`. */
  const duelo = useCarreraViva(rep.reloj, DESDE, null)
  return (
    <>
      <span data-t="franja"><CifraViva reloj={rep.reloj} respaldo={99_999} /></span>
      <span data-t="tv"><CifraRepViva respaldo={99_999} /></span>
      <span data-t="duelo-pc"><CifraViva reloj={rep.reloj} respaldo={99_999} /></span>
      <span data-t="camino">{camino ? Math.round(camino.hechas).toLocaleString('es-CL') : '—'}</span>
      <span data-t="por-maquina">{camino?.porMaquina ? camino.porMaquina.reduce((a, m) => a + m.valor, 0).toLocaleString('es-CL') : '—'}</span>
      <span data-t="duelo-movil">{duelo?.hechas != null ? duelo.hechas.toLocaleString('es-CL') : '—'}</span>
      {IDS.map((id) => <span key={id} data-baader={id}><PiezasBaader reloj={rep.reloj} id={id} respaldo={99_999} /></span>)}
    </>
  )
}

describe('un solo reloj: la misma cifra en todas partes, en cada cuadro', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  afterEach(() => { vi.useRealTimers() })

  const num = (t: string | null | undefined) => Number((t ?? '').replace(/\./g, ''))

  function leer(c: HTMLElement) {
    const q = (t: string) => num(c.querySelector(`[data-t="${t}"]`)?.textContent)
    const baader = IDS.map((id) => num(c.querySelector(`[data-baader="${id}"]`)?.textContent))
    return {
      franja: q('franja'), tv: q('tv'), duelPc: q('duelo-pc'), camino: q('camino'), porMaquina: q('por-maquina'), dueloMovil: q('duelo-movil'),
      baader, sumaBaader: baader.reduce((a, b) => a + b, 0),
    }
  }

  function montar(en: EntradaRep) {
    const repRef = { current: null as Reproduccion | null }
    const Envoltura = ({ e }: { e: EntradaRep }) => {
      const r = useReproduccionMinuto(e, armarTope(99_999, null))
      repRef.current = r
      const vista: VistaViva = { reloj: r.reloj, cuotaEn: null, meta: null, mostradas: 0, cerrado: false }
      return (
        <ReproduccionCtx.Provider value={r}>
          <VistaVivaCtx.Provider value={vista}><Lectores /></VistaVivaCtx.Provider>
        </ReproduccionCtx.Provider>
      )
    }
    const r = render(<Envoltura e={en} />)
    return { ...r, rerenderCon: (e: EntradaRep) => r.rerender(<Envoltura e={e} />), repRef }
  }

  it('total = Σ Baader = Camino = punta = Duelo (PC y celular) = TV = «Por máquina» en cada segundo de 4 minutos, con llegadas 0/2/2/0', () => {
    const { container, rerenderCon, repRef } = montar(entrada(8))
    let largo = 8
    const llegadas = [0, 2, 2, 0]
    const puntas: number[] = []
    const baja = repRef.current!.reloj.alCuadro((c: CuadroReloj) => {
      /* La punta de la curva de `GraficoRitmoVivo.aplicar`: `c.valor` cuando hay recta previa→última. */
      puntas.push(c.valor != null && c.previa ? c.valor : (c.ultima?.valor ?? -1))
    })
    let revisados = 0
    for (let s = 1; s <= 4 * 60; s++) {
      act(() => { vi.advanceTimersByTime(1000) })
      if (s % 60 === 0) {
        const n = llegadas[s / 60 - 1]!
        if (n > 0) { largo += n; act(() => rerenderCon(entrada(largo, s * 1000))) }
      }
      const v = leer(container)
      const verdad = repRef.current!.reloj.cuadro().valor!
      /* el cuadro de verdad avanzó unos ms desde que se pintó: los lectores van a lo sumo una pieza por detrás de él */
      expect(verdad - v.franja).toBeLessThanOrEqual(3)
      expect(v.franja).toBe(v.sumaBaader)
      expect(v.camino).toBe(v.franja)
      expect(v.porMaquina).toBe(v.franja)
      expect(v.tv).toBe(v.franja)
      expect(v.duelPc).toBe(v.franja)
      expect(v.dueloMovil).toBe(v.franja)
      revisados++
    }
    baja()
    expect(revisados).toBe(240)
    expect(puntas.length).toBeGreaterThan(100)
    /* Con la cola vaciada, todo vale la suma de los minutos cerrados. */
    act(() => { vi.advanceTimersByTime(6 * MIN) })
    const total = serie(largo).reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0)
    const v = leer(container)
    expect([v.franja, v.tv, v.camino, v.dueloMovil, v.sumaBaader]).toEqual([total, total, total, total, total])
  })

  it('el primer pintado ya es la cifra del reloj: ni un frame con el contador vivo (respaldo)', () => {
    const { container } = montar(entrada(8))
    const v = leer(container)
    const esperado = serie(6).reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0)
    expect(v.franja).toBe(esperado)
    expect(v.tv).toBe(esperado)
    expect(v.duelPc).toBe(esperado)
    expect(v.baader.reduce((a, b) => a + b, 0)).toBe(esperado)
    for (const t of [v.franja, v.tv, v.duelPc, ...v.baader]) expect(t).not.toBe(99_999)
  })

  it('el valor sigue pieza a pieza también con «reducir movimiento»: franja, TV y Baader se mueven y cuadran', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    const { container } = montar(entrada(8))
    const vistos = new Set<number>()
    for (let s = 0; s < 90; s++) {
      act(() => { vi.advanceTimersByTime(1000) })
      const v = leer(container)
      vistos.add(v.franja)
      expect(v.tv).toBe(v.franja)
      expect(v.sumaBaader).toBe(v.franja)
    }
    expect(vistos.size).toBeGreaterThan(35)
  })
})

describe('el primer pintado: ni un frame con el contador vivo', () => {
  /* `renderToString` no corre efectos: lo que sale es EXACTAMENTE lo que se pinta antes de que el reloj escriba nada. */
  const relojFijo = (valor: number, porMaquina: Array<{ id: string; valor: number }> = []): RelojDeDatos => {
    const c = {
      valor, frac: 0.5, previa: { valor: valor - 5, atMs: 0 }, ultima: { valor: valor + 5, atMs: 60_000 }, atrasada: false,
      rep: { porMaquina: porMaquina.map((m) => ({ ...m, nombre: m.id, encendidas: 0, n: 0, estado: 'andando', cadenciaS: null, piezasMinutoCerrado: null, progreso: 0 })) },
    } as unknown as CuadroReloj
    return { cuadro: () => c, alCuadro: (fn) => { fn(c); return () => {} }, version: 1, detenida: false, reducido: false }
  }

  it('CifraViva (franja, Duelo PC): el HTML inicial ya trae el valor del reloj, no `respaldo`', () => {
    const html = renderToString(<CifraViva reloj={relojFijo(8800)} respaldo={9690} />)
    expect(html).toContain('8.800')
    expect(html).not.toContain('9.690')
  })

  it('PiezasBaader: el HTML inicial ya trae el valor de esa Baader en el cuadro', () => {
    const html = renderToString(<PiezasBaader reloj={relojFijo(8800, [{ id: 'a', valor: 2950 }])} id="a" respaldo={3100} />)
    expect(html).toContain('2.950')
    expect(html).not.toContain('3.100')
  })

  it('sin valor en el reloj sí vale el respaldo (no queda vacío)', () => {
    const sin = { ...relojFijo(0), cuadro: () => ({ valor: null, frac: 1, previa: null, ultima: null, atrasada: false }) } as RelojDeDatos
    expect(renderToString(<CifraViva reloj={sin} respaldo={1234} />)).toContain('1.234')
  })
})

describe('lo que falta para la meta (Modo TV) y los rótulos del Duelo PC leen el mismo reloj que la cifra grande', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  afterEach(() => { vi.useRealTimers() })

  const META = 5000
  /* El contador vivo va ADELANTE de lo reproducido: 4.000 contra unos cientos del reloj de la cola. */
  const CONTADOR = 4000
  const input: PaceInput = {
    targetPieces: META, producedPieces: CONTADOR, scheduledEnd: '2026-10-28T06:00:00.000Z', nowWallMs: Date.parse('2026-10-28T03:00:00.000Z'),
    currentPerHour: 1300, maxPerHour: null, shiftClosed: false, pendingBreakMin: 0,
  }
  const pace = computePaceToTarget(input)
  const num = (t: string | null | undefined) => Number((t ?? '').replace(/\./g, ''))

  function Lectores() {
    const rep = useReproduccion()!
    return (
      <>
        <span data-t="grande"><CifraRepViva respaldo={CONTADOR} /></span>
        <PaceVivo input={input} pace={pace}>{(pv) => <span data-t="faltan">{pv?.remainingPieces}</span>}</PaceVivo>
        <HechasDeReloj reloj={rep.reloj} respaldo={CONTADOR}>{(n) => <span data-t="curva-duelo">{n.toLocaleString('es-CL')}</span>}</HechasDeReloj>
        <HechasDeReloj reloj={rep.reloj} respaldo={CONTADOR}>{(n) => <span data-t="riel-duelo">{n.toLocaleString('es-CL')}</span>}</HechasDeReloj>
      </>
    )
  }
  function Envoltura({ e }: { e: EntradaRep }) {
    const r = useReproduccionMinuto(e, armarTope(CONTADOR, null))
    return <ReproduccionCtx.Provider value={r}><Lectores /></ReproduccionCtx.Provider>
  }

  it('«hechas + faltan = meta» junto a la cifra grande, y la curva y el riel del Duelo dicen la cifra grande, en cada segundo con llegadas 0/2/2/0', () => {
    const { container, rerender } = render(<Envoltura e={entrada(8)} />)
    let largo = 8
    const llegadas = [0, 2, 2, 0]
    const q = (t: string) => num(container.querySelector(`[data-t="${t}"]`)?.textContent)
    for (let s = 1; s <= 4 * 60; s++) {
      act(() => { vi.advanceTimersByTime(1000) })
      if (s % 60 === 0) {
        const n = llegadas[s / 60 - 1]!
        if (n > 0) { largo += n; act(() => rerender(<Envoltura e={entrada(largo, s * 1000)} />)) }
      }
      const grande = q('grande')
      expect(grande).toBeLessThan(CONTADOR)
      expect(grande + q('faltan')).toBe(META)
      expect(q('curva-duelo')).toBe(grande)
      expect(q('riel-duelo')).toBe(grande)
    }
  })

  it('sin reproducción activa (turno cerrado, sin serie por minuto) vale el pace y las cifras de siempre', () => {
    const { container } = render(
      <>
        <PaceVivo input={input} pace={pace}>{(pv) => <span data-t="faltan">{pv?.remainingPieces}</span>}</PaceVivo>
        <HechasDeReloj reloj={null} respaldo={CONTADOR}>{(n) => <span data-t="curva">{n}</span>}</HechasDeReloj>
      </>,
    )
    expect(container.querySelector('[data-t="faltan"]')?.textContent).toBe(String(META - CONTADOR))
    expect(container.querySelector('[data-t="curva"]')?.textContent).toBe(String(CONTADOR))
  })
})
