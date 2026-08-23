import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, auth, storage } from '@/services/firebase'
import { processImageForUpload, IMAGE_PRESETS } from '@/utils/images/processImage'
import { generateId } from '@/lib/utils'
import { logger } from '@/lib/logger'

const COL = 'planoVinculos'

/**
 * Confirmación EN TERRENO del puente aparato eléctrico → pieza física.
 *
 * El catálogo del fabricante solo PROPONE: dice que B14 es el código 42303077
 * porque así lo rotula la figura 70-8 de la edición 2006. Quien va a la
 * máquina, lee la etiqueta del componente y confirma (o corrige) es el único
 * que puede convertir esa propuesta en certeza — y es lo que hace que la
 * cobertura del puente sea un dato defendible y no una suposición.
 *
 * Un doc por aparato y plano (`<slug>__<APARATO>`): la última palabra de
 * terreno manda; el historial de quién y cuándo queda dentro del doc.
 */
export type VinculoTerreno = {
  id: string
  planoSlug: string
  aparato: string
  /** 'confirmado' = el catálogo tenía razón · 'corregido' = la pieza real es
   *  otra · 'no_aplica' = ese aparato no existe en esta máquina. */
  estado: 'confirmado' | 'corregido' | 'no_aplica'
  /** Código leído en la etiqueta (al corregir, el que de verdad va). */
  codigo?: string
  nota?: string
  foto?: string
  confirmadoPor: string
  confirmadoPorNombre?: string
  actualizado?: Timestamp
}

export function usePlanoVinculos(planoSlug: string | undefined) {
  const [vinculos, setVinculos] = useState<Map<string, VinculoTerreno>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!planoSlug) return
    const q = query(collection(db, COL), where('planoSlug', '==', planoSlug))
    const off = onSnapshot(
      q,
      (snap) => {
        const m = new Map<string, VinculoTerreno>()
        snap.forEach((d) => {
          const v = { id: d.id, ...d.data() } as VinculoTerreno
          m.set(v.aparato, v)
        })
        setVinculos(m)
        setError(null)
      },
      (e) => {
        // Anónimo (QR del tablero) no lee: es lo esperado, no un error que
        // mostrar. Con sesión sí se avisa.
        setError(auth.currentUser ? 'No se pudieron cargar las confirmaciones.' : null)
        logger.warn('planoVinculos', { error: e.message })
      },
    )
    return off
  }, [planoSlug])

  /**
   * Sube la foto de la etiqueta y devuelve su URL. La evidencia visual es lo
   * que vuelve irrefutable un vínculo: "acá está la placa que leí". Se
   * comprime en el teléfono antes de subir — una foto de cámara son ~4 MB y
   * en planta la señal no da para eso.
   */
  const subirFoto = useCallback(
    async (archivo: File): Promise<string> => {
      if (!auth.currentUser || !planoSlug) throw new Error('Hay que iniciar sesión.')
      let aSubir: File = archivo
      try {
        aSubir = (await processImageForUpload(archivo, IMAGE_PRESETS.photo)).file
      } catch {
        // si el navegador no puede procesarla, va la original (5 MB tope de la regla)
      }
      const r = storageRef(storage, `planosElectricos/${planoSlug}/terreno/${generateId()}`)
      await uploadBytes(r, aSubir, { contentType: aSubir.type })
      return getDownloadURL(r)
    },
    [planoSlug],
  )

  const confirmar = useCallback(
    async (datos: {
      aparato: string
      estado: VinculoTerreno['estado']
      codigo?: string
      nota?: string
      foto?: string
    }) => {
      const u = auth.currentUser
      if (!u || !planoSlug) throw new Error('Hay que iniciar sesión para confirmar en terreno.')
      const id = `${planoSlug}__${datos.aparato}`
      await setDoc(
        doc(db, COL, id),
        {
          plantId: 'chonchi',
          planoSlug,
          ...datos,
          confirmadoPor: u.uid,
          confirmadoPorNombre: u.displayName ?? u.email ?? '',
          actualizado: serverTimestamp(),
        },
        { merge: true },
      )
    },
    [planoSlug],
  )

  const resumen = useMemo(() => {
    let confirmados = 0
    let corregidos = 0
    vinculos.forEach((v) => {
      if (v.estado === 'confirmado') confirmados++
      if (v.estado === 'corregido') corregidos++
    })
    return { confirmados, corregidos, total: vinculos.size }
  }, [vinculos])

  return { vinculos, confirmar, subirFoto, resumen, error }
}
