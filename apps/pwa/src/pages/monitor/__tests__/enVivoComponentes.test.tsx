/**
 * Lo visible del monitor en vivo con cola (spec §3 a §6): el chip de desfase de la cabecera, el «+N» flotante, la cinta continua
 * con su «1 cada X,X s» y la geometría de la franja de rango. Todo se alimenta del reloj único: aquí unas veces se le da un
 * cuadro hecho a mano (para recorrer los cuatro estados) y otras el reloj de verdad con una serie por minuto.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChipDesfase } from '../ChipDesfase'
import { chipDeCuadro, mmss } from '../chipDesfaseTexto'
import { textoCadencia } from '../cintaCanvas'
import { AGRUPA_MS, FloteMas, MAX_POR_CUADRO } from '../FloteMas'
import { FranjaRango } from '../FranjaRango'
import { ajustarVentana, aplicarArrastre, trazoMini, VENTANA_MIN } from '../rangoZoom'
import { ReglasMinuto } from '../ReglasMinuto'
import { armarTope, type CuadroRep, type EntradaRep } from '../reproduccionMinuto'
import { ReproduccionCtx, useReproduccionMinuto, type Reproduccion } from '../useReproduccionMinuto'
import type { CuadroReloj, RelojDeDatos } from '../useRelojDeDatos'

afterEach(cleanup)

const MIN = 60_000
const DESDE = Date.parse('2026-10-28T00:50:00.000Z')

// ── Un reloj hecho a mano ────────────────────────────────────────────────────

function relojManual(opts: { reducido?: boolean } = {}) {
  let actual: CuadroReloj = { valor: 100, frac: 0, previa: null, ultima: null, atrasada: false }
  const subs = new Set<(c: CuadroReloj) => void>()
  const reloj: RelojDeDatos = {
    cuadro: () => actual,
    alCuadro: (fn) => { subs.add(fn); fn(actual); return () => { subs.delete(fn) } },
    version: 0, detenida: false, reducido: opts.reducido ?? false,
  }
  const emitir = (rep: Partial<CuadroRep> | null, valor?: number) => {
    actual = { ...actual, valor: valor ?? actual.valor, rep: rep ? ({ saltos: 0, estado: 'vivo', atrasoS: 0, ultimaLecturaHHMM: null, ...rep } as CuadroRep) : undefined }
    subs.forEach((fn) => fn(actual))
  }
  return { reloj, emitir }
}
const conReloj = (reloj: RelojDeDatos, hijo: React.ReactNode, activa = true) => {
  const rep = { activa, reloj, minuto: null, tope: null } as Reproduccion
  return <ReproduccionCtx.Provider value={rep}>{hijo}</ReproduccionCtx.Provider>
}

// ── §3 · el chip de desfase ──────────────────────────────────────────────────

describe('chip de desfase (spec §3)', () => {
  it('el texto de cada estado del reloj, con las palabras del spec', () => {
    expect(chipDeCuadro({ estado: 'vivo' } as CuadroRep)).toEqual({ tono: 'vivo', texto: 'En vivo · 3 min de desfase' })
    expect(chipDeCuadro({ estado: 'poniendose', atrasoS: 220.7 } as CuadroRep)).toEqual({ tono: 'aldia', texto: 'Poniéndose al día · 3:40' })
    expect(chipDeCuadro({ estado: 'atrasado', ultimaLecturaHHMM: '23:52' } as CuadroRep)).toEqual({ tono: 'atrasado', texto: 'Shoplogix atrasado · sin datos desde 23:52' })
    expect(chipDeCuadro({ estado: 'atrasado', ultimaLecturaHHMM: null } as CuadroRep).texto).toBe('Shoplogix atrasado · sin datos')
    expect(chipDeCuadro({ estado: 'detenida' } as CuadroRep)).toEqual({ tono: 'detenida', texto: 'Línea detenida' })
    expect(mmss(65)).toBe('1:05')
    expect(mmss(-4)).toBe('0:00')
  })

  it('sigue al reloj por ref: cambia texto y tono con el estado, sin volver a montarse', () => {
    const { reloj, emitir } = relojManual()
    emitir({ estado: 'vivo' })
    const { container } = render(conReloj(reloj, <ChipDesfase />))
    const chip = container.querySelector('.v2-chip-desfase') as HTMLElement
    expect(chip.textContent).toBe('En vivo · 3 min de desfase')
    expect(chip.dataset.st).toBe('vivo')
    act(() => emitir({ estado: 'poniendose', atrasoS: 200 }))
    expect(chip.textContent).toBe('Poniéndose al día · 3:20')
    expect(chip.dataset.st).toBe('aldia')
    act(() => emitir({ estado: 'poniendose', atrasoS: 199 }))
    expect(chip.textContent).toBe('Poniéndose al día · 3:19')
    act(() => emitir({ estado: 'atrasado', ultimaLecturaHHMM: '23:52' }))
    expect(chip.textContent).toBe('Shoplogix atrasado · sin datos desde 23:52')
    expect(chip.dataset.st).toBe('atrasado')
    act(() => emitir({ estado: 'detenida' }))
    expect(chip.textContent).toBe('Línea detenida')
    expect(chip.dataset.st).toBe('detenida')
    expect(container.querySelector('.v2-chip-desfase')).toBe(chip)
  })

  it('el primer pintado ya dice el estado del reloj, no «En vivo» por defecto', () => {
    const { reloj, emitir } = relojManual()
    emitir({ estado: 'detenida' })
    const { container } = render(conReloj(reloj, <ChipDesfase />))
    expect(container.querySelector('.v2-chip-desfase')!.textContent).toBe('Línea detenida')
  })

  it('sin reproducción activa (turno cerrado, sin serie) no dibuja nada', () => {
    const { reloj, emitir } = relojManual()
    emitir({ estado: 'vivo' })
    const { container } = render(conReloj(reloj, <ChipDesfase />, false))
    expect(container.querySelector('.v2-chip-desfase')).toBeNull()
    cleanup()
    const sinCtx = render(<ChipDesfase />)
    expect(sinCtx.container.querySelector('.v2-chip-desfase')).toBeNull()
  })
})

// ── §4 · el «+N» flotante ────────────────────────────────────────────────────

describe('«+N» flotante (spec §4)', () => {
  let ahora = 0
  const animaciones: Array<{ keyframes: Keyframe[]; opts: KeyframeAnimationOptions; cancelada: boolean }> = []
  beforeEach(() => {
    ahora = 10_000
    animaciones.length = 0
    vi.spyOn(performance, 'now').mockImplementation(() => ahora)
    Element.prototype.animate = (function (keyframes: Keyframe[], opts: KeyframeAnimationOptions) {
      const a = { keyframes, opts, cancelada: false }
      animaciones.push(a)
      return { cancel: () => { a.cancelada = true } }
    }) as unknown as typeof Element.prototype.animate
  })
  afterEach(() => { vi.restoreAllMocks() })

  const montar = (opts?: { reducido?: boolean }) => {
    const r = relojManual(opts)
    r.emitir({ saltos: 0 }, 100)
    const v = render(<FloteMas reloj={r.reloj} />)
    return { ...r, nodo: v.container.querySelector('.flote') as HTMLElement }
  }

  it('una pieza: «+1», 1,1 s con la curva de la piel, sube de 4 px a −12 y solo toca transform y opacity', () => {
    const { emitir, nodo } = montar()
    act(() => emitir({ saltos: 0 }, 101))
    expect(nodo.textContent).toBe('+1')
    expect(animaciones).toHaveLength(1)
    const a = animaciones[0]!
    expect(a.opts.duration).toBe(1100)
    expect(a.opts.easing).toBe('cubic-bezier(0.22, 0.9, 0.24, 1)')
    expect(a.keyframes.map((k) => k.offset)).toEqual([0, 0.12, 0.65, 1])
    expect(a.keyframes[0]).toMatchObject({ opacity: 0, transform: 'translateY(4px)' })
    expect(a.keyframes[3]).toMatchObject({ opacity: 0, transform: 'translateY(-12px)' })
    for (const k of a.keyframes) expect(Object.keys(k).filter((p) => p !== 'offset').every((p) => p === 'opacity' || p === 'transform')).toBe(true)
  })

  it('las piezas que entran dentro de 600 ms se agrupan en el MISMO nodo («+2», «+3»); pasada la ventana, vuelve a «+1»', () => {
    const { emitir, nodo } = montar()
    act(() => emitir({ saltos: 0 }, 101))
    ahora += 300
    act(() => emitir({ saltos: 0 }, 102))
    expect(nodo.textContent).toBe('+2')
    ahora += 500
    act(() => emitir({ saltos: 0 }, 104))
    expect(nodo.textContent).toBe('+4')
    expect(animaciones).toHaveLength(3)
    expect(animaciones.slice(0, 2).every((a) => a.cancelada)).toBe(true)
    ahora += AGRUPA_MS + 1
    act(() => emitir({ saltos: 0 }, 105))
    expect(nodo.textContent).toBe('+1')
    expect(document.querySelectorAll('.flote')).toHaveLength(1)
  })

  it('un cuadro sin piezas nuevas, o el mismo valor repetido, no flota', () => {
    const { emitir } = montar()
    act(() => { emitir({ saltos: 0 }, 100); emitir({ saltos: 0 }, 100.4) })
    expect(animaciones).toHaveLength(0)
  })

  it('un salto del reloj (recarga, otro turno, contador que baja) no flota, ni subiendo, ni bajando', () => {
    const { emitir } = montar()
    act(() => emitir({ saltos: 1 }, 160))
    act(() => emitir({ saltos: 1 }, 40))
    expect(animaciones).toHaveLength(0)
    /* Un salto chico también cuenta: una recarga que cae 3 piezas más arriba no son 3 piezas cayendo. */
    act(() => emitir({ saltos: 2 }, 43))
    expect(animaciones).toHaveLength(0)
    /* …y después del salto sigue contando desde el valor nuevo. */
    act(() => emitir({ saltos: 2 }, 44))
    expect(animaciones).toHaveLength(1)
  })

  it(`más de ${MAX_POR_CUADRO} piezas en UN cuadro (pestaña dormida) no son piezas cayendo una a una: no flotan`, () => {
    const { emitir } = montar()
    act(() => emitir({ saltos: 0 }, 100 + MAX_POR_CUADRO + 1))
    expect(animaciones).toHaveLength(0)
    act(() => emitir({ saltos: 0 }, 100 + MAX_POR_CUADRO + 2))
    expect(animaciones).toHaveLength(1)
  })

  it('con «reducir movimiento» no hay +N (el conteo, que es dato, sigue en la cifra)', () => {
    const { emitir, nodo } = montar({ reducido: true })
    act(() => emitir({ saltos: 0 }, 103))
    expect(animaciones).toHaveLength(0)
    expect(nodo.textContent).toBe('')
  })

  it('es decorativo para quien lee la pantalla: aria-hidden', () => {
    const { nodo } = montar()
    expect(nodo.closest('.flote-zona')!.getAttribute('aria-hidden')).toBe('true')
  })
})

// ── §5 · la cinta continua ───────────────────────────────────────────────────

const IDS = ['a', 'b', 'c']
const BASES = [12, 14, 16]
const serie = (n: number) => BASES.map((b, k) => Array.from({ length: n }, (_, i) => b + ((i * 7 + k * 3) % 5)))
const entrada = (n: number, ms = 0): EntradaRep => ({
  desdeMs: DESDE, pulsoAtMs: Date.parse('2026-10-28T03:56:05.000Z') + ms, paradas: {},
  maquinas: serie(n).map((c, k) => ({ id: IDS[k]!, nombre: `Evisceradora ${k + 1}`, modelo: 'Baader 142', esperado: 16, cycles: c })),
})

describe('cinta continua + «1 cada X,X s» (spec §5)', () => {
  const llamadas: Array<{ f: string; a: number[] }> = []
  let reducidoPref = false
  beforeEach(() => {
    llamadas.length = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    window.matchMedia = ((q: string) => ({
      matches: reducidoPref && q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 28 })
    const ctx: Record<string, unknown> = { globalAlpha: 1 }
    for (const f of ['setTransform', 'clearRect', 'fillRect', 'beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'stroke', 'save', 'restore', 'roundRect', 'fill']) {
      ctx[f] = (...a: number[]) => { llamadas.push({ f, a }) }
    }
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })
  afterEach(() => { vi.useRealTimers(); reducidoPref = false })

  function montar(en: EntradaRep) {
    const repRef = { current: null as Reproduccion | null }
    const Envoltura = ({ e }: { e: EntradaRep }) => {
      const r = useReproduccionMinuto(e, armarTope(99_999, null))
      repRef.current = r
      return <ReproduccionCtx.Provider value={r}><ReglasMinuto /></ReproduccionCtx.Provider>
    }
    const r = render(<Envoltura e={en} />)
    return { ...r, rerenderCon: (e: EntradaRep) => r.rerender(<Envoltura e={e} />), repRef }
  }
  const cadencias = (c: HTMLElement) => [...c.querySelectorAll('.rm-cad')].map((q) => q.textContent)

  it('el texto de cadencia: 60 ÷ piezas con un decimal; «—» si estuvo detenida', () => {
    expect(textoCadencia(60 / 17)).toBe('1 cada 3,5 s')
    expect(textoCadencia(5)).toBe('1 cada 5,0 s')
    expect(textoCadencia(null)).toBe('—')
    expect(textoCadencia(0)).toBe('—')
  })

  it('una cinta por Baader y una fila de la línea; ya no hay nota «reproducción de los minutos cerrados»', () => {
    const { container } = montar(entrada(8))
    expect(container.querySelectorAll('canvas.rm-cinta')).toHaveLength(3)
    expect(container.querySelectorAll('.rm-linea')).toHaveLength(1)
    expect(container.querySelector('.rm-nota')).toBeNull()
    expect(container.textContent).not.toContain('sin lectura nueva')
    expect(container.textContent).not.toContain('reproducción de los minutos')
    expect(container.querySelector('.rm-regla')).toBeNull()
  })

  it('«1 cada X,X s» sale del último minuto cerrado de cada Baader (60 ÷ sus piezas), no del que corre', () => {
    const { container } = montar(entrada(8))
    /* Se carga en el minuto 6 (último cerrado − 2); el cerrado anterior es el 5: 12, 17 y 17 piezas → 5,0 · 3,5 · 3,5. */
    expect(cadencias(container)).toEqual(['1 cada 5,0 s', '1 cada 3,5 s', '1 cada 3,5 s'])
    act(() => { vi.advanceTimersByTime(61 * 1000) })
    /* Un minuto después el cerrado es el 6. */
    const n = (b: number, k: number, i: number) => b + ((i * 7 + k * 3) % 5)
    const esperadas = BASES.map((b, k) => `1 cada ${(60 / n(b, k, 6)).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`)
    expect(cadencias(container)).toEqual(esperadas)
  })

  it('el ritmo de cada Baader y el de la línea son los del último minuto cerrado, con su barra', () => {
    const { container } = montar(entrada(8))
    const ritmos = [...container.querySelectorAll('.rm-rit b')].map((b) => b.textContent)
    expect(ritmos).toEqual(['12', '17', '17', '46'])
    const barras = [...container.querySelectorAll('.rm-rb > i')] as HTMLElement[]
    expect(barras).toHaveLength(4)
    expect(barras[0]!.style.transform).toBe('scaleX(' + (12 / (16 * 1.3)).toFixed(3) + ')')
  })

  it('una Baader con 0 piezas en su último minuto cerrado dice «—» en rojo, no «1 cada ∞»', () => {
    const e = entrada(8)
    e.maquinas[1]!.cycles[5] = 0
    const { container } = montar(e)
    const cad = container.querySelectorAll('.rm-cad')
    expect(cad[1]!.textContent).toBe('—')
    expect(cad[1]!.getAttribute('data-det')).toBe('true')
    expect(cad[0]!.getAttribute('data-det')).toBeNull()
  })

  it('la cinta es continua: el mismo canvas cruza el cambio de minuto (no se vuelve a montar) y sigue pintando', () => {
    const { container } = montar(entrada(8))
    const antes = [...container.querySelectorAll('canvas')]
    act(() => { vi.advanceTimersByTime(65 * 1000) })
    const despues = [...container.querySelectorAll('canvas')]
    expect(despues).toHaveLength(3)
    despues.forEach((c, i) => expect(c).toBe(antes[i]))
    const n0 = llamadas.length
    act(() => { vi.advanceTimersByTime(2000) })
    expect(llamadas.length).toBeGreaterThan(n0)
  })

  it('con el reloj corriendo pinta el cabezal; con «reducir movimiento» pinta la regla en bucle, sin cabezal', () => {
    montar(entrada(8))
    act(() => { vi.advanceTimersByTime(3000) })
    const cabezal = (l: typeof llamadas) => l.filter((q) => q.f === 'fillRect' && q.a[0] === 398 && q.a[2] === 2)
    expect(cabezal(llamadas).length).toBeGreaterThan(0)
    cleanup()
    llamadas.length = 0
    reducidoPref = true
    montar(entrada(8))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(llamadas.filter((q) => q.f === 'roundRect').length).toBeGreaterThan(0)
    expect(cabezal(llamadas)).toHaveLength(0)
  })

  it('Shoplogix atrasado (cola vacía y un pulso sin minuto nuevo): la cinta se atenúa por data-estado y el reloj sigue congelado', () => {
    const { container, repRef } = montar(entrada(8))
    act(() => { vi.advanceTimersByTime(2 * MIN + 30 * 1000) })
    expect(repRef.current!.reloj.cuadro().rep!.estado).toBe('vivo')
    act(() => { vi.advanceTimersByTime(MIN + 5000) })
    expect(repRef.current!.reloj.cuadro().rep!.estado).toBe('atrasado')
    for (const c of container.querySelectorAll('canvas')) expect((c as HTMLElement).dataset.estado).toBe('atrasado')
    /* La cinta quieta no inventa piezas: dos pasos de tiempo después, el mismo instante reproducido. */
    const t0 = repRef.current!.reloj.cuadro().rep!.tMs
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(repRef.current!.reloj.cuadro().rep!.tMs).toBe(t0)
  })

  it('el primer minuto tras cargar usa el que corre para la cadencia (no hay uno anterior): nunca «—» de más', () => {
    const e = entrada(2)
    const { container } = montar(e)
    expect(cadencias(container).every((t) => t !== '—')).toBe(true)
  })
})

// ── §6 · la geometría de la franja de rango ──────────────────────────────────

describe('franja de rango · geometría (spec §6)', () => {
  const TOTAL = 450

  it('la ventana nunca baja de 10 min, no se sale del turno y conserva su ancho al chocar con un borde', () => {
    expect(ajustarVentana({ desdeMin: -30, hastaMin: 30 }, TOTAL)).toEqual({ desdeMin: 0, hastaMin: 60 })
    expect(ajustarVentana({ desdeMin: 400, hastaMin: 480 }, TOTAL)).toEqual({ desdeMin: 370, hastaMin: 450 })
    const ancho = ajustarVentana({ desdeMin: 100, hastaMin: 102 }, TOTAL)
    expect(ancho.hastaMin - ancho.desdeMin).toBe(VENTANA_MIN)
  })

  it('arrastrar el cuerpo recorre la ventana; el asa izquierda cambia el inicio y la derecha el fin, con 10 min como piso', () => {
    const base = { desdeMin: 100, hastaMin: 160 }
    expect(aplicarArrastre('mover', 25, base, TOTAL)).toEqual({ desdeMin: 125, hastaMin: 185 })
    expect(aplicarArrastre('mover', 999, base, TOTAL)).toEqual({ desdeMin: 390, hastaMin: 450 })
    expect(aplicarArrastre('inicio', -40, base, TOTAL)).toEqual({ desdeMin: 60, hastaMin: 160 })
    expect(aplicarArrastre('inicio', 999, base, TOTAL)).toEqual({ desdeMin: 150, hastaMin: 160 })
    expect(aplicarArrastre('inicio', -999, base, TOTAL)).toEqual({ desdeMin: 0, hastaMin: 160 })
    expect(aplicarArrastre('fin', 40, base, TOTAL)).toEqual({ desdeMin: 100, hastaMin: 200 })
    expect(aplicarArrastre('fin', -999, base, TOTAL)).toEqual({ desdeMin: 100, hastaMin: 110 })
    expect(aplicarArrastre('fin', 999, base, TOTAL)).toEqual({ desdeMin: 100, hastaMin: 450 })
  })

  it('la mini curva va de punta a punta del turno, con 4 px de aire arriba y abajo; sin datos no hay trazo', () => {
    const d = trazoMini([{ min: 0, v: 0 }, { min: 225, v: 500 }, { min: 450, v: 1000 }], TOTAL, 1000)
    expect(d).toBe('M0.00 40.00 L50.00 22.00 L100.00 4.00')
    expect(trazoMini([], TOTAL, 1000)).toBe('')
    expect(trazoMini([{ min: 0, v: 0 }], TOTAL, 1000)).toBe('')
    expect(trazoMini([{ min: 0, v: 0 }, { min: 10, v: 5 }], TOTAL, 0)).toBe('')
    /* Lo que se sale del eje se acota, no dibuja fuera de la franja. */
    expect(trazoMini([{ min: -5, v: -5 }, { min: 999, v: 99_999 }], TOTAL, 1000)).toBe('M0.00 40.00 L100.00 4.00')
  })

  describe('el componente', () => {
    const puntos = [{ min: 0, v: 0 }, { min: 450, v: 1000 }]
    const caja = (el: HTMLElement) => {
      el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 44, width: 900, height: 44, x: 0, y: 0, toJSON: () => ({}) })
      el.setPointerCapture = () => {}
    }
    const montar = (ventana: { desdeMin: number; hastaMin: number } | null) => {
      const onVentana = vi.fn()
      const v = render(<FranjaRango totalMin={TOTAL} ventana={ventana} onVentana={onVentana} puntos={puntos} yMax={1000} />)
      const franja = v.container.querySelector('.rv-rango') as HTMLElement
      caja(franja)
      return { onVentana, franja, ...v }
    }
    /* jsdom no trae PointerEvent con coordenadas: se arma el evento a mano. */
    const puntero = (el: HTMLElement, tipo: string, clientX: number) => {
      const ev = new MouseEvent(tipo, { bubbles: true, clientX })
      Object.defineProperty(ev, 'pointerId', { value: 1 })
      act(() => { el.dispatchEvent(ev) })
    }

    it('dibuja la ventana en su sitio (en % del turno) y las dos asas con nombre y valor', () => {
      const { franja } = montar({ desdeMin: 90, hastaMin: 180 })
      const vent = franja.querySelector('.rv-rango-vent') as HTMLElement
      expect(vent.style.left).toBe('20%')
      expect(vent.style.width).toBe('20%')
      expect(screen.getByRole('slider', { name: 'Inicio de lo que se ve' }).getAttribute('aria-valuenow')).toBe('90')
      expect(screen.getByRole('slider', { name: 'Fin de lo que se ve' }).getAttribute('aria-valuenow')).toBe('180')
    })

    it('arrastrar el cuerpo de la ventana la recorre; una ventana que vuelve a cubrir todo el turno se publica como null («Turno»)', () => {
      const { franja, onVentana } = montar({ desdeMin: 90, hastaMin: 180 })
      /* 900 px para 450 min = 2 px por minuto. Cuerpo en el minuto 135 (270 px). */
      puntero(franja, 'pointerdown', 270)
      puntero(franja, 'pointermove', 270 + 100)
      expect(onVentana).toHaveBeenLastCalledWith({ desdeMin: 140, hastaMin: 230 })
      puntero(franja, 'pointerup', 370)
      puntero(franja, 'pointermove', 500)
      expect(onVentana).toHaveBeenCalledTimes(1)
    })

    it('arrastrar el asa derecha cambia el fin; hasta el borde del turno vuelve a «Turno» (null)', () => {
      const { franja, onVentana } = montar({ desdeMin: 0, hastaMin: 180 })
      puntero(franja, 'pointerdown', 360)
      puntero(franja, 'pointermove', 360 + 100)
      expect(onVentana.mock.lastCall![0].desdeMin).toBe(0)
      expect(onVentana.mock.lastCall![0].hastaMin).toBeCloseTo(230, 6)
      puntero(franja, 'pointermove', 900)
      expect(onVentana).toHaveBeenLastCalledWith(null)
    })

    it('tocar fuera de la ventana la centra ahí, sin cambiar su ancho', () => {
      const { franja, onVentana } = montar({ desdeMin: 90, hastaMin: 150 })
      puntero(franja, 'pointerdown', 2 * 300)
      expect(onVentana).toHaveBeenLastCalledWith({ desdeMin: 270, hastaMin: 330 })
    })

    it('por teclado: las flechas mueven el asa 5 min y respetan los 10 min mínimos', () => {
      const { onVentana } = montar({ desdeMin: 90, hastaMin: 100 })
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Inicio de lo que se ve' }), { key: 'ArrowLeft' })
      expect(onVentana).toHaveBeenLastCalledWith({ desdeMin: 85, hastaMin: 100 })
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Inicio de lo que se ve' }), { key: 'ArrowRight' })
      expect(onVentana).toHaveBeenLastCalledWith({ desdeMin: 90, hastaMin: 100 })
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Fin de lo que se ve' }), { key: 'ArrowLeft' })
      expect(onVentana).toHaveBeenLastCalledWith({ desdeMin: 90, hastaMin: 100 })
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Fin de lo que se ve' }), { key: 'a' })
      expect(onVentana).toHaveBeenCalledTimes(3)
    })
  })
})
