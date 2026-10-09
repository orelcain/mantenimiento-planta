/**
 * Control de presets del HMI Knuro bajo el EncabezadoHerramienta (marco único, tanda a).
 *
 * El control que la gente cambia más es la MÁQUINA (N1 · N2 · N3): va como SegmentedControl de
 * 48 px, así siempre se ve cuál está cargada. La PLANTA cambia poco: va como selector (pick) de
 * 48 px al lado, solo si hay más de una. Si los nombres no calzan el patrón «Planta X - BAA142 - N1»
 * (ver knuroPresets.ts) cae a un selector con todos los presets agrupados por planta.
 * Reemplaza a KnuroPresetPicker en la página pública; el editor admin sigue con el suyo.
 * No navega ni habla con el iframe: solo llama `onSelect(nombre)`.
 */
import { useMemo, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from '@/components/piel'
import { agruparPorPlanta, modeloPresets, partirPreset, presetAlCambiarPlanta } from './knuroPresets'

interface Props {
  names: string[]
  selected: string | null
  onSelect: (name: string) => void
}

const PICK =
  'h-[48px] w-full appearance-none rounded-full bg-primary/[0.13] pl-4 pr-10 text-subhead font-semibold text-brand-ink ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

function Pick({ ariaLabel, value, onChange, children, className }: {
  ariaLabel: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative shrink-0 ${className ?? ''}`}>
      <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} className={PICK}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-brand-ink" aria-hidden />
    </div>
  )
}

export function ControlPresetsKnuro({ names, selected, onSelect }: Props) {
  const modelo = useMemo(() => modeloPresets(names), [names])
  const grupos = useMemo(() => agruparPorPlanta(names), [names])
  const actual = selected ? partirPreset(selected) : null

  if (!modelo) {
    return (
      <Pick ariaLabel="Preset del simulador" value={selected ?? ''} onChange={v => { if (v && v !== selected) onSelect(v) }} className="w-full">
        {!selected && <option value="">{names.length ? 'Elegir preset' : 'Sin presets'}</option>}
        {grupos.map(g => (
          <optgroup key={g.grupo} label={g.grupo}>
            {g.items.map(it => <option key={it.name} value={it.name}>{it.label}</option>)}
          </optgroup>
        ))}
      </Pick>
    )
  }

  const plantaAct = actual && modelo.mapa[actual.planta] ? actual.planta : modelo.plantas[0]!
  const maqAct = actual && modelo.mapa[actual.planta] ? actual.maquina : ''
  const fila = modelo.mapa[plantaAct] ?? {}

  return (
    <div className="flex items-center gap-2">
      {modelo.plantas.length > 1 && (
        <Pick
          ariaLabel="Planta"
          value={plantaAct}
          onChange={pl => {
            if (pl === plantaAct) return
            const n = presetAlCambiarPlanta(modelo, pl, maqAct || null)
            if (n) onSelect(n)
          }}
        >
          {modelo.plantas.map(pl => <option key={pl} value={pl}>{pl}</option>)}
        </Pick>
      )}
      <SegmentedControl
        tamano="herramienta"
        ariaLabel={`Máquina de la planta ${plantaAct}`}
        value={maqAct}
        onChange={n => { const name = fila[n]; if (name && name !== selected) onSelect(name) }}
        segments={modelo.maquinas.map(n => ({ value: n, label: `N${n}` }))}
        className="min-w-0 flex-1"
      />
    </div>
  )
}
