import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { auth, db } from '@/services/firebase'
import { toast } from '@/hooks/useToast'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { AJUSTES_VACIOS, type AjustesTecnicos } from '@/services/bitacora/listaTecnicos'
import { construirOpcionesEquipo, type NodoJerarquia, type OpcionEquipo } from '@/services/bitacora/buscarEquipos'

const COLECCION_CONFIG = 'bitacoraConfig'

/**
 * Ajustes de la lista de técnicos (agregados / ocultos / renombres) sobre la
 * planilla del calendario. Un doc por planta, compartido por todo el equipo.
 */
export function useAjustesTecnicos() {
  const [ajustes, setAjustes] = useState<AjustesTecnicos>(AJUSTES_VACIOS)

  useEffect(() => {
    const off = onSnapshot(
      doc(db, COLECCION_CONFIG, BITACORA_PLANTA.id),
      (snap) => {
        const d = snap.data()
        const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
        const renombres: Record<string, string> = {}
        if (d?.renombres && typeof d.renombres === 'object') {
          for (const [k, v] of Object.entries(d.renombres as Record<string, unknown>)) if (typeof v === 'string') renombres[k] = v
        }
        setAjustes({ agregados: lista(d?.agregados), ocultos: lista(d?.ocultos), renombres })
      },
      () => {
        // Sin permiso o sin red: se usa la planilla del calendario tal cual.
      },
    )
    return off
  }, [])

  const guardarAjustes = useCallback(async (nuevos: AjustesTecnicos) => {
    const u = auth.currentUser
    if (!u) throw new Error('Hay que iniciar sesión para editar la lista de técnicos.')
    setAjustes(nuevos) // se ve al tiro aunque no haya señal
    // setDoc completo (no merge): `renombres` es un mapa y con merge un renombre
    // deshecho nunca se borraría.
    void setDoc(doc(db, COLECCION_CONFIG, BITACORA_PLANTA.id), {
      agregados: nuevos.agregados,
      ocultos: nuevos.ocultos,
      renombres: nuevos.renombres,
      actualizadoPor: u.uid,
      updatedAt: serverTimestamp(),
    }).catch(() => toast({ title: 'La lista de técnicos no se guardó en el servidor', variant: 'destructive' }))
  }, [])

  return { ajustes, guardarAjustes }
}

let cacheOpciones: { opciones: OpcionEquipo[]; en: number } | null = null
const TTL_OPCIONES = 30 * 60_000

/**
 * Equipos y áreas de la jerarquía para el buscador de la bitácora. Se carga UNA
 * vez por sesión (702 nodos ≈ 702 lecturas cada 30 min como mucho) y se filtra
 * en el teléfono, así que buscar mientras se escribe no cuesta lecturas.
 */
export function useOpcionesEquipo(activo: boolean) {
  const [opciones, setOpciones] = useState<OpcionEquipo[]>(cacheOpciones?.opciones ?? [])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!activo) return
    if (cacheOpciones && Date.now() - cacheOpciones.en < TTL_OPCIONES) {
      setOpciones(cacheOpciones.opciones)
      return
    }
    let vivo = true
    setCargando(true)
    getDocs(query(collection(db, 'hierarchy'), where('activo', '==', true)))
      .then((snap) => {
        const nodos: NodoJerarquia[] = snap.docs.map((d) => {
          const x = d.data()
          return {
            id: d.id,
            nombre: String(x.nombre ?? ''),
            alias: typeof x.alias === 'string' ? x.alias : undefined,
            codigo: typeof x.codigo === 'string' ? x.codigo : '',
            tipoNodo: x.tipoNodo === 'area' ? 'area' : 'equipo',
            parentId: x.parentId ?? null,
            path: Array.isArray(x.path) ? x.path : [],
            activo: x.activo !== false,
            oculto: x.oculto === true,
          }
        })
        const lista = construirOpcionesEquipo(nodos)
        cacheOpciones = { opciones: lista, en: Date.now() }
        if (vivo) setOpciones(lista)
      })
      .catch(() => {
        // Sin jerarquía el campo sigue aceptando texto libre.
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [activo])

  return { opciones, cargando }
}
