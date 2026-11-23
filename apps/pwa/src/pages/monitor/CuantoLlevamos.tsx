/**
 * «¿Cuánto llevamos?» (mockup v4 aprobado, opción 3 · barra apilada). Una sola cifra grande (piezas del grader) y una
 * barra que dice de dónde vinieron: Baader · manual · Baader sin leer. Recibe números planos para poder montarse
 * igual en el monitor de Eviscerado.
 */
import { BarChart3 } from 'lucide-react'
import { milesPunto } from '@/services/grader/espejo/alertasGrader'
import { Tarjeta } from './TarjetaVivo'
import { manualPz, textoManual, tramosBarra, type CuentaTurno } from './cuantoLlevamosDatos'

const BAADER = 'color-mix(in srgb, var(--v2-acento) 45%, transparent)'
const MANUAL = 'var(--v2-acento)'

function Muestra({ color, banda }: { color?: string; banda?: boolean }) {
  return banda
    ? <i aria-hidden className="mr-1.5 inline-block h-2.5 w-3.5 rounded-sm border border-dashed align-middle" style={{ background: 'var(--v2-reja)', borderColor: 'var(--v2-gris)' }} />
    : <i aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: color }} />
}

export function CuantoLlevamos({ c, sub }: { c: CuentaTurno; sub: string }) {
  const m = manualPz(c)
  const t = tramosBarra(c)
  const man = textoManual(m)
  const hayBaader = c.baaderLeido !== null
  const etiqueta = hayBaader
    ? `Baader ${milesPunto(c.baaderLeido!)}, manual ${man}${c.baaderSinLeer > 0 ? `, sin leer ${milesPunto(c.baaderSinLeer)}` : ''}`
    : 'Sin serie de las Baader'
  return (
    <Tarjeta titulo="¿Cuánto llevamos?" sub={sub} icono={<BarChart3 className="h-3.5 w-3.5" />}>
      <div className="mt-3.5 flex flex-wrap items-baseline gap-x-4 gap-y-1" data-testid="cuanto-llevamos">
        <p className="text-[28px] font-semibold leading-[32px] tracking-tight tabular-nums">
          {milesPunto(c.grader)} <small className="text-[17px] font-medium text-muted-foreground">pz</small>
        </p>
        <p className="ml-auto text-[20px] font-semibold leading-[32px] tracking-tight tabular-nums">
          {milesPunto(Math.round(c.kg))} <small className="text-[17px] font-medium text-muted-foreground">kg</small>
        </p>
      </div>
      {hayBaader ? (
        <>
          <div role="img" aria-label={etiqueta} className="mt-3 flex h-[18px] gap-0.5 overflow-hidden rounded-full" style={{ background: 'rgb(var(--muted))' }}>
            <span className="block h-full" style={{ width: `${t.baader}%`, background: BAADER }} />
            {t.manual > 0 && <span className="block h-full" style={{ width: `${Math.max(1, t.manual)}%`, background: MANUAL }} />}
            {t.sinLeer > 0 && (
              <span className="block h-full rounded-r-full border border-dashed" style={{ width: `${t.sinLeer}%`, background: 'var(--v2-reja)', borderColor: 'var(--v2-gris)' }} />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-muted-foreground tabular-nums">
            <span><Muestra color={BAADER} />Baader {milesPunto(c.baaderLeido!)}</span>
            <span><Muestra color={MANUAL} />Manual {man}</span>
            {c.baaderSinLeer > 0 && <span><Muestra banda />Sin leer {milesPunto(c.baaderSinLeer)}</span>}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[12px] leading-4 text-muted-foreground">Sin serie de las Baader: no se puede separar la línea manual.</p>
      )}
    </Tarjeta>
  )
}
