/**
 * useMapRuntimeData — Hook que genera NodeRuntimeData vinculando nodos del mapa con datos reales de Firestore
 * 
 * Convierte Equipment.estado → OperationalStatus y cuenta incidencias activas por equipo.
 * Los nodos sin vinculación mantienen estado 'ok' por defecto.
 */

import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { MapNode } from '@/types/isometricMap'
import type { NodeRuntimeData, OperationalStatus } from '@/types/isometricMap'
import type { Equipment, Incident } from '@/types'

/** Mapea Equipment.estado → OperationalStatus */
function mapEquipmentEstado(estado: Equipment['estado']): OperationalStatus {
  switch (estado) {
    case 'operativo':
      return 'ok'
    case 'en_mantenimiento':
      return 'maintenance'
    case 'fuera_servicio':
      return 'offline'
    default:
      return 'ok'
  }
}

/** Determina si la incidencia sube el nivel de alerta del nodo */
function worstStatus(current: OperationalStatus, incident: Incident): OperationalStatus {
  const SEVERITY_ORDER: OperationalStatus[] = ['ok', 'maintenance', 'warning', 'critical', 'offline']
  const currentIdx = SEVERITY_ORDER.indexOf(current)

  let incidentSeverity: OperationalStatus = 'warning'
  if (incident.prioridad === 'critica') incidentSeverity = 'critical'
  else if (incident.prioridad === 'alta') incidentSeverity = 'warning'
  else incidentSeverity = 'warning'

  const incidentIdx = SEVERITY_ORDER.indexOf(incidentSeverity)
  return incidentIdx > currentIdx ? incidentSeverity : current
}

/** Genera tooltip con info del equipo */
function buildTooltip(eq: Equipment, activeCount: number): string {
  const parts: string[] = [eq.nombre]
  if (eq.codigo) parts.push(`(${eq.codigo})`)
  if (activeCount > 0) parts.push(`· ${activeCount} incidencia${activeCount > 1 ? 's' : ''} activa${activeCount > 1 ? 's' : ''}`)
  return parts.join(' ')
}

const ACTIVE_STATUSES = new Set(['pendiente', 'confirmada', 'en_proceso'])

/**
 * Hook que transforma datos reales de equipos e incidencias en NodeRuntimeData
 * para el mapa isométrico.
 * 
 * @param nodes - Nodos del mapa actual
 * @returns Map<nodeId, NodeRuntimeData>
 */
export function useMapRuntimeData(nodes: MapNode[]): Map<string, NodeRuntimeData> {
  const equipment = useAppStore((s) => s.equipment)
  const incidents = useAppStore((s) => s.incidents)

  return useMemo(() => {
    const runtimeMap = new Map<string, NodeRuntimeData>()

    // Índice rápido de equipos por ID
    const equipById = new Map<string, Equipment>()
    for (const eq of equipment) {
      equipById.set(eq.id, eq)
    }

    // Índice rápido de incidencias activas por equipmentId
    const activeIncidentsByEquipment = new Map<string, Incident[]>()
    for (const inc of incidents) {
      if (!inc.equipmentId || !ACTIVE_STATUSES.has(inc.status)) continue
      const list = activeIncidentsByEquipment.get(inc.equipmentId)
      if (list) {
        list.push(inc)
      } else {
        activeIncidentsByEquipment.set(inc.equipmentId, [inc])
      }
    }

    for (const node of nodes) {
      // Nodos vinculados a equipos
      if (node.linkedEntityType === 'equipment' && node.linkedEntityId) {
        const eq = equipById.get(node.linkedEntityId)
        if (eq) {
          let status = mapEquipmentEstado(eq.estado)
          const eqIncidents = activeIncidentsByEquipment.get(eq.id) ?? []
          const activeCount = eqIncidents.length

          // Escalar status si hay incidencias activas de mayor severidad
          for (const inc of eqIncidents) {
            status = worstStatus(status, inc)
          }

          runtimeMap.set(node.id, {
            nodeId: node.id,
            status,
            activeIncidents: activeCount,
            tooltip: buildTooltip(eq, activeCount),
          })
          continue
        }
      }

      // Nodos vinculados a zonas (solo contamos incidencias de la zona)
      if (node.linkedEntityType === 'zone' && node.linkedEntityId) {
        // Buscar incidencias cuyo equipment esté en la zona
        let zoneIncidents = 0
        let zoneStatus: OperationalStatus = 'ok'
        for (const eq of equipment) {
          if (eq.zoneId === node.linkedEntityId) {
            const eqInc = activeIncidentsByEquipment.get(eq.id)
            if (eqInc) {
              zoneIncidents += eqInc.length
              for (const inc of eqInc) {
                zoneStatus = worstStatus(zoneStatus, inc)
              }
            }
            // Si el equipo está fuera de servicio, escalar
            const eqStatus = mapEquipmentEstado(eq.estado)
            if (['critical', 'offline'].includes(eqStatus)) {
              zoneStatus = worstStatus(zoneStatus, { prioridad: 'critica' } as Incident)
            }
          }
        }

        runtimeMap.set(node.id, {
          nodeId: node.id,
          status: zoneStatus,
          activeIncidents: zoneIncidents,
          tooltip: zoneIncidents > 0 ? `Zona con ${zoneIncidents} incidencia${zoneIncidents > 1 ? 's' : ''} activa${zoneIncidents > 1 ? 's' : ''}` : undefined,
        })
        continue
      }

      // Nodos sin vincular → estado ok por defecto
      runtimeMap.set(node.id, {
        nodeId: node.id,
        status: 'ok',
        activeIncidents: 0,
      })
    }

    return runtimeMap
  }, [nodes, equipment, incidents])
}
