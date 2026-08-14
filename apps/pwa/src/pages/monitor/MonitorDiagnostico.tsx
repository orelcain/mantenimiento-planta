/**
 * "Dónde se gana en esta línea" — el bloque que le habla a Mantención.
 *
 * El total de un turno es tiempo andando × velocidad, y cuál de los dos manda
 * NO es igual en cada línea: en Filete (una Baader) el tiempo andando casi no
 * varía y la velocidad sí; en Yal (tres) es al revés. Decirlo en la pantalla
 * cambia dónde conviene poner el esfuerzo — micro-detenciones y cadencia en un
 * caso, paradas largas en el otro.
 *
 * ⚠ El bloque solo describe lo que pasó, nunca afirma una causa. Con seis
 * turnos de muestra no hay forma honesta de sostener "las micro-detenciones
 * bajan la producción": lo que se muestra son los dos turnos extremos con sus
 * piezas, que cualquiera puede ir a revisar. La conclusión la saca quien mira.
 */

import { Bloque } from './MonitorShiftParts'
import type { DiagnosticoLinea } from '@/services/shoplogix/monitorDiagnostico'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function DiagnosticoDeLinea({ d }: { d: DiagnosticoLinea | null }) {
  if (!d) return null

  const titulo = d.factor === 'velocidad'
    ? 'Manda la velocidad, no el tiempo andando'
    : d.factor === 'tiempo'
    ? 'Manda el tiempo andando, no la velocidad'
    : 'Velocidad y tiempo andando pesan parecido'

  return (
    <Bloque
      id="diagnostico"
      titulo="Dónde se gana en esta línea"
      defaultAbierto={false}
      extra={<span>{d.factor === 'parejo' ? 'los dos' : d.factor === 'velocidad' ? 'velocidad' : 'tiempo'}</span>}
    >
      <p className={`mt-2 text-[13.5px] font-semibold ${
        d.factor === 'parejo' ? 'text-foreground/90' : 'text-emerald-800 dark:text-emerald-300'
      }`}>
        {titulo}
      </p>

      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        En los últimos <span className="tabular-nums">{d.samples}</span> turnos, la velocidad varió{' '}
        <span className="tabular-nums text-foreground/85">{nf1.format(d.cvVelocidad)}%</span> y el
        tiempo produciendo{' '}
        <span className="tabular-nums text-foreground/85">{nf1.format(d.cvTiempo)}%</span>.
        {d.factor === 'velocidad' && ' El terreno está en la cadencia y en las micro-detenciones.'}
        {d.factor === 'tiempo' && ' El terreno está en las paradas largas.'}
      </p>

      {/* Los hechos, sin sacar la conclusión por el lector. */}
      {d.micro && (
        <div className="mt-2.5 rounded-xl border border-border bg-muted/50 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Micro-detenciones
          </p>
          {d.micro.hoy != null && (
            <p className="mt-0.5 text-[13px]">
              <span className="tabular-nums font-semibold">{fmtInt(d.micro.hoy)}</span> en este turno
            </p>
          )}
          {/* El pareo con las piezas SOLO cuando en estos turnos más
              micro-detenciones fue de la mano de menos producción. Si no,
              enseñarlo induciría a leer que conviene tener más. */}
          {d.micro.relacionInversa ? (
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              El turno con menos tuvo{' '}
              <span className="tabular-nums text-foreground/85">{fmtInt(d.micro.menos.count)}</span> y
              produjo{' '}
              <span className="tabular-nums text-foreground/85">{fmtInt(d.micro.menos.pieces)} pz</span>;
              el que más tuvo{' '}
              <span className="tabular-nums text-foreground/85">{fmtInt(d.micro.mas.count)}</span> y
              produjo{' '}
              <span className="tabular-nums text-foreground/85">{fmtInt(d.micro.mas.pieces)} pz</span>.
            </p>
          ) : (
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              En los últimos turnos fueron entre{' '}
              <span className="tabular-nums text-foreground/85">{fmtInt(d.micro.menos.count)}</span> y{' '}
              <span className="tabular-nums text-foreground/85">{fmtInt(d.micro.mas.count)}</span>.
              En esta muestra no acompañaron al total del turno.
            </p>
          )}
        </div>
      )}
    </Bloque>
  )
}
