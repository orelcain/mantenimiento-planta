/**
 * Selector de presets del marco «Consola»: dos controles segmentados (Planta y Máquina) con la
 * línea como texto fijo. Si los nombres no calzan el patrón «Planta X - BAA142 - N1» (o hay
 * demasiadas plantas/máquinas) cae a un botón emergente con el menú agrupado por planta.
 * No navega ni habla con el iframe: solo llama `onSelect(nombre)`; cada página decide qué hace
 * (la pública cambia la URL /aprendizaje/hmi-knuro/:presetId; el editor admin carga el preset).
 * Estilos en knuroConsola.css (tiene que vivir dentro de un `.knc`).
 */
import { useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { agruparPorPlanta, frasePreset, modeloPresets, nombreLinea, partirPreset, presetAlCambiarPlanta } from './knuroPresets'
import { useCloseOnOutside } from './hmiKnuroMovil'

interface Props {
  names: string[]
  selected: string | null
  onSelect: (name: string) => void
  /** 'pc': dentro de la cabecera, con rótulos. 'm': fila propia del celular, con la frase debajo. */
  variant: 'pc' | 'm'
}

export function KnuroPresetPicker({ names, selected, onSelect, variant }: Props) {
  const modelo = useMemo(() => modeloPresets(names), [names])
  const actual = selected ? partirPreset(selected) : null
  const m = variant === 'm'

  if (!modelo) return <PresetPopup names={names} selected={selected} onSelect={onSelect} wide={m} />

  const plantaAct = actual && modelo.mapa[actual.planta] ? actual.planta : null
  const maqAct = plantaAct ? actual!.maquina : null
  const filaMaq = plantaAct ? modelo.mapa[plantaAct]! : {}

  const segPlanta = (
    <div className={`knc-seg${m ? ' m' : ''}`} role="group" aria-label="Planta">
      {modelo.plantas.map(pl => (
        <button
          key={pl}
          type="button"
          aria-pressed={pl === plantaAct}
          onClick={() => {
            if (pl === plantaAct) return
            const n = presetAlCambiarPlanta(modelo, pl, maqAct)
            if (n) onSelect(n)
          }}
        >
          {pl}
        </button>
      ))}
    </div>
  )
  const segMaquina = (
    <div className={`knc-seg${m ? ' m' : ''}`} role="group" aria-label={`Máquina ${nombreLinea(modelo.linea)}`}>
      {modelo.maquinas.map(n => {
        const name = filaMaq[n]
        return (
          <button
            key={n}
            type="button"
            aria-pressed={n === maqAct}
            disabled={!name}
            title={name ? undefined : `No hay preset para la máquina N°${n} en esta planta`}
            onClick={() => { if (name && n !== maqAct) onSelect(name) }}
          >
            N°{n}
          </button>
        )
      })}
    </div>
  )

  if (m) {
    return (
      <div className="knc-prow">
        <div className="knc-segs">{segPlanta}{segMaquina}</div>
        <div className="knc-frase" aria-live="polite">{actual ? frasePreset(actual) : 'Elige planta y máquina'}</div>
      </div>
    )
  }
  return (
    <>
      <div className="knc-grp"><span className="knc-lab">Planta</span>{segPlanta}</div>
      <div className="knc-grp"><span className="knc-lab">Línea</span><span className="knc-linea">{nombreLinea(modelo.linea)}</span></div>
      <div className="knc-grp"><span className="knc-lab">Máquina</span>{segMaquina}</div>
    </>
  )
}

/** Respaldo: «pop-up button» del HIG con el preset activo; abre un menú agrupado por planta. */
function PresetPopup({ names, selected, onSelect, wide }: { names: string[]; selected: string | null; onSelect: (n: string) => void; wide: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useCloseOnOutside(ref, open, () => setOpen(false))
  const grupos = useMemo(() => agruparPorPlanta(names), [names])
  const act = selected ? partirPreset(selected) : null
  const label = act ? frasePreset(act) : (selected || 'Elegir preset')

  const body = (
    <div className="knc-popw" ref={ref}>
      <button type="button" className={`knc-ib${wide ? ' m' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} style={wide ? { maxWidth: '100%' } : { maxWidth: 360 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{names.length ? label : 'Sin presets'}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="knc-pop" role="menu">
          {grupos.map(g => (
            <div key={g.grupo} role="group" aria-label={g.grupo}>
              <div className="knc-pop-h">{g.grupo}</div>
              {g.items.map(it => (
                <button
                  key={it.name}
                  type="button"
                  role="menuitemradio"
                  aria-checked={it.name === selected}
                  aria-current={it.name === selected}
                  className="knc-pop-i"
                  onClick={() => { setOpen(false); if (it.name !== selected) onSelect(it.name) }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
  return wide ? <div className="knc-prow">{body}</div> : <div className="knc-grp"><span className="knc-lab">Preset</span>{body}</div>
}
