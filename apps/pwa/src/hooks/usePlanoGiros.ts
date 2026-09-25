import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, auth } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { limpiarGiros, siguienteGiro, type Giro } from '@/utils/giroPlano'

const COL = 'planoGiros'

/**
 * Giro de cada hoja de un plano, COMPARTIDO por toda la planta.
 *
 * Hay láminas escaneadas acostadas dentro de una página vertical: la primera
 * persona que la gira la deja derecha para todos. Un solo doc por plano
 * (`planoGiros/<slug>` con el mapa hoja → grados): abrir el plano cuesta una
 * lectura y girar una escritura, que pasa pocas veces.
 *
 * La copia local sigue existiendo: es lo que ve el visor anónimo (QR del
 * tablero, que no lee Firestore) y lo que se muestra sin señal. Lo compartido
 * manda cuando llega.
 */
export function usePlanoGiros(slug: string) {
  const claveLocal = `plano-giro:${slug}`
  const [local, setLocal] = useState<Record<string, Giro>>(() => {
    try { return limpiarGiros(JSON.parse(localStorage.getItem(claveLocal) ?? '{}')) } catch { return {} }
  })
  const [compartidos, setCompartidos] = useState<Record<string, Giro>>({})

  useEffect(() => {
    if (!slug) return
    const off = onSnapshot(
      doc(db, COL, slug),
      (snap) => setCompartidos(limpiarGiros(snap.data()?.giros)),
      // Anónimo no lee: es lo esperado, se queda con la copia local.
      (e) => { if (auth.currentUser && !auth.currentUser.isAnonymous) logger.warn('planoGiros', { error: e.message }) },
    )
    return off
  }, [slug])

  const giros = useMemo(() => ({ ...local, ...compartidos }), [local, compartidos])

  const girar = useCallback((blatt: number) => {
    const k = String(blatt)
    const n = siguienteGiro(giros[k])
    setLocal((g) => {
      const v = { ...g, [k]: n }
      try { localStorage.setItem(claveLocal, JSON.stringify(v)) } catch { /* sin storage: solo esta sesión */ }
      return v
    })
    // Optimista: se ve girada al tiro, sin esperar la vuelta de Firestore.
    setCompartidos((g) => ({ ...g, [k]: n }))
    const u = auth.currentUser
    if (!u || u.isAnonymous) return
    // merge: solo toca la hoja girada; lo que otros giraron se conserva.
    setDoc(doc(db, COL, slug), {
      planoSlug: slug,
      giros: { [k]: n },
      actualizadoPor: u.uid,
      actualizado: serverTimestamp(),
    }, { merge: true })
      .catch((e: Error) => logger.warn('planoGiros: no se guardó el giro', { error: e.message }))
  }, [giros, slug, claveLocal])

  return { giros, girar }
}
