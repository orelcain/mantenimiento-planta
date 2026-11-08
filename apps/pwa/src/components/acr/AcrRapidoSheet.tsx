/**
 * AcrRapidoSheet — tarjeta R1 del ACR: 3 preguntas, propuesta de la IA o armado a mano, y guardar.
 * Spec: SPEC_ACR_R1.md §4. Reemplaza a la hoja de 5 pasos (`AcrSheet`, retirada en R1).
 *
 * Meta: llenar un ACR en menos de un minuto. El borrador se guarda solo (`AUTOGUARDADO_MS`),
 * igual que la Bitácora.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, ListGroup, Pill, SegmentedControl, Sheet, ActionSheet } from '@/components/piel'
import { SpeechTextarea } from '@/components/ui/SpeechTextarea'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/store'
import { AUTOGUARDADO_MS, BITACORA_PLANTA, ETIQUETA_FOTO } from '@/config/bitacora'
import { guardarAcr, nuevoIdAcr } from '@/services/acr/acrFirestore'
import { motivoNoCierra, puedeCerrar, resumenFuerza } from '@/services/acr/acrLogica'
import { proponerAcr, type ProponerAcr } from '@/services/acr/proponerAcr'
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
import { CORRECCION_HUMANA, PROPUESTA_TUTORIAL, type AccionTutorial } from './tutorialAcr'

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
  /** Arranca el tutorial al abrir (la vitrina lo usa; en la app se pide con el botón). */
  arrancarTutorial?: boolean
}

// ── Constantes y helpers ─────────────────────────────────────────────────────

const CAMPO =
  'w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-campo leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'
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

/**
 * Armado a mano (SPEC §4.5): Q1 → causa física; Q2 → causa con el nivel elegido (por defecto
 * latente); Q3 → acción con la fuerza elegida, sin valor por defecto. Ids fijos (`q1`, `q2`, `q3`)
 * para que los selectores encuentren su ítem.
 */
function armadoManual(a: Acr): Acr {
  const r = a.respuestas ?? RESPUESTAS_VACIAS
  const causas: CausaAcr[] = [
    { id: 'q1', texto: r.queSeRompio, nivel: 'fisica', m6: null },
    { id: 'q2', texto: r.porQue, nivel: 'latente', m6: null },
  ]
  return { ...a, propuesta: { origen: 'manual', modelo: null }, causas, acciones: [] }
}

/** En armado a mano el texto sale de las respuestas: se mantiene al cambiar una pregunta. */
function sincronizarManual(a: Acr): Acr {
  if (a.propuesta?.origen !== 'manual') return a
  const r = a.respuestas ?? RESPUESTAS_VACIAS
  return {
    ...a,
    causas: a.causas.map((c) => (c.id === 'q1' ? { ...c, texto: r.queSeRompio } : c.id === 'q2' ? { ...c, texto: r.porQue } : c)),
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

  const accionTutorial = (a: AccionTutorial) => {
    if (a === 'proponer') {
      setAcr((prev) => ({
        ...prev,
        causas: PROPUESTA_TUTORIAL.causas,
        acciones: PROPUESTA_TUTORIAL.acciones,
        propuesta: { origen: 'ia', modelo: 'tutorial' },
      }))
    } else if (a === 'corregirHumana') {
      setAcr((prev) => ({
        ...prev,
        causas: prev.causas.map((c) => (c.id === 'tut-humana' ? { ...c, texto: CORRECCION_HUMANA } : c)),
      }))
    } else {
      setAcr((prev) => ({ ...prev, piezaGuardada: true, estado: 'cerrado' }))
      setPracticaFinal(estadoDe({ ...acr, piezaGuardada: true, estado: 'cerrado' }))
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
  const minutos = acr.minutosDetencion != null ? `${acr.minutosDetencion} min` : 'Sin detención'
  const resumen = resumenFuerza(acr.acciones)

  return (
    <Sheet
      open={open}
      onClose={cerrarHoja}
      surface="grouped"
      size="wide"
      title="Causa raíz"
      description={`${acr.equipo} · ${fechaCorta(acr.fechaTurno)} · ${minutos}`}
      headerAction={
        <Button variant="plain" onClick={guardarAhora}>
          Guardar
        </Button>
      }
      actions={
        <div className="flex w-full flex-col gap-2.5">
          {motivo && (
            <p role="status" className="text-footnote font-semibold text-ink-warn">
              {motivo}
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
      <div className="mb-5 flex flex-col gap-2.5">
        {tutorial && (
          <p className="text-footnote font-semibold text-muted-foreground">
            Modo práctica: el caso de los resortes. Nada se guarda.
          </p>
        )}
        {!visto && !tutorial && (
          <p className="text-footnote text-muted-foreground">¿Primera vez? ARIA te muestra cómo en 1 minuto.</p>
        )}
        <Button data-tutorial="t-head" variant="tinted" disabled={tutorial} onClick={iniciarTutorial}>
          <Play />
          Ver tutorial
        </Button>
      </div>

      {/* Celular: una columna en este orden. PC (lg): izquierda = preguntas; derecha = propuesta. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-5">
        {repeticion && (
          <ListGroup data-tutorial="t-alert">
            <div className="flex flex-col gap-2 px-4 py-3">
              <Pill tone="warning" className="self-start">
                Se repite
              </Pill>
              <p className="text-body text-foreground">{repeticion.resumen}</p>
            </div>
          </ListGroup>
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
          <Button data-tutorial="t-prop" variant="tinted" disabled={!puedeProponer} onClick={proponerConIA}>
            Proponer causas
          </Button>
          <Button variant="plain" disabled={tutorial} onClick={() => cambiar((a) => armadoManual(a))}>
            Armar a mano
          </Button>
          {pensando && <p className="text-footnote text-muted-foreground">ARIA está pensando…</p>}
          {avisoIA && <p className="text-footnote font-semibold text-ink-warn">{avisoIA}</p>}
        </div>

        {hayGrupo && (
          <ListGroup title={manual ? 'Armado a mano · toca para corregir' : 'Propuesta IA · toca para corregir'}>
            {acr.causas.map((c) => (
              <button
                key={c.id}
                type="button"
                data-tutorial={c.nivel === 'latente' ? 't-lat' : c.nivel === 'humana' ? 't-hum' : undefined}
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
          <ListGroup title="Elige a mano">
            <div className="flex flex-col gap-3 px-4 py-3">
              <p className="text-footnote font-semibold text-foreground">Nivel de la causa del porqué</p>
              <SegmentedControl
                ariaLabel="Nivel de la causa del porqué"
                value={nivelQ2}
                onChange={fijarNivelQ2}
                segments={NIVEL_SEGMENTOS}
                className="lg:max-w-[320px]"
              />
              <p className="text-footnote font-semibold text-foreground">Fuerza de la acción</p>
              <SegmentedControl
                ariaLabel="Fuerza de la acción"
                value={(fuerzaQ3 ?? '') as FuerzaAccion}
                onChange={fijarFuerzaQ3}
                segments={FUERZA_SEGMENTOS}
                className="lg:max-w-[320px]"
              />
              <p className="text-footnote text-muted-foreground">{AYUDA_FUERZA}</p>
            </div>
          </ListGroup>
        )}

        {resumen.acciones > 0 && resumen.fuertePct != null && (
          <p className="text-footnote text-muted-foreground tabular-nums">
            {Math.round(resumen.fuertePct)} % de las acciones son fuertes.
          </p>
        )}

        {evento.fotos.length > 0 && (
          <div className="grid grid-cols-3 gap-3" aria-label="Fotos del evento">
            {evento.fotos.map((f) => (
              <img
                key={f.path}
                src={f.thumbUrl ?? f.url}
                alt={ETIQUETA_FOTO[f.etiqueta]}
                className="aspect-square w-full rounded-ctl bg-muted-foreground/10 object-cover"
              />
            ))}
          </div>
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
          escribir={(campo, texto) =>
            setAcr((prev) => ({ ...prev, respuestas: { ...(prev.respuestas ?? RESPUESTAS_VACIAS), [campo]: texto } }))
          }
          accion={accionTutorial}
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
              <Button variant="filled" size="block" onClick={() => setEditando(null)}>
                Listo
              </Button>
              <Button variant="destructive" size="block" onClick={() => setConfirmarBorrado(true)}>
                Borrar
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
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
        </Sheet>
      )}

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
