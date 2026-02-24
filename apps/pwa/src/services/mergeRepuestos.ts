/**
 * mergeRepuestos v2.48.93
 *
 * Función standalone para fusionar repuestos duplicados.
 * Trabaja cross-machine: el "ganador" recibe la cantidad combinada,
 * fotos, vínculos, etc. Los "perdedores" se eliminan.
 *
 * No es un hook — es una función async que trabaja directo con Firestore.
 */

import {
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  addDoc,
  collection,
  writeBatch,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Repuesto } from '@/types/repuestos'

interface MergeTarget {
  repuestoId: string
  machineId: string
}

interface MergeOptions {
  /** El repuesto que se conserva */
  winner: MergeTarget
  /** Los repuestos que se eliminan (sus datos se fusionan al winner) */
  losers: MergeTarget[]
  /** Cantidad final combinada (si la provee el usuario) */
  mergedCantidad?: number
}

/**
 * Fusiona repuestos duplicados:
 * 1. Lee datos de todos los losers
 * 2. Combina arrays (fotos, vínculos, galería) sin duplicar URLs
 * 3. Suma cantidades (o usa mergedCantidad si se provee)
 * 4. Toma el mejor valor unitario (mayor > 0)
 * 5. Combina ubicaciones
 * 6. Actualiza el winner
 * 7. Elimina cada loser (historial incluido)
 * 8. Registra evento 'merge' en historial del winner
 */
export async function mergeRepuestos(options: MergeOptions): Promise<void> {
  const { winner, losers, mergedCantidad } = options

  const winnerPath = `machines/${winner.machineId}/repuestos`
  const winnerRef = doc(db, winnerPath, winner.repuestoId)
  const winnerSnap = await getDoc(winnerRef)

  if (!winnerSnap.exists()) {
    throw new Error('Repuesto ganador no encontrado')
  }

  const winnerData = winnerSnap.data()

  // Collect arrays to merge
  let combinedFotosReales: Array<{ url: string; descripcion?: string }> = [...(winnerData.fotosReales || [])]
  let combinedImagenesManual: Array<{ url: string; descripcion?: string }> = [...(winnerData.imagenesManual || [])]
  let combinedVinculos: Array<Record<string, unknown>> = [...(winnerData.vinculosManual || [])]
  let combinedGallery: Array<Record<string, unknown>> = [...(winnerData.gallery || [])]
  let totalCantidad = winnerData.cantidadPorMaquina || 0
  let bestValor = winnerData.valorUnitario || 0
  const ubicaciones: string[] = []
  if (winnerData.ubicacionEnPlanta) ubicaciones.push(winnerData.ubicacionEnPlanta)

  const mergedFromIds: string[] = []

  // Process each loser
  for (const loser of losers) {
    const loserPath = `machines/${loser.machineId}/repuestos`
    const loserRef = doc(db, loserPath, loser.repuestoId)
    const loserSnap = await getDoc(loserRef)

    if (!loserSnap.exists()) continue

    const loserData = loserSnap.data()
    mergedFromIds.push(`${loser.machineId}/${loser.repuestoId}`)

    // Sum quantities
    totalCantidad += (loserData.cantidadPorMaquina || 0)

    // Best value
    if ((loserData.valorUnitario || 0) > bestValor) {
      bestValor = loserData.valorUnitario
    }

    // Merge arrays (deduplicate by URL)
    const existingFotoUrls = new Set(combinedFotosReales.map(f => f.url))
    for (const foto of (loserData.fotosReales || [])) {
      if (!existingFotoUrls.has(foto.url)) {
        combinedFotosReales.push(foto)
        existingFotoUrls.add(foto.url)
      }
    }

    const existingImgUrls = new Set(combinedImagenesManual.map(f => f.url))
    for (const img of (loserData.imagenesManual || [])) {
      if (!existingImgUrls.has(img.url)) {
        combinedImagenesManual.push(img)
        existingImgUrls.add(img.url)
      }
    }

    // Vinculos — merge by machineId + pagina uniqueness
    for (const v of (loserData.vinculosManual || [])) {
      const isDup = combinedVinculos.some(
        (cv) => cv.machineId === v.machineId && cv.pagina === v.pagina
      )
      if (!isDup) combinedVinculos.push(v)
    }

    // Gallery
    const existingGalleryUrls = new Set(combinedGallery.map((g: Record<string, unknown>) => g.url))
    for (const g of (loserData.gallery || [])) {
      if (!existingGalleryUrls.has(g.url)) {
        combinedGallery.push(g)
        existingGalleryUrls.add(g.url)
      }
    }

    // Ubicaciones
    if (loserData.ubicacionEnPlanta && !ubicaciones.includes(loserData.ubicacionEnPlanta)) {
      ubicaciones.push(loserData.ubicacionEnPlanta)
    }

    // Fill in empty fields from loser
    if (!winnerData.codigoFabricante && loserData.codigoFabricante) {
      winnerData.codigoFabricante = loserData.codigoFabricante
    }
    if (!winnerData.descripcion && loserData.descripcion) {
      winnerData.descripcion = loserData.descripcion
    }
    if (!winnerData.textoBreve && loserData.textoBreve) {
      winnerData.textoBreve = loserData.textoBreve
    }
    if (!winnerData.technicalSpecs && loserData.technicalSpecs) {
      winnerData.technicalSpecs = loserData.technicalSpecs
    }

    // Delete loser: historial first, then doc
    const historialRef = collection(db, `${loserPath}/${loser.repuestoId}/historial`)
    const historialSnap = await getDocs(historialRef)
    if (!historialSnap.empty) {
      const delBatch = writeBatch(db)
      historialSnap.docs.forEach(h => delBatch.delete(h.ref))
      await delBatch.commit()
    }
    await deleteDoc(loserRef)
  }

  // Update winner with merged data
  const finalCantidad = mergedCantidad !== undefined ? mergedCantidad : totalCantidad

  await updateDoc(winnerRef, {
    cantidadPorMaquina: finalCantidad,
    valorUnitario: bestValor,
    fotosReales: combinedFotosReales,
    imagenesManual: combinedImagenesManual,
    vinculosManual: combinedVinculos,
    gallery: combinedGallery,
    ubicacionEnPlanta: ubicaciones.join(' | ') || winnerData.ubicacionEnPlanta || '',
    codigoFabricante: winnerData.codigoFabricante || '',
    descripcion: winnerData.descripcion || '',
    textoBreve: winnerData.textoBreve || '',
    ...(winnerData.technicalSpecs ? { technicalSpecs: winnerData.technicalSpecs } : {}),
    updatedAt: Timestamp.now(),
  })

  // Record merge event in winner's history
  await addDoc(collection(db, `${winnerPath}/${winner.repuestoId}/historial`), {
    campo: 'merge',
    valorAnterior: `${losers.length} duplicado(s) eliminados`,
    valorNuevo: mergedFromIds.join(', '),
    fecha: Timestamp.now(),
  })
}
