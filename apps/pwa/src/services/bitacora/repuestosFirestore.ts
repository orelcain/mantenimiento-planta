import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { desdeDocumento, type FuenteRepuestos, type RepuestoDelCatalogo } from './repuestosBitacora'

/**
 * Lecturas del maestro de repuestos para la bitácora. La lista de un equipo se
 * guarda por sesión: la BAADER 142 N2 tiene 1.803 documentos (unos 2 MB) y
 * volver a pedirlos en cada búsqueda los pagaría de nuevo.
 */
const cacheEquipos = new Map<string, { promesa: Promise<RepuestoDelCatalogo[]>; en: number }>()
/**
 * Vigencia de la lista: un repuesto recién vinculado al equipo (desde el Centro
 * Documental o Repuestos) tardaba hasta cerrar la pestaña en aparecer aquí, y
 * el aviso «no tiene repuestos con código SAP» mentía (visto el 17-09-2026).
 */
const VIGENCIA_MS = 5 * 60_000

export const fuenteRepuestosFirestore: FuenteRepuestos = {
  async porCodigo(codigo) {
    // El id del documento ES el código SAP cuando existe.
    const snap = await getDoc(doc(db, 'repuestos', codigo))
    if (snap.exists()) {
      const r = desdeDocumento(snap.id, snap.data())
      if (r) return r
    }
    const q = await getDocs(query(collection(db, 'repuestos'), where('codigoSAP', '==', codigo), limit(1)))
    const d = q.docs[0]
    return d ? desdeDocumento(d.id, d.data()) : null
  },
  delEquipo(equipoId) {
    const guardada = cacheEquipos.get(equipoId)
    let promesa = guardada && Date.now() - guardada.en < VIGENCIA_MS ? guardada.promesa : undefined
    if (!promesa) {
      promesa = getDocs(query(collection(db, 'repuestos'), where('equipos', 'array-contains', equipoId)))
        .then((snap) =>
          snap.docs
            .map((d) => desdeDocumento(d.id, d.data()))
            .filter((r): r is RepuestoDelCatalogo => Boolean(r))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        )
        .catch((e: unknown) => {
          // Un fallo (señal) no queda guardado: la próxima búsqueda reintenta.
          cacheEquipos.delete(equipoId)
          throw e
        })
      cacheEquipos.set(equipoId, { promesa, en: Date.now() })
    }
    return promesa
  },
}
