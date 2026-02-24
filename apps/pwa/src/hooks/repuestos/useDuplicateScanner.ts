/**
 * useDuplicateScanner v2.48.93
 *
 * Escanea TODAS las máquinas para encontrar repuestos duplicados
 * agrupados por código SAP (clave principal de deduplicación).
 * Funciona cross-machine: un repuesto puede estar duplicado
 * tanto en la misma máquina como en máquinas diferentes.
 */

import { useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Repuesto, Machine } from '@/types/repuestos'

export interface DuplicateEntry {
  repuesto: Repuesto
  machineId: string
  machineName: string
  machineColor: string
}

export interface DuplicateGroup {
  /** Código SAP compartido */
  codigoSAP: string
  /** Todas las instancias duplicadas */
  entries: DuplicateEntry[]
  /** Total de cantidades combinadas */
  totalCantidad: number
  /** Si hay duplicados en la misma máquina */
  sameMachine: boolean
  /** Si hay duplicados en máquinas diferentes */
  crossMachine: boolean
}

export function useDuplicateScanner() {
  const [scanning, setScanning] = useState(false)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [totalScanned, setTotalScanned] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async (machines: Machine[]) => {
    setScanning(true)
    setError(null)
    setGroups([])
    setTotalScanned(0)

    try {
      // Map: normalizedSAP → DuplicateEntry[]
      const sapMap = new Map<string, DuplicateEntry[]>()
      let scanned = 0

      for (const machine of machines) {
        if (!machine.activa) continue

        const colRef = collection(db, `machines/${machine.id}/repuestos`)
        const q = query(colRef, orderBy('codigoSAP'))
        const snapshot = await getDocs(q)

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data()
          const repuesto: Repuesto = {
            id: docSnap.id,
            codigoSAP: data.codigoSAP || '',
            textoBreve: data.textoBreve || '',
            descripcion: data.descripcion || '',
            codigoFabricante: data.codigoFabricante || data.codigoBaader || '',
            valorUnitario: data.valorUnitario || 0,
            cantidadPorMaquina: data.cantidadPorMaquina || 0,
            ubicacionEnPlanta: data.ubicacionEnPlanta || '',
            vinculosManual: data.vinculosManual || [],
            posicionManual: data.posicionManual || '',
            imagenesManual: data.imagenesManual || [],
            fotosReales: data.fotosReales || [],
            technicalSpecs: data.technicalSpecs,
            gallery: data.gallery || [],
            createdAt: data.createdAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || new Date(),
          }

          const sap = (repuesto.codigoSAP || '').trim().toUpperCase()
          if (!sap || sap === 'PENDIENTE') continue

          const entry: DuplicateEntry = {
            repuesto,
            machineId: machine.id,
            machineName: machine.nombre,
            machineColor: machine.color,
          }

          const existing = sapMap.get(sap)
          if (existing) {
            existing.push(entry)
          } else {
            sapMap.set(sap, [entry])
          }

          scanned++
        }

        setTotalScanned(scanned)
      }

      // Filter: only groups with 2+ entries
      const duplicateGroups: DuplicateGroup[] = []

      for (const [sap, entries] of sapMap) {
        if (entries.length < 2) continue

        const machineIds = new Set(entries.map(e => e.machineId))
        const totalCantidad = entries.reduce((sum, e) => sum + (e.repuesto.cantidadPorMaquina || 0), 0)

        duplicateGroups.push({
          codigoSAP: sap,
          entries,
          totalCantidad,
          sameMachine: entries.some((e, i) =>
            entries.some((e2, j) => i !== j && e.machineId === e2.machineId)
          ),
          crossMachine: machineIds.size > 1,
        })
      }

      // Sort: most duplicates first
      duplicateGroups.sort((a, b) => b.entries.length - a.entries.length)

      setGroups(duplicateGroups)
    } catch (err) {
      console.error('Error scanning duplicates:', err)
      setError(err instanceof Error ? err.message : 'Error al escanear')
    } finally {
      setScanning(false)
    }
  }, [])

  return { scan, scanning, groups, totalScanned, error, setGroups }
}
