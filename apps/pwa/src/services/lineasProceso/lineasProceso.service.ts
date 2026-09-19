import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { HierarchyNodeWithChildren } from '@/types/hierarchy'
import type { GrafoLineas } from './modeloLineas'

/**
 * Las líneas de proceso de una planta: UN documento `lineasProceso/{plantId}`.
 * Lectura para cualquier sesión real (el historial lo usará para pesar las
 * paradas); escritura solo admin (firestore.rules).
 */
export const COLECCION_LINEAS = 'lineasProceso'

export interface GrafoGuardado extends GrafoLineas {
  actualizadoPor?: string
  actualizadoEn?: Timestamp
}

export async function leerLineas(plantId: string): Promise<GrafoGuardado | null> {
  const snap = await getDoc(doc(db, COLECCION_LINEAS, plantId))
  if (!snap.exists()) return null
  const d = snap.data() as Omit<Partial<GrafoGuardado>, 'aristas'> & { aristas?: { a: string; b: string }[] }
  if (!Array.isArray(d.lineas) || !Array.isArray(d.nodos)) return null
  return {
    version: 1,
    lineas: d.lineas,
    nodos: d.nodos,
    // Firestore no guarda arreglos de arreglos: las flechas van como {a, b}.
    aristas: (d.aristas ?? []).map((x) => [x.a, x.b] as [string, string]),
    actualizadoPor: d.actualizadoPor,
    actualizadoEn: d.actualizadoEn,
  }
}

export async function guardarLineas(plantId: string, g: GrafoLineas, quien: string): Promise<void> {
  await setDoc(doc(db, COLECCION_LINEAS, plantId), {
    version: 1,
    lineas: g.lineas,
    nodos: g.nodos.map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) })),
    aristas: g.aristas.map(([a, b]) => ({ a, b })),
    actualizadoPor: quien,
    actualizadoEn: serverTimestamp(),
  })
}

export interface EquipoDeSeccion {
  id: string
  nombre: string
  codigo: string
  /** Es un conjunto (área de nivel 5, p. ej. «Cintas HG»): se trata como una máquina. */
  conjunto: boolean
  /** Cuántos componentes cuelgan de él en el árbol (pesan lo mismo que él). */
  componentes: number
}

export interface Seccion {
  nombre: string
  equipos: EquipoDeSeccion[]
}

const contar = (n: HierarchyNodeWithChildren): number => n.children.reduce((t, h) => t + 1 + contar(h), 0)
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
const esArea = (n: HierarchyNodeWithChildren) => n.tipoNodo === 'area'

function buscar(nodos: readonly HierarchyNodeWithChildren[], id: string): HierarchyNodeWithChildren | undefined {
  for (const n of nodos) {
    if (n.id === id) return n
    const h = buscar(n.children, id)
    if (h) return h
  }
  return undefined
}

const aEquipo = (n: HierarchyNodeWithChildren): EquipoDeSeccion => ({
  id: n.id,
  nombre: n.nombre.trim(),
  codigo: n.codigo ?? '',
  conjunto: esArea(n),
  componentes: contar(n),
})

/**
 * Los equipos que pueden formar líneas, por sección del árbol: Acopio (sus equipos
 * y sus áreas) y cada sección de Proceso (sus equipos directos y sus conjuntos).
 * Solo el primer nivel: los componentes siguen a su equipo.
 */
export function seccionesDeProceso(arbol: readonly HierarchyNodeWithChildren[], raices: { acopio: string; proceso: string }): Seccion[] {
  const out: Seccion[] = []
  const acopio = buscar(arbol, raices.acopio)
  if (acopio) {
    const sueltos = acopio.children.filter((n) => !esArea(n))
    if (sueltos.length) out.push({ nombre: 'Acopio', equipos: sueltos.map(aEquipo) })
    for (const a of acopio.children.filter(esArea)) {
      if (a.children.length) out.push({ nombre: `Acopio · ${titulo(a.nombre)}`, equipos: a.children.map(aEquipo) })
    }
  }
  const proceso = buscar(arbol, raices.proceso)
  if (proceso) {
    for (const s of proceso.children) {
      if (!esArea(s)) {
        out.push({ nombre: 'Proceso', equipos: [aEquipo(s)] })
        continue
      }
      if (s.children.length) out.push({ nombre: titulo(s.nombre), equipos: s.children.map(aEquipo) })
    }
  }
  return out
}

/** Raíces del árbol de Chonchi (ids de `hierarchy`). */
export const RAICES_CHONCHI = { acopio: 'aq-in-cho-acop', proceso: 'aq-in-cho-pcho-proc' }
