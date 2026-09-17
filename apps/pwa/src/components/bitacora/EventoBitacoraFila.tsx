import { Camera, ChevronDown, ChevronUp } from 'lucide-react'
import { Button, Pill, Tag } from '@/components/piel'
import { ETIQUETA_FOTO } from '@/config/bitacora'
import { autorVisible, tecnicosDelEvento, type EventoBitacora, type FotoEvento, type PresenciaBitacora } from '@/services/bitacora/bitacora.types'
import { NOMBRE_DISPOSITIVO } from '@/services/bitacora/presencia'
import { minutosParadaDe } from '@/services/bitacora/resumenBitacora'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'
import { etiquetaCortaTurno } from '@/services/bitacora/entregaTurno'
import { codigoEquipoDe, etiquetaTipo, nombreRepuesto, normalizarRepuestos, tieneHora, tituloDe } from '@/services/bitacora/presentacionEvento'

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
  abiertoPor = [],
  onMover,
}: {
  evento: EventoBitacora
  onAbrir: () => void
  /** Tocar una miniatura abre la foto en grande (no el editor). */
  onVerFoto?: (fotos: FotoEvento[], indice: number) => void
  /** Otros equipos que tienen este evento abierto ahora mismo. */
  abiertoPor?: readonly PresenciaBitacora[]
  /** Solo en un evento SIN HORA: moverlo un lugar entre los demás (▲ = -1, ▼ = +1). */
  onMover?: (direccion: -1 | 1) => void
}) {
  const borrador = evento.estado === 'borrador'
  const quienesAbren = abiertoPor.map((p) => `${p.nombre} (${NOMBRE_DISPOSITIVO[p.dispositivo]})`).join(', ')
  const parada = minutosParadaDe(evento)
  const orden = { antes: 0, despues: 1, foto: 2 } as const
  const fotos = [...(evento.fotos ?? [])].sort((a, b) => orden[a.etiqueta] - orden[b.etiqueta])
  const esAntesDespues = fotos.some((f) => f.etiqueta === 'antes') && fotos.some((f) => f.etiqueta === 'despues')
  const conHora = tieneHora(evento)
  const titulo = tituloDe(evento)
  const nombreEquipo = evento.equipo?.trim() || (borrador ? 'Sin equipo todavía' : 'Sin equipo')
  const sinEquipo = borrador && !evento.equipo?.trim()
  const codigo = codigoEquipoDe(evento)
  const repuestos = normalizarRepuestos(evento.repuestos)

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
        'relative grid min-h-[44px] cursor-pointer gap-3 px-4 py-3',
        !conHora && onMover ? 'grid-cols-[3.25rem_minmax(0,1fr)_auto]' : 'grid-cols-[3.25rem_minmax(0,1fr)]',
        'before:absolute before:left-[5rem] before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden',
        'transition-colors duration-150 hover:bg-accent active:bg-accent motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
      ].join(' ')}
    >
      {conHora ? (
        <div className="tabular-nums leading-tight">
          <div className="text-body font-semibold">{evento.horaInicio}</div>
          {/* Sin término = sigue abierto; la columna es angosta, basta el guion. */}
          <div className="text-footnote text-muted-foreground" title={evento.horaTermino ? undefined : 'Sin hora de término'}>{evento.horaTermino ?? '—'}</div>
        </div>
      ) : (
        // Registrado con «Sin hora»: la fila va donde se registró.
        <div className="pt-0.5 text-footnote text-muted-foreground">Sin hora</div>
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Un borrador se VE (es cooperación en vivo) pero se distingue al tiro:
              no cuenta en los números ni sale en el correo hasta «Listo». */}
          {borrador && <Pill tone="info" dot={abiertoPor.length ? 'pulse' : undefined}>En redacción</Pill>}
          {/* Con título, el título manda y el equipo pasa a la línea de abajo
              (como remitente y asunto en Mail); sin título, queda como antes. */}
          {titulo ? (
            <span className="text-headline leading-tight">{titulo}</span>
          ) : (
            <>
              <span className={`text-headline leading-tight ${sinEquipo ? 'text-muted-foreground' : ''}`}>{nombreEquipo}</span>
              {codigo && <span className="text-footnote tabular-nums text-muted-foreground">{codigo}</span>}
              <Tag>{etiquetaTipo(evento)}</Tag>
            </>
          )}
          {evento.pendiente && <Pill tone="warning">Pendiente</Pill>}
        </div>
        {titulo && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-footnote ${sinEquipo ? 'text-muted-foreground' : 'text-foreground'}`}>{nombreEquipo}</span>
            {codigo && <span className="text-footnote tabular-nums text-muted-foreground">{codigo}</span>}
            <Tag>{etiquetaTipo(evento)}</Tag>
          </div>
        )}

        {evento.impacto === 'con-parada' && (
          <span className="text-footnote font-semibold text-ink-crit">Detuvo la máquina {formatoMinutos(parada)}</span>
        )}
        {evento.impacto === 'en-ventana' && (
          <span className="text-footnote font-semibold text-ink-ok">
            Sin detener{evento.ventana?.trim() ? `: ${evento.ventana.trim()}` : ' producción'}
          </span>
        )}

        {evento.resuelvePendiente?.turnoId && (
          <span className="text-footnote font-semibold text-ink-ok">Cierra pendiente del {etiquetaCortaTurno(evento.resuelvePendiente.turnoId)}</span>
        )}

        {evento.descripcion?.trim() ? (
          <p className={`line-clamp-3 whitespace-pre-line text-body ${borrador ? 'text-muted-foreground' : ''}`}>{evento.descripcion}</p>
        ) : borrador ? (
          <p className="text-body text-muted-foreground">Sin descripción todavía</p>
        ) : null}

        {/* Como en WhatsApp, correo e Historial: nombre común primero (o el del
            maestro), código después, cantidad siempre (17-09). */}
        {repuestos.length > 0 && (
          <p className="text-footnote text-muted-foreground">
            Repuestos:{' '}
            {repuestos.map((r, i) => {
              const nombre = (r.nombreComun ?? '').trim() || nombreRepuesto(r)
              return (
                <span key={r.codigoSAP}>
                  {i > 0 ? ' · ' : ''}
                  {nombre ? <span className="font-semibold text-foreground">{nombre} </span> : ''}
                  <span className={`tabular-nums ${nombre ? '' : 'font-semibold text-foreground'}`}>{r.codigoSAP}</span>
                  {` ×${r.cantidad}`}
                </span>
              )
            })}
          </p>
        )}

        {/* En el pendiente original (visto en su propio turno): dónde y cómo se cerró. */}
        {evento.cierre && (
          <span className="text-footnote text-muted-foreground">
            {evento.cierre.tipo === 'resuelto'
              ? `Resuelto en ${etiquetaCortaTurno(evento.cierre.turnoId)} · ${evento.cierre.porNombre}`
              : `Ya no aplica (${etiquetaCortaTurno(evento.cierre.turnoId)} · ${evento.cierre.porNombre}): ${evento.cierre.motivo ?? ''}`}
          </span>
        )}

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

        {borrador ? (
          <div className="flex flex-wrap items-center justify-between gap-2 ">
            <span className="text-footnote text-muted-foreground">
              {abiertoPor.length
                ? `${quienesAbren} ${abiertoPor.length === 1 ? 'lo está escribiendo' : 'lo están escribiendo'}`
                : `Borrador de ${autorVisible(evento)} · sin publicar`}
            </span>
            {/* En el PC se ve el botón; en el celular toda la fila abre el borrador. */}
            <Button
              variant="tinted"
              size="sm"
              className="hidden md:inline-flex"
              onClick={(e) => {
                e.stopPropagation()
                onAbrir()
              }}
            >
              Continuar en este equipo
            </Button>
          </div>
        ) : (
          <span className="text-caption text-muted-foreground">
            {tecnicosDelEvento(evento).join(', ')}
            {evento.actualizadoPorNombre && evento.actualizadoPorNombre !== autorVisible(evento)
              ? ` · editado por ${evento.actualizadoPorNombre}`
              : ''}
            {abiertoPor.length ? ` · ${quienesAbren} lo tiene abierto` : ''}
          </span>
        )}
      </div>
      {!conHora && onMover && (
        // Mover entre los demás eventos del turno (los con hora quedan por reloj).
        <div className="flex flex-col self-start" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onMover(-1)}
            aria-label="Mover antes"
            className="flex size-11 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronUp className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            aria-label="Mover después"
            className="flex size-11 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronDown className="size-5" />
          </button>
        </div>
      )}
    </div>
  )
}
