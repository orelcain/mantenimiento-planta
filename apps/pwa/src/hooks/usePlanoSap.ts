import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, auth } from '@/services/firebase'

/** Lo que la ficha del aparato muestra de un repuesto vinculado por SAP. */
export type SapInfo = {
  sap: string
  /** null = el SAP no existe en el maestro (typo o material sin catalogar). */
  nombre: string | null
  marca?: string
  modeloTipo?: string
  codigoFabricante?: string
  /** null = sin registro de bodega (no es lo mismo que stock 0). */
  stockActual: number | null
  stockMinimo: number | null
  ubicacionBodega?: string
  unidad?: string
}

/**
 * Cruza los códigos SAP de las notas de un aparato con el maestro `repuestos`
 * (docId = SAP) y el stock de `bodega` (docId = SAP).
 *
 * Cierra el círculo del módulo: veo la falla en el plano → toco el aparato →
 * sé qué repuesto es y cuántos hay en bodega, sin salir del plano.
 *
 * Lecturas puntuales con getDoc (2 por SAP, cacheadas por sesión): las notas
 * de un aparato traen 1-3 SAPs, no vale la pena un listener.
 */
export function usePlanoSap(saps: string[]) {
  const [info, setInfo] = useState<Record<string, SapInfo>>({})
  const cache = useRef(new Map<string, SapInfo>())
  const clave = saps.slice().sort().join(',')

  useEffect(() => {
    // Sin sesión las reglas niegan la lectura del maestro: ni intentarlo.
    if (!clave || !auth.currentUser) return
    let vivo = true
    const pendientes = clave.split(',').filter((s) => s && !cache.current.has(s))
    Promise.all(
      pendientes.map(async (sap) => {
        try {
          const [rep, bod] = await Promise.all([
            getDoc(doc(db, 'repuestos', sap)),
            getDoc(doc(db, 'bodega', sap)),
          ])
          const r = rep.exists() ? rep.data() : null
          const b = bod.exists() ? bod.data() : null
          cache.current.set(sap, {
            sap,
            nombre: (r?.textoBreve || b?.textoBreve || null) as string | null,
            marca: r?.marca,
            modeloTipo: r?.modeloTipo,
            codigoFabricante: r?.codigoFabricante,
            stockActual: typeof b?.stockActual === 'number' ? b.stockActual : null,
            stockMinimo: typeof b?.stockMinimo === 'number' ? b.stockMinimo : null,
            ubicacionBodega: b?.ubicacionBodega,
            unidad: b?.unidad,
          })
        } catch {
          /* permiso o red: la tarjeta simplemente no aparece */
        }
      }),
    ).then(() => {
      if (!vivo) return
      const m: Record<string, SapInfo> = {}
      clave.split(',').forEach((s) => {
        const v = cache.current.get(s)
        if (v) m[s] = v
      })
      setInfo(m)
    })
    return () => {
      vivo = false
    }
  }, [clave])

  return info
}
