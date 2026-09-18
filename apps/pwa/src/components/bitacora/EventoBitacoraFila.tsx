import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Camera, ImageOff, Menu } from 'lucide-react'
import { Button, Pill, SwipeRow, Tag, type SwipeAction } from '@/components/piel'
import { ETIQUETA_FOTO } from '@/config/bitacora'
import { autorVisible, tecnicosDelEvento, type EventoBitacora, type FotoEvento, type PresenciaBitacora } from '@/services/bitacora/bitacora.types'
import { NOMBRE_DISPOSITIVO } from '@/services/bitacora/presencia'
import { minutosParadaDe } from '@/services/bitacora/resumenBitacora'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'
import { etiquetaCortaTurno } from '@/services/bitacora/entregaTurno'
import { codigoEquipoDe, etiquetaTipo, nombreRepuesto, normalizarRepuestos, tieneHora, tituloDe } from '@/services/bitacora/presentacionEvento'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'

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
  numero,
  enPendientes = false,
  onAbrir,
  onVerFoto,
  abiertoPor = [],
  onMover,
  acciones,
  asa,
  desplazamiento = null,
}: {
  evento: EventoBitacora
  /** El mismo número del evento en WhatsApp, correo y PDF (un borrador no lleva). */
  numero?: number
  /** Va en «Pendiente para el turno siguiente»: la sección ya lo dice, sin la etiqueta. */
  enPendientes?: boolean
  onAbrir: () => void
  /** Tocar una miniatura abre la foto en grande (no el editor). */
  onVerFoto?: (fotos: FotoEvento[], indice: number) => void
  /** Otros equipos que tienen este evento abierto ahora mismo. */
  abiertoPor?: readonly PresenciaBitacora[]
  /** Solo en un evento SIN HORA: moverlo un lugar (teclado en el asa: ↑ = -1, ↓ = +1). */
  onMover?: (direccion: -1 | 1) => void
  /** Acciones al deslizar a la izquierda (Editar, Pendiente, Borrar). */
  acciones?: SwipeAction[]
  /** Solo en un evento SIN HORA: el asa ≡ para arrastrarlo entre los demás. */
  asa?: {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void
  }
  /** Mientras se arrastra: cuánto se desplazó (px). null = quieto. */
  desplazamiento?: number | null
}) {
  const borrador = evento.estado === 'borrador'
  const quienesAbren = abiertoPor.map((p) => `${p.nombre} (${NOMBRE_DISPOSITIVO[p.dispositivo]})`).join(', ')
  const parada = minutosParadaDe(evento)
  const orden = { antes: 0, despues: 1, foto: 2 } as const
  const fotos = [...(evento.fotos ?? [])].sort((a, b) => orden[a.etiqueta] - orden[b.etiqueta])
  const esAntesDespues = fotos.some((f) => f.etiqueta === 'antes') && fotos.some((f) => f.etiqueta === 'despues')
  const conHora = tieneHora(evento)
  // En frase, no en MAYÚSCULAS (mockup «Dos niveles», 18-09-2026): vale para el
  // equipo (viene así de SAP) y para un título que el técnico escribió a gritos.
  const titulo = nombreEquipoLegible(tituloDe(evento))
  const nombreEquipo = nombreEquipoLegible(evento.equipo) || (borrador ? 'Sin equipo todavía' : 'Sin equipo')
  const sinEquipo = borrador && !evento.equipo?.trim()
  const codigo = codigoEquipoDe(evento)
  const repuestos = normalizarRepuestos(evento.repuestos)

  const arrastrando = desplazamiento != null
  const conAsa = !conHora && Boolean(onMover || asa)

  const fila = (
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
        // Fondo propio: al deslizar, las acciones quedan DEBAJO de la fila.
        // En PC la fila va más compacta: la columna del correo necesita el ancho (17-09).
        'relative grid min-h-[44px] cursor-pointer gap-3 bg-card px-4 py-3 md:py-2.5',
        conAsa ? 'grid-cols-[3.25rem_minmax(0,1fr)_auto]' : 'grid-cols-[3.25rem_minmax(0,1fr)]',
        'transition-colors duration-150 hover:bg-accent active:bg-accent motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
      ].join(' ')}
    >
      {/* Columna de secuencia (mockup «Dos niveles», 18-09-2026): el N.° del
          evento en texto chico, la hora de inicio en subhead y el término debajo.
          La hora ya no pesa más que el equipo: ordena, no protagoniza. */}
      <div className="flex flex-col items-start gap-1 pt-0.5">
        {numero != null && (
          <span aria-label={`Evento ${numero}`} className={`text-caption font-semibold tabular-nums ${enPendientes ? 'text-ink-warn' : 'text-muted-foreground'}`}>
            {numero}
          </span>
        )}
        {conHora ? (
          <div className="tabular-nums leading-tight">
            <div className="text-subhead font-semibold">{evento.horaInicio}</div>
            {/* Sin término = sigue abierto; la columna es angosta, basta el guion. */}
            <div className="text-footnote text-muted-foreground" title={evento.horaTermino ? undefined : 'Sin hora de término'}>{evento.horaTermino ?? '—'}</div>
          </div>
        ) : (
          // Registrado con «Sin hora»: la fila va donde se registró.
          <div className="text-footnote italic text-muted-foreground">Sin hora</div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        {/* Nivel 1: el título del evento (o el equipo, si no hay título). */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Un borrador se VE (es cooperación en vivo) pero se distingue al tiro:
              no cuenta en los números ni sale en el correo hasta «Listo». */}
          {borrador && <Pill tone="info" dot={abiertoPor.length ? 'pulse' : undefined}>En redacción</Pill>}
          <span className={`text-headline leading-tight ${!titulo && sinEquipo ? 'text-muted-foreground' : ''}`}>{titulo || nombreEquipo}</span>
          {evento.pendiente && !enPendientes && <Pill tone="warning">Pendiente</Pill>}
        </div>
        {/* Nivel 2: qué es (tipo · equipo · N°). */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground">
          <Tag>{etiquetaTipo(evento)}</Tag>
          {titulo && <span className={sinEquipo ? '' : 'text-foreground'}>{nombreEquipo}</span>}
          {codigo && <span className="tabular-nums">{/^\d+$/.test(codigo) ? `N° ${codigo}` : codigo}</span>}
        </div>
        {/* Nivel 3: qué costó, SIEMPRE en su propia línea (ronda 40, 18-09): en una
            columna angosta el impacto saltaba de línea en unas filas y en otras no,
            y el ojo no sabía dónde buscarlo. Punto + texto, no un renglón rojo. */}
        {(evento.impacto === 'con-parada' || evento.impacto === 'en-ventana' || evento.resuelvePendiente?.turnoId) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground">
          {evento.impacto === 'con-parada' && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink-crit">
              <span className="size-2 rounded-full bg-ink-crit" aria-hidden />
              Detuvo la máquina {formatoMinutos(parada)}
            </span>
          )}
          {evento.impacto === 'en-ventana' && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink-ok">
              <span className="size-2 rounded-full bg-ink-ok" aria-hidden />
              Sin detener{evento.ventana?.trim() ? `: ${evento.ventana.trim()}` : ' producción'}
            </span>
          )}
          {evento.resuelvePendiente?.turnoId && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink-ok">
              <span className="size-2 rounded-full bg-ink-ok" aria-hidden />
              Cierra pendiente del {etiquetaCortaTurno(evento.resuelvePendiente.turnoId)}
            </span>
          )}
        </div>
        )}

        {/* Lo que escribió el técnico, en tinta secundaria: en PC dos líneas (el
            texto entero está en el editor y en el correo); en el teléfono, tres. */}
        {evento.descripcion?.trim() ? (
          <p className="line-clamp-3 whitespace-pre-line text-body text-muted-foreground md:line-clamp-2 md:text-subhead">{evento.descripcion}</p>
        ) : borrador ? (
          <p className="text-body italic text-muted-foreground">Sin descripción todavía</p>
        ) : null}

        {/* En lista, como en WhatsApp, el correo y el PDF (ronda 28, 17-09):
            cantidad, nombre común (o el del maestro) y debajo el código y el
            nombre SAP, que es por el que busca bodega. */}
        {repuestos.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-footnote text-muted-foreground">Repuestos usados</span>
            <ul className="flex flex-col rounded-ctl bg-muted-foreground/10">
              {repuestos.map((r) => {
                const comun = (r.nombreComun ?? '').trim()
                const sap = nombreRepuesto(r)
                return (
                  <li
                    key={r.codigoSAP}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2 px-3 py-2 border-t border-border first:border-t-0"
                  >
                    <span className="text-subhead font-semibold md:text-footnote tabular-nums">×{r.cantidad}</span>
                    <span className="min-w-0">
                      <span className="block text-subhead font-semibold md:text-footnote">{comun || sap || r.codigoSAP}</span>
                      {(comun || sap) && (
                        <span className="block text-footnote text-muted-foreground">
                          <span className="tabular-nums">{r.codigoSAP}</span>
                          {comun && sap ? ` · ${sap}` : ''}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
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
                  {/* Tira de 48 px sin rótulo (ronda 40): el rótulo va en el visor al abrirla. */}
                  <Miniatura url={f.url} />
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
          <span className="text-caption italic text-muted-foreground">
            {tecnicosDelEvento(evento).join(', ')}
            {evento.actualizadoPorNombre && evento.actualizadoPorNombre !== autorVisible(evento)
              ? ` · editado por ${evento.actualizadoPorNombre}`
              : ''}
            {abiertoPor.length ? ` · ${quienesAbren} lo tiene abierto` : ''}
          </span>
        )}
      </div>
      {conAsa && (
        // Asa para arrastrarlo entre los demás (los con hora quedan por reloj).
        // Con teclado: flechas arriba y abajo (mockup iOS 27, 17-09).
        <div className="flex self-center" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Reordenar: arrastra, o usa las flechas arriba y abajo"
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                e.stopPropagation()
                onMover?.(e.key === 'ArrowUp' ? -1 : 1)
              } else e.stopPropagation()
            }}
            onPointerDown={asa?.onPointerDown}
            onPointerMove={asa?.onPointerMove}
            onPointerUp={asa?.onPointerUp}
            onPointerCancel={asa?.onPointerUp}
            className={`-mr-2 flex size-11 touch-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              arrastrando ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <Menu className="size-5" />
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div
      data-evento-id={evento.id}
      className={[
        'relative before:absolute before:left-[5rem] before:right-0 before:top-0 before:z-[1] before:h-px before:bg-border before:content-[""] first:before:hidden',
        arrastrando ? 'z-20 rounded-[18px] shadow-[0_12px_28px_rgba(0,0,0,0.25)] before:hidden' : '',
      ].join(' ')}
      style={arrastrando ? { transform: `translateY(${desplazamiento}px) scale(1.02)` } : undefined}
    >
      {/* Siempre el mismo contenedor: cambiarlo al empezar a arrastrar volvía a
          montar el asa y el dedo perdía el evento. */}
      <SwipeRow trailing={arrastrando ? [] : (acciones ?? [])} className={arrastrando ? 'rounded-[18px]' : undefined}>
        {fila}
      </SwipeRow>
    </div>
  )
}

/**
 * Miniatura de 48 px que sobrevive a la señal de planta.
 *
 * Un `<img>` que falla NO reintenta nunca: con la red de la planta, las fotos
 * de otros técnicos quedaban con el ícono roto para siempre, aunque la misma
 * foto abriera bien en el visor (encontrado el 18-09-2026). Aquí se reintenta
 * dos veces —espaciado, y con un parámetro distinto para saltarse una respuesta
 * fallida guardada en caché— y, si aun así no carga, se muestra un recuadro que
 * dice que se puede abrir igual: el botón que la envuelve abre el visor.
 */
function Miniatura({ url }: { url: string }) {
  const [intento, setIntento] = useState(0)
  const [falló, setFalló] = useState(false)
  useEffect(() => {
    setIntento(0)
    setFalló(false)
  }, [url])
  if (falló) {
    return (
      <span
        className="flex size-12 items-center justify-center rounded-ctl bg-muted-foreground/10 text-muted-foreground"
        title="La miniatura no cargó. Toca para ver la foto."
      >
        <ImageOff className="size-4" aria-hidden />
      </span>
    )
  }
  return (
    <img
      // El reintento cambia la URL para no reusar una respuesta fallida.
      src={intento === 0 ? url : `${url}&r=${intento}`}
      alt=""
      loading="lazy"
      decoding="async"
      className="size-12 rounded-ctl bg-muted-foreground/10 object-cover"
      onError={() => {
        if (intento >= 2) {
          setFalló(true)
          return
        }
        const espera = 400 * (intento + 1)
        setTimeout(() => setIntento((n) => n + 1), espera)
      }}
    />
  )
}
