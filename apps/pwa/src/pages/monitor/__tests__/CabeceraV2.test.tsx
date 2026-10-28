/**
 * La cabecera del monitor v2 (shell de las tres pestañas): en PC el selector de línea vive en la barra (reemplaza al texto del
 * área) con la marca «Shoplogix HH:MM» una sola vez; en el celular el estado y esa marca son el subtítulo de la barra,
 * el título grande queda solo para lectores de pantalla y la navegación de turnos es UN renglón `‹ fecha ›` con flechas
 * de 44 × 44. jsdom no aplica las clases de Tailwind (no se ve qué parte queda oculta por ancho): se prueba qué se
 * renderiza, con qué nombre accesible y con qué clases; la geometría fina la mide el navegador.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CabeceraV2, type NavTurnosMovil } from '../MonitorV2'
import { SelectorLinea } from '../SelectorLinea'

afterEach(cleanup)

const lineas = { actual: 'Eviscerado', hermanas: [{ nombre: 'Filete', token: 'tk-filete' }], onIr: () => {} }
const nav = (extra: Partial<NavTurnosMovil> = {}): NavTurnosMovil => ({
  atras: 0, puedeAnterior: true, onAnterior: () => {}, onSiguiente: () => {}, onActual: () => {}, ...extra,
})

const cabecera = (extra: Partial<Parameters<typeof CabeceraV2>[0]> = {}) =>
  render(
    <CabeceraV2
      titulo="P. Principal"
      area="P. Principal · Eviscerado"
      estado={<span>Produciendo</span>}
      tema={<button aria-label="tema" />}
      cambioLinea={<div data-testid="cambio-linea-movil">selector móvil</div>}
      navTurnos={<div data-testid="nav-pc">Anterior · Siguiente</div>}
      sub="Turno 1 · martes, 27 de octubre · 21:30 → 04:50"
      subCorto="Turno 1 · mar 27 oct · 21:30 → 04:50"
      pestana="turno"
      onPestana={() => {}}
      {...extra}
    />,
  )

const barraPc = (c: HTMLElement) => c.querySelector('.v2-barra-pc') as HTMLElement
const barraMovil = (c: HTMLElement) => c.querySelector('.v2-cabecera:not(.v2-barra-pc)') as HTMLElement

describe('CabeceraV2 · barra de PC', () => {
  it('el selector de línea va DENTRO de la barra, entre el título y la navegación, y reemplaza al texto del área', () => {
    const { container } = cabecera({ selectorPc: <SelectorLinea lineas={lineas} className="v2-selector-barra" /> })
    const barra = barraPc(container)
    const selector = barra.querySelector('.v2-selector-barra')
    expect(selector).not.toBeNull()
    expect(selector?.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Línea del monitor')
    /* Orden de tabulación = orden visual: título → selector → navegación de turnos. */
    const hijos = Array.from(barra.children)
    expect(hijos.indexOf(selector as Element)).toBeGreaterThan(0)
    expect(hijos.indexOf(selector as Element)).toBeLessThan(hijos.indexOf(barra.querySelector('[data-testid="nav-pc"]') as Element))
    /* El área «Eviscerado» como texto sale: la pastilla elegida ya lo dice. */
    expect(barra.textContent).not.toContain('P. Principal · Eviscerado')
    expect(Array.from(barra.querySelectorAll('span')).some((s) => s.textContent === 'Eviscerado')).toBe(true) // el segmento del selector
  })

  it('sin selector (el Duelo trae el suyo, o no hay línea hermana) el área sigue como texto', () => {
    const { container } = cabecera({ selectorPc: null, area: 'Eviscerado' })
    expect(barraPc(container).querySelector('.v2-selector-barra')).toBeNull()
    expect(barraPc(container).textContent).toContain('Eviscerado')
  })

  it('la marca «Shoplogix HH:MM» va UNA vez después del horario del turno, y sin turno en vivo no hay marca', () => {
    const { container } = cabecera({ marca: 'Shoplogix 02:35' })
    const sub = barraPc(container).querySelector('p') as HTMLElement
    /* El espacio antes de «· Shoplogix» es duro (nbsp): la marca no se parte de su punto. */
    expect(sub.textContent?.replace(/\u00a0/g, ' ')).toBe('Turno 1 · martes, 27 de octubre · 21:30 → 04:50 · Shoplogix 02:35')
    cleanup()
    const cerrado = cabecera({ marca: null })
    expect(barraPc(cerrado.container).querySelector('p')?.textContent).toBe('Turno 1 · martes, 27 de octubre · 21:30 → 04:50')
    expect(cerrado.container.textContent).not.toContain('Shoplogix')
  })

  it('la barra arranca donde el contenido: 24 px (32 desde 1600) en El turno; Análisis y Duelo conservan su gutter', () => {
    const turno = barraPc(cabecera({ pestana: 'turno' }).container)
    expect(turno.className).toContain('px-[24px]')
    expect(turno.className).toContain('min-[1600px]:px-[32px]')
    cleanup()
    for (const pestana of ['analisis', 'duelo'] as const) {
      const otra = barraPc(cabecera({ pestana }).container)
      expect(otra.className).toContain('px-6')
      expect(otra.className).not.toContain('px-[24px]')
      cleanup()
    }
  })
})

describe('CabeceraV2 · celular', () => {
  it('el estado y la marca son el subtítulo de la barra; el título grande queda solo para lectores de pantalla (sr-only hasta 768 px)', () => {
    const { container } = cabecera({ marca: 'Shoplogix 02:35' })
    const movil = barraMovil(container)
    const sub = movil.querySelector('.v2-estado-mini')?.parentElement as HTMLElement
    expect(sub.textContent).toBe('Produciendo· Shoplogix 02:35')
    expect(sub.className).toContain('md:hidden')
    /* Ya no hay un renglón propio de estado bajo la barra: el único estado fuera de la barra es el de PC/tableta. */
    const h1 = Array.from(container.querySelectorAll('h1')).find((h) => h.textContent === 'El turno') as HTMLElement
    expect(h1.className).toContain('sr-only')
    expect(h1.className).toContain('md:not-sr-only')
  })

  it('la barra va pegada (sticky) y mide 48 px con 8 de aire arriba', () => {
    const { container } = cabecera()
    const movil = barraMovil(container)
    expect(movil.className).toContain('sticky')
    expect(movil.className).toContain('pt-[8px]')
    expect((movil.querySelector('.v2-barra') as HTMLElement).className).toContain('h-[48px]')
  })

  it('‹ fecha › en UN renglón: flechas solo ícono con su nombre accesible y la fecha en corto', () => {
    const onAnterior = vi.fn()
    const onSiguiente = vi.fn()
    const { container, getByRole } = cabecera({ navMovil: nav({ atras: 2, onAnterior, onSiguiente }) })
    const fila = container.querySelector('[role="group"][aria-label="Turno que se mira"]') as HTMLElement
    expect(fila.textContent).toContain('Turno 1 · mar 27 oct · 21:30 → 04:50')
    expect(fila.textContent).not.toContain('martes')
    const ant = getByRole('button', { name: 'Turno anterior' })
    const sig = getByRole('button', { name: 'Turno siguiente' })
    /* Sin texto: solo el ícono (aria-hidden); 44 × 44 literales. */
    expect(ant.textContent).toBe('')
    expect(sig.textContent).toBe('')
    expect(ant.className).toContain('h-[44px]')
    expect(ant.className).toContain('w-[44px]')
    fireEvent.click(ant)
    fireEvent.click(sig)
    expect(onAnterior).toHaveBeenCalledTimes(1)
    expect(onSiguiente).toHaveBeenCalledTimes(1)
  })

  it('en el turno actual no hay chip ni «turno actual»: «siguiente» está apagado; sin turno previo, «anterior» también', () => {
    const { container, getByRole, queryByRole } = cabecera({ navMovil: nav({ atras: 0, puedeAnterior: false }) })
    expect(queryByRole('button', { name: 'Ir al actual' })).toBeNull()
    expect(container.textContent).not.toContain('Turno actual')
    expect((getByRole('button', { name: 'Turno siguiente' }) as HTMLButtonElement).disabled).toBe(true)
    expect((getByRole('button', { name: 'Turno anterior' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('mirando un turno viejo dice cuántos atrás y ofrece «Ir al actual» (solo si no es el actual)', () => {
    const onActual = vi.fn()
    const dos = cabecera({ navMovil: nav({ atras: 2, onActual }) })
    expect(dos.container.textContent).toContain('hace 2 turnos')
    fireEvent.click(dos.getByRole('button', { name: 'Ir al actual' }))
    expect(onActual).toHaveBeenCalledTimes(1)
    cleanup()
    const uno = cabecera({ navMovil: nav({ atras: 1 }) })
    expect(uno.container.textContent).toContain('hace 1 turno')
    expect(uno.container.textContent).not.toContain('hace 1 turnos')
    expect(uno.queryByRole('button', { name: 'Ir al actual' })).not.toBeNull()
  })

  it('sin historial no hay flechas: solo la fecha', () => {
    const { container, queryByRole } = cabecera({ navMovil: null })
    expect(queryByRole('button', { name: 'Turno anterior' })).toBeNull()
    expect(queryByRole('button', { name: 'Turno siguiente' })).toBeNull()
    expect(container.querySelector('[role="group"][aria-label="Turno que se mira"]')?.textContent).toBe('Turno 1 · mar 27 oct · 21:30 → 04:50')
  })

  it('las tres pestañas se arman igual en las tres vistas y marcan la activa', () => {
    for (const pestana of ['turno', 'analisis', 'duelo'] as const) {
      const { container } = cabecera({ pestana })
      const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
      expect(tabs.map((t) => t.textContent)).toEqual(['El turno', 'Análisis', 'Duelo'])
      expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent)).toEqual([pestana === 'turno' ? 'El turno' : pestana === 'analisis' ? 'Análisis' : 'Duelo'])
      cleanup()
    }
  })

  it('el cambio de línea del celular se muestra arriba de la fecha (la fila del selector ya no es una fila de la página)', () => {
    const { container, getByTestId } = cabecera()
    const bloque = container.querySelector('.lg\\:hidden:not(.v2-cabecera)') as HTMLElement
    expect(bloque.contains(getByTestId('cambio-linea-movil'))).toBe(true)
  })
})
