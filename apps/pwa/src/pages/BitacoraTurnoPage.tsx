import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, Check, ChevronLeft, ChevronRight, ClipboardCopy, FileDown, Loader2, MessageCircle, MessageSquareText, NotebookPen, Plus, QrCode } from 'lucide-react'
import { Button, Pill, SegmentedControl, Sheet, Tag } from '@/components/piel'
import { PASO_MENSAJE, PasosWhatsapp, VistaPreviaWhatsapp } from '@/components/bitacora/PanelWhatsapp'
import { compartirEnWhatsapp, puedeCompartirArchivos } from '@/services/bitacora/compartirWhatsapp'
import { useLaminasWhatsapp } from '@/hooks/useLaminasWhatsapp'
import { AccesoQrSheet } from '@/components/bitacora/AccesoQrSheet'
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
import { origenDePendiente } from '@/services/bitacora/entregaTurno'
import { tecnicoRecordado } from '@/components/bitacora/tecnicoRecordado'
import { useToast } from '@/hooks/useToast'
import { FUENTE_FIRESTORE, useTurnoMantencionActual, type FuenteBitacora } from '@/hooks/useBitacoraTurno'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { encabezadoEvento, etiquetaTipo, tiposPropiosUsados, tituloDe } from '@/services/bitacora/presentacionEvento'
import { copiarHtml, copiarTexto } from '@/lib/clipboard'
import type { EventoBitacora, FotoEvento, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import type { User } from '@/types'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano, etiquetaParada, etiquetaPendientes, tituloCorreo } from '@/services/bitacora/bitacoraCorreo'
import { cargarFotoComoJpeg, purgarFotosPendientes } from '@/services/bitacora/fotosBitacora'
import { resumirBitacora } from '@/services/bitacora/resumenBitacora'
import { esBorrador, soloListos } from '@/services/bitacora/borradores'
import { nombreEnPresencia as nombrePresencia, otrosEditando } from '@/services/bitacora/presencia'
import { dispositivoActual } from '@/services/bitacora/dispositivo'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/store'
import type { TagTone } from '@/components/piel'
import {
  etiquetaTurno,
  fechaTurnoLarga,
  formatoMinutos,
  horarioTurno,
  turnoAdyacente,
  turnoDesdeId,
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
  const [editor, setEditor] = useState<{ evento: EventoBitacora | null; idNuevo: string; turno: TurnoMantencion; pendienteOrigen?: EventoBitacora | null } | null>(null)
  // La jerarquía (702 nodos) se carga recién al abrir el editor, y queda en caché.
  const { opciones: opcionesEquipo, cargando: cargandoEquipos } = fuente.useOpcionesEquipo(Boolean(editor))
  const turnoNavegado = useMemo(() => turnoDesdeId(turnoParam) ?? turnoActual, [turnoParam, turnoActual])
  // Con el editor abierto el turno queda CONGELADO: si el reloj cruza las
  // 16:00 a mitad de escribir, el formulario no se borra y el evento se guarda
  // en el turno donde se empezó a registrar.
  const turno = editor?.turno ?? turnoNavegado
  const esActual = turno.id === turnoActual.id

  const { eventos, cargando, error, ultimaSync, cambiosPorSubir, novedad, nuevoId, guardar, borrar } = fuente.useEventos(turno)
  const calendario = fuente.useTecnicos(turno)
  const { observacion, guardarObservacion, guardarPresentes } = fuente.useObservacion(turno)
  const { ajustes, guardarAjustes } = fuente.useAjustes()
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
  // Publicados primero (en orden del turno) y los borradores al final: se ven,
  // pero todavía no son un hecho del turno.
  const borradores = useMemo(() => eventos.filter(esBorrador), [eventos])
  const enLista = useMemo(() => [...soloListos(eventos), ...borradores], [eventos, borradores])

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

  const [trabajando, setTrabajando] = useState<null | 'copiar' | 'copiar-incrustadas' | 'pdf'>(null)
  const [editandoObs, setEditandoObs] = useState(false)
  const [textoObs, setTextoObs] = useState('')
  const [quienObs, setQuienObs] = useState('')
  const [visor, setVisor] = useState<{ fotos: FotoEvento[]; indice: number; titulo: string } | null>(null)
  /** Columna derecha del PC: la vista previa del correo o el envío por WhatsApp. */
  const [vistaEnvio, setVistaEnvio] = useState<'correo' | 'whatsapp'>('correo')
  /** Hoja de WhatsApp del celular. */
  const [hojaWhatsapp, setHojaWhatsapp] = useState(false)
  /** Láminas ya copiadas (por clave) y el texto exacto que se copió como mensaje. */
  const [laminasCopiadas, setLaminasCopiadas] = useState<ReadonlySet<string>>(new Set())
  const [mensajeCopiado, setMensajeCopiado] = useState<string | null>(null)
  const [compartiendo, setCompartiendo] = useState(false)
  // Entrega de turno: pendientes abiertos de turnos anteriores.
  const { pendientes: pendientesPrevios, cerrarNoAplica } = fuente.usePendientesAnteriores(turno)
  // Borradores que nadie publicó antes del cambio de turno: solo en el turno EN CURSO.
  const borradoresPrevios = fuente.useBorradoresAnteriores(turno)
  const [descartandoId, setDescartandoId] = useState<string | null>(null)
  const [noAplica, setNoAplica] = useState<EventoBitacora | null>(null)
  const [motivoNoAplica, setMotivoNoAplica] = useState('')
  const [quienNoAplica, setQuienNoAplica] = useState('')

  const abrirNuevo = useCallback(() => setEditor({ evento: null, idNuevo: nuevoId(), turno }), [nuevoId, turno])

  // Fotos que quedaron sin dueño y no se pudieron borrar (la señal de planta se
  // cae a cada rato): se reintenta al abrir la bitácora y cuando vuelve la red.
  // Si no, cada falla dejaba un archivo pagándose para siempre.
  useEffect(() => {
    void purgarFotosPendientes()
    const alVolver = () => void purgarFotosPendientes()
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
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

  const copiarParaWhatsapp = async () => {
    try {
      await copiarTexto(textoWhatsapp)
      setMensajeCopiado(textoWhatsapp)
      setVistaEnvio('whatsapp')
      toast({
        title: 'Mensaje copiado',
        description: `Pégalo en WhatsApp Web con Ctrl+V. Después copia cada lámina desde la columna de la derecha.${avisoBorradores}`,
        variant: 'success',
      })
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' })
    }
  }

  const compartir = async () => {
    setCompartiendo(true)
    try {
      const r = await compartirEnWhatsapp(turno, textoWhatsapp, laminas.listas)
      if (r === 'enviado') {
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
      const { fotosFallidas } = await generarPdfBitacora(datosCorreo)
      toast({
        title: 'PDF descargado',
        description: fotosFallidas ? `${fotosFallidas} foto(s) no se pudieron incluir.` : undefined,
        variant: fotosFallidas ? 'default' : 'success',
      })
    } catch {
      toast({ title: 'No se pudo generar el PDF', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  const sugerenciasEquipo = useMemo(() => eventos.map((e) => e.equipo).filter(Boolean), [eventos])
  // Solo publicados: un borrador guarda el tipo a medio escribir («mejora c»).
  const sugerenciasTipo = useMemo(() => tiposPropiosUsados(soloListos([...eventos, ...pendientesPrevios])), [eventos, pendientesPrevios])
  const fecha = fechaTurnoLarga(turno)

  return (
    // pb-28 en móvil: el botón fijo «Nuevo evento» no debe tapar el último evento.
    <div className="flex flex-col gap-5 pb-28 md:pb-8">
      {/* Encabezado: título grande (uno por pantalla) + navegación de turnos */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
        <div className="min-w-0 flex-1 md:flex-none">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-display">Bitácora</h1>
            <span className="flex items-center gap-1">
              {esActual ? (
                <Pill tone="info" dot="pulse">En curso</Pill>
              ) : (
                <Button variant="plain" onClick={irAlActual}>Ir al turno actual</Button>
              )}
              <Button variant="plain" onClick={() => navigate('/bitacora/historial')}>
                <BarChart3 /> Historial
              </Button>
              {esSupervisor && (
                <Button variant="plain" onClick={() => setHojaQr(true)} aria-label="Acceso por QR">
                  <QrCode /> <span className="hidden sm:inline">Acceso QR</span>
                </Button>
              )}
            </span>
          </div>
          {/* Navegación de turnos: una sola fila que no se parte (las flechas
              quedan siempre a los lados del turno, también a 375 px). */}
          <div className="-ml-3 mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => irATurno(-1)}
              aria-label="Turno anterior"
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1 md:flex-none">
              <p className="text-headline leading-tight">
                {etiquetaTurno(turno)} <span className="whitespace-nowrap font-normal text-muted-foreground">{horarioTurno(turno)}</span>
              </p>
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
        </div>

        {/* Acciones de PC: aquí la principal es copiar al correo. */}
        <div className="hidden flex-wrap gap-2 md:flex">
          <Button variant="tinted" onClick={abrirNuevo}>
            <Plus /> Nuevo evento
          </Button>
          <Button variant="tinted" onClick={exportarPdf} disabled={!!trabajando}>
            {trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />} Exportar PDF
          </Button>
          <Button variant="tinted" onClick={() => void copiarParaWhatsapp()} disabled={!!trabajando}>
            <MessageCircle /> Copiar para WhatsApp
          </Button>
          <Button onClick={copiar} disabled={!!trabajando}>
            {trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />} Copiar para correo
          </Button>
        </div>
      </header>

      {/* Estado de sincronización y quién está conectado: nunca se esconde
          (mockup aprobado 16-09-2026). */}
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
      />

      {/* Técnicos del turno: quién está de verdad (mockup aprobado, pieza 1). */}
      {/* Entrega de turno: lo primero que ve el turno que llega (mockup aprobado). */}
      {pendientesPrevios.length > 0 && (
        <section aria-label="Pendientes de turnos anteriores" className="flex flex-col">
          <h2 className="px-4 pb-2 text-footnote text-muted-foreground">
            <span className="font-semibold text-foreground">Vienen de turnos anteriores</span> · {pendientesPrevios.length}
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
          <h2 className="px-4 pb-2 text-footnote text-muted-foreground">
            <span className="font-semibold text-foreground">Quedaron sin publicar</span> · {borradoresPrevios.length}
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

      <section aria-label="Técnicos del turno" className="flex flex-col gap-2.5 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-footnote text-muted-foreground">Técnicos del turno</h2>
          <Button variant="plain" onClick={() => {
              setBorradorPresentes(presentes.nombres)
              setHojaTecnicos('presentes')
            }}>
            {presentes.nombres.length ? 'Editar' : 'Agregar'}
          </Button>
        </div>
        {presentes.nombres.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {presentes.nombres.map((n) => (
              <span key={n} className="inline-flex min-h-[32px] items-center rounded-full bg-primary/[0.13] px-3 text-footnote font-semibold text-brand-ink">
                {n}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-body text-muted-foreground">Nadie marcado todavía. Toca «Agregar» y marca quién está en el turno.</p>
        )}
        {/* El calendario no siempre refleja el turno real: solo sugiere, no marca. */}
        {deTurnoCalendario.length > 0 && (
          <p className="text-footnote text-muted-foreground">
            {presentes.ajustado ? 'El calendario decía' : 'El calendario sugiere'}: {deTurnoCalendario.join(', ')}
          </p>
        )}
      </section>

      {/* Resumen del turno: los números que demuestran el trabajo */}
      <section aria-label="Resumen del turno" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none sm:grid-cols-4">
        <Stat valor={String(r.eventos)} etiqueta={r.eventos === 1 ? 'evento' : 'eventos'} />
        <Stat
          valor={formatoMinutos(r.minutosParada)}
          // La pantalla decía solo «de parada» mientras el correo y el PDF
          // avisaban «1 sin duración»: el dato faltante se veía recién al pegar.
          etiqueta={`${etiquetaParada(r)}${r.mttrMin != null ? ` · MTTR ${formatoMinutos(r.mttrMin)}` : ''}`}
          tinta={r.minutosParada > 0 ? 'text-ink-crit' : undefined}
        />
        <Stat valor={String(r.enVentana)} etiqueta="sin detener producción" tinta={r.enVentana > 0 ? 'text-ink-ok' : undefined} />
        <Stat
          valor={String(r.pendientesDelTurno)}
          etiqueta={etiquetaPendientes(r)}
          tinta={r.pendientes > 0 ? 'text-ink-warn' : undefined}
        />
        {r.pendientesCerrados > 0 ? (
          <Stat valor={String(r.pendientesCerrados)} etiqueta={r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados'} tinta="text-ink-ok" />
        ) : null}
      </section>

      {/* Observación general del turno (del mockup aprobado). */}
      <button
        type="button"
        onClick={() => {
          setTextoObs(observacion.texto)
          setQuienObs(autorFijo ?? nombreRecordadoValido())
          setEditandoObs(true)
        }}
        className="flex min-h-[44px] w-full items-start gap-3 rounded-card bg-card px-4 py-3 text-left shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none dark:shadow-none"
      >
        <MessageSquareText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-footnote text-muted-foreground">Observación general del turno</span>
          {observacion.texto ? (
            <span className="line-clamp-4 block whitespace-pre-line text-body">{observacion.texto}</span>
          ) : (
            <span className="block text-body text-muted-foreground">Agregar una nota: estado de la planta, entrega de turno…</span>
          )}
          {observacion.texto && observacion.actualizadoPorNombre && (
            <span className="block pt-0.5 text-caption text-muted-foreground">{observacion.actualizadoPorNombre}</span>
          )}
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {/* Acciones secundarias de móvil. La principal (Nuevo evento) va fija abajo. */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        <Button variant="tinted" className="px-2" onClick={copiar} disabled={!!trabajando || eventos.length === 0}>
          {trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />} Copiar
        </Button>
        <Button variant="tinted" className="px-2" onClick={exportarPdf} disabled={!!trabajando || eventos.length === 0}>
          {trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
        </Button>
        <Button variant="tinted" className="px-2" onClick={() => setHojaWhatsapp(true)} disabled={!!trabajando || eventos.length === 0}>
          <MessageCircle /> WhatsApp
        </Button>
      </div>

      {/* «Nuevo evento» siempre a mano en el celular: justo sobre la barra de
          pestañas (h-16 = 4rem; 2.5rem cuando el teléfono está acostado), así no
          hay que volver arriba con 10 eventos cargados. */}
      <div
        className="fixed inset-x-0 z-30 bg-background/80 px-4 pb-3 pt-2 backdrop-blur-xl md:hidden bottom-[calc(4rem+env(safe-area-inset-bottom))] [@media(max-height:500px)]:bottom-[calc(2.5rem+env(safe-area-inset-bottom))]"
      >
        <Button size="block" onClick={abrirNuevo}>
          <Plus /> Nuevo evento
        </Button>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Línea de tiempo */}
        <section aria-label="Eventos del turno" className="flex flex-col">
          <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">Eventos</h2>
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
            <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {enLista.map((e) => (
                <EventoBitacoraFila
                  key={e.id}
                  evento={e}
                  abiertoPor={otrosEditando(conectados, e.id, miDispositivoId)}
                  onAbrir={() => setEditor({ evento: e, idNuevo: e.id, turno })}
                  onVerFoto={(fotos, indice) => setVisor({ fotos, indice, titulo: encabezadoEvento(e) })}
                />
              ))}
            </div>
          )}
        </section>

        {/* Vista previa del correo (solo PC) */}
        <section aria-label="Enviar la bitácora" className="hidden flex-col gap-3 md:flex md:sticky md:top-4">
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
            Outlook clásico: usa «Copiar para correo». Si en Outlook nuevo o web las fotos no aparecen, usa «Copiar con fotos incrustadas».
          </p>
          </>
          )}
        </section>
      </div>

      <EventoBitacoraSheet
        open={!!editor}
        turno={turno}
        evento={editor?.evento ?? null}
        pendienteOrigen={editor?.pendienteOrigen ?? null}
        idNuevo={editor?.idNuevo ?? ''}
        sugerenciasEquipo={sugerenciasEquipo}
        sugerenciasTipo={sugerenciasTipo}
        autorFijo={autorFijo}
        tecnicos={tecnicos}
        opcionesEquipo={opcionesEquipo}
        cargandoEquipos={cargandoEquipos}
        subirFoto={fuente.subirFoto}
        onGuardar={guardar}
        onBorrar={borrar}
        eventoVivo={editandoEventoId ? (eventos.find((e) => e.id === editandoEventoId) ?? null) : null}
        otrosEditando={editandoEventoId ? otrosEditando(conectados, editandoEventoId, miDispositivoId) : []}
        onClose={() => setEditor(null)}
      />

      <Sheet
        open={hojaWhatsapp}
        onClose={() => setHojaWhatsapp(false)}
        title="Enviar por WhatsApp"
        description={
          compartirConMenu
            ? `Se abre el menú de compartir con ${
                planWhatsapp.length === 0 ? 'el mensaje' : `${planWhatsapp.length === 1 ? 'la lámina' : `las ${planWhatsapp.length} láminas`} y el mensaje`
              }. Elige WhatsApp y el grupo.${avisoBorradores}`
            : `Copia el mensaje y cada lámina, y pégalos en el chat.${avisoBorradores}`
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
              <Button onClick={() => void compartir()} disabled={compartiendo || !laminas.completas}>
                {compartiendo || !laminas.completas ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                {laminas.completas ? 'Compartir' : 'Preparando…'}
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
            <p className="text-footnote text-muted-foreground">Si WhatsApp no pone el mensaje, pégalo en el chat: ya queda copiado.</p>
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
                  .then(() => {
                    toast({ title: 'Observación guardada', variant: 'success' })
                    setEditandoObs(false)
                  })
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
          className="min-h-[160px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-[16px] leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
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
              className="min-h-[88px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-[16px] leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
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
          void guardarPresentes(nombres).catch((e: unknown) =>
            toast({ title: e instanceof Error ? e.message : 'No se pudo guardar', variant: 'destructive' }),
          )
          toast({ title: 'Técnicos del turno guardados', variant: 'success' })
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

function Stat({ valor, etiqueta, tinta }: { valor: string; etiqueta: string; tinta?: string }) {
  return (
    <div className="min-w-0">
      <span className={`block text-title2 tabular-nums leading-tight ${tinta ?? ''}`}>{valor}</span>
      <span className="block text-footnote text-muted-foreground">{etiqueta}</span>
    </div>
  )
}

/**
 * El HTML del correo en un iframe aislado: los estilos de la app (preflight de
 * Tailwind resetea imágenes y tablas) no deben alterar la vista previa, que
 * tiene que ser lo mismo que ve Outlook. Sin scripts: `sandbox` sin
 * `allow-scripts`; `allow-same-origin` solo para medir la altura.
 */
/** Ancho con que se arma el correo (680 px de cuerpo + 20 px de margen por lado). */
const ANCHO_CORREO = 720

function VistaPreviaCorreo({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState(480)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;}body{padding:20px;width:${ANCHO_CORREO - 40}px;}</style></head><body>${html}</body></html>`

  /**
   * El correo se dibuja a SU ancho real y se escala para caber en la columna.
   * Achicar las fotos para que quepan no sirve: la columna mide distinto con y
   * sin menú lateral, y la vista previa dejaría de mostrar lo que llega a Outlook.
   */
  const ajustar = useCallback(() => {
    const iframe = ref.current
    const d = iframe?.contentDocument
    if (!iframe || !d?.body) return
    const escala = Math.min(1, iframe.clientWidth / ANCHO_CORREO)
    d.documentElement.style.zoom = String(escala)
    setAlto(Math.max(240, Math.ceil(d.body.scrollHeight * escala) + 4))
  }, [])

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
