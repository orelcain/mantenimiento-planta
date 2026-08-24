import { describe, it, expect, vi, afterEach } from 'vitest'
import { cargarCatalogos } from '../catalogosFabricante'

/**
 * Antes esto era un `Promise.all`: que se cayera UN catálogo dejaba la vista
 * en "No se pudo cargar el catálogo" y el técnico no podía buscar NINGUNA
 * máquina, ni las que sí habían llegado. Con la señal de planta eso pasa.
 *
 * El orden importa: el caso de FALLO va primero porque un éxito llena la
 * caché de módulo y los siguientes no vuelven a pedir nada.
 */
const CATALOGO = (maquina: string) => ({
  maquina,
  piezas: [{ codigo: `COD-${maquina}`, descripcion: 'x', fuente: 'f' }],
})

describe('cargarCatalogos · un catálogo caído no puede llevarse los otros', () => {
  // Sin resetModules: reimportar el módulo re-inicializa Firebase y revienta.
  // Se aprovecha que una carga con fallos NO cachea, así que los dos primeros
  // casos pueden correr seguidos; el de éxito va al final porque sí cachea.
  afterEach(() => vi.unstubAllGlobals())

  it('devuelve lo que SÍ llegó y nombra la máquina que falló', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('gea-termoformadora')) throw new Error('sin señal')
      return { ok: true, status: 200, json: async () => CATALOGO(String(url).split('/').pop()!) } as Response
    }))
    let faltaron: string[] = []
    const piezas = await cargarCatalogos((_p, faltan) => { faltaron = faltan })
    expect(piezas.length).toBeGreaterThan(0)          // los otros 5 sirven
    expect(piezas.some((p) => p.codigo.includes('gea'))).toBe(false)
    expect(faltaron.length).toBe(1)                   // y se dice CUÁL falta
  })

  it('un 404 cuenta como caído, no revienta la carga', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('marel-filete')) return { ok: false, status: 404 } as Response
      return { ok: true, status: 200, json: async () => CATALOGO(String(url).split('/').pop()!) } as Response
    }))
    let faltaron: string[] = []
    const piezas = await cargarCatalogos((_p, faltan) => { faltaron = faltan })
    expect(piezas.length).toBeGreaterThan(0)
    expect(faltaron.length).toBe(1)
  })

  it('con todo OK trae las piezas de los seis catálogos', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      ({ ok: true, status: 200, json: async () => CATALOGO(String(url).split('/').pop()!) }) as Response))
    let faltaron: string[] = ['sin tocar']
    const piezas = await cargarCatalogos((_p, faltan) => { faltaron = faltan })
    expect(piezas.length).toBe(6)
    expect(faltaron).toEqual([])
  })
})
