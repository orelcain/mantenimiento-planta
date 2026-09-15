import { Camera } from 'lucide-react'
import { Pill, Tag } from '@/components/piel'
import { ETIQUETA_FOTO, ETIQUETA_TIPO } from '@/config/bitacora'
import { autorVisible, type EventoBitacora, type FotoEvento } from '@/services/bitacora/bitacora.types'
import { minutosParadaDe } from '@/services/bitacora/resumenBitacora'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'

/**
 * Un evento en la línea de tiempo del turno (opción A del mockup, aprobada).
 *
 * La hora de inicio/término va en su propia columna tabular para que la
 * secuencia del turno se lea bajando la vista, sin leer los textos. El impacto
 * (parada o ventana) va en una línea propia porque es el dato que demuestra el
 * aporte de Mantención: no se esconde en el texto libre.
 */
export function EventoBitacoraFila({
  evento,
  onAbrir,
  onVerFoto,
}: {
  evento: EventoBitacora
  onAbrir: () => void
  /** Tocar una miniatura abre la foto en grande (no el editor). */
  onVerFoto?: (fotos: FotoEvento[], indice: number) => void
}) {
  const parada = minutosParadaDe(evento)
  const orden = { antes: 0, despues: 1, foto: 2 } as const
  const fotos = [...(evento.fotos ?? [])].sort((a, b) => orden[a.etiqueta] - orden[b.etiqueta])
  const esAntesDespues = fotos.some((f) => f.etiqueta === 'antes') && fotos.some((f) => f.etiqueta === 'despues')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrir()
        }
      }}
      className={[
        'relative grid min-h-[44px] cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)] gap-3 px-4 py-3',
        'before:absolute before:left-[5rem] before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden',
        'transition-colors duration-150 hover:bg-accent active:bg-accent motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
      ].join(' ')}
    >
      <div className="tabular-nums leading-tight">
        <div className="text-body font-semibold">{evento.horaInicio}</div>
        {/* Sin término = sigue abierto; la columna es angosta, basta el guion. */}
        <div className="text-footnote text-muted-foreground" title={evento.horaTermino ? undefined : 'Sin hora de término'}>{evento.horaTermino ?? '—'}</div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-headline leading-tight">{evento.equipo?.trim() || 'Sin equipo'}</span>
          <Tag>{ETIQUETA_TIPO[evento.tipo]}</Tag>
          {evento.pendiente && <Pill tone="warning">Pendiente</Pill>}
        </div>

        {evento.impacto === 'con-parada' && (
          <span className="text-footnote font-semibold text-ink-crit">Detuvo la máquina {formatoMinutos(parada)}</span>
        )}
        {evento.impacto === 'en-ventana' && (
          <span className="text-footnote font-semibold text-ink-ok">
            Sin detener{evento.ventana?.trim() ? `: ${evento.ventana.trim()}` : ' producción'}
          </span>
        )}

        <p className="line-clamp-3 whitespace-pre-line text-body">{evento.descripcion}</p>

        {fotos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {fotos.slice(0, 4).map((f, i) => (
              <div key={f.path} className="flex items-center gap-2">
                {esAntesDespues && i === 1 && f.etiqueta === 'despues' && (
                  <span className="text-footnote text-muted-foreground" aria-hidden>→</span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onVerFoto) onVerFoto(fotos, i)
                    else onAbrir()
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={`Ver foto ${ETIQUETA_FOTO[f.etiqueta]}`}
                  className="flex flex-col items-start rounded-ctl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <img
                    src={f.url}
                    alt=""
                    loading="lazy"
                    className="size-16 rounded-ctl bg-muted-foreground/10 object-cover"
                  />
                  <span className="pt-0.5 text-caption text-muted-foreground">{ETIQUETA_FOTO[f.etiqueta]}</span>
                </button>
              </div>
            ))}
            {fotos.length > 4 && (
              <span className="inline-flex items-center gap-1 text-footnote text-muted-foreground">
                <Camera className="size-4" aria-hidden />+{fotos.length - 4}
              </span>
            )}
          </div>
        )}

        <span className="text-caption text-muted-foreground">
          {autorVisible(evento)}
          {evento.actualizadoPorNombre && evento.actualizadoPorNombre !== autorVisible(evento)
            ? ` · editado por ${evento.actualizadoPorNombre}`
            : ''}
        </span>
      </div>
    </div>
  )
}
