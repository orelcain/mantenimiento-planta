/**
 * useEquipmentForArea — Equipos SAP de un área seleccionada
 *
 * Carga los nodos con código numérico (equipos) que son hijos directos
 * del área seleccionada, más sus sub-equipos (1 nivel más).
 */

import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { HierarchyNode, HierarchyLevel, isEquipmentNode } from '@/types/hierarchy'

export interface EquipmentDisplayNode {
  id: string
  nombre: string
  alias?: string
  codigo: string
  nivel: HierarchyLevel
  parentId: string | null
  path?: string[]
  linkedMachineId?: string
  oculto?: boolean
  children: EquipmentDisplayNode[]
}

// Cache de equipos por area
const equipmentCache = new Map<string, { equipment: EquipmentDisplayNode[]; ts: number }>()
const CACHE_TTL = 3 * 60 * 1000

/** Invalida el cache de equipos — llamar tras vincular/desvincular */
export function invalidateEquipmentCache(areaNodeId?: string) {
  if (areaNodeId) equipmentCache.delete(areaNodeId)
  else equipmentCache.clear()
}

export function useEquipmentForArea(areaNodeId: string | null, refreshKey = 0) {
  const [equipment, setEquipment] = useState<EquipmentDisplayNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!areaNodeId) {
      setEquipment([])
      setLoading(false)
      return
    }

    // Check cache
    const cached = equipmentCache.get(areaNodeId)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setEquipment(cached.equipment)
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const hierarchyRef = collection(db, 'hierarchy')

        // 1. Obtener hijos directos del área
        const q = query(
          hierarchyRef,
          where('parentId', '==', areaNodeId),
          where('activo', '==', true),
          orderBy('orden', 'asc'),
        )
        const snapshot = await getDocs(q)
        const children: HierarchyNode[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        } as HierarchyNode))

        // 2. Filtrar equipos (código numérico)
        const topEquipment = children.filter(n => isEquipmentNode(n.codigo) || !n.codigo)

        // 3. Para cada equipo, cargar sub-equipos (hijos con código numérico)
        const equipWithChildren: EquipmentDisplayNode[] = await Promise.all(
          topEquipment.map(async (eq): Promise<EquipmentDisplayNode> => {
            const subQ = query(
              hierarchyRef,
              where('parentId', '==', eq.id),
              where('activo', '==', true),
              orderBy('orden', 'asc'),
            )
            const subSnap = await getDocs(subQ)
            const subNodes: HierarchyNode[] = subSnap.docs.map(d => ({
              id: d.id,
              ...d.data(),
            } as HierarchyNode))

            // Recursivo 1 nivel más: sub-sub-equipos
            const subEquipment: EquipmentDisplayNode[] = await Promise.all(
              subNodes.filter(n => isEquipmentNode(n.codigo) || !n.codigo).map(async (sub): Promise<EquipmentDisplayNode> => {
                const subSubQ = query(
                  hierarchyRef,
                  where('parentId', '==', sub.id),
                  where('activo', '==', true),
                  orderBy('orden', 'asc'),
                )
                const subSubSnap = await getDocs(subSubQ)
                const subSubNodes: HierarchyNode[] = subSubSnap.docs.map(d => ({
                  id: d.id,
                  ...d.data(),
                } as HierarchyNode))

                return {
                  id: sub.id,
                  nombre: sub.nombre,
                  alias: (sub as any).alias,
                  codigo: sub.codigo,
                  nivel: sub.nivel,
                  parentId: sub.parentId,
                  path: sub.path,
                  linkedMachineId: (sub as HierarchyNode & { linkedMachineId?: string }).linkedMachineId,
                  oculto: (sub as any).oculto ?? false,
                  children: subSubNodes.filter(n => isEquipmentNode(n.codigo) || !n.codigo).map(ssn => ({
                    id: ssn.id,
                    nombre: ssn.nombre,
                    alias: (ssn as any).alias,
                    codigo: ssn.codigo,
                    nivel: ssn.nivel,
                    parentId: ssn.parentId,
                    path: ssn.path,
                    linkedMachineId: (ssn as HierarchyNode & { linkedMachineId?: string }).linkedMachineId,
                    oculto: (ssn as any).oculto ?? false,
                    children: [],
                  })),
                }
              })
            )

            return {
              id: eq.id,
              nombre: eq.nombre,
              alias: (eq as any).alias,
              codigo: eq.codigo,
              nivel: eq.nivel,
              parentId: eq.parentId,
              path: eq.path,
              linkedMachineId: (eq as HierarchyNode & { linkedMachineId?: string }).linkedMachineId,
              oculto: (eq as any).oculto ?? false,
              children: subEquipment,
            }
          })
        )

        if (!cancelled) {
          equipmentCache.set(areaNodeId, { equipment: equipWithChildren, ts: Date.now() })
          setEquipment(equipWithChildren)
        }
      } catch (err) {
        console.error('Error loading equipment for area', areaNodeId, err)
        if (!cancelled) setEquipment([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => { cancelled = true }
  }, [areaNodeId, refreshKey])

  return { equipment, loading }
}
