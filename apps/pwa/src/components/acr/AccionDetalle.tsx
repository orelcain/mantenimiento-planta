/**
 * Detalle de una acción en la hoja del ACR: qué causa ataca, quién la hace y hasta cuándo.
 * Ninguno de los tres campos es obligatorio para cerrar. Los técnicos vienen de la lista que
 * usa la Bitácora: planilla del calendario más ajustes hechos a mano.
 */
import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { ListGroup } from '@/components/piel'
import { useTecnicosDeTurno } from '@/hooks/useBitacoraTurno'
import { useAjustesTecnicos } from '@/hooks/useListasBitacora'
import { construirListaTecnicos } from '@/services/bitacora/listaTecnicos'
import { turnoMantencionEn } from '@/services/bitacora/turnoMantencion'
import { ETIQUETA_NIVEL, type AccionAcr, type CausaAcr } from '@/services/acr/acr.types'

const OTRO = '__otro__'
const SIN_ASIGNAR = ''

export interface AccionDetalleProps {
  accion: AccionAcr
  causas: CausaAcr[]
  /** Nombres de técnicos para el selector de responsable. */
  tecnicos: string[]
  onCausa: (causaId: string) => void
  onResponsable: (nombre: string) => void
  onFecha: (fecha: string | null) => void
}

/** DD-MM-AAAA a partir de YYYY-MM-DD. */
const ddmmaaaa = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

export function AccionDetalle({ accion, causas, tecnicos, onCausa, onResponsable, onFecha }: AccionDetalleProps) {
  // Con un nombre que no está en la lista se abre el campo libre desde el principio.
  const [otro, setOtro] = useState(() => accion.responsable !== SIN_ASIGNAR && !tecnicos.includes(accion.responsable))
  const opciones = useMemo(
    () => [...new Set([...tecnicos, ...(accion.responsable && !tecnicos.includes(accion.responsable) ? [accion.responsable] : [])])],
    [tecnicos, accion.responsable],
  )
  const valorSelect = otro ? OTRO : accion.responsable

  return (
    <div className="flex flex-col gap-5">
      {causas.length > 0 && (
        <ListGroup title="Ataca esta causa">
          <div role="radiogroup" aria-label="Causa que ataca" className="flex flex-col">
            {causas.map((c) => {
              const elegida = accion.causaId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={elegida}
                  onClick={() => onCausa(c.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body text-foreground">{c.texto}</span>
                    <span className="text-footnote text-muted-foreground">{ETIQUETA_NIVEL[c.nivel]}</span>
                  </span>
                  {elegida && <Check className="size-5 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </ListGroup>
      )}

      <ListGroup title="Quién y para cuándo">
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
          <span className="text-body text-foreground">Responsable</span>
          <select
            aria-label="Responsable"
            value={valorSelect}
            onChange={(e) => {
              if (e.target.value === OTRO) {
                setOtro(true)
                return
              }
              setOtro(false)
              onResponsable(e.target.value)
            }}
            className="min-h-11 max-w-[60%] bg-transparent text-right text-body text-primary focus-visible:outline-none"
          >
            <option value={SIN_ASIGNAR}>Sin asignar</option>
            {opciones.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={OTRO}>Otro nombre</option>
          </select>
        </div>
        {otro && (
          <div className="px-4 pb-3">
            <input
              type="text"
              aria-label="Otro nombre"
              value={accion.responsable}
              onChange={(e) => onResponsable(e.target.value)}
              className="min-h-11 w-full rounded-card bg-muted-foreground/10 px-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        )}
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
          <span className="text-body text-foreground">Fecha límite</span>
          <span className="relative flex min-h-11 items-center">
            <span className="text-body tabular-nums text-primary">
              {accion.fechaLimite ? ddmmaaaa(accion.fechaLimite) : 'Sin fecha'}
            </span>
            <input
              type="date"
              aria-label="Fecha límite"
              value={accion.fechaLimite ?? ''}
              onChange={(e) => onFecha(e.target.value || null)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
        </div>
      </ListGroup>
    </div>
  )
}

/** Igual que `AccionDetalle`, con la lista de técnicos de la Bitácora (una lectura al abrirse). */
export function AccionDetalleConLista(props: Omit<AccionDetalleProps, 'tecnicos'>) {
  const { ajustes } = useAjustesTecnicos()
  // `todos` es la planilla completa: no depende del turno, pero el hook pide uno.
  const turno = useMemo(() => turnoMantencionEn(), [])
  const { todos } = useTecnicosDeTurno(turno)
  const tecnicos = useMemo(
    () => construirListaTecnicos(todos, ajustes).map((t) => t.nombre),
    [todos, ajustes],
  )
  return <AccionDetalle {...props} tecnicos={tecnicos} />
}
