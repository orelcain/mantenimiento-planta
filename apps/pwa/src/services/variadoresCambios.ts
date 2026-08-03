/**
 * variadoresCambios — el registro de un cambio de variador.
 *
 * Para qué: el catálogo era una biblioteca — se consultaba y no quedaba rastro.
 * Esto lo convierte en evidencia: cada cambio deja MTTR y, sobre todo, deja el
 * dato que justifica una compra — cuánto tarda clonar vs. cargar a mano.
 *
 * Decisiones (tomadas con Orel, 2026-08-03):
 *
 *  · CIERRA una incidencia existente, no crea una nueva. En la vida real
 *    alguien ya levantó «la cinta no arranca» antes de que llegara el técnico:
 *    el cambio es la RESOLUCIÓN de esa incidencia. Crear una nueva haría que
 *    los KPIs contaran el mismo evento dos veces.
 *
 *  · La resolución se hace con `resolveIncident` del servicio existente, no
 *    escribiendo Firestore en crudo: así respeta su lógica y sus reglas.
 *
 *  · El tiempo va por RANGOS, no cronómetro. Un dato aproximado que se registra
 *    siempre vale más que uno exacto que nadie anota.
 *
 * Ojo con los dos tiempos, que miden cosas distintas y no hay que confundir:
 *  · `tiempoResolucionMinutos` de la incidencia lo calcula el sistema desde
 *    `confirmedAt` — incluye la espera hasta que alguien llegó.
 *  · `minutosTrabajo` de acá es lo que duró la intervención en sí.
 * Por eso el rango del técnico se guarda ACÁ y no pisa el campo de la
 * incidencia: sobrescribirlo cambiaría el significado de un KPI que ya existe.
 */
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export const CAMBIOS_COLLECTION = 'variadoresCambios'

/** Cómo se dejó configurado el variador de repuesto. */
export type ModoConfiguracion =
  /** Se copió la configuración de otro equipo igual (LCP en Danfoss). Minutos. */
  | 'clonado'
  /** Se cargaron los parámetros a mano. Es el caso que el catálogo abrevia. */
  | 'manual'
  /** Llegó ya configurado (servicio externo, repuesto preparado). */
  | 'ya_venia'

/** Rangos de duración — lo que alguien recuerda de verdad al terminar. */
export const RANGOS_TIEMPO = [
  { id: 'lt15', label: '<15 min', minutos: 10 },
  { id: '15-30', label: '15-30 min', minutos: 22 },
  { id: '30-60', label: '30-60 min', minutos: 45 },
  { id: '1-2h', label: '1-2 h', minutos: 90 },
  { id: 'gt2h', label: '+2 h', minutos: 150 },
] as const

export type RangoTiempoId = typeof RANGOS_TIEMPO[number]['id']

export interface CambioVariador {
  id?: string
  /** Incidencia que este cambio resolvió. */
  incidentId: string
  incidentTitulo: string
  /** Posición del catálogo (POSICIONES). */
  posicionId: string
  posicionEquipo: string
  /** Familia del variador instalado. */
  variadorId: string
  variadorNombre: string
  modo: ModoConfiguracion
  rango: RangoTiempoId
  /** Punto medio del rango — para promediar sin fingir precisión que no hay. */
  minutosTrabajo: number
  comentario?: string
  creadoPor: string
  creadoPorNombre?: string
  createdAt?: Timestamp
}

export const ETIQUETA_MODO: Record<ModoConfiguracion, string> = {
  clonado: 'Clonado de otro equipo',
  manual: 'Cargado a mano',
  ya_venia: 'Ya venía configurado',
}

/** Registra el cambio. La incidencia se resuelve aparte, con el servicio de incidencias. */
export async function registrarCambio(
  cambio: Omit<CambioVariador, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, CAMBIOS_COLLECTION), {
    ...cambio,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export interface ResumenCambios {
  total: number
  /** Mediana, no promedio: un cambio de 4 horas no debe torcer el número. */
  medianaMinutos: number
  clonados: number
  manuales: number
  minutosClonado: number | null
  minutosManual: number | null
}

const mediana = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2)
}

/**
 * Resumen para el pie de la vista. Falla en silencio (null) a propósito: sin
 * permiso o sin señal el catálogo tiene que seguir funcionando igual.
 */
export async function resumenCambios(): Promise<ResumenCambios | null> {
  try {
    const snap = await getDocs(
      query(collection(db, CAMBIOS_COLLECTION), orderBy('createdAt', 'desc'), limit(200)),
    )
    const cs = snap.docs.map((d) => d.data() as CambioVariador)
    if (!cs.length) return { total: 0, medianaMinutos: 0, clonados: 0, manuales: 0, minutosClonado: null, minutosManual: null }
    const clon = cs.filter((c) => c.modo === 'clonado').map((c) => c.minutosTrabajo)
    const man = cs.filter((c) => c.modo === 'manual').map((c) => c.minutosTrabajo)
    return {
      total: cs.length,
      medianaMinutos: mediana(cs.map((c) => c.minutosTrabajo)),
      clonados: clon.length,
      manuales: man.length,
      minutosClonado: clon.length ? mediana(clon) : null,
      minutosManual: man.length ? mediana(man) : null,
    }
  } catch {
    return null
  }
}
