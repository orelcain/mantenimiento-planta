/**
 * RegistrarTrabajoJKSheet — «Registrar trabajo» desde una detención del Jack-Knife.
 * Crea un trabajo de Mantención en la Bitácora con su `jkClave` y su componente, para que el
 * buscador de /jack-knife lo cuente en la línea de tiempo. Spec: SPEC_BUSCADOR_JACK_KNIFE.md §3.
 */
import { useEffect, useId, useState } from 'react'
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Button, Sheet } from '@/components/piel'
import { auth, db } from '@/services/firebase'
import { BITACORA_COLECCION, BITACORA_PLANTA } from '@/config/bitacora'
import { toast } from '@/hooks/useToast'
import { dispositivoActual } from '@/services/bitacora/dispositivo'
import { trabajoDesdeJK, fechaUTC } from '@/services/bitacora/trabajoDesdeJK'
import type { RepuestoUsado } from '@/services/bitacora/bitacora.types'
import { RepuestosUsados } from '@/components/bitacora/RepuestosUsados'
import { fuenteRepuestosFirestore } from '@/services/bitacora/repuestosFirestore'
import { tecnicoRecordado } from '@/components/bitacora/tecnicoRecordado'

/** Una detención del Jack-Knife, tal como la ve la hoja. */
export interface DetencionParaTrabajo {
  turnoJkId: string
  /** `AAAA-MM-DD` del turno del Jack-Knife. */
  dateKey: string
  /** «Turno 1», «Turno 2»… */
  shiftId: string
  inicioMs: number
  min: number
  causa: string
  /** Comentario del operador que cae en esta detención (o null). */
  comentario: string | null
}

export interface RegistrarTrabajoJKSheetProps {
  open: boolean
  onClose: () => void
  detencion: DetencionParaTrabajo | null
  /** Palabras frecuentes de los comentarios de esa causa (máx. 5). */
  sugerencias: readonly string[]
  /** Se llama al guardar, para refrescar la línea de tiempo. */
  onGuardado?: () => void
}

const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
const ddmm = (dk: string) => `${dk.slice(8, 10)}-${dk.slice(5, 7)}`
const OTRO = '__otro__'

export function RegistrarTrabajoJKSheet({ open, onClose, detencion, sugerencias, onGuardado }: RegistrarTrabajoJKSheetProps) {
  const id = useId()
  const [equipo, setEquipo] = useState('')
  const [componente, setComponente] = useState<string | null>(null)
  const [componenteOtro, setComponenteOtro] = useState('')
  const [repuestos, setRepuestos] = useState<RepuestoUsado[]>([])
  const [nota, setNota] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Al abrir con otra detención, se reinicia el formulario con sus datos.
  const claveDetencion = detencion ? `${detencion.turnoJkId}|${detencion.inicioMs}` : ''
  useEffect(() => {
    if (!open || !detencion) return
    setEquipo('')
    setComponente(null)
    setComponenteOtro('')
    setRepuestos([])
    setNota(detencion.comentario ?? '')
    setAviso('')
    setError(null)
    setGuardando(false)
    // Solo al cambiar de detención o al abrir: los cambios del técnico no se pisan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, claveDetencion])

  if (!detencion) return null

  const titulo = `${detencion.causa} detuvo la línea ${Math.round(detencion.min)} min`
  const subtitulo = `${BITACORA_PLANTA.nombre} · ${ddmm(detencion.dateKey)} · ${detencion.shiftId}`
  const componenteFinal = componente === OTRO ? componenteOtro.trim() : (componente ?? '')

  const guardar = () => {
    setError(null)
    if (!equipo.trim()) return setError('Escribe la máquina o el equipo.')
    if (!nota.trim()) return setError('Escribe qué se hizo.')
    const u = auth.currentUser
    if (!u) return setError('Hay que iniciar sesión para escribir en la Bitácora.')
    const documento = trabajoDesdeJK({
      turnoJkId: detencion.turnoJkId,
      inicioMs: detencion.inicioMs,
      min: detencion.min,
      equipo,
      componente: componenteFinal,
      descripcion: nota,
      repuestos,
      avisoSap: aviso,
      registradoPor: tecnicoRecordado() || u.displayName || u.email || 'Sin nombre',
      uid: u.uid,
      autorNombre: u.displayName || u.email || 'Sin nombre',
      dispositivo: dispositivoActual(),
    })
    setGuardando(true)
    // Sin await: Firestore guarda en el teléfono al tiro y confirma después. Igual que la Bitácora.
    const ref = doc(collection(db, BITACORA_COLECCION))
    void setDoc(ref, { ...documento, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {
      toast({ title: 'El trabajo no se guardó en el servidor', description: 'Vuelve a intentarlo cuando haya señal.', variant: 'destructive' })
    })
    onGuardado?.()
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={titulo}
      description={subtitulo}
      size="wide"
      actions={
        <Button variant="filled" size="md" onClick={guardar} disabled={guardando} className="w-full">
          Guardar en la Bitácora
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {detencion.comentario && (
          <p className="text-footnote text-muted-foreground">
            Lo que anotó el operador: «{detencion.comentario}»
          </p>
        )}

        <label htmlFor={`${id}-equipo`} className="flex flex-col gap-2">
          <span className="text-footnote font-semibold text-muted-foreground">Máquina o equipo</span>
          <input
            id={`${id}-equipo`}
            value={equipo}
            onChange={(e) => setEquipo(e.target.value)}
            placeholder="Ej. Evisceradora 1"
            className="min-h-[44px] rounded-ctl bg-muted px-3 text-body text-foreground"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-footnote font-semibold text-muted-foreground">¿Qué componente fue?</legend>
          <div className="flex flex-wrap gap-2">
            {sugerencias.slice(0, 5).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={componente === p}
                onClick={() => setComponente(p)}
                className="min-h-[44px] rounded-ctl bg-muted px-3 text-subhead text-foreground aria-[pressed=true]:bg-primary/[0.13] aria-[pressed=true]:font-semibold aria-[pressed=true]:text-primary"
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={componente === OTRO}
              onClick={() => setComponente(OTRO)}
              className="min-h-[44px] rounded-ctl bg-muted px-3 text-subhead text-foreground aria-[pressed=true]:bg-primary/[0.13] aria-[pressed=true]:font-semibold aria-[pressed=true]:text-primary"
            >
              Otro…
            </button>
          </div>
          {componente === OTRO && (
            <input
              aria-label="Otro componente"
              value={componenteOtro}
              onChange={(e) => setComponenteOtro(e.target.value)}
              className="min-h-[44px] rounded-ctl bg-muted px-3 text-body text-foreground"
            />
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="text-footnote font-semibold text-muted-foreground">Repuesto cambiado</span>
          <RepuestosUsados valor={repuestos} onChange={setRepuestos} equipoId={null} fuente={fuenteRepuestosFirestore} />
        </div>

        <label htmlFor={`${id}-nota`} className="flex flex-col gap-2">
          <span className="text-footnote font-semibold text-muted-foreground">Qué se hizo</span>
          <textarea
            id={`${id}-nota`}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            className="rounded-ctl bg-muted px-3 py-2 text-body text-foreground"
          />
        </label>

        <label htmlFor={`${id}-aviso`} className="flex flex-col gap-2">
          <span className="text-footnote font-semibold text-muted-foreground">N° de aviso SAP (opcional)</span>
          <input
            id={`${id}-aviso`}
            inputMode="numeric"
            value={aviso}
            onChange={(e) => setAviso(e.target.value.replace(/\D/g, ''))}
            className="min-h-[44px] rounded-ctl bg-muted px-3 text-body tabular-nums text-foreground"
          />
        </label>

        {error && <p role="alert" className="text-footnote text-destructive">{error}</p>}
        <p className="text-footnote text-muted-foreground">Hora {hhmm(detencion.inicioMs)} · {fechaUTC(detencion.inicioMs)}</p>
      </div>
    </Sheet>
  )
}
