import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '@/services/firebase'
import { useAuthStore } from '@/store'
import { toast } from '@/hooks/useToast'
import { BITACORA_COLECCION, BITACORA_PLANTA, BITACORA_TURNOS_COLECCION } from '@/config/bitacora'
import type { EventoBitacora, EventoBitacoraDatos, FotoEvento, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import { ordenarEventos } from '@/services/bitacora/resumenBitacora'
import { tecnicosDelCalendario, tecnicosDeTurno, type CalendarioDoc } from '@/services/bitacora/tecnicosDeTurno'
import { turnoMantencionEn } from '@/services/bitacora/turnoMantencion'
import { borrarFotoBitacora, type subirFotoBitacora } from '@/services/bitacora/fotosBitacora'

/**
 * Eventos de la bitácora de UN turno, en tiempo real.
 *
 * Una sola consulta por igualdad (`plantId` + `turnoId`): no necesita índice
 * compuesto y trae pocos documentos (un turno tiene decenas de eventos, no
 * miles), así que el costo es despreciable aunque la tarjeta del Inicio la
 * mantenga abierta. Se ordena en memoria.
 *
 * `sincronizando` sale de `hasPendingWrites`: en planta la señal es mala y la
 * Constitución pide no esconder el estado de sincronización.
 */
export function useBitacoraTurno(turno: TurnoMantencion) {
  const [crudos, setCrudos] = useState<EventoBitacora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null)
  const user = useAuthStore((s) => s.user)
  const turnoId = turno.id

  useEffect(() => {
    setCargando(true)
    setCrudos([])
    const q = query(
      collection(db, BITACORA_COLECCION),
      where('plantId', '==', BITACORA_PLANTA.id),
      where('turnoId', '==', turnoId),
    )
    const off = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setCrudos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventoBitacora))
        setSincronizando(snap.metadata.hasPendingWrites)
        if (!snap.metadata.hasPendingWrites && !snap.metadata.fromCache) setUltimaSync(new Date())
        setError(null)
        setCargando(false)
      },
      (e) => {
        setError(
          e.code === 'permission-denied'
            ? 'No tienes permiso para ver la bitácora. Si recién se publicó el módulo, pueden faltar las reglas de Firestore.'
            : 'No se pudo cargar la bitácora. Revisa la conexión.',
        )
        setCargando(false)
      },
    )
    return off
  }, [turnoId])

  const eventos = useMemo(() => ordenarEventos(turno, crudos), [turno, crudos])

  const nombreAutor = useCallback(() => {
    const nombre = [user?.nombre?.split(' ')[0], user?.apellido?.split(' ')[0]].filter(Boolean).join(' ')
    return nombre || auth.currentUser?.displayName || auth.currentUser?.email || 'Sin nombre'
  }, [user])

  /** Id para un evento nuevo ANTES de guardarlo: las fotos se suben a su carpeta. */
  const nuevoId = useCallback(() => doc(collection(db, BITACORA_COLECCION)).id, [])

  const guardar = useCallback(
    async (id: string, datos: EventoBitacoraDatos, esNuevo: boolean) => {
      const u = auth.currentUser
      if (!u) throw new Error('Hay que iniciar sesión para escribir en la bitácora.')
      const descripcion = datos.descripcion.trim()
      if (!descripcion) throw new Error('Escribe qué pasó.')
      if (!/^\d{2}:\d{2}$/.test(datos.horaInicio)) throw new Error('Falta la hora de inicio.')
      const fotos: FotoEvento[] = datos.fotos.map((f) => ({
        url: f.url,
        path: f.path,
        etiqueta: f.etiqueta,
        ...(f.ancho ? { ancho: f.ancho } : {}),
        ...(f.alto ? { alto: f.alto } : {}),
      }))
      const cuerpo = {
        tipo: datos.tipo,
        equipo: datos.equipo.trim(),
        descripcion,
        horaInicio: datos.horaInicio,
        horaTermino: datos.horaTermino || null,
        impacto: datos.impacto,
        minutosParada: datos.impacto === 'con-parada' && datos.minutosParada != null ? Math.max(0, Math.round(datos.minutosParada)) : null,
        ventana: datos.impacto === 'en-ventana' ? datos.ventana?.trim() || null : null,
        pendiente: datos.pendiente,
        fotos,
      }
      const ref = doc(db, BITACORA_COLECCION, id)
      // SIN await: la promesa de Firestore se resuelve recién cuando el SERVIDOR
      // confirma. Sin señal quedaba colgada y «Guardar» giraba para siempre. La
      // app usa `persistentLocalCache`, así que la escritura ya quedó en el
      // teléfono (sobrevive a cerrar la app) y el onSnapshot la muestra al tiro
      // con `hasPendingWrites` → «Guardando…». Si el servidor la rechaza, se avisa.
      const avisarRechazo = (e: unknown) =>
        toast({
          title: 'El evento no se guardó en el servidor',
          description: (e as { code?: string })?.code === 'permission-denied'
            ? 'Sin permiso para escribir en la bitácora.'
            : 'Vuelve a intentarlo cuando haya señal.',
          variant: 'destructive',
        })
      const quien = datos.quien.trim() || nombreAutor()
      if (esNuevo) {
        void setDoc(ref, {
          ...cuerpo,
          registradoPor: quien,
          plantId: BITACORA_PLANTA.id,
          turnoId: turno.id,
          fechaTurno: turno.fecha,
          banda: turno.banda,
          creadoPor: u.uid,
          autorNombre: nombreAutor(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(avisarRechazo)
      } else {
        // Al editar NO se toca registradoPor: quien edita queda aparte.
        void updateDoc(ref, { ...cuerpo, actualizadoPorNombre: quien, updatedAt: serverTimestamp() }).catch(avisarRechazo)
      }
    },
    [turno, nombreAutor],
  )

  const borrar = useCallback(async (evento: EventoBitacora) => {
    // Mismo criterio que guardar: no esperar al servidor (ver arriba).
    void deleteDoc(doc(db, BITACORA_COLECCION, evento.id)).catch(() =>
      toast({ title: 'No se pudo borrar el evento', description: 'Solo quien lo creó o un supervisor puede borrarlo.', variant: 'destructive' }),
    )
    // Las fotos después del doc: si alguna falla queda huérfana en Storage,
    // pero el evento ya no se ve, que es lo que se pidió.
    void Promise.allSettled((evento.fotos ?? []).map((f) => borrarFotoBitacora(f.path)))
  }, [])

  return { eventos, cargando, error, sincronizando, ultimaSync, nuevoId, guardar, borrar }
}

/** El turno en curso, que cambia solo al pasar las 00, 08 y 16 h. */
export function useTurnoMantencionActual(): TurnoMantencion {
  const [turno, setTurno] = useState(() => turnoMantencionEn())
  useEffect(() => {
    const t = setInterval(() => {
      const ahora = turnoMantencionEn()
      setTurno((prev) => (prev.id === ahora.id ? prev : ahora))
    }, 30_000)
    return () => clearInterval(t)
  }, [])
  return turno
}

let cacheCalendario: { doc: CalendarioDoc | null; en: number } | null = null
const TTL_CALENDARIO = 5 * 60_000

export interface TecnicosCalendario {
  /** Los que tienen esa banda ese día (van primero y en el correo). */
  deTurno: string[]
  /** Toda la planilla: de aquí elige su nombre quien usa la cuenta compartida. */
  todos: string[]
}

/** Técnicos según el calendario de Mantención (1 lectura cada 5 min). */
export function useTecnicosDeTurno(turno: TurnoMantencion): TecnicosCalendario {
  const [cal, setCal] = useState<CalendarioDoc | null>(cacheCalendario?.doc ?? null)
  useEffect(() => {
    if (cacheCalendario && Date.now() - cacheCalendario.en < TTL_CALENDARIO) return
    let vivo = true
    getDoc(doc(db, 'calendario_mantencion_state', 'current'))
      .then((snap) => {
        const d = snap.exists() ? (snap.data() as CalendarioDoc) : null
        cacheCalendario = { doc: d, en: Date.now() }
        if (vivo) setCal(d)
      })
      .catch(() => {
        // Sin calendario el correo sale igual, solo sin la línea de técnicos.
      })
    return () => {
      vivo = false
    }
  }, [])
  return useMemo(() => ({ deTurno: tecnicosDeTurno(cal, turno), todos: tecnicosDelCalendario(cal) }), [cal, turno])
}

export interface ObservacionTurno {
  texto: string
  actualizadoPorNombre: string | null
}

/**
 * Observación general del turno (una nota por turno: estado de la planta,
 * entrega de turno…). Doc `bitacoraTurnos/{plantId}_{turnoId}`.
 */
export function useObservacionTurno(turno: TurnoMantencion) {
  const [obs, setObs] = useState<ObservacionTurno>({ texto: '', actualizadoPorNombre: null })
  const user = useAuthStore((s) => s.user)
  const docId = `${BITACORA_PLANTA.id}_${turno.id}`

  useEffect(() => {
    setObs({ texto: '', actualizadoPorNombre: null })
    const off = onSnapshot(
      doc(db, BITACORA_TURNOS_COLECCION, docId),
      (snap) => {
        const d = snap.data()
        setObs({
          texto: typeof d?.observacion === 'string' ? d.observacion : '',
          actualizadoPorNombre: typeof d?.actualizadoPorNombre === 'string' ? d.actualizadoPorNombre : null,
        })
      },
      () => {
        // Sin permiso o sin red: la observación es opcional, la pantalla sigue.
      },
    )
    return off
  }, [docId])

  const guardarObservacion = useCallback(
    async (texto: string, quien: string) => {
      const u = auth.currentUser
      if (!u) throw new Error('Hay que iniciar sesión para escribir en la bitácora.')
      const nombre =
        quien.trim() ||
        [user?.nombre?.split(' ')[0], user?.apellido?.split(' ')[0]].filter(Boolean).join(' ') ||
        u.displayName ||
        'Sin nombre'
      // Sin await, igual que los eventos: queda en el teléfono si no hay señal.
      void setDoc(doc(db, BITACORA_TURNOS_COLECCION, docId), {
        plantId: BITACORA_PLANTA.id,
        turnoId: turno.id,
        observacion: texto.trim(),
        actualizadoPor: u.uid,
        actualizadoPorNombre: nombre,
        updatedAt: serverTimestamp(),
      }).catch(() => toast({ title: 'La observación no se guardó en el servidor', variant: 'destructive' }))
    },
    [docId, turno.id, user],
  )

  return { observacion: obs, guardarObservacion }
}

/**
 * De dónde saca la pantalla de la bitácora sus datos. En la app es Firestore;
 * la vitrina de desarrollo (`/dev/bitacora`) inyecta datos de ejemplo para
 * revisar el módulo sin sesión ni reglas desplegadas.
 */
export interface FuenteBitacora {
  useEventos: (turno: TurnoMantencion) => ReturnType<typeof useBitacoraTurno>
  useTecnicos: (turno: TurnoMantencion) => TecnicosCalendario
  useObservacion: (turno: TurnoMantencion) => ReturnType<typeof useObservacionTurno>
  /** Reemplaza la subida a Storage. */
  subirFoto?: typeof subirFotoBitacora
}

export const FUENTE_FIRESTORE: FuenteBitacora = {
  useEventos: useBitacoraTurno,
  useTecnicos: useTecnicosDeTurno,
  useObservacion: useObservacionTurno,
}