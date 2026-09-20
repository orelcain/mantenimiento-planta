import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, ClipboardCheck, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/piel'
import {
  TEXTO_LIBERACION,
  frasePorLiberacion,
  type EstadoLiberacion,
  type Inspeccion,
  type PautaInspeccion,
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
  trabajando?: boolean
  onIniciar: () => void
  onMarcar: (criterioId: string, resultado: 'conforme' | 'no-conforme' | null) => void
  onNuevaDesviacion: (criterioId: string) => void
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
  trabajando,
  onIniciar,
  onMarcar,
  onNuevaDesviacion,
  onAbrirEvento,
  onLiberar,
  onDeshacerLiberacion,
}: PanelInspeccionProps) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [eligiendo, setEligiendo] = useState<EstadoLiberacion | null>(null)

  if (!inspeccion) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-5">
        <h2 className="text-headline">{pauta.nombre}</h2>
        <p className="max-w-prose text-footnote text-muted-foreground">
          Se recorre después del aseo semanal, de un fin de semana largo o de una detención prolongada, antes de
          entregarle la planta a Producción. Lo que se encuentre se anota como un evento más de este turno.
        </p>
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
        </p>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted-foreground/12" aria-hidden>
          <span className="bg-ink-ok" style={{ width: `${(resumen.conformes / resumen.total) * 100}%` }} />
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
                  <span className="text-subhead font-medium">{c.titulo}</span>
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
                    activo={r === 'no-conforme'}
                    tono="mal"
                    disabled={!editable || !!liberada}
                    onClick={() => {
                      // Marcar «no conforme» y anotar qué se encontró es el mismo gesto.
                      onMarcar(c.id, 'no-conforme')
                      if (r !== 'no-conforme') onNuevaDesviacion(c.id)
                      setAbierto(c.id)
                    }}
                  >
                    <X aria-hidden /> No
                  </BotonResultado>
                </div>
              </div>

              {desplegado && c.ayuda && (
                <p className="mt-1.5 pl-[22px] text-caption leading-snug text-muted-foreground">{c.ayuda}</p>
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

              {r === 'no-conforme' && editable && !liberada && (
                <button
                  type="button"
                  onClick={() => onNuevaDesviacion(c.id)}
                  className="ml-[22px] mt-1.5 flex min-h-[44px] items-center gap-1 text-footnote font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4"
                >
                  <Plus aria-hidden /> Otra desviación acá
                </button>
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
  tono: 'ok' | 'mal'
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const encendido = tono === 'ok' ? 'bg-ink-ok/15 text-ink-ok' : 'bg-ink-crit/15 text-ink-crit'
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

/** `HH:mm` de un ISO; vacío si no se puede. */
function horaDe(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}
