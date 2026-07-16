/**
 * useRepuestosExistentes — ¿este código de fabricante ya está en el maestro?
 *
 * Alimenta el indicador de la pestaña "Códigos fabricante": para cada código de
 * un despiece oficial dice si ya existe un repuesto creado (y con qué SAP), de
 * modo que se vea de un vistazo qué falta sembrar.
 *
 * Costo: el maestro tiene ~7.700 docs, así que NO se carga entero a propósito.
 *  - Si la caché global de repuestos está tibia (lo normal: Áreas es la pestaña
 *    por defecto y ya la cargó) se indexa desde ahí — gratis y exacto.
 *  - Si está fría, se consultan SOLO los códigos visibles con `in` (30 por
 *    query, ≤100 resultados en pantalla → ≤4 queries) en vez de leer el maestro.
 *
 * Match por `codigoFabricante` normalizado (sin separadores, mayúsculas): el
 * maestro guarda 94,7% de los códigos como dígitos puros, pero algunos vienen
 * con espacios ("999 0608" vs "9990608").
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { getGlobalRepuestosCache } from '@/hooks/repuestos/useGlobalSearch'
import { logger } from '@/lib/logger'

export interface RepuestoExistente {
  id: string
  codigoSAP: string
  textoBreve: string
}

/** Clave de match: sin separadores ni acentos, en mayúsculas. */
export const normCodigo = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// Caché de módulo para la vía `in` (código normalizado → existente | null).
const _porCodigo = new Map<string, RepuestoExistente | null>()

/** Indexa la caché global (si está tibia) por codigoFabricante normalizado. */
function indexarDesdeCache(): Map<string, RepuestoExistente> | null {
  const cache = getGlobalRepuestosCache()
  if (!cache) return null
  const idx = new Map<string, RepuestoExistente>()
  for (const r of cache) {
    const k = normCodigo(r.repuesto.codigoFabricante || '')
    if (!k || idx.has(k)) continue
    idx.set(k, {
      id: r.repuesto.id,
      codigoSAP: r.repuesto.codigoSAP || '',
      textoBreve: r.repuesto.textoBreve || '',
    })
  }
  return idx
}

export function useRepuestosExistentes(codigos: string[]): {
  existentes: Map<string, RepuestoExistente | null>
  loading: boolean
} {
  const [existentes, setExistentes] = useState<Map<string, RepuestoExistente | null>>(new Map())
  const [loading, setLoading] = useState(false)
  // Clave estable del set de códigos (evita re-consultar en cada render).
  const key = [...new Set(codigos.map(normCodigo).filter(Boolean))].sort().join(',')

  useEffect(() => {
    const claves = key ? key.split(',') : []
    if (!claves.length) { setExistentes(new Map()); return }
    let alive = true

    // Vía 1 — caché tibia del maestro: indexado local, sin lecturas.
    const idx = indexarDesdeCache()
    if (idx) {
      const out = new Map<string, RepuestoExistente | null>()
      for (const c of claves) out.set(c, idx.get(c) ?? null)
      setExistentes(out)
      return
    }

    // Vía 2 — caché fría: consultar solo los códigos visibles.
    const faltantes = claves.filter((c) => !_porCodigo.has(c))
    if (!faltantes.length) {
      setExistentes(new Map(claves.map((c) => [c, _porCodigo.get(c) ?? null])))
      return
    }
    setLoading(true)
    const chunks: string[][] = []
    for (let i = 0; i < faltantes.length; i += 30) chunks.push(faltantes.slice(i, i + 30))
    Promise.all(
      chunks.map((c) => getDocs(query(collection(db, 'repuestos'), where('codigoFabricante', 'in', c)))),
    )
      .then((snaps) => {
        if (!alive) return
        for (const c of faltantes) _porCodigo.set(c, null) // negativos también se cachean
        for (const snap of snaps) {
          for (const d of snap.docs) {
            const x = d.data()
            const k = normCodigo(x.codigoFabricante || '')
            if (k && !_porCodigo.get(k)) {
              _porCodigo.set(k, { id: d.id, codigoSAP: x.codigoSAP || '', textoBreve: x.textoBreve || '' })
            }
          }
        }
        setExistentes(new Map(claves.map((c) => [c, _porCodigo.get(c) ?? null])))
      })
      .catch((e) => {
        if (alive) logger.warn('No se pudo verificar existencia de repuestos', { error: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => { if (alive) setLoading(false) })

    return () => { alive = false }
  }, [key])

  return { existentes, loading }
}
