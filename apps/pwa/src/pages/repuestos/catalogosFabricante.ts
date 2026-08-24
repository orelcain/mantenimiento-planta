/**
 * Carga de los catálogos de códigos de fabricante (JSON estáticos en
 * public/data/codigos-fabricante/).
 *
 * Vive fuera del componente por dos razones: exportar funciones desde un
 * archivo de componentes rompe el fast refresh, y así se puede testear sin
 * montar la vista.
 */
import { APP_VERSION } from '@/constants'
import { logger } from '@/lib/logger'

export interface PiezaCatalogo {
  codigo: string
  descripcion: string
  descripcionEn: string
  especificacion: string
  cantidad: string
  posicion: string
  conjunto: string
  pagina: number
  fuente: string
  /** Campos estampados al cargar desde el header del catálogo: */
  maquina?: string
  equipoNodeIds?: string[]
  equipoCodigos?: string[]
  equipoNombre?: string
  /** Id del manual en la colección `manuales` (si el PDF está subido a la app). */
  manualId?: string
  /** Código del distribuidor local (envuelve al código de fabricante) y su empresa. */
  codigoProveedor?: string
  proveedor?: string
  /** Código SAP ya creado para esta pieza (cruzado desde el maestro del proveedor). */
  codigoSap?: string
}

export interface CatalogoFabricante {
  maquina: string
  sap?: string
  equipoNodeIds?: string[]
  equipoCodigos?: string[]
  equipoNombre?: string
  manualPorFuente?: Record<string, string>
  piezas: PiezaCatalogo[]
}

/** Catálogos publicados (public/data/codigos-fabricante/). */
export const CATALOGOS = [
  { id: 'gea', url: '/data/codigos-fabricante/gea-termoformadora.json', maquina: 'TERMOFORMADORA GEA' },
  { id: 'baader-142', url: '/data/codigos-fabricante/baader-142.json', maquina: 'BAADER 142' },
  { id: 'baader-200', url: '/data/codigos-fabricante/baader-200.json', maquina: 'BAADER 200' },
  { id: 'marel-eviscerado', url: '/data/codigos-fabricante/marel-eviscerado.json', maquina: 'MAREL EVISCERADO' },
  { id: 'marel-filete', url: '/data/codigos-fabricante/marel-filete.json', maquina: 'MAREL FILETE' },
  { id: 'enzunchadora-tp6000', url: '/data/codigos-fabricante/enzunchadora-tp6000.json', maquina: 'ENZUNCHADORA TP-6000' },
]

// Cache de módulo: el JSON (~2 MB) se baja una sola vez por sesión.
let _cache: PiezaCatalogo[] | null = null
let _cachePromise: Promise<PiezaCatalogo[]> | null = null

/**
 * Vacía la caché de módulo. SOLO para tests: sin esto el resultado de un test
 * queda cacheado y el siguiente no vuelve a pedir nada, así que la suite pasa
 * o falla según el orden en que se escribieron los casos.
 */
export function _resetCacheCatalogos(): void {
  _cache = null
  _cachePromise = null
}

/**
 * Carga los catálogos TOLERANDO que alguno falle.
 *
 * Antes era un `Promise.all`: con la señal de planta, que se cayera UN
 * catálogo dejaba la pantalla en "No se pudo cargar el catálogo" y el técnico
 * no podía buscar NINGUNA máquina — ni las que sí habían llegado. Ahora cada
 * uno que llega suma, y los que fallan se informan por nombre.
 *
 * `onParcial` recibe lo acumulado a medida que llega: el catálogo chico
 * (MAREL, 2,7 KB) queda buscable sin esperar al GEA (142 KB comprimido).
 */
export async function cargarCatalogos(
  onParcial?: (piezas: PiezaCatalogo[], faltan: string[]) => void,
): Promise<PiezaCatalogo[]> {
  if (_cache) return _cache
  if (!_cachePromise) {
    const acumulado: PiezaCatalogo[] = []
    const fallidos: string[] = []
    _cachePromise = Promise.all(
      CATALOGOS.map(async (c) => {
        try {
          const base = import.meta.env.BASE_URL.replace(/\/$/, '')
          // ?v=<versión> evita que el navegador sirva un JSON viejo cacheado
          // (GitHub Pages manda Cache-Control max-age=600): al subir la
          // versión, la URL cambia y se baja el catálogo fresco tras el deploy.
          const res = await fetch(`${base}${c.url}?v=${APP_VERSION}`)
          if (!res.ok) throw new Error(`catálogo ${c.id}: HTTP ${res.status}`)
          const data = (await res.json()) as CatalogoFabricante
          const manualPorFuente = data.manualPorFuente || {}
          const piezas = (data.piezas || []).map((p) => ({
            ...p,
            maquina: data.maquina,
            equipoNodeIds: data.equipoNodeIds || [],
            equipoCodigos: data.equipoCodigos || [],
            equipoNombre: data.equipoNombre || '',
            manualId: manualPorFuente[p.fuente],
          }))
          acumulado.push(...piezas)
          onParcial?.([...acumulado], [...fallidos])
          return piezas
        } catch (e) {
          // Un catálogo caído no puede llevarse los otros cinco.
          fallidos.push(c.maquina)
          logger.warn('catálogo de fabricante no disponible', {
            id: c.id, error: e instanceof Error ? e.message : String(e),
          })
          onParcial?.([...acumulado], [...fallidos])
          return [] as PiezaCatalogo[]
        }
      }),
    ).then((listas) => {
      // Solo se cachea si llegaron TODOS: si faltó alguno, el próximo intento
      // vuelve a pedirlos en vez de dejar el hueco fijo para toda la sesión.
      const todas = listas.flat()
      if (fallidos.length) _cachePromise = null
      else _cache = todas
      return todas
    })
  }
  return _cachePromise
}

