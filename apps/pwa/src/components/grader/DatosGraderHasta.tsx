/**
 * Etapa 0: «Datos del grader hasta DD-MM HH:MM», GLOBAL. Sale del último `endAt`
 * de `graderDailySummaries` de la línea (Firestore), no de la carpeta local de
 * Matrix: se ve igual en el PC de planta que en cualquier otro. El estado de la
 * carga automática de ESTE PC es otra cosa y lo muestra `CargaAutomaticaAviso`.
 */
import { ddmmHhmm } from '@/services/grader/graderCobertura'
import { useDatosGraderHasta } from '@/services/grader/graderDatosHasta'
import { cn } from '@/lib/utils'

export function DatosGraderHasta({ lineId, className }: { lineId: string; className?: string }) {
  const r = useDatosGraderHasta(lineId)
  if (r.estado === 'sin-sesion' || r.estado === 'error') return null
  const texto = r.estado === 'cargando' ? '…' : r.valor ? ddmmHhmm(r.valor) : 'sin datos'
  return (
    <p className={cn('flex items-center gap-2 text-footnote text-muted-foreground', className)}>
      <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-[2px] bg-grader" />
      <span>
        Datos del grader hasta <span className="font-semibold text-foreground tabular-nums">{texto}</span>
      </span>
    </p>
  )
}
