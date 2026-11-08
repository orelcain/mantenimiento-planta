import { describe, expect, it } from 'vitest'
import {
  claseHeaderPC,
  claseCapsulaBarra,
  claseAsidePC,
  clasePaddingContenidoPC,
  claseItemPC,
  claseBarraInferior,
  claseTabBarra,
  contarIncidenciasActivas,
} from '../navVidrio'

const LENTE = 'vidrio-lente'

describe('ítem activo del menú de PC', () => {
  it('piel apple: el ítem activo lleva .vidrio-lente', () => {
    expect(claseItemPC(true, true)).toContain(LENTE)
  })

  it('piel anterior: el ítem activo NO lleva .vidrio-lente y conserva su clase de siempre', () => {
    const clases = claseItemPC(false, true)
    expect(clases).not.toContain(LENTE)
    expect(clases).toContain('bg-[var(--sidebar-active)]')
    expect(clases).toContain('text-[var(--sidebar-active-foreground)]')
    expect(clases).toContain('rounded-ctl')
  })

  it('el ítem inactivo nunca lleva la lente, en ninguna piel', () => {
    expect(claseItemPC(true, false)).not.toContain(LENTE)
    expect(claseItemPC(false, false)).not.toContain(LENTE)
  })
})

describe('pestaña activa de la barra inferior', () => {
  it('piel apple: la pestaña activa es la gota .vidrio-lente', () => {
    expect(claseTabBarra(true, true)).toContain(LENTE)
  })

  it('piel anterior: la pestaña activa NO lleva .vidrio-lente y sigue en text-primary', () => {
    expect(claseTabBarra(false, true)).not.toContain(LENTE)
    expect(claseTabBarra(false, true)).toBe('text-primary')
  })
})

describe('material del panel y de la barra', () => {
  it('la barra inferior usa .vidrio en apple y .glass-nav en la piel anterior', () => {
    expect(claseBarraInferior(true)).toContain(' vidrio')
    expect(claseBarraInferior(true)).not.toContain('glass-nav')
    expect(claseBarraInferior(false)).toContain('glass-nav')
    expect(claseBarraInferior(false)).not.toContain('vidrio')
  })

  it('el panel de PC es flotante (fixed, 16 px) con .vidrio solo en apple', () => {
    const apple = claseAsidePC(true, false)
    expect(apple).toContain('fixed left-4 top-4 bottom-4')
    expect(apple).toContain('rounded-[30px]')
    expect(apple).toContain('vidrio')
    const anterior = claseAsidePC(false, false)
    expect(anterior).toContain('sticky top-0')
    expect(anterior).not.toContain('vidrio')
  })

  it('oculto (colapsado) no muestra el panel en apple', () => {
    expect(claseAsidePC(true, true)).toBe('hidden')
    expect(claseAsidePC(false, true)).toContain('w-0')
  })

  it('el contenido deja la franja del panel (lg:pl-72) solo en apple y con panel visible', () => {
    expect(clasePaddingContenidoPC(true, false)).toBe('lg:pl-72')
    expect(clasePaddingContenidoPC(true, true)).toBe('')
    expect(clasePaddingContenidoPC(false, false)).toBe('')
  })
})

describe('contarIncidenciasActivas', () => {
  it('cuenta pendiente, confirmada y en_proceso (criterio del Inicio)', () => {
    const lista = [
      { status: 'pendiente' as const },
      { status: 'confirmada' as const },
      { status: 'en_proceso' as const },
      { status: 'resuelta' as const },
      { status: 'cerrada' as const },
      { status: 'rechazada' as const },
    ]
    expect(contarIncidenciasActivas(lista)).toBe(3)
  })

  it('lista vacía da 0', () => {
    expect(contarIncidenciasActivas([])).toBe(0)
  })
})

describe('cápsulas agrupadas de la barra superior', () => {
  it('conserva exactamente la cabecera anterior sin Apple', () => {
    expect(claseHeaderPC(false)).toBe('hidden lg:flex sticky top-0 z-30 items-center h-14 px-4 bg-background/80 backdrop-blur border-b')
    expect(claseBarraInferior(false)).toBe('lg:hidden fixed inset-x-3 z-40 rounded-full glass-nav')
  })

  it('mantiene h-14 y deja pasar los eventos entre cápsulas en Apple', () => {
    expect(claseHeaderPC(true)).toBe('hidden lg:flex sticky top-0 z-30 items-start h-14 px-4 pt-2 vidrio-borde-superior pointer-events-none')
  })

  it('posiciona el brillo de cada cápsula y permite sus interacciones', () => {
    expect(claseCapsulaBarra()).toBe('relative vidrio vidrio-barra pointer-events-auto flex items-center h-[42px] rounded-full')
    expect(claseBarraInferior(true)).toBe('lg:hidden fixed inset-x-3 z-40 rounded-full vidrio vidrio-barra')
    expect(claseAsidePC(true, false)).not.toContain('vidrio-barra')
  })
})
