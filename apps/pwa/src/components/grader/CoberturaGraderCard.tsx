/**
 * Tarjeta «cobertura» del grader (mockup B, pieza `cobertura01`): hasta cuándo hay
 * datos, la barra del turno (con datos en petróleo, tramo faltante rayado, resto
 * por venir), qué tramo falta, por qué falta cuando se puede saber, el % del turno
 * con datos contra la meta y la cadencia de exporte que decide si el hueco es aviso.
 *
 * Solo presenta: toda la cuenta está en `services/grader/graderCobertura.ts`.
 */
import { Info } from 'lucide-react'
import { Pill } from '@/components/piel/Pill'
import { SegmentedControl } from '@/components/piel/SegmentedControl'
import { cn } from '@/lib/utils'
import {
  CADENCIAS,
  CAUSA_TEXTO,
  META_COBERTURA_PCT,
  ddmmHhmm,
  hhmm,
  type CadenciaExporte,
  type CausaFaltante,
  type CoberturaTurno,
} from '@/services/grader/graderCobertura'

const CAUSA_INFO: Record<CausaFaltante, string> = {
  nadie: 'El Pieza a pieza se exporta a mano en Matrix y desde ese momento no llegó ningún archivo a la carpeta.',
  cortado: 'Matrix cortó el exporte en 10.000 filas y la carga automática lo descarta. Desmarca el límite de registros y exporta de nuevo.',
  apagada: 'La carga solo corre con la PWA abierta y sesión admin en el PC de planta, y en este PC falta renovar el permiso de la carpeta.',
  'sin-exporte': 'No llegó un exporte de Matrix que cubra este tramo. La causa solo se puede saber desde el PC de planta.',
}

function textoCadencia(cadencia: CadenciaExporte, c: CoberturaTurno): string {
  const t = CADENCIAS.find((x) => x.id === cadencia)?.texto ?? ''
  if (!c.faltaCola) return `Exporte ${t}.`
  if (c.aviso) return `Exporte ${t}: el exporte ya debía haber llegado, por eso el tramo es aviso.`
  if (cadencia === '2h') return `Exporte ${t}: el siguiente toca a las ${hhmm(c.faltaCola.desde + 2 * 3_600_000)}, el tramo no es aviso todavía.`
  return `Exporte ${t}: llega al cierre, el tramo no es aviso todavía.`
}

export function CoberturaGraderCard({ cobertura: c, datosHasta, causa, cadencia, onCadencia, className }: {
  cobertura: CoberturaTurno
  /** Último `endAt` global de la línea (etapa 0). */
  datosHasta: string | null
  causa: CausaFaltante
  cadencia: CadenciaExporte
  onCadencia: (c: CadenciaExporte) => void
  className?: string
}) {
  const span = c.fin - c.inicio
  const pos = (m: number) => `${(((m - c.inicio) / span) * 100).toFixed(2)}%` // decimal-tecnico: posición CSS
  const ancho = (a: number, b: number) => `${(((b - a) / span) * 100).toFixed(2)}%` // decimal-tecnico: ancho CSS
  const hastaTxt = datosHasta ? ddmmHhmm(datosHasta) : ''
  const cumple = c.pct !== null && c.pct >= META_COBERTURA_PCT
  const etiquetaBarra = [
    ...c.conDatos.map((t) => `con datos ${hhmm(t.desde)} a ${hhmm(t.hasta)}`),
    ...c.faltantes.map((t) => `falta ${hhmm(t.desde)} a ${hhmm(t.hasta)}`),
    c.cerrado ? 'turno cerrado' : 'resto del turno por venir',
  ].join(', ')
  /* La etiqueta del último dato se omite si choca con las de los extremos. */
  const marcaHasta = c.hasta !== null && c.hasta - c.inicio > span * 0.12 && c.ahora - c.hasta > span * 0.12 ? c.hasta : null
  const marcaAhora = !c.cerrado && c.fin - c.ahora > span * 0.12 && c.ahora - c.inicio > span * 0.12 ? c.ahora : null

  return (
    <section className={cn('rounded-card border border-border bg-card p-4', className)} aria-label="Cobertura del grader">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-footnote text-muted-foreground">Datos del grader hasta</p>
          <p className="text-title2 font-semibold tabular-nums">{hastaTxt || 'Sin datos'}</p>
        </div>
        <details className="group relative shrink-0">
          <summary
            aria-label="Qué significa"
            className="tap-44 flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
          >
            <Info className="h-5 w-5" />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-72 max-w-[80vw] rounded-[14px] border border-border bg-card p-3 text-footnote text-muted-foreground shadow-lg">
            No es en vivo: el grader llega por exporte de Matrix.
            {c.pct !== null && ` Con datos ${c.pct} % del turno a la fecha (meta ≥ ${META_COBERTURA_PCT} %).`}
            {c.faltaCola && ` ${CAUSA_INFO[causa]}`} {textoCadencia(cadencia, c)}
          </div>
        </details>
      </div>

      <div className="mt-3">
        <div className="relative h-3.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={etiquetaBarra}>
          {c.conDatos.map((t) => (
            <div key={`d${t.desde}`} className="absolute inset-y-0 bg-grader" style={{ left: pos(t.desde), width: ancho(t.desde, t.hasta) }} />
          ))}
          {c.faltantes.map((t) => (
            <div
              key={`f${t.desde}`}
              className={cn('absolute inset-y-0', c.aviso && t === c.faltaCola ? 'trama-sin-datos-aviso' : 'trama-sin-datos')}
              style={{ left: pos(t.desde), width: ancho(t.desde, t.hasta) }}
            />
          ))}
        </div>
        <div className="relative mt-1 h-4 whitespace-nowrap text-caption text-muted-foreground tabular-nums">
          <span className="absolute left-0">{hhmm(c.inicio)}</span>
          {marcaHasta !== null && (
            <span className="absolute -translate-x-1/2 font-semibold text-foreground" style={{ left: pos(marcaHasta) }}>{hhmm(marcaHasta)}</span>
          )}
          {marcaAhora !== null && (
            <span className="absolute -translate-x-full border-r border-muted-foreground pr-1" style={{ left: pos(marcaAhora) }}>ahora {hhmm(marcaAhora)}</span>
          )}
          <span className="absolute right-0">{hhmm(c.fin)}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {c.faltaCola ? (
          <>
            <Pill tone={c.aviso ? 'warning' : 'neutral'} dot>
              Falta <span className="tabular-nums">{hhmm(c.faltaCola.desde)}–{hhmm(c.faltaCola.hasta)}</span>
            </Pill>
            <span className="text-footnote text-muted-foreground">{CAUSA_TEXTO[causa]}</span>
          </>
        ) : (
          <Pill tone="ok" dot>{c.hasta === null ? 'Turno sin empezar' : 'Al día'}</Pill>
        )}
        {c.pct !== null && (
          <span className="ml-auto text-footnote text-muted-foreground tabular-nums">
            <span className={cn('font-semibold', cumple ? 'text-ink-ok' : 'text-foreground')}>{c.pct} %</span> del turno con datos · meta ≥ {META_COBERTURA_PCT} %
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-footnote text-muted-foreground">Exporte</span>
        <SegmentedControl
          className="max-w-[280px] flex-1"
          ariaLabel="Cadencia de exporte de Matrix"
          value={cadencia}
          onChange={onCadencia}
          segments={CADENCIAS.map((x) => ({ value: x.id, label: x.rotulo }))}
        />
      </div>
    </section>
  )
}
