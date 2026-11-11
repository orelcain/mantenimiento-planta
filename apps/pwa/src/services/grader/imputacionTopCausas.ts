/**
 * Las causas principales de paro del período, para mostrarlas a la vista en
 * `ImputacionPeriodCard`. Módulo aparte del componente para poder testearlo sin
 * exportar funciones desde un .tsx (react-refresh/only-export-components).
 */
import type { PeriodImputacion } from '@/services/grader/graderPeriodMonthlyStats'
import { SIN_CAUSAL } from '@/services/shoplogix/imputacionPareto'
import { LOSS_BUCKET_META, type LossBucket } from '@/services/shoplogix/lossBuckets'

export interface CausaPrincipal {
  label: string
  durationSec: number
  /** Fracción (0-1) del TIEMPO DETENIDO total del período (`totalSec`). */
  frac: number
  bucket?: LossBucket
}

/**
 * Las N causales con más tiempo del reparto que la card ya calcula
 * (`topCategorias`). Se excluye «Sin causal anotada»: no es una causa, es lo que
 * falta por anotar y ya se ve en «sin anotar». La base del % es el tiempo
 * detenido total (`totalSec`), la misma de «de X detenidos» en la card.
 */
export function topCausas(imp: PeriodImputacion, n = 3): CausaPrincipal[] {
  if (imp.totalSec <= 0) return []
  // Los paros programados (colación, aseo, charla) son tiempo acordado, no una
  // causa: en octubre eran el 60 % y tapaban a las que sí hay que atacar.
  // Siguen en el reparto completo del plegable.
  return imp.topCategorias
    .filter((c) => c.label !== SIN_CAUSAL && c.durationSec > 0 && c.bucket !== 'planificado')
    .slice(0, n)
    .map((c) => ({ label: c.label, durationSec: c.durationSec, frac: c.durationSec / imp.totalSec, bucket: c.bucket }))
}

/** «Externo · proceso / abastecimiento», «Mantención · equipos». */
export function etiquetaDueno(b: LossBucket | undefined): string | null {
  const meta = b ? LOSS_BUCKET_META[b as keyof typeof LOSS_BUCKET_META] : undefined
  if (!meta) return null
  return `${meta.label} · ${meta.owner.charAt(0).toLowerCase()}${meta.owner.slice(1)}`
}
