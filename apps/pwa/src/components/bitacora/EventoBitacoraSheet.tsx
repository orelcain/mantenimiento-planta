import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ImagePlus, Loader2, RotateCw, Trash2, X } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { useToast } from '@/hooks/useToast'
import {
  ETIQUETA_FOTO,
  IMPACTOS,
  MAX_FOTOS_EVENTO,
  TIPOS_EVENTO,
  VENTANAS_SUGERIDAS,
} from '@/config/bitacora'
import type {
  EtiquetaFoto,
  EventoBitacora,
  EventoBitacoraDatos,
  FotoEvento,
  ImpactoEvento,
  TipoEvento,
  TurnoMantencion,
} from '@/services/bitacora/bitacora.types'
import { autorVisible } from '@/services/bitacora/bitacora.types'
import { copiaDeOrigen, etiquetaCortaTurno } from '@/services/bitacora/entregaTurno'
import { borrarFotoBitacora, subirFotoBitacora } from '@/services/bitacora/fotosBitacora'
import { SelectorTecnico } from './SelectorTecnico'
import { SelectorParticipantes } from './SelectorParticipantes'
import { BuscadorEquipo } from './BuscadorEquipo'
import type { OpcionEquipo } from '@/services/bitacora/buscarEquipos'
import { tecnicoRecordado } from './tecnicoRecordado'
import { formatoMinutos, horaSugeridaParaEvento, minutosEntre } from '@/services/bitacora/turnoMantencion'

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
  onClose: () => void
}

const CLAVE_RECIENTES = 'bitacora.equiposRecientes.v1'
const SIN_SENAL = 'Sin señal. Se sube sola cuando vuelva la conexión.'

function leerRecientes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]')
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

function recordarEquipo(equipo: string) {
  const e = equipo.trim()
  if (!e) return
  try {
    const lista = [e, ...leerRecientes().filter((x) => x.toLowerCase() !== e.toLowerCase())].slice(0, 12)
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista))
  } catch {
    /* sin almacenamiento local: solo se pierde la sugerencia */
  }
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
  tecnicos,
  opcionesEquipo,
  cargandoEquipos,
  subirFoto = subirFotoBitacora,
  onGuardar,
  onBorrar,
  onClose,
  pendienteOrigen = null,
}: EventoBitacoraSheetProps) {
  const { toast } = useToast()
  const esNuevo = !evento
  const eventoId = evento?.id ?? idNuevo

  const [quien, setQuien] = useState('')
  const [participantes, setParticipantes] = useState<string[]>([])
  const [equipoId, setEquipoId] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoEvento>('falla')
  const [equipo, setEquipo] = useState('')
  const [descripcion, setDescripcion] = useState('')
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
  const tecnicosRef = useRef(tecnicos)
  tecnicosRef.current = tecnicos

  // Cargar el formulario cada vez que se abre (nuevo o edición).
  useEffect(() => {
    if (!open) return
    sesion.current++
    // El nombre recordado solo vale si sigue en la lista (pudo corregirse o quitarse).
    const recordado = tecnicoRecordado()
    const lista = tecnicosRef.current.todos
    setQuien(lista.length === 0 || lista.includes(recordado) ? recordado : '')
    setParticipantes(evento?.participantes ?? [])
    // «Resolver pendiente»: el equipo, su vínculo y el tipo vienen del pendiente original.
    setEquipoId(evento?.equipoId ?? pendienteOrigen?.equipoId ?? null)
    setTipo(evento?.tipo ?? pendienteOrigen?.tipo ?? 'falla')
    setEquipo(evento?.equipo ?? pendienteOrigen?.equipo ?? '')
    setDescripcion(evento?.descripcion ?? '')
    setHoraInicio(evento?.horaInicio ?? horaSugeridaParaEvento(turno))
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
  }, [open, evento, turno, pendienteOrigen])

  const duracion = minutosEntre(horaInicio, horaTermino || null)
  const equiposSugeridos = useMemo(() => {
    const vistos = new Set<string>()
    return [...sugerenciasEquipo, ...(open ? leerRecientes() : [])].filter((e) => {
      const k = e.trim().toLowerCase()
      if (!k || vistos.has(k)) return false
      vistos.add(k)
      return true
    })
  }, [sugerenciasEquipo, open])

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
      if (miSesion !== sesion.current) {
        // Se canceló o se guardó sin esperarla mientras subía.
        void borrarFotoBitacora(foto.path).catch(() => undefined)
        return
      }
      subidasNuevas.current.push(foto.path)
      setFotos((prev) => [...prev, foto])
      setSubidas((prev) => prev.filter((x) => x.clave !== s.clave))
    } catch (e) {
      if (miSesion !== sesion.current) return
      const mensaje = (e as { code?: string })?.code === 'storage/unauthorized'
        ? 'Sin permiso para subir (faltan reglas de Storage).'
        : e instanceof Error && e.message.startsWith('Formato')
          ? e.message
          : 'No se pudo subir. Revisa la señal y reintenta.'
      setSubidas((prev) => prev.map((x) => (x.clave === s.clave ? { ...x, error: mensaje } : x)))
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
    nuevas.forEach((s) => void subir(s))
    if (inputRef.current) inputRef.current.value = ''
  }

  const quitarFoto = (foto: FotoEvento) => {
    setFotos((prev) => prev.filter((f) => f.path !== foto.path))
    if (subidasNuevas.current.includes(foto.path)) {
      subidasNuevas.current = subidasNuevas.current.filter((p) => p !== foto.path)
      void borrarFotoBitacora(foto.path).catch(() => undefined)
    } else {
      quitadas.current.push(foto.path)
    }
  }

  const cancelar = () => {
    // Lo subido en esta edición y no guardado no debe quedar huérfano; lo que
    // todavía está subiendo se borra solo al terminar (cambia la sesión).
    sesion.current++
    subidasNuevas.current.forEach((p) => void borrarFotoBitacora(p).catch(() => undefined))
    subidasNuevas.current = []
    onClose()
  }

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
    if (!descripcion.trim()) {
      setError('Escribe qué pasó y qué se hizo.')
      return
    }
    // Un término "antes" del inicio suele ser un typo (10:30 → 10:15) y daba
    // paradas de casi 24 h. Cruzar la medianoche real no pasa de unas horas.
    if (duracion != null && duracion > 12 * 60) {
      setError(`El término (${horaTermino}) queda antes del inicio (${horaInicio}). Revisa las horas.`)
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
          'Espera o toca Guardar otra vez para guardar sin ellas.',
      )
      return
    }
    setGuardando(true)
    try {
      await onGuardar(
        eventoId,
        {
          tipo,
          equipo,
          descripcion,
          horaInicio,
          horaTermino: horaTermino || null,
          impacto,
          minutosParada: minutosNum != null && Number.isFinite(minutosNum) ? minutosNum : null,
          ventana: ventana || null,
          pendiente,
          fotos,
          fotosAntes: evento?.fotos ?? [],
          quien,
          // Quien registra no se repite como participante (pudo quedar marcado antes de elegirlo).
          resuelvePendiente: pendienteOrigen && esNuevo ? copiaDeOrigen(pendienteOrigen) : null,
          participantes: participantes.filter(
            (p) => p.trim().toLowerCase() !== (esNuevo ? quien : (evento?.registradoPor ?? quien)).trim().toLowerCase(),
          ),
          equipoId,
        },
        esNuevo,
      )
      recordarEquipo(equipo)
      // Lo que seguía subiendo ya no entra en este evento (se borra al terminar).
      sesion.current++
      subidasNuevas.current = []
      // Las fotos quitadas las borra el hook DESPUÉS del OK del servidor.
      quitadas.current = []
      toast({
        title: esNuevo ? 'Evento agregado' : 'Evento actualizado',
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
    if (!evento) return
    if (!confirmarBorrado) {
      setConfirmarBorrado(true)
      return
    }
    setGuardando(true)
    try {
      subidasNuevas.current.forEach((p) => void borrarFotoBitacora(p).catch(() => undefined))
      await onBorrar(evento)
      toast({ title: 'Evento borrado' })
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
      onClose={cancelar}
      title={pendienteOrigen && esNuevo ? 'Resolver pendiente' : esNuevo ? 'Nuevo evento' : 'Editar evento'}
      actions={
        <>
          <Button variant="tinted" onClick={cancelar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            {subiendo ? 'Subiendo fotos…' : pendienteOrigen && esNuevo ? 'Guardar y cerrar pendiente' : 'Guardar'}
          </Button>
        </>
      }
    >
      {/* `[&>*]:shrink-0`: en un flex vertical con alto acotado, un hijo con
          overflow-x (la fila de tipos) se encoge a 0 px y desaparece. */}
      <div className="-mx-6 flex max-h-[min(68vh,640px)] flex-col gap-5 overflow-y-auto px-6 pb-1 [&>*]:shrink-0">
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

        {/* Quién: con la cuenta compartida de Mantención es el único dato de autoría. */}
        {tecnicos.todos.length > 0 && (
          <div>
            <SelectorTecnico
              etiqueta={esNuevo ? 'Quién registra' : 'Quién edita'}
              deTurno={tecnicos.deTurno}
              todos={tecnicos.todos}
              valor={quien}
              onChange={setQuien}
            />
            {!esNuevo && evento && (
              <p className="mt-1.5 text-footnote text-muted-foreground">Registró: {autorVisible(evento)}</p>
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

        {/* Tipo — con rótulo propio: sin él se confundía con la fila de nombres de arriba. */}
        <div>
          <span className={ETIQUETA_CAMPO}>Tipo</span>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Tipo de evento">
            {TIPOS_EVENTO.map((t) => (
              <Chip key={t.id} activo={tipo === t.id} onClick={() => setTipo(t.id)}>
                {t.label}
              </Chip>
            ))}
          </div>
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
              <p className="mt-1.5 text-footnote text-muted-foreground">Cuenta para el MTTR del turno. Si lo dejas vacío se usa la duración.</p>
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
                      <button type="button" onClick={() => void subir(s)} className="inline-flex min-h-[32px] items-center gap-1 text-footnote font-semibold text-primary">
                        <RotateCw className="size-3.5" /> Reintentar
                      </button>
                    </>
                  ) : (
                    <>
                      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                      <span className="text-caption text-muted-foreground">Subiendo {ETIQUETA_FOTO[s.etiqueta].toLowerCase()}…</span>
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
        <button
          type="button"
          role="switch"
          aria-checked={pendiente}
          onClick={() => setPendiente((v) => !v)}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-card bg-muted-foreground/10 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex flex-col">
            <span className="text-body font-semibold">Queda pendiente</span>
            <span className="text-footnote text-muted-foreground">Sale destacado en el correo para el turno siguiente.</span>
          </span>
          <span className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${pendiente ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
            <span className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${pendiente ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
          </span>
        </button>

        {error && (
          <p role="alert" className="text-footnote font-semibold text-ink-crit">
            {error}
          </p>
        )}

        {!esNuevo && (
          <Button variant="destructive" onClick={borrar} disabled={guardando} className="self-start">
            <Trash2 /> {confirmarBorrado ? 'Toca de nuevo para borrar' : 'Borrar evento'}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
