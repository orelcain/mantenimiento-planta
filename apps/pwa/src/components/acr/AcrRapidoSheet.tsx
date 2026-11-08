/**
 * AcrRapidoSheet — tarjeta R1 del ACR: 3 preguntas, propuesta de la IA o armado a mano, y guardar.
 * Spec: SPEC_ACR_R1.md §4. Reemplaza a la hoja de 5 pasos (`AcrSheet`, retirada en R1).
 *
 * Meta: llenar un ACR en menos de un minuto. El borrador se guarda solo (`AUTOGUARDADO_MS`),
 * igual que la Bitácora.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button, ListGroup, Pill, SegmentedControl, Sheet, ActionSheet } from '@/components/piel'
import { SpeechTextarea } from '@/components/ui/SpeechTextarea'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/store'
import { AUTOGUARDADO_MS, BITACORA_PLANTA, ETIQUETA_FOTO } from '@/config/bitacora'
import { guardarAcr, nuevoIdAcr } from '@/services/acr/acrFirestore'
import { cadenaPorQues, motivoNoCierra, motivoNoPropone, puedeCerrar, resumenFuerza } from '@/services/acr/acrLogica'
import { proponerAcr, type ProponerAcr } from '@/services/acr/proponerAcr'
import { preguntarPorQue, type PreguntarPorQue } from '@/services/acr/preguntarPorQue'
import type { Repeticion } from '@/services/acr/repeticion'
import {
  AYUDA_FUERZA,
  ETIQUETA_FUERZA,
  ETIQUETA_NIVEL,
  TONO_FUERZA,
  TONO_NIVEL,
  type Acr,
  type AccionAcr,
  type CausaAcr,
  type EventoRefAcr,
  type FuerzaAccion,
  type NivelCausa,
  type RespuestasAcr,
} from '@/services/acr/acr.types'
import { logger } from '@/lib/logger'
import { Play } from 'lucide-react'
import { MotorTutorialAcr } from './MotorTutorialAcr'
import { AcrLectura } from './AcrLectura'
import { FilaAnalisis } from './AcrEntrada'
import { RevisionSemanalSheet } from './RevisionSemanalSheet'
import { CadenaPorQues } from './CadenaPorQues'
import {
  ACCION_POR_FUERZA,
  CORRECCION_HUMANA,
  MOTIVO_EJEMPLO,
  PASOS_TUTORIAL,
  PORQUES_TUTORIAL,
  PREGUNTA_TUTORIAL,
  PROPUESTA_TUTORIAL,
  REPETICION_TUTORIAL,
  TEXTO_Q2,
  TEXTO_Q3,
  acrsRevisionTutorial,
  practicaAlEmpezar,
  type AccionTutorial,
  type VistaTutorial,
} from './tutorialAcr'

/** Marca del tutorial visto: sin ella, la tarjeta ofrece el tutorial la primera vez. */
const CLAVE_TUTORIAL_VISTO = 'acr-tutorial-visto'

function leerTutorialVisto(): boolean {
  try {
    return localStorage.getItem(CLAVE_TUTORIAL_VISTO) !== null
  } catch {
    return false
  }
}

function marcarTutorialVisto(): void {
  try {
    localStorage.setItem(CLAVE_TUTORIAL_VISTO, '1')
  } catch {
    // Sin almacenamiento el tutorial se ofrece de nuevo; no pasa nada más.
  }
}

export interface AcrRapidoSheetProps {
  open: boolean
  onClose: () => void
  evento: EventoRefAcr
  /** null/omitido = análisis nuevo. */
  acrExistente?: Acr | null
  /** Repetición detectada al abrir (se guarda con el análisis). */
  repeticion?: Repeticion | null
  /** Reemplaza el guardado en Firestore (la vitrina de desarrollo lo usa). */
  onGuardar?: (acr: Acr) => void
  /** Reemplaza la llamada a la IA (la vitrina la simula). */
  proponer?: ProponerAcr
  /** Reemplaza la pregunta de «ARIA pregunta» (la vitrina la simula). */
  preguntar?: PreguntarPorQue
  /** Arranca el tutorial al abrir (la vitrina lo usa; en la app se pide con el botón). */
  arrancarTutorial?: boolean
}

// ── Constantes y helpers ─────────────────────────────────────────────────────

/** `!` gana a `text-sm` y `min-h-[80px]` de `ui/Textarea`: las tres preguntas miden igual (16 px de letra, iOS no hace zoom). */
const CAMPO =
  'w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 !text-campo leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary !min-h-16'
const TITULO_PREGUNTA = 'text-body font-semibold text-foreground'
const NIVEL_SEGMENTOS = (['fisica', 'humana', 'latente'] as const).map((n) => ({ value: n, label: ETIQUETA_NIVEL[n] }))
const FUERZA_SEGMENTOS = (['debil', 'media', 'fuerte'] as const).map((f) => ({ value: f, label: ETIQUETA_FUERZA[f] }))
const RESPUESTAS_VACIAS: RespuestasAcr = { queSeRompio: '', porQue: '', queHacemos: '' }

/** `2026-09-24` → `24-09-2026`. */
function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

function nombreDe(user: { nombre?: string; apellido?: string } | null | undefined): string {
  const nombre = [user?.nombre?.split(' ')[0], user?.apellido?.split(' ')[0]].filter(Boolean).join(' ')
  return nombre || auth.currentUser?.displayName || auth.currentUser?.email || 'Sin nombre'
}

/** Análisis nuevo a partir del evento. El criterio sale del spec, con 60 días. */
function acrNuevo(evento: EventoRefAcr, uid: string, nombre: string, repeticion: Repeticion | null): Acr {
  const ahora = new Date()
  const equipo = evento.equipo || 'Sin equipo'
  return {
    id: nuevoIdAcr(),
    version: 2,
    plantId: BITACORA_PLANTA.id,
    eventoBitacoraIds: [evento.id],
    equipo,
    fechaTurno: evento.fechaTurno,
    definicion: evento.descripcion,
    minutosDetencion: evento.minutosParada ?? null,
    evidencias: evento.fotos.map((f) => ({
      path: f.path,
      url: f.url,
      nota: ETIQUETA_FOTO[f.etiqueta],
      origen: 'bitacora' as const,
    })),
    piezaGuardada: false,
    causas: [],
    acciones: [],
    verificacion: { criterio: `Sin repetir la falla en ${equipo} durante 60 días`, dias: 60, resultado: 'pendiente' },
    estado: 'borrador',
    createdBy: uid,
    createdByNombre: nombre,
    createdAt: ahora,
    updatedAt: ahora,
    respuestas: { ...RESPUESTAS_VACIAS, queSeRompio: evento.descripcion },
    repeticion: repeticion ? { eventoIds: repeticion.eventoIds, resumen: repeticion.resumen } : null,
  }
}

/** La causa q2 (porqué) es el último de la cadena «¿Y por qué?»; sin cadena, el porqué 1. */
function textoCausaQ2(r: RespuestasAcr): string {
  const cadena = cadenaPorQues(r)
  return cadena.length > 0 ? (cadena[cadena.length - 1] ?? r.porQue) : r.porQue
}

/**
 * Armado a mano (SPEC §4.5): Q1 → causa física; Q2 → causa con el nivel elegido (por defecto
 * latente); Q3 → acción con la fuerza elegida, sin valor por defecto. Ids fijos (`q1`, `q2`, `q3`)
 * para que los selectores encuentren su ítem.
 */
function armadoManual(a: Acr): Acr {
  const r = a.respuestas ?? RESPUESTAS_VACIAS
  const causas: CausaAcr[] = [
    { id: 'q1', texto: r.queSeRompio, nivel: 'fisica', m6: null },
    { id: 'q2', texto: textoCausaQ2(r), nivel: 'latente', m6: null },
  ]
  return { ...a, propuesta: { origen: 'manual', modelo: null }, causas, acciones: [] }
}

/** En armado a mano el texto sale de las respuestas: se mantiene al cambiar una pregunta. */
function sincronizarManual(a: Acr): Acr {
  if (a.propuesta?.origen !== 'manual') return a
  const r = a.respuestas ?? RESPUESTAS_VACIAS
  return {
    ...a,
    causas: a.causas.map((c) => (c.id === 'q1' ? { ...c, texto: r.queSeRompio } : c.id === 'q2' ? { ...c, texto: textoCausaQ2(r) } : c)),
    acciones: a.acciones.map((x) => (x.id === 'q3' ? { ...x, texto: r.queHacemos } : x)),
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function AcrRapidoSheet({
  open,
  onClose,
  evento,
  acrExistente = null,
  repeticion = null,
  onGuardar,
  proponer,
  preguntar = preguntarPorQue,
  arrancarTutorial = false,
}: AcrRapidoSheetProps) {
  const user = useAuthStore((s) => s.user)
  const [acr, setAcr] = useState<Acr>(
    () => acrExistente ?? acrNuevo(evento, auth.currentUser?.uid ?? '', nombreDe(user), repeticion),
  )
  const [sucio, setSucio] = useState(false)
  // Tutorial (SPEC_ACR_TUTORIAL.md §3): corre sobre una copia en memoria; lo real se guarda aparte.
  const [tutorial, setTutorial] = useState(false)
  const [practicaFinal, setPracticaFinal] = useState<string | null>(null)
  const [visto, setVisto] = useState(leerTutorialVisto)
  const realRef = useRef<Acr | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pensando, setPensando] = useState(false)
  const [avisoIA, setAvisoIA] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ tipo: 'causa' | 'accion'; id: string } | null>(null)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  /** «Armar a mano» con una propuesta de ARIA: se confirma antes de reemplazarla. */
  const [confirmarArmado, setConfirmarArmado] = useState(false)
  // Solo en la práctica del tutorial: lo que ARIA abre o muestra encima de la tarjeta.
  const [vistaPractica, setVistaPractica] = useState<VistaTutorial | null>(null)
  const [pensandoPractica, setPensandoPractica] = useState(false)
  const [motivoPractica, setMotivoPractica] = useState<string | null>(null)
  const [revisionSubida, setRevisionSubida] = useState(false)
  /** Pantalla completa de los 5 porqués (`CadenaPorQues`). */
  const [pantallaPorQues, setPantallaPorQues] = useState(false)
  /** Tarjeta de «ARIA pregunta» (`CadenaPorQues`); el tutorial la abre con `abrirAria`. */
  const [ariaPorQues, setAriaPorQues] = useState(false)
  /** Pregunta fija de la práctica del tutorial: con ella la IA nunca se llama. */
  const [preguntaPractica, setPreguntaPractica] = useState<string | null>(null)
  /** Falso hasta el primer guardado de un análisis nuevo: ahí se crea el documento. */
  const guardadoRef = useRef(acrExistente != null)
  const idPiezas = useId()

  const persistir = (a: Acr) => {
    setSucio(false)
    if (onGuardar) {
      onGuardar(a)
      return
    }
    const esNuevo = !guardadoRef.current
    guardadoRef.current = true
    guardarAcr(a, esNuevo).catch((e: unknown) => {
      logger.error('No se pudo guardar el análisis de causa raíz', e instanceof Error ? e : undefined, { acrId: a.id })
      setError('No se guardó el análisis. Revisa la conexión y tus permisos.')
    })
  }
  // Ref para que el temporizador vea siempre el `persistir` del render actual sin reiniciarse.
  const persistirRef = useRef(persistir)
  persistirRef.current = persistir

  // Autoguardado: `AUTOGUARDADO_MS` después del último cambio, como la Bitácora.
  // En la práctica del tutorial no se guarda nada (SPEC_ACR_TUTORIAL.md §3).
  useEffect(() => {
    if (!sucio || tutorial) return
    const t = setTimeout(() => persistirRef.current(acr), AUTOGUARDADO_MS)
    return () => clearTimeout(t)
  }, [sucio, acr, tutorial])

  const cambiar = (fn: (previo: Acr) => Acr) => {
    setAcr(fn)
    setSucio(true)
  }

  const cambiarRespuesta = (campo: keyof RespuestasAcr, valor: string) =>
    cambiar((a) => sincronizarManual({ ...a, respuestas: { ...(a.respuestas ?? RESPUESTAS_VACIAS), [campo]: valor } }))

  /** Porqué 1 y porqués extra de la cadena «¿Y por qué?» (mismo camino que `cambiarRespuesta`). */
  const cambiarPorQues = (cambio: { porQue?: string; porQues?: string[]; porQuesModo?: 'cadena' | 'aria' }) =>
    cambiar((a) => sincronizarManual({ ...a, respuestas: { ...(a.respuestas ?? RESPUESTAS_VACIAS), ...cambio } }))

  const r = acr.respuestas ?? RESPUESTAS_VACIAS
  // Durante el tutorial la IA real no se llama: ARIA toca la propuesta de ejemplo.
  const puedeProponer = r.porQue.trim() !== '' && r.queHacemos.trim() !== '' && !pensando && !tutorial
  const manual = acr.propuesta?.origen === 'manual'
  const hayGrupo = acr.causas.length > 0 || acr.acciones.length > 0

  const proponerConIA = () => {
    if (!puedeProponer) return
    setPensando(true)
    setAvisoIA(null)
    const fn = proponer ?? proponerAcr
    fn({
      equipo: acr.equipo,
      queSeRompio: r.queSeRompio,
      porQue: r.porQue,
      queHacemos: r.queHacemos,
      porQues: (r.porQues ?? []).filter((s) => s.trim() !== ''),
      descripcionEvento: evento.descripcion,
      repeticion: repeticion?.resumen ?? null,
    })
      .then((p) => {
        cambiar((a) => ({ ...a, causas: p.causas, acciones: p.acciones, propuesta: { origen: 'ia', modelo: p.modelo } }))
      })
      .catch((e: unknown) => {
        // Sin red, error o respuesta mala: el mismo grupo se arma a mano, sin perder lo escrito.
        logger.warn('La propuesta de la IA falló; se arma a mano', { motivo: e instanceof Error ? e.message : String(e) })
        cambiar((a) => armadoManual(a))
        setAvisoIA('La IA no respondió. Armé el análisis a mano: elige la fuerza de la acción.')
      })
      .finally(() => setPensando(false))
  }

  const fijarNivelQ2 = (nivel: NivelCausa) =>
    cambiar((a) => ({ ...a, causas: a.causas.map((c) => (c.id === 'q2' ? { ...c, nivel } : c)) }))

  const fijarFuerzaQ3 = (fuerza: FuerzaAccion) =>
    cambiar((a) => {
      const existe = a.acciones.some((x) => x.id === 'q3')
      if (existe) return { ...a, acciones: a.acciones.map((x) => (x.id === 'q3' ? { ...x, fuerza } : x)) }
      const nueva: AccionAcr = {
        id: 'q3',
        texto: (a.respuestas ?? RESPUESTAS_VACIAS).queHacemos,
        fuerza,
        causaId: 'q2',
        responsable: '',
        fechaLimite: null,
        estado: 'pendiente',
      }
      return { ...a, acciones: [...a.acciones, nueva] }
    })

  const fuerzaQ3 = acr.acciones.find((x) => x.id === 'q3')?.fuerza ?? null
  const nivelQ2 = acr.causas.find((c) => c.id === 'q2')?.nivel ?? 'latente'

  /** Dentro de la práctica «Guardar» solo muestra el estado final; no escribe nada. */
  const estadoDe = (a: Acr): string =>
    `${puedeCerrar(a) ? 'Guardado · cerrado' : 'Borrador · falta algo'} · ${Math.round(resumenFuerza(a.acciones).fuertePct ?? 0)} % fuertes`

  const guardarAhora = () => {
    if (tutorial) {
      setPracticaFinal(estadoDe(acr))
      return
    }
    const completo = puedeCerrar(acr)
    const siguiente: Acr = { ...acr, estado: completo ? 'cerrado' : 'borrador', updatedAt: new Date() }
    setAcr(siguiente)
    persistir(siguiente)
    if (completo) onClose()
  }

  // ── Tutorial ─────────────────────────────────────────────────────────────

  /** Pasa a la práctica: guarda lo real pendiente y corre sobre una copia del caso de los resortes. */
  const iniciarTutorial = () => {
    if (tutorial) return
    if (sucio) persistir(acr)
    realRef.current = acr
    setAcr(acrNuevo(evento, auth.currentUser?.uid ?? '', nombreDe(user), repeticion))
    setSucio(false)
    setPracticaFinal(null)
    setTutorial(true)
  }

  /** Vuelve lo que el técnico tenía escrito antes del tutorial. */
  const volverAlReal = () => {
    setTutorial(false)
    if (realRef.current) setAcr(realRef.current)
    realRef.current = null
    setSucio(false)
    setPracticaFinal(null)
    cerrarCapasPractica()
  }

  /** Cierra todo lo que el tutorial abrió encima de la tarjeta. */
  const cerrarCapasPractica = () => {
    setEditando(null)
    setConfirmarBorrado(false)
    setVistaPractica(null)
    setPensandoPractica(false)
    setMotivoPractica(null)
    setRevisionSubida(false)
    setPantallaPorQues(false)
    setAriaPorQues(false)
    setPreguntaPractica(null)
  }

  /**
   * Deja la práctica como debe estar al empezar el paso `indice` (lo que dejaron los anteriores).
   * Así saltar a un capítulo, «Siguiente» o «Repetir» siempre parten de un estado coherente.
   */
  const prepararPractica = (indice: number) => {
    const pr = practicaAlEmpezar(indice)
    const base = acrNuevo(evento, auth.currentUser?.uid ?? '', nombreDe(user), repeticion)
    const causas = pr.propuesta
      ? PROPUESTA_TUTORIAL.causas.map((c) =>
          c.id === 'tut-humana' && pr.humanaCorregida ? { ...c, texto: CORRECCION_HUMANA } : c,
        )
      : []
    const a: Acr = {
      ...base,
      respuestas: {
        ...(base.respuestas ?? RESPUESTAS_VACIAS),
        porQue: pr.porQue ? TEXTO_Q2 : '',
        porQues: pr.porQues ? PORQUES_TUTORIAL : [],
        queHacemos: pr.queHacemos ? TEXTO_Q3 : '',
      },
      piezaGuardada: pr.pieza,
      causas,
      acciones: pr.propuesta ? PROPUESTA_TUTORIAL.acciones : [],
      ...(pr.propuesta ? { propuesta: { origen: 'ia' as const, modelo: 'tutorial' } } : {}),
      estado: pr.guardado ? 'cerrado' : 'borrador',
    }
    cerrarCapasPractica()
    setAcr(a)
    setSucio(false)
    setPracticaFinal(pr.guardado ? estadoDe(a) : null)
    setVistaPractica(PASOS_TUTORIAL[indice]?.vista ?? null)
  }

  const terminarTutorialVisto = () => {
    marcarTutorialVisto()
    setVisto(true)
  }

  // Arranque pedido desde fuera (la vitrina): una sola vez al abrir.
  const arrancadoRef = useRef(false)
  useEffect(() => {
    if (arrancarTutorial && !arrancadoRef.current) {
      arrancadoRef.current = true
      iniciarTutorial()
    }
  })

  /** Cambia la fuerza (y el texto de ejemplo) de la acción de la propuesta. */
  const fuerzaEjemplo = (fuerza: FuerzaAccion) =>
    setAcr((prev) => ({
      ...prev,
      acciones: prev.acciones.map((x) =>
        x.id === 'tut-accion' ? { ...x, fuerza, texto: ACCION_POR_FUERZA[fuerza] } : x,
      ),
    }))

  /** Lo que ARIA hace en la práctica. Nunca escribe en Firestore: todo es estado local. */
  const accionTutorial = (a: AccionTutorial) => {
    switch (a) {
      case 'mostrarPropuesta':
        setPensandoPractica(false)
        setAcr((prev) => ({
          ...prev,
          causas: PROPUESTA_TUTORIAL.causas,
          acciones: PROPUESTA_TUTORIAL.acciones,
          propuesta: { origen: 'ia', modelo: 'tutorial' },
        }))
        return
      case 'pensar':
        setPensandoPractica(true)
        setAcr((prev) => ({ ...prev, causas: [], acciones: [] }))
        return
      case 'pieza':
        setAcr((prev) => ({ ...prev, piezaGuardada: true }))
        return
      case 'accionDebil':
        return fuerzaEjemplo('debil')
      case 'accionMedia':
        return fuerzaEjemplo('media')
      case 'accionFuerte':
        return fuerzaEjemplo('fuerte')
      case 'editarHumana':
        setEditando({ tipo: 'causa', id: 'tut-humana' })
        return
      case 'corregirHumana':
        setAcr((prev) => ({
          ...prev,
          causas: prev.causas.map((c) => (c.id === 'tut-humana' ? { ...c, texto: CORRECCION_HUMANA } : c)),
        }))
        return
      case 'editarAccion':
        setEditando({ tipo: 'accion', id: 'tut-accion' })
        return
      case 'cerrarEditor':
        setEditando(null)
        return
      case 'confirmarBorrado':
        setConfirmarBorrado(true)
        return
      case 'cancelarBorrado':
        // Se cancela: en la práctica no se borra nada.
        setConfirmarBorrado(false)
        setEditando(null)
        return
      case 'armarManual':
        setAcr((prev) => (prev.propuesta?.origen === 'manual' ? prev : armadoManual(prev)))
        return
      case 'nivelLatente':
        setAcr((prev) => ({ ...prev, causas: prev.causas.map((c) => (c.id === 'q2' ? { ...c, nivel: 'latente' } : c)) }))
        return
      case 'fuerzaFuerte':
        setAcr((prev) => {
          const r2 = prev.respuestas ?? RESPUESTAS_VACIAS
          const q3: AccionAcr = {
            id: 'q3',
            texto: r2.queHacemos,
            fuerza: 'fuerte',
            causaId: 'q2',
            responsable: '',
            fechaLimite: null,
            estado: 'pendiente',
          }
          return { ...prev, acciones: [...prev.acciones.filter((x) => x.id !== 'q3'), q3] }
        })
        return
      case 'mensajeFalta':
        setMotivoPractica(MOTIVO_EJEMPLO)
        return
      case 'guardar': {
        setMotivoPractica(null)
        const cerrado: Acr = { ...acr, piezaGuardada: true, estado: 'cerrado' }
        setAcr(cerrado)
        setPracticaFinal(estadoDe(cerrado))
        return
      }
      case 'subirFuerza':
        setRevisionSubida(true)
        return
      case 'porQueMas':
        setAcr((prev) => ({
          ...prev,
          respuestas: { ...(prev.respuestas ?? RESPUESTAS_VACIAS), porQues: PORQUES_TUTORIAL },
        }))
        return
      case 'abrirPantalla':
        setPantallaPorQues(true)
        return
      case 'cerrarPantalla':
        setPantallaPorQues(false)
        return
      case 'abrirAria':
        setPreguntaPractica(PREGUNTA_TUTORIAL)
        setAriaPorQues(true)
        return
      case 'cerrarAria':
        setAriaPorQues(false)
        return
    }
  }

  const cerrarHoja = () => {
    if (tutorial) {
      terminarTutorialVisto()
      volverAlReal()
    } else if (sucio) {
      persistir(acr)
    }
    onClose()
  }

  const itemEditado = editando
    ? editando.tipo === 'causa'
      ? acr.causas.find((c) => c.id === editando.id)
      : acr.acciones.find((x) => x.id === editando.id)
    : undefined

  /** Borra el ítem; si era una causa, las acciones que la atacaban quedan sin causa. */
  const borrarItem = () => {
    if (!editando) return
    cambiar((a) =>
      editando.tipo === 'causa'
        ? {
            ...a,
            causas: a.causas.filter((c) => c.id !== editando.id),
            acciones: a.acciones.map((x) => (x.causaId === editando.id ? { ...x, causaId: null } : x)),
          }
        : { ...a, acciones: a.acciones.filter((x) => x.id !== editando.id) },
    )
    setEditando(null)
    setConfirmarBorrado(false)
  }

  const motivo = motivoNoCierra(acr)
  /** En la práctica siempre hay aviso de repetición: el caso de los resortes. */
  const avisoRepeticion = repeticion ?? (tutorial ? REPETICION_TUTORIAL : null)
  const nada = () => {}
  const revisionAcrs = useMemo(() => acrsRevisionTutorial(acr, revisionSubida), [acr, revisionSubida])
  const minutos = acr.minutosDetencion != null ? `${acr.minutosDetencion} min` : 'Sin detención'
  const resumen = resumenFuerza(acr.acciones)

  return (
    <Sheet
      open={open}
      onClose={cerrarHoja}
      surface="grouped"
      size="wide"
      ocultarBarra
      title="Causa raíz"
      description={`${acr.equipo} · ${fechaCorta(acr.fechaTurno)} · ${minutos}`}
      headerAction={
        <Button data-tutorial="t-guardar-arriba" variant="plain" onClick={guardarAhora}>
          Guardar
        </Button>
      }
      actions={
        <div className="flex w-full flex-col gap-2.5">
          {(motivoPractica ?? motivo) && (
            <p data-tutorial="t-motivo" role="status" className="text-footnote font-semibold text-ink-warn">
              {motivoPractica ?? motivo}
            </p>
          )}
          {error && (
            <p role="alert" className="text-footnote font-semibold text-ink-crit">
              {error}
            </p>
          )}
          {practicaFinal && (
            <p role="status" className="text-footnote font-semibold text-foreground">
              {practicaFinal}
            </p>
          )}
          <Button data-tutorial="t-save" variant="filled" size="block" onClick={guardarAhora}>
            Guardar análisis
          </Button>
        </div>
      }
    >
      {/* Tutorial: botón bajo el título (no reemplaza a Guardar). La primera vez, una línea discreta. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {tutorial && (
            <p className="text-footnote font-semibold text-muted-foreground">
              Modo práctica: el caso de los resortes. Nada se guarda.
            </p>
          )}
          {!visto && !tutorial && (
            <p className="text-footnote text-muted-foreground">¿Primera vez? ARIA te lo muestra en 11 partes cortas.</p>
          )}
        </div>
        {/* En la práctica no se deshabilita: ARIA lo ilumina y debe verse como lo verá el técnico.
            Tocarlo ahí no hace nada (iniciarTutorial ya corre). */}
        <Button
          data-tutorial="t-head"
          variant="tinted"
          size="sm"
          className="min-h-[44px] shrink-0"
          aria-disabled={tutorial}
          onClick={iniciarTutorial}
        >
          <Play />
          Ver tutorial
        </Button>
      </div>

      {/* Celular: una columna en este orden. PC (lg): izquierda = preguntas; derecha = propuesta. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-5">
        {avisoRepeticion && (
          <ListGroup data-tutorial="t-alert">
            <div className="flex flex-col gap-2 px-4 py-3">
              <Pill tone="warning" className="self-start">
                Se repite
              </Pill>
              <p className="text-body text-foreground">{avisoRepeticion.resumen}</p>
            </div>
          </ListGroup>
        )}

        {/* Práctica, paso 2: las tres formas de la fila del evento de Bitácora. */}
        {tutorial && vistaPractica === 'filas' && (
          <div data-tutorial="t-filas" className="flex flex-col gap-2">
            <p className="text-footnote font-semibold text-muted-foreground">Así se ve en el evento de la Bitácora</p>
            <FilaAnalisis compacta acr={null} cargando={false} aplica repeticion={avisoRepeticion} onVer={nada} onAnalizar={nada} />
            <FilaAnalisis compacta acr={null} cargando={false} aplica repeticion={null} onVer={nada} onAnalizar={nada} />
            <FilaAnalisis
              compacta
              acr={{ ...acr, acciones: PROPUESTA_TUTORIAL.acciones, estado: 'cerrado' }}
              cargando={false}
              aplica
              repeticion={null}
              onVer={nada}
              onAnalizar={nada}
            />
          </div>
        )}

        <section data-tutorial="t-q1" className="flex flex-col gap-2">
          <label htmlFor={`${idPiezas}-q1`} className={TITULO_PREGUNTA}>
            1. ¿Qué se rompió?
          </label>
          <textarea
            id={`${idPiezas}-q1`}
            rows={2}
            maxLength={2000}
            value={r.queSeRompio}
            onChange={(e) => cambiarRespuesta('queSeRompio', e.target.value)}
            className={`${CAMPO} resize-y pr-14`}
          />
        </section>

        <section data-tutorial="t-q2" className="flex flex-col gap-2">
          <label htmlFor={`${idPiezas}-q2`} className={TITULO_PREGUNTA}>
            2. ¿Por qué se rompió?
          </label>
          <SpeechTextarea
            id={`${idPiezas}-q2`}
            rows={2}
            maxLength={2000}
            value={r.porQue}
            onChange={(e) => cambiarRespuesta('porQue', e.target.value)}
            className={`${CAMPO} resize-y pr-14`}
          />
          <CadenaPorQues
            idBase={idPiezas}
            queSeRompio={r.queSeRompio}
            primero={r.porQue}
            extras={r.porQues ?? []}
            onCambiarPrimero={(v) => cambiarPorQues({ porQue: v })}
            onCambiarExtras={(v) => cambiarPorQues({ porQues: v })}
            pantallaAbierta={pantallaPorQues}
            onPantalla={setPantallaPorQues}
            preguntar={preguntar}
            equipo={acr.equipo}
            onUsoAria={() => cambiarPorQues({ porQuesModo: 'aria' })}
            ariaAbierta={ariaPorQues}
            onAria={setAriaPorQues}
            // En el tutorial siempre la pregunta fija (aunque el técnico toque el botón a mano).
            preguntaPractica={tutorial ? (preguntaPractica ?? PREGUNTA_TUTORIAL) : null}
          />
        </section>

        <section data-tutorial="t-q3" className="flex flex-col gap-2">
          <label htmlFor={`${idPiezas}-q3`} className={TITULO_PREGUNTA}>
            3. ¿Qué hacemos para que no vuelva?
          </label>
          <SpeechTextarea
            id={`${idPiezas}-q3`}
            rows={2}
            maxLength={2000}
            value={r.queHacemos}
            onChange={(e) => cambiarRespuesta('queHacemos', e.target.value)}
            className={`${CAMPO} resize-y pr-14`}
          />
        </section>

        </div>
        <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          {/* En la práctica se ve habilitado (ARIA lo toca); la IA real no se llama. */}
          <Button
            data-tutorial="t-prop"
            variant="tinted"
            disabled={!tutorial && !puedeProponer}
            aria-disabled={tutorial}
            onClick={proponerConIA}
          >
            Proponer causas
          </Button>
          {!tutorial && !pensando && !puedeProponer && (
            <p className="text-footnote text-muted-foreground">{motivoNoPropone(r)}</p>
          )}
          <Button
            data-tutorial="t-manual"
            variant="plain"
            aria-disabled={tutorial}
            onClick={() => {
              if (tutorial) return
              // Con una propuesta de ARIA, armar a mano la reemplaza: se pide confirmar.
              if (acr.propuesta?.origen === 'ia' && hayGrupo) setConfirmarArmado(true)
              else cambiar((a) => armadoManual(a))
            }}
          >
            Armar a mano
          </Button>
          {(pensando || pensandoPractica) && <p className="text-footnote text-muted-foreground">ARIA está pensando…</p>}
          {avisoIA && <p className="text-footnote font-semibold text-ink-warn">{avisoIA}</p>}
        </div>

        <div data-tutorial="t-propuesta" className="flex flex-col gap-5">
        {hayGrupo && (
          <ListGroup title={manual ? 'Armado a mano · toca para corregir' : 'Propuesta IA · toca para corregir'}>
            {acr.causas.map((c) => (
              <button
                key={c.id}
                type="button"
                data-tutorial={c.nivel === 'latente' ? 't-lat' : c.nivel === 'humana' ? 't-hum' : 't-fis'}
                onClick={() => setEditando({ tipo: 'causa', id: c.id })}
                className="flex min-h-11 w-full flex-col items-start gap-1.5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Pill tone={TONO_NIVEL[c.nivel]}>{ETIQUETA_NIVEL[c.nivel]}</Pill>
                <span className="text-body text-foreground">{c.texto}</span>
              </button>
            ))}
            {acr.acciones.map((a) => (
              <button
                key={a.id}
                type="button"
                data-tutorial="t-accion"
                onClick={() => setEditando({ tipo: 'accion', id: a.id })}
                className="flex min-h-11 w-full flex-col items-start gap-1.5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Pill tone={TONO_FUERZA[a.fuerza]}>{ETIQUETA_FUERZA[a.fuerza]}</Pill>
                <span className="text-body text-foreground">{a.texto}</span>
              </button>
            ))}
          </ListGroup>
        )}

        {manual && (
          <ListGroup data-tutorial="t-elige" title="Elige a mano">
            <div className="flex flex-col gap-3 px-4 py-3">
              <p className="text-footnote font-semibold text-foreground">Nivel de la causa del porqué</p>
              <div data-tutorial="t-nivel" className="lg:max-w-[320px]">
                <SegmentedControl
                  ariaLabel="Nivel de la causa del porqué"
                  value={nivelQ2}
                  onChange={fijarNivelQ2}
                  segments={NIVEL_SEGMENTOS}
                />
              </div>
              <p className="text-footnote font-semibold text-foreground">Fuerza de la acción</p>
              <div data-tutorial="t-fuerza" className="lg:max-w-[320px]">
                <SegmentedControl
                  ariaLabel="Fuerza de la acción"
                  value={(fuerzaQ3 ?? '') as FuerzaAccion}
                  onChange={fijarFuerzaQ3}
                  segments={FUERZA_SEGMENTOS}
                />
              </div>
              <p className="text-footnote text-muted-foreground">{AYUDA_FUERZA}</p>
            </div>
          </ListGroup>
        )}

        {resumen.acciones > 0 && resumen.fuertePct != null && (
          <p className="text-footnote text-muted-foreground tabular-nums">
            {Math.round(resumen.fuertePct)} % de las acciones son fuertes.
          </p>
        )}
        </div>

        {evento.fotos.length > 0 ? (
          <div data-tutorial="t-fotos" className="grid grid-cols-3 gap-3" aria-label="Fotos del evento">
            {evento.fotos.map((f) => (
              <img
                key={f.path}
                src={f.thumbUrl ?? f.url}
                alt={ETIQUETA_FOTO[f.etiqueta]}
                className="aspect-square w-full rounded-ctl bg-muted-foreground/10 object-cover"
              />
            ))}
          </div>
        ) : (
          tutorial && (
            // Práctica sin fotos en el evento: el lugar donde entran, para poder mostrarlo.
            <ListGroup data-tutorial="t-fotos" title="Fotos del evento">
              <p className="px-4 py-3 text-body text-muted-foreground">
                Aquí entran solas las fotos que subiste en la Bitácora.
              </p>
            </ListGroup>
          )
        )}

        <ListGroup>
          <InterruptorPieza
            activo={acr.piezaGuardada}
            onCambiar={(v) => cambiar((a) => ({ ...a, piezaGuardada: v }))}
          />
        </ListGroup>
        </div>
      </div>

      {tutorial && (
        <MotorTutorialAcr
          onCerrar={() => {
            terminarTutorialVisto()
            volverAlReal()
          }}
          onTerminar={terminarTutorialVisto}
          preparar={prepararPractica}
          escribir={(campo, texto) =>
            setAcr((prev) => ({ ...prev, respuestas: { ...(prev.respuestas ?? RESPUESTAS_VACIAS), [campo]: texto } }))
          }
          accion={accionTutorial}
        />
      )}

      {/* Práctica, capítulos 10 y 11: la vista de lectura y la revisión semanal, sin Firestore. */}
      {tutorial && vistaPractica === 'lectura' && (
        <AcrLectura open onClose={() => setVistaPractica(null)} acr={acr} onEditar={() => setVistaPractica(null)} />
      )}
      {tutorial && vistaPractica === 'revision' && (
        <RevisionSemanalSheet
          open
          onClose={() => setVistaPractica(null)}
          acrs={revisionAcrs}
          periodo="21-09-2026 → 27-09-2026"
          puedeEditar
          onGuardar={nada}
        />
      )}

      {itemEditado && editando && (
        <Sheet
          open
          onClose={() => setEditando(null)}
          surface="grouped"
          title={editando.tipo === 'causa' ? 'Causa' : 'Acción'}
          actions={
            <div className="flex w-full flex-col gap-2.5">
              <Button data-tutorial="t-listo" variant="filled" size="block" onClick={() => setEditando(null)}>
                Listo
              </Button>
              <Button
                data-tutorial="t-borrar"
                variant="destructive"
                size="block"
                onClick={() => setConfirmarBorrado(true)}
              >
                Borrar
              </Button>
            </div>
          }
        >
          <div data-tutorial="t-editor" className="flex flex-col gap-4">
            <textarea
              aria-label="Texto"
              rows={3}
              value={itemEditado.texto}
              onChange={(e) =>
                cambiar((a) =>
                  editando.tipo === 'causa'
                    ? { ...a, causas: a.causas.map((c) => (c.id === editando.id ? { ...c, texto: e.target.value } : c)) }
                    : { ...a, acciones: a.acciones.map((x) => (x.id === editando.id ? { ...x, texto: e.target.value } : x)) },
                )
              }
              className={`${CAMPO} resize-y pr-14`}
            />
            <div data-tutorial="t-editor-sel">
            {editando.tipo === 'causa' ? (
              <SegmentedControl
                ariaLabel="Nivel de la causa"
                value={(itemEditado as CausaAcr).nivel}
                onChange={(nivel) =>
                  cambiar((a) => ({ ...a, causas: a.causas.map((c) => (c.id === editando.id ? { ...c, nivel } : c)) }))
                }
                segments={NIVEL_SEGMENTOS}
              />
            ) : (
              <SegmentedControl
                ariaLabel="Fuerza de la acción"
                value={(itemEditado as AccionAcr).fuerza}
                onChange={(fuerza) =>
                  cambiar((a) => ({ ...a, acciones: a.acciones.map((x) => (x.id === editando.id ? { ...x, fuerza } : x)) }))
                }
                segments={FUERZA_SEGMENTOS}
              />
            )}
            </div>
          </div>
        </Sheet>
      )}

      <ActionSheet
        open={confirmarArmado}
        title="¿Armar a mano?"
        description="Se reemplaza la propuesta de ARIA por lo que escribiste en las preguntas."
        confirmLabel="Armar a mano"
        onConfirm={() => {
          setConfirmarArmado(false)
          cambiar((a) => armadoManual(a))
        }}
        onCancel={() => setConfirmarArmado(false)}
      />

      <ActionSheet
        open={confirmarBorrado}
        title={editando?.tipo === 'causa' ? '¿Borrar esta causa?' : '¿Borrar esta acción?'}
        description="Se quita del análisis. Puedes volver a agregarla."
        confirmLabel="Borrar"
        onConfirm={borrarItem}
        onCancel={() => setConfirmarBorrado(false)}
      />
    </Sheet>
  )
}

/** Interruptor de «Pieza dañada guardada» (mismo marcado que el de la Bitácora). */
function InterruptorPieza({ activo, onCambiar }: { activo: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      data-tutorial="t-pieza"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="text-body font-semibold">Pieza dañada guardada antes de limpiar</span>
      <span
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${activo ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <span
          className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${activo ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
        />
      </span>
    </button>
  )
}
