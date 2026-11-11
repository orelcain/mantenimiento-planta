/**
 * Aviso «falla que suele volver» (opción 3A del mockup «Falla repetida»,
 * 28-10-2026): una máquina acaba de volver a andar tras un paro de una causa
 * que, en esa planta, vuelve en ≤ 8 h de operación al menos 3 de cada 10 veces.
 *
 * La decisión que habilita: revisar la causa raíz ANTES de dar la reparación
 * por cerrada, que es el único momento en que el técnico todavía está en la
 * máquina. El mockup proponía una hoja con «Anotar causa raíz» / «Soltar sin
 * anotar»; el Monitor es de solo lectura y sin sesión, así que acá va como
 * aviso fijo bajo «Ahora mismo» y sin botones.
 *
 * Los avisos los arma el backend (`avisosFallaRepetida`) en cada refresco y
 * duran 30 min desde que terminó el paro. Como el doc solo se reescribe cuando
 * cambia el turno, la vigencia se vuelve a mirar contra el reloj (`avisosVigentes`).
 * Horas en wall-clock-as-UTC, como todo Shoplogix.
 */

import { Repeat } from 'lucide-react'
import type { FallaRepetidaAviso } from '@/services/shoplogix/publicShiftMonitor.service'

const hhmm = (iso: string) => iso.slice(11, 16)

export function AvisoFallaRepetida({ avisos }: { avisos: FallaRepetidaAviso[] }) {
  if (avisos.length === 0) return null
  return (
    <section className="pantalla-oculta rounded-card bg-muted px-4 py-3" aria-live="polite" data-testid="aviso-falla-repetida">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-warn">
        <Repeat className="h-3 w-3" aria-hidden />
        Falla que suele volver
      </div>
      <ul className="mt-1 space-y-1.5">
        {avisos.map((a) => (
          <li key={`${a.machineId}|${a.finAt}`} className="text-sm text-foreground">
            <b>{a.machineName} · {a.causa}</b>: volvió a andar a las {hhmm(a.finAt)}.{' '}
            <span className="tabular-nums">{a.deCada10} de cada 10 veces</span> esta falla vuelve antes de 8 h de operación
            <span className="text-muted-foreground"> ({a.vuelven} de {a.episodios})</span>.
            {a.esRepeticion ? ' No es la primera vez en este turno.' : ''}
            {' '}Revisar la causa raíz antes de darla por resuelta.
          </li>
        ))}
      </ul>
    </section>
  )
}
