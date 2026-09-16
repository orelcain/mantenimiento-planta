import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ImagePlus, Loader2, RotateCw, Trash2, Users, X } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { useToast } from '@/hooks/useToast'
import {
  AUTOGUARDADO_MS,
  ETIQUETA_FOTO,
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
import { formatoMinutos, horaDe, horaSugeridaParaEvento, minutosEntre } from '@/services/bitacora/turnoMantencion'
import { limpiarTipo, normalizarTipo } from '@/services/bitacora/presentacionEvento'

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
  const [participantes, setParticipantes] = useState<string[]>([])
  const [equipoId, setEquipoId] = useState<string | null>(null)
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
  const [horaInicio, setHoraInicio] = useState('')
  const [horaTermino, setHoraTermino] = useState('')
  const [impacto, setImpacto] = useState<ImpactoEvento>('no-aplica')
  const [minutos, setMinutos] = useState('')
  const [ventana, setVentana] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [fotos, setFotos] = useState<FotoEvento[]>([])
  const [subidas, setSubidas] = useState<Subida[]>([])
  const [guardando, setGuardando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [confirmarSinFotos, setConfirmarSinFotos] = useState(false)
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
    setParticipantes(evento?.participantes ?? [])
    // «Resolver pendiente»: el equipo, su vínculo y el tipo vienen del pendiente original.
    setEquipoId(evento?.equipoId ?? pendienteOrigen?.equipoId ?? null)
    setTipo(evento?.tipo ?? pendienteOrigen?.tipo ?? 'falla')
    setTipoOtro(evento?.tipoOtro ?? pendienteOrigen?.tipoOtro ?? '')
    setEquipo(evento?.equipo ?? pendienteOrigen?.equipo ?? '')
    setTitulo(evento?.titulo ?? '')
    setDescripcion(evento?.descripcion ?? '')
    setSinHora(evento ? evento.horaInicio === '' : false)
    // Un evento sin hora deja lista la hora sugerida por si se apaga «Sin hora».
    setHoraInicio(evento?.horaInicio || horaSugeridaParaEvento(turno))
    setHoraTermino(evento?.horaTermino ?? '')
    setImpacto(evento?.impacto ?? 'no-aplica')
    setMinutos(evento?.minutosParada != null ? String(evento.minutosParada) : '')
    setVentana(evento?.ventana ?? '')
    setPendiente(evento?.pendiente ?? false)
    setFotos(evento?.fotos ?? [])
    setSubidas([])
    setGuardando(false)
    setConfirmarBorrado(false)
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
          titulo: '',
          descripcion: '',
          horaInicio: horaSugeridaParaEvento(turno),
          horaTermino: '',
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
    titulo,
    descripcion,
    horaInicio: sinHora ? '' : horaInicio,
    horaTermino: sinHora ? '' : horaTermino,
    impacto,
    minutos,
    ventana,
    pendiente,
  })
  const firmaActual = firmaDe(formularioActual(), quien, participantes, fotos)

  const aplicarFormulario = (v: CamposFormulario, previo: CamposFormulario) => {
    if (v.tipo !== previo.tipo) setTipo(v.tipo)
    if (v.tipoOtro !== previo.tipoOtro && v.tipo === 'otro') setTipoOtro(v.tipoOtro)
    if (v.equipo !== previo.equipo) setEquipo(v.equipo)
    if (v.equipoId !== previo.equipoId) setEquipoId(v.equipoId)
    if (v.titulo !== previo.titulo) setTitulo(v.titulo)
    if (v.descripcion !== previo.descripcion) setDescripcion(v.descripcion)
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
      titulo,
      descripcion,
      horaInicio: sinHora ? '' : horaInicio,
      horaTermino: sinHora ? null : horaTermino || null,
      impacto,
      minutosParada: minutosValidos ? minutosNum : null,
      ventana: ventana || null,
      pendiente,
      fotos,
      fotosAntes: fotosServidor.current,
      cierreAntes: (eventoVivo ?? evento)?.cierre ?? null,
      quien,
      resuelvePendiente: pendienteOrigen ? copiaDeOrigen(pendienteOrigen) : null,
      // Quien registra no se repite como participante (pudo quedar marcado antes de elegirlo).
      participantes: participantes.filter(
        (p) => p.trim().toLowerCase() !== (esNuevo ? quien : (evento?.registradoPor ?? quien)).trim().toLowerCase(),
      ),
      equipoId,
      estado,
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
    if (!crear && !datos.camposCambiados?.length && !cambiaronFotos && !datos.fijarAutor) {
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
    if (conflictos.includes('equipo')) v.equipoId = remoto.equipoId
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
    const publicando = modoBorrador
    // Si nunca se vio el documento en la bitácora (la creación pudo fallar), se
    // crea completo en vez de actualizar algo que no existe (revisión 16-09).
    const crear = !existeEnServidor.current || (creadoAqui.current && !vistoVivo.current)
    try {
      await onGuardar(eventoId, armarDatos('listo', crear), crear)
      recordarEquipo(equipo)
      if (tipo === 'otro') recordar(CLAVE_TIPOS, limpiarTipo(tipoOtro), 8)
      // Lo que seguía subiendo ya no entra en este evento (se borra al terminar).
      sesion.current++
      subidasNuevas.current = []
      // Las fotos quitadas las borra el hook DESPUÉS del OK del servidor.
      quitadas.current = []
      toast({
        title: publicando ? 'Evento publicado' : esNuevo ? 'Evento agregado' : 'Evento actualizado',
        description: navigator.onLine ? undefined : 'Quedó guardado en el teléfono; se sube cuando haya señal.',
        variant: 'success',
      })
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
    if (!confirmarBorrado) {
      setConfirmarBorrado(true)
      return
    }
    setGuardando(true)
    try {
      subidasNuevas.current.forEach((p) => void borrarFotoOEncolar(p))
      subidasNuevas.current = []
      sesion.current++
      // Con las fotos que tenga AHORA (pudo agregarlas otro equipo).
      await onBorrar({ ...actual, fotos: [...new Map([...(actual.fotos ?? []), ...fotos].map((f) => [f.path, f])).values()] })
      toast({ title: modoBorrador ? 'Borrador descartado' : 'Evento borrado' })
      onClose()
    } catch {
      setError('No se pudo borrar. Solo quien lo creó o un supervisor puede borrarlo.')
      setGuardando(false)
    }
  }

  const subiendo = subidas.some((s) => !s.error)

  return (
    <Sheet
      open={open}
      onClose={cerrarHoja}
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
          <Button onClick={guardar} disabled={guardando || eliminadoAfuera}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            {subiendo
              ? 'Subiendo fotos…'
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

        {/* Quién: con la cuenta compartida de Mantención es el único dato de autoría.
            Con pase de bitácora es el dueño del pase, sin elegir. */}
        {autorFijo && (
          <p className="text-footnote text-muted-foreground">
            {esNuevo ? 'Registra' : 'Edita'}: <span className="font-semibold text-foreground">{autorFijo}</span>
            {!esNuevo && evento && autorVisible(evento) !== autorFijo ? ` · lo registró ${autorVisible(evento)}` : ''}
          </p>
        )}
        {tecnicos.todos.length > 0 && !autorFijo && (
          <div>
            <SelectorTecnico
              etiqueta={esNuevo ? 'Quién registra' : modoBorrador ? 'Quién continúa' : 'Quién edita'}
              deTurno={tecnicos.deTurno}
              todos={tecnicos.todos}
              valor={quien}
              onChange={setQuien}
            />
            {!esNuevo && evento && (
              <p className="mt-1.5 text-footnote text-muted-foreground">
                {modoBorrador ? 'Lo empezó' : 'Registró'}: {autorVisible(evento)}
              </p>
            )}
          </div>
        )}
        {tecnicos.todos.length > 0 && (
          <SelectorParticipantes
            presentes={tecnicos.deTurno}
            todos={tecnicos.todos}
            excluir={esNuevo ? quien : (evento?.registradoPor ?? quien)}
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
            }}
            opciones={opcionesEquipo}
            cargando={cargandoEquipos}
            recientes={equiposSugeridos}
          />
          <div>
            <label htmlFor="bitacora-titulo" className={`${ETIQUETA_CAMPO} flex justify-between gap-2`}>
              <span>Título</span>
              <span>Opcional</span>
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
            <p className="-mt-1 text-footnote text-muted-foreground">
              Queda en la línea de tiempo según cuándo se registró.
              {impacto === 'con-parada' ? ' Anota abajo los minutos de parada: sin hora no se pueden calcular.' : ''}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bitacora-inicio" className={ETIQUETA_CAMPO}>Inicio</label>
                  <input id="bitacora-inicio" type="time" className={`${CAMPO} tabular-nums`} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="bitacora-termino" className={ETIQUETA_CAMPO}>Término</label>
                  <input id="bitacora-termino" type="time" className={`${CAMPO} tabular-nums`} value={horaTermino} onChange={(e) => setHoraTermino(e.target.value)} />
                </div>
              </div>
              {duracion != null && <p className="-mt-1 text-footnote text-muted-foreground">Duración: {formatoMinutos(duracion)}</p>}
            </>
          )}
        </div>

        {/* Qué pasó */}
        <div>
          <label htmlFor="bitacora-descripcion" className={ETIQUETA_CAMPO}>Qué pasó y qué se hizo</label>
          <textarea
            id="bitacora-descripcion"
            maxLength={3000}
            className="min-h-[112px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-[16px] leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detención por E777. Muelle de tracción del carro cortado; se cambia y se prueba en vacío."
          />
        </div>

        {/* Impacto en producción */}
        <div>
          <span className={ETIQUETA_CAMPO}>¿Afectó a producción?</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Impacto en producción">
            {IMPACTOS.map((i) => (
              <Chip key={i.id} activo={impacto === i.id} onClick={() => setImpacto(i.id)}>
                {i.label}
              </Chip>
            ))}
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
            {confirmarBorrado
              ? 'Toca de nuevo para confirmar'
              : modoBorrador
                ? 'Descartar borrador'
                : 'Borrar evento'}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
