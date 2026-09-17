import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { conNombreComunAlFrente, desdeDocumento, desdeIndice, type DatoBodega, type FuenteRepuestos, type RepuestoDelCatalogo } from './repuestosBitacora'

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
/** El índice de todos los materiales con SAP, una vez por sesión (~180 KB). */
let cacheIndice: { promesa: Promise<RepuestoDelCatalogo[]>; en: number } | null = null

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
  todos() {
    if (cacheIndice && Date.now() - cacheIndice.en < VIGENCIA_MS) return cacheIndice.promesa
    const promesa = getDoc(doc(db, 'repuestosIndice', 'sap'))
      .then((snap) => desdeIndice(snap.exists() ? (snap.data().m as Record<string, unknown>) : null))
      .catch((e: unknown) => {
        cacheIndice = null
        throw e
      })
    cacheIndice = { promesa, en: Date.now() }
    return promesa
  },
  async bodegaDe(codigos) {
    const salida = new Map<string, DatoBodega>()
    await Promise.all(
      [...new Set(codigos)].slice(0, 10).map(async (c) => {
        try {
          const snap = await getDoc(doc(db, 'bodega', c))
          if (!snap.exists()) return
          const d = snap.data()
          salida.set(c, {
            ubicacion: String(d.ubicacionBodega ?? '').trim(),
            stock: typeof d.stockActual === 'number' ? d.stockActual : null,
            unidad: String(d.unidad ?? '').trim(),
          })
        } catch {
          /* sin permiso o sin señal: el resultado sale sin bodega */
        }
      }),
    )
    return salida
  },
  async guardarNombreComun(codigo, nombreComun) {
    const ref = doc(db, 'repuestos', codigo)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Ese código ya no está en el maestro.')
    const nuevos = conNombreComunAlFrente(snap.data().nombresComunes as unknown[], nombreComun)
    await updateDoc(ref, { nombresComunes: nuevos })
    // El índice de la sesión también se entera, sin esperar a la función.
    if (cacheIndice) {
      cacheIndice = {
        en: cacheIndice.en,
        promesa: cacheIndice.promesa.then((lista) => lista.map((r) => (r.codigoSAP === codigo ? { ...r, nombreComun: nuevos[0] ?? '' } : r))),
      }
    }
    for (const [k, v] of cacheEquipos) {
      cacheEquipos.set(k, { en: v.en, promesa: v.promesa.then((lista) => lista.map((r) => (r.codigoSAP === codigo ? { ...r, nombreComun: nuevos[0] ?? '' } : r))) })
    }
  },
}
