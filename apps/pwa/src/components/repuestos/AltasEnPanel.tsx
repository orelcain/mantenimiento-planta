/**
 * Piezas de «Alta de código» dentro de SolicitudesPanel: la tarjeta (teléfono) y la fila (PC) comparten el
 * mismo contenido, las dos acciones de bodega y sus dos bloques en línea («Registrar SAP creado» y
 * «Rechazar»). Van DENTRO de la tarjeta, no en un Sheet: el panel ya es un Dialog y no se apila un modal
 * sobre otro. Sin línea de stock ni Aprobar/Entregar: sin SAP no hay stock que mostrar ni que entregar.
 */
import { useEffect, useId, useState } from 'react'
import { Camera, Check, Hash, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { AltaCodigo, OrigenSap } from '@/hooks/repuestos/useSolicitudes'
import { duracionLegible } from '@/hooks/repuestos/trazaDeSolicitud'
import { avisoDeAlta, lineaCatalogoAlta } from '@/utils/aprendizaje/altaCodigoA3c'
import { normCodigo } from '@/utils/repuestos/normCodigo'

/** Lo que el panel necesita saber de un SAP que ya está en el maestro. */
export interface SapEnMaestro {
  nombre: string
  codigoFabricante: string
}

const MOTIVOS_SUGERIDOS = ['Falta foto de la etiqueta', 'Confirmar en terreno primero', 'Pedir el conjunto completo'] as const

const ESTADO_ALTA_META: Record<AltaCodigo['estado'], { label: string; cls: string }> = {
  pendiente: { label: 'Alta pendiente', cls: 'bg-warning/[0.15] text-ink-warn' },
  creada: { label: 'Creada', cls: 'bg-success/[0.15] text-ink-ok' },
  rechazada: { label: 'Rechazada', cls: 'bg-muted-foreground/[0.12] text-muted-foreground' },
}

function fmt(d: Date): string {
  try {
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

/** Etiqueta, título, código, contexto y avisos: lo que bodega lee para crear el SAP. */
export function AltaContenido({ a, className }: { a: AltaCodigo; className?: string }) {
  const aviso = avisoDeAlta(a)
  return (
    <div className={cn('min-w-0', className)}>
      <span className="inline-block rounded-ctl bg-primary/[0.15] px-1.5 py-0.5 text-caption font-medium text-brand-ink">Alta de código</span>
      <div className="mt-1 font-medium text-foreground">{a.textoBreve || '(sin nombre)'}</div>
      <div className="font-mono text-caption tabular-nums text-muted-foreground">Fabricante {a.codigoFabricante} · {fmt(a.createdAt)}</div>
      <div className="text-caption text-muted-foreground">{lineaCatalogoAlta(a)}</div>
      {aviso && <div className="text-caption font-medium text-ink-warn">{aviso}</div>}
      {a.observaciones && <div className="mt-0.5 text-caption italic text-muted-foreground">{a.observaciones}</div>}
    </div>
  )
}

/** Estado y traza: «Creada · SAP 3300112290 · por Pedro · en 1 d» o «Rechazada · por Pedro · 06-10» + motivo. */
export function AltaEstado({ a, conSolicitante = true }: { a: AltaCodigo; conSolicitante?: boolean }) {
  const meta = ESTADO_ALTA_META[a.estado]
  const tardo = a.creadaAt ? duracionLegible(a.createdAt, a.creadaAt) : null
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        {conSolicitante && <span>{a.solicitadoPorNombre || '—'}</span>}
        <span className={cn('inline-block rounded-ctl px-1.5 py-0.5 font-medium', meta.cls)}>{meta.label}</span>
        {a.estado === 'creada' && (
          <>
            {a.sapCreado && <span className="font-mono tabular-nums">SAP {a.sapCreado}</span>}
            {a.creadaPorNombre && <span>por {a.creadaPorNombre}{tardo ? ` · en ${tardo}` : ''}</span>}
            {a.origenSap && <span>{a.origenSap === 'ya_existia' ? 'Ya existía' : 'Código nuevo'}</span>}
          </>
        )}
        {a.estado === 'rechazada' && a.rechazadaPorNombre && <span>por {a.rechazadaPorNombre}{a.rechazadaAt ? ` · ${fmt(a.rechazadaAt)}` : ''}</span>}
        {a.fotoUrl && (
          <a href={a.fotoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-ink underline-offset-2 hover:underline">
            <Camera className="size-3" aria-hidden /> 1 foto
          </a>
        )}
      </div>
      {a.estado === 'rechazada' && a.motivoRechazo && <div className="text-caption italic text-muted-foreground">Motivo: «{a.motivoRechazo}»</div>}
    </>
  )
}

export type ModoAlta = 'sap' | 'rechazo'

/** Las dos acciones de bodega. Solo una alta pendiente las lleva. */
export function AltaAcciones({ a, modo, onModo, ocupada }: { a: AltaCodigo; modo: ModoAlta | null; onModo: (m: ModoAlta | null) => void; ocupada: boolean }) {
  if (a.estado !== 'pendiente') return null
  return (
    <div className="grid grid-cols-2 gap-2" data-testid={`alta-acciones-${a.id}`}>
      <Button variant="outline" disabled={ocupada} aria-expanded={modo === 'sap'} onClick={() => onModo(modo === 'sap' ? null : 'sap')}>
        <Hash aria-hidden /> Registrar SAP creado
      </Button>
      <Button variant="outline" className="text-ink-crit" disabled={ocupada} aria-expanded={modo === 'rechazo'} onClick={() => onModo(modo === 'rechazo' ? null : 'rechazo')}>
        <X aria-hidden /> Rechazar
      </Button>
    </div>
  )
}

const CAMPO = 'min-h-[44px] w-full rounded-ctl border border-border bg-card px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

/** «Registrar SAP creado»: 10 dígitos, aviso si el SAP ya es OTRO repuesto del maestro, y «nuevo» o «ya existía». */
export function FormRegistrarSap({
  a, buscarSap, onGuardar, onCancelar,
}: {
  a: AltaCodigo
  buscarSap?: (sap: string) => Promise<SapEnMaestro | null>
  onGuardar: (sap: string, origen: OrigenSap) => Promise<void>
  onCancelar: () => void
}) {
  const uid = useId()
  const [sap, setSap] = useState('')
  const [origen, setOrigen] = useState<OrigenSap>('nuevo')
  const [enMaestro, setEnMaestro] = useState<SapEnMaestro | null | 'cargando' | 'error'>(null)
  /** Sube al tocar «Reintentar»: vuelve a comprobar el SAP en el maestro. */
  const [reintento, setReintento] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const completo = /^\d{10}$/.test(sap)

  // Al llegar a 10 dígitos: ¿ese SAP ya es un repuesto del maestro?
  useEffect(() => {
    if (!completo || !buscarSap) { setEnMaestro(null); return }
    let vivo = true
    setEnMaestro('cargando')
    // Si la comprobación falla NO se habilita guardar a ciegas: se pide reintentar (el servicio igual
    // la repite dentro de la transacción, pero bodega no debe enterarse recién al guardar).
    buscarSap(sap).then((r) => { if (vivo) setEnMaestro(r) }, () => { if (vivo) setEnMaestro('error') })
    return () => { vivo = false }
  }, [sap, completo, buscarSap, reintento])

  const existente = enMaestro && enMaestro !== 'cargando' && enMaestro !== 'error' ? enMaestro : null
  // Es OTRO repuesto si su código de fabricante es distinto del de esta alta (vacío = el mismo, sin completar).
  const otroRepuesto = !!existente && !!existente.codigoFabricante && normCodigo(existente.codigoFabricante) !== normCodigo(a.codigoFabricante)
  const puedeGuardar = completo && !guardando && enMaestro !== 'cargando' && enMaestro !== 'error' && !otroRepuesto

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try { await onGuardar(sap, origen) }
    // Los errores de negocio (SAP de otro repuesto, alta ya resuelta por otro operador) traen su propio texto.
    catch (e) { setError(e instanceof Error && e.name === 'ErrorAltaSap' ? e.message : 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.') }
    finally { setGuardando(false) }
  }

  let pista: React.ReactNode = <span className="text-caption text-muted-foreground tabular-nums">{sap.length} de 10 dígitos</span>
  if (otroRepuesto && existente) pista = <span className="text-caption text-ink-crit">{sap} ya es «{existente.nombre}» en el maestro: revisa el número.</span>
  else if (existente) pista = <span className="text-caption text-ink-ok">Ya está en el maestro como «{existente.nombre}»{existente.codigoFabricante ? '' : ': se le agregará este código de fabricante'}.</span>
  else if (enMaestro === 'error') pista = (
    <span className="text-caption text-ink-crit">
      No se pudo comprobar el SAP en el maestro.{' '}
      <button type="button" onClick={() => setReintento((n) => n + 1)} className="font-semibold underline underline-offset-2">Reintentar</button>
    </span>
  )
  else if (completo && enMaestro === null && buscarSap) pista = <span className="text-caption text-muted-foreground">No está en el maestro: se creará con este código.</span>

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-ctl bg-background p-2.5" data-testid={`alta-form-sap-${a.id}`}>
      <label htmlFor={`${uid}-sap`} className="text-caption font-semibold text-muted-foreground">SAP creado</label>
      <input
        id={`${uid}-sap`}
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        pattern="\d{10}"
        value={sap}
        onChange={(e) => setSap(e.target.value.replace(/\D/g, '').slice(0, 10))}
        aria-invalid={otroRepuesto}
        className={cn(CAMPO, 'font-mono text-body tabular-nums tracking-wide', otroRepuesto && 'border-ink-crit', completo && !otroRepuesto && 'border-ink-ok')}
      />
      {pista}
      <div className="flex gap-1.5" role="group" aria-label="Origen del código SAP">
        {([['nuevo', 'Código nuevo'], ['ya_existia', 'Ya existía']] as const).map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={origen === v}
            onClick={() => setOrigen(v)}
            className={cn(
              'min-h-[44px] flex-1 rounded-full border px-2 text-footnote',
              origen === v ? 'border-primary bg-primary/10 font-semibold text-brand-ink' : 'border-border text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-caption text-ink-crit">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
        <Button disabled={!puedeGuardar} onClick={() => void guardar()}>
          {guardando ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Guardar SAP
        </Button>
      </div>
    </div>
  )
}

/** «Rechazar»: motivo obligatorio (máx. 300) con tres sugeridos que rellenan el campo. */
export function FormRechazar({ a, onRechazar, onCancelar }: { a: AltaCodigo; onRechazar: (motivo: string) => Promise<void>; onCancelar: () => void }) {
  const uid = useId()
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rechazar = async () => {
    setGuardando(true)
    setError(null)
    try { await onRechazar(motivo.trim()) }
    catch { setError('No se pudo rechazar. Revisa la conexión e inténtalo de nuevo.') }
    finally { setGuardando(false) }
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-ctl bg-background p-2.5" data-testid={`alta-form-rechazo-${a.id}`}>
      <label htmlFor={`${uid}-mot`} className="text-caption font-semibold text-muted-foreground">Motivo del rechazo</label>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS_SUGERIDOS.map((m) => (
          <button key={m} type="button" onClick={() => setMotivo(m)} className="min-h-[36px] rounded-full border border-border bg-card px-2.5 text-caption text-foreground">
            {m}
          </button>
        ))}
      </div>
      <textarea
        id={`${uid}-mot`}
        rows={2}
        maxLength={300}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Qué debe corregir quien lo pidió"
        className="min-h-[64px] w-full resize-none rounded-ctl border border-border bg-card px-3 py-2 text-subhead text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      {error && <p role="alert" className="text-caption text-ink-crit">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
        <Button variant="destructive" disabled={!motivo.trim() || guardando} onClick={() => void rechazar()}>
          {guardando ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />} Rechazar
        </Button>
      </div>
    </div>
  )
}
