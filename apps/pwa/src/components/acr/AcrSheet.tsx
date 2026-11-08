/**
 * AcrSheet — opción A del ACR: hoja guiada de 5 pasos (definir → evidencia → analizar →
 * acciones → verificar). Spec: SPEC_ACR.md §5. Mockup aprobado: acr-mockup.html (marco A).
 *
 * Solo compone con `@/components/piel`. El borrador se guarda solo (debounce `AUTOGUARDADO_MS`)
 * igual que la Bitácora; `onGuardar` reemplaza el guardado en Firestore (vitrina de desarrollo).
 */
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button, Disclosure, ListCell, ListGroup, Pill, SegmentedControl, Sheet } from '@/components/piel'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/store'
import { AUTOGUARDADO_MS, BITACORA_PLANTA, ETIQUETA_FOTO } from '@/config/bitacora'
import { subirFotoBitacora } from '@/services/bitacora/fotosBitacora'
import { guardarAcr, nuevoIdAcr } from '@/services/acr/acrFirestore'
import {
  ETIQUETA_PASO,
  PASOS,
  faltaParaAvanzar,
  faltaParaIr,
  nuevoIdSubdoc,
  primerPasoPendiente,
  resumenFuerza,
  type Paso,
} from '@/services/acr/acrLogica'
import {
  AYUDA_FUERZA,
  ETIQUETA_6M,
  ETIQUETA_FUERZA,
  ETIQUETA_NIVEL,
  ETIQUETA_RESULTADO,
  ORDEN_6M,
  TONO_NIVEL,
  type Acr,
  type AccionAcr,
  type Categoria6M,
  type EventoRefAcr,
  type FuerzaAccion,
  type NivelCausa,
  type ResultadoVerificacion,
} from '@/services/acr/acr.types'
import { logger } from '@/lib/logger'

export interface AcrSheetProps {
  open: boolean
  onClose: () => void
  evento: EventoRefAcr
  /** null/omitido = análisis nuevo. */
  acrExistente?: Acr | null
  /** Reemplaza el guardado en Firestore (la vitrina de desarrollo lo usa). */
  onGuardar?: (acr: Acr) => void
  /** Por defecto sube a Storage; la vitrina lo reemplaza. */
  subirFoto?: typeof subirFotoBitacora
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CAMPO =
  'w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-campo leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'
const CAMPO_LINEA = `${CAMPO} h-11 py-0`
const TITULO = 'text-title2 font-semibold text-foreground'
const AVISO = 'text-footnote font-semibold text-ink-warn'

const NIVEL_SEGMENTOS = (['fisica', 'humana', 'latente'] as const).map((n) => ({ value: n, label: ETIQUETA_NIVEL[n] }))
const FUERZA_SEGMENTOS = (['debil', 'media', 'fuerte'] as const).map((f) => ({ value: f, label: ETIQUETA_FUERZA[f] }))
const RESULTADO_SEGMENTOS = (['pendiente', 'eficaz', 'no_eficaz'] as const).map((r) => ({
  value: r,
  label: ETIQUETA_RESULTADO[r],
}))

/** `2026-09-24` → `24-09-2026`. Lo que no calza se muestra tal cual. */
function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

function nombreDe(user: { nombre?: string; apellido?: string } | null | undefined): string {
  const nombre = [user?.nombre?.split(' ')[0], user?.apellido?.split(' ')[0]].filter(Boolean).join(' ')
  return nombre || auth.currentUser?.displayName || auth.currentUser?.email || 'Sin nombre'
}

/** Análisis nuevo a partir del evento. El criterio sale del spec: «Sin repetir la falla en <equipo> durante 60 días». */
function acrNuevo(evento: EventoRefAcr, uid: string, nombre: string): Acr {
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
    evidencias: [],
    piezaGuardada: false,
    causas: [],
    acciones: [],
    verificacion: { criterio: `Sin repetir la falla en ${equipo} durante 60 días`, dias: 60, resultado: 'pendiente' },
    estado: 'borrador',
    createdBy: uid,
    createdByNombre: nombre,
    createdAt: ahora,
    updatedAt: ahora,
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function AcrSheet({ open, onClose, evento, acrExistente = null, onGuardar, subirFoto = subirFotoBitacora }: AcrSheetProps) {
  const user = useAuthStore((s) => s.user)
  const [acr, setAcr] = useState<Acr>(() => acrExistente ?? acrNuevo(evento, auth.currentUser?.uid ?? '', nombreDe(user)))
  const [paso, setPaso] = useState<Paso>('definir')
  const [aviso, setAviso] = useState<string | null>(null)
  const [sucio, setSucio] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Falso hasta el primer guardado de un análisis nuevo: ahí se crea el documento. */
  const guardadoRef = useRef(acrExistente != null)

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
  // Una ref para que el temporizador vea siempre el `persistir` del render actual, sin
  // reiniciarse en cada render (mismo truco que `onCloseRef` del Sheet).
  const persistirRef = useRef(persistir)
  persistirRef.current = persistir

  // Autoguardado: 1,5 s después del último cambio, como la Bitácora.
  useEffect(() => {
    if (!sucio) return
    const t = setTimeout(() => persistirRef.current(acr), AUTOGUARDADO_MS)
    return () => clearTimeout(t)
  }, [sucio, acr])

  const cambiar = (fn: (previo: Acr) => Acr) => {
    setAcr(fn)
    setSucio(true)
  }

  const indice = PASOS.indexOf(paso)
  const siguiente = PASOS[indice + 1]

  const irA = (destino: Paso) => {
    if (destino === paso) return
    const falta = faltaParaIr(acr, paso, destino)
    if (falta) {
      setPaso(falta.paso)
      setAviso(falta.mensaje)
      return
    }
    setAviso(null)
    setPaso(destino)
  }

  const alPie = () => {
    if (siguiente) {
      irA(siguiente)
      return
    }
    // Último paso: cerrar solo si todo cumple; si no, llevar al primer paso pendiente.
    const pendiente = primerPasoPendiente(acr)
    if (pendiente) {
      setPaso(pendiente)
      setAviso(faltaParaAvanzar(pendiente, acr))
      return
    }
    const cerrado: Acr = { ...acr, estado: 'cerrado', updatedAt: new Date() }
    setAcr(cerrado)
    persistir(cerrado)
    onClose()
  }

  const cerrarHoja = () => {
    if (sucio) persistir(acr)
    onClose()
  }

  const minutos = acr.minutosDetencion != null ? `${acr.minutosDetencion} min` : 'Sin detención'

  return (
    <Sheet
      open={open}
      onClose={cerrarHoja}
      surface="grouped"
      title="Análisis de causa raíz"
      description={`${acr.equipo} · ${fechaCorta(acr.fechaTurno)} · ${minutos}`}
      actions={
        <div className="flex w-full flex-col gap-2.5">
          {aviso && (
            <p role="alert" className={AVISO}>
              {aviso}
            </p>
          )}
          {error && (
            <p role="alert" className="text-footnote font-semibold text-ink-crit">
              {error}
            </p>
          )}
          <Button variant="filled" size="block" onClick={alPie}>
            {siguiente ? `Siguiente: ${ETIQUETA_PASO[siguiente].toLowerCase()}` : 'Cerrar ACR'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Cinco etiquetas no caben a 375 px: la barra misma es el selector (cada tramo es un
            botón de 44 px de alto) y abajo va el nombre del paso actual. */}
        <div className="flex flex-col gap-1">
          <div className="-my-5 flex gap-1.5" role="group" aria-label="Paso del análisis">
            {PASOS.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => irA(p)}
                aria-label={`Paso ${i + 1}: ${ETIQUETA_PASO[p]}`}
                aria-current={p === paso ? 'step' : undefined}
                className="flex h-11 flex-1 items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className={`h-1 w-full rounded-full ${i <= indice ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
              </button>
            ))}
          </div>
          <p className="text-footnote text-muted-foreground tabular-nums">
            Paso {indice + 1} de {PASOS.length} · {ETIQUETA_PASO[paso]}
          </p>
        </div>

        {paso === 'definir' && <PasoDefinir acr={acr} minutos={minutos} cambiar={cambiar} />}
        {paso === 'evidencia' && (
          <PasoEvidencia acr={acr} evento={evento} cambiar={cambiar} subirFoto={subirFoto} />
        )}
        {paso === 'analizar' && <PasoAnalizar acr={acr} cambiar={cambiar} />}
        {paso === 'acciones' && <PasoAcciones acr={acr} cambiar={cambiar} />}
        {paso === 'verificar' && <PasoVerificar acr={acr} cambiar={cambiar} />}
      </div>
    </Sheet>
  )
}

// ── Pasos ────────────────────────────────────────────────────────────────────

type Cambio = (fn: (previo: Acr) => Acr) => void

function PasoDefinir({ acr, minutos, cambiar }: { acr: Acr; minutos: string; cambiar: Cambio }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-4">
      <label htmlFor={id} className={TITULO}>
        ¿Qué pasó?
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={2000}
        value={acr.definicion}
        onChange={(e) => cambiar((a) => ({ ...a, definicion: e.target.value }))}
        className={`${CAMPO} min-h-[112px] resize-y`}
      />
      <ListGroup footer="Viene del evento de la Bitácora.">
        <ListCell title="Minutos de detención" value={minutos} />
      </ListGroup>
    </div>
  )
}

function PasoEvidencia({
  acr,
  evento,
  cambiar,
  subirFoto,
}: {
  acr: Acr
  evento: EventoRefAcr
  cambiar: Cambio
  subirFoto: typeof subirFotoBitacora
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errorFoto, setErrorFoto] = useState<string | null>(null)

  /** Agrega la foto si no está en el análisis, la quita si ya está. */
  const alternar = (path: string, nueva: Acr['evidencias'][number] | null) =>
    cambiar((a) => {
      const esta = a.evidencias.some((e) => e.path === path)
      if (esta) return { ...a, evidencias: a.evidencias.filter((e) => e.path !== path) }
      return nueva ? { ...a, evidencias: [...a.evidencias, nueva] } : a
    })

  const alElegirFoto = async (lista: FileList | null) => {
    const archivo = lista?.[0]
    if (!archivo) return
    setSubiendo(true)
    setErrorFoto(null)
    try {
      const foto = await subirFoto(evento.turnoId, evento.id, archivo, 'foto')
      cambiar((a) => ({
        ...a,
        evidencias: [...a.evidencias, { path: foto.path, url: foto.url, nota: 'Foto del análisis', origen: 'acr' }],
      }))
    } catch (e) {
      setErrorFoto(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Fotos del evento (se incluyen por defecto) y las que se subieron desde este análisis.
  const delEvento = evento.fotos.map((f) => ({
    path: f.path,
    miniatura: f.thumbUrl ?? f.url,
    alt: ETIQUETA_FOTO[f.etiqueta],
    nueva: { path: f.path, url: f.url, nota: ETIQUETA_FOTO[f.etiqueta], origen: 'bitacora' as const },
  }))
  const delAnalisis = acr.evidencias
    .filter((e) => e.origen === 'acr' && !delEvento.some((f) => f.path === e.path))
    .map((e) => ({ path: e.path, miniatura: e.url, alt: e.nota || 'Foto del análisis', nueva: null }))
  const fotos = [...delEvento, ...delAnalisis]

  return (
    <div className="flex flex-col gap-4">
      <h3 className={TITULO}>Evidencia</h3>

      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {fotos.map((f) => {
            const incluida = acr.evidencias.some((e) => e.path === f.path)
            return (
              <button
                key={f.path}
                type="button"
                aria-pressed={incluida}
                onClick={() => alternar(f.path, f.nueva)}
                className="flex flex-col gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={f.miniatura}
                  alt={f.alt}
                  className={`aspect-square w-full rounded-ctl bg-muted-foreground/10 object-cover ${incluida ? '' : 'opacity-40'}`}
                />
                <span className="text-caption font-semibold text-foreground">
                  {incluida ? 'Incluida' : 'Fuera del análisis'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Foto del análisis"
          onChange={(e) => void alElegirFoto(e.target.files)}
        />
        <Button variant="tinted" disabled={subiendo} onClick={() => inputRef.current?.click()}>
          {subiendo ? 'Subiendo foto…' : 'Agregar foto'}
        </Button>
        {errorFoto && (
          <p role="alert" className="text-footnote font-semibold text-ink-crit">
            {errorFoto}
          </p>
        )}
      </div>

      <ListGroup>
        <InterruptorPieza
          activo={acr.piezaGuardada}
          onCambiar={(v) => cambiar((a) => ({ ...a, piezaGuardada: v }))}
        />
      </ListGroup>
    </div>
  )
}

/** Interruptor de «Pieza dañada guardada» (mismo marcado que el de la Bitácora). */
function InterruptorPieza({ activo, onCambiar }: { activo: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex flex-col">
        <span className="text-body font-semibold">Pieza dañada guardada antes de limpiar</span>
        <span className="text-footnote text-muted-foreground">Quedó apartada para revisarla después</span>
      </span>
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

function PasoAnalizar({ acr, cambiar }: { acr: Acr; cambiar: Cambio }) {
  const [texto, setTexto] = useState('')
  const [nivel, setNivel] = useState<NivelCausa>('fisica')
  const [m6, setM6] = useState<Categoria6M | null>(null)
  const id = useId()

  const conteo = (m: Categoria6M) => acr.causas.filter((c) => c.m6 === m).length

  const agregar = () => {
    const t = texto.trim()
    if (!t) return
    cambiar((a) => ({ ...a, causas: [...a.causas, { id: nuevoIdSubdoc(), texto: t, nivel, m6 }] }))
    setTexto('')
    setM6(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor={id} className={TITULO}>
        ¿Por qué pasó?
      </label>
      <p className="text-footnote text-muted-foreground">
        El ACR no se cierra con una causa humana: hay que llegar a la latente.
      </p>

      {acr.causas.length > 0 && (
        <ListGroup>
          {acr.causas.map((c, i) => (
            <Fragment key={c.id}>
              {i > 0 && <p className="px-4 pt-3 text-footnote font-semibold text-muted-foreground">¿Por qué?</p>}
              <div className="flex flex-col gap-1.5 px-4 py-3">
                <Pill tone={TONO_NIVEL[c.nivel]} className="self-start">
                  {ETIQUETA_NIVEL[c.nivel]}
                </Pill>
                <p className="text-body text-foreground">{c.texto}</p>
                {c.m6 && <p className="text-footnote text-muted-foreground">6M · {ETIQUETA_6M[c.m6]}</p>}
              </div>
            </Fragment>
          ))}
        </ListGroup>
      )}

      <ListGroup title="Agregar causa">
        <div className="flex flex-col gap-3 px-4 py-3">
          <textarea
            id={id}
            rows={2}
            placeholder="Describe la causa"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={`${CAMPO} resize-y`}
          />
          <SegmentedControl ariaLabel="Nivel de la causa" value={nivel} onChange={setNivel} segments={NIVEL_SEGMENTOS} />
          <Disclosure
            variant="inline"
            title="Plantilla 6M · opcional"
            summary={m6 ? ETIQUETA_6M[m6] : 'Sin etiqueta'}
            defaultOpen={false}
          >
            <div className="flex flex-wrap gap-2">
              {ORDEN_6M.map((m) => (
                <Button
                  key={m}
                  variant="tinted"
                  aria-pressed={m6 === m}
                  onClick={() => setM6(m6 === m ? null : m)}
                >
                  {m6 === m && <Check />}
                  {ETIQUETA_6M[m]} · {conteo(m)}
                </Button>
              ))}
            </div>
          </Disclosure>
          <Button variant="tinted" disabled={!texto.trim()} onClick={agregar}>
            Agregar causa
          </Button>
        </div>
      </ListGroup>
    </div>
  )
}

function PasoAcciones({ acr, cambiar }: { acr: Acr; cambiar: Cambio }) {
  const [texto, setTexto] = useState('')
  const [causaId, setCausaId] = useState<string | null>(null)
  const [responsable, setResponsable] = useState('')
  const [fecha, setFecha] = useState('')
  const [fuerza, setFuerza] = useState<FuerzaAccion>('debil')
  const id = useId()

  const resumen = resumenFuerza(acr.acciones)
  const textoCausa = (idCausa: string | null): string => {
    if (!idCausa) return 'sin causa elegida'
    return acr.causas.find((c) => c.id === idCausa)?.texto ?? 'causa borrada'
  }

  const agregar = () => {
    const t = texto.trim()
    if (!t) return
    const nueva: AccionAcr = {
      id: nuevoIdSubdoc(),
      texto: t,
      fuerza,
      causaId,
      responsable: responsable.trim(),
      fechaLimite: fecha || null,
      estado: 'pendiente',
    }
    cambiar((a) => ({ ...a, acciones: [...a.acciones, nueva] }))
    setTexto('')
    setCausaId(null)
    setResponsable('')
    setFecha('')
    setFuerza('debil')
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className={TITULO}>¿Qué hacemos?</h3>
      <p className="text-footnote text-muted-foreground">Cada acción ataca una causa. Toca su fuerza.</p>
      <p className="text-body font-semibold tabular-nums text-foreground" aria-live="polite">
        {resumen.fuertePct == null ? 'Sin acciones todavía' : `${Math.round(resumen.fuertePct)} % de acciones fuertes`}
      </p>

      {acr.acciones.length > 0 && (
        <ListGroup title="Acciones">
          {acr.acciones.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 px-4 py-3">
              <p className="text-body text-foreground">{a.texto}</p>
              <p className="text-footnote text-muted-foreground">
                Ataca: {textoCausa(a.causaId)} · Responsable: {a.responsable || 'sin asignar'}
                {a.fechaLimite ? ` · Límite ${fechaCorta(a.fechaLimite)}` : ''}
              </p>
              <SegmentedControl
                ariaLabel={`Fuerza de la acción: ${a.texto}`}
                value={a.fuerza}
                segments={FUERZA_SEGMENTOS}
                onChange={(f) =>
                  cambiar((prev) => ({
                    ...prev,
                    acciones: prev.acciones.map((x) => (x.id === a.id ? { ...x, fuerza: f } : x)),
                  }))
                }
              />
            </div>
          ))}
        </ListGroup>
      )}
      <p className="text-footnote text-muted-foreground">{AYUDA_FUERZA}</p>

      <ListGroup title="Agregar acción">
        <div className="flex flex-col gap-3 px-4 py-3">
          <textarea
            id={id}
            rows={2}
            placeholder="Qué se hace"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={`${CAMPO} resize-y`}
          />
          <p className="text-footnote font-semibold text-foreground">Causa que ataca</p>
          {acr.causas.length === 0 ? (
            <p className="text-footnote text-muted-foreground">Agrega primero una causa en el paso Analizar.</p>
          ) : (
            <div role="radiogroup" aria-label="Causa que ataca" className="flex flex-col">
              {acr.causas.map((c) => {
                const elegida = causaId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={elegida}
                    onClick={() => setCausaId(elegida ? null : c.id)}
                    className="flex min-h-11 items-center gap-2 py-2 text-left text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      {elegida && <Check className="size-4 text-primary" />}
                    </span>
                    <span className="min-w-0">{c.texto}</span>
                  </button>
                )
              })}
            </div>
          )}
          <input
            type="text"
            aria-label="Responsable"
            placeholder="Responsable (cargo o nombre)"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            className={CAMPO_LINEA}
          />
          <input
            type="date"
            aria-label="Fecha límite (opcional)"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={CAMPO_LINEA}
          />
          <SegmentedControl
            ariaLabel="Fuerza de la nueva acción"
            value={fuerza}
            onChange={setFuerza}
            segments={FUERZA_SEGMENTOS}
          />
          <Button variant="tinted" disabled={!texto.trim()} onClick={agregar}>
            Agregar acción
          </Button>
        </div>
      </ListGroup>
    </div>
  )
}

function PasoVerificar({ acr, cambiar }: { acr: Acr; cambiar: Cambio }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-4">
      <h3 className={TITULO}>¿Cómo sabemos que no vuelve?</h3>
      <ListGroup>
        <div className="flex flex-col gap-2 px-4 py-3">
          <label htmlFor={id} className="text-footnote font-semibold text-muted-foreground">
            Criterio
          </label>
          <textarea
            id={id}
            rows={2}
            value={acr.verificacion.criterio}
            onChange={(e) => cambiar((a) => ({ ...a, verificacion: { ...a.verificacion, criterio: e.target.value } }))}
            className={`${CAMPO} resize-y`}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="text-body text-foreground">Días a revisar</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            aria-label="Días a revisar"
            value={acr.verificacion.dias}
            onChange={(e) =>
              cambiar((a) => ({
                ...a,
                verificacion: { ...a.verificacion, dias: Math.max(0, Math.floor(Number(e.target.value) || 0)) },
              }))
            }
            className={`${CAMPO_LINEA} w-24 text-right tabular-nums`}
          />
        </div>
      </ListGroup>
      <div className="flex flex-col gap-2">
        <p className="text-footnote font-semibold text-muted-foreground">Resultado</p>
        <SegmentedControl
          ariaLabel="Resultado de la verificación"
          value={acr.verificacion.resultado}
          onChange={(r: ResultadoVerificacion) =>
            cambiar((a) => ({ ...a, verificacion: { ...a.verificacion, resultado: r } }))
          }
          segments={RESULTADO_SEGMENTOS}
        />
      </div>
    </div>
  )
}
