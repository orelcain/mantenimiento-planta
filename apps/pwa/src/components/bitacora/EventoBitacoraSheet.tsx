import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, Check, Clock3, ImagePlus, Loader2, RotateCw, Trash2, Users, X } from 'lucide-react'
import { ActionSheet, Button, Sheet } from '@/components/piel'
import { useToast } from '@/hooks/useToast'
import {
  AUTOGUARDADO_MS,
  ETIQUETA_FOTO,
  CONTINGENCIAS_SUGERIDAS,
  IMPACTOS,
  MAX_FOTOS_EVENTO,
  MAX_TIPO_OTRO,
  MAX_TITULO_EVENTO,
  TIPOS_EVENTO,
  VENTANAS_SUGERIDAS,
} from '@/config/bitacora'
import type {
  EtiquetaFoto,
  EventoBitacora,
  EventoBitacoraDatos,
  FotoEvento,
  ImpactoEvento,
  PresenciaBitacora,
  RepuestoUsado,
  TipoEvento,
  TurnoMantencion,
} from '@/services/bitacora/bitacora.types'
import {
  aFormulario,
  camposACambiar,
  ETIQUETA_CAMPO as NOMBRE_CAMPO,
  fusionarFormulario,
  mismaLista,
  tieneContenido,
  type CampoFormulario,
  type CamposFormulario,
} from '@/services/bitacora/borradores'
import { NOMBRE_DISPOSITIVO } from '@/services/bitacora/presencia'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/store'
import { autorVisible } from '@/services/bitacora/bitacora.types'
import { copiaDeOrigen, etiquetaCortaTurno } from '@/services/bitacora/entregaTurno'
import { borrarFotoOEncolar, subirFotoBitacora } from '@/services/bitacora/fotosBitacora'
import { SelectorTecnico } from './SelectorTecnico'
import { SelectorParticipantes } from './SelectorParticipantes'
import { BuscadorEquipo } from './BuscadorEquipo'
import type { OpcionEquipo } from '@/services/bitacora/buscarEquipos'
import { tecnicoRecordado } from './tecnicoRecordado'
import {
  DIAS_PARA_MOVER,
  formatoMinutos,
  horaCalzaEnTurno,
  horaDe,
  horarioTurno,
  horaSugeridaParaEvento,
  minutosEntre,
  turnoDesdeId,
  turnoMantencionEn,
  turnosElegibles,
} from '@/services/bitacora/turnoMantencion'
import { etiquetaCodigoEquipo, limpiarTipo, normalizarRepuestos, normalizarTipo, opcionesUbicacion } from '@/services/bitacora/presentacionEvento'
import { vibrar } from '@/services/bitacora/vibrar'
import { RepuestosUsados } from './RepuestosUsados'
import type { FuenteRepuestos } from '@/services/bitacora/repuestosBitacora'
import { fuenteRepuestosFirestore } from '@/services/bitacora/repuestosFirestore'

interface Subida {
  clave: string
  etiqueta: EtiquetaFoto
  archivo: File
  error?: string
}

export interface EventoBitacoraSheetProps {
  open: boolean
  turno: TurnoMantencion
  /** null = evento nuevo. */
  evento: EventoBitacora | null
  /** Id reservado para un evento nuevo (sus fotos se suben a esa carpeta). */
  idNuevo: string
  sugerenciasEquipo: string[]
  /** Tipos escritos a mano en el turno: se sugieren al elegir «Otro». */
  sugerenciasTipo?: string[]
  /** Teléfono con pase de bitácora: registra siempre su técnico, sin elegir. */
  autorFijo?: string | null
  /** De dónde salen los repuestos (la vitrina usa uno de ejemplo). */
  fuenteRepuestos?: FuenteRepuestos
  /** El pase de bitácora no escribe en el maestro de repuestos (nombre común). */
  puedeEditarMaestro?: boolean
  /** Los eventos del turno (ordenados), para ubicar uno sin hora entre ellos. */
  eventosDelTurno?: readonly EventoBitacora[]
  /** `deTurno` = presentes del turno (botones rápidos); `todos` = lista de técnicos completa. */
  tecnicos: { deTurno: string[]; todos: string[] }
  /** Equipos y áreas de la jerarquía para el buscador. */
  opcionesEquipo: readonly OpcionEquipo[]
  cargandoEquipos: boolean
  /** Por defecto sube a Storage; la vitrina de desarrollo la reemplaza. */
  subirFoto?: typeof subirFotoBitacora
  onGuardar: (id: string, datos: EventoBitacoraDatos, esNuevo: boolean) => Promise<void>
  onBorrar: (evento: EventoBitacora) => Promise<void>
  /** Si viene de «Resolver»: el pendiente de un turno anterior que este evento cierra. */
  pendienteOrigen?: EventoBitacora | null
  /**
   * El MISMO evento tal como está ahora en el servidor (cambia en vivo). Con él
   * se incorporan los cambios de otro equipo mientras la hoja está abierta.
   */
  eventoVivo?: EventoBitacora | null
  /** Otros equipos que tienen este evento abierto ahora. */
  otrosEditando?: readonly PresenciaBitacora[]
  onClose: () => void
}

const CLAVE_RECIENTES = 'bitacora.equiposRecientes.v1'
const CLAVE_TIPOS = 'bitacora.tiposRecientes.v1'
const SIN_SENAL = 'Sin señal. Se sube sola cuando vuelva la conexión.'
/** Fotos que se procesan a la vez (ver `subirEnTanda`). */
const LOTE_SUBIDA = 2

/** Resumen comparable de lo que hay en pantalla: si no cambió, no se guarda de nuevo. */
function firmaDe(
  campos: CamposFormulario,
  quien: string,
  participantes: readonly string[],
  fotos: readonly FotoEvento[],
): string {
  return JSON.stringify([campos, quien, participantes, fotos.map((f) => f.path)])
}

const HORA_VALIDA = /^\d{2}:\d{2}$/

/** «Día 17-09»: el nombre del turno sin la palabra «Turno» (la fila ya la dice). */
function nombreTurnoCorto(id: string): string {
  const s = etiquetaCortaTurno(id).replace(/^Turno\s+/i, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function leerRecientes(clave = CLAVE_RECIENTES): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? '[]')
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

function recordar(clave: string, valor: string, cuantos: number) {
  const e = valor.trim()
  if (!e) return
  try {
    const lista = [e, ...leerRecientes(clave).filter((x) => x.toLowerCase() !== e.toLowerCase())].slice(0, cuantos)
    localStorage.setItem(clave, JSON.stringify(lista))
  } catch {
    /* sin almacenamiento local: solo se pierde la sugerencia */
  }
}

const recordarEquipo = (equipo: string) => recordar(CLAVE_RECIENTES, equipo, 12)

/**
 * Interruptor de fila completa, estilo iOS (la fila entera es el objetivo
 * táctil). Lo usan «Sin hora» y «Queda pendiente».
 */
function FilaInterruptor({
  activo,
  onCambiar,
  titulo,
  detalle,
}: {
  activo: boolean
  onCambiar: (v: boolean) => void
  titulo: string
  detalle?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-card bg-muted-foreground/10 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex flex-col">
        <span className="text-body font-semibold">{titulo}</span>
        {detalle && <span className="text-footnote text-muted-foreground">{detalle}</span>}
      </span>
      <span className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${activo ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <span className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${activo ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
      </span>
    </button>
  )
}

// Estilo de control iOS: relleno suave, sin borde. 16 px en inputs para que
// iOS no haga zoom al enfocar.
const CAMPO =
  'h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'
const ETIQUETA_CAMPO = 'mb-1.5 block text-footnote text-muted-foreground'

/** «21:30» de un Date, en hora local: es la hora que el técnico ve en el reloj. */
const horaHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={[
        'min-h-[44px] shrink-0 rounded-full px-4 text-footnote font-semibold transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        activo ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/10 text-foreground hover:bg-muted-foreground/15',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function EventoBitacoraSheet({
  open,
  turno,
  evento,
  idNuevo,
  sugerenciasEquipo,
  sugerenciasTipo = [],
  autorFijo = null,
  fuenteRepuestos = fuenteRepuestosFirestore,
  puedeEditarMaestro = true,
  eventosDelTurno = [],
  tecnicos,
  opcionesEquipo,
  cargandoEquipos,
  subirFoto = subirFotoBitacora,
  onGuardar,
  onBorrar,
  onClose,
  pendienteOrigen = null,
  eventoVivo = null,
  otrosEditando = [],
}: EventoBitacoraSheetProps) {
  const { toast } = useToast()
  const esNuevo = !evento
  const eventoId = evento?.id ?? idNuevo

  const [quien, setQuien] = useState('')
  /** Turno donde queda el evento (se puede corregir si se registró en otro, 17-09). */
  const [turnoDestino, setTurnoDestino] = useState('')
  const campoId = useId()
  /** Al editar, «quién edita» va plegado en una línea; «Cambiar» muestra los chips (17-09). */
  const [cambiarQuien, setCambiarQuien] = useState(false)
  /** Quién lo registró, editable en un evento ya publicado (se eligió mal o lo cargó otro). */
  const [registrador, setRegistrador] = useState('')
  const [participantes, setParticipantes] = useState<string[]>([])
  const [equipoId, setEquipoId] = useState<string | null>(null)
  const [equipoCodigo, setEquipoCodigo] = useState('')
  const [repuestos, setRepuestos] = useState<RepuestoUsado[]>([])
  const [tipo, setTipo] = useState<TipoEvento>('falla')
  const [tipoOtro, setTipoOtro] = useState('')
  const [equipo, setEquipo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  /**
   * «Sin hora» (decisión de Orel 16-09-2026). Las horas que había quedan en
   * pantalla escondidas: si se apaga, vuelven.
   */
  const [sinHora, setSinHora] = useState(false)
  /** Solo sin hora: minutos desde el inicio del turno ('' = donde se registró). */
  const [posicion, setPosicion] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaTermino, setHoraTermino] = useState('')
  /**
   * `null` = todavía nadie contestó. Arrancaba en 'no-aplica' y esa respuesta
   * de fábrica se quedaba: 19 de 22 eventos reales decían que el evento no
   * afectó al proceso, incluida una Baader 142 en falla (18-09-2026).
   */
  const [impacto, setImpacto] = useState<ImpactoEvento | null>(null)
  const [contingencia, setContingencia] = useState('')
  const [horaDeAhora, setHoraDeAhora] = useState(() => horaHHMM(new Date()))
  useEffect(() => {
    // El rótulo del botón dice la hora que va a poner: si se queda quieto,
    // miente. Se refresca cada 30 s, que alcanza para un campo de 5 minutos.
    const t = setInterval(() => setHoraDeAhora(horaHHMM(new Date())), 30_000)
    return () => clearInterval(t)
  }, [])
  const [minutos, setMinutos] = useState('')
  const [ventana, setVentana] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [fotos, setFotos] = useState<FotoEvento[]>([])
  const [subidas, setSubidas] = useState<Subida[]>([])
  const [guardando, setGuardando] = useState(false)
  const [confirmarSinFotos, setConfirmarSinFotos] = useState(false)
  /** Cerrar un evento PUBLICADO con cambios sin guardar pide confirmación (HIG «Sheets»). */
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Fotos subidas en ESTA edición: si se cancela, se borran de Storage. */
  const subidasNuevas = useRef<string[]>([])
  /** Fotos del evento guardado que se quitaron: se borran recién al guardar. */
  const quitadas = useRef<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const etiquetaPendiente = useRef<EtiquetaFoto>('foto')
  /**
   * Cambia al abrir, cancelar y guardar. Una subida que termina con otra
   * «sesión» ya no pertenece a este formulario: se borra de Storage en vez de
   * quedar huérfana o, peor, colarse en el siguiente evento que se abra.
   */
  const sesion = useRef(0)
  /** Subidas que el técnico quitó mientras iban en camino (ver `descartarSubida`). */
  const descartadas = useRef<Set<string>>(new Set())
  const tecnicosRef = useRef(tecnicos)
  tecnicosRef.current = tecnicos

  // ── Borrador que se guarda solo (mockup aprobado 16-09-2026) ──
  /** ¿El documento ya existe en la bitácora? (un evento nuevo, recién al primer autoguardado). */
  const existeEnServidor = useRef(false)
  /** Lo creó ESTA hoja: mientras sea borrador, «quién registra» se puede cambiar. */
  const creadoAqui = useRef(false)
  /** Última versión conocida del servidor, para la fusión campo por campo. */
  const base = useRef<CamposFormulario | null>(null)
  /** Fotos que el servidor tiene (para guardar solo los cambios). */
  const fotosServidor = useRef<FotoEvento[]>([])
  /** Firma de lo último guardado: si la pantalla no cambió, no se escribe. */
  const ultimaFirma = useRef('')
  /** Se vio el documento vivo al menos una vez (para saber si lo borraron afuera). */
  const vistoVivo = useRef(false)
  const remotoConflicto = useRef<CamposFormulario | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  const [porGuardar, setPorGuardar] = useState(false)
  const [conflictos, setConflictos] = useState<CampoFormulario[]>([])
  const [eliminadoAfuera, setEliminadoAfuera] = useState(false)
  /** Participantes y autor tal como están en el servidor (para escribir solo lo cambiado). */
  const participantesBase = useRef<string[]>([])
  const quienBase = useRef('')
  /**
   * Se abrió como borrador (nuevo o sin publicar): se guarda SOLO y «Cerrar»
   * guarda. Se decide al abrir y no cambia aunque otro lo publique: antes el
   * mismo botón pasaba de «Cerrar» a «Cancelar» y descartaba lo tecleado
   * (revisión 16-09).
   */
  const [autoguarda, setAutoguarda] = useState(false)
  const estadoVivo = eventoVivo?.estado ?? evento?.estado
  const publicadoAfuera = autoguarda && Boolean(eventoVivo) && eventoVivo?.estado !== 'borrador'
  /** Todavía sin publicar: el botón principal es «Listo». */
  const modoBorrador = autoguarda && !publicadoAfuera
  /**
   * En un evento publicado, «quién lo registró» se puede corregir (17-09): un
   * borrador propio lo ajusta con «Quién continúa», así que ahí no hace falta.
   */
  const autorEditable = !esNuevo && !modoBorrador
  // Turnos que se pueden elegir: el reloj de AHORA (no el del turno que se mira).
  const turnoEnCurso = useMemo(() => turnoMantencionEn(), [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const origenPendienteId = pendienteOrigen?.turnoId ?? evento?.resuelvePendiente?.turnoId ?? null
  const opcionesTurno = useMemo(() => {
    const lista = turnosElegibles(turnoEnCurso, DIAS_PARA_MOVER, origenPendienteId)
    // El turno propio siempre está, aunque sea más viejo que la ventana.
    return lista.some((t) => t.id === turno.id) ? lista : [turno, ...lista]
  }, [turnoEnCurso, origenPendienteId, turno])
  const registradoEnServidor = (eventoVivo ?? evento)?.registradoPor ?? ''
  /** El autor que vale para no repetirlo como participante. */
  const quienRegistro = esNuevo ? quien : autorEditable && registrador.trim() ? registrador.trim() : registradoEnServidor || quien
  const usuario = useAuthStore((s) => s.user)
  const actual = eventoVivo ?? evento
  // Eliminar: quien lo creó o un supervisor (como la regla). Con la cuenta
  // compartida, todos cuentan como quien lo creó.
  const puedeEliminar =
    (!actual && existeEnServidor.current) ||
    actual?.creadoPor === auth.currentUser?.uid ||
    usuario?.rol === 'admin' ||
    usuario?.rol === 'supervisor'

  // Cargar el formulario cada vez que se abre (nuevo o edición).
  useEffect(() => {
    if (!open) return
    sesion.current++
    // El nombre recordado solo vale si sigue en la lista (pudo corregirse o quitarse).
    const recordado = tecnicoRecordado()
    const lista = tecnicosRef.current.todos
    const quienInicial = autorFijo ?? (lista.length === 0 || lista.includes(recordado) ? recordado : '')
    setQuien(quienInicial)
    setTurnoDestino(evento?.turnoId ?? turno.id)
    setCambiarQuien(false)
    setRegistrador(evento?.registradoPor ?? '')
    setParticipantes(evento?.participantes ?? [])
    // «Resolver pendiente»: el equipo, su vínculo y el tipo vienen del pendiente original.
    setEquipoId(evento?.equipoId ?? pendienteOrigen?.equipoId ?? null)
    setEquipoCodigo(evento?.equipoCodigo ?? pendienteOrigen?.equipoCodigo ?? '')
    setRepuestos(normalizarRepuestos(evento?.repuestos))
    setTipo(evento?.tipo ?? pendienteOrigen?.tipo ?? 'falla')
    setTipoOtro(evento?.tipoOtro ?? pendienteOrigen?.tipoOtro ?? '')
    setEquipo(evento?.equipo ?? pendienteOrigen?.equipo ?? '')
    setTitulo(evento?.titulo ?? '')
    setDescripcion(evento?.descripcion ?? '')
    setSinHora(evento ? evento.horaInicio === '' : false)
    setPosicion(evento && evento.horaInicio === '' && typeof evento.posicionMin === 'number' ? String(evento.posicionMin) : '')
    // Un evento sin hora deja lista la hora sugerida por si se apaga «Sin hora».
    setHoraInicio(evento?.horaInicio || horaSugeridaParaEvento(turno))
    setHoraTermino(evento?.horaTermino ?? '')
    // Un evento que ya existe conserva lo suyo; uno nuevo nace sin responder.
    setImpacto(evento?.impacto ?? null)
    setContingencia(evento?.contingencia ?? '')
    setMinutos(evento?.minutosParada != null ? String(evento.minutosParada) : '')
    setVentana(evento?.ventana ?? '')
    setPendiente(evento?.pendiente ?? false)
    setFotos(evento?.fotos ?? [])
    setSubidas([])
    setGuardando(false)
    setConfirmarSinFotos(false)
    setError(null)
    subidasNuevas.current = []
    quitadas.current = []
    descartadas.current = new Set()
    const inicial: CamposFormulario = evento
      ? aFormulario(evento)
      : {
          tipo: pendienteOrigen?.tipo ?? 'falla',
          tipoOtro: pendienteOrigen?.tipo === 'otro' ? (pendienteOrigen.tipoOtro ?? '') : '',
          equipo: pendienteOrigen?.equipo ?? '',
          equipoId: pendienteOrigen?.equipoId ?? null,
          equipoCodigo: pendienteOrigen?.equipoId ? (pendienteOrigen.equipoCodigo ?? '') : '',
          titulo: '',
          repuestos: '[]',
          descripcion: '',
          contingencia: '',
          horaInicio: horaSugeridaParaEvento(turno),
          horaTermino: '',
          posicion: '',
          impacto: 'no-aplica',
          minutos: '',
          ventana: '',
          pendiente: false,
        }
    existeEnServidor.current = Boolean(evento)
    creadoAqui.current = false
    setAutoguarda(!evento || evento.estado === 'borrador')
    participantesBase.current = evento?.participantes ?? []
    quienBase.current = quienInicial
    // Recién se da por «visto» cuando llega del servidor: al continuar un
    // borrador de OTRO turno, esa lista tarda un instante en cargar y no puede
    // leerse como «lo borraron» (revisión 16-09).
    vistoVivo.current = false
    base.current = inicial
    fotosServidor.current = evento?.fotos ?? []
    ultimaFirma.current = firmaDe(inicial, quienInicial, evento?.participantes ?? [], evento?.fotos ?? [])
    remotoConflicto.current = null
    setGuardadoEn(null)
    setPorGuardar(false)
    setConflictos([])
    setEliminadoAfuera(false)
  }, [open, evento, turno, pendienteOrigen, autorFijo])

  const duracion = sinHora ? null : minutosEntre(horaInicio, horaTermino || null)
  const horaFaltante = !sinHora && !HORA_VALIDA.test(horaInicio)

  // Lo que se guarda: el texto de «Otro» solo con ese tipo, y sin horas si es «Sin hora».
  const formularioActual = (): CamposFormulario => ({
    tipo,
    tipoOtro: tipo === 'otro' ? tipoOtro : '',
    equipo,
    equipoId,
    equipoCodigo: equipoId ? equipoCodigo : '',
    titulo,
    repuestos: JSON.stringify(normalizarRepuestos(repuestos)),
    descripcion,
    horaInicio: sinHora ? '' : horaInicio,
    horaTermino: sinHora ? '' : horaTermino,
    posicion: sinHora ? posicion : '',
    impacto: impacto ?? 'no-aplica',
    minutos,
    ventana,
    contingencia,
    pendiente,
  })
  const firmaActual = firmaDe(formularioActual(), quien, participantes, fotos)

  const aplicarFormulario = (v: CamposFormulario, previo: CamposFormulario) => {
    if (v.tipo !== previo.tipo) setTipo(v.tipo)
    if (v.tipoOtro !== previo.tipoOtro && v.tipo === 'otro') setTipoOtro(v.tipoOtro)
    if (v.equipo !== previo.equipo) setEquipo(v.equipo)
    if (v.equipoId !== previo.equipoId) setEquipoId(v.equipoId)
    if (v.equipoCodigo !== previo.equipoCodigo) setEquipoCodigo(v.equipoCodigo)
    if (v.repuestos !== previo.repuestos) setRepuestos(normalizarRepuestos(JSON.parse(v.repuestos) as RepuestoUsado[]))
    if (v.titulo !== previo.titulo) setTitulo(v.titulo)
    if (v.descripcion !== previo.descripcion) setDescripcion(v.descripcion)
    if (v.posicion !== previo.posicion) setPosicion(v.posicion)
    if (v.horaInicio !== previo.horaInicio || v.horaTermino !== previo.horaTermino) {
      // '' = el otro puso «Sin hora»: se enciende sin borrar las horas escondidas.
      if (v.horaInicio === '') setSinHora(true)
      else {
        setSinHora(false)
        setHoraInicio(v.horaInicio)
        setHoraTermino(v.horaTermino)
      }
    }
    if (v.impacto !== previo.impacto) setImpacto(v.impacto)
    if (v.minutos !== previo.minutos) setMinutos(v.minutos)
    if (v.ventana !== previo.ventana) setVentana(v.ventana)
    if (v.pendiente !== previo.pendiente) setPendiente(v.pendiente)
  }

  const armarDatos = (estado: 'borrador' | 'listo', crear: boolean): EventoBitacoraDatos => {
    const minutosNum = minutos.trim() === '' ? null : Number(minutos)
    const minutosValidos = minutosNum != null && Number.isFinite(minutosNum) && minutosNum >= 0 && minutosNum <= 1440
    return {
      tipo,
      tipoOtro: tipo === 'otro' ? tipoOtro : null,
      equipo,
      equipoCodigo: equipoId ? equipoCodigo : null,
      repuestos: normalizarRepuestos(repuestos),
      titulo,
      descripcion,
      horaInicio: sinHora ? '' : horaInicio,
      horaTermino: sinHora ? null : horaTermino || null,
      posicionMin: sinHora && posicion !== '' && Number.isFinite(Number(posicion)) ? Number(posicion) : null,
      // A esta altura la validación ya exigió una respuesta; un borrador a medio
      // escribir sí puede no tenerla y se guarda como «fuera del proceso».
      impacto: impacto ?? 'no-aplica',
      minutosParada: minutosValidos ? minutosNum : null,
      ventana: ventana || null,
      contingencia: impacto === 'afecta-sin-detener' ? contingencia.trim() || null : null,
      pendiente,
      fotos,
      fotosAntes: fotosServidor.current,
      cierreAntes: (eventoVivo ?? evento)?.cierre ?? null,
      quien,
      resuelvePendiente: pendienteOrigen ? copiaDeOrigen(pendienteOrigen) : null,
      // Quien registra no se repite como participante (pudo quedar marcado antes de elegirlo).
      participantes: participantes.filter((p) => p.trim().toLowerCase() !== quienRegistro.trim().toLowerCase()),
      equipoId,
      estado,
      // Turno elegido (el hook lo aplica solo al publicar o guardar).
      ...(turnoDestino && turnoDestino !== turno.id ? { turnoId: turnoDestino } : {}),
      // Corrección de quién lo registró: solo si se eligió a alguien distinto
      // (la clave no va si no cambió: un `undefined` pisaba el autor en la vitrina).
      ...(!crear && autorEditable && registrador.trim() && registrador.trim() !== registradoEnServidor ? { registradoPor: registrador.trim() } : {}),
      // El autor se ajusta solo en un borrador creado aquí y solo si cambió
      // (la regla no deja tocarlo en uno publicado).
      fijarAutor: !crear && creadoAqui.current && quien.trim() !== quienBase.current.trim() && estadoVivo === 'borrador',
      camposCambiados: crear
        ? undefined
        : camposACambiar(base.current ?? formularioActual(), formularioActual(), participantesBase.current, participantes),
    }
  }

  /** Lo guardado pasa a ser la nueva referencia. */
  const marcarGuardado = () => {
    base.current = formularioActual()
    participantesBase.current = participantes
    quienBase.current = quien
    fotosServidor.current = fotos
    ultimaFirma.current = firmaActual
  }

  /**
   * Guarda el borrador tal como está. No espera al servidor (la escritura queda
   * en el teléfono y se sube sola). Abrir y cerrar sin escribir no crea nada.
   */
  const guardarBorradorAhora = () => {
    if (!autoguarda || eliminadoAfuera) return
    // Con la hora a medio escribir la regla rechaza el documento: no se intenta
    // (se avisa arriba). «Sin hora» sí se guarda.
    if (horaFaltante) return
    const crear = !existeEnServidor.current
    const datos = armarDatos('borrador', crear)
    if (crear && !tieneContenido(datos)) return
    const cambiaronFotos = !mismaLista(
      fotos.map((f) => f.path),
      fotosServidor.current.map((f) => f.path),
    )
    // Abrir, mirar y cerrar no escribe nada: sin señal, esa escritura vacía
    // quedaba en cola con una copia vieja del evento (revisión 16-09).
    if (!crear && !datos.camposCambiados?.length && !cambiaronFotos && !datos.fijarAutor && !datos.registradoPor) {
      ultimaFirma.current = firmaActual
      setPorGuardar(false)
      return
    }
    void onGuardar(eventoId, datos, crear).catch((e: unknown) => {
      // Si la creación falló, el documento NO existe: el próximo intento vuelve
      // a crearlo en vez de actualizar algo que no está (revisión 16-09).
      if (crear) {
        existeEnServidor.current = false
        creadoAqui.current = false
        ultimaFirma.current = ''
      }
      setError(e instanceof Error ? e.message : 'No se pudo guardar el borrador.')
    })
    if (crear) creadoAqui.current = true
    existeEnServidor.current = true
    marcarGuardado()
    // Las fotos ya son del borrador: cerrar la hoja NO las borra.
    subidasNuevas.current = []
    quitadas.current = []
    setGuardadoEn(new Date())
    setPorGuardar(false)
  }
  const guardarBorradorRef = useRef(guardarBorradorAhora)
  guardarBorradorRef.current = guardarBorradorAhora

  // Autoguardado: una pausa sin cambios y se guarda.
  useEffect(() => {
    if (!open || !autoguarda) return
    if (firmaActual === ultimaFirma.current) {
      setPorGuardar(false)
      return
    }
    setPorGuardar(true)
    const t = setTimeout(() => guardarBorradorRef.current(), AUTOGUARDADO_MS)
    return () => clearTimeout(t)
  }, [firmaActual, open, autoguarda])

  // Lo que llega de OTRO equipo mientras la hoja está abierta se incorpora
  // campo por campo: si no toqué ese campo, se adopta; si los dos lo cambiamos
  // distinto, queda lo mío y se avisa (nadie pisa en silencio al otro).
  useEffect(() => {
    if (!open) return
    if (!eventoVivo) {
      if (vistoVivo.current && existeEnServidor.current) setEliminadoAfuera(true)
      return
    }
    vistoVivo.current = true
    existeEnServidor.current = true
    setEliminadoAfuera(false)
    const previo = base.current
    if (!previo) return
    const local = formularioActual()
    const limpio = firmaActual === ultimaFirma.current
    const remoto = aFormulario(eventoVivo)
    const f = fusionarFormulario(previo, local, remoto)
    base.current = f.base
    if (f.conflictos.length) {
      remotoConflicto.current = remoto
      setConflictos((c) => [...new Set([...c, ...f.conflictos])])
    }
    aplicarFormulario(f.valores, local)
    // Fotos: las que agregó o quitó el otro.
    const remotas = eventoVivo.fotos ?? []
    const llegaron = remotas.filter((r) => !fotosServidor.current.some((a) => a.path === r.path))
    const seFueron = fotosServidor.current.filter((a) => !remotas.some((r) => r.path === a.path))
    let fotosNuevas = fotos
    if (llegaron.length || seFueron.length) {
      fotosNuevas = [
        ...fotos.filter((p) => !seFueron.some((q) => q.path === p.path)),
        ...llegaron.filter((n) => !fotos.some((p) => p.path === n.path)),
      ]
      setFotos(fotosNuevas)
    }
    fotosServidor.current = remotas
    // Participantes: los del otro se adoptan si yo no toqué la lista.
    const remotosP = eventoVivo.participantes ?? []
    let participantesNuevos = participantes
    if (!mismaLista(remotosP, participantesBase.current)) {
      if (mismaLista(participantes, participantesBase.current)) {
        participantesNuevos = remotosP
        setParticipantes(remotosP)
      }
      participantesBase.current = remotosP
    }
    // Si no había nada mío sin guardar, lo recién llegado NO es un cambio mío:
    // no se reescribe lo mismo que el otro acaba de guardar.
    if (limpio && !f.conflictos.length) ultimaFirma.current = firmaDe(f.valores, quien, participantesNuevos, fotosNuevas)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el documento vivo
  }, [eventoVivo, open])

  const usarLaSuya = () => {
    const remoto = remotoConflicto.current
    if (!remoto) return
    const local = formularioActual()
    const v = { ...local }
    for (const c of conflictos) (v as unknown as Record<string, unknown>)[c] = remoto[c]
    if (conflictos.includes('equipo')) {
      v.equipoId = remoto.equipoId
      v.equipoCodigo = remoto.equipoCodigo
    }
    if (conflictos.includes('tipo')) v.tipoOtro = remoto.tipoOtro
    if (conflictos.includes('horaInicio') || conflictos.includes('horaTermino')) {
      v.horaInicio = remoto.horaInicio
      v.horaTermino = remoto.horaTermino
    }
    aplicarFormulario(v, local)
    setConflictos([])
  }
  const equiposSugeridos = useMemo(() => {
    const vistos = new Set<string>()
    return [...sugerenciasEquipo, ...(open ? leerRecientes() : [])].filter((e) => {
      const k = e.trim().toLowerCase()
      if (!k || vistos.has(k)) return false
      vistos.add(k)
      return true
    })
  }, [sugerenciasEquipo, open])

  /** Tipos escritos antes (este turno y este teléfono), sin repetir. */
  const tiposSugeridos = useMemo(() => {
    const vistos = new Set<string>()
    return [...sugerenciasTipo, ...(open ? leerRecientes(CLAVE_TIPOS) : [])]
      .map(limpiarTipo)
      .filter((t) => {
        const k = normalizarTipo(t)
        if (!k || vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      .slice(0, 6)
  }, [sugerenciasTipo, open])

  // Equipo elegido del buscador: su número (planta y área también, para el rótulo).
  const opcionElegida = equipoId ? (opcionesEquipo.find((o) => o.id === equipoId) ?? null) : null
  // Un evento anterior a este cambio no guardó el número: se completa al cargar la jerarquía.
  useEffect(() => {
    if (open && opcionElegida?.codigo && !equipoCodigo) setEquipoCodigo(opcionElegida.codigo)
  }, [open, opcionElegida, equipoCodigo])

  const cambiarSinHora = (v: boolean) => {
    setSinHora(v)
    // Al volver a «con hora» sin nada escrito, se propone la hora de ahora.
    if (!v && !HORA_VALIDA.test(horaInicio)) setHoraInicio(horaSugeridaParaEvento(turno))
  }

  const subir = async (s: Subida) => {
    if (!navigator.onLine) {
      // Sin señal, Storage reintenta hasta 10 min con la ruedita girando. Mejor
      // decirlo al tiro: la foto queda en la hoja y se sube sola al volver la red.
      setSubidas((prev) => prev.map((x) => (x.clave === s.clave ? { ...x, error: SIN_SENAL } : x)))
      return
    }
    setSubidas((prev) => prev.map((x) => (x.clave === s.clave ? { ...x, error: undefined } : x)))
    const miSesion = sesion.current
    try {
      const foto = await subirFoto(turno.id, eventoId, s.archivo, s.etiqueta)
      if (miSesion !== sesion.current || descartadas.current.has(s.clave)) {
        // Se canceló, se guardó sin esperarla, o el técnico la quitó mientras subía.
        void borrarFotoOEncolar(foto.path)
        return
      }
      subidasNuevas.current.push(foto.path)
      setFotos((prev) => [...prev, foto])
      setSubidas((prev) => prev.filter((x) => x.clave !== s.clave))
    } catch (e) {
      if (miSesion !== sesion.current || descartadas.current.has(s.clave)) return
      const mensaje = (e as { code?: string })?.code === 'storage/unauthorized'
        ? 'Sin permiso para subir (faltan reglas de Storage).'
        : e instanceof Error && e.message.startsWith('Formato')
          ? e.message
          : 'No se pudo subir. Revisa la señal y reintenta.'
      setSubidas((prev) => prev.map((x) => (x.clave === s.clave ? { ...x, error: mensaje } : x)))
    }
  }

  /** Sube la tanda de a `LOTE_SUBIDA` para no decodificar todo a la vez. */
  const subirEnTanda = async (tanda: readonly Subida[]) => {
    const miSesion = sesion.current
    for (let i = 0; i < tanda.length; i += LOTE_SUBIDA) {
      if (miSesion !== sesion.current) return
      await Promise.all(tanda.slice(i, i + LOTE_SUBIDA).map((s) => subir(s)))
    }
  }

  const elegirFotos = (etiqueta: EtiquetaFoto) => {
    etiquetaPendiente.current = etiqueta
    inputRef.current?.click()
  }

  const alElegir = (lista: FileList | null) => {
    if (!lista?.length) return
    const libres = MAX_FOTOS_EVENTO - fotos.length - subidas.length
    const archivos = Array.from(lista).slice(0, Math.max(0, libres))
    if (archivos.length < lista.length) {
      toast({ title: `Máximo ${MAX_FOTOS_EVENTO} fotos por evento`, description: 'Las demás no se agregaron.' })
    }
    const nuevas = archivos.map((archivo, i) => ({
      clave: `${Date.now()}-${i}-${archivo.name}`,
      // Si eligen varias desde "Antes", solo la primera es "antes".
      etiqueta: i === 0 ? etiquetaPendiente.current : ('foto' as EtiquetaFoto),
      archivo,
    }))
    setSubidas((prev) => [...prev, ...nuevas])
    // Cada foto nueva vuelve a pedir la confirmación: si no, el «toca Guardar
    // otra vez» de una foto anterior servía de permiso para guardar sin ESTA,
    // en silencio (revisión 15-09).
    setConfirmarSinFotos(false)
    // De a DOS: `createImageBitmap` decodifica la foto ORIGINAL (12 MP ≈ 36 MB
    // de píxeles) antes de achicarla. Ocho a la vez recargaban la pestaña en un
    // celular de gama media y se perdía el formulario entero (revisión 15-09).
    void subirEnTanda(nuevas)
    if (inputRef.current) inputRef.current.value = ''
  }

  /**
   * Saca de la hoja una foto que todavía sube o que no va a subir nunca. Si
   * llega a terminar igual, `sesion` ya no calza y se borra sola de Storage.
   */
  const descartarSubida = (clave: string) => {
    descartadas.current.add(clave)
    setSubidas((prev) => prev.filter((x) => x.clave !== clave))
  }

  const quitarFoto = (foto: FotoEvento) => {
    setFotos((prev) => prev.filter((f) => f.path !== foto.path))
    if (subidasNuevas.current.includes(foto.path)) {
      subidasNuevas.current = subidasNuevas.current.filter((p) => p !== foto.path)
      void borrarFotoOEncolar(foto.path)
    } else {
      quitadas.current.push(foto.path)
    }
  }

  const cancelar = () => {
    // Lo subido en esta edición y no guardado no debe quedar huérfano; lo que
    // todavía está subiendo se borra solo al terminar (cambia la sesión).
    sesion.current++
    subidasNuevas.current.forEach((p) => void borrarFotoOEncolar(p))
    subidasNuevas.current = []
    onClose()
  }

  /** Borrador: cerrar GUARDA (se sigue en otro equipo). Publicado: cancela. */
  const cerrarHoja = () => {
    if (!autoguarda) {
      // HIG «Sheets»: un evento publicado NO se autoguarda, así que cerrar con
      // cambios los pierde. Con guantes, un roce en el fondo o un Escape bastan:
      // antes de descartar, se pregunta (revisión 18-09-2026).
      if (firmaActual !== ultimaFirma.current) {
        setConfirmarDescarte(true)
        return
      }
      cancelar()
      return
    }
    // TODAS las que no están guardadas, también las que fallaron por falta de
    // señal: esos archivos no están en ningún otro lado (revisión 16-09).
    if (subidas.length > 0 && !confirmarSinFotos) {
      setConfirmarSinFotos(true)
      setError(
        `${subidas.length === 1 ? 'Una foto no se ha subido' : `${subidas.length} fotos no se han subido`}. ` +
          'Si cierras ahora se pierden: espera la señal o toca Cerrar otra vez.',
      )
      return
    }
    guardarBorradorAhora()
    sesion.current++
    // Lo que no alcanzó a entrar al borrador (nada con contenido) se limpia.
    subidasNuevas.current.forEach((p) => void borrarFotoOEncolar(p))
    subidasNuevas.current = []
    onClose()
  }

  const autoguardaRef = useRef(autoguarda)
  autoguardaRef.current = autoguarda
  const abiertaRef = useRef(open)
  abiertaRef.current = open

  // Irse de la pantalla sin tocar Cancelar ni Guardar (lo llaman por radio y
  // toca otra pestaña) dejaba las fotos ya subidas sin dueño: ningún documento
  // las menciona y nadie las puede encontrar después (revisión 15-09). Se anotan
  // para borrarlas; la cola sobrevive incluso a que se cierre la app.
  useEffect(() => {
    // Lee el ref al DESMONTAR: si el evento se guardó, `guardar` ya lo vació y
    // aquí no queda nada que borrar. Un borrador abierto, en cambio, se GUARDA:
    // irse de la pantalla no puede perder lo escrito.
    return () => {
      if (autoguardaRef.current && abiertaRef.current) guardarBorradorRef.current()
      // Lo que termine de subir después ya no tiene hoja: se borra solo.
      sesion.current++
      subidasNuevas.current.forEach((p) => void borrarFotoOEncolar(p))
    }
  }, [])

  // Al volver la señal, reintentar solas las fotos que fallaron.
  const subidasRef = useRef(subidas)
  subidasRef.current = subidas
  const subirRef = useRef(subir)
  subirRef.current = subir
  useEffect(() => {
    if (!open) return
    const alVolver = () => subidasRef.current.filter((s) => s.error).forEach((s) => void subirRef.current(s))
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [open])

  const guardar = async () => {
    setError(null)
    // Con la cuenta compartida, sin esto no se sabría quién registró. Si el
    // calendario no cargó (sin lista), se guarda con el nombre de la cuenta.
    if (tecnicos.todos.length > 0 && !quien.trim()) {
      setError(esNuevo ? 'Elige quién registra el evento.' : 'Elige quién está editando.')
      return
    }
    if (tipo === 'otro' && !limpiarTipo(tipoOtro)) {
      setError('Escribe el tipo o elige uno de la lista.')
      return
    }
    if (horaFaltante) {
      setError('Falta la hora de inicio. Si no aplica, activa «Sin hora».')
      return
    }
    if (!descripcion.trim()) {
      setError('Escribe qué pasó y qué se hizo.')
      return
    }
    const destino = turnoDesdeId(turnoDestino)
    if (destino && destino.id !== turno.id && !sinHora && HORA_VALIDA.test(horaInicio) && !horaCalzaEnTurno(destino, horaInicio)) {
      setError(
        `Las ${horaInicio} no son del ${etiquetaCortaTurno(destino.id).toLowerCase()} (${horarioTurno(destino)}). ` +
          'Corrige la hora o activa «Sin hora».',
      )
      return
    }
    // Un término "antes" del inicio suele ser un typo (10:30 → 10:15) y daba
    // paradas de casi 24 h. Cruzar la medianoche real no pasa de unas horas.
    if (duracion != null && duracion > 12 * 60) {
      const horas = Math.floor(duracion / 60)
      setError(
        `De ${horaInicio} a ${horaTermino} son ${horas} h. Si el término está bien, registra hasta el fin del turno ` +
          'y abre otro evento en el turno siguiente; si no, corrige la hora.',
      )
      return
    }
    if (impacto == null) {
      setError('Falta decir cómo afectó al proceso. Si no tiene que ver con la producción, marca «Fuera del proceso».')
      return
    }
    const minutosNum = minutos.trim() === '' ? null : Number(minutos)
    if (impacto === 'con-parada' && minutosNum != null && (!Number.isFinite(minutosNum) || minutosNum < 0 || minutosNum > 1440)) {
      setError('Los minutos de parada deben estar entre 0 y 1440.')
      return
    }
    // Pendientes de subir = fallidas + las que siguen subiendo (con señal mala
    // Storage reintenta hasta 10 min). Nunca perder una foto en silencio: se
    // avisa y se pide un segundo toque para guardar sin ellas.
    const sinSubir = subidas.length
    if (sinSubir > 0 && !confirmarSinFotos) {
      setConfirmarSinFotos(true)
      setError(
        `${sinSubir === 1 ? 'Una foto aún no se sube' : `${sinSubir} fotos aún no se suben`}. ` +
          `Espera o toca ${modoBorrador ? 'Listo' : 'Guardar'} otra vez para seguir sin ellas.`,
      )
      return
    }
    setGuardando(true)
    // Si nunca se vio el documento en la bitácora (la creación pudo fallar), se
    // crea completo en vez de actualizar algo que no existe (revisión 16-09).
    const crear = !existeEnServidor.current || (creadoAqui.current && !vistoVivo.current)
    try {
      await onGuardar(eventoId, armarDatos('listo', crear), crear)
      vibrar()
      recordarEquipo(equipo)
      if (tipo === 'otro') recordar(CLAVE_TIPOS, limpiarTipo(tipoOtro), 8)
      // Lo que seguía subiendo ya no entra en este evento (se borra al terminar).
      sesion.current++
      subidasNuevas.current = []
      // Las fotos quitadas las borra el hook DESPUÉS del OK del servidor.
      quitadas.current = []
      // HIG «Feedback»: guardar bien no avisa (la fila entra en la lista y la
      // línea de sincronización dice si quedó algo por enviar). Si cambió de
      // turno, la bitácora sí avisa dónde quedó (con «Ver»).
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta.')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async () => {
    const actual = eventoVivo ?? evento
    if (!actual) {
      // Borrador que nunca llegó a guardarse: solo se limpian sus fotos.
      cancelar()
      return
    }
    // Sin «toca de nuevo para confirmar»: la bitácora ofrece «Deshacer»
    // durante unos segundos (mockup iOS 27, 17-09).
    setGuardando(true)
    try {
      subidasNuevas.current.forEach((p) => void borrarFotoOEncolar(p))
      subidasNuevas.current = []
      sesion.current++
      // Con las fotos que tenga AHORA (pudo agregarlas otro equipo).
      await onBorrar({ ...actual, fotos: [...new Map([...(actual.fotos ?? []), ...fotos].map((f) => [f.path, f])).values()] })
      onClose()
    } catch {
      setError('No se pudo borrar. Solo quien lo creó o un supervisor puede borrarlo.')
      setGuardando(false)
    }
  }

  const subiendo = subidas.some((s) => !s.error)
  // HIG «Progress indicators»: decir cuántas van, no un «cargando» sin número.
  const enCola = subidas.filter((s) => !s.error).length
  const totalLote = fotos.length + enCola
  const rotuloSubiendo = enCola > 1 ? `Subiendo ${fotos.length + 1} de ${totalLote}…` : 'Subiendo la foto…' 
  // HIG «Entering data»: el botón se habilita recién con lo obligatorio (quién,
  // tipo, hora o «Sin hora», qué pasó). Lo mismo que valida `guardar`.
  const faltaObligatorio =
    (tecnicos.todos.length > 0 && !quien.trim()) ||
    (tipo === 'otro' && !limpiarTipo(tipoOtro)) ||
    horaFaltante ||
    !descripcion.trim() ||
    // Sin esta respuesta el turno no puede demostrar nada: el evento sale con
    // 0 min de parada y el MTTR queda en «—» (18-09-2026).
    impacto == null
  // HIG «Buttons»: en una hoja, Return activa el botón primario. Solo en los
  // campos simples (hora, minutos): el buscador y los chips usan Enter para elegir.
  const enterGuarda = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !guardando && !faltaObligatorio) {
      e.preventDefault()
      void guardar()
    }
  }
  // HIG «Entering data»: validar al salir del campo, no recién al guardar.
  const validarTermino = () => {
    if (duracion != null && duracion > 12 * 60) {
      setError(
        `De ${horaInicio} a ${horaTermino} son ${Math.floor(duracion / 60)} h. Si el término está bien, registra hasta el fin del turno ` +
          'y abre otro evento en el turno siguiente; si no, corrige la hora.',
      )
    } else if (error?.startsWith('De ')) {
      setError(null)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={cerrarHoja}
      size="wide"
      title={
        pendienteOrigen && esNuevo
          ? 'Resolver pendiente'
          : esNuevo
            ? 'Nuevo evento'
            : modoBorrador
              ? 'Continuar borrador'
              : 'Editar evento'
      }
      actions={
        <>
          <Button variant="tinted" onClick={cerrarHoja} disabled={guardando}>
            {modoBorrador ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button onClick={guardar} disabled={guardando || eliminadoAfuera || faltaObligatorio}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            {guardando
              ? 'Guardando…'
              : subiendo
              ? rotuloSubiendo
              : modoBorrador
                ? (pendienteOrigen || (eventoVivo ?? evento)?.resuelvePendiente) ? 'Listo y cerrar pendiente' : 'Listo'
                : 'Guardar'}
          </Button>
        </>
      }
    >
      {/* `[&>*]:shrink-0`: en un flex vertical con alto acotado, un hijo con
          overflow-x (la fila de tipos) se encoge a 0 px y desaparece. */}
      <div className="-mx-6 flex max-h-[min(68vh,640px)] flex-col gap-5 overflow-y-auto px-6 pb-1 [&>*]:shrink-0">
        {/* Estado del borrador: que se vea que no hay que tocar nada para guardar. */}
        {autoguarda && (
          <p className="-mt-2 flex items-center gap-1.5 text-footnote text-muted-foreground" role="status" aria-live="polite">
            {horaFaltante ? (
              <span className="font-semibold text-ink-warn">Falta la hora de inicio: sin ella no se guarda. Si no aplica, activa «Sin hora».</span>
            ) : porGuardar ? (
              <>
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Guardando borrador…
              </>
            ) : guardadoEn ? (
              <>
                <Check className="size-3.5 text-ink-ok" aria-hidden />
                <span>
                  Borrador guardado · <span className="tabular-nums">{horaDe(guardadoEn)}</span> · el turno lo ve
                </span>
              </>
            ) : existeEnServidor.current ? (
              'Borrador en la bitácora · lo que cambies se guarda solo'
            ) : (
              'Se guarda solo mientras escribes'
            )}
          </p>
        )}

        {otrosEditando.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-ctl bg-muted-foreground/10 px-3 py-2.5">
            <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-footnote">
              <span className="font-semibold">
                {otrosEditando.map((p) => `${p.nombre} (${NOMBRE_DISPOSITIVO[p.dispositivo]})`).join(', ')}
              </span>{' '}
              {otrosEditando.length === 1 ? 'también tiene' : 'también tienen'} abierto este evento. Lo que cambie aparece aquí
              al instante; si los dos cambian lo mismo, se avisa.
            </p>
          </div>
        )}

        {conflictos.length > 0 && (
          <div role="alert" className="flex flex-col gap-2 rounded-ctl bg-muted-foreground/10 px-3 py-2.5">
            <p className="text-footnote font-semibold text-ink-warn">
              Otro equipo cambió {conflictos.map((c) => NOMBRE_CAMPO[c]).join(', ')} mientras tú también lo cambiabas.
            </p>
            {conflictos.includes('descripcion') && remotoConflicto.current?.descripcion && (
              <p className="line-clamp-4 whitespace-pre-line text-footnote text-muted-foreground">
                Su versión: «{remotoConflicto.current.descripcion}»
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="tinted" size="sm" onClick={usarLaSuya}>
                Usar la suya
              </Button>
              <Button variant="plain" size="sm" onClick={() => setConflictos([])}>
                Mantener la mía
              </Button>
            </div>
          </div>
        )}

        {eliminadoAfuera && (
          <div role="alert" className="rounded-ctl bg-muted-foreground/10 px-3 py-2.5">
            <p className="text-footnote font-semibold text-ink-warn">Este evento ya no está en la bitácora.</p>
            <p className="text-footnote text-muted-foreground">
              Lo borraron en otro equipo o el servidor no lo aceptó. Lo que tienes en pantalla no se guardó; sus fotos ya no
              están.
            </p>
            <Button
              variant="tinted"
              size="sm"
              className="mt-2"
              onClick={() => {
                // Las fotos se borraron junto con el evento: recrearlo con ellas
                // dejaba enlaces rotos (revisión 16-09).
                setFotos([])
                fotosServidor.current = []
                existeEnServidor.current = false
                vistoVivo.current = false
                creadoAqui.current = false
                setEliminadoAfuera(false)
                ultimaFirma.current = ''
              }}
            >
              Volver a crearlo con lo que tengo
            </Button>
          </div>
        )}

        {publicadoAfuera && (
          <p className="rounded-ctl bg-muted-foreground/10 px-3 py-2.5 text-footnote">
            <span className="font-semibold">Otro equipo ya lo publicó.</span> Lo que cambies se sigue guardando solo.
          </p>
        )}

        {pendienteOrigen && esNuevo && (
          <div className="rounded-ctl bg-muted-foreground/10 px-3 py-2.5">
            <p className="text-footnote font-semibold text-ink-warn">
              Viene del {etiquetaCortaTurno(pendienteOrigen.turnoId)} · {autorVisible(pendienteOrigen)}
            </p>
            <p className="line-clamp-3 text-footnote text-foreground">
              {[pendienteOrigen.equipo, pendienteOrigen.descripcion].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 md:gap-x-7">
        <div className="flex min-w-0 flex-col gap-5">
        {/* Quién: con la cuenta compartida de Mantención es el único dato de autoría.
            Con pase de bitácora es el dueño del pase, sin elegir. */}
        {autorFijo && (
          <p className="text-footnote text-muted-foreground">
            {esNuevo ? 'Registra' : 'Edita'}: <span className="font-semibold text-foreground">{autorFijo}</span>
            {!esNuevo && !autorEditable && evento && autorVisible(evento) !== autorFijo ? ` · lo empezó ${autorVisible(evento)}` : ''}
          </p>
        )}
        {tecnicos.todos.length > 0 && !autorFijo && (
          <div>
            {/* Al editar, el nombre recordado casi nunca cambia: una línea en vez
                de tres chips. Al crear, elegir quién registra es lo primero. */}
            {!esNuevo && quien && tecnicos.todos.includes(quien) && !cambiarQuien ? (
              <p className="flex min-h-[44px] flex-wrap items-center gap-x-1 text-footnote text-muted-foreground">
                {modoBorrador ? 'Continúas como' : 'Editas como'} <span className="font-semibold text-foreground">{quien}</span> ·
                <button
                  type="button"
                  className="min-h-[44px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setCambiarQuien(true)}
                >
                  Cambiar
                </button>
              </p>
            ) : (
              <SelectorTecnico
                etiqueta={esNuevo ? 'Quién registra' : modoBorrador ? 'Quién continúa' : 'Quién edita'}
                deTurno={tecnicos.deTurno}
                todos={tecnicos.todos}
                valor={quien}
                onChange={setQuien}
              />
            )}
            {!esNuevo && !autorEditable && evento && (
              <p className="mt-1.5 text-footnote text-muted-foreground">Lo empezó: {autorVisible(evento)}</p>
            )}
          </div>
        )}
        {/* Turno donde queda el evento: se corrige si se registró en otro
            (p. ej. «Resolver» tocado al día siguiente). Últimos 7 días, nunca
            uno futuro ni anterior al pendiente que cierra (17-09). */}
        <div>
          <label htmlFor={`${campoId}-turno`} className="flex min-h-[44px] items-center justify-between gap-3 rounded-ctl bg-muted-foreground/10 pl-3 pr-1">
            <span className="text-body">Turno</span>
            <select
              id={`${campoId}-turno`}
              value={turnoDestino}
              onChange={(e) => setTurnoDestino(e.target.value)}
              className="min-h-[44px] min-w-0 max-w-[70%] cursor-pointer truncate rounded-ctl bg-transparent px-2 text-right text-[16px] font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {opcionesTurno.map((t) => (
                <option key={t.id} value={t.id}>
                  {nombreTurnoCorto(t.id)}
                  {t.id === turnoEnCurso.id ? ' · en curso' : ''}
                  {t.id === origenPendienteId ? ' · del pendiente' : ''}
                </option>
              ))}
            </select>
          </label>
          {turnoDestino !== turno.id && (
            <p className="mt-1.5 text-footnote text-muted-foreground">
              Al {modoBorrador || esNuevo ? 'publicar' : 'guardar'}, el evento pasa al {etiquetaCortaTurno(turnoDestino).toLowerCase()}
              {turnoDesdeId(turnoDestino) ? ` (${horarioTurno(turnoDesdeId(turnoDestino)!)})` : ''}
              {origenPendienteId ? ' y el pendiente queda resuelto ahí' : ''}.
            </p>
          )}
        </div>

        {/* Publicado: quién lo registró se corrige aquí (también desde el pase);
            quien corrige queda como «editado por». No se recuerda como «mi nombre». */}
        {autorEditable && tecnicos.todos.length > 0 && (
          <div>
            <SelectorTecnico
              etiqueta="Quién lo registró"
              deTurno={tecnicos.deTurno}
              todos={tecnicos.todos}
              valor={registrador}
              onChange={setRegistrador}
              recordar={false}
              vacio="Elige al técnico"
            />
            {evento && registrador && !tecnicos.todos.includes(registrador) && (
              <p className="mt-1.5 text-footnote text-muted-foreground">Hoy figura: {autorVisible(evento)}</p>
            )}
          </div>
        )}
        {tecnicos.todos.length > 0 && (
          <SelectorParticipantes
            presentes={tecnicos.deTurno}
            todos={tecnicos.todos}
            excluir={quienRegistro}
            valor={participantes}
            onChange={setParticipantes}
          />
        )}

        {/* Tipo — con rótulo propio: sin él se confundía con la fila de nombres de
            arriba. Los 8 a la vista (en filas): deslizando, «Novedad» no se veía. */}
        <div>
          <span className={ETIQUETA_CAMPO}>Tipo</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de evento">
            {TIPOS_EVENTO.map((t) => (
              <Chip key={t.id} activo={tipo === t.id} onClick={() => setTipo(t.id)}>
                {t.id === 'otro' ? 'Otro…' : t.label}
              </Chip>
            ))}
          </div>
          {tipo === 'otro' && (
            <div className="mt-3 flex flex-col gap-2">
              <label htmlFor="bitacora-tipo-otro" className="sr-only">Escribe el tipo</label>
              <input
                id="bitacora-tipo-otro"
                maxLength={MAX_TIPO_OTRO}
                className={CAMPO}
                value={tipoOtro}
                onChange={(e) => setTipoOtro(e.target.value)}
                placeholder="Escribe el tipo: mejora, lubricación…"
                autoCapitalize="sentences"
              />
              {tiposSugeridos.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Tipos ya usados">
                  {tiposSugeridos.map((t) => (
                    <Chip key={t} activo={normalizarTipo(t) === normalizarTipo(tipoOtro)} onClick={() => setTipoOtro(t)}>
                      {t}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Equipo y horas */}
        <div className="flex flex-col gap-3">
          <BuscadorEquipo
            texto={equipo}
            onChange={(texto, id) => {
              setEquipo(texto)
              setEquipoId(id)
              setEquipoCodigo(id ? (opcionesEquipo.find((o) => o.id === id)?.codigo ?? '') : '')
            }}
            opciones={opcionesEquipo}
            cargando={cargandoEquipos}
            recientes={equiposSugeridos}
          />
          {equipoId && (opcionElegida || equipoCodigo) && (
            <p className="-mt-1.5 text-footnote text-muted-foreground">
              {[opcionElegida?.planta, opcionElegida?.area, etiquetaCodigoEquipo(equipoCodigo)].filter(Boolean).join(' · ')}
            </p>
          )}
          <div>
            <label htmlFor="bitacora-titulo" className={`${ETIQUETA_CAMPO} flex justify-between gap-2`}>
              {/* Los rótulos son los de la planilla «Recoleccion MTTR» (Máquina · Falla ·
                  Observaciones) para que nadie tenga que traducir (Orel, 17-09). */}
              <span>Falla</span>
              <span>Opcional · en pocas palabras</span>
            </label>
            <input
              id="bitacora-titulo"
              maxLength={MAX_TITULO_EVENTO}
              className={CAMPO}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Cambio de tubos fluorescentes"
              autoCapitalize="sentences"
            />
          </div>
          {/* Como «Todo el día» en el Calendario de iOS: esconde las horas. */}
          <FilaInterruptor activo={sinHora} onCambiar={cambiarSinHora} titulo="Sin hora" />
          {sinHora ? (
            <div className="-mt-1 flex flex-col gap-2">
              <span className={ETIQUETA_CAMPO}>Ubicación en el turno</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Ubicación en el turno">
                <Chip activo={posicion === ''} onClick={() => setPosicion('')}>
                  Donde se registró
                </Chip>
                {opcionesUbicacion(turno, eventosDelTurno, eventoId).map((o) => (
                  <Chip key={o.etiqueta} activo={posicion !== '' && Number(posicion) === o.posicion} onClick={() => setPosicion(String(o.posicion))}>
                    {o.etiqueta}
                  </Chip>
                ))}
              </div>
              <p className="text-footnote text-muted-foreground">
                También se mueve con las flechas de la lista.
                {impacto === 'con-parada' ? ' Anota abajo los minutos de parada: sin hora no se pueden calcular.' : ''}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bitacora-inicio" className={ETIQUETA_CAMPO}>Inicio</label>
                  {/* HIG «Pickers»: minutos de 5 en 5, que con guantes se acierta. */}
                  <input id="bitacora-inicio" type="time" step={300} className={`${CAMPO} tabular-nums`} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} onKeyDown={enterGuarda} />
                </div>
                <div>
                  <label htmlFor="bitacora-termino" className={ETIQUETA_CAMPO}>Término</label>
                  <input id="bitacora-termino" type="time" step={300} className={`${CAMPO} tabular-nums`} value={horaTermino} onChange={(e) => setHoraTermino(e.target.value)} onBlur={validarTermino} onKeyDown={enterGuarda} />
                </div>
              </div>
              {/* Sin término no hay minutos de parada: 17 de 22 eventos reales se
                  guardaron sin él (18-09-2026). Un toque lo cierra con la hora
                  de ahora, que es la que corresponde al salir de la máquina. */}
              {!horaTermino && (
                <button
                  type="button"
                  onClick={() => setHoraTermino(horaHHMM(new Date()))}
                  className="-mt-1 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-4 text-footnote font-semibold text-brand-ink transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Clock3 className="size-4" aria-hidden />
                  Terminó ahora · {horaDeAhora}
                </button>
              )}
              {duracion != null && <p className="-mt-1 text-footnote text-muted-foreground">Duración: {formatoMinutos(duracion)}</p>}
            </>
          )}
        </div>

        {/* Qué pasó */}
        <div>
          <label htmlFor="bitacora-descripcion" className={ETIQUETA_CAMPO}>Observaciones · qué pasó y qué se hizo</label>
          <textarea
            id="bitacora-descripcion"
            maxLength={3000}
            className="min-h-[112px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-[16px] leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detención por E777. Muelle de tracción del carro cortado; se cambia y se prueba en vacío."
          />
        </div>

        </div>
        <div className="flex min-w-0 flex-col gap-5">
        <RepuestosUsados valor={repuestos} onChange={setRepuestos} equipoId={equipoId} fuente={fuenteRepuestos} puedeEditarMaestro={puedeEditarMaestro} />

        {/* Impacto en producción */}
        <div>
          <span className={ETIQUETA_CAMPO}>
            ¿Cómo afectó al proceso?
            {impacto == null && <span className="ml-1.5 font-normal text-ink-warn">obligatorio</span>}
          </span>
          {/* Una respuesta por fila, con su ejemplo debajo. Con tres chips en
              línea y sin explicación, 19 de 22 eventos reales terminaban en
              «No aplica» — incluida una Baader 142 en falla (18-09-2026). */}
          <div className="flex flex-col gap-2" role="group" aria-label="Impacto en el proceso">
            {IMPACTOS.map((i) => {
              const activo = impacto === i.id
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setImpacto(i.id)}
                  className={[
                    'flex min-h-[56px] flex-col justify-center gap-0.5 rounded-card px-4 py-2.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    activo ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/10 text-foreground',
                  ].join(' ')}
                >
                  <span className="text-subhead font-semibold leading-tight">{i.label}</span>
                  <span className={`text-footnote leading-tight ${activo ? 'opacity-80' : 'text-muted-foreground'}`}>
                    {i.detalle}
                  </span>
                </button>
              )
            })}
          </div>
          {impacto === 'con-parada' && (
            <div className="mt-3">
              <label htmlFor="bitacora-minutos" className={ETIQUETA_CAMPO}>Minutos de máquina detenida</label>
              <input
                id="bitacora-minutos"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                className={`${CAMPO} tabular-nums`}
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
                placeholder={duracion != null ? `${duracion} (la duración del evento)` : 'Ej: 35'}
              />
              <p className="mt-1.5 text-footnote text-muted-foreground">
                {sinHora
                  ? 'Cuenta para el MTTR del turno. Vacío, la parada queda sin duración.'
                  : 'Cuenta para el MTTR del turno. Si lo dejas vacío se usa la duración.'}
              </p>
            </div>
          )}
          {impacto === 'afecta-sin-detener' && (
            <div className="mt-3">
              <label htmlFor="bitacora-contingencia" className={ETIQUETA_CAMPO}>¿Qué se hizo para que siguiera?</label>
              <div className="mb-2 flex flex-wrap gap-2">
                {CONTINGENCIAS_SUGERIDAS.map((c) => (
                  <Chip key={c} activo={contingencia === c} onClick={() => setContingencia(c)}>
                    {c}
                  </Chip>
                ))}
              </div>
              <input
                id="bitacora-contingencia"
                maxLength={120}
                className={CAMPO}
                value={contingencia}
                onChange={(e) => setContingencia(e.target.value)}
                // El ejemplo va en el placeholder: dice qué escribir Y que se
                // puede escribir (pedido de Orel, 18-09-2026).
                placeholder="Ejemplo: se retiran cabezas a mano"
              />
              <p className="mt-1.5 text-footnote text-muted-foreground">
                No suma minutos de parada. Queda registrado que el proceso siguió gracias a Mantención.
              </p>
            </div>
          )}
          {impacto === 'en-ventana' && (
            <div className="mt-3">
              <label htmlFor="bitacora-ventana" className={ETIQUETA_CAMPO}>¿En qué momento se intervino?</label>
              <div className="mb-2 flex flex-wrap gap-2">
                {VENTANAS_SUGERIDAS.map((v) => (
                  <Chip key={v} activo={ventana === v} onClick={() => setVentana(v)}>
                    {v}
                  </Chip>
                ))}
              </div>
              <input
                id="bitacora-ventana"
                maxLength={120}
                className={CAMPO}
                value={ventana}
                onChange={(e) => setVentana(e.target.value)}
                placeholder="O escríbelo: durante colación filete…"
              />
            </div>
          )}
        </div>

        {/* Fotos */}
        <div>
          <span className={ETIQUETA_CAMPO}>Fotos</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => alElegir(e.target.files)}
          />
          {(fotos.length > 0 || subidas.length > 0) && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {fotos.map((f) => (
                <figure key={f.path} className="relative m-0">
                  <img src={f.url} alt={ETIQUETA_FOTO[f.etiqueta]} className="aspect-square w-full rounded-ctl bg-muted-foreground/10 object-cover" />
                  <figcaption className="pt-1 text-caption text-muted-foreground">{ETIQUETA_FOTO[f.etiqueta]}</figcaption>
                  <button
                    type="button"
                    onClick={() => quitarFoto(f)}
                    aria-label={`Quitar foto ${ETIQUETA_FOTO[f.etiqueta]}`}
                    className="absolute right-0 top-0 flex size-[44px] items-start justify-end p-1.5"
                  >
                    <span className="flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
                      <X className="size-3.5" />
                    </span>
                  </button>
                </figure>
              ))}
              {subidas.map((s) => (
                <div key={s.clave} className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-ctl bg-muted-foreground/10 p-2 text-center">
                  {s.error ? (
                    <>
                      <AlertTriangle className="size-5 text-ink-warn" aria-hidden />
                      <span className="text-caption text-muted-foreground">{s.error}</span>
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => void subir(s)} className="inline-flex min-h-[32px] items-center gap-1 text-footnote font-semibold text-primary">
                          <RotateCw className="size-3.5" /> Reintentar
                        </button>
                        {/* Sin esto, una foto que nunca va a subir (un HEIC, por
                            ejemplo) obligaba a cancelar el evento entero para
                            sacarla y se perdía todo lo escrito (revisión 15-09). */}
                        <button type="button" onClick={() => descartarSubida(s.clave)} className="inline-flex min-h-[32px] items-center gap-1 text-footnote font-semibold text-muted-foreground">
                          <X className="size-3.5" /> Quitar
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                      <span className="text-caption text-muted-foreground">Subiendo {ETIQUETA_FOTO[s.etiqueta].toLowerCase()}…</span>
                      <button type="button" onClick={() => descartarSubida(s.clave)} className="inline-flex min-h-[32px] items-center gap-1 text-footnote font-semibold text-muted-foreground">
                        <X className="size-3.5" /> Quitar
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(['antes', 'despues', 'foto'] as const).map((et) => (
              <Button key={et} variant="tinted" size="md" className="rounded-ctl px-2" onClick={() => elegirFotos(et)} disabled={fotos.length + subidas.length >= MAX_FOTOS_EVENTO}>
                <ImagePlus /> {et === 'foto' ? 'Otra' : ETIQUETA_FOTO[et]}
              </Button>
            ))}
          </div>
        </div>

        {/* Pendiente */}
        <FilaInterruptor
          activo={pendiente}
          onCambiar={setPendiente}
          titulo="Queda pendiente"
          detalle="Sale destacado en el correo para el turno siguiente."
        />

        </div>
        </div>

        {error && (
          <p role="alert" className="text-footnote font-semibold text-ink-crit">
            {error}
          </p>
        )}

        {modoBorrador && (
          <p className="text-footnote text-muted-foreground">
            Puedes cerrar y seguir en el PC: el borrador queda en la bitácora del turno. No cuenta en los números ni sale en
            el correo hasta que toques <span className="font-semibold text-foreground">Listo</span>.
          </p>
        )}

        {(!esNuevo || existeEnServidor.current) && !puedeEliminar && (
          <p className="text-footnote text-muted-foreground">
            {modoBorrador ? 'Descartarlo' : 'Borrarlo'} solo puede quien lo empezó o un supervisor.
          </p>
        )}
        {(!esNuevo || existeEnServidor.current) && puedeEliminar && (
          <Button variant="destructive" onClick={borrar} disabled={guardando} className="self-start">
            <Trash2 />{' '}
            {modoBorrador ? 'Descartar borrador' : 'Borrar evento'}
          </Button>
        )}
      </div>
      <ActionSheet
        open={confirmarDescarte}
        title="¿Descartar los cambios?"
        description="Lo que escribiste en este evento no se guardó. El evento queda como estaba."
        confirmLabel="Descartar cambios"
        onConfirm={() => {
          setConfirmarDescarte(false)
          cancelar()
        }}
        cancelLabel="Seguir editando"
        onCancel={() => setConfirmarDescarte(false)}
      />
    </Sheet>
  )
}
