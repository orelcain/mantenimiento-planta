/**
 * «Ritmo en vivo», el gráfico unido: lo que se protege es que dibuja con datos reales sin romperse (cabecera, leyenda de
 * 4, atajos de zoom, rótulos, «ahora»), que el globo dice la MISMA cifra de «a esta hora» que la franja y que «Ampliar»
 * solo aparece con detalle que abrir. jsdom no mide ni dibuja: el ancho se simula y la geometría fina la prueba
 * `ejeTurno.test.ts` (alturas, escala Y, filas Ev) y el navegador.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GraficoRitmoVivo, type EjeDatos } from '../GraficoRitmoVivo'
import type { MonitorV2Props } from '../MonitorV2'
import { armarTope } from '../reproduccionMinuto'
import type { RelojDeDatos } from '../useRelojDeDatos'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
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
      expect(screen.getByText('Toca un minuto · pellizca para acercar · arrastra para recorrer')).toBeTruthy()
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
    expect(container.innerHTML).not.toContain('fill="var(--v2-mal)"')
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
