import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { auth, db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { idAncla, type AnclaDespiece } from '@/utils/planos/anclasDespiece'

/**
 * Anclas del despiece corregidas a mano (colección `anclasDespiece`, ver utils/planos/anclasDespiece).
 * Se leen una vez por plano; sin sesión (visor anónimo por QR) no hay anclas y el plano se ve como
 * viene de Storage. Guardar exige admin o supervisor (regla de Firestore).
 */
export function useAnclasDespiece(slug: string | undefined, activo: boolean) {
  const [anclas, setAnclas] = useState<AnclaDespiece[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug || !activo || !auth.currentUser) return
    let vivo = true
    getDocs(query(collection(db, 'anclasDespiece'), where('slug', '==', slug)))
      .then((snap) => {
        if (!vivo) return
        setAnclas(snap.docs.map((d) => {
          const x = d.data()
          return { hoja: x.hoja, pos: x.pos, codigo: x.codigo ?? null, b: x.b ?? null, estado: x.estado, en: x.en ?? 0 }
        }))
      })
      .catch((e) => logger.warn('anclasDespiece: leer', { error: e instanceof Error ? e.message : String(e) }))
    return () => { vivo = false }
  }, [slug, activo])

  const guardar = useCallback(async (a: AnclaDespiece) => {
    if (!slug) return false
    const en = Date.now()
    try {
      await setDoc(doc(db, 'anclasDespiece', idAncla(slug, a.hoja, a.pos)), {
        slug, hoja: a.hoja, pos: a.pos, codigo: a.codigo ?? null, b: a.b, estado: a.estado, en,
        por: auth.currentUser?.uid ?? null, actualizado: serverTimestamp(),
      })
      setAnclas((prev) => [...prev.filter((x) => !(x.hoja === a.hoja && x.pos === a.pos)), { ...a, en }])
      setError(null)
      return true
    } catch (e) {
      logger.warn('anclasDespiece: guardar', { error: e instanceof Error ? e.message : String(e) })
      setError('No se pudo guardar la ubicación (¿rol admin o supervisor?).')
      return false
    }
  }, [slug])

  return { anclas, guardar, error }
}
