import { useCallback, useEffect, useState } from 'react'
import { generateId } from '@/lib/utils'

export type EquipmentNote = { id: string; text: string; createdAt: string }
export type EquipmentNotesById = Record<string, EquipmentNote[]>

/**
 * Clave de localStorage para las notas de equipos.
 *
 * IMPORTANTE: es la MISMA clave que usa `EquipmentPage` (notesStorageKey), para
 * que Equipos y el Centro Técnico Documental compartan las mismas notas por
 * usuario (única fuente de verdad).
 */
export function equipmentNotesStorageKey(userId?: string) {
  return `equipment_notes_v1:${userId ?? 'anon'}`
}

function safeParse(raw: string | null): EquipmentNotesById {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as EquipmentNotesById) : {}
  } catch {
    return {}
  }
}

/**
 * Notas de equipos persistidas en localStorage por usuario, compartidas con la
 * página de Equipos. El estado inicial se hidrata de localStorage de forma
 * síncrona (lazy init) para evitar el flash de "vacío" al montar.
 */
export function useEquipmentNotes(userId?: string) {
  const key = equipmentNotesStorageKey(userId)
  const [notesById, setNotesById] = useState<EquipmentNotesById>(
    () => safeParse(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
  )

  // Re-hidratar si cambia el usuario (la clave depende del userId).
  useEffect(() => {
    setNotesById(safeParse(localStorage.getItem(key)))
  }, [key])

  // Persistir cualquier cambio.
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(notesById))
  }, [notesById, key])

  const notesFor = useCallback((equipmentId: string) => notesById[equipmentId] ?? [], [notesById])

  const addNote = useCallback((equipmentId: string, text: string) => {
    const t = text.trim()
    if (!t) return
    const note: EquipmentNote = { id: generateId(), text: t, createdAt: new Date().toISOString() }
    setNotesById((prev) => ({ ...prev, [equipmentId]: [note, ...(prev[equipmentId] ?? [])] }))
  }, [])

  const editNote = useCallback((equipmentId: string, noteId: string, text: string) => {
    const t = text.trim()
    if (!t) return
    setNotesById((prev) => ({
      ...prev,
      [equipmentId]: (prev[equipmentId] ?? []).map((n) => (n.id === noteId ? { ...n, text: t } : n)),
    }))
  }, [])

  const deleteNote = useCallback((equipmentId: string, noteId: string) => {
    setNotesById((prev) => ({
      ...prev,
      [equipmentId]: (prev[equipmentId] ?? []).filter((n) => n.id !== noteId),
    }))
  }, [])

  return { notesFor, addNote, editNote, deleteNote }
}
