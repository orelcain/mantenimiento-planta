/**
 * BloqueGraderInforme — lo que aporta el grader en el detalle de turno.
 *
 * Mockup aprobado por Orel (20-11-2026): `matrix-diagnostico/mockup-grader/analisis.html`.
 * El bloque está SIEMPRE (salvo líneas sin grader): con datos lleva el color
 * petróleo y la etiqueta «Grader» en cada dato; sin datos deja el hueco
 * «Sin datos del grader este día» con el botón para subir el exporte. Así un día
 * con Excel y uno sin Excel tienen la misma forma.
 */
import { Upload } from 'lucide-react'
import { FilasLectura, LECTURA_CUERPO, LECTURA_NOTA, SeccionLectura } from '@/components/piel/Lectura'
import { DatosGraderHasta } from '@/components/grader/DatosGraderHasta'
import { cn } from '@/lib/utils'
import { intensidadP0, type CeldaP0Hora, type EstadoBloqueGrader } from '@/services/grader/graderEnInforme'
import { dec1 } from '@/utils/formatoNumeros'

/** Etiqueta «Grader»: llena cuando el dato viene del grader, punteada cuando falta. */
export function EtiquetaGrader({ vacia = false }: { vacia?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-caption font-medium shrink-0',
        vacia ? 'border border-dashed border-border text-muted-foreground' : 'bg-grader/[0.12] text-ink-grader',
      )}
    >
      <i aria-hidden className={cn('inline-block h-[7px] w-[7px] rounded-[2px]', vacia ? 'border-[1.5px] border-muted-foreground' : 'bg-grader')} />
      Grader
    </span>
  )
}

export interface DatosBloqueGrader {
  p0Pct: number
  piezas: number
  porHora: CeldaP0Hora[]
  pureza: { ok: number; asignadas: number } | null
  /** «07:15–14:58 · 98 % del turno», o null si no se pudo calcular. */
  cobertura: string | null
}

export function BloqueGraderInforme({ estado, datos, lineId, onSubirExporte }: {
  estado: EstadoBloqueGrader
  datos: DatosBloqueGrader | null
  lineId: string
  onSubirExporte?: () => void
}) {
  if (estado === 'no-aplica') return null
  const con = estado === 'con' && !!datos
  const titulo = (
    <span className="inline-flex items-center gap-2">Clasificación <EtiquetaGrader vacia={!con} /></span>
  )

  if (!con) {
    return (
      <SeccionLectura titulo={titulo} testId="informe-grader">
        <div className="rounded-card border-[1.5px] border-dashed border-border px-4 py-3.5" data-testid="grader-hueco">
          <p className={cn(LECTURA_CUERPO, 'font-semibold')}>
            {estado === 'en-curso' ? 'Sin datos del grader aún en este turno' : 'Sin datos del grader este día'}
          </p>
          <p className={cn(LECTURA_NOTA, 'mt-0.5')}>
            {estado === 'en-curso'
              ? 'Falta exportar el Pieza a pieza de Matrix. Lo de arriba y abajo viene de Shoplogix.'
              : 'Nadie subió el Pieza a pieza de Matrix. El resto del informe usa Shoplogix.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {onSubirExporte && (
              <button
                type="button"
                onClick={onSubirExporte}
                className="inline-flex items-center gap-1.5 min-h-11 lg:min-h-9 rounded-full px-4 bg-primary/[0.12] text-brand-ink text-footnote font-semibold hover:bg-primary/[0.18]"
              >
                <Upload className="w-4 h-4" aria-hidden />
                Subir exporte
              </button>
            )}
            <DatosGraderHasta lineId={lineId} />
          </div>
        </div>
      </SeccionLectura>
    )
  }

  const max = Math.max(0, ...datos.porHora.map((c) => c.pct ?? 0))
  const filas = [
    { rotulo: 'Puerta 0', valor: <span className="font-semibold">{dec1(datos.p0Pct)} %</span> },
    { rotulo: 'Piezas clasificadas', valor: datos.piezas.toLocaleString('es-CL') },
    ...(datos.pureza ? [{ rotulo: 'Compuertas con pureza ≥ 95 %', valor: `${datos.pureza.ok} de ${datos.pureza.asignadas}` }] : []),
    ...(datos.cobertura ? [{ rotulo: 'Datos', valor: datos.cobertura }] : []),
  ]

  return (
    <SeccionLectura titulo={titulo} testId="informe-grader">
      <div className="border-l-[3px] border-grader pl-3">
        <FilasLectura filas={filas} className="[&>div:first-child]:border-t-0" />
        {datos.porHora.length > 0 && (
          <div className="mt-2">
            <p className={cn(LECTURA_NOTA, 'mb-1.5')}>Puerta 0 por hora</p>
            <div className="flex gap-1" role="list" aria-label="Puerta 0 por hora">
              {datos.porHora.map((c) => (
                <div key={c.hora} role="listitem" className="flex-1 min-w-0 text-center">
                  <div
                    className={cn('rounded-[6px] py-1.5 text-caption tabular-nums font-semibold', c.pct == null ? 'bg-muted text-muted-foreground font-normal' : 'text-foreground')}
                    style={c.pct == null ? undefined : { background: `color-mix(in srgb, rgb(var(--serie-grader)) ${intensidadP0(c.pct, max)}%, rgb(var(--card)))` }}
                    title={c.pct == null ? `${c.hora}:00 · sin piezas del grader` : `${c.hora}:00 · ${dec1(c.pct)} % de ${c.piezas.toLocaleString('es-CL')} piezas`}
                  >
                    {c.pct == null ? '—' : dec1(c.pct)}
                  </div>
                  <div className="text-caption text-muted-foreground tabular-nums mt-0.5">{c.hora}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DatosGraderHasta lineId={lineId} className="mt-2" />
      </div>
    </SeccionLectura>
  )
}
