import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, ClipboardCheck, Clock, LifeBuoy, Loader2, MessageSquarePlus, NotebookPen, Plus, Wrench, X } from 'lucide-react'
import { Button } from '@/components/piel'
import {
  TEXTO_LIBERACION,
  frasePorLiberacion,
  type EstadoLiberacion,
  type Inspeccion,
  type PautaInspeccion,
  type ResultadoCriterio,
  type ResumenInspeccion,
} from '@/services/inspecciones/modeloInspeccion'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/** El orden en que se ofrecen: primero lo que de verdad pasa, la excepción al final. */
const ESTADOS: EstadoLiberacion[] = ['conforme', 'corregida', 'con-pendientes', 'no-liberada']

export interface PanelInspeccionProps {
  pauta: PautaInspeccion
  inspeccion: Inspeccion | null
  desviaciones: EventoBitacora[]
  resumen: ResumenInspeccion
  /** Solo se puede escribir en el turno vigente. */
  editable: boolean
  /** La pauta se editó después de que esta inspección empezó. */
  cambioLaPauta?: boolean
  /** Es un turno de domingo: el aseo semanal termina ahí y la planta se entrega. */
  tocaHoy?: boolean
  trabajando?: boolean
  onIniciar: () => void
  onMarcar: (criterioId: string, resultado: ResultadoCriterio | null) => void
  /**
   * Corrige a mano la hora de un punto; `null` lo deja sin hora. El panel no sabe armar el
   * instante (los turnos cruzan la medianoche): manda `HH:mm` y la página lo ubica en el turno.
   */
  onFijarHora: (criterioId: string, hhmm: string | null) => void
  /** `nota` prellena la descripción del evento: no se reescribe lo ya anotado. */
  onNuevaDesviacion: (criterioId: string, nota?: string) => void
  onAnotar: (criterioId: string, nota: string) => void
  onAbrirEvento: (e: EventoBitacora) => void
  onLiberar: (estado: EstadoLiberacion) => void
  onDeshacerLiberacion: () => void
}

/**
 * La pauta de inspección de planta, en su propia pestaña junto a la bitácora del turno
 * (Orel, 20-09-2026). Las desviaciones NO viven acá: son eventos del turno, y se ven también
 * en la pestaña «Turno» con todo lo demás.
 */
export function PanelInspeccion({
  pauta,
  inspeccion,
  desviaciones,
  resumen,
  editable,
  cambioLaPauta,
  tocaHoy,
  trabajando,
  onIniciar,
  onMarcar,
  onFijarHora,
  onNuevaDesviacion,
  onAnotar,
  onAbrirEvento,
  onLiberar,
  onDeshacerLiberacion,
}: PanelInspeccionProps) {
  const [abierto, setAbierto] = useState<string | null>(null)
  /** Criterio cuya observación se está escribiendo, y el texto en curso. */
  const [anotando, setAnotando] = useState<{ id: string; texto: string } | null>(null)
  /** Criterio al que se le toco «No» y todavia no se dice si quedo resuelto. */
  const [preguntando, setPreguntando] = useState<string | null>(null)
  /** Criterio cuya hora se está corrigiendo a mano, y el `HH:mm` en curso. */
  const [editandoHora, setEditandoHora] = useState<{ id: string; hhmm: string } | null>(null)
  const [eligiendo, setEligiendo] = useState<EstadoLiberacion | null>(null)

  if (!inspeccion) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-5">
        <h2 className="text-headline">{pauta.nombre}</h2>
        <p className="max-w-prose text-footnote text-muted-foreground">
          Se recorre después del aseo semanal, de un fin de semana largo o de una detención prolongada, antes de
          entregarle la planta a Producción. Lo que se encuentre se anota como un evento más de este turno.
        </p>
        {tocaHoy && (
          <p className="flex items-start gap-2 rounded-ctl bg-ink-warn/10 p-2.5 text-footnote leading-snug text-ink-warn [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0">
            <AlertTriangle aria-hidden /> Este turno entrega planta después del aseo semanal.
          </p>
        )}
        {editable ? (
          <Button onClick={onIniciar} disabled={trabajando}>
            {trabajando ? <Loader2 className="animate-spin" /> : <ClipboardCheck />} Empezar la inspección
          </Button>
        ) : (
          <p className="text-footnote text-muted-foreground">En este turno no se hizo.</p>
        )}
      </section>
    )
  }

  const liberada = inspeccion.liberacion
  const puedeLiberar = editable && !liberada && resumen.sugerido != null

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-headline">{pauta.nombre}</h2>
          <span className="rounded-full bg-muted-foreground/12 px-2.5 py-0.5 text-caption font-semibold tabular-nums">
            {resumen.revisados} de {resumen.total}
          </span>
        </div>
        <p className="text-caption text-muted-foreground">
          Desde {horaDe(inspeccion.iniciadaEn)} · {inspeccion.iniciadaPorNombre} · pauta v{inspeccion.pautaVersion}
          {resumen.desviaciones > 0 &&
            ` · ${resumen.desviaciones} ${resumen.desviaciones === 1 ? 'desviación' : 'desviaciones'}`}
          {resumen.pendientes > 0 && ` (${resumen.pendientes} abierta${resumen.pendientes === 1 ? '' : 's'})`}
          {resumen.minutosDeRecorrido != null && ` · recorrido de ${resumen.minutosDeRecorrido} min`}
          {resumen.corregidos > 0 && ` · ${resumen.corregidos} ${resumen.corregidos === 1 ? 'corregido' : 'corregidos'}`}
          {resumen.controlados > 0 && ` · ${resumen.controlados} con contingencia`}
          {resumen.conObservacion > 0 && ` · ${resumen.conObservacion} con observación`}
        </p>
        {resumen.pendientesCriticos > 0 && (
          <p className="flex items-start gap-2 rounded-ctl bg-ink-crit/10 p-2 text-caption leading-snug text-ink-crit [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0">
            <AlertTriangle aria-hidden />
            {resumen.pendientesCriticos === 1
              ? 'Queda 1 desviación abierta que detiene una línea.'
              : `Quedan ${resumen.pendientesCriticos} desviaciones abiertas que detienen una línea.`}
          </p>
        )}
        {cambioLaPauta && (
          <p className="text-caption leading-snug text-muted-foreground">
            La pauta se editó después de que empezaste. Esta inspección sigue con la v{inspeccion.pautaVersion}, como corresponde.
          </p>
        )}
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted-foreground/12" aria-hidden>
          <span className="bg-ink-ok" style={{ width: `${(resumen.conformes / resumen.total) * 100}%` }} />
          <span
            className="bg-ink-warn"
            style={{ width: `${((resumen.corregidos + resumen.controlados) / resumen.total) * 100}%` }}
          />
          <span className="bg-ink-crit" style={{ width: `${(resumen.noConformes / resumen.total) * 100}%` }} />
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {pauta.criterios.map((c) => {
          const r = inspeccion.resultados[c.id]
          const suyas = desviaciones.filter((d) => d.inspeccion?.criterioId === c.id)
          const desplegado = abierto === c.id
          return (
            <li key={c.id} className="rounded-card border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setAbierto(desplegado ? null : c.id)}
                  aria-expanded={desplegado}
                  className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
                >
                  {desplegado ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                  <span className="min-w-0 flex-1 text-subhead font-medium">{c.titulo}</span>
                  {inspeccion.marcas?.[c.id] && (
                    <span className="shrink-0 pr-1 text-caption tabular-nums text-muted-foreground">
                      {horaDe(inspeccion.marcas[c.id] ?? '')}
                    </span>
                  )}
                </button>
                <div className="flex shrink-0 gap-1.5 pt-1">
                  <BotonResultado
                    activo={r === 'conforme'}
                    tono="ok"
                    disabled={!editable || !!liberada}
                    onClick={() => onMarcar(c.id, r === 'conforme' ? null : 'conforme')}
                  >
                    <Check aria-hidden /> Conforme
                  </BotonResultado>
                  <BotonResultado
                    activo={r === 'no-conforme' || r === 'corregido' || r === 'controlado'}
                    tono={r === 'corregido' || r === 'controlado' ? 'medio' : 'mal'}
                    disabled={!editable || !!liberada}
                    onClick={() => {
                      // Saltar derecho al evento obligaba a cancelarlo para poder anotar algo
                      // menor ya resuelto (Orel, 21-09). Primero se pregunta.
                      if (r === 'no-conforme' || r === 'corregido' || r === 'controlado') onMarcar(c.id, null)
                      else {
                        setPreguntando(c.id)
                        setAbierto(c.id)
                      }
                    }}
                  >
                    <X aria-hidden /> {r === 'corregido' ? 'Corregido' : r === 'controlado' ? 'Controlado' : 'No'}
                  </BotonResultado>
                </div>
              </div>

              {desplegado && c.ayuda && (
                <p className="mt-1.5 pl-[22px] text-caption leading-snug text-muted-foreground">{c.ayuda}</p>
              )}

              {preguntando === c.id && (
                <div className="ml-[22px] mt-2 flex flex-col gap-2 rounded-ctl bg-muted-foreground/10 p-3">
                  <p className="text-footnote font-semibold">¿Quedó resuelto antes de entregar la planta?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="tinted"
                      onClick={() => {
                        onMarcar(c.id, 'corregido')
                        setPreguntando(null)
                        setAnotando({ id: c.id, texto: inspeccion.notas?.[c.id] ?? '' })
                      }}
                    >
                      <Wrench /> Sí, lo corregí
                    </Button>
                    {/* §8 pide las desviaciones «corregidas O CONTROLADAS antes de la puesta en
                        marcha». Sin este escalón, una falla que se sobrellevó toda la noche a
                        mano para no detener el proceso quedaba como «No conforme» a secas: la
                        mitad mala de la historia, sin el trabajo que hizo que la planta
                        produjera igual (Orel, 21-09-2026). */}
                    <Button
                      variant="tinted"
                      onClick={() => {
                        onMarcar(c.id, 'controlado')
                        setPreguntando(null)
                        onNuevaDesviacion(c.id)
                      }}
                    >
                      <LifeBuoy /> No, pero está controlado
                    </Button>
                    <Button
                      onClick={() => {
                        onMarcar(c.id, 'no-conforme')
                        setPreguntando(null)
                        onNuevaDesviacion(c.id)
                      }}
                    >
                      <Plus /> No, queda pendiente
                    </Button>
                    <Button variant="plain" onClick={() => setPreguntando(null)}>
                      Cancelar
                    </Button>
                  </div>
                  {/* Las mismas tres frases que la leyenda del correo: quien marca acá y quien
                      lee allá tienen que entender lo mismo por la misma palabra. */}
                  <ul className="flex flex-col gap-0.5 text-caption leading-snug text-muted-foreground">
                    <li>Corregido: se resolvió y queda conforme al entregar.</li>
                    <li>Controlado: sigue abierto y se opera con una medida transitoria.</li>
                    <li>Pendiente: sigue abierto, sin contingencia.</li>
                  </ul>
                </div>
              )}

              {/* El recordatorio del procedimiento, donde de verdad hace falta: es el momento en
                  que hay una máquina andando y la tentación es meter la mano. */}
              {c.id === 'operacional' && r === 'no-conforme' && (
                <p className="ml-[22px] mt-2 rounded-ctl bg-ink-warn/10 p-2 text-caption leading-snug text-ink-warn">
                  No intervengas con el equipo en movimiento. Si hay riesgo, bloquea y etiquetea (LOTO) antes de tocar.
                </p>
              )}

              {/* La hora es OPCIONAL y se puede corregir. Se sellaba sola con el reloj del
                  momento, y una pauta del domingo completada el lunes a las 18:09 quedaba con
                  siete marcas a las 18:09 y un «recorrido de 833 min» que nadie caminó
                  (Orel, 21-09-2026). */}
              {editandoHora?.id === c.id && (
                <div className="ml-[22px] mt-2 flex flex-col gap-2 rounded-ctl bg-muted-foreground/10 p-3">
                  <label className="text-footnote font-semibold" htmlFor={`hora-${c.id}`}>
                    ¿A qué hora se revisó este punto?
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id={`hora-${c.id}`}
                      type="time"
                      value={editandoHora.hhmm}
                      onChange={(ev) => setEditandoHora({ id: c.id, hhmm: ev.target.value })}
                      className="min-h-[44px] rounded-ctl bg-card px-3 text-footnote tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <Button
                      variant="tinted"
                      disabled={!editandoHora.hhmm}
                      onClick={() => {
                        onFijarHora(c.id, editandoHora.hhmm || null)
                        setEditandoHora(null)
                      }}
                    >
                      Guardar la hora
                    </Button>
                    <Button
                      variant="plain"
                      onClick={() => {
                        onFijarHora(c.id, null)
                        setEditandoHora(null)
                      }}
                    >
                      Dejarlo sin hora
                    </Button>
                    <Button variant="plain" onClick={() => setEditandoHora(null)}>
                      Cancelar
                    </Button>
                  </div>
                  <p className="text-caption leading-snug text-muted-foreground">
                    Si no la sabes, déjalo sin hora: el correo no va a inventar una.
                  </p>
                </div>
              )}

              {anotando?.id === c.id ? (
                <div className="ml-[22px] mt-2 flex flex-col gap-2">
                  <textarea
                    autoFocus
                    rows={2}
                    maxLength={300}
                    value={anotando.texto}
                    onChange={(ev) => setAnotando({ id: c.id, texto: ev.target.value })}
                    placeholder="Qué viste, aunque no amerite abrir una desviación"
                    className="w-full rounded-ctl bg-muted-foreground/10 p-2.5 text-footnote outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="tinted"
                      disabled={r === 'corregido' && !anotando.texto.trim()}
                      onClick={() => {
                        onAnotar(c.id, anotando.texto)
                        setAnotando(null)
                      }}
                    >
                      Guardar observación
                    </Button>
                    {/* El piso es la observación; el evento queda a un toque, con el texto ya
                        escrito, para que nadie tenga que redactarlo dos veces. */}
                    {!!anotando.texto.trim() && (
                      <Button
                        variant="plain"
                        onClick={() => {
                          onAnotar(c.id, anotando.texto)
                          onNuevaDesviacion(c.id, anotando.texto)
                          setAnotando(null)
                        }}
                      >
                        <NotebookPen /> Registrarlo en la bitácora
                      </Button>
                    )}
                    <Button variant="plain" onClick={() => setAnotando(null)}>
                      Cancelar
                    </Button>
                  </div>
                  {r === 'corregido' && !anotando.texto.trim() && (
                    <p className="text-caption text-muted-foreground">Escribe qué encontraste y qué hiciste.</p>
                  )}
                </div>
              ) : (
                inspeccion.notas?.[c.id] && (
                  <button
                    type="button"
                    disabled={!editable || !!liberada}
                    onClick={() => setAnotando({ id: c.id, texto: inspeccion.notas?.[c.id] ?? '' })}
                    className="ml-[22px] mt-2 block w-[calc(100%-22px)] rounded-ctl bg-ink-warn/10 p-2 text-left text-caption leading-snug text-ink-warn disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {inspeccion.notas[c.id]}
                  </button>
                )
              )}

              {suyas.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 pl-[22px]">
                  {suyas.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => onAbrirEvento(d)}
                        className="flex min-h-[44px] w-full items-center gap-2 rounded-ctl bg-muted-foreground/10 px-3 text-left hover:bg-muted-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="min-w-0 flex-1 truncate text-footnote">
                          <b className="font-semibold">{d.equipo || 'Sin equipo'}</b>
                          {d.descripcion ? ` · ${d.descripcion}` : ''}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 text-caption font-semibold ${
                            d.pendiente && !d.cierre ? 'bg-ink-warn/15 text-ink-warn' : 'bg-ink-ok/15 text-ink-ok'
                          }`}
                        >
                          {d.pendiente && !d.cierre ? 'pendiente' : 'resuelta'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {editable && !liberada && anotando?.id !== c.id && (
                <div className="ml-[22px] flex flex-wrap items-center gap-x-4">
                  {r === 'no-conforme' && (
                    <button
                      type="button"
                      onClick={() => onNuevaDesviacion(c.id)}
                      className="flex min-h-[44px] items-center gap-1 text-footnote font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4"
                    >
                      <Plus aria-hidden /> Otra desviación acá
                    </button>
                  )}
                  {!!r && editandoHora?.id !== c.id && (
                    <button
                      type="button"
                      onClick={() => setEditandoHora({ id: c.id, hhmm: hhmmDe(inspeccion.marcas?.[c.id]) })}
                      className="flex min-h-[44px] items-center gap-1 text-footnote text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4"
                    >
                      <Clock aria-hidden /> {hhmmDe(inspeccion.marcas?.[c.id]) || 'Sin hora'}
                    </button>
                  )}
                  {/* El escalón que faltaba: ni perderlo ni abrir un evento entero por algo menor. */}
                  {!!r && !inspeccion.notas?.[c.id] && (
                    <button
                      type="button"
                      onClick={() => setAnotando({ id: c.id, texto: '' })}
                      className="flex min-h-[44px] items-center gap-1 text-footnote text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4"
                    >
                      <MessageSquarePlus aria-hidden /> Agregar observación
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* La entrega. No hay portón: la planta arranca igual y lo que importa es dejar dicho cómo. */}
      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <h3 className="text-subhead font-semibold">Liberación de planta</h3>

        {liberada ? (
          <>
            <p className="text-body font-semibold">{TEXTO_LIBERACION[liberada.estado].titulo}</p>
            <p className="text-footnote text-muted-foreground">{frasePorLiberacion(liberada.estado, resumen)}</p>
            <p className="text-caption tabular-nums text-muted-foreground">
              {horaDe(liberada.en)} · {liberada.porNombre} · {resumen.revisados} de {resumen.total} revisados
            </p>
            {editable && (
              <Button variant="plain" onClick={onDeshacerLiberacion} disabled={trabajando}>
                Deshacer la entrega
              </Button>
            )}
          </>
        ) : resumen.sugerido == null ? (
          <p className="flex items-start gap-2 text-footnote text-muted-foreground [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
            <AlertTriangle aria-hidden /> Faltan {resumen.total - resumen.revisados} punto
            {resumen.total - resumen.revisados === 1 ? '' : 's'} por revisar.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {ESTADOS.map((e) => {
                const elegido = (eligiendo ?? resumen.sugerido) === e
                const raro = e === 'no-liberada'
                return (
                  <li key={e}>
                    <button
                      type="button"
                      onClick={() => setEligiendo(e)}
                      aria-pressed={elegido}
                      className={`flex w-full items-start gap-2.5 rounded-ctl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        elegido ? 'border-primary bg-primary/8' : 'border-transparent bg-muted-foreground/8'
                      } ${raro && !elegido ? 'opacity-60' : ''}`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${
                          elegido ? 'border-primary bg-primary' : 'border-muted-foreground/50'
                        }`}
                      />
                      <span className="min-w-0">
                        <b className="block text-footnote font-semibold">{TEXTO_LIBERACION[e].titulo}</b>
                        <span className="block text-caption leading-snug text-muted-foreground">
                          {e === resumen.sugerido ? frasePorLiberacion(e, resumen) : TEXTO_LIBERACION[e].detalle}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <Button
              onClick={() => {
                const e = eligiendo ?? resumen.sugerido
                if (e) onLiberar(e)
              }}
              disabled={!puedeLiberar || trabajando}
            >
              {trabajando ? <Loader2 className="animate-spin" /> : <ClipboardCheck />} Entregar la planta
            </Button>
          </>
        )}
      </section>
    </section>
  )
}

function BotonResultado({
  activo,
  tono,
  disabled,
  onClick,
  children,
}: {
  activo: boolean
  tono: 'ok' | 'medio' | 'mal'
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const encendido =
    tono === 'ok' ? 'bg-ink-ok/15 text-ink-ok' : tono === 'medio' ? 'bg-ink-warn/15 text-ink-warn' : 'bg-ink-crit/15 text-ink-crit'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      className={`flex min-h-[44px] items-center gap-1 rounded-ctl px-2.5 text-caption font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-3.5 ${
        activo ? encendido : 'bg-muted-foreground/10 text-muted-foreground'
      }`}
    >
      {children}
    </button>
  )
}

/** `HH:mm` de un ISO, o cadena vacía si no hay hora. Sin hora no se muestra ninguna. */
function hhmmDe(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** `HH:mm` de un ISO; vacío si no se puede. */
function horaDe(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}
