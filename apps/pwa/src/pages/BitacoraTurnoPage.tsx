import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, FileSpreadsheet, Images, Loader2, MessageCircle, NotebookPen, Pencil, Plus, QrCode, Share, Trash2 } from 'lucide-react'
import { Button, ListCell, ListGroup, Pill, SegmentedControl, Sheet, Tag, type SwipeAction } from '@/components/piel'
import { ToastAction } from '@/components/ui/toast'
import { vibrar } from '@/services/bitacora/vibrar'
import { PASO_MENSAJE, PasosWhatsapp, VistaPreviaWhatsapp } from '@/components/bitacora/PanelWhatsapp'
import { compartirEnWhatsapp, compartirLaminas, compartirMensaje, envioEnDosPasos, puedeCompartirArchivos } from '@/services/bitacora/compartirWhatsapp'
import { useLaminasWhatsapp } from '@/hooks/useLaminasWhatsapp'
import { AccesoQrSheet } from '@/components/bitacora/AccesoQrSheet'
import { CompartirTurnoSheet } from '@/components/bitacora/CompartirTurnoSheet'
import { EVENTO_NUEVO_EVENTO } from '@/services/bitacora/pedirNuevoEvento'
import { FUENTE_ACCESO_QR, type FuenteAccesoQr } from '@/hooks/useAccesoQrBitacora'
import { apiPaseReal, type ApiPase } from '@/services/bitacora/paseBitacora'
import { bitacoraATextoWhatsapp, planLaminas } from '@/services/bitacora/bitacoraWhatsapp'
import { EventoBitacoraFila } from '@/components/bitacora/EventoBitacoraFila'
import { BarraSincronizacion } from '@/components/bitacora/BarraSincronizacion'
import { EventoBitacoraSheet } from '@/components/bitacora/EventoBitacoraSheet'
import { VisorFotosBitacora } from '@/components/bitacora/VisorFotosBitacora'
import { SelectorTecnico } from '@/components/bitacora/SelectorTecnico'
import { ListaTecnicosSheet, TecnicosDelTurnoSheet } from '@/components/bitacora/TecnicosTurnoSheets'
import { construirListaTecnicos, sugeridosPorCalendario, tecnicosPresentes } from '@/services/bitacora/listaTecnicos'
import { OPCIONES_TAMANO, esTamanoLetra } from '@/services/bitacora/tamanoLetra'
import { useTamanoLetraBitacora } from '@/hooks/useTamanoLetraBitacora'
import { etiquetaCortaTurno, origenDePendiente } from '@/services/bitacora/entregaTurno'
import { tecnicoRecordado } from '@/components/bitacora/tecnicoRecordado'
import { useToast } from '@/hooks/useToast'
import { FUENTE_FIRESTORE, useTurnoMantencionActual, type FuenteBitacora } from '@/hooks/useBitacoraTurno'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { PanelInspeccion } from '@/components/bitacora/PanelInspeccion'
import { useInspeccion } from '@/hooks/useInspeccion'
import { anotarCriterio, fijarHoraCriterio, iniciarInspeccion, liberarPlanta, marcarCriterio } from '@/services/inspecciones/inspecciones.service'
import { TEXTO_AVISO as TEXTO_AVISO_INSPECCION, TEXTO_LIBERACION, avisoDeInspeccion, frasePorLiberacion } from '@/services/inspecciones/modeloInspeccion'
import { inspeccionAHtmlCorreo, inspeccionATextoPlano, tituloCorreoInspeccion } from '@/services/inspecciones/inspeccionCorreo'
import { encabezadoEvento, etiquetaTipo, posicionAlMover, posicionEnIndice, tieneHora, tiposPropiosUsados, tituloDe } from '@/services/bitacora/presentacionEvento'
import { copiarHtml, copiarTexto } from '@/lib/clipboard'
import type { EnlaceInspeccion, EventoBitacora, FotoEvento, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import type { User } from '@/types'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano, tituloCorreo } from '@/services/bitacora/bitacoraCorreo'
import { cargarFotoComoJpeg, purgarFotosPendientes } from '@/services/bitacora/fotosBitacora'
import { fuePendiente, gruposDelTurno, resumirBitacora } from '@/services/bitacora/resumenBitacora'
import { filasRecoleccion, generarExcelRecoleccion, htmlRecoleccionMttr, nombreExcelRecoleccion } from '@/services/bitacora/recoleccionMttr'
import { MINUTOS_SIN_PRODUCCION_POR_TURNO, explicacionMtbfMttr, minutosDelTurno, minutosOperando, mtbfDelTurno } from '@/services/bitacora/mtbf'
import { esBorrador, soloListos } from '@/services/bitacora/borradores'
import { iniciales, nombreEnPresencia as nombrePresencia, otrosEditando } from '@/services/bitacora/presencia'
import { dispositivoActual } from '@/services/bitacora/dispositivo'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/store'
import type { TagTone } from '@/components/piel'
import {
  etiquetaTurno,
  fechaTurnoLarga,
  formatoMinutos,
  horarioTurno,
  minutosDesdeInicioTurno,
  turnoAdyacente,
  turnoDesdeId,
  turnoEnCurso,
} from '@/services/bitacora/turnoMantencion'

/**
 * Bitácora de turno de Mantención.
 *
 * Móvil: se registra durante el turno (acción principal = Nuevo evento).
 * PC: se revisa lo que llegó del celular y se copia al correo (acción
 * principal = Copiar para correo), con la vista previa EXACTA de lo que se va
 * a pegar: se genera con la misma función que llena el portapapeles.
 */
export function BitacoraTurnoPage() {
  return <BitacoraTurnoVista fuente={FUENTE_FIRESTORE} />
}

export function BitacoraTurnoVista({
  fuente,
  fuenteQr = FUENTE_ACCESO_QR,
  apiPase = apiPaseReal,
  usuarioSimulado,
}: {
  fuente: FuenteBitacora
  /** La vitrina los reemplaza por datos de ejemplo. */
  fuenteQr?: FuenteAccesoQr
  apiPase?: ApiPase
  /** Solo la vitrina: ver la página como otro usuario (p. ej. un pase) sin tocar la sesión. */
  usuarioSimulado?: User | null
}) {
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const turnoActual = useTurnoMantencionActual()
  const turnoParam = params.get('turno')
  const [editor, setEditor] = useState<{ evento: EventoBitacora | null; idNuevo: string; turno: TurnoMantencion; pendienteOrigen?: EventoBitacora | null; desdeInspeccion?: EnlaceInspeccion; descripcionInicial?: string } | null>(null)
  // Pestaña: el turno o la inspección de planta (Orel, 20-09-2026).
  const [vista, setVista] = useState<'turno' | 'inspeccion'>(() => (params.get('vista') === 'inspeccion' ? 'inspeccion' : 'turno'))
  // La jerarquía (702 nodos) se carga recién al abrir el editor, y queda en caché.
  const { opciones: opcionesEquipo, cargando: cargandoEquipos } = fuente.useOpcionesEquipo(Boolean(editor))
  const turnoNavegado = useMemo(() => turnoDesdeId(turnoParam) ?? turnoActual, [turnoParam, turnoActual])
  // Con el editor abierto el turno queda CONGELADO: si el reloj cruza las
  // 16:00 a mitad de escribir, el formulario no se borra y el evento se guarda
  // en el turno donde se empezó a registrar.
  const turno = editor?.turno ?? turnoNavegado
  const esActual = turno.id === turnoActual.id

  // Eventos borrados que esperan el plazo de «Deshacer»: no se ven ni cuentan.
  const [ocultos, setOcultos] = useState<ReadonlySet<string>>(() => new Set())
  const {
    eventos: eventosServidor,
    cargando,
    error,
    ultimaSync,
    cambiosPorSubir,
    novedad,
    recienLlegados,
    marcarVisto,
    nuevoId,
    guardar,
    borrar,
    mover,
    marcarPendiente,
  } = fuente.useEventos(turno)
  const eventos = useMemo(
    () => (ocultos.size ? eventosServidor.filter((e) => !ocultos.has(e.id)) : eventosServidor),
    [eventosServidor, ocultos],
  )
  const calendario = fuente.useTecnicos(turno)
  const { observacion, guardarObservacion, guardarPresentes } = fuente.useObservacion(turno)
  const { ajustes, guardarAjustes } = fuente.useAjustes()
  const favoritosRepuestos = fuente.useFavoritosRepuestos()
  const letra = useTamanoLetraBitacora()
  // Lista de técnicos = planilla del calendario + ajustes; presentes = ajuste del
  // turno o, si nadie lo tocó, lo que dice el calendario.
  const listaTecnicos = useMemo(() => construirListaTecnicos(calendario.todos, ajustes), [calendario.todos, ajustes])
  const presentes = useMemo(
    () => tecnicosPresentes(observacion.presentes, calendario.deTurno, listaTecnicos),
    [observacion.presentes, calendario.deTurno, listaTecnicos],
  )
  const deTurnoCalendario = useMemo(() => sugeridosPorCalendario(calendario.deTurno, listaTecnicos), [calendario.deTurno, listaTecnicos])
  const tecnicos = useMemo(
    () => ({ deTurno: presentes.nombres, todos: listaTecnicos.map((t) => t.nombre) }),
    [presentes.nombres, listaTecnicos],
  )
  const [hojaTecnicos, setHojaTecnicos] = useState<null | 'presentes' | 'lista'>(null)
  // Borrador de «Técnicos del turno»: se toma al tocar Editar y sobrevive a ir y volver de la lista.
  const [borradorPresentes, setBorradorPresentes] = useState<string[]>([])
  // Nombre recordado en el teléfono, solo si sigue en la lista (pudo corregirse o quitarse).
  const nombreRecordadoValido = () => {
    const recordado = tecnicoRecordado()
    return tecnicos.todos.length === 0 || tecnicos.todos.includes(recordado) ? recordado : ''
  }
  const r = useMemo(() => resumirBitacora(eventos), [eventos])
  const fotosPublicadas = useMemo(() => soloListos(eventos).reduce((n, e) => n + (e.fotos?.length ?? 0), 0), [eventos])
  // Como en WhatsApp y el correo (ronda 28, 17-09): lo hecho numerado desde 1,
  // los borradores al final sin número (aún no son un hecho del turno) y lo
  // pendiente en su propia sección, con la numeración que sigue.
  const borradores = useMemo(() => eventos.filter(esBorrador), [eventos])
  const grupos = useMemo(() => gruposDelTurno(turno, eventos), [turno, eventos])
  const numeroDe = useMemo(() => {
    const m = new Map<string, number>()
    ;[...grupos.hechos, ...grupos.pendientes].forEach((e, i) => m.set(e.id, i + 1))
    return m
  }, [grupos])
  /** El grupo donde vive un evento publicado: ahí se mueve y se arrastra. */
  const grupoDe = (e: EventoBitacora) => (fuePendiente(e) ? grupos.pendientes : grupos.hechos)

  // ── Arrastrar un evento sin hora entre los demás (mockup iOS 27, 17-09) ──
  const listaRef = useRef<HTMLDivElement>(null)
  const listaPendientesRef = useRef<HTMLDivElement>(null)
  const [arrastre, setArrastre] = useState<{
    id: string
    y0: number
    dy: number
    /** Centro de la fila al empezar, relativo a la lista. */
    centro: number
    origen: number
    otros: { top: number; bottom: number }[]
    destino: number
  } | null>(null)
  const arrastreRef = useRef(arrastre)
  arrastreRef.current = arrastre

  // Presencia: quién tiene esta bitácora abierta y qué evento está escribiendo.
  const usuarioSesion = useAuthStore((s) => s.user)
  const usuario = usuarioSimulado === undefined ? usuarioSesion : usuarioSimulado
  /**
   * Teléfono con pase de bitácora (QR + PIN): el técnico es el dueño del pase,
   * sin elegir de la lista. Las reglas exigen firmar con ese nombre.
   */
  const autorFijo = usuario?.paseBitacora?.nombre ?? null
  const esSupervisor = usuario?.rol === 'admin' || usuario?.rol === 'supervisor'
  const [hojaQr, setHojaQr] = useState(false)
  const accesoQr = fuenteQr.useAccesoQr(BITACORA_PLANTA.id, hojaQr && esSupervisor)
  const editandoEventoId = editor ? (editor.evento?.id ?? editor.idNuevo) : null
  // Cuenta personal → su nombre; compartida → «PC de Mantención» en el PC y el
  // técnico elegido en el celular (el último elegido en un PC que usan todos
  // no es quien está sentado ahora).
  const nombreEnPresencia =
    autorFijo ??
    nombrePresencia({
      correo: auth.currentUser?.email ?? usuario?.email,
      nombreCuenta: [usuario?.nombre?.split(' ')[0], usuario?.apellido?.split(' ')[0]].filter(Boolean).join(' '),
      recordado: tecnicoRecordado(),
      dispositivo: dispositivoActual(),
    })
  const { presentes: conectados, miDispositivoId } = fuente.usePresencia(turno, { nombre: nombreEnPresencia, editandoEventoId })
  // Color estable por técnico: su posición en la lista (no un hash del nombre).
  const tonoDe = useCallback(
    (nombre: string): TagTone => {
      const i = listaTecnicos.findIndex((t) => t.nombre === nombre)
      return i < 0 ? 'neutral' : ((((i % 8) + 8) % 8) + 1) as TagTone
    },
    [listaTecnicos],
  )
  const hayEventoConId = useCallback((id: string) => eventos.some((e) => e.id === id), [eventos])

  const [trabajando, setTrabajando] = useState<null | 'copiar' | 'copiar-incrustadas' | 'pdf' | 'excel'>(null)
  const [editandoObs, setEditandoObs] = useState(false)
  const [textoObs, setTextoObs] = useState('')
  const [quienObs, setQuienObs] = useState('')
  const [visor, setVisor] = useState<{ fotos: FotoEvento[]; indice: number; titulo: string } | null>(null)
  /** Columna derecha del PC: la vista previa del correo o el envío por WhatsApp. */
  const [vistaEnvio, setVistaEnvio] = useState<'correo' | 'whatsapp'>('correo')
  /** Hoja de WhatsApp del celular. */
  const [hojaWhatsapp, setHojaWhatsapp] = useState(false)
  const [hojaCompartir, setHojaCompartir] = useState(false)
  /** El título grande salió de la pantalla: se muestra la barra compacta (iOS 27). */
  const [compacta, setCompacta] = useState(false)
  const cabeceraRef = useRef<HTMLElement>(null)
  /** Láminas ya copiadas (por clave) y el texto exacto que se copió como mensaje. */
  const [laminasCopiadas, setLaminasCopiadas] = useState<ReadonlySet<string>>(new Set())
  const [mensajeCopiado, setMensajeCopiado] = useState<string | null>(null)
  const [compartiendo, setCompartiendo] = useState(false)
  /** Envío en dos pasos (mensaje largo): ya salió el mensaje, faltan las láminas. */
  const [mensajeEnviado, setMensajeEnviado] = useState(false)
  // Entrega de turno: pendientes abiertos de turnos anteriores.
  const { pendientes: pendientesPrevios, cerrarNoAplica } = fuente.usePendientesAnteriores(turno)
  // Borradores que nadie publicó antes del cambio de turno: solo en el turno EN CURSO.
  const borradoresPrevios = fuente.useBorradoresAnteriores(turno)
  const [descartandoId, setDescartandoId] = useState<string | null>(null)
  const [noAplica, setNoAplica] = useState<EventoBitacora | null>(null)
  const [motivoNoAplica, setMotivoNoAplica] = useState('')
  const [quienNoAplica, setQuienNoAplica] = useState('')

  const abrirNuevo = useCallback(() => setEditor({ evento: null, idNuevo: nuevoId(), turno }), [nuevoId, turno])

  // ── Inspección de planta post-aseo ──
  const { pauta, cambioLaPauta, inspeccion, desviaciones, resumen: resumenInsp } = useInspeccion(BITACORA_PLANTA.id, turno.id, eventos)
  const avisoInsp = useMemo(() => avisoDeInspeccion(turno.fecha, inspeccion, resumenInsp), [turno.fecha, inspeccion, resumenInsp])
  /**
   * Lo que CIERRA una inspección es la entrega, no el borde del turno.
   *
   * Estaba atada a `esActual` y el recorrido empieza a las 04:00 con el turno cerrando a las
   * 08:00: al día siguiente el aviso decía «quedó a medias» y no dejaba terminarla — invitaba
   * a algo imposible (Orel, 21-09-2026). Los eventos del mismo turno tampoco se bloquean al
   * cerrarse, así que la inspección era MÁS estricta que la bitácora donde vive.
   *
   * Una vez liberada queda fija: ahí el panel solo ofrece deshacer la entrega.
   */
  const puedeEditarInspeccion = true
  const [inspTrabajando, setInspTrabajando] = useState(false)
  /** El correo de la inspección se arma igual que el del turno: mismos bloques, mismo estilo. */
  const datosCorreoInsp = useMemo(
    () =>
      inspeccion
        ? { inspeccion, pauta, resumen: resumenInsp, desviaciones, turno, planta: BITACORA_PLANTA.nombre }
        : null,
    [inspeccion, pauta, resumenInsp, desviaciones, turno],
  )
  const htmlCorreoInsp = useMemo(() => (datosCorreoInsp ? inspeccionAHtmlCorreo(datosCorreoInsp) : ''), [datosCorreoInsp])
  const fotosInsp = useMemo(() => desviaciones.reduce((n, e) => n + (e.fotos?.length ?? 0), 0), [desviaciones])
  /** El nombre con que se firma: el mismo que la bitácora usa para el autor. */
  const firmante = autorFijo || [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ').trim() || usuario?.email || 'Mantención'

  const conAviso = useCallback(
    async (hacer: () => Promise<void>) => {
      setInspTrabajando(true)
      try {
        await hacer()
      } catch (e) {
        // «Revisa la conexión» manda por el camino equivocado cuando en realidad faltan permisos.
        const sinPermiso = (e as { code?: string })?.code === 'permission-denied'
        toast({
          title: 'No se pudo guardar la inspección',
          description: sinPermiso ? 'Tu cuenta no puede escribir la inspección de este turno.' : 'Revisa la conexión e inténtalo de nuevo.',
          variant: 'destructive',
        })
      } finally {
        setInspTrabajando(false)
      }
    },
    [toast],
  )

  /**
   * §9 del procedimiento: «Informar al supervisor». No se inventa un canal — es el mismo
   * `navigator.share` con que ya sale la bitácora, y el texto se arma con lo que quedó
   * registrado, no con lo que alguien recuerde.
   */
  const avisarDeLaLiberacion = useCallback(async () => {
    const l = inspeccion?.liberacion
    if (!l) return
    const lineas = [
      `*${pauta.nombre}*`,
      `${BITACORA_PLANTA.nombre} · ${etiquetaCortaTurno(turno.id)} · ${turno.fecha}`,
      '',
      `*${TEXTO_LIBERACION[l.estado].titulo}* — ${frasePorLiberacion(l.estado, resumenInsp)}`,
      `${resumenInsp.revisados} de ${resumenInsp.total} puntos revisados${resumenInsp.minutosDeRecorrido != null ? ` en ${resumenInsp.minutosDeRecorrido} min` : ''}.`,
    ]
    if (resumenInsp.pendientesCriticos > 0) {
      const n = resumenInsp.pendientesCriticos
      // Sin emoji: la piel nueva usa Lucide, no signos (`audit-piel`).
      lineas.push(`*Atención:* ${n} ${n === 1 ? 'desviación abierta detiene' : 'desviaciones abiertas detienen'} una línea.`)
    }
    const abiertas = desviaciones.filter((d) => d.pendiente && !d.cierre)
    if (abiertas.length) {
      lineas.push('', '*Queda abierto:*', ...abiertas.map((d) => `• ${d.equipo || 'Sin equipo'} — ${d.descripcion}`))
    }
    lineas.push('', `Liberada ${new Date(l.en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })} · ${l.porNombre}`)
    try {
      await compartirMensaje(lineas.join('\n'))
    } catch {
      toast({ title: 'No se pudo compartir', description: 'Copia el texto a mano desde la pantalla.', variant: 'destructive' })
    }
  }, [inspeccion?.liberacion, pauta.nombre, turno, resumenInsp, desviaciones, toast])

  const copiarInspeccionParaCorreo = useCallback(async () => {
    if (!datosCorreoInsp) return
    try {
      await copiarHtml(htmlCorreoInsp, inspeccionATextoPlano(datosCorreoInsp))
      toast({ title: 'Copiado', description: 'Pégalo en el correo con Ctrl+V.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles. Prueba de nuevo.', variant: 'destructive' })
    }
  }, [datosCorreoInsp, htmlCorreoInsp, toast])

  /**
   * Igual que en el turno: para Outlook nuevo/web las fotos van DENTRO del HTML (JPEG a
   * 600 px). Outlook clásico trunca las base64, por eso no es la opción por defecto.
   */
  const copiarInspeccionConFotos = useCallback(async () => {
    if (!datosCorreoInsp) return
    setInspTrabajando(true)
    try {
      const urls = [...new Set(desviaciones.flatMap((e) => (e.fotos ?? []).map((f) => f.url)))]
      const mapa = new Map<string, string>()
      await Promise.all(
        urls.map(async (u) => {
          try {
            mapa.set(u, (await cargarFotoComoJpeg(u, 600, 0.78)).dataUrl)
          } catch {
            /* esa foto queda por URL */
          }
        }),
      )
      await copiarHtml(
        inspeccionAHtmlCorreo({ ...datosCorreoInsp, fuenteFoto: (f) => mapa.get(f.url) ?? f.url }),
        inspeccionATextoPlano(datosCorreoInsp),
      )
      toast({ title: 'Copiado con fotos incrustadas', description: 'Pensado para Outlook nuevo o web.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' })
    } finally {
      setInspTrabajando(false)
    }
  }, [datosCorreoInsp, desviaciones, toast])

  const iniciarLaInspeccion = useCallback(
    () =>
      void conAviso(() =>
        iniciarInspeccion({
          plantId: BITACORA_PLANTA.id,
          turnoId: turno.id,
          fechaTurno: turno.fecha,
          banda: turno.banda,
          pautaId: pauta.id,
          pautaVersion: pauta.version,
          iniciadaEn: new Date().toISOString(),
          iniciadaPorNombre: firmante,
        }),
      ),
    [conAviso, turno, pauta, firmante],
  )

  // ── Borrar con «Deshacer» (mockup iOS 27, 17-09) ──
  // El evento se esconde y el borrado de verdad (fotos incluidas) ocurre al
  // terminar el plazo, o antes si se sale de la pantalla.
  const porBorrar = useRef(new Map<string, { evento: EventoBitacora; timer: ReturnType<typeof setTimeout> }>())
  const borrarRef = useRef(borrar)
  borrarRef.current = borrar
  const quitarOculto = useCallback(
    (id: string) =>
      setOcultos((s) => {
        if (!s.has(id)) return s
        const n = new Set(s)
        n.delete(id)
        return n
      }),
    [],
  )
  const ejecutarBorrado = useCallback(
    (id: string) => {
      const p = porBorrar.current.get(id)
      if (!p) return
      clearTimeout(p.timer)
      porBorrar.current.delete(id)
      void borrarRef.current(p.evento)
      quitarOculto(id)
    },
    [quitarOculto],
  )
  const deshacerBorrado = useCallback(
    (id: string) => {
      const p = porBorrar.current.get(id)
      if (!p) return
      clearTimeout(p.timer)
      porBorrar.current.delete(id)
      quitarOculto(id)
    },
    [quitarOculto],
  )
  const borrarConDeshacer = useCallback(
    async (evento: EventoBitacora) => {
      vibrar()
      setEditor(null)
      setOcultos((s) => new Set(s).add(evento.id))
      const timer = setTimeout(() => ejecutarBorrado(evento.id), PLAZO_DESHACER_MS)
      porBorrar.current.set(evento.id, { evento, timer })
      toast({
        title: esBorrador(evento) ? 'Borrador descartado' : 'Evento borrado',
        description: tituloDe(evento) || evento.equipo?.trim() || undefined,
        duration: PLAZO_DESHACER_MS,
        action: (
          <ToastAction altText="Deshacer el borrado" onClick={() => deshacerBorrado(evento.id)}>
            Deshacer
          </ToastAction>
        ),
      })
    },
    [ejecutarBorrado, deshacerBorrado, toast],
  )
  useEffect(() => {
    const pendientes = porBorrar.current
    const vaciar = () => [...pendientes.keys()].forEach(ejecutarBorrado)
    window.addEventListener('pagehide', vaciar)
    return () => {
      window.removeEventListener('pagehide', vaciar)
      vaciar()
    }
  }, [ejecutarBorrado])

  // Fotos que quedaron sin dueño y no se pudieron borrar (la señal de planta se
  // cae a cada rato): se reintenta al abrir la bitácora y cuando vuelve la red.
  // Si no, cada falla dejaba un archivo pagándose para siempre.
  useEffect(() => {
    void purgarFotosPendientes()
    const alVolver = () => void purgarFotosPendientes()
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [])

  // El «+» de la barra de pestañas abre «Nuevo evento» aquí (17-09).
  useEffect(() => {
    const abrir = () => abrirNuevo()
    window.addEventListener(EVENTO_NUEVO_EVENTO, abrir)
    return () => window.removeEventListener(EVENTO_NUEVO_EVENTO, abrir)
  }, [abrirNuevo])

  // Barra compacta: aparece cuando el título grande deja de verse.
  useEffect(() => {
    const el = cabeceraRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver((entradas) => setCompacta(entradas[0] ? !entradas[0].isIntersecting : false), { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // `?nuevo=1` (desde la tarjeta del Inicio) abre el editor UNA vez y se quita
  // de la URL. Un solo efecto es dueño de ese parámetro.
  useEffect(() => {
    if (params.get('nuevo') !== '1') return
    abrirNuevo()
    const p = new URLSearchParams(params)
    p.delete('nuevo')
    setParams(p, { replace: true })
  }, [params, setParams, abrirNuevo])

  const irATurno = (paso: -1 | 1) => {
    const destino = turnoAdyacente(turno, paso)
    const p = new URLSearchParams(params)
    if (destino.id === turnoActual.id) p.delete('turno')
    else p.set('turno', destino.id)
    setParams(p)
  }
  const verTurno = (id: string) => {
    const p = new URLSearchParams(params)
    if (id === turnoActual.id) p.delete('turno')
    else p.set('turno', id)
    setParams(p)
  }

  const irAlActual = () => {
    const p = new URLSearchParams(params)
    p.delete('turno')
    setParams(p)
  }

  const datosCorreo = useMemo(
    () => ({
      turno,
      eventos,
      tecnicos: presentes.nombres,
      planta: BITACORA_PLANTA.nombre,
      observacion: observacion.texto,
      // Solo en el turno EN CURSO: para uno pasado, «sigue pendiente» listaba
      // los pendientes abiertos HOY, una entrega de turno que nunca ocurrió.
      pendientesAnteriores: esActual ? pendientesPrevios : [],
    }),
    [turno, eventos, presentes.nombres, observacion.texto, pendientesPrevios, esActual],
  )
  const htmlCorreo = useMemo(() => bitacoraAHtmlCorreo(datosCorreo), [datosCorreo])
  // La planilla «Recoleccion MTTR» que va arriba del correo, llenándose en vivo (17-09-2026).
  const filasMttr = useMemo(() => filasRecoleccion(turno, eventos), [turno, eventos])
  const htmlMttr = useMemo(() => htmlRecoleccionMttr(filasMttr), [filasMttr])
  const asunto = tituloCorreo(turno)

  // ── WhatsApp (mockup aprobado 16-09-2026): mensaje + una lámina por evento con fotos ──
  const planWhatsapp = useMemo(() => planLaminas(datosCorreo), [datosCorreo])
  const textoWhatsapp = useMemo(() => bitacoraATextoWhatsapp(datosCorreo, planWhatsapp), [datosCorreo, planWhatsapp])
  const laminas = useLaminasWhatsapp(planWhatsapp, vistaEnvio === 'whatsapp' || hojaWhatsapp)
  // «Copiado» vale para ESE texto: si llega un evento nuevo, el mensaje hay que copiarlo otra vez.
  const pasosCopiados = useMemo(
    () => new Set([...laminasCopiadas, ...(mensajeCopiado === textoWhatsapp ? [PASO_MENSAJE] : [])]),
    [laminasCopiadas, mensajeCopiado, textoWhatsapp],
  )
  const marcarCopiado = useCallback(
    (paso: string) => {
      if (paso === PASO_MENSAJE) setMensajeCopiado(textoWhatsapp)
      else setLaminasCopiadas((prev) => new Set([...prev, paso]))
    },
    [textoWhatsapp],
  )
  useEffect(() => {
    setLaminasCopiadas(new Set())
    setMensajeCopiado(null)
  }, [turno.id])
  const compartirConMenu = useMemo(() => puedeCompartirArchivos(), [])
  const avisoBorradores = borradores.length
    ? ` ${borradores.length === 1 ? '1 evento en redacción no va' : `${borradores.length} eventos en redacción no van`}.`
    : ''

  const dosPasos = envioEnDosPasos(textoWhatsapp, planWhatsapp.length)
  // Cada vez que se abre la hoja (u otro turno), el envío parte del paso 1.
  useEffect(() => {
    if (hojaWhatsapp) setMensajeEnviado(false)
  }, [hojaWhatsapp, turno.id])

  const compartir = async () => {
    setCompartiendo(true)
    try {
      // Mensaje largo: primero el texto solo (llega entero); con otro toque, las láminas.
      if (dosPasos && !mensajeEnviado) {
        const r = await compartirMensaje(textoWhatsapp)
        if (r === 'enviado') {
          marcarCopiado(PASO_MENSAJE)
          setMensajeEnviado(true)
        }
        return
      }
      const r = dosPasos ? await compartirLaminas(turno, laminas.listas) : await compartirEnWhatsapp(turno, textoWhatsapp, laminas.listas)
      if (r === 'enviado') {
        setMensajeEnviado(false)
        marcarCopiado(PASO_MENSAJE)
        setLaminasCopiadas(new Set(laminas.listas.map((g) => g.lamina.clave)))
        setHojaWhatsapp(false)
      }
    } catch {
      toast({
        title: 'No se pudo abrir el menú de compartir',
        description: 'El mensaje quedó copiado. Copia las láminas una por una desde esta hoja.',
        variant: 'destructive',
      })
    } finally {
      setCompartiendo(false)
    }
  }

  const copiarAsunto = async () => {
    try {
      await copiarTexto(asunto)
      toast({ title: 'Asunto copiado', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar el asunto', variant: 'destructive' })
    }
  }

  const copiar = async () => {
    setTrabajando('copiar')
    try {
      await copiarHtml(htmlCorreo, bitacoraATextoPlano(datosCorreo))
      toast({
        title: 'Copiado',
        description: borradores.length
          ? `Pégalo con Ctrl+V. ${borradores.length === 1 ? '1 evento en redacción no va' : `${borradores.length} eventos en redacción no van`} en el correo.`
          : 'Pégalo en el correo con Ctrl+V.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles. Prueba de nuevo o usa el PDF.', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  /**
   * Variante para Outlook nuevo / web: las fotos van dentro del HTML (JPEG a
   * 600 px). Outlook clásico trunca las imágenes base64, por eso NO es la
   * opción por defecto.
   */
  const copiarIncrustadas = async () => {
    setTrabajando('copiar-incrustadas')
    try {
      const urls = [...new Set(soloListos(eventos).flatMap((e) => (e.fotos ?? []).map((f) => f.url)))]
      const mapa = new Map<string, string>()
      await Promise.all(
        urls.map(async (u) => {
          try {
            mapa.set(u, (await cargarFotoComoJpeg(u, 600, 0.78)).dataUrl)
          } catch {
            /* esa foto queda por URL */
          }
        }),
      )
      const html = bitacoraAHtmlCorreo({ ...datosCorreo, fuenteFoto: (f) => mapa.get(f.url) ?? f.url })
      await copiarHtml(html, bitacoraATextoPlano(datosCorreo))
      toast({ title: 'Copiado con fotos incrustadas', description: 'Pensado para Outlook nuevo o web.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  const exportarPdf = async () => {
    setTrabajando('pdf')
    try {
      const { generarPdfBitacora } = await import('@/services/bitacora/bitacoraPdf')
      const { fotosFallidas, via } = await generarPdfBitacora(datosCorreo)
      if (via === 'cancelado') return
      toast({
        title: via === 'compartido' ? 'PDF listo para enviar' : 'PDF descargado',
        description: fotosFallidas ? `${fotosFallidas} foto(s) no se pudieron incluir.` : undefined,
        variant: fotosFallidas ? 'default' : 'success',
      })
    } catch {
      toast({ title: 'No se pudo generar el PDF', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  const bajarExcel = async () => {
    setTrabajando('excel')
    try {
      // HIG «Activity views»: en el celular abre la hoja de compartir (Outlook,
      // WhatsApp), no una descarga que hay que ir a buscar a la carpeta Descargas.
      const via = await generarExcelRecoleccion(filasMttr, nombreExcelRecoleccion(turno))
      if (via === 'cancelado') return
      toast({
        title: via === 'compartido' ? 'Excel listo para enviar' : 'Excel descargado',
        description: 'La planilla «Recoleccion MTTR» con los eventos del turno.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'No se pudo generar el Excel', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  const puedeBorrarEvento = (e: EventoBitacora) => e.creadoPor === auth.currentUser?.uid || esSupervisor

  /** La raya azul donde caería el evento arrastrado (solo en la lista de su grupo). */
  const indicadorArrastre = (enPendientes: boolean) => {
    if (!arrastre || arrastre.destino === arrastre.origen) return null
    if (grupos.pendientes.some((x) => x.id === arrastre.id) !== enPendientes) return null
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 z-30 h-1 -translate-y-1/2 rounded-full bg-primary"
        style={{
          top: arrastre.destino === 0 ? (arrastre.otros[0]?.top ?? 0) : (arrastre.otros[arrastre.destino - 1]?.bottom ?? 0),
        }}
      />
    )
  }

  const filaDe = (e: EventoBitacora) => (
    <EventoBitacoraFila
      key={e.id}
      evento={e}
      numero={numeroDe.get(e.id)}
      enPendientes={!esBorrador(e) && fuePendiente(e)}
      abiertoPor={otrosEditando(conectados, e.id, miDispositivoId)}
      nuevo={recienLlegados.has(e.id)}
      onAbrir={() => {
        marcarVisto(e.id)
        setEditor({ evento: e, idNuevo: e.id, turno })
      }}
      onVerFoto={(fotos, indice) => setVisor({ fotos, indice, titulo: encabezadoEvento(e) })}
      onMover={
        tieneHora(e) || esBorrador(e)
          ? undefined
          : (direccion) => {
              const p = posicionAlMover(turno, grupoDe(e), e.id, direccion)
              if (p != null) {
                mover(e.id, p)
                vibrar()
              }
            }
      }
      acciones={accionesDe(e)}
      asa={tieneHora(e) || esBorrador(e) ? undefined : asaDe(e)}
      desplazamiento={arrastre?.id === e.id ? arrastre.dy : null}
    />
  )

  /** Deslizar a la izquierda sobre un evento: Editar, Pendiente, Borrar. */
  const accionesDe = (e: EventoBitacora): SwipeAction[] => {
    const editar: SwipeAction = { label: 'Editar', icon: <Pencil />, tone: 'brand', onClick: () => setEditor({ evento: e, idNuevo: e.id, turno }) }
    const quitar: SwipeAction[] = puedeBorrarEvento(e)
      ? [{ label: esBorrador(e) ? 'Descartar' : 'Borrar', icon: <Trash2 />, tone: 'destructive', onClick: () => void borrarConDeshacer(e) }]
      : []
    if (esBorrador(e)) return [editar, ...quitar]
    const pendiente: SwipeAction = {
      label: e.pendiente ? 'Quitar pendiente' : 'Pendiente',
      icon: <Clock />,
      tone: 'neutral',
      onClick: () => {
        marcarPendiente(e, !e.pendiente, autorFijo ?? nombreRecordadoValido())
        vibrar()
      },
    }
    return [editar, pendiente, ...quitar]
  }

  /** Cuántas filas quedan por encima del centro de la fila arrastrada. */
  const destinoDe = (a: NonNullable<typeof arrastre>, y: number) => {
    const centro = a.centro + (y - a.y0)
    return a.otros.filter((o) => (o.top + o.bottom) / 2 < centro).length
  }

  /** El asa ≡ de un evento sin hora: tomarla y soltarla en otro lugar. */
  const asaDe = (e: EventoBitacora) => ({
    onPointerDown: (ev: ReactPointerEvent<HTMLButtonElement>) => {
      if (ev.button !== 0) return
      const grupo = grupoDe(e)
      const cont = fuePendiente(e) ? listaPendientesRef.current : listaRef.current
      if (!cont) return
      const base = cont.getBoundingClientRect().top
      const filas = [...cont.querySelectorAll<HTMLElement>('[data-evento-id]')]
      const rect = (id: string) => filas.find((f) => f.dataset.eventoId === id)?.getBoundingClientRect()
      const propio = rect(e.id)
      if (!propio) return
      const otros = grupo
        .filter((x) => x.id !== e.id)
        .map((x) => rect(x.id))
        .filter((r): r is DOMRect => Boolean(r))
        .map((r) => ({ top: r.top - base, bottom: r.bottom - base }))
      ev.preventDefault()
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId)
      } catch {
        /* sin captura el arrastre sigue mientras el puntero esté sobre el asa */
      }
      const origen = grupo.findIndex((x) => x.id === e.id)
      const inicio = { id: e.id, y0: ev.clientY, dy: 0, centro: (propio.top + propio.bottom) / 2 - base, origen, otros, destino: origen }
      arrastreRef.current = inicio
      setArrastre(inicio)
    },
    onPointerMove: (ev: ReactPointerEvent<HTMLButtonElement>) => {
      const a = arrastreRef.current
      if (!a || a.id !== e.id) return
      const siguiente = { ...a, dy: ev.clientY - a.y0, destino: destinoDe(a, ev.clientY) }
      // La referencia se adelanta al render: un «soltar» inmediato ya ve el destino.
      arrastreRef.current = siguiente
      setArrastre(siguiente)
    },
    onPointerUp: (ev: ReactPointerEvent<HTMLButtonElement>) => {
      const a = arrastreRef.current
      if (!a || a.id !== e.id) return
      arrastreRef.current = null
      setArrastre(null)
      const p = posicionEnIndice(turno, grupoDe(e), e.id, destinoDe(a, ev.clientY))
      if (p != null) {
        // HIG «Drag and drop»: un arrastre se tiene que poder deshacer. `null`
        // devuelve el evento a su lugar por hora de registro.
        const previa = typeof e.posicionMin === 'number' ? e.posicionMin : null
        mover(e.id, p)
        vibrar()
        toast({
          title: 'Evento movido',
          description: tituloDe(e) || e.equipo?.trim() || undefined,
          duration: PLAZO_DESHACER_MS,
          action: (
            <ToastAction altText="Deshacer el movimiento" onClick={() => mover(e.id, previa)}>
              Deshacer
            </ToastAction>
          ),
        })
      }
    },
  })

  const sugerenciasEquipo = useMemo(() => eventos.map((e) => e.equipo).filter(Boolean), [eventos])
  // Solo publicados: un borrador guarda el tipo a medio escribir («mejora c»).
  const sugerenciasTipo = useMemo(() => tiposPropiosUsados(soloListos([...eventos, ...pendientesPrevios])), [eventos, pendientesPrevios])
  const fecha = fechaTurnoLarga(turno)

  return (
    // «Nuevo evento» ya no va en una barra fija: lo abre el «+» de la barra de
    // pestañas, cuyo espacio reserva el marco de la app.
    <div className="flex flex-col gap-5 pb-8">
      {/* Barra compacta del teléfono: el turno a la vista al bajar (iOS 27). */}
      <div
        aria-hidden={!compacta}
        className={`fixed inset-x-0 z-30 flex items-center gap-2 bg-background/80 py-1.5 pl-4 pr-2 shadow-[inset_0_-0.5px_0_rgb(var(--border))] backdrop-blur-xl transition-[opacity,transform] duration-200 motion-reduce:transition-none md:hidden ${
          compacta ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        style={{ top: `calc(env(safe-area-inset-top, 0px) + ${autorFijo ? 52 : 0}px)` }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline leading-tight">{etiquetaCortaTurno(turno.id)}</p>
          <p className="truncate text-footnote text-muted-foreground">
            {horarioTurno(turno)} · {r.eventos} {r.eventos === 1 ? 'evento' : 'eventos'}
          </p>
        </div>
        <AccionesCabecera
          alHistorial={() => navigate('/bitacora/historial')}
          alCompartir={() => setHojaCompartir(true)}
          alQr={esSupervisor ? () => setHojaQr(true) : undefined}
          enfocable={compacta}
        />
      </div>

      {/* Encabezado: título grande (uno por pantalla) + navegación de turnos */}
      {/* Encabezado en DOS EJES (mockup aprobado 18-09-2026; HIG «Layout» y
          «Toolbars»): arriba el título y las acciones; abajo el turno y, a su
          lado, el estado de sincronización como una línea, no como tarjeta. */}
      <header ref={cabeceraRef} className="flex flex-col gap-1 px-1">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-display">Bitácora</h1>
            {/* Teléfono: una cápsula de vidrio con los íconos (iOS 27 agrupa la
                toolbar así). «En curso» y «Hoy ›» viven junto al nombre del turno. */}
            <span className="md:hidden">
              <AccionesCabecera
                alHistorial={() => navigate('/bitacora/historial')}
                alCompartir={() => setHojaCompartir(true)}
                alQr={esSupervisor ? () => setHojaQr(true) : undefined}
                enfocable
              />
            </span>
            {/* Acciones de PC (HIG «Toolbars»): una sola acción rellena y el resto en
                UNA cápsula de vidrio compartida (DESIGN.md §7). PDF, Excel, WhatsApp y
                correo viven en «Compartir», como en el teléfono. */}
            <div className="hidden items-center gap-3 md:flex">
              <div role="group" aria-label="Acciones de la bitácora" className="glass-nav flex items-center gap-0.5 rounded-full p-1">
                <Button variant="plain" onClick={() => navigate('/bitacora/historial')}>
                  <BarChart3 /> Historial
                </Button>
                {esSupervisor && (
                  <Button variant="plain" onClick={() => setHojaQr(true)}>
                    <QrCode /> Acceso QR
                  </Button>
                )}
                <Button variant="plain" onClick={() => setHojaCompartir(true)} disabled={!!trabajando}>
                  {trabajando ? <Loader2 className="animate-spin" /> : <Share />} Compartir <ChevronDown />
                </Button>
              </div>
              <Button onClick={abrirNuevo}>
                <Plus /> Nuevo evento
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Navegación de turnos: una sola fila que no se parte (las flechas
              quedan siempre a los lados del turno, también a 375 px). */}
          <div className="-ml-3 mt-1 flex min-w-0 flex-1 items-center gap-1 md:flex-none">
            <button
              type="button"
              onClick={() => irATurno(-1)}
              aria-label="Turno anterior"
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1 md:flex-none">
              <div className="flex items-center gap-2">
                <p className="min-w-0 text-headline leading-tight">
                  {etiquetaTurno(turno)} <span className="whitespace-nowrap font-normal text-muted-foreground">{horarioTurno(turno)}</span>
                </p>
                {esActual ? (
                  <Pill tone="info" dot="pulse" className="shrink-0">
                    En curso
                  </Pill>
                ) : (
                  <Button variant="tinted" size="sm" className="shrink-0" onClick={irAlActual}>
                    Hoy <ChevronRight />
                  </Button>
                )}
              </div>
              <p className="truncate text-footnote text-muted-foreground first-letter:uppercase">{fecha} · {BITACORA_PLANTA.nombre}</p>
            </div>
            <button
              type="button"
              onClick={() => irATurno(1)}
              aria-label="Turno siguiente"
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>

          {/* Estado de sincronización y quién está conectado: nunca se esconde
              (mockup aprobado 16-09-2026). En PC es una línea junto al turno, con el
              detalle en un panel al tocarla; en el teléfono, debajo, a lo ancho. */}
          <div className="w-full md:w-auto md:min-w-0 md:flex-1">
            <BarraSincronizacion
              cargando={cargando}
              error={error}
              ultimaSync={ultimaSync}
              cambiosPorSubir={cambiosPorSubir}
              novedad={novedad}
              presentes={conectados}
              miDispositivoId={miDispositivoId}
              editandoPorEvento={hayEventoConId}
              tonoDe={tonoDe}
              compacta
            />
          </div>
          </div>
        </div>
      </header>

      {/* Dos pestañas: lo que pasó en el turno y la pauta de inspección de planta. El nombre
          completo del procedimiento no cabe en una cápsula de 375 px, así que va de título
          adentro (Orel pidió que dijera «inspección post aseo / detención prolongada»). */}
      <SegmentedControl
        className="px-1"
        ariaLabel="Qué se está viendo de este turno"
        value={vista}
        onChange={(v) => {
          setVista(v)
          setParams(
            (p) => {
              const n = new URLSearchParams(p)
              if (v === 'inspeccion') n.set('vista', 'inspeccion')
              else n.delete('vista')
              return n
            },
            { replace: true },
          )
        }}
        segments={[
          { value: 'turno', label: 'Turno' },
          {
            value: 'inspeccion',
            label: (
              <span className="flex items-center gap-1.5">
                Inspección post-aseo
                {/* Un punto, no un número: lo que hay que saber es que falta mirarla. */}
                {avisoInsp && <span aria-label={TEXTO_AVISO_INSPECCION[avisoInsp]} className="size-1.5 rounded-full bg-ink-warn" />}
              </span>
            ),
          },
        ]}
      />

      {vista === 'turno' && avisoInsp && avisoInsp !== 'toca' && (
        <button
          type="button"
          onClick={() => setVista('inspeccion')}
          className="mx-1 flex min-h-[44px] items-center gap-2 rounded-ctl border border-ink-warn/30 bg-ink-warn/10 px-3 text-left text-footnote text-ink-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4 [&>svg]:shrink-0"
        >
          <AlertTriangle aria-hidden />
          <span className="min-w-0 flex-1">{TEXTO_AVISO_INSPECCION[avisoInsp]}</span>
          <ChevronRight aria-hidden />
        </button>
      )}

      {vista === 'inspeccion' ? (
        <div className="px-1">
          <PanelInspeccion
            pauta={pauta}
            inspeccion={inspeccion}
            desviaciones={desviaciones}
            resumen={resumenInsp}
            editable={puedeEditarInspeccion}
            cambioLaPauta={cambioLaPauta}
            tocaHoy={avisoInsp === 'toca'}
            trabajando={inspTrabajando}
            onIniciar={iniciarLaInspeccion}
            onMarcar={(criterioId, resultado) =>
              // La hora solo se sella si el turno está CORRIENDO. Completar el domingo el lunes
              // a las 18:09 dejaba siete marcas a las 18:09 y un recorrido inventado; mismo
              // criterio que ya rige en los eventos (Orel, 21-09-2026).
              void conAviso(() =>
                marcarCriterio(
                  BITACORA_PLANTA.id,
                  turno.id,
                  criterioId,
                  resultado,
                  turnoEnCurso(turno) ? new Date().toISOString() : null,
                ),
              )
            }
            onFijarHora={(criterioId, hhmm) =>
              void conAviso(() => fijarHoraCriterio(BITACORA_PLANTA.id, turno.id, criterioId, isoEnTurno(turno, hhmm)))
            }
            onAnotar={(criterioId, nota) => void conAviso(() => anotarCriterio(BITACORA_PLANTA.id, turno.id, criterioId, nota))}
            onNuevaDesviacion={(criterioId, nota) =>
              inspeccion &&
              setEditor({
                evento: null,
                idNuevo: nuevoId(),
                turno,
                desdeInspeccion: { id: inspeccion.id, criterioId },
                descripcionInicial: nota,
              })
            }
            onAbrirEvento={(e) => setEditor({ evento: e, idNuevo: '', turno })}
            onLiberar={(estado) =>
              void conAviso(() =>
                liberarPlanta(BITACORA_PLANTA.id, turno.id, {
                  estado,
                  en: new Date().toISOString(),
                  porNombre: firmante,
                  // La foto del momento: el informe de entrega no puede decir otra cosa
                  // mañana porque alguien cerró un pendiente.
                  resumen: resumenInsp,
                }),
              )
            }
            onDeshacerLiberacion={() => void conAviso(() => liberarPlanta(BITACORA_PLANTA.id, turno.id, null))}
          />

          {/* Enviar: la misma mecánica del turno — copiar para pegar en Outlook, o WhatsApp.
              §9 del procedimiento: «Informar al supervisor». */}
          {datosCorreoInsp && (
            <section className="mt-5 flex flex-col gap-3 rounded-card border border-border bg-card p-4">
              <h3 className="text-subhead font-semibold">Enviar la inspección</h3>
              <p className="text-caption text-muted-foreground">
                Lleva el criterio de liberación, el registro de desviaciones y el resultado final, como pide el procedimiento.
              </p>
              {/* El correo salía diciendo «La planta todavía no se ha liberado» cuando en
                  terreno ya se había entregado: faltaba marcar la entrega y nadie lo veía
                  hasta leer la vista previa (Orel, 21-09-2026). */}
              {!inspeccion?.liberacion && (
                <p className="flex items-start gap-2 rounded-ctl bg-ink-warn/10 p-2.5 text-caption leading-snug text-ink-warn [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0">
                  <AlertTriangle aria-hidden /> Todavía no marcaste la entrega y el correo lo va a decir. Márcala
                  arriba, en «Liberación de planta».
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void copiarInspeccionParaCorreo()}>
                  <Copy /> Copiar para correo
                </Button>
                <Button
                  variant="tinted"
                  onClick={() => void copiarTexto(tituloCorreoInspeccion({ turno, planta: BITACORA_PLANTA.nombre }))}
                >
                  Copiar asunto
                </Button>
                {fotosInsp > 0 && (
                  <Button variant="tinted" onClick={() => void copiarInspeccionConFotos()} disabled={inspTrabajando}>
                    {inspTrabajando ? <Loader2 className="animate-spin" /> : <Images />} Copiar con fotos incrustadas
                  </Button>
                )}
                {inspeccion?.liberacion && (
                  <Button variant="tinted" onClick={() => void avisarDeLaLiberacion()}>
                    <Share /> Por WhatsApp
                  </Button>
                )}
              </div>
              <p className="text-caption text-muted-foreground">
                Así se va a ver al pegarlo{fotosInsp > 0 ? ` · ${fotosInsp} ${fotosInsp === 1 ? 'foto' : 'fotos'}` : ''}.
              </p>
              {/* La vista previa va TAMBIÉN en el teléfono: la inspección se hace desde ahí y
                  hay que poder mirar el correo antes de copiarlo. */}
              <VistaPreviaCorreo html={htmlCorreoInsp} ancho={720} />
            </section>
          )}
        </div>
      ) : (
      <>
      {/* Escritorio de turno (mockup A, 18-09-2026; HIG «Split views»): en PC, tres
          columnas — contexto (300 px) · eventos · vista previa del correo (380 px,
          fija); entre 768 y 1280 px, dos (contexto y eventos apilados, correo a la
          derecha); en el teléfono, una sola, con la entrega de turno primero. */}
      <div
        className={[
          // `minmax(0,…)` y `min-w-0` en los hijos: sin eso la planilla de 760 px
          // estiraba la única columna del teléfono y la página se desplazaba de lado.
          'grid grid-cols-[minmax(0,1fr)] items-start gap-5 [&>*]:min-w-0',
          "md:grid-cols-[minmax(0,1fr)_380px] md:[grid-template-areas:'contexto_envio'_'entrega_envio'_'centro_envio']",
          // Proporción 1 : 2 : 3 (Orel, 18-09): llena una pantalla 16:9 y el correo se ve grande.
          "xl:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)_minmax(0,3fr)] xl:grid-rows-[auto_1fr] xl:[grid-template-areas:'contexto_entrega_envio'_'contexto_centro_envio']",
        ].join(' ')}
      >
      {/* Entrega de turno: lo primero que ve el turno que llega (mockup aprobado). */}
      <div className="order-1 flex flex-col gap-5 empty:hidden md:order-none md:[grid-area:entrega]">
      {pendientesPrevios.length > 0 && (
        <section aria-label="Pendientes de turnos anteriores" className="flex flex-col">
          <h2 className="px-4 pb-2 text-subhead font-semibold text-muted-foreground">
            Vienen de turnos anteriores<span className="font-normal tabular-nums"> · {pendientesPrevios.length}</span>
          </h2>
          <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
            {pendientesPrevios.map((p) => (
              <div
                key={p.id}
                className='relative flex flex-col gap-1.5 px-4 py-3 before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-headline leading-tight">{p.equipo?.trim() || 'Sin equipo'}</span>
                  <Tag>{etiquetaTipo(p)}</Tag>
                  <Pill tone="warning">Pendiente</Pill>
                </div>
                {tituloDe(p) && <p className="text-body font-semibold">{tituloDe(p)}</p>}
                <p className="line-clamp-3 whitespace-pre-line text-body">{p.descripcion}</p>
                <p className="text-footnote text-muted-foreground">{origenDePendiente(p, turno)}</p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <Button variant="tinted" onClick={() => setEditor({ evento: null, idNuevo: nuevoId(), turno, pendienteOrigen: p })}>
                    <Check /> Resolver
                  </Button>
                  <Button
                    variant="plain"
                    onClick={() => {
                      setNoAplica(p)
                      setMotivoNoAplica('')
                      setQuienNoAplica(autorFijo ?? nombreRecordadoValido())
                    }}
                  >
                    Ya no aplica
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Borradores que quedaron sin publicar: no cuentan en nada hasta que
          alguien los publica, así que el turno que llega tiene que verlos. */}
      {esActual && borradoresPrevios.length > 0 && (
        <section aria-label="Borradores sin publicar de turnos anteriores" className="flex flex-col">
          <h2 className="px-4 pb-2 text-subhead font-semibold text-muted-foreground">
            Quedaron sin publicar<span className="font-normal tabular-nums"> · {borradoresPrevios.length}</span>
          </h2>
          <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
            {borradoresPrevios.map((b) => {
              const puede =
                b.creadoPor === auth.currentUser?.uid || usuario?.rol === 'admin' || usuario?.rol === 'supervisor'
              const confirmando = descartandoId === b.id
              return (
                <div
                  key={b.id}
                  className='relative flex flex-col gap-1.5 px-4 py-3 before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone="info">En redacción</Pill>
                    <span className="text-headline leading-tight">{b.equipo?.trim() || 'Sin equipo todavía'}</span>
                    <Tag>{etiquetaTipo(b)}</Tag>
                  </div>
                  {tituloDe(b) && <p className="text-body font-semibold">{tituloDe(b)}</p>}
                  <p className="line-clamp-3 whitespace-pre-line text-body text-muted-foreground">
                    {b.descripcion?.trim() || 'Sin descripción todavía'}
                  </p>
                  <p className="text-footnote text-muted-foreground">{origenDePendiente(b, turno)}</p>
                  <p className="text-footnote text-muted-foreground">
                    No cuenta en los números ni salió en el correo de su turno. Publícalo en su turno o descártalo.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <Button
                      variant="tinted"
                      onClick={() => {
                        const destino = turnoDesdeId(b.turnoId)
                        if (!destino) return
                        // Se abre en SU turno: ahí vive y ahí se publica.
                        const p = new URLSearchParams(params)
                        p.set('turno', destino.id)
                        setParams(p)
                        setEditor({ evento: b, idNuevo: b.id, turno: destino })
                      }}
                    >
                      Continuar
                    </Button>
                    {puede && (
                      <Button
                        variant={confirmando ? 'destructive' : 'plain'}
                        onClick={() => {
                          if (!confirmando) {
                            setDescartandoId(b.id)
                            return
                          }
                          setDescartandoId(null)
                          void borrar(b)
                          toast({ title: 'Borrador descartado' })
                        }}
                      >
                        {confirmando ? 'Toca de nuevo para descartar' : 'Descartar'}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
      </div>

      {/* Contexto del turno: técnicos, resumen, observación (y en el teléfono, la planilla). */}
      {/* Teléfono: pendientes anteriores (1) → eventos (2) → este contexto (3). Los eventos
          quedaban a tres pantallas (pasada visual 19-09-2026, HIG «Layout»: lo importante
          arriba). El PC no cambia: va en columnas por `grid-area`. */}
      <div className="order-3 flex flex-col gap-5 md:order-none md:[grid-area:contexto]">
      {/* Técnicos del turno: quién está de verdad (mockup aprobado, pieza 1). */}
      {/* Columna de contexto como listas agrupadas (mockup A aprobado 18-09-2026;
          HIG «Lists and tables»): encabezado secundario, filas rótulo · valor
          tabular, notas al pie en caption. Rótulos en footnote y cifras en
          headline, como pidió Orel (los tamaños de la opción B). */}
      <ListGroup
        aria-label="Técnicos del turno"
        title="Técnicos del turno"
        action={
          <Button
            variant="plain"
            size="sm"
            onClick={() => {
              setBorradorPresentes(presentes.nombres)
              setHojaTecnicos('presentes')
            }}
          >
            {presentes.nombres.length ? 'Editar' : 'Agregar'}
          </Button>
        }
        footer={
          // El calendario no siempre refleja el turno real: solo sugiere, no marca.
          // Si dice lo mismo que los presentes, la línea sobra (pasada visual 19-09).
          deTurnoCalendario.length > 0 && [...deTurnoCalendario].sort().join('|') !== [...presentes.nombres].sort().join('|') ? (
            <span className="italic">
              {presentes.ajustado ? 'El calendario decía' : 'El calendario sugiere'}: {deTurnoCalendario.join(', ')}
            </span>
          ) : undefined
        }
      >
        {presentes.nombres.length > 0 ? (
          presentes.nombres.map((n) => (
            <ListCell
              key={n}
              leading={
                <Tag tone={tonoDe(n)} className="size-7 justify-center rounded-full p-0" aria-hidden>
                  <span className="text-caption font-semibold">{iniciales(n)}</span>
                </Tag>
              }
              title={<span className="text-subhead font-normal">{n}</span>}
              value={<span className="text-footnote font-normal text-muted-foreground">presente</span>}
            />
          ))
        ) : (
          <ListCell title={<span className="text-subhead font-normal italic text-muted-foreground">Nadie marcado todavía. Toca «Agregar».</span>} />
        )}
      </ListGroup>

      {/* Resumen del turno: los números que demuestran el trabajo. */}
      {(() => {
        const rotulo = (texto: ReactNode, punto?: 'ok' | 'warn' | 'crit') => (
          <span className="inline-flex items-center gap-2 text-footnote font-normal text-muted-foreground">
            {punto && <span className={`size-2 shrink-0 rounded-full ${PUNTO[punto]}`} aria-hidden />}
            {texto}
          </span>
        )
        const cifra = (texto: string) => <span className="text-headline">{texto}</span>
        // Paradas y fallas ya NO son lo mismo: una parada programada para un
        // preventivo detiene la máquina y no es una falla (18-09-2026).
        const paradas = `${r.conParada} ${r.conParada === 1 ? 'parada' : 'paradas'}`
        const fallas = `${r.fallas} ${r.fallas === 1 ? 'falla' : 'fallas'}`
        const operando = minutosOperando(minutosDelTurno(turno), r.minutosParada)
        const mtbf = mtbfDelTurno(turno, r)
        // Teléfono: las cifras en grilla de 3 (como la tarjeta de Inicio). La lista de 7
        // filas altas ocupaba una pantalla entera y explicaba el MTTR tres veces; la
        // explicación queda una sola vez, bajo la planilla MTTR (pasada visual 19-09).
        const celdas: { id: string; rotulo: string; valor: string; punto?: 'ok' | 'warn' | 'crit' }[] = [
          { id: 'eventos', rotulo: 'eventos', valor: String(r.eventos) },
          { id: 'parada', rotulo: r.conParada > 0 ? `de parada · ${paradas}` : 'de parada', valor: formatoMinutos(r.minutosParada), punto: r.minutosParada > 0 ? 'crit' : undefined },
          ...(r.fallas > 0 ? [{ id: 'fallas', rotulo: r.fallas === 1 ? 'falla' : 'fallas', valor: String(r.fallas), punto: 'crit' as const }] : []),
          ...(r.afectados > 0 ? [{ id: 'afectados', rotulo: 'siguió gracias a Mantención', valor: String(r.afectados), punto: 'warn' as const }] : []),
          { id: 'ventana', rotulo: 'sin detener producción', valor: String(r.enVentana), punto: r.enVentana > 0 ? 'ok' : undefined },
          {
            id: 'pendientes',
            rotulo: r.pendientesCerrados > 0 ? `pendientes · ${r.pendientesCerrados} ${r.pendientesCerrados === 1 ? 'cerrado' : 'cerrados'}` : 'pendientes',
            valor: String(r.pendientesDelTurno),
            punto: r.pendientes > 0 ? 'warn' : r.pendientesCerrados > 0 ? 'ok' : undefined,
          },
          { id: 'mttr', rotulo: 'MTTR', valor: r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin) },
          { id: 'mtbf', rotulo: 'MTBF', valor: mtbf == null ? '—' : formatoMinutos(mtbf) },
        ]
        return (
          <>
          <section aria-label="Resumen del turno" className="flex flex-col md:hidden">
            <h3 className="px-4 pb-2 text-subhead font-semibold text-muted-foreground">Resumen del turno</h3>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-4 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {celdas.map((c) => (
                <div key={c.id} className="flex min-w-0 flex-col-reverse gap-0.5">
                  <dt className="flex items-start gap-1.5 text-footnote leading-tight text-muted-foreground">
                    {c.punto && <span className={`mt-[0.3em] size-2 shrink-0 rounded-full ${PUNTO[c.punto]}`} aria-hidden />}
                    <span className="min-w-0">{c.rotulo}</span>
                  </dt>
                  <dd className="text-headline tabular-nums">{c.valor}</dd>
                </div>
              ))}
            </dl>
            {r.fallas === 0 && <p className="px-4 pt-2 text-footnote text-muted-foreground">Sin fallas en el turno: MTTR y MTBF no aplican.</p>}
          </section>
          <ListGroup
            className="hidden md:flex"
            aria-label="Resumen del turno"
            title="Resumen del turno"
            footer={
              // El pie explica el MTBF, así que se muestra cuando hay FALLAS: con
              // solo paradas programadas no hay nada que explicar.
              r.fallas > 0
                ? `Operando = ${formatoMinutos(minutosDelTurno(turno))} de turno − ${formatoMinutos(MINUTOS_SIN_PRODUCCION_POR_TURNO)} sin producción (colación, reunión, ejercicios) − paradas.`
                : 'Sin fallas en el turno: MTTR y MTBF no aplican.'
            }
          >
            <ListCell title={rotulo('Eventos')} value={cifra(String(r.eventos))} />
            <ListCell
              title={rotulo(
                <>
                  Parada{r.conParada > 0 && <span className="text-muted-foreground/70"> · {paradas}{r.paradasSinDuracion > 0 ? `, ${r.paradasSinDuracion} sin duración` : ''}</span>}
                </>,
                r.minutosParada > 0 ? 'crit' : undefined,
              )}
              value={cifra(formatoMinutos(r.minutosParada))}
            />
            {/* La falla NO se pregunta: es un correctivo que afectó al proceso. */}
            {r.fallas > 0 && (
              <ListCell
                title={rotulo(
                  <>
                    Fallas<span className="text-muted-foreground/70"> · MTTR {r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin)}</span>
                  </>,
                  'crit',
                )}
                value={cifra(String(r.fallas))}
              />
            )}
            {/* Solo si hubo: una fila en cero todos los turnos se vuelve invisible. */}
            {r.afectados > 0 && (
              <ListCell
                title={rotulo('Siguió gracias a Mantención', 'warn')}
                value={cifra(String(r.afectados))}
              />
            )}
            <ListCell title={rotulo('Sin detener producción', r.enVentana > 0 ? 'ok' : undefined)} value={cifra(String(r.enVentana))} />
            <ListCell
              title={rotulo(
                <>
                  Pendientes{r.pendientesCerrados > 0 && <span className="text-muted-foreground/70"> · {r.pendientesCerrados} {r.pendientesCerrados === 1 ? 'cerrado' : 'cerrados'}</span>}
                </>,
                r.pendientes > 0 ? 'warn' : r.pendientesCerrados > 0 ? 'ok' : undefined,
              )}
              value={cifra(String(r.pendientesDelTurno))}
            />
            <ListCell
              title={rotulo('MTTR')}
              subtitle={r.mttrMin != null ? `${formatoMinutos(r.minutosFalla)} de parada por falla ÷ ${fallas}` : 'tiempo promedio en reparar cada falla'}
              value={cifra(r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin))}
            />
            <ListCell
              title={rotulo('MTBF')}
              subtitle={mtbf != null ? `${formatoMinutos(operando)} operando ÷ ${fallas}` : 'tiempo promedio operando entre fallas'}
              value={cifra(mtbf == null ? '—' : formatoMinutos(mtbf))}
            />
          </ListGroup>
          </>
        )
      })()}

      {/* Observación general del turno (del mockup aprobado): una fila con chevron. */}
      <ListGroup aria-label="Observación general del turno" title="Observación general">
        <ListCell
          onClick={() => {
            setTextoObs(observacion.texto)
            setQuienObs(autorFijo ?? nombreRecordadoValido())
            setEditandoObs(true)
          }}
          title={
            observacion.texto ? (
              <span className="line-clamp-3 whitespace-pre-line text-subhead font-normal">{observacion.texto}</span>
            ) : (
              <span className="text-subhead font-normal italic text-muted-foreground">Agregar una nota: estado de la planta, entrega de turno…</span>
            )
          }
          subtitle={observacion.texto && observacion.actualizadoPorNombre ? <span className="italic">{observacion.actualizadoPorNombre}</span> : undefined}
        />
      </ListGroup>

      {/* Copiar, PDF y WhatsApp viven en «Compartir» (ícono de la cabecera) y
          «Nuevo evento» en el «+» de la barra de pestañas (mockup iOS 27, 17-09). */}

      {/* La planilla «Recoleccion MTTR» tal como va ARRIBA del correo, llenándose con
          cada evento publicado: se ve en tiempo real cómo quedará (Orel, 17-09-2026). */}
      {!cargando && r.eventos > 0 && (
        <section aria-label="Recolección MTTR" className="flex flex-col gap-2 md:hidden">
          <div className="flex items-center justify-between gap-2 px-4">
            <h2 className="text-caption font-semibold text-muted-foreground">Recolección MTTR · así va arriba del correo</h2>
            <Button variant="plain" size="sm" onClick={() => void bajarExcel()} disabled={!!trabajando}>
              {trabajando === 'excel' ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Bajar Excel
            </Button>
          </div>
          {/* Fondo blanco fijo a propósito: es la planilla, no una superficie de la app. */}
          <div
            // En el teléfono la planilla no se aprieta: conserva su ancho y se desplaza de lado.
            className="overflow-x-auto rounded-card p-2 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none [&_table]:min-w-[760px]"
            style={{ background: '#FFFFFF' }}
            dangerouslySetInnerHTML={{ __html: htmlMttr }}
          />
          {/* Las siglas de la planilla con su definición y su cálculo (Orel, 18-09). */}
          <p className="px-4 text-footnote text-muted-foreground">{explicacionMtbfMttr(turno, r)}</p>
        </section>
      )}

      {/* HIG «Typography»: la letra sigue el tamaño del teléfono. En iPhone lo lee
          solo; en Android se elige aquí (19-09-2026, capturas al 100/124/135 %). */}
      <div className="flex flex-col gap-1.5">
        <label className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 rounded-card bg-card pl-4 pr-2 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
          <span className="text-body">Tamaño de letra</span>
          <select
            value={letra.tamano}
            onChange={(e) => {
              if (esTamanoLetra(e.target.value)) letra.cambiar(e.target.value)
            }}
            className="ml-auto min-h-[44px] cursor-pointer rounded-ctl bg-transparent px-2 text-right text-campo font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {OPCIONES_TAMANO.filter((o) => o.value !== 'telefono' || letra.hayTelefono).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <p className="px-4 text-footnote text-muted-foreground">
          {letra.tamano === 'telefono'
            ? 'Sigue el tamaño del texto de Ajustes del iPhone.'
            : 'Solo en este teléfono. También se puede ampliar con dos dedos.'}
        </p>
      </div>

      </div>

        {/* Línea de tiempo */}
        <section aria-label="Eventos del turno" className="order-2 flex flex-col gap-5 md:order-none md:[grid-area:centro]">
          {cargando ? (
            <div className="flex flex-col gap-2 rounded-card bg-card p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-ctl bg-muted-foreground/10 motion-reduce:animate-none" />
              ))}
            </div>
          ) : eventos.length === 0 ? (
            <div className="rounded-card bg-card px-6 py-10 text-center">
              <NotebookPen className="mx-auto mb-3 size-9 text-muted-foreground" aria-hidden />
              <p className="text-headline">Aún no hay eventos en este turno</p>
              <p className="mx-auto mt-1 max-w-[42ch] text-footnote text-muted-foreground">
                Registra fallas, ajustes y rondas con sus fotos. Lo que cargues en el celular aparece solo en el PC.
              </p>
              <Button variant="tinted" className="mt-4" onClick={abrirNuevo}>
                <Plus /> Agregar el primero
              </Button>
            </div>
          ) : (
            <>
              {(grupos.hechos.length > 0 || borradores.length > 0) && (
                <div className="flex flex-col">
                  <h2 className="px-4 pb-2 text-subhead font-semibold text-muted-foreground">
                    Eventos del turno{grupos.hechos.length > 0 && <span className="font-normal tabular-nums"> · {grupos.hechos.length}</span>}
                  </h2>
                  <div ref={listaRef} className="relative overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
                    {indicadorArrastre(false)}
                    {[...grupos.hechos, ...borradores].map(filaDe)}
                  </div>
                </div>
              )}
              {grupos.pendientes.length > 0 && (
                <div className="flex flex-col">
                  <h2 className="flex items-center gap-1.5 px-4 pb-2 text-subhead font-semibold text-muted-foreground">
                    <span className="size-2 shrink-0 rounded-full bg-ink-warn" aria-hidden />
                    Pendiente para el turno siguiente<span className="font-normal tabular-nums"> · {grupos.pendientes.length}</span>
                  </h2>
                  <div ref={listaPendientesRef} className="relative overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
                    {indicadorArrastre(true)}
                    {grupos.pendientes.map(filaDe)}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Vista previa del correo (solo PC) */}
        {/* Fija y con su propio desplazamiento: el correo entero cabe en la pantalla 16:9. */}
        <section aria-label="Enviar la bitácora" className="hidden flex-col gap-3 md:flex md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto md:[grid-area:envio]">
          <SegmentedControl
            ariaLabel="Enviar por correo o por WhatsApp"
            value={vistaEnvio}
            onChange={setVistaEnvio}
            segments={[
              { value: 'correo', label: 'Correo' },
              { value: 'whatsapp', label: 'WhatsApp' },
            ]}
          />
          {vistaEnvio === 'whatsapp' ? (
            <div className="flex flex-col gap-4">
              <PasosWhatsapp
                texto={textoWhatsapp}
                plan={planWhatsapp}
                listas={laminas.listas}
                copiados={pasosCopiados}
                onCopiado={marcarCopiado}
                hayEventos={soloListos(eventos).length > 0}
              />
              {soloListos(eventos).length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="px-4 text-caption font-semibold text-muted-foreground">Así queda en el chat</h2>
                  <VistaPreviaWhatsapp texto={textoWhatsapp} listas={laminas.listas} />
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="flex flex-col gap-1 px-4 pb-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-caption font-semibold text-muted-foreground">Así queda al pegar en el correo</h2>
              <Button variant="plain" size="sm" onClick={copiarIncrustadas} disabled={!!trabajando}>
                {trabajando === 'copiar-incrustadas' ? <Loader2 className="animate-spin" /> : null}
                Copiar con fotos incrustadas
              </Button>
            </div>
            {/* El portapapeles lleva el CUERPO; el asunto se copia aparte. */}
            <div className="flex min-w-0 items-center gap-2 text-footnote">
              <span className="shrink-0 text-muted-foreground">Asunto:</span>
              <span className="min-w-0 truncate">{asunto}</span>
              <Button variant="plain" size="sm" className="shrink-0" onClick={copiarAsunto}>
                Copiar asunto
              </Button>
            </div>
          </div>
          <VistaPreviaCorreo html={htmlCorreo} />
          <p className="px-4 pt-2 text-footnote text-muted-foreground">
            Outlook clásico: usa «Copiar para correo». En Outlook nuevo, web o celular usa «Copiar con fotos incrustadas»; si la letra sale toda igual, pega con «Mantener formato de origen».
          </p>
          </>
          )}
        </section>
      </div>
      </>
      )}

      <EventoBitacoraSheet
        open={!!editor}
        turno={turno}
        evento={editor?.evento ?? null}
        pendienteOrigen={editor?.pendienteOrigen ?? null}
        idNuevo={editor?.idNuevo ?? ''}
        sugerenciasEquipo={sugerenciasEquipo}
        sugerenciasTipo={sugerenciasTipo}
        autorFijo={autorFijo}
        descripcionInicial={editor?.descripcionInicial ?? ''}
        puedeEditarMaestro={!autorFijo}
        tecnicos={tecnicos}
        opcionesEquipo={opcionesEquipo}
        cargandoEquipos={cargandoEquipos}
        subirFoto={fuente.subirFoto}
        fuenteRepuestos={fuente.repuestos}
        // El pase es de la planta, no de una persona: «Mis favoritos» no aplica.
        favoritosRepuestos={autorFijo ? null : favoritosRepuestos}
        onGuardar={async (id, datos, nuevo) => {
          // La desviación es un evento normal; lo único que la distingue es de qué punto de
          // la pauta salió. Se inyecta acá para no tocar el formulario de eventos.
          await guardar(id, editor?.desdeInspeccion ? { ...datos, inspeccion: editor.desdeInspeccion } : datos, nuevo)
          // Quedó en otro turno (se registró en el equivocado): se dice dónde, con «Ver».
          const destino = datos.turnoId
          if (destino && editor && destino !== editor.turno.id && datos.estado !== 'borrador') {
            toast({
              title: `Evento movido al ${etiquetaCortaTurno(destino).toLowerCase()}`,
              description: datos.resuelvePendiente || editor.evento?.resuelvePendiente ? 'El pendiente queda resuelto en ese turno.' : undefined,
              variant: 'success',
              action: (
                <ToastAction altText="Ver ese turno" onClick={() => verTurno(destino)}>
                  Ver
                </ToastAction>
              ),
            })
          }
        }}
        onBorrar={borrarConDeshacer}
        eventoVivo={editandoEventoId ? (eventos.find((e) => e.id === editandoEventoId) ?? null) : null}
        otrosEditando={editandoEventoId ? otrosEditando(conectados, editandoEventoId, miDispositivoId) : []}
        onClose={() => setEditor(null)}
      />

      <CompartirTurnoSheet
        open={hojaCompartir}
        onClose={() => setHojaCompartir(false)}
        resumen={`${etiquetaCortaTurno(turno.id)} · ${r.eventos} ${r.eventos === 1 ? 'evento' : 'eventos'} · ${fotosPublicadas} ${fotosPublicadas === 1 ? 'foto' : 'fotos'}`}
        trabajando={trabajando}
        sinEventos={r.eventos === 0}
        onCorreo={() => {
          setHojaCompartir(false)
          void copiar()
        }}
        onWhatsapp={() => {
          setHojaCompartir(false)
          // En PC la vista de WhatsApp vive en la columna de la derecha (mockup A).
          if (window.matchMedia('(min-width: 768px)').matches) setVistaEnvio('whatsapp')
          else setHojaWhatsapp(true)
        }}
        onPdf={() => {
          setHojaCompartir(false)
          void exportarPdf()
        }}
        onExcel={() => {
          setHojaCompartir(false)
          void bajarExcel()
        }}
      />

      <Sheet
        open={hojaWhatsapp}
        onClose={() => setHojaWhatsapp(false)}
        title="Enviar por WhatsApp"
        description={
          !compartirConMenu
            ? `Copia el mensaje y cada lámina, y pégalos en el chat.${avisoBorradores}`
            : dosPasos
              ? `Va en dos pasos al mismo chat: primero el mensaje y después ${
                  planWhatsapp.length === 1 ? 'la lámina' : `las ${planWhatsapp.length} láminas`
                }. Junto a las fotos, WhatsApp corta el texto en unos 1.000 caracteres.${avisoBorradores}`
              : `Se abre el menú de compartir con ${
                  planWhatsapp.length === 0 ? 'el mensaje' : `${planWhatsapp.length === 1 ? 'la lámina' : `las ${planWhatsapp.length} láminas`} y el mensaje`
                }. Elige WhatsApp y el grupo.${avisoBorradores}`
        }
        actions={
          compartirConMenu ? (
            <>
              <Button
                variant="tinted"
                onClick={() => {
                  void copiarTexto(textoWhatsapp).then(() => {
                    marcarCopiado(PASO_MENSAJE)
                    toast({ title: 'Mensaje copiado', variant: 'success' })
                  })
                }}
              >
                Copiar mensaje
              </Button>
              <Button onClick={() => void compartir()} disabled={compartiendo || (!(dosPasos && !mensajeEnviado) && !laminas.completas)}>
                {compartiendo || (!(dosPasos && !mensajeEnviado) && !laminas.completas) ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                {!dosPasos
                  ? laminas.completas
                    ? 'Compartir'
                    : 'Preparando…'
                  : !mensajeEnviado
                    ? '1 · Enviar el mensaje'
                    : laminas.completas
                      ? `2 · Enviar ${planWhatsapp.length === 1 ? 'la lámina' : `las ${planWhatsapp.length} láminas`}`
                      : 'Preparando…'}
              </Button>
            </>
          ) : (
            <Button variant="tinted" onClick={() => setHojaWhatsapp(false)}>
              Cerrar
            </Button>
          )
        }
      >
        <div className="-mx-6 flex max-h-[min(62vh,600px)] flex-col gap-4 overflow-y-auto px-6 pb-1">
          {compartirConMenu ? (
            <p className="text-footnote text-muted-foreground">
              {dosPasos && mensajeEnviado
                ? 'Mensaje enviado. Ahora las láminas, al mismo chat.'
                : 'Si WhatsApp no pone el mensaje, pégalo en el chat: ya queda copiado.'}
            </p>
          ) : (
            <PasosWhatsapp
              texto={textoWhatsapp}
              plan={planWhatsapp}
              listas={laminas.listas}
              copiados={pasosCopiados}
              onCopiado={marcarCopiado}
              hayEventos={soloListos(eventos).length > 0}
            />
          )}
          <VistaPreviaWhatsapp texto={textoWhatsapp} listas={laminas.listas} />
        </div>
      </Sheet>

      <Sheet
        open={editandoObs}
        onClose={() => setEditandoObs(false)}
        title="Observación general del turno"
        description="Sale en el correo y en el PDF, debajo del resumen."
        actions={
          <>
            <Button variant="tinted" onClick={() => setEditandoObs(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (tecnicos.todos.length > 0 && !quienObs.trim()) {
                  toast({ title: 'Elige quién escribe la observación', variant: 'destructive' })
                  return
                }
                void guardarObservacion(textoObs, quienObs)
                  // HIG «Feedback»: la observación aparece en su fila; no hace falta avisar.
                  .then(() => setEditandoObs(false))
                  .catch((e: unknown) => toast({ title: e instanceof Error ? e.message : 'No se pudo guardar', variant: 'destructive' }))
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        {tecnicos.todos.length > 0 && !autorFijo && (
          <div className="mb-4">
            <SelectorTecnico etiqueta="Quién escribe" deTurno={tecnicos.deTurno} todos={tecnicos.todos} valor={quienObs} onChange={setQuienObs} />
          </div>
        )}
        <label htmlFor="bitacora-observacion" className="sr-only">Observación general del turno</label>
        <textarea
          id="bitacora-observacion"
          value={textoObs}
          onChange={(e) => setTextoObs(e.target.value)}
          maxLength={3000}
          placeholder="Planta operando normal. Queda pendiente el motor de tensado de la enzunchadora…"
          className="min-h-[160px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-campo leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
        />
      </Sheet>

      <Sheet
        open={Boolean(noAplica)}
        onClose={() => setNoAplica(null)}
        title="Ya no aplica"
        description={noAplica ? `${noAplica.equipo || 'Sin equipo'} · ${origenDePendiente(noAplica, turno)}` : undefined}
        actions={
          <>
            <Button variant="tinted" onClick={() => setNoAplica(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!noAplica) return
                if (tecnicos.todos.length > 0 && !quienNoAplica.trim()) {
                  toast({ title: 'Elige quién cierra el pendiente', variant: 'destructive' })
                  return
                }
                if (!motivoNoAplica.trim()) {
                  toast({ title: 'Escribe por qué ya no aplica', variant: 'destructive' })
                  return
                }
                void cerrarNoAplica(noAplica, motivoNoAplica, quienNoAplica)
                  .then(() => {
                    vibrar()
                    toast({ title: 'Pendiente cerrado', description: 'No cuenta como resuelto por Mantención.' })
                    setNoAplica(null)
                  })
                  .catch((e: unknown) => toast({ title: e instanceof Error ? e.message : 'No se pudo cerrar', variant: 'destructive' }))
              }}
            >
              Cerrar pendiente
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {tecnicos.todos.length > 0 && !autorFijo && (
            <SelectorTecnico etiqueta="Quién lo cierra" deTurno={tecnicos.deTurno} todos={tecnicos.todos} valor={quienNoAplica} onChange={setQuienNoAplica} />
          )}
          <div>
            <label htmlFor="bitacora-motivo-no-aplica" className="mb-1.5 block text-footnote text-muted-foreground">
              Por qué ya no aplica
            </label>
            <textarea
              id="bitacora-motivo-no-aplica"
              value={motivoNoAplica}
              onChange={(e) => setMotivoNoAplica(e.target.value)}
              maxLength={300}
              placeholder="Se resolvió solo, estaba duplicado, se cambió el equipo…"
              className="min-h-[88px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-campo leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </div>
      </Sheet>

      {esSupervisor && (
        <AccesoQrSheet
          open={hojaQr}
          onClose={() => setHojaQr(false)}
          plantId={BITACORA_PLANTA.id}
          plantaNombre={BITACORA_PLANTA.nombre}
          tecnicos={listaTecnicos.map((t) => t.nombre)}
          estado={accesoQr.estado}
          dispositivos={accesoQr.dispositivos}
          cargando={accesoQr.cargando}
          error={accesoQr.error}
          api={apiPase}
        />
      )}

      <TecnicosDelTurnoSheet
        open={hojaTecnicos === 'presentes'}
        lista={listaTecnicos}
        deTurnoCalendario={deTurnoCalendario}
        marcados={borradorPresentes}
        onMarcados={setBorradorPresentes}
        onGuardar={(nombres) => {
          // HIG «Feedback»: los técnicos quedan a la vista en su lista; solo se avisa si falla.
          void guardarPresentes(nombres).catch((e: unknown) =>
            toast({ title: e instanceof Error ? e.message : 'No se pudo guardar', variant: 'destructive' }),
          )
        }}
        // Un pase no cambia la lista de técnicos (solo la lee).
        onAbrirLista={autorFijo ? undefined : () => setHojaTecnicos('lista')}
        onClose={() => setHojaTecnicos(null)}
      />
      <ListaTecnicosSheet
        open={hojaTecnicos === 'lista'}
        lista={listaTecnicos}
        ajustes={ajustes}
        onGuardar={(nuevos) => {
          void guardarAjustes(nuevos).catch((e: unknown) =>
            toast({ title: e instanceof Error ? e.message : 'No se pudo guardar', variant: 'destructive' }),
          )
        }}
        // Al cerrar vuelve a «Técnicos del turno», que es desde donde se abrió.
        onClose={() => setHojaTecnicos('presentes')}
      />

      {visor && (
        <VisorFotosBitacora fotos={visor.fotos} indiceInicial={visor.indice} titulo={visor.titulo} onClose={() => setVisor(null)} />
      )}
    </div>
  )
}

const PUNTO = { ok: 'bg-ink-ok', warn: 'bg-ink-warn', crit: 'bg-ink-crit' } as const

/** Cuánto dura «Deshacer» después de borrar un evento. */
const PLAZO_DESHACER_MS = 5000

/** Historial, Compartir y QR como íconos en una cápsula de vidrio (teléfono). */
function AccionesCabecera({
  alHistorial,
  alCompartir,
  alQr,
  enfocable,
}: {
  alHistorial: () => void
  alCompartir: () => void
  alQr?: () => void
  /** La barra compacta escondida no debe recibir el foco del teclado. */
  enfocable: boolean
}) {
  const clase =
    'flex size-[44px] items-center justify-center rounded-full text-primary transition-transform duration-150 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none [&>svg]:size-5'
  const tab = enfocable ? undefined : -1
  return (
    <div role="group" aria-label="Acciones de la bitácora" className="glass-nav flex shrink-0 items-center rounded-full">
      <button type="button" className={clase} onClick={alHistorial} aria-label="Historial" tabIndex={tab}>
        <BarChart3 />
      </button>
      <button type="button" className={clase} onClick={alCompartir} aria-label="Compartir el turno" tabIndex={tab}>
        <Share />
      </button>
      {alQr && (
        <button type="button" className={clase} onClick={alQr} aria-label="Acceso por QR" tabIndex={tab}>
          <QrCode />
        </button>
      )}
    </div>
  )
}

/**
 * El HTML del correo en un iframe aislado: los estilos de la app (preflight de
 * Tailwind resetea imágenes y tablas) no deben alterar la vista previa, que
 * tiene que ser lo mismo que ve Outlook. Sin scripts: `sandbox` sin
 * `allow-scripts`; `allow-same-origin` solo para medir la altura.
 */
/**
 * Ancho con que se arma el correo: el del panel de lectura de Outlook en el PC
 * (960 px de cuerpo + 20 px de margen por lado). La planilla MTTR va a lo ancho
 * y el detalle de la bitácora se queda en sus 680 px; a 720 la planilla se veía
 * apretada y no como llega a Outlook (revisión 17-09).
 */
const ANCHO_CORREO = 1000

/**
 * `ancho`: el lienzo sobre el que se dibuja el correo antes de escalarlo. El del turno usa
 * los 1000 px de siempre; el de la inspección mide 680, y darle el lienzo ancho lo dejaba al
 * 31 % en un teléfono — ilegible por 320 px de papel en blanco.
 */
function VistaPreviaCorreo({ html, ancho = ANCHO_CORREO }: { html: string; ancho?: number }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState(480)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;}body{padding:20px;width:${ancho - 40}px;}</style></head><body>${html}</body></html>`

  /**
   * El correo se dibuja a SU ancho real y se escala para caber en la columna.
   * Achicar las fotos para que quepan no sirve: la columna mide distinto con y
   * sin menú lateral, y la vista previa dejaría de mostrar lo que llega a Outlook.
   */
  const ajustar = useCallback(() => {
    const iframe = ref.current
    const d = iframe?.contentDocument
    if (!iframe || !d?.body) return
    const escala = Math.min(1, iframe.clientWidth / ancho)
    d.documentElement.style.zoom = String(escala)
    setAlto(Math.max(240, Math.ceil(d.body.scrollHeight * escala) + 4))
  }, [ancho])

  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const ro = new ResizeObserver(() => ajustar())
    ro.observe(iframe)
    return () => ro.disconnect()
  }, [ajustar])

  return (
    <iframe
      ref={ref}
      title="Vista previa del correo"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={() => {
        ajustar()
        // Las fotos terminan de cargar después del onLoad del documento.
        ref.current?.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', ajustar))
      }}
      // Fondo blanco fijo en ambos temas: es el papel del correo, no cromo de la app.
      style={{ height: alto, background: '#fff' }}
      className="w-full rounded-card border-0 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
    />
  )
}

/**
 * `HH:mm` → el instante ISO que le corresponde DENTRO del turno. No se puede armar con la
 * fecha del turno a secas: el turno noche va de 00:00 a 08:00 pero el nocturno de otras bandas
 * cruza la medianoche, y ahí la fecha del día siguiente es la correcta. `minutosDesdeInicioTurno`
 * ya resuelve esa cuenta, así que se apoya en ella desde el inicio real del turno.
 */
function isoEnTurno(turno: TurnoMantencion, hhmm: string | null): string | null {
  if (!hhmm) return null
  const min = minutosDesdeInicioTurno(turno, hhmm)
  if (!Number.isFinite(min) || min === Number.MAX_SAFE_INTEGER) return null
  return new Date(turno.inicio.getTime() + min * 60_000).toISOString()
}
