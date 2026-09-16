import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore'
import { auth, db } from '@/services/firebase'
import { BITACORA_PLANTA, BITACORA_PRESENCIA_COLECCION, LATIDO_PRESENCIA_MS, PRESENCIA_VIGENTE_MS } from '@/config/bitacora'
import type { PresenciaBitacora, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import { dispositivoActual, idDispositivo } from '@/services/bitacora/dispositivo'
import { desfaseServidor, presentesVigentes } from '@/services/bitacora/presencia'

export interface PresenciaTurno {
  /** Dispositivos con la bitácora de este turno abierta ahora (este primero). */
  presentes: PresenciaBitacora[]
  miDispositivoId: string
}

/**
 * Presencia en la bitácora de un turno: este dispositivo avisa que está
 * (latido por minuto, solo con la pestaña a la vista) y se escucha a los demás.
 *
 * Costo: un latido por minuto por pantalla abierta — con tres equipos, menos de
 * 1.500 escrituras por turno. Sin la pestaña a la vista no late: un PC que
 * quedó con la bitácora abierta toda la noche no gasta ni figura como conectado.
 */
export function usePresenciaBitacora(
  turno: TurnoMantencion,
  yo: { nombre: string; editandoEventoId: string | null },
): PresenciaTurno {
  const miDispositivoId = useMemo(() => idDispositivo(), [])
  const docId = `${BITACORA_PLANTA.id}_${turno.id}_${miDispositivoId}`
  const [crudos, setCrudos] = useState<PresenciaBitacora[]>([])
  const [ahora, setAhora] = useState(() => Date.now())
  const desfase = useRef(0)

  // Escuchar a todos los del turno.
  useEffect(() => {
    setCrudos([])
    const q = query(
      collection(db, BITACORA_PRESENCIA_COLECCION),
      where('plantId', '==', BITACORA_PLANTA.id),
      where('turnoId', '==', turno.id),
    )
    return onSnapshot(
      q,
      (snap) => {
        const recibido = Date.now()
        const docs = snap.docs.map((d) => {
          // `none`: el latido propio aún sin confirmar trae `vistoEn` null, y
          // `presentesVigentes` lo cuenta igual (es este dispositivo).
          const data = d.data({ serverTimestamps: 'none' }) as Omit<PresenciaBitacora, 'id' | 'vistoEnMs'> & { vistoEn?: Timestamp | null }
          const p: PresenciaBitacora = {
            id: d.id,
            plantId: data.plantId,
            turnoId: data.turnoId,
            dispositivoId: data.dispositivoId,
            dispositivo: data.dispositivo,
            nombre: data.nombre,
            editandoEventoId: data.editandoEventoId ?? null,
            vistoEnMs: data.vistoEn ? data.vistoEn.toMillis() : null,
            uid: data.uid,
          }
          // La hora del servidor de MI latido, contra mi reloj: el desfase.
          if (p.dispositivoId === miDispositivoId && p.vistoEnMs != null && !d.metadata.hasPendingWrites) {
            desfase.current = desfaseServidor(p.vistoEnMs, recibido)
          }
          return p
        })
        setCrudos(docs)
        setAhora(recibido)
      },
      () => {
        // Sin permiso o sin red: la presencia es un extra, la bitácora sigue.
      },
    )
  }, [turno.id, miDispositivoId])

  // Recalcular vigencias aunque no llegue nada (alguien que se fue deja de latir).
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 20_000)
    return () => clearInterval(t)
  }, [])

  // Latir: al entrar, al cambiar lo que estoy editando y cada minuto.
  const yoRef = useRef(yo)
  yoRef.current = yo
  useEffect(() => {
    const ref = doc(db, BITACORA_PRESENCIA_COLECCION, docId)
    const latir = () => {
      const u = auth.currentUser
      if (!u || document.visibilityState !== 'visible') return
      void setDoc(ref, {
        plantId: BITACORA_PLANTA.id,
        turnoId: turno.id,
        dispositivoId: miDispositivoId,
        dispositivo: dispositivoActual(),
        nombre: (yoRef.current.nombre || u.displayName || u.email || 'Sin nombre').slice(0, 80),
        editandoEventoId: yoRef.current.editandoEventoId,
        vistoEn: serverTimestamp(),
        uid: u.uid,
      }).catch(() => undefined)
    }
    // El primer latido lo da el efecto de abajo (también corre al montar).
    const t = setInterval(latir, LATIDO_PRESENCIA_MS)
    const alVolverALaVista = () => {
      if (document.visibilityState === 'visible') latir()
    }
    document.addEventListener('visibilitychange', alVolverALaVista)
    const alSalir = () => void deleteDoc(ref).catch(() => undefined)
    window.addEventListener('pagehide', alSalir)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolverALaVista)
      window.removeEventListener('pagehide', alSalir)
      // Al cambiar de turno o salir de la bitácora: dejar de figurar al tiro.
      alSalir()
    }
  }, [docId, turno.id, miDispositivoId])

  // Un cambio de «qué estoy editando» se avisa de inmediato, no al próximo latido.
  useEffect(() => {
    const u = auth.currentUser
    if (!u || document.visibilityState !== 'visible') return
    void setDoc(doc(db, BITACORA_PRESENCIA_COLECCION, docId), {
      plantId: BITACORA_PLANTA.id,
      turnoId: turno.id,
      dispositivoId: miDispositivoId,
      dispositivo: dispositivoActual(),
      nombre: (yo.nombre || u.displayName || u.email || 'Sin nombre').slice(0, 80),
      editandoEventoId: yo.editandoEventoId,
      vistoEn: serverTimestamp(),
      uid: u.uid,
    }).catch(() => undefined)
  }, [yo.editandoEventoId, yo.nombre, docId, turno.id, miDispositivoId])

  const presentes = useMemo(
    () =>
      presentesVigentes(crudos, {
        ahoraLocalMs: ahora,
        desfaseMs: desfase.current,
        vigenciaMs: PRESENCIA_VIGENTE_MS,
        miDispositivoId,
      }),
    [crudos, ahora, miDispositivoId],
  )
  return { presentes, miDispositivoId }
}
