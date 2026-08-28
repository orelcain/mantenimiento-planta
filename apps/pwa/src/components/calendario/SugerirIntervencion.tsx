import { useMemo, useState } from 'react'
import { Check, Wand2 } from 'lucide-react'
import { ListGroup, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import { aplicarSugerencia, sugerirHuecos, type Sugerencia } from '@/services/sugerirHueco'
import {
  DIAS_CORTOS,
  slotAHora,
  slotsAHorasMinutos,
  type Condicion,
  type MaquinaRueda,
} from '@/services/ruedaVentanas'

/**
 * «Tengo que hacer esto y dura tanto: ¿cuándo lo meto?»
 *
 * Busca el hueco contra el horario de la máquina y contra lo que YA está puesto
 * en ella. Propone tres y elige la persona: un sugeridor que aplica solo su
 * respuesta obliga a deshacerla cuando se equivoca, y aquí se equivoca seguro —
 * no sabe que el eléctrico solo viene los martes.
 */

const TEXTO_CONDICION: Record<Condicion, string> = {
  limpia: 'máquina libre',
  colacion: 'línea parada',
  marcha: 'máquina corriendo',
  agua: 'con agua encima',
}

const TONO_CONDICION: Record<Condicion, 'ok' | 'warning' | 'critical' | 'neutral'> = {
  limpia: 'ok',
  colacion: 'neutral',
  marcha: 'warning',
  agua: 'critical',
}

export interface SugerirIntervencionProps {
  maquina: MaquinaRueda
  onAplicar: (m: MaquinaRueda, s: Sugerencia) => void
}

export function SugerirIntervencion({ maquina, onAplicar }: SugerirIntervencionProps) {
  const [trabajo, setTrabajo] = useState('')
  const [minutos, setMinutos] = useState(60)
  const [requiereDetencion, setRequiereDetencion] = useState(true)
  const [puesto, setPuesto] = useState<string | null>(null)

  const sugerencias = useMemo(
    () => sugerirHuecos(maquina, { minutos, requiereDetencion }, 3),
    [maquina, minutos, requiereDetencion],
  )

  const poner = (s: Sugerencia) => {
    onAplicar(aplicarSugerencia(maquina, s), s)
    setPuesto(`${DIAS_CORTOS[s.dia]} ${slotAHora(s.inicio)}`)
    setTimeout(() => setPuesto(null), 4000)
  }

  const campo = 'h-11 rounded-ctl border border-border bg-background px-2.5 text-body text-foreground'

  return (
    <ListGroup
      title="Sugerir cuándo intervenir"
      footer="Busca el hueco en el horario de esta máquina y esquiva lo que ya está puesto. Nunca propone sobre higiene."
    >
      <div className="flex flex-col gap-3 p-4">
        {puesto && (
          <p role="status" className="flex items-center gap-1.5 rounded-ctl bg-cat-2-tint/15 px-3 py-2 text-footnote text-cat-2-ink">
            <Check className="h-3.5 w-3.5 shrink-0" />
            Puesto el {puesto}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-caption text-muted-foreground">
            Trabajo (opcional)
            <input
              value={trabajo}
              onChange={(e) => setTrabajo(e.target.value)}
              placeholder="Cambio de rodamiento…"
              className={cn(campo, 'w-full')}
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-caption text-muted-foreground">
            Minutos
            <input
              type="number"
              min={5}
              step={5}
              value={minutos}
              onChange={(e) => setMinutos(Math.max(5, Number(e.target.value) || 5))}
              className={cn(campo, 'w-full')}
            />
          </label>
        </div>

        <button
          onClick={() => setRequiereDetencion((v) => !v)}
          aria-pressed={requiereDetencion}
          className={cn(
            'flex min-h-[44px] items-center gap-2 self-start rounded-ctl px-3 text-footnote font-medium',
            requiereDetencion ? 'bg-cat-4-tint/20 text-cat-4-ink' : 'bg-muted text-muted-foreground',
          )}
        >
          {requiereDetencion ? 'Necesita la máquina detenida' : 'Se puede con la máquina corriendo'}
        </button>

        {sugerencias.length === 0 ? (
          <p className="rounded-ctl bg-muted/40 px-3 py-2.5 text-footnote text-muted-foreground">
            No hay ningún hueco de {slotsAHorasMinutos(Math.ceil(minutos / 5))} en la semana de{' '}
            {maquina.nombre} con esas condiciones. Prueba con menos tiempo, permitiendo la máquina
            en marcha, o mueve algo de lo ya puesto.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sugerencias.map((s, i) => (
              <li
                key={`${s.dia}-${s.inicio}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ctl bg-muted/40 px-3 py-2.5"
              >
                <span className="font-mono text-body font-semibold tabular-nums text-foreground">
                  {DIAS_CORTOS[s.dia]} {slotAHora(s.inicio)}–{slotAHora(s.inicio + s.largo)}
                </span>
                <Pill tone={TONO_CONDICION[s.condicion]}>{TEXTO_CONDICION[s.condicion]}</Pill>
                {s.holguraMin > 0 && (
                  <span className="text-caption text-muted-foreground">
                    {slotsAHorasMinutos(s.holguraMin / 5)} de aire alrededor
                  </span>
                )}
                <button
                  onClick={() => poner(s)}
                  className={cn(
                    'ml-auto flex min-h-[44px] items-center gap-1.5 rounded-ctl px-3.5 text-footnote font-medium',
                    i === 0
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-muted-foreground',
                  )}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Poner aquí
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ListGroup>
  )
}
