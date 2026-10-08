/**
 * Selector «N2 | N3» de la máquina en que está parado el técnico (planos que sirven a varias).
 * Cápsula segmentada de la piel, sin contadores. Sin máquina elegida ningún segmento queda marcado.
 */
import { SegmentedControl } from '@/components/piel'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { etiquetaMaquina } from '@/utils/aprendizaje/vinculoTerreno'

export function SelectorMaquinaPlano({
  maquina,
  maquinas,
  onChange,
  className,
}: {
  maquina: MaquinaBaader | null
  maquinas: readonly MaquinaBaader[]
  onChange: (m: MaquinaBaader) => void
  className?: string
}) {
  return (
    <SegmentedControl<MaquinaBaader | ''>
      ariaLabel="Máquina"
      value={maquina ?? ''}
      onChange={v => v && onChange(v)}
      segments={maquinas.map(m => ({ value: m, label: etiquetaMaquina(m) }))}
      className={className}
    />
  )
}
