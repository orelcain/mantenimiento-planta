/**
 * Configuración del Duelo de equipos de UN monitor: `monitor_config/{token}.duelo`.
 *
 *   equipos:   { rebolledo: 'Nombre', cardenas: 'Nombre' }   (cada monitor tiene los suyos: Filete los carga el admin)
 *   overrides: { '<shiftDocId>': 'rebolledo' | 'cardenas' }  (corrección manual de qué equipo hizo un turno)
 *
 * Se lee SIN sesión (el monitor se abre con el link, y los nombres son públicos por decisión del plan); se
 * escribe solo con sesión de supervisor o admin. Las reglas de Firestore son la defensa real: acá `puedeEditar`
 * solo decide si se muestran los controles. Los operadores no figuran en ningún campo.
 */
import { useEffect, useState } from 'react'
import { deleteField, doc, onSnapshot, setDoc } from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import { esEquipoId, type ConfigDuelo, type EquipoId, type NombresEquipos } from './duelo'

const COLECCION = 'monitor_config'

/** Lo que dice el documento, saneado: un valor que no es de un equipo conocido se descarta. */
export function configDeDoc(data: unknown): ConfigDuelo {
  const d = (data as { duelo?: { equipos?: Record<string, unknown>; overrides?: Record<string, unknown> } } | null | undefined)?.duelo
  const equipos: NombresEquipos = {}
  for (const id of ['rebolledo', 'cardenas'] as const) {
    const n = d?.equipos?.[id]
    if (typeof n === 'string' && n.trim()) equipos[id] = n.trim().slice(0, 60)
  }
  const overrides: Record<string, EquipoId> = {}
  for (const [k, v] of Object.entries(d?.overrides ?? {})) if (esEquipoId(v)) overrides[k] = v
  return { equipos, overrides }
}

/** Escucha la configuración. Sin documento, sin permiso o sin red queda la de fábrica: el duelo no se rompe. */
export function useDueloConfig(token: string | undefined): ConfigDuelo {
  const [config, setConfig] = useState<ConfigDuelo>({})
  useEffect(() => {
    if (!token) return
    return onSnapshot(
      doc(db, COLECCION, token),
      (snap) => setConfig(configDeDoc(snap.data())),
      () => setConfig({}),
    )
  }, [token])
  return config
}

const ahora = () => new Date().toISOString()

/** Guarda los nombres de los dos supervisores (vacío = vuelve al de fábrica). */
export async function guardarNombresDuelo(token: string, nombres: NombresEquipos): Promise<void> {
  const limpio = (v: string | undefined) => v?.trim().slice(0, 60) || deleteField()
  await setDoc(
    doc(db, COLECCION, token),
    { duelo: { equipos: { rebolledo: limpio(nombres.rebolledo), cardenas: limpio(nombres.cardenas) } }, updatedAt: ahora() },
    { merge: true },
  )
}

/** Corrige a mano qué equipo hizo un turno; `null` vuelve a la rotación automática. */
export async function fijarEquipoDelTurno(token: string, shiftDocId: string, equipo: EquipoId | null): Promise<void> {
  await setDoc(
    doc(db, COLECCION, token),
    { duelo: { overrides: { [shiftDocId]: equipo ?? deleteField() } }, updatedAt: ahora() },
    { merge: true },
  )
}
