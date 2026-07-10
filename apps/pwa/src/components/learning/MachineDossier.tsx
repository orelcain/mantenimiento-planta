/**
 * MachineDossier — Piezas presentacionales del encabezado de expediente de maquina.
 * Compartidas entre la pagina generica (MachineLearningPage) y las maquinas con
 * pagina propia (GraderLearningPage), para que todas se vean como el mismo modulo.
 */
import { LC } from '@/data/learningTheme'

export function MachineMetric({
  icon: Icon,
  label,
  enabled,
  color,
  tone,
}: {
  icon: React.ElementType
  label: string
  enabled: boolean
  color: string
  tone: 'blue' | 'green' | 'amber' | 'orange'
}) {
  const toneBg = {
    blue: `${color}12`,
    green: 'rgba(34,197,94,0.10)',
    amber: 'rgba(234,179,8,0.10)',
    orange: 'rgba(249,115,22,0.10)',
  }[tone]
  const toneBorder = {
    blue: `${color}24`,
    green: 'rgba(34,197,94,0.24)',
    amber: 'rgba(234,179,8,0.24)',
    orange: 'rgba(249,115,22,0.24)',
  }[tone]
  return (
    <div
      className="flex items-center gap-2 rounded-full px-3 py-2"
      style={{
        background: enabled ? toneBg : LC.surfaceHi,
        border: `1px solid ${enabled ? toneBorder : LC.border}`,
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: enabled ? color : LC.inkGhost }} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: enabled ? LC.inkMid : LC.inkLo }}>
        {label}
      </span>
    </div>
  )
}

export function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0" style={{ borderColor: LC.border }}>
      <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: LC.inkLo }}>
        {label}
      </span>
      <span className="text-xs font-medium text-right" style={{ color: LC.ink }}>
        {value}
      </span>
    </div>
  )
}
