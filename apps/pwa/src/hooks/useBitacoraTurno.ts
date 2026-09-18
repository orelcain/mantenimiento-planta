import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  arrayRemove,
  arrayUnion,
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
  writeBatch,
} from 'firebase/firestore'
import { pendientesAnteriores } from '@/services/bitacora/entregaTurno'
import { VIBRA_ERROR, vibrar } from '@/services/bitacora/vibrar'
import { borradoresAnteriores } from '@/services/bitacora/borradores'
import { auth, db } from '@/services/firebase'
import { useAuthStore } from '@/store'
import { toast } from '@/hooks/useToast'
import { useAjustesTecnicos, useOpcionesEquipo } from '@/hooks/useListasBitacora'
import { BITACORA_COLECCION, BITACORA_PLANTA, BITACORA_TURNOS_COLECCION, MAX_FOTOS_EVENTO, MAX_TIPO_OTRO, MAX_TITULO_EVENTO } from '@/config/bitacora'
import type { FuenteRepuestos } from '@/services/bitacora/repuestosBitacora'
import { normalizarRepuestos, resolverTipo } from '@/services/bitacora/presentacionEvento'
import type { EventoBitacora, EventoBitacoraDatos, FotoEvento, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import { ordenarEventos } from '@/services/bitacora/resumenBitacora'
import { tecnicosDelCalendario, tecnicosDeTurno, type CalendarioDoc } from '@/services/bitacora/tecnicosDeTurno'
import { turnoMantencionEn, turnoDesdeId } from '@/services/bitacora/turnoMantencion'
import { borrarFotoOEncolar, type subirFotoBitacora } from '@/services/bitacora/fotosBitacora'
import { autorVisible } from '@/services/bitacora/bitacora.types'
import { dispositivoActual } from '@/services/bitacora/dispositivo'
import { usePresenciaBitacora } from '@/hooks/usePresenciaBitacora'

/**
 * Cierra el pendiente que un evento nuevo acaba de resolver.
 *
 * Va SEPARADO de la escritura del evento a propósito. Antes iban en un lote, y
 * `update()` lleva precondición de existencia: si el pendiente original ya no
 * estaba (lo borraron desde otro teléfono), el lote fallaba ENTERO y el evento
 * recién escrito —con sus fotos— se perdía con un aviso que hablaba de señal
 * (revisión 15-09). Ahora el evento se guarda igual y el cierre avisa aparte.
 *
 * Además NO pisa un cierre ajeno: si otro turno ya lo cerró, lo dice en vez de
 * sobrescribirlo.
 */
/**
 * Un evento que ya cerró un pendiente cambió de turno: el pendiente original
 * pasa a decir «Resuelto en» el turno nuevo. Solo si el cierre es de ESE evento.
 */
async function reubicarCierre(pendienteId: string, eventoId: string, turnoId: string): Promise<void> {
  const ref = doc(db, BITACORA_COLECCION, pendienteId)
  try {
    const snap = await getDoc(ref)
    const cierre = snap.exists() ? (snap.data().cierre as { eventoId?: string } | null | undefined) : null
    if (cierre?.eventoId !== eventoId) return
    await updateDoc(ref, { 'cierre.turnoId': turnoId, updatedAt: serverTimestamp() })
  } catch {
    toast({
      title: 'El evento se movió, pero el pendiente no se actualizó',
      description: 'Vuelve a guardar el evento cuando haya señal.',
      variant: 'destructive',
    })
  }
}

async function cerrarPendienteResuelto(
  pendienteId: string,
  eventoId: string,
  turnoId: string,
  quien: string,
): Promise<void> {
  const ref = doc(db, BITACORA_COLECCION, pendienteId)
  const cierre = {
    pendiente: false,
    cierre: { tipo: 'resuelto', turnoId, porNombre: quien, eventoId, motivo: null, en: serverTimestamp() },
    updatedAt: serverTimestamp(),
  }
  let snap
  try {
    snap = await getDoc(ref)
  } catch {
    // Sin señal y sin el pendiente en caché: se intenta igual (queda en la cola
    // de escrituras del teléfono). El evento ya está guardado pase lo que pase.
    void updateDoc(ref, cierre).catch(() => undefined)
    return
  }
  if (!snap.exists()) {
    toast({
      title: 'El evento quedó guardado',
      description: 'El pendiente original ya no existe, así que no había nada que cerrar.',
    })
    return
  }
  const previo = (snap.data() as EventoBitacora).cierre
  if (previo && previo.eventoId !== eventoId) {
    toast({
      title: 'El evento quedó guardado',
      description: `Ese pendiente ya lo había cerrado ${previo.porNombre || 'otro turno'}.`,
    })
    return
  }
  void updateDoc(ref, cierre).catch(() =>
    toast({ title: 'El evento se guardó, pero el pendiente sigue abierto', variant: 'destructive' }),
  )
}

/**
 * Reabre un pendiente al borrar el evento que lo cerraba, SOLO si sigue cerrado
 * por ese evento: si otro evento lo resolvió después, reabrirlo mandaba al turno
 * siguiente una falla ya reparada (revisión 15-09).
 */
async function reabrirPendiente(pendienteId: string, eventoId: string): Promise<void> {
  const ref = doc(db, BITACORA_COLECCION, pendienteId)
  const reabrir = { pendiente: true, cierre: null, updatedAt: serverTimestamp() }
  let snap
  try {
    snap = await getDoc(ref)
  } catch {
    void updateDoc(ref, reabrir).catch(() => undefined)
    return
  }
  if (!snap.exists()) return
  const previo = (snap.data() as EventoBitacora).cierre
  if (previo && previo.eventoId !== eventoId) return
  void updateDoc(ref, reabrir).catch(() => undefined)
}

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
  /** Documentos con cambios guardados en este equipo que el servidor aún no confirma. */
  const [cambiosPorSubir, setCambiosPorSubir] = useState(0)
  /** Lo último que llegó de OTRO equipo («Leandro agregó un evento»). */
  const [novedad, setNovedad] = useState<{ texto: string; en: number } | null>(null)
  const user = useAuthStore((s) => s.user)
  const turnoId = turno.id

  useEffect(() => {
    setCargando(true)
    setCrudos([])
    setNovedad(null)
    // Lo que ya estaba al abrir no es «novedad»: se empieza a avisar recién
    // después de la primera respuesta del SERVIDOR (la de caché no cuenta).
    let sincronizadoUnaVez = false
    const estadoPrevio = new Map<string, string | undefined>()
    const q = query(
      collection(db, BITACORA_COLECCION),
      where('plantId', '==', BITACORA_PLANTA.id),
      where('turnoId', '==', turnoId),
    )
    const off = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as EventoBitacora)
        if (sincronizadoUnaVez) {
          for (const c of snap.docChanges()) {
            // Con cambios pendientes = lo escribió ESTE equipo: no es novedad.
            if (c.doc.metadata.hasPendingWrites) continue
            const e = { id: c.doc.id, ...c.doc.data() } as EventoBitacora
            const quien = autorVisible(e) || 'Alguien'
            if (c.type === 'added') {
              setNovedad({ texto: e.estado === 'borrador' ? `${quien} empezó un evento` : `${quien} agregó un evento`, en: Date.now() })
            } else if (c.type === 'modified' && estadoPrevio.get(e.id) === 'borrador' && e.estado !== 'borrador') {
              setNovedad({ texto: `${e.actualizadoPorNombre || quien} publicó un evento`, en: Date.now() })
            }
          }
        }
        for (const e of docs) estadoPrevio.set(e.id, e.estado)
        if (!snap.metadata.fromCache) sincronizadoUnaVez = true
        setCrudos(docs)
        setCambiosPorSubir(snap.docs.filter((d) => d.metadata.hasPendingWrites).length)
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
  // Para leer el estado vivo dentro de `guardar` sin recrear el callback (lo que
  // haría remontar la hoja de edición en cada snapshot).
  const eventosRef = useRef(crudos)
  eventosRef.current = crudos

  const nombreAutor = useCallback(() => {
    // Pase de bitácora: el nombre completo del técnico dueño del teléfono.
    if (user?.paseBitacora) return user.paseBitacora.nombre
    const nombre = [user?.nombre?.split(' ')[0], user?.apellido?.split(' ')[0]].filter(Boolean).join(' ')
    return nombre || auth.currentUser?.displayName || auth.currentUser?.email || 'Sin nombre'
  }, [user])

  const ultimoAvisoBorrador = useRef(0)

  /** Id para un evento nuevo ANTES de guardarlo: las fotos se suben a su carpeta. */
  const nuevoId = useCallback(() => doc(collection(db, BITACORA_COLECCION)).id, [])

  const guardar = useCallback(
    async (id: string, datos: EventoBitacoraDatos, esNuevo: boolean) => {
      const u = auth.currentUser
      if (!u) throw new Error('Hay que iniciar sesión para escribir en la bitácora.')
      const estado = datos.estado ?? 'listo'
      const esBorradorAhora = estado === 'borrador'
      // Un borrador se guarda TAL CUAL: recortarle el espacio final hacía que la
      // vista local lo devolviera recortado y el espacio que se estaba
      // tecleando desapareciera bajo el cursor (revisión 16-09). Se recorta al publicar.
      const limpiar = (t: string) => (esBorradorAhora ? t : t.trim())
      const descripcion = limpiar(datos.descripcion)
      // Un borrador se guarda como vaya: la descripción se exige al publicar.
      if (!descripcion.trim() && !esBorradorAhora) throw new Error('Escribe qué pasó.')
      // `''` = «Sin hora» (decisión de Orel 16-09-2026): entonces no hay término.
      const sinHora = datos.horaInicio === ''
      if (!sinHora && !/^\d{2}:\d{2}$/.test(datos.horaInicio)) throw new Error('Falta la hora de inicio.')
      // Al publicar, un «Otro» que coincide con un tipo fijo queda como ese tipo.
      const { tipo, tipoOtro } = esBorradorAhora
        ? { tipo: datos.tipo, tipoOtro: datos.tipo === 'otro' ? (datos.tipoOtro ?? '').slice(0, MAX_TIPO_OTRO) || null : null }
        : resolverTipo(datos.tipo, datos.tipoOtro)
      if (!esBorradorAhora && tipo === 'otro' && !tipoOtro) throw new Error('Escribe el tipo o elige uno de la lista.')
      const fotos: FotoEvento[] = datos.fotos.map((f) => ({
        url: f.url,
        path: f.path,
        etiqueta: f.etiqueta,
        ...(f.ancho ? { ancho: f.ancho } : {}),
        ...(f.alto ? { alto: f.alto } : {}),
      }))
      const cuerpo = {
        tipo,
        tipoOtro,
        equipo: limpiar(datos.equipo),
        titulo: limpiar(datos.titulo ?? '').slice(0, MAX_TITULO_EVENTO) || null,
        // El número solo vale con un equipo elegido del buscador.
        equipoCodigo: datos.equipoId ? (datos.equipoCodigo ?? '').trim().slice(0, 40) || null : null,
        repuestos: normalizarRepuestos(datos.repuestos),
        descripcion,
        horaInicio: datos.horaInicio,
        horaTermino: sinHora ? null : datos.horaTermino || null,
        // Solo un evento sin hora se ubica a mano; con hora manda el reloj.
        posicionMin: sinHora && typeof datos.posicionMin === 'number' && Number.isFinite(datos.posicionMin) ? datos.posicionMin : null,
        impacto: datos.impacto,
        minutosParada: datos.impacto === 'con-parada' && datos.minutosParada != null ? Math.max(0, Math.round(datos.minutosParada)) : null,
        ventana: datos.impacto === 'en-ventana' ? (datos.ventana ? limpiar(datos.ventana) : '') || null : null,
        pendiente: datos.pendiente,
        fotos,
        participantes: [...new Set(datos.participantes.map((p) => p.trim()).filter(Boolean))].slice(0, 12),
        equipoId: datos.equipoId || null,
        estado,
        dispositivo: dispositivoActual(),
      }
      const ref = doc(db, BITACORA_COLECCION, id)
      // SIN await: la promesa de Firestore se resuelve recién cuando el SERVIDOR
      // confirma. Sin señal quedaba colgada y «Guardar» giraba para siempre. La
      // app usa `persistentLocalCache`, así que la escritura ya quedó en el
      // teléfono (sobrevive a cerrar la app) y el onSnapshot la muestra al tiro
      // con `hasPendingWrites` → «Guardando…». Si el servidor la rechaza, se avisa.
      const avisarRechazo = (e: unknown) => {
        // El autoguardado escribe cada pocos segundos: un rechazo repetido no
        // puede llenar la pantalla de avisos iguales.
        if (esBorradorAhora && Date.now() - ultimoAvisoBorrador.current < 30_000) return
        if (esBorradorAhora) ultimoAvisoBorrador.current = Date.now()
        vibrar(VIBRA_ERROR)
        toast({
          title: 'El evento no se guardó en el servidor',
          description: (e as { code?: string })?.code === 'permission-denied'
            ? 'Sin permiso para escribir en la bitácora.'
            : 'Vuelve a intentarlo cuando haya señal.',
          variant: 'destructive',
        })
      }
      const quien = datos.quien.trim() || nombreAutor()
      // Turno de destino: el que se mira, o el que se eligió en el editor (solo al
      // publicar o guardar; el autoguardado nunca mueve un borrador).
      const elegido = !esBorradorAhora && datos.turnoId ? turnoDesdeId(datos.turnoId) : null
      const destino = elegido ?? turno
      const mueve = destino.id !== turno.id
      if (esNuevo) {
        const nuevo = {
          ...cuerpo,
          ...(mueve ? { posicionMin: null } : {}),
          registradoPor: quien,
          plantId: BITACORA_PLANTA.id,
          turnoId: destino.id,
          fechaTurno: destino.fecha,
          banda: destino.banda,
          creadoPor: u.uid,
          autorNombre: nombreAutor(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        if (datos.resuelvePendiente?.id) {
          // Entrega de turno: PRIMERO el evento (nunca se pierde), después el
          // cierre del pendiente, que puede fallar sin arrastrarlo (ver
          // `cerrarPendienteResuelto`). Un borrador todavía no cierra nada.
          void setDoc(ref, { ...nuevo, resuelvePendiente: datos.resuelvePendiente }).catch(avisarRechazo)
          if (!esBorradorAhora) void cerrarPendienteResuelto(datos.resuelvePendiente.id, id, destino.id, quien)
        } else {
          void setDoc(ref, nuevo).catch(avisarRechazo)
        }
      } else {
        // Al editar, quien edita queda aparte (`actualizadoPorNombre`); el autor
        // solo cambia si se corrigió a propósito (`datos.registradoPor`).
        // Las fotos van como CAMBIOS (arrayUnion/arrayRemove) y no como la lista
        // entera: si otro teléfono agregó la foto «Después» mientras este editaba
        // un texto, reescribir `fotos` completo la borraba (revisión 15-09).
        const antes = datos.fotosAntes ?? []
        // Las que ya están EN EL SERVIDOR (último snapshot), no las que vio este
        // teléfono: el tope de 8 se calculaba por dispositivo y dos que agregaban
        // a la vez dejaban el evento en 10 fotos, con la regla rechazando desde
        // ahí toda edición posterior (revisión 15-09).
        const vivo = eventosRef.current.find((e) => e.id === id)
        const vivas = vivo?.fotos ?? antes
        // Se PUBLICA un borrador que venía de «Resolver»: recién ahora se cierra
        // el pendiente original.
        if (!esBorradorAhora && vivo?.estado === 'borrador' && vivo.resuelvePendiente?.id) {
          void cerrarPendienteResuelto(vivo.resuelvePendiente.id, id, destino.id, quien)
        } else if (mueve && vivo?.estado !== 'borrador' && vivo?.resuelvePendiente?.id) {
          // Ya publicado y cerraba un pendiente: el pendiente dice dónde se resolvió.
          void reubicarCierre(vivo.resuelvePendiente.id, id, destino.id)
        }
        const quitadas = antes.filter((a) => !fotos.some((f) => f.path === a.path))
        const cupo = Math.max(0, MAX_FOTOS_EVENTO - vivas.length + quitadas.length)
        const nuevas = fotos.filter((f) => !vivas.some((a) => a.path === f.path))
        const agregadas = nuevas.slice(0, cupo)
        if (agregadas.length < nuevas.length && !(esBorradorAhora && Date.now() - ultimoAvisoBorrador.current < 30_000)) {
          if (esBorradorAhora) ultimoAvisoBorrador.current = Date.now()
          toast({
            title: `El evento ya llegó a ${MAX_FOTOS_EVENTO} fotos`,
            description: `Otro teléfono subió fotos mientras editabas: ${nuevas.length - agregadas.length} no se guardaron.`,
            variant: 'destructive',
          })
        }
        const { fotos: _todas, estado: _estado, dispositivo, ...sinFotos } = cuerpo
        void _todas
        void _estado
        // SOLO lo que cambió en esta pantalla: un guardado atrasado (en la cola
        // de un teléfono sin señal) que manda el documento entero devolvía a su
        // valor viejo lo que otro equipo cambió en el intertanto (revisión 16-09).
        const soloEstos = datos.camposCambiados
        const campos: Record<string, unknown> = soloEstos
          ? Object.fromEntries(Object.entries(sinFotos).filter(([k]) => soloEstos.includes(k)))
          : { ...sinFotos }
        const cambiaPendiente = !soloEstos || soloEstos.includes('pendiente')
        // Nada que escribir (abrir, mirar y cerrar): no se escribe. Si no, cada
        // «Cerrar» sin señal dejaba en cola una copia vieja del evento.
        if (esBorradorAhora && !Object.keys(campos).length && !agregadas.length && !quitadas.length && !datos.fijarAutor && !datos.registradoPor) return
        // Cambio de turno: el turno completo (id, fecha y banda) y sin la
        // ubicación a mano, que se medía desde el inicio del turno anterior.
        const cambioDeTurno = mueve ? { turnoId: destino.id, fechaTurno: destino.fecha, banda: destino.banda, posicionMin: null } : {}
        const lote = writeBatch(db)
        lote.update(ref, {
          ...campos,
          ...cambioDeTurno,
          dispositivo,
          // `estado` solo se escribe al PUBLICAR. Un autoguardado nunca manda
          // «borrador»: si llegaba tarde, despublicaba un evento que otro ya
          // había publicado (revisión 16-09; la regla también lo impide).
          ...(esBorradorAhora ? {} : { estado: 'listo' }),
          // Reabrir un pendiente ya cerrado tiene que BORRAR el cierre: si no,
          // la fila decía «Pendiente» y «Resuelto en…» a la vez y la entrega de
          // turno —que filtra por `!cierre`— nunca lo volvía a mostrar.
          ...(cambiaPendiente && datos.pendiente && datos.cierreAntes ? { cierre: null } : {}),
          // Un borrador propio todavía puede cambiar de autor; uno ajeno o
          // publicado deja constancia de quién lo tocó, y si además se corrigió
          // quién lo registró, van los dos.
          ...(datos.fijarAutor
            ? { registradoPor: quien }
            : { actualizadoPorNombre: quien, ...(datos.registradoPor ? { registradoPor: datos.registradoPor } : {}) }),
          updatedAt: serverTimestamp(),
        })
        if (agregadas.length) lote.update(ref, { fotos: arrayUnion(...agregadas) })
        if (quitadas.length) lote.update(ref, { fotos: arrayRemove(...quitadas) })
        void lote
          .commit()
          // Las quitadas se borran de Storage recién con el OK del servidor: si la
          // regla rechaza la edición, el evento vuelve con sus fotos intactas.
          .then(() => Promise.allSettled(quitadas.map((f) => borrarFotoOEncolar(f.path))))
          .catch(avisarRechazo)
      }
    },
    [turno, nombreAutor],
  )

  const borrar = useCallback(async (evento: EventoBitacora) => {
    // Mismo criterio que guardar: no esperar al servidor (ver arriba).
    const avisar = () =>
      toast({ title: 'No se pudo borrar el evento', description: 'Solo quien lo creó o un supervisor puede borrarlo.', variant: 'destructive' })
    // Las fotos se borran de Storage recién cuando el servidor ACEPTA el borrado:
    // si la regla lo rechaza (no es el autor ni supervisor), el evento vuelve con
    // sus fotos sanas en vez de con enlaces rotos (revisión 15-09).
    const borrarFotos = () => Promise.allSettled((evento.fotos ?? []).map((f) => borrarFotoOEncolar(f.path)))
    // Un BORRADOR de «Resolver» nunca cerró el pendiente: descartarlo no
    // puede reabrir nada (revisión 16-09).
    if (evento.resuelvePendiente?.id && evento.estado !== 'borrador') {
      // Borrar el evento que cerraba un pendiente lo vuelve a abrir, pero no en
      // un lote: si el pendiente ya no existía, el lote fallaba y el evento
      // quedaba IMPOSIBLE de borrar, con un aviso de permisos que mentía.
      const pendienteId = evento.resuelvePendiente.id
      void deleteDoc(doc(db, BITACORA_COLECCION, evento.id))
        .then(borrarFotos)
        .then(() => reabrirPendiente(pendienteId, evento.id))
        .catch(avisar)
    } else {
      void deleteDoc(doc(db, BITACORA_COLECCION, evento.id)).then(borrarFotos).catch(avisar)
    }
  }, [])

  /** Mueve un evento SIN HORA dentro del turno (flechas ▲▼). Sin await: queda en el teléfono si no hay señal. */
  // `null` devuelve el evento a su lugar por hora de registro: es lo que usa
  // «Deshacer» después de arrastrar (HIG «Drag and drop»).
  const mover = useCallback((id: string, posicionMin: number | null) => {
    void updateDoc(doc(db, BITACORA_COLECCION, id), { posicionMin, updatedAt: serverTimestamp() }).catch(() =>
      toast({ title: 'No se pudo mover el evento', description: 'Vuelve a intentarlo cuando haya señal.', variant: 'destructive' }),
    )
  }, [])

  /**
   * Marcar o quitar «Pendiente» desde el deslizamiento de la fila (17-09). Solo
   * ese campo (y quién lo tocó): reabrir un pendiente cerrado borra su cierre,
   * como en el editor.
   */
  const marcarPendiente = useCallback((evento: EventoBitacora, pendiente: boolean, quien: string) => {
    const nombre = quien.trim()
    void updateDoc(doc(db, BITACORA_COLECCION, evento.id), {
      pendiente,
      ...(pendiente && evento.cierre ? { cierre: null } : {}),
      ...(nombre ? { actualizadoPorNombre: nombre } : {}),
      updatedAt: serverTimestamp(),
    }).catch(() => {
      vibrar(VIBRA_ERROR)
      toast({ title: 'No se pudo cambiar el pendiente', description: 'Vuelve a intentarlo cuando haya señal.', variant: 'destructive' })
    })
  }, [])

  return { eventos, cargando, error, sincronizando, ultimaSync, cambiosPorSubir, novedad, nuevoId, guardar, borrar, mover, marcarPendiente }
}

/**
 * Pendientes ABIERTOS de turnos anteriores (entrega de turno), en vivo.
 * Consulta por igualdad (`plantId` + `pendiente == true`): sin índice compuesto
 * y con pocos documentos, porque cada pendiente sale de la consulta al cerrarse.
 */
export function usePendientesAnteriores(turno: TurnoMantencion) {
  const [abiertos, setAbiertos] = useState<EventoBitacora[]>([])

  useEffect(() => {
    const q = query(
      collection(db, BITACORA_COLECCION),
      where('plantId', '==', BITACORA_PLANTA.id),
      where('pendiente', '==', true),
    )
    const off = onSnapshot(
      q,
      (snap) => setAbiertos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventoBitacora)),
      () => {
        // Sin permiso o sin red: la entrega de turno es un extra, la bitácora sigue.
      },
    )
    return off
  }, [])

  const pendientes = useMemo(() => pendientesAnteriores(abiertos, turno), [abiertos, turno])

  /** «Ya no aplica»: cierra sin evento, con motivo. No cuenta como cerrado por Mantención. */
  const cerrarNoAplica = useCallback(
    async (pendiente: EventoBitacora, motivo: string, quien: string) => {
      if (!auth.currentUser) throw new Error('Hay que iniciar sesión para escribir en la bitácora.')
      const m = motivo.trim()
      if (!m) throw new Error('Escribe por qué ya no aplica.')
      // No pisar un cierre ajeno: si otro teléfono lo resolvió con un evento
      // mientras esta lista estaba vieja, quedaba un evento diciendo «cierra el
      // pendiente» y el original diciendo «ya no aplica» (revisión 15-09).
      try {
        const actual = await getDoc(doc(db, BITACORA_COLECCION, pendiente.id))
        const previo = actual.exists() ? (actual.data() as EventoBitacora).cierre : null
        if (previo?.tipo === 'resuelto') {
          throw new Error(`Ya lo resolvió ${previo.porNombre || 'otro turno'}. Actualiza la lista.`)
        }
      } catch (e) {
        // Un error de red no bloquea el cierre; uno de negocio (arriba) sí.
        if (e instanceof Error && e.message.startsWith('Ya lo resolvió')) throw e
      }
      void updateDoc(doc(db, BITACORA_COLECCION, pendiente.id), {
        pendiente: false,
        cierre: { tipo: 'no-aplica', turnoId: turno.id, porNombre: quien.trim() || 'Sin nombre', eventoId: null, motivo: m.slice(0, 300), en: serverTimestamp() },
        updatedAt: serverTimestamp(),
      }).catch(() => toast({ title: 'No se pudo cerrar el pendiente', variant: 'destructive' }))
    },
    [turno.id],
  )

  return { pendientes, cerrarNoAplica }
}

/**
 * Borradores sin publicar de turnos anteriores, en vivo. Consulta por igualdad
 * (`plantId` + `estado`): sin índice compuesto y con pocos documentos, porque
 * cada borrador sale de la consulta al publicarse o descartarse.
 */
export function useBorradoresAnteriores(turno: TurnoMantencion): EventoBitacora[] {
  const [crudos, setCrudos] = useState<EventoBitacora[]>([])
  useEffect(() => {
    const q = query(
      collection(db, BITACORA_COLECCION),
      where('plantId', '==', BITACORA_PLANTA.id),
      where('estado', '==', 'borrador'),
    )
    return onSnapshot(
      q,
      (snap) => setCrudos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventoBitacora)),
      () => {
        // Sin permiso o sin red: es un aviso extra, la bitácora sigue.
      },
    )
  }, [])
  return useMemo(() => borradoresAnteriores(crudos, turno), [crudos, turno])
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
  /** Técnicos presentes ajustados a mano; null = nadie los ajustó (manda el calendario). */
  presentes: string[] | null
}

/**
 * Observación general del turno (una nota por turno: estado de la planta,
 * entrega de turno…). Doc `bitacoraTurnos/{plantId}_{turnoId}`.
 */
export function useObservacionTurno(turno: TurnoMantencion) {
  const [obs, setObs] = useState<ObservacionTurno>({ texto: '', actualizadoPorNombre: null, presentes: null })
  const user = useAuthStore((s) => s.user)
  const docId = `${BITACORA_PLANTA.id}_${turno.id}`

  useEffect(() => {
    setObs({ texto: '', actualizadoPorNombre: null, presentes: null })
    const off = onSnapshot(
      doc(db, BITACORA_TURNOS_COLECCION, docId),
      (snap) => {
        const d = snap.data()
        setObs({
          texto: typeof d?.observacion === 'string' ? d.observacion : '',
          actualizadoPorNombre: typeof d?.actualizadoPorNombre === 'string' ? d.actualizadoPorNombre : null,
          presentes: Array.isArray(d?.presentes) ? d.presentes.filter((x: unknown): x is string => typeof x === 'string') : null,
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
        user?.paseBitacora?.nombre ||
        quien.trim() ||
        [user?.nombre?.split(' ')[0], user?.apellido?.split(' ')[0]].filter(Boolean).join(' ') ||
        u.displayName ||
        'Sin nombre'
      // Sin await, igual que los eventos: queda en el teléfono si no hay señal.
      // merge: el mismo doc guarda también los técnicos presentes.
      void setDoc(
        doc(db, BITACORA_TURNOS_COLECCION, docId),
        {
          plantId: BITACORA_PLANTA.id,
          turnoId: turno.id,
          observacion: texto.trim(),
          actualizadoPor: u.uid,
          actualizadoPorNombre: nombre,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => toast({ title: 'La observación no se guardó en el servidor', variant: 'destructive' }))
    },
    [docId, turno.id, user],
  )

  /** Guarda quiénes están realmente en el turno (reemplaza lo que dice el calendario). */
  const guardarPresentes = useCallback(
    async (presentes: string[]) => {
      const u = auth.currentUser
      if (!u) throw new Error('Hay que iniciar sesión para escribir en la bitácora.')
      void setDoc(
        doc(db, BITACORA_TURNOS_COLECCION, docId),
        {
          plantId: BITACORA_PLANTA.id,
          turnoId: turno.id,
          presentes: presentes.slice(0, 30),
          actualizadoPor: u.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => toast({ title: 'Los técnicos del turno no se guardaron en el servidor', variant: 'destructive' }))
    },
    [docId, turno.id],
  )

  return { observacion: obs, guardarObservacion, guardarPresentes }
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
  useAjustes: () => ReturnType<typeof useAjustesTecnicos>
  usePendientesAnteriores: (turno: TurnoMantencion) => ReturnType<typeof usePendientesAnteriores>
  useOpcionesEquipo: (activo: boolean) => ReturnType<typeof useOpcionesEquipo>
  usePresencia: typeof usePresenciaBitacora
  useBorradoresAnteriores: (turno: TurnoMantencion) => EventoBitacora[]
  /** Reemplaza la subida a Storage. */
  subirFoto?: typeof subirFotoBitacora
  /** Reemplaza las lecturas del maestro de repuestos. */
  repuestos?: FuenteRepuestos
}

export const FUENTE_FIRESTORE: FuenteBitacora = {
  useEventos: useBitacoraTurno,
  useTecnicos: useTecnicosDeTurno,
  useObservacion: useObservacionTurno,
  useAjustes: useAjustesTecnicos,
  usePendientesAnteriores,
  useOpcionesEquipo,
  usePresencia: usePresenciaBitacora,
  useBorradoresAnteriores,
}