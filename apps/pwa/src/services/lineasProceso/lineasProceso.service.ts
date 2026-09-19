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
  /** Sus componentes directos (para «Desplegar componentes»). */
  hijos: { id: string; nombre: string }[]
  /** Si abastece a otra planta del sitio (p. ej. «Yal»): no cuenta en esta. */
  otraPlanta?: string
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

const aEquipo = (n: HierarchyNodeWithChildren, otraPlanta?: Record<string, string>): EquipoDeSeccion => ({
  id: n.id,
  nombre: n.nombre.trim(),
  codigo: n.codigo ?? '',
  conjunto: esArea(n),
  componentes: contar(n),
  hijos: n.children.map((h) => ({ id: h.id, nombre: h.nombre.trim() })),
  otraPlanta: otraPlanta?.[n.nombre.trim()],
})

/**
 * Los equipos que pueden formar líneas, por sección del árbol: Acopio (sus equipos
 * y sus áreas) y cada sección de Proceso (sus equipos directos y sus conjuntos).
 * Solo el primer nivel: los componentes siguen a su equipo.
 */
export function seccionesDeProceso(
  arbol: readonly HierarchyNodeWithChildren[],
  raices: { acopio: string; proceso: string; servicios?: readonly string[] },
  otraPlanta?: Record<string, string>,
): Seccion[] {
  const out: Seccion[] = []
  const eq = (n: HierarchyNodeWithChildren) => aEquipo(n, otraPlanta)
  const acopio = buscar(arbol, raices.acopio)
  if (acopio) {
    const sueltos = acopio.children.filter((n) => !esArea(n))
    if (sueltos.length) out.push({ nombre: 'Acopio', equipos: sueltos.map(eq) })
    for (const a of acopio.children.filter(esArea)) {
      if (a.children.length) out.push({ nombre: `Acopio · ${titulo(a.nombre)}`, equipos: a.children.map(eq) })
    }
  }
  const proceso = buscar(arbol, raices.proceso)
  if (proceso) {
    for (const s of proceso.children) {
      if (!esArea(s)) {
        out.push({ nombre: 'Proceso', equipos: [aEquipo(s)] })
        continue
      }
      if (s.children.length) out.push({ nombre: titulo(s.nombre), equipos: s.children.map(eq) })
    }
  }
  // Servicios de apoyo: no detienen la línea directo, pero influyen (Orel, 19-09-2026).
  for (const id of raices.servicios ?? []) {
    const a = buscar(arbol, id)
    if (a?.children.length) out.push({ nombre: `Servicios · ${titulo(a.nombre)}`, equipos: a.children.map(eq) })
  }
  return out
}

/** Nombre, código y padre de TODO equipo bajo las secciones (también los componentes): para dibujarlos. */
export function indiceEquipos(arbol: readonly HierarchyNodeWithChildren[], secciones: readonly Seccion[]): Map<string, { nombre: string; codigo: string; padre?: string; hijos: { id: string; nombre: string }[] }> {
  const out = new Map<string, { nombre: string; codigo: string; padre?: string; hijos: { id: string; nombre: string }[] }>()
  const recorrer = (n: HierarchyNodeWithChildren, padre?: string) => {
    out.set(n.id, { nombre: n.nombre.trim(), codigo: n.codigo ?? '', padre, hijos: n.children.map((h) => ({ id: h.id, nombre: h.nombre.trim() })) })
    for (const h of n.children) recorrer(h, n.nombre.trim())
  }
  for (const s of secciones) for (const e of s.equipos) {
    const n = buscar(arbol, e.id)
    if (n) recorrer(n)
  }
  return out
}

/** Raíces del árbol de Chonchi (ids de `hierarchy`). */
export const RAICES_CHONCHI = {
  acopio: 'aq-in-cho-acop',
  proceso: 'aq-in-cho-pcho-proc',
  // Agua, RILES, frío, vapor y energía: influyen en el proceso sin estar en la línea.
  servicios: [
    'aq-in-cho-exte-alag', // Almacenamiento aguas
    'aq-in-cho-exte-estr', // Estanque de transferencia AM
    'aq-in-cho-exte-pozo', // Pozos profundos
    'aq-in-cho-exte-pril', // Planta RILES
    'aq-in-cho-pcho-exte-smaq', // Sala de máquinas
    'aq-in-cho-pcho-exte-scal', // Sala de caldera
    'aq-in-cho-pcho-exte-sfre', // Sala de freón
    'aq-in-cho-pcho-exte-scbo', // Subestación planta principal
  ],
}
