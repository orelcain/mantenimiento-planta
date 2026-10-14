import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, auth, storage } from '@/services/firebase'
import { processImageForUpload, IMAGE_PRESETS } from '@/utils/images/processImage'
import { generateId } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store/authStore'
import { maquinasDePlano } from '@/data/planos'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { agruparVinculos, idVinculo, vinculoActivo, type VinculosPorAparato } from '@/utils/aprendizaje/vinculoTerreno'

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
 * Si el plano sirve a más de una máquina (888: N2 y N3) la misma designación puede llevar
 * piezas distintas en cada una: un doc por aparato y máquina (`<slug>__<APARATO>__<maquina>`).
 */
export type VinculoTerreno = {
  id: string
  planoSlug: string
  aparato: string
  /** Máquina a la que se refiere la respuesta. Solo en planos con más de una máquina (888). */
  maquina?: MaquinaBaader
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

/**
 * @param maquina máquina elegida (null/undefined = ninguna). `vinculos` queda filtrado a ella;
 * `porAparato` trae todas. En un plano de varias máquinas, `confirmar` exige una.
 */
export function usePlanoVinculos(planoSlug: string | undefined, maquina?: MaquinaBaader | null) {
  const [docs, setDocs] = useState<VinculoTerreno[]>([])
  const [error, setError] = useState<string | null>(null)
  const sesion = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    // Sin sesión la regla no deja leer (isActiveUser): suscribirse solo producía un
    // permission-denied por cada pantalla abierta desde un QR o un enlace compartido.
    if (!planoSlug || !sesion) {
      setDocs([])
      return
    }
    const q = query(collection(db, COL), where('planoSlug', '==', planoSlug))
    const off = onSnapshot(
      q,
      (snap) => {
        const lista: VinculoTerreno[] = []
        snap.forEach((d) => {
          lista.push({ id: d.id, ...d.data() } as VinculoTerreno)
        })
        setDocs(lista)
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
  }, [planoSlug, sesion])

  const porAparato: VinculosPorAparato = useMemo(() => agruparVinculos(planoSlug, docs), [planoSlug, docs])

  // Compatibilidad: el mapa aparato → vínculo de la máquina elegida (visor eléctrico, 860, GEA).
  const vinculos = useMemo(() => {
    const m = new Map<string, VinculoTerreno>()
    porAparato.forEach((entrada, aparato) => {
      const v = vinculoActivo(planoSlug, entrada, maquina)
      if (v) m.set(aparato, v)
    })
    return m
  }, [porAparato, planoSlug, maquina])

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
      const maquinas = maquinasDePlano(planoSlug)
      // Plano de varias máquinas: sin saber en cuál está parado el técnico se guardaría en la equivocada.
      if (maquinas.length > 1 && (!maquina || !maquinas.includes(maquina))) {
        throw new Error('Elige primero la máquina en la que estás.')
      }
      const id = idVinculo(planoSlug, datos.aparato, maquina)
      // Esta app NO activa `ignoreUndefinedProperties`: un `nota: undefined` hace fallar el setDoc
      // antes de llegar a la regla. Así «Sí, es esta» y «No existe» nunca se guardaban.
      const definidos = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined))
      await setDoc(
        doc(db, COL, id),
        {
          plantId: 'chonchi',
          planoSlug,
          ...definidos,
          // Solo cuando el id la lleva: la regla exige que `maquina` y el id coincidan (860 no cambia).
          ...(maquinas.length > 1 && maquina ? { maquina } : {}),
          confirmadoPor: u.uid,
          confirmadoPorNombre: u.displayName ?? u.email ?? '',
          actualizado: serverTimestamp(),
        },
        { merge: true },
      )
    },
    [planoSlug, maquina],
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

  return { vinculos, porAparato, confirmar, subirFoto, resumen, error }
}
