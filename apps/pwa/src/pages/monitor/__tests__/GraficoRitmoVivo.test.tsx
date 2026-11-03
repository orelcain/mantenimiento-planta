/**
 * «Ritmo en vivo», el gráfico unido: lo que se protege es que dibuja con datos reales sin romperse (cabecera, leyenda de
 * 4, atajos de zoom, rótulos, «ahora»), que el globo dice la MISMA cifra de «a esta hora» que la franja y que «Ampliar»
 * solo aparece con detalle que abrir. jsdom no mide ni dibuja: el ancho se simula y la geometría fina la prueba
 * `ejeTurno.test.ts` (alturas, escala Y, filas Ev) y el navegador.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disenar } from '../ejeTurno'
import { GloboMicro, GraficoRitmoVivo, type EjeDatos } from '../GraficoRitmoVivo'
import { clasificarMicros } from '../microCausa'
import type { MonitorV2Props } from '../MonitorV2'
import { armarTope } from '../reproduccionMinuto'
import type { CuadroReloj, RelojDeDatos } from '../useRelojDeDatos'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
/** Los textos del globo llevan espacios duros entre la cifra y su unidad: para comparar se pasan a espacios normales. */
const sp = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ')
const serie = (esperado: number) => Array.from({ length: AHORA }, (_, k) => (k >= 100 && k < 160 ? 0 : esperado - 2))

const eje: EjeDatos = {
  iniMs: INI,
  finMs: INI + 450 * 60_000,
  minuto: {
    desde: new Date(INI).toISOString(),
    maquinas: [
      { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: serie(19) },
      { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: serie(16) },
      { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: serie(16) },
    ],
  },
  primeraPiezaMs: null,
  detenidaEstado: false,
  paradas: [{ desdeMin: 100, hastaMin: 160, dueno: 'sin-imputar', causa: 'Detencion', maquina: null }],
  /* La misma parada, por máquina (de ahí salen las paradas de arriba): cubre los 60 min en cero de las tres. */
  paradasMaquina: {
    stopEvents: [0, 1, 2].map((m) => ({ r: 0, f: new Date(INI + 100 * 60_000).toISOString(), s: 3600, m })),
    stopReasons: ['Detencion'],
    stopMachines: ['a', 'b', 'c'],
    enCurso: [],
  },
  llenado: [{ id: 'a', ultimo: 95 }, { id: 'b', ultimo: 100 }, { id: 'c', ultimo: 100 }],
  unidad: 'carros',
}

const p = {
  piezas: 9690,
  corteHora: '02:35',
  meta: 15000,
  proyeccion: 15623,
  cuota: { piezas: 10667, hora: '02:35' },
  cerrado: false,
  curva: {
    hoy: [{ minutes: 5, pieces: 100 }, { minutes: 300, pieces: 9690 }],
    previo: { label: 'lun 26', curve: [{ minutes: 5, pieces: 90 }, { minutes: AHORA, pieces: 9325 }, { minutes: 440, pieces: 14000 }] },
    objetivo: [{ minutes: 0, pieces: 0 }, { minutes: 450, pieces: 15000 }],
    maxMin: 450,
  },
} as unknown as MonitorV2Props

const reloj: RelojDeDatos = {
  cuadro: () => ({ valor: 9690, frac: 1, previa: null, ultima: { valor: 9690, atMs: INI + AHORA * 60_000 }, atrasada: false }),
  alCuadro: () => () => {},
  version: 1,
  detenida: false,
  reducido: false,
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width: 1024px'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  Element.prototype.animate = (() => ({ cancel: () => {}, set onfinish(f: (() => void) | null) { if (f) setTimeout(f, 0) } })) as unknown as typeof Element.prototype.animate
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  /* 1920: la tarjeta mide 1806 px por dentro. */
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1806 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  const raiz = document.createElement('div')
  raiz.id = 'root'
  document.body.appendChild(raiz)
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('GraficoRitmoVivo', () => {
  it('dibuja título, subtítulo, leyenda de 4, atajos de zoom y el «ahora»', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.getByRole('heading', { name: 'Ritmo en vivo' })).toBeTruthy()
    /* La marca «Shoplogix HH:MM» va UNA vez en la barra del monitor: el subtítulo del gráfico solo dice el rango del turno. */
    expect(screen.getByText('21:30 → 05:00')).toBeTruthy()
    expect(screen.queryByText(/leído de Shoplogix/)).toBeNull()
    for (const t of ['hoy', 'ritmo de la meta', 'proyección', 'lun 26 · 9.325 hechas a esta hora']) expect(screen.getByText(t)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turno' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '1 h' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '15 min' })).toBeTruthy()
    expect(screen.getByText('02:35 ahora')).toBeTruthy()
    expect(screen.getByText('meta 15.000')).toBeTruthy()
    /* Meta 15.000 y proyección 15.623 → 0…16.000, rejilla cada 4.000 (no 20.000). */
    expect(screen.getByText('16.000')).toBeTruthy()
    expect(screen.queryByText('20.000')).toBeNull()
    expect(screen.getByText('Detenciones')).toBeTruthy()
    /* Columna derecha: los episodios en la fila de Paradas y los minutos de RELOJ con parada en la fila de las horas. */
    expect(screen.getByText('1 detención')).toBeTruthy()
    expect(screen.getByText('1 h 0 min')).toBeTruthy()
  })

  it('«1 h» y «15 min» marcan su atajo y «Turno» vuelve a todo el turno', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    fireEvent.click(screen.getByRole('button', { name: '1 h' }))
    expect(screen.getByRole('button', { name: '1 h' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    expect(screen.getByRole('button', { name: '15 min' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '1 h' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Turno' }))
    expect(screen.getByRole('button', { name: 'Turno' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('el globo del minuto en curso dice la misma diferencia contra la «meta a esta hora» que el rótulo del gráfico («977 atrás»)', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    /* Sin globo, la cifra ya está en el rótulo junto a la punta: 9.690 − 10.667. */
    expect(screen.getAllByText('977 atrás').length).toBe(1)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    /* x del minuto 305 dentro del gráfico (1.604 px de ancho, 6 de aire a la derecha: 1.598 px para 450 min). */
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((305.5 / 450) * 1598), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('(977 atrás)')
    /* El minuto en curso de un turno en vivo: «Meta a esta hora» (un minuto pasado dice «a esa hora»), y «Hechas» en vez de «Acumulado». */
    expect(screen.getByRole('tooltip').textContent).toContain('Meta a esta hora')
    expect(screen.getByRole('tooltip').textContent).toContain('Hechas')
    expect(screen.getByRole('tooltip').textContent).not.toMatch(/Tocaban|Acumulado/)
    expect(screen.getByRole('tooltip').textContent).toContain('9.690 pz')
    expect(screen.getByRole('tooltip').textContent).toContain('10.667')
  })

  it('un minuto con la línea en cero lista cada Baader sin acusarla y nombra la parada y su dueño', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.5 / 450) * 1598), buttons: 0 }) })
    const globo = screen.getByRole('tooltip').textContent ?? ''
    expect(globo).toContain('Ritmo de la línea')
    expect(globo).toContain('0 de 51 pz/min')
    expect((globo.match(/detenida/g) ?? []).length).toBe(3)
    expect(globo).toContain('Sin imputar')
    expect(globo).toContain('falta dueño')
  })

  it('un minuto con la línea en cero SIN parada registrada no acusa: cada Baader queda «sin dato», no «detenida»', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...eje, paradasMaquina: null }} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.5 / 450) * 1598), buttons: 0 }) })
    const globo = screen.getByRole('tooltip').textContent ?? ''
    expect((globo.match(/sin dato/g) ?? []).length).toBe(3)
    expect(globo).not.toContain('detenida')
  })

  it('el globo no es una región viva (no anuncia cada movimiento) y sigue siendo el mismo nodo mientras el cursor está en el mismo minuto', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.2 / 450) * 1598), buttons: 0 }) })
    const globo = screen.getByRole('tooltip')
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.8 / 450) * 1598), buttons: 0 }) })
    expect(screen.getByRole('tooltip')).toBe(globo)
  })

  it('el resumen del gráfico dice las piezas de la vista (con reproducción, la suma de los minutos cerrados)', () => {
    const entrada = {
      desdeMs: INI,
      maquinas: [
        { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: [3309] },
        { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: [3071] },
        { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: [3291] },
      ],
      paradas: {},
      pulsoAtMs: null,
    }
    const conRepro = { ...p, repro: { entrada, tope: armarTope(9690, null) } } as unknown as MonitorV2Props
    const { container } = render(<GraficoRitmoVivo p={conRepro} e={eje} reloj={reloj} />)
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Hechas del turno: 9.671 de 15.000')
  })

  it('el globo también sale con un toque; tocar el mismo minuto o fuera lo cierra', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    const x = Math.round((250.5 / 450) * 1598)
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: x }) })
    act(() => { fireEvent.click(lienzo, { clientX: x }) })
    /* Un minuto PASADO: «Meta a esa hora» (no «a esta hora») y la diferencia en palabras. */
    expect(screen.getByRole('tooltip').textContent).toContain('Hechas')
    expect(screen.getByRole('tooltip').textContent).toContain('Meta a esa hora')
    act(() => { fireEvent.click(lienzo, { clientX: x }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => { fireEvent.click(lienzo, { clientX: x }) })
    expect(screen.getByRole('tooltip')).toBeTruthy()
    act(() => { fireEvent.pointerDown(document.body, { pointerType: 'touch' }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('«Ampliar» solo existe si hay detalle y lo abre', () => {
    const { rerender } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.queryByRole('button', { name: 'Ampliar Ritmo en vivo' })).toBeNull()
    rerender(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} ampliado={<p>detalle del ritmo</p>} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar Ritmo en vivo' }))
    expect(screen.getByText('detalle del ritmo')).toBeTruthy()
  })

  it('la leyenda ⓘ abre el globo de estados y dueños y Esc lo cierra', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.queryByText('Detenciones, por dueño')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Qué significan los colores' }))
    expect(screen.getByText('Detenciones, por dueño')).toBeTruthy()
    expect(screen.getByText('75 % o más del esperado')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Detenciones, por dueño')).toBeNull()
  })

  it('en el celular (375) la leyenda baja, el segmentado va en su fila y los rótulos de la derecha van dentro', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 309 })
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} ampliado={<p>x</p>} />)
    expect(screen.getByText('al cierre 15.623')).toBeTruthy()
    expect(screen.getByText('4 mil')).toBeTruthy()
    expect(screen.getByRole('button', { name: '15 min' })).toBeTruthy()
  })

  it('con el turno cerrado no hay proyección ni «a esta hora»', () => {
    const cerrado = { ...p, cerrado: true, proyeccion: null } as unknown as MonitorV2Props
    render(<GraficoRitmoVivo p={cerrado} e={eje} reloj={reloj} />)
    expect(screen.queryByText('proyección')).toBeNull()
    expect(screen.queryByText(/^[d.]+ (adelante|atrás)$/)).toBeNull()
  })
})

// ── Pulido G3 ────────────────────────────────────────────────────────────────

/** x (px) del minuto `m` dentro del lienzo de 1.604 px (1.598 para 450 min: 6 de aire a la derecha). */
const xDe = (m: number) => Math.round((m / 450) * 1598)

describe('GraficoRitmoVivo · táctil', () => {
  it('un toque o un deslizar sobre el gráfico no llega a la página (que cambiaría de turno con 60 px)', () => {
    const alPagina = vi.fn()
    const { container } = render(<div onTouchStart={alPagina} onTouchEnd={alPagina}><GraficoRitmoVivo p={p} e={eje} reloj={reloj} /></div>)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    fireEvent.touchStart(lienzo, { touches: [{ clientX: 300, clientY: 10 }] })
    fireEvent.touchEnd(lienzo, { changedTouches: [{ clientX: 10, clientY: 12 }] })
    expect(alPagina).not.toHaveBeenCalled()
  })

  it('sin zoom, arrastrar el dedo en horizontal recorre los minutos y el click final no cierra el globo', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    expect(lienzo.style.touchAction).toBe('pan-y')
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: xDe(100.5), clientY: 50 }) })
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'touch', clientX: xDe(100.5) + 3, clientY: 51, buttons: 1 }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'touch', clientX: xDe(130.5), clientY: 52, buttons: 1 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('23:40')
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'touch', clientX: xDe(200.5), clientY: 52, buttons: 1 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('00:50')
    act(() => { fireEvent.click(lienzo, { clientX: xDe(200.5) }) })
    expect(screen.getByRole('tooltip').textContent).toContain('00:50')
  })

  it('un gesto más vertical que horizontal es de la página: no abre el globo', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: xDe(100.5), clientY: 50 }) })
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'touch', clientX: xDe(100.5) + 12, clientY: 90, buttons: 1 }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('con puntero táctil la ayuda dice «Toca un minuto…»; en PC no hay texto bajo el gráfico y «Cómo usarlo» vive en el ⓘ', () => {
    const { unmount } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.queryByText(/^Toca un minuto/)).toBeNull()
    expect(screen.queryByText(/Pasa el cursor/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Qué significan los colores' }))
    expect(screen.getByText('Cómo usarlo')).toBeTruthy()
    expect(screen.getByText(/Pasa el cursor sobre un minuto/)).toBeTruthy()
    unmount()
    const antes = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes('pointer: coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
    try {
      render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
      expect(screen.getByText('Toca un minuto o una marca ▼ · pellizca para acercar · arrastra para recorrer')).toBeTruthy()
    } finally { window.matchMedia = antes }
  })
})

describe('GraficoRitmoVivo · paradas y globo', () => {
  const tres = [0, 1, 2].map((i) => ({ desdeMin: 100, hastaMin: 155, dueno: 'sin-imputar' as const, causa: 'Detencion', maquina: `Evisceradora ${i + 1}`, maquinaId: ['a', 'b', 'c'][i]! }))

  it('el rótulo de la derecha cuenta tiempo de RELOJ y episodios: 3 detenciones idénticas son «1 detención» y 55 min', () => {
    render(<GraficoRitmoVivo p={p} e={{ ...eje, paradas: tres }} reloj={reloj} />)
    expect(screen.getByText('1 detención')).toBeTruthy()
    expect(screen.getByText('55 min')).toBeTruthy()
    expect(screen.queryByText(/165/)).toBeNull()
  })

  it('el globo nombra a TODAS las máquinas paradas («Las 3 Baader» con 3 de 3) con el tramo y el dueño de la más larga', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...eje, paradas: tres }} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xDe(130.5), buttons: 0 }) })
    const globo = screen.getByRole('tooltip').textContent ?? ''
    expect(globo).toContain('Las 3 Baader')
    expect(globo).toContain('23:10 → 00:05 · 55 min')
    expect(globo).toContain('Sin imputar')
  })

  it('con 2 de 3 paradas el globo las nombra como la fila («Ev 1 · Ev 3»)', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...eje, paradas: [tres[0]!, tres[2]!] }} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xDe(130.5), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('Ev 1 · Ev 3')
  })

  it('un minuto al que una Baader aún no entregó dato dice «parcial · falta Ev 3»', () => {
    const corto = { ...eje, minuto: { ...eje.minuto!, maquinas: eje.minuto!.maquinas.map((m) => (m.id === 'c' ? { ...m, cycles: m.cycles.slice(0, AHORA - 1) } : m)) } }
    const { container } = render(<GraficoRitmoVivo p={p} e={corto} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xDe(304.5), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('parcial · falta Ev 3')
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xDe(250.5), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).not.toContain('parcial')
  })

  it('el color «mal» del gráfico es el alias `--rv-mal` (distinguible del ámbar)', () => {
    /* La Baader a de 19 anda a 3 pz/min con las otras dos a ritmo: menos de 50 % con la línea andando = «mal». */
    const lenta = { ...eje, paradas: [], paradasMaquina: null, minuto: { ...eje.minuto!, maquinas: eje.minuto!.maquinas.map((m) => (m.id === 'a' ? { ...m, cycles: m.cycles.map(() => 3) } : m)) } }
    const { container } = render(<GraficoRitmoVivo p={p} e={lenta} reloj={reloj} />)
    expect(container.innerHTML).toContain('fill="var(--rv-mal)"')
    /* Las marcas de micro «tras detención» usan `--v2-causa-paro` (en un grupo `<g fill>`) y las barras y celdas, ni ese ni `--v2-mal`. */
    expect(container.querySelector('rect[fill="var(--v2-mal)"]')).toBeNull()
  })
})

describe('GraficoRitmoVivo · turno cerrado', () => {
  const cerrado = { ...p, cerrado: true, proyeccion: null } as unknown as MonitorV2Props
  const ejeC: EjeDatos = { ...eje, finRealMs: INI + 440 * 60_000 }

  it('la raya y el rótulo van en el fin REAL («04:50 fin»), el subtítulo dice «terminado» y la leyenda «este turno»', () => {
    render(<GraficoRitmoVivo p={cerrado} e={ejeC} reloj={reloj} />)
    expect(screen.getByText('04:50 fin')).toBeTruthy()
    expect(screen.queryByText(/ahora$/)).toBeNull()
    expect(screen.getByText('21:30 → 04:50 · terminado')).toBeTruthy()
    expect(screen.getByText('este turno')).toBeTruthy()
    expect(screen.queryByText('hoy')).toBeNull()
  })

  it('el turno anterior dice su TOTAL al cierre (la misma cifra de la hoja «Piezas del turno» y de «Comparado con otros días»)', () => {
    render(<GraficoRitmoVivo p={cerrado} e={ejeC} reloj={reloj} />)
    expect(screen.getByText('lun 26 · 14.000 al cierre')).toBeTruthy()
  })

  it('sin fin real (dato ausente) queda como siempre: «ahora» y el fin previsto', () => {
    render(<GraficoRitmoVivo p={cerrado} e={eje} reloj={reloj} />)
    expect(screen.queryByText(/ fin$/)).toBeNull()
    expect(screen.getByText(/^21:30 → 05:00/)).toBeTruthy()
    expect(screen.queryByText(/terminado/)).toBeNull()
  })

  it('un corte anticipado no encoge el eje: el fin previsto sigue siendo el borde', () => {
    render(<GraficoRitmoVivo p={cerrado} e={{ ...eje, finRealMs: INI + 400 * 60_000 }} reloj={reloj} />)
    expect(screen.getByText('04:10 fin')).toBeTruthy()
    expect(screen.getByText('21:30 → 04:10 · terminado')).toBeTruthy()
  })
})

describe('GraficoRitmoVivo · leyenda del turno anterior', () => {
  it('en vivo dice la cifra a esta hora y la diferencia con hoy en el color que corresponde', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.getByText('lun 26 · 9.325 hechas a esta hora')).toBeTruthy()
    const dif = screen.getByText('· hoy 365 adelante')
    expect(dif.style.color).toContain('brand-ink')
  })

  it('con menos que el turno anterior la diferencia va en rojo de texto', () => {
    const menos = { ...p, curva: { ...p.curva!, previo: { label: 'lun 26', curve: [{ minutes: 5, pieces: 90 }, { minutes: AHORA, pieces: 12000 }, { minutes: 440, pieces: 14000 }] } } } as unknown as MonitorV2Props
    render(<GraficoRitmoVivo p={menos} e={eje} reloj={reloj} />)
    expect(screen.getByText('· hoy 2.310 atrás').style.color).toContain('v2-mal-texto')
  })

  it('en el celular la etiqueta del turno anterior es corta', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 309 })
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.getByText('lun 26 · 9.325')).toBeTruthy()
  })
})

describe('GraficoRitmoVivo · celular', () => {
  beforeEach(() => { Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 309 }) })

  it('«esperado N» va en la columna fija de la izquierda, no dentro del lienzo que se desplaza', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.getByText('esperado')).toBeTruthy()
    expect(screen.getByText('51')).toBeTruthy()
    expect(container.querySelector('.v2-minuto-scroll')!.textContent).not.toContain('esperado')
  })

  it('el globo no flota: va anclado a la tarjeta, con un ✕ que lo cierra', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    const x = Math.round((130.5 / 450) * 303)
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: x }) })
    act(() => { fireEvent.click(lienzo, { clientX: x }) })
    const globo = screen.getByRole('group', { name: 'Lectura del minuto' })
    expect(globo.className).toContain('top-[12px]')
    expect(globo.className).toContain('inset-x-[12px]')
    expect(globo.closest('.v2-minuto-scroll')).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Cerrar la lectura del minuto' })) })
    expect(screen.queryByRole('group', { name: 'Lectura del minuto' })).toBeNull()
  })

  it('al abrirlo se trae a la vista, bajo el encabezado fijo: anclado arriba de la tarjeta, quien mira el gráfico lo tenía fuera de la pantalla', () => {
    const vistos: Element[] = []
    const alVer = vi.fn(function (this: Element) { vistos.push(this) })
    Element.prototype.scrollIntoView = alVer
    /* El encabezado fijo del celular (56 px de alto): el globo queda 8 px bajo él. */
    const barra = document.createElement('div')
    barra.className = 'v2-cabecera'
    document.body.appendChild(barra)
    const espia = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const h = this.classList.contains('v2-cabecera') ? 56 : 0
      return { top: 0, bottom: h, left: 0, right: 0, width: 0, height: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })
    try {
      const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
      const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
      const x = Math.round((130.5 / 450) * 303)
      act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: x }) })
      act(() => { fireEvent.click(lienzo, { clientX: x }) })
      const globo = screen.getByRole('group', { name: 'Lectura del minuto' })
      expect(vistos).toEqual([globo])
      expect(alVer).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
      expect(globo.style.scrollMarginTop).toBe('64px')
    } finally {
      espia.mockRestore()
      barra.remove()
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })
})

describe('GraficoRitmoVivo · escala Y con zoom', () => {
  it('«Turno» deja la escala de siempre (0…16.000) y «15 min» la ajusta a lo que se ve', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.getByText('16.000')).toBeTruthy()
    expect(screen.getByText('meta 15.000')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    expect(screen.queryByText('16.000')).toBeNull()
    expect(screen.queryByText('meta 15.000')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Turno' }))
    expect(screen.getByText('16.000')).toBeTruthy()
  })
})

describe('GraficoRitmoVivo · ⓘ dentro de la pantalla', () => {
  it('a 375 el globo se corre hacia adentro: a 16 px del borde y de ancho min(270, ancho − 32)', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 375 })
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const izq = this.getAttribute('aria-label') === null && this.className.toString().includes('relative inline-flex') ? 237 : 0
      return { left: izq, right: izq + 24, top: 0, bottom: 24, width: 24, height: 24, x: izq, y: 0, toJSON: () => ({}) } as DOMRect
    }
    try {
      render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
      fireEvent.click(screen.getByRole('button', { name: 'Qué significan los colores' }))
      const tip = screen.getByRole('tooltip')
      expect(tip.style.width).toBe('270px')
      /* 375 − 16 − 270 = 89 de borde izquierdo; el botón está en 237 → se corre −148. */
      expect(tip.style.left).toBe('-148px')
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally { Element.prototype.getBoundingClientRect = original }
  })
})

describe('GraficoRitmoVivo · sigue al reloj único de la cola', () => {
  /** Un reloj de cola en el minuto `j` (mitad del minuto): el cuadro trae `rep` como el del hook. */
  const relojCola = (j: number): RelojDeDatos => {
    const cuadro = () => ({
      valor: 4000 + 20, frac: 0.5,
      previa: { valor: 4000, atMs: INI + j * 60_000 }, ultima: { valor: 4040, atMs: INI + (j + 1) * 60_000 }, atrasada: false,
      rep: { frac: 0.5, seg: 30, tMs: INI + (j + 0.5) * 60_000, minutoIdx: j, total: 4020, totalPiso: 4000, totalFinal: 4040, porMaquina: [], estado: 'vivo', atrasoS: 120, factor: 1, ultimaLecturaHHMM: '02:35', atrasada: false, animando: true, saltos: 0 },
    })
    return { cuadro, alCuadro: (fn: (c: CuadroReloj) => void) => { fn(cuadro() as unknown as CuadroReloj); return () => {} }, version: 1, detenida: false, reducido: false } as unknown as RelojDeDatos
  }
  /** Barras por minuto dibujadas: los `M` de los trazos de relleno liso (las filas por Baader llevan opacidad). */
  const barras = (c: HTMLElement) =>
    [...c.querySelectorAll('svg path')].filter((q) => (q.getAttribute('fill') ?? '').startsWith('var(--') && !q.getAttribute('fill-opacity'))
      .reduce((a, q) => a + ((q.getAttribute('d') ?? '').match(/M/g)?.length ?? 0), 0)

  it('las barras llegan solo hasta el minuto que corre: los minutos que esperan en la cola no se dibujan todavía', () => {
    const sinCola = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const todas = barras(sinCola.container)
    cleanup()
    const conCola = render(<GraficoRitmoVivo p={p} e={eje} reloj={relojCola(200)} />)
    const jugadas = barras(conCola.container)
    expect(todas).toBeGreaterThan(200)
    expect(jugadas).toBeLessThan(todas - 80)
    expect(jugadas).toBeGreaterThan(100)
  })

  it('el minuto que corre es su propia barra, que crece con transform (sin layout); sin cola no hay barra en curso', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={relojCola(200)} />)
    const viva = container.querySelector('rect[style*="scaleY"]') as SVGRectElement | null
    expect(viva).not.toBeNull()
    expect(viva!.getAttribute('style')).toContain('scaleY(0.5')
    cleanup()
    const sin = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(sin.container.querySelector('rect[style*="scaleY"]')).toBeNull()
  })
  it('«al cierre» es la proyección de siempre (15.623) también con la cola atrasada: no se arma con las piezas del cuadro, que van detrás del contador', () => {
    /* El cuadro va en 4.020 y el contador (p.piezas) en 9.690: `cuadro + (proyección − contador)` diría 9.953, bajo por las piezas que ya se hicieron. */
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 309 })
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={relojCola(200)} />)
    expect(container.textContent).toContain('al cierre 15.623')
    expect(container.textContent).not.toContain('al cierre 9.953')
  })

  describe('franja de rango y pista de la rueda (spec §6)', () => {
    it('la franja de 44 px va bajo el gráfico con su mini curva y la ventana cubriendo todo el turno', () => {
      const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
      const franja = container.querySelector('.rv-rango') as HTMLElement
      expect(franja).not.toBeNull()
      expect(franja.querySelector('svg path')?.getAttribute('d')).toMatch(/^M0.00 /)
      const vent = franja.querySelector('.rv-rango-vent') as HTMLElement
      expect(vent.style.left).toBe('0%')
      expect(vent.style.width).toBe('100%')
      /* Las dos asas son controles con nombre y valor para quien no ve. */
      expect(screen.getByRole('slider', { name: 'Inicio de lo que se ve' }).getAttribute('aria-valuenow')).toBe('0')
      expect(screen.getByRole('slider', { name: 'Fin de lo que se ve' }).getAttribute('aria-valuenow')).toBe('450')
    })

    it('los atajos mueven la ventana de la franja: «1 h» deja 60 min y «Turno» la vuelve a todo el turno', () => {
      const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
      fireEvent.click(screen.getByRole('button', { name: '1 h' }))
      const vent = container.querySelector('.rv-rango-vent') as HTMLElement
      expect(parseFloat(vent.style.width)).toBeCloseTo((60 / 450) * 100, 1)
      fireEvent.click(screen.getByRole('button', { name: '15 min' }))
      expect(parseFloat(vent.style.width)).toBeCloseTo((15 / 450) * 100, 1)
      fireEvent.click(screen.getByRole('button', { name: 'Turno' }))
      expect(vent.style.width).toBe('100%')
    })

    it('mover un asa por teclado acerca el gráfico: el atajo deja de marcar «Turno»', () => {
      render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Inicio de lo que se ve' }), { key: 'ArrowRight' })
      expect(screen.getByRole('slider', { name: 'Inicio de lo que se ve' }).getAttribute('aria-valuenow')).toBe('5')
      expect(screen.getByRole('button', { name: 'Turno' }).getAttribute('aria-pressed')).toBe('false')
    })

    it('la rueda SIN Ctrl no se secuestra y muestra 1,6 s la pista; con Ctrl sí se captura', () => {
      vi.useFakeTimers()
      try {
        const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
        const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
        const pista = container.querySelector('.rv-pista-rueda') as HTMLElement
        expect(pista.textContent).toBe('Ctrl + rueda o pellizca para acercar')
        expect(pista.getAttribute('data-ver')).toBe('false')
        const sin = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
        act(() => { lienzo.dispatchEvent(sin) })
        expect(sin.defaultPrevented).toBe(false)
        expect(pista.getAttribute('data-ver')).toBe('true')
        act(() => { vi.advanceTimersByTime(1500) })
        expect(pista.getAttribute('data-ver')).toBe('true')
        act(() => { vi.advanceTimersByTime(150) })
        expect(pista.getAttribute('data-ver')).toBe('false')
        const con = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
        /* jsdom ignora `ctrlKey` en el constructor de WheelEvent: se fija a mano. */
        Object.defineProperty(con, 'ctrlKey', { value: true })
        act(() => { lienzo.dispatchEvent(con) })
        expect(con.defaultPrevented).toBe(true)
        expect(pista.getAttribute('data-ver')).toBe('false')
      } finally { vi.useRealTimers() }
    })
  })

})

describe('leyenda y rótulo de detenciones', () => {
  it('«hoy N atrás/adelante» sale de las hechas de la cifra grande (9.671), no de la serie al minuto (9.690)', () => {
    const entrada = {
      desdeMs: INI,
      maquinas: [
        { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: [3309] },
        { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: [3071] },
        { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: [3291] },
      ],
      paradas: {},
      pulsoAtMs: null,
    }
    const conRepro = { ...p, repro: { entrada, tope: armarTope(9690, null) } } as unknown as MonitorV2Props
    const { container } = render(<GraficoRitmoVivo p={conRepro} e={eje} reloj={reloj} />)
    const t = container.textContent ?? ''
    expect(t).toContain('lun 26 · 9.325 hechas a esta hora')
    expect(t).toContain('hoy 346 adelante')
    expect(t).not.toContain('hoy 365 adelante')
  })

  it('el tiempo de detenciones dice que mide minutos con «alguna Baader detenida» (glosario: detenciones, no paradas)', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.getByText('alguna Baader detenida')).toBeTruthy()
  })
})

describe('GraficoRitmoVivo · micro con causa posible y probable (causas v3)', () => {
  const hora = (min: number, seg: number) => new Date(INI + min * 60_000 + seg * 1000).toISOString()
  /* Ev 1 y Ev 2 marcan micro con 7 s de diferencia al minuto 30 (línea común); Ev 3 una sola al minuto 60 (sin contexto). */
  const microEventos = [
    { r: 1, f: hora(30, 13), s: 15, m: 0 },
    { r: 1, f: hora(30, 20), s: 30, m: 1 },
    { r: 1, f: hora(60, 0), s: 15, m: 2 },
  ]
  const conMicro: EjeDatos = {
    ...eje,
    microTotal: 9,
    ritmoAnduvo: [{ nombre: 'Evisceradora 1', cpm: 18.2 }, { nombre: 'Evisceradora 2', cpm: 15.4 }, { nombre: 'Evisceradora 3', cpm: 15.9 }],
    paradasMaquina: { ...eje.paradasMaquina!, stopEvents: [...eje.paradasMaquina!.stopEvents!, ...microEventos], stopReasons: ['Detencion', 'Micro Detencion'] },
  }
  const d = disenar(1806, 'grande', 3, true, true)
  const yFila = (i: number) => d.carriles[i]!.y0 + d.carriles[i]!.h / 2
  const yMicro = d.micro!.y0 + d.micro!.h / 2
  /* El minuto 30 + 13 s. */
  const xMicro = xDe(30 + 13 / 60)

  it('sin calibración para la línea (el doc no trae planta): la cifra dice «3 micro (+6 de 0 s)», sin «~», y los chips muestran solo micro y tiempo', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    expect(sp(container.querySelector('.rv-cz-cifra')!.textContent)).toBe('3 micro (+6 de 0 s)')
    expect(container.querySelector('.rv-cz-rot')).toBeNull()
    expect(container.querySelector('.rv-cz-ley')).toBeNull()
    expect(sp(container.querySelector('.rv-cz-rotchips')!.textContent)).toBe('micro · tiempo detenido')
    const chips = Array.from(container.querySelectorAll('.rv-mc-chip')).map((c) => sp(c.textContent))
    expect(chips).toEqual(['Arranque 0 · 0 s', 'Otra Baader paró 2 · 45 s', 'Al volver de una detención 0 · 0 s', 'Sin contexto 1 · 15 s'])
    for (const c of chips) expect(c).not.toContain('~')
    /* Ya no hay aviso largo: lo que explicaba (las de 0 s) vive en el ⓘ. */
    expect(container.querySelector('.rv-mc-aviso')).toBeNull()
  })

  it('con calibración (planta chonchi): «~1 de 3 · con causa probable · estimado», chips «Otra Baader paró ~1 de 2 · 45 s» y la leyenda «causa probable · causa posible»', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, planta: 'chonchi' }} reloj={reloj} />)
    const cifra = container.querySelector('.rv-cz-cifra')!
    expect(sp(cifra.textContent)).toBe('~1 de 3 (+6 de 0 s)')
    expect(sp(container.querySelector('.rv-cz-rot')!.textContent)).toBe('con causa probable · estimadoest.')
    expect(sp(container.querySelector('.rv-cz-rot .solo-pc')!.textContent)).toBe('estimado')
    expect(sp(container.querySelector('.rv-cz-rot .solo-mv')!.textContent)).toBe('est.')
    expect(sp(container.querySelector('.rv-cz-ley')!.textContent)).toBe('causa probablecausa posible')
    expect(Array.from(container.querySelectorAll('.rv-mc-chip')).map((c) => sp(c.textContent))).toEqual([
      'Arranque 0 · 0 s', 'Otra Baader paró ~1 de 2 · 45 s', 'Al volver de una detención 0 · 0 s', 'Sin contexto 1 · 15 s',
    ])
  })

  it('la barra: un tramo por causa con micro, de ancho proporcional a las micro; lo probable en sólido, el resto rayado y «Sin contexto» con contorno', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, planta: 'chonchi' }} reloj={reloj} />)
    const tramos = Array.from(container.querySelectorAll('.rv-cz-barra .s')) as HTMLElement[]
    expect(tramos.map((t) => [t.getAttribute('data-causa'), t.style.flexGrow])).toEqual([['linea', '2'], ['sin', '1']])
    /* «Otra Baader paró»: ~1 de 2 → una parte sólida (b) y una rayada (u), cada una proporcional. */
    const linea = tramos[0]!
    expect(linea.classList.contains('par')).toBe(true)
    expect(Array.from(linea.children).map((c) => [c.tagName, (c as HTMLElement).style.flexGrow])).toEqual([['B', '1'], ['U', '1']])
    expect(tramos[1]!.classList.contains('borde')).toBe(true)
    expect(container.querySelector('.rv-cz-barra')!.getAttribute('aria-label')).toBe('3 micro: ~1 de 2 Otra Baader paró, 1 Sin contexto')
  })

  it('la marca de cada chip es el mismo dibujo de su tramo: mixto (sólido y rayado), contorno para «Sin contexto», rayado cuando lo probable es 0', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, planta: 'chonchi' }} reloj={reloj} />)
    const marca = (k: string) => container.querySelector(`.rv-mc-chip[data-causa="${k}"] .rv-sw`)!.getAttribute('data-marca')
    expect(marca('linea')).toBe('mixto')
    expect(marca('sin')).toBe('borde')
    expect(marca('arranque')).toBe('rayado')
    expect(marca('paro')).toBe('rayado')
  })

  it('cada chip explica su causa (title) con las cifras de los parámetros de la planta', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    const titulos = Array.from(container.querySelectorAll('.rv-mc-chip')).map((c) => [c.getAttribute('data-causa'), sp(c.getAttribute('title'))])
    expect(titulos.map(([k]) => k)).toEqual(['arranque', 'linea', 'paro', 'sin'])
    expect(titulos[0]![1]).toBe('en los primeros 10 min desde que esa Baader empieza a producir, o desde que vuelve de una detención suya de 10 min o más.')
    expect(titulos[2]![1]).toBe('hasta 2 min después de que terminó una detención de esa misma Baader.')
    expect(titulos[3]![1]).toBe('ninguna de las anteriores. Los datos de Shoplogix aún no muestran su causa.')
  })

  it('el ⓘ «Micro: causa probable y posible»: las seis reglas en el orden en que se evalúan, las notas y lo que llega de las micro de 0 s', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, planta: 'chonchi' }} reloj={reloj} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' })) })
    const panel = container.querySelector('.rv-cz-info')!
    expect(sp(panel.querySelector('.ip-tit')!.textContent)).toBe('Micro: causa probable y posible')
    expect(sp(panel.querySelector('p')!.textContent)).toBe('Cada micro cuenta una sola vez, en la primera que cumple, en este orden:')
    expect(Array.from(panel.querySelectorAll('ol li b')).map((b) => sp(b.textContent))).toEqual([
      'Arranque', 'Otra Baader paró · a la vez', 'Al volver de una detención', 'Otra Baader paró · en cadena', 'Otra Baader paró · detención previa', 'Sin contexto',
    ])
    const t = sp(panel.textContent)
    expect(t).toContain('Causa posible: la micro coincidió con eso.')
    expect(t).toContain('Causa probable (~1): cuántas de esas coincidencias superan lo que se ve en cualquier momento del turno, estimado con las 8 semanas al 02-11-2026 (Causas v3, Chonchi). Ninguna micro ocurre porque sí')
    expect(t).toContain('En observación: en las 8 semanas, esas micro no fueron más seguidas que en cualquier otro momento del turno. Se muestran, pero no suman a la causa probable.')
    expect(t).toContain('Este turno, Otra Baader paró 2 = a la vez 2 · en cadena 0 · detención previa 0.')
    expect(t).toContain('Se ven las 3 micro de 15 s o más. Las de 0 s Shoplogix las anota con hora, pero sin duración. Al monitor llega solo cuántas son.')
    /* Escape y tocar fuera lo cierran. */
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(container.querySelector('.rv-cz-info')).toBeNull()
  })

  it('sin calibración el ⓘ lo dice: «Esta línea todavía no tiene calibración: no se estima la causa probable»', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' })) })
    const t = sp(container.querySelector('.rv-cz-info')!.textContent)
    expect(t).toContain('Esta línea todavía no tiene calibración: no se estima la causa probable.')
    expect(t).not.toContain('Causa probable (~')
  })

  it('el ⓘ de la leyenda del gráfico ya no explica las causas de las micro (eso vive en el ⓘ del resumen)', () => {
    render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Qué significan los colores' })) })
    const ayuda = screen.getByRole('tooltip').textContent ?? ''
    expect(ayuda).toContain('Cómo usarlo')
    expect(ayuda).not.toContain('Micro: causa')
  })

  it('a 1366 (tamaño medio) el resumen es el mismo bloque, sin el aviso largo de antes', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1276 })
    try {
      const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
      const mc = container.querySelector('.rv-mc')!
      expect(mc.getAttribute('data-tam')).toBe('medio')
      expect(mc.querySelector('.rv-cz-cifra')).not.toBeNull()
      expect(mc.querySelector('.rv-mc-aviso')).toBeNull()
      expect(container.textContent).not.toContain('Aquí se ven')
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1806 })
    }
  })

  it('la columna de la derecha: «N con hora · de M» y, por Baader, «anduvo a X pz/min · esperado N» con el ritmo que ya usa el monitor', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    const t = container.textContent ?? ''
    expect(t).toContain('3 con hora · de 9')
    expect(t).toContain('anduvo a 18,2 pz/min')
    expect(t).toContain('esperado 19')
    expect(t).toContain('anduvo a 15,4 pz/min')
    expect(t).toContain('esperado 16')
  })

  it('sin el total del turno omite «(+M de 0 s)» y «de M»; sin ritmo andando no dice «anduvo a»; no inventa cuántas faltan', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, microTotal: null, ritmoAnduvo: null }} reloj={reloj} />)
    const t = container.textContent ?? ''
    expect(t).toContain('3 con hora')
    expect(t).not.toContain('con hora · de')
    expect(t).not.toContain('anduvo a')
    expect(sp(container.querySelector('.rv-cz-cifra')!.textContent)).toBe('3 micro')
    expect(t).not.toContain('de 0 s)')
  })

  it('si el total del turno fuera MENOR que las que se ven (dato incoherente), no escribe una diferencia negativa ni «(+M de 0 s)»', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, microTotal: 2 }} reloj={reloj} />)
    expect(sp(container.querySelector('.rv-cz-cifra')!.textContent)).toBe('3 micro')
    expect(container.querySelector('.rv-cz')!.textContent).not.toMatch(/-\d/)
  })

  it('sin paradas por máquina no hay carril «Micro» ni aviso (no se adivina de qué Baader fue cada una)', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...eje, paradasMaquina: null }} reloj={reloj} />)
    expect(container.querySelector('.rv-mc')).toBeNull()
    expect(container.textContent).not.toContain('con hora')
  })

  it('con el mouse sobre la marca sale el globo de la micro: encabezado en una línea, UNA línea de causa con su ① y la tabla; «Ver detalle» cerrado', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, planta: 'chonchi' }} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0), buttons: 0 }) })
    const globos = screen.getAllByRole('tooltip')
    expect(globos).toHaveLength(1)
    const globo = globos[0]!
    expect(sp(globo.querySelector('.gm-tit')!.textContent)).toBe('Ev 1 · micro de 15 s (+~20 s sin anotar) · 22:00:13')
    /* Ev 1 y Ev 2 se detuvieron con 7 s de diferencia: «a la vez», y se dice cuánta. */
    expect(sp(globo.querySelector('.gm-causa4')!.textContent)).toBe('Causa posible: Otra Baader paró · Ev 2 con micro 7 s después 1')
    /* La tabla: una fila por Baader con sus minutos 21:58 … 22:01 y el esperado. */
    expect(Array.from(globo.querySelectorAll('thead th')).map((t) => sp(t.textContent))).toEqual(['pz/min', '21:58', '21:59', '22:00', '22:01', 'Esperado'])
    /* Cada celda es «número de la razón · cifra» (el número va aparte de la cifra: «1·17» y no «117»). */
    const celda = (c: Element) => { const v = c.querySelector('.v'); const n = Array.from(c.querySelectorAll('.ref')).map((r) => r.textContent).join(''); return v ? `${n ? `${n}·` : ''}${v.textContent}` : sp(c.textContent) }
    expect(Array.from(globo.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('th,td')).map(celda))).toEqual([
      ['Ev 1', '17', '17', '1·17', '17', '19'],
      ['Ev 2', '14', '14', '1·14', '14', '16'],
      ['Ev 3', '14', '14', '14', '14', '16'],
    ])
    /* Por defecto no hay detalle: «Ver detalle» está cerrado. */
    expect(screen.getByRole('button', { name: /Ver detalle/ }).getAttribute('aria-expanded')).toBe('false')
    expect(globo.querySelector('.gm-dc')).toBeNull()
  })

  it('un clic con el mouse sobre la marca deja el globo FIJO: recibe el mouse, se abre «Ver detalle» y otro clic en el gráfico lo suelta', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...conMicro, planta: 'chonchi' }} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0) }) })
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0), buttons: 0 }) })
    expect(screen.getByRole('tooltip').className).toContain('pointer-events-none')
    act(() => { fireEvent.click(lienzo, { clientX: xMicro, clientY: yFila(0) }) })
    const fijo = screen.getByRole('group', { name: 'Micro detención y su causa posible' })
    expect(fijo.className).not.toContain('pointer-events-none')
    /* Fijo, el mouse puede recorrer el gráfico sin cambiar de micro. */
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xDe(200.5), clientY: yFila(0), buttons: 0 }) })
    expect(screen.getByRole('group', { name: 'Micro detención y su causa posible' })).toBe(fijo)
    /* «Ver detalle» abre con un clic y trae lo del detalle, con el vocabulario nuevo. */
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ver detalle/ })) })
    const g = sp(fijo.textContent)
    expect(g).toContain('Forma: a la vez. Ev 1 15 s · Ev 2 30 s.')
    expect(g).toContain('No es arranque: ya pasaron 10 min desde que Ev 1 empezó a producir (21:30) y no tuvo detenciones de 10 min o más')
    expect(g).toContain('No es «Al volver de una detención»: Ev 1 no tuvo detenciones antes de la micro')
    expect(g).toContain('la detención pudo empezar en este minuto: Shoplogix la anota con 15 a 30 s de atraso')
    expect(g).toContain('Causa posible no prueba que eso la provocó: lo calcula el monitor y se confirma en terreno.')
    expect(g).not.toMatch(/ya venía de antes|ya estaba parando|falta de pescado|baja velocidad|carros|venían lentas/i)
    /* Otro clic en el gráfico lo suelta: vuelve a flotar sin frenar el puntero. */
    act(() => { fireEvent.click(lienzo, { clientX: xMicro, clientY: yFila(0) }) })
    expect(screen.queryByRole('group', { name: 'Micro detención y su causa posible' })).toBeNull()
  })

  it('el globo de PC mide 640 px, se centra sobre la marca (left = x − 320) y no se sale del gráfico (entre 8 y ancho − 648)', () => {
    /* Una micro más a la derecha de Ev 1, en el minuto 300 + 20 s: su marca queda a ~1.065 px y el globo la centra. */
    const lejos: EjeDatos = { ...conMicro, paradasMaquina: { ...conMicro.paradasMaquina!, stopEvents: [...conMicro.paradasMaquina!.stopEvents!, { r: 1, f: hora(300, 20), s: 15, m: 0 }] } }
    const { container } = render(<GraficoRitmoVivo p={p} e={lejos} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    const izquierda = () => parseFloat((screen.getByRole('tooltip') as HTMLElement).style.left)
    /* A la izquierda del gráfico: tope de 8 px. */
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0), buttons: 0 }) })
    expect(izquierda()).toBe(8)
    expect(screen.getByRole('tooltip').className).toContain('pc2')
    /* Lejos de los bordes: centrado en la marca. `d.pl` es el ancho de los rótulos de la izquierda. */
    const x300 = xDe(300 + 20 / 60)
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: x300, clientY: yFila(0), buttons: 0 }) })
    expect(izquierda()).toBe(d.pl + x300 - 320)
  })

  it('la leyenda dice «detención casi a la vez en 2 o 3 Baader» (±15 s) solo si hay una micro «a la vez», y que el color de la ▼ es la causa posible', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    expect(container.textContent).toContain('detención casi a la vez en 2 o 3 Baader')
    expect(container.textContent).toContain('micro en su Baader (el color es la causa posible)')
    expect(container.textContent).not.toContain('micro a la vez')
    cleanup()
    const sola = { ...conMicro, paradasMaquina: { ...conMicro.paradasMaquina!, stopEvents: [...eje.paradasMaquina!.stopEvents!, { r: 1, f: hora(60, 0), s: 15, m: 2 }] } }
    const { container: c2 } = render(<GraficoRitmoVivo p={p} e={sola} reloj={reloj} />)
    expect(c2.textContent).not.toContain('casi a la vez')
  })

  it('la marca del carril «Micro» también abre el globo; lejos de las marcas sigue saliendo el del minuto', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yMicro, buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('Causa posible')
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xDe(200.5), clientY: yFila(0), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).not.toContain('Causa posible')
    expect(screen.getByRole('tooltip').textContent).toContain('minuto')
    act(() => { fireEvent.pointerLeave(lienzo, { pointerType: 'mouse' }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('con el dedo basta con tocar a 15 px de la marca (área de 44 px); tocar otra vez la cierra', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: xMicro + 15, clientY: yFila(1) }) })
    act(() => { fireEvent.click(lienzo, { clientX: xMicro + 15, clientY: yFila(1) }) })
    expect(sp(screen.getByRole('tooltip').querySelector('.gm-causa4')!.textContent)).toContain('Otra Baader paró')
    act(() => { fireEvent.click(lienzo, { clientX: xMicro + 15, clientY: yFila(1) }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('abierto con el dedo, el mouse que inventa WebKit al desplazar la página no lo cierra; un clic con el mouse le devuelve el mando', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    const causa = () => sp(screen.queryByRole('tooltip')?.querySelector('.gm-causa4 b:not(.ref)')?.textContent ?? '')
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: xMicro + 15, clientY: yFila(1) }) })
    act(() => { fireEvent.click(lienzo, { clientX: xMicro + 15, clientY: yFila(1) }) })
    expect(causa()).toBe('Otra Baader paró')
    /* Lo que emitió WebKit el 02-11 (375 px) al traer el globo a la vista: movimiento y salida de tipo 'mouse', lejos de la marca. */
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xDe(200.5), clientY: yFila(0), buttons: 0 }) })
    act(() => { fireEvent.pointerLeave(lienzo, { pointerType: 'mouse' }) })
    expect(causa()).toBe('Otra Baader paró')
    /* Tras un clic con el mouse, salir del gráfico con el mouse lo cierra, como siempre. */
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0) }) })
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0), buttons: 0 }) })
    act(() => { fireEvent.pointerLeave(lienzo, { pointerType: 'mouse' }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('Escape cierra el globo de la micro (con el teclado no hay otra forma de quitarlo)', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('Causa posible')
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  describe('dónde cae el globo respecto del encabezado fijo de la página (PC)', () => {
    const rect = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 0, width: 0, height: h, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    /** Simula la geometría que jsdom no tiene: el encabezado fijo (49 px), el lienzo a 170,75 px de la ventana y el alto del globo. */
    const conGeometria = (altoGlobo: number, barra: boolean, correr: () => void) => {
      const espiaRect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this.classList.contains('v2-barra-pc')) return rect(0, 49)
        if (this.classList.contains('relative') && this.firstElementChild?.getAttribute('role') === 'img') return rect(170.75, 379)
        return rect(0, 0)
      })
      const espiaAlto = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('gm') ? altoGlobo : 0
      })
      if (barra) { const b = document.createElement('div'); b.className = 'v2-barra-pc'; document.body.appendChild(b) }
      try { correr() } finally { espiaRect.mockRestore(); espiaAlto.mockRestore() }
    }
    const abrir = () => {
      const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
      const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
      act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: yFila(0), buttons: 0 }) })
      return screen.getByRole('tooltip') as HTMLElement
    }

    it('si arriba no cabe sin quedar bajo el encabezado, baja lo justo: su borde de arriba queda 8 px bajo él (49 + 8 = 57 px de la ventana), y se corre a un lado de la marca para no taparla', () => {
      conGeometria(600, true, () => {
        const globo = abrir()
        /* top dentro del lienzo = 57 − 170,75. Y sin `bottom`: ya está medido. */
        expect(parseFloat(globo.style.top)).toBe(57 - 170.75)
        expect(globo.style.bottom).toBe('')
        /* La marca queda a la izquierda del gráfico: el globo va a su derecha, a 14 px (`d.pl` es el ancho de los rótulos de la izquierda). */
        expect(parseFloat(globo.style.left)).toBe(d.pl + xMicro + 14)
      })
    })

    it('si cabe, queda donde siempre: su borde de abajo 10 px sobre la primera fila Ev, centrado en la marca (acotado al gráfico)', () => {
      conGeometria(300, true, () => {
        const globo = abrir()
        expect(parseFloat(globo.style.top) + 300).toBe(d.carriles[0]!.y0 - 10)
        expect(parseFloat(globo.style.left)).toBe(8)
      })
    })

    it('sin encabezado fijo en la página no se corre por él (solo por el borde de la ventana)', () => {
      conGeometria(600, false, () => {
        const globo = abrir()
        expect(parseFloat(globo.style.top)).toBe(8 - 170.75)
      })
    })
  })

  describe('en el celular el globo va en el flujo, bajo el gráfico', () => {
    afterEach(() => { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView })

    it('no flota sobre lo que sigue: queda dentro de la tarjeta, después del gráfico, sin posición absoluta ni top, se trae a la vista y no se alinea bajo el encabezado fijo', () => {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 309 })
      const alVer = vi.fn()
      Element.prototype.scrollIntoView = alVer
      /* El encabezado fijo del celular (56 px de alto): al traer el globo a la vista no se alinea bajo él (scroll-margin-top = 56 + 8). */
      const barra = document.createElement('div')
      barra.className = 'v2-cabecera'
      document.body.appendChild(barra)
      const espia = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        const h = this.classList.contains('v2-cabecera') ? 56 : 0
        return { top: 0, bottom: h, left: 0, right: 0, width: 0, height: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      })
      try {
        const { container } = render(<GraficoRitmoVivo p={p} e={conMicro} reloj={reloj} />)
        const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
        const dc = disenar(309, 'chico', 3, true, true)
        const x = Math.round(((30 + 13 / 60) / 450) * 303)
        const y = dc.carriles[0]!.y0 + dc.carriles[0]!.h / 2
        act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: x, clientY: y }) })
        act(() => { fireEvent.click(lienzo, { clientX: x, clientY: y }) })
        const globo = screen.getByRole('group', { name: 'Micro detención y su causa posible' })
        const envoltorio = globo.closest('[data-globo-minuto]') as HTMLElement
        expect(envoltorio).not.toBeNull()
        expect(envoltorio.className).not.toContain('absolute')
        expect(envoltorio.style.top).toBe('')
        /* Dentro de la tarjeta, fuera del lienzo que se desplaza, y DESPUÉS del gráfico en el flujo (empuja lo de abajo). */
        expect(envoltorio.closest('section.rv-grafico')).not.toBeNull()
        expect(envoltorio.closest('.v2-minuto-scroll')).toBeNull()
        expect(lienzo.compareDocumentPosition(envoltorio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        /* Antes de la franja de rango y de los chips, que son lo que quedaba debajo del globo. */
        const rango = container.querySelector('.rv-rango-caja') as HTMLElement
        expect(envoltorio.compareDocumentPosition(rango) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(globo.className).toContain('movil')
        /* Se trae a la vista (lo mínimo) para que no quede bajo el pliegue, 8 px más abajo que el encabezado fijo. */
        expect(alVer).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
        expect(envoltorio.style.scrollMarginTop).toBe('64px')
        /* Tocar la misma marca lo cierra y Escape también. */
        act(() => { fireEvent.click(lienzo, { clientX: x, clientY: y }) })
        expect(screen.queryByRole('group', { name: 'Micro detención y su causa posible' })).toBeNull()
        act(() => { fireEvent.click(lienzo, { clientX: x, clientY: y }) })
        expect(screen.getByRole('group', { name: 'Micro detención y su causa posible' })).toBeTruthy()
        act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
        expect(screen.queryByRole('group', { name: 'Micro detención y su causa posible' })).toBeNull()
      } finally { espia.mockRestore() }
    })
  })

  it('Filete (una Baader): sin el chip de «Otra Baader paró» y el globo trae una sola fila en la tabla, sin esa regla entre las descartadas', () => {
    const uno: EjeDatos = {
      ...conMicro,
      planta: 'filete',
      minuto: { ...eje.minuto!, maquinas: [eje.minuto!.maquinas[0]!] },
      ritmoAnduvo: [{ nombre: 'Evisceradora 1', cpm: 18.2 }],
      paradasMaquina: { ...conMicro.paradasMaquina!, stopMachines: ['a'], stopEvents: [{ r: 1, f: hora(30, 13), s: 15, m: 0 }] },
    }
    const { container } = render(<GraficoRitmoVivo p={p} e={uno} reloj={reloj} />)
    expect(Array.from(container.querySelectorAll('.rv-mc-chip')).map((c) => c.getAttribute('data-causa'))).toEqual(['arranque', 'paro', 'sin'])
    const d1 = disenar(1806, 'grande', 1, true, true)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xMicro, clientY: d1.carriles[0]!.y0 + d1.carriles[0]!.h / 2, buttons: 0 }) })
    const globo = screen.getByRole('tooltip')
    expect(sp(globo.textContent)).toContain('Ev 1 · micro de 15 s')
    expect(globo.querySelectorAll('tbody tr')).toHaveLength(1)
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ver detalle/ })) })
    const g = sp(globo.textContent)
    expect(g).not.toContain('Otra Baader paró')
    expect(Array.from(globo.querySelectorAll('.gm-desc li b')).map((b) => sp(b.textContent))).toEqual(['No es arranque:', 'No es «Al volver de una detención»:'])
    /* Con una sola Baader el ⓘ del resumen tampoco lista las reglas que no existen (ni la «a la vez», ni «en cadena», ni «detención previa»). */
    fireEvent.click(screen.getByRole('button', { name: 'Qué significan la causa probable y la posible' }))
    expect(Array.from(container.querySelectorAll('.rv-cz-info ol li b')).map((b) => sp(b.textContent))).toEqual(['Arranque', 'Al volver de una detención', 'Sin contexto'])
    expect(sp(container.querySelector('.rv-cz-info')!.textContent)).not.toContain('Otra Baader paró')
  })
})

describe('GloboMicro · variante del celular (una columna) y marcas', () => {
  const T0 = Date.parse('2026-11-02T09:15:00.000Z')
  const iso = (seg: number) => new Date(T0 + seg * 1000).toISOString()
  const serieG = { desde: iso(0), maquinas: [18, 16, 16].map((esperado, j) => ({ id: `m${j}`, nombre: `Evisceradora ${j + 1}`, esperado, cycles: Array.from({ length: 60 }, () => esperado) })) }
  const q = clasificarMicros({
    serie: serieG,
    stopEvents: [{ r: 0, f: iso(1805), s: 15, m: 0 }, { r: 0, f: iso(1805), s: 30, m: 1 }],
    stopReasons: ['Micro Detencion'],
    stopMachines: ['m0', 'm1', 'm2'],
    inicioTurnoMs: T0,
  })[0]!

  it('en una columna (compacto) va como grupo con el botón de cerrar y los mismos textos', () => {
    const cerrar = vi.fn()
    const { container } = render(<GloboMicro q={q} compacto onCerrar={cerrar} />)
    const globo = screen.getByRole('group', { name: 'Micro detención y su causa posible' })
    expect(globo.className).toContain('movil')
    expect(container.querySelector('.gm-cols')).toBeNull()
    expect(sp(globo.textContent)).toContain('Otra Baader paró · Ev 2 con micro a la vez')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la lectura de la micro' }))
    expect(cerrar).toHaveBeenCalledTimes(1)
  })

  it('en PC (dos columnas) va como tooltip, solo con el botón «Ver detalle»; la fila de la micro y su columna quedan marcadas, y cada marca dice qué es', () => {
    const { container } = render(<GloboMicro q={q} />)
    expect(screen.getByRole('tooltip').className).toContain('pc2')
    expect(screen.getAllByRole('button').map((b) => sp(b.textContent))).toEqual(['Ver detalle'])
    expect(container.querySelector('.gm-cols')).not.toBeNull()
    expect(container.querySelectorAll('tbody tr.ella')).toHaveLength(1)
    expect(container.querySelector('thead th.cm')!.textContent).toBe('09:45')
    /* ▼ en el minuto de la micro de Ev 1 y de Ev 2; cada marca con su rótulo para el lector de pantalla. */
    expect(screen.getAllByRole('img', { name: 'micro' })).toHaveLength(2)
    /* El ① tiene nombre y aparece en la línea de causa y en las dos celdas de la tabla que lo prueban. */
    expect(screen.getAllByRole('img', { name: 'razón 1' }).length).toBe(3)
  })

})
