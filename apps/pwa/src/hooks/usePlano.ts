import { useCallback, useEffect, useRef, useState } from 'react'
import { assetPlano } from '@/data/planos'

const CACHE_PLANOS = 'planos-offline-v1'

/** Red primero; si no hay señal, lo guardado con "Disponible sin señal". */
async function fetchConCache(url: string, init?: RequestInit): Promise<Response> {
  try {
    const r = await fetch(url, init)
    if (r.ok) return r
    throw new Error(String(r.status))
  } catch (e) {
    const c = await caches.open(CACHE_PLANOS).then((c) => c.match(url)).catch(() => undefined)
    if (c) return c
    throw e
  }
}

/** Descarga todas las hojas de un plano a la cache local del navegador. */
export async function guardarPlanoOffline(
  slug: string,
  hojas: number[],
  onAvance: (hechas: number, total: number) => void,
): Promise<void> {
  const cache = await caches.open(CACHE_PLANOS)
  const urls = [assetPlano(slug, 'indice.json')]
  hojas.forEach((b) => {
    const nn = String(b).padStart(2, '0')
    urls.push(assetPlano(slug, `hoja-${nn}.svg`), assetPlano(slug, `hoja-${nn}.json`))
  })
  let hechas = 0
  for (const url of urls) {
    const r = await fetch(url)
    if (r.ok) await cache.put(url, r)
    hechas++
    onAvance(hechas, urls.length)
  }
}

/** Caja de un texto del plano: [x, y, ancho, alto] en coordenadas de la hoja. */
export type Caja = [number, number, number, number]

/** Una referencia cruzada: "el circuito sigue en la hoja H, columna C". */
export type PlanoSalto = { b: Caja; t: string; h: number; c: number }
/** Una designación de aparato dibujada en la hoja (K7, Q1, X5...). */
export type PlanoAparato = { b: Caja; t: string }
/** Una aparición de un aparato en el plano: hoja, columna y caja del texto. */
export type PlanoAparicion = { h: number; c: number; b: Caja }
/** Un rótulo del plano en el índice de búsqueda global. */
export type PlanoBusquedaItem = { de: string; es: string; h: number; b: Caja }
/** Referencia a un borne en el esquema; `tb` = caja de su columna en el Klemmenplan. */
export type PlanoBorne = { b: Caja; t: string; h: number; tb: Caja }
/** Punto de bornera con número pelado; `op` = candidatas en el Klemmenplan. */
export type PlanoBorneLibre = { b: Caja; t: string; op: { k: string; h: number; tb: Caja }[] }
/** Un rótulo en otro idioma con su traducción. `dup` = repetición a tapar. */
export type PlanoRotulo = { b: Caja; de: string; es: string; r: number; dup?: number }
/** Una fila de la tabla de un despiece: posición del catálogo + su código. */
export type FilaDespiece = { pos: string; de?: string; en?: string; fr?: string; es?: string; nr?: string; fig?: string }

export type PlanoHojaMeta = {
  blatt: number
  vb: [number, number]
  cols: Record<string, number>
  /** 'circuitos' | 'bornes' en los planos eléctricos; en el despiece es la
   *  etiqueta de capítulo ya armada ("70 · Equipo eléctrico"). */
  seccion: string
  /** Solo despiece: id de la figura del catálogo ("70-8"). */
  fig?: string
  /** Solo despiece: grupo/conjunto al que pertenece la figura, si aplica. */
  conjunto?: string | null
  titulo: string
  tituloEs: string
  n: { x: number; t: number; d: number }
}

export type PlanoIndice = {
  plano: string
  rev: string
  maquina: string
  hojasTotales: number
  faltante: number[]
  hojas: PlanoHojaMeta[]
  /** aparato -> todas sus apariciones, cada una con su caja exacta */
  indice: Record<string, PlanoAparicion[]>
  /** todos los rotulos traducidos del plano, para el buscador */
  busqueda: PlanoBusquedaItem[]
  /** borne -> su columna en el Klemmenplan, para el buscador */
  bornesIdx: Record<string, { h: number; tb: Caja }>
  /** descripcion tecnica natural de cada aparato, generada del propio plano */
  descs?: Record<string, string>
  glosario: Record<string, string>
  /** Solo despiece: código de fabricante -> SAP, para cruzar con /repuestos.
   *  Planos viejos no lo traen (undefined). */
  sapPorCodigo?: Record<string, { s: string; n: string; u: string }>
}

export type PlanoHoja = {
  svg: string
  xrefs: PlanoSalto[]
  tags: PlanoAparato[]
  terms: PlanoRotulo[]
  bornes: PlanoBorne[]
  libres: PlanoBorneLibre[]
  /** Solo despiece: la tabla completa de la figura (con y sin ancla OCR). */
  filas?: FilaDespiece[]
  /** Solo despiece: glosario de abreviaturas de la figura, si trae. */
  leyenda?: Record<string, string>
}

/**
 * Carga el índice de un plano y sus hojas bajo demanda.
 *
 * Las hojas NO se precargan todas: son ~400 KB cada una en disco y el plano
 * completo son 18 MB. Se traen de a una (se sirven a ~41 KB con gzip) y quedan
 * en memoria, más un prefetch silencioso de la hoja siguiente y la anterior
 * para que pasar página no espere.
 */
export function usePlano(slug: string | undefined, inicial?: number) {
  const [indice, setIndice] = useState<PlanoIndice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoja, setHoja] = useState<{ blatt: number; datos: PlanoHoja } | null>(null)
  const [cargando, setCargando] = useState(false)
  const cache = useRef(new Map<number, PlanoHoja>())

  useEffect(() => {
    cache.current.clear()
    setIndice(null)
    setHoja(null)
    setError(null)
    if (!slug) return
    let vivo = true
    // El indice CAMBIA (titulos OCR, capas nuevas) y los planos en Storage se
    // subieron primero con cache de 24 h: revalidar siempre (ETag barato).
    // Las hojas SVG son inmutables y siguen con la cache normal.
    fetchConCache(assetPlano(slug, 'indice.json'), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: PlanoIndice) => {
        if (vivo) setIndice(d)
      })
      .catch(() => {
        if (vivo) setError('No se pudo cargar el índice del plano.')
      })
    return () => {
      vivo = false
    }
  }, [slug])

  const traer = useCallback(
    async (blatt: number): Promise<PlanoHoja | null> => {
      if (!slug) return null
      const yaEsta = cache.current.get(blatt)
      if (yaEsta) return yaEsta
      const nn = String(blatt).padStart(2, '0')
      const [svg, zonas] = await Promise.all([
        fetchConCache(assetPlano(slug, `hoja-${nn}.svg`)).then((r) => r.text()),
        fetchConCache(assetPlano(slug, `hoja-${nn}.json`)).then((r) => r.json()),
      ])
      // Defaults ANTES del spread: un hoja-NN.json viejo en la caché HTTP del
      // navegador (de un deploy anterior, sin `bornes` o `libres`) reventaba
      // el lienzo en `.map`. Con esto, un JSON incompleto degrada a "esa capa
      // no aparece" en vez de a pantalla en blanco.
      const datos: PlanoHoja = { svg, xrefs: [], tags: [], terms: [], bornes: [], libres: [], filas: [], leyenda: {}, ...zonas }
      cache.current.set(blatt, datos)
      return datos
    },
    [slug],
  )

  const abrir = useCallback(
    async (blatt: number) => {
      if (!indice) return
      if (!indice.hojas.some((h) => h.blatt === blatt)) return
      setCargando(true)
      try {
        const datos = await traer(blatt)
        if (datos) setHoja({ blatt, datos })
        setError(null)
      } catch {
        setError(`No se pudo cargar la hoja ${blatt}.`)
      } finally {
        setCargando(false)
      }
      // Prefetch de las vecinas, sin bloquear ni romper si fallan.
      const i = indice.hojas.findIndex((h) => h.blatt === blatt)
      ;[i - 1, i + 1].forEach((j) => {
        const v = indice.hojas[j]
        if (v) traer(v.blatt).catch(() => {})
      })
    },
    [indice, traer],
  )

  // Abrir la hoja inicial apenas llega el índice: la de la URL o la última
  // visitada si es válida; si no, la primera del plano.
  useEffect(() => {
    if (!indice || hoja) return
    const pedida = inicial != null && indice.hojas.some((h) => h.blatt === inicial) ? inicial : undefined
    const destino = pedida ?? indice.hojas[0]?.blatt
    if (destino != null) void abrir(destino)
  }, [indice, hoja, abrir, inicial])

  return { indice, hoja, abrir, cargando, error }
}
