import { useCallback, useEffect, useRef, useState } from 'react'
import { assetPlano } from '@/data/planos'

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

export type PlanoHojaMeta = {
  blatt: number
  vb: [number, number]
  cols: Record<string, number>
  seccion: 'circuitos' | 'bornes'
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
  glosario: Record<string, string>
}

export type PlanoHoja = { svg: string; xrefs: PlanoSalto[]; tags: PlanoAparato[]; terms: PlanoRotulo[]; bornes: PlanoBorne[]; libres: PlanoBorneLibre[] }

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
    fetch(assetPlano(slug, 'indice.json'))
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
        fetch(assetPlano(slug, `hoja-${nn}.svg`)).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
        fetch(assetPlano(slug, `hoja-${nn}.json`)).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ])
      const datos: PlanoHoja = { svg, ...zonas }
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
