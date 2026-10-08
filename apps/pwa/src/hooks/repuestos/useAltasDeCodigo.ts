/**
 * useAltasDeCodigo — las altas de código en vivo (`solicitudes_repuestos` con `tipo == 'alta_codigo'`).
 *
 * UN SOLO listener compartido: la ficha A3C monta una sección por elemento y la ronda «Por confirmar»
 * muestra decenas; sin esto cada una abriría su propio `onSnapshot`. El primero que se suscribe lo abre y
 * el último que se va lo cierra. Solo con sesión (las reglas piden usuario no anónimo para leer).
 *
 * Costo: la consulta es por un solo campo (índice automático) y hay a lo más una alta por código de
 * fabricante (~16 en el plano 888), así que son decenas de lecturas por apertura, no miles.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store/authStore'
import { normCodigo } from '@/utils/repuestos/normCodigo'
import { docASolicitud, esAlta, type AltaCodigo } from './useSolicitudes'

interface Estado {
  altas: AltaCodigo[]
  cargando: boolean
}

const VACIO: Estado = { altas: [], cargando: true }
let estado: Estado = VACIO
const oyentes = new Set<() => void>()
let cerrar: (() => void) | null = null

function publicar(nuevo: Estado) {
  estado = nuevo
  oyentes.forEach((f) => f())
}

function abrir() {
  cerrar = onSnapshot(
    query(collection(db, 'solicitudes_repuestos'), where('tipo', '==', 'alta_codigo')),
    (snap) => {
      const altas = snap.docs
        .map((d) => docASolicitud(d.id, d.data()))
        .filter(esAlta)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      publicar({ altas, cargando: false })
    },
    (err) => {
      if (err?.code !== 'permission-denied') {
        logger.error('Error cargando altas de código', err instanceof Error ? err : new Error(String(err)))
      }
      publicar({ altas: [], cargando: false })
    },
  )
}

function suscribir(f: () => void) {
  oyentes.add(f)
  if (oyentes.size === 1) abrir()
  return () => {
    oyentes.delete(f)
    if (oyentes.size === 0) {
      cerrar?.()
      cerrar = null
      estado = VACIO
    }
  }
}

const sinSuscripcion = () => () => {}
const instantanea = () => estado

export function useAltasDeCodigo(): { altas: AltaCodigo[]; porCodigo: Map<string, AltaCodigo>; loading: boolean } {
  const sesion = useAuthStore((s) => s.isAuthenticated)
  const subs = useCallback((f: () => void) => (sesion ? suscribir(f) : sinSuscripcion()), [sesion])
  const e = useSyncExternalStore(subs, instantanea, () => VACIO)
  return useMemo(() => {
    if (!sesion) return { altas: [], porCodigo: new Map(), loading: false }
    return {
      altas: e.altas,
      porCodigo: new Map(e.altas.map((a) => [normCodigo(a.codigoFabricante), a])),
      loading: e.cargando,
    }
  }, [e, sesion])
}

/** El alta de un código de fabricante, si existe (cualquier estado). */
export function useAltaDeCodigo(codigoFabricante: string | undefined): { alta: AltaCodigo | undefined; loading: boolean } {
  const { porCodigo, loading } = useAltasDeCodigo()
  return { alta: codigoFabricante ? porCodigo.get(normCodigo(codigoFabricante)) : undefined, loading }
}
