/**
 * «Línea manual por hora» (mockup v4, versión 5): barra desde 0 con escala fija, «sin lectura» en las horas con hueco
 * del espejo, negativos chicos como «≈ 0», y el horario estimado de la entrada manual (señal débil). Las cuentas viven
 * en `lineaManualDatos.ts`.
 */
import { useMemo } from 'react'
import { Hand } from 'lucide-react'
import { cn } from '@/lib/utils'
import { horaDelEje, milesPunto } from '@/services/grader/espejo/alertasGrader'
import { Tarjeta } from './TarjetaVivo'
import { cuentaDelTurno, manualPz, textoManual } from './cuantoLlevamosDatos'
import { detenciones, seriesEje } from './graficoVivoDatos'
import type { DatosGraderVivo } from './graderVivoDatos'
import { MANUAL_EXCESO_PZ_MIN, MANUAL_TRAMO_MIN, TOPE_MANUAL_PZ, filasManual, horasMin, resumenTramos, textoFila, tramosManual } from './lineaManualDatos'

const IC = 'h-3.5 w-3.5'

export function LineaManual({ d, enCurso, baader5 = false }: { d: DatosGraderVivo; enCurso: boolean; baader5?: boolean }) {
  const hasta = d.serie.hastaMin
  const { filas, tramos, neto } = useMemo(() => {
    const ej = seriesEje(d)
    const det = detenciones(d.paradas, d.retraso.min, hasta)
    return {
      filas: filasManual(d.manual, d.serie.t0Ms, det, hasta, enCurso),
      tramos: tramosManual(ej.grader, ej.baader),
      neto: manualPz(cuentaDelTurno(d.serie, d.baader, d.retraso.min, d.sinLectura)),
    }
  }, [d, hasta, enCurso])
  const r = resumenTramos(tramos)
  return (
    <Tarjeta titulo="Línea manual por hora" sub="Grader menos Baader en cada hora" icono={<Hand className={IC} />}>
      {!d.baader ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin la serie de las Baader no se puede restar.</p>
      ) : filas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Se calcula al cerrar la primera hora completa.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-1.5" data-testid="linea-manual">
            {filas.map((f) => (
              <div key={f.hora} data-hora={f.hora} data-tipo={f.tipo} className="grid grid-cols-[44px_1fr_minmax(92px,auto)] items-center gap-2.5 text-[13px] leading-[18px]">
                <span className="tabular-nums text-foreground/80">{f.hora}</span>
                <span
                  className={cn('relative h-2.5 rounded-full', f.tipo === 'sinLectura' ? 'border border-dashed' : 'bg-muted')}
                  style={f.tipo === 'sinLectura' ? { borderColor: 'var(--v2-gris)' } : undefined}
                  aria-hidden
                >
                  {f.tipo === 'barra' && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${f.pct}%`, background: 'var(--v2-acento)' }} />}
                </span>
                <span className={cn('text-right tabular-nums', f.tipo === 'barra' ? 'font-semibold text-foreground' : 'text-[12px] text-muted-foreground')}>{textoFila(f)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="text-[12px] leading-4 text-muted-foreground">Entrada manual estimada</p>
            <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold leading-4" style={{ background: 'var(--v2-reja)', color: 'var(--v2-atento-texto)' }}>señal débil</span>
          </div>
          <p className="mt-1 text-[17px] font-semibold leading-6 text-foreground tabular-nums" data-testid="manual-tramos">
            {r.n === 0 ? 'Sin tramos' : `${r.n} ${r.n === 1 ? 'tramo' : 'tramos'} · ${horasMin(r.min)} · ≈ ${milesPunto(r.pz)} pz`}
            <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">de {textoManual(neto)} en el turno</span>
          </p>
          <svg viewBox={`0 0 ${Math.max(1, hasta)} 14`} preserveAspectRatio="none" className="mt-1.5 block h-3.5 w-full" aria-hidden>
            <rect x={0} y={4} width={Math.max(1, hasta)} height={6} rx={3} style={{ fill: 'rgb(var(--muted))' }} />
            {tramos.map(([a, b]) => <rect key={a} x={a} y={1} width={Math.max(2, b - a)} height={12} rx={2} style={{ fill: 'var(--v2-acento)' }} />)}
          </svg>
          <div className="mt-1 flex justify-between text-[12px] leading-4 text-muted-foreground tabular-nums">
            <span>{horaDelEje(d.serie.t0Ms, 0)}</span>
            <span>{horaDelEje(d.serie.t0Ms, hasta)}</span>
          </div>
        </>
      )}
      <details className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
        <summary className="cursor-pointer select-none">Escala y ceros</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Grader menos Baader en cada hora cerrada. Escala de 0 a {TOPE_MANUAL_PZ} pz: el máximo de los últimos turnos (18-11 T2, 13:00).</li>
          <li>Negativos con lectura completa: ruido de contar en dos lugares. Van sin barra, como «≈ 0».</li>
          <li>«Sin lectura»: el espejo no leyó la hora entera. «Detenida»: la línea paró 15 min o más en esa hora.</li>
          <li>
            Horario estimado: exceso = grader − Baader corridas {d.retraso.min} min. Un tramo es «entrada manual» si el exceso pasa de {MANUAL_EXCESO_PZ_MIN} pz/min por {MANUAL_TRAMO_MIN} min
            seguidos (ilustrativo). Mide cuándo entran las piezas al grader, no cuándo se trabajaron en la línea manual.
          </li>
          {baader5 && <li>Las Baader vienen cada 5 min (respaldo de Shoplogix): el exceso por minuto sale grueso.</li>}
        </ul>
      </details>
    </Tarjeta>
  )
}
