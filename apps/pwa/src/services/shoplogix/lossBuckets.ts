/**
 * lossBuckets — taxonomía de causales de pérdida de tiempo por turno.
 *
 * Clasifica cada estado no-productivo de Shoplogix en un "bucket" con dueño:
 *
 *  - `planificado`: paradas de personas acordadas (colación, ejercicio
 *    compensatorio, cambio de turno). NO cuentan contra la máquina — se
 *    descuentan del denominador para obtener el TECHO real de máquina.
 *  - `externo`: la máquina estaba disponible pero el PROCESO no la alimentó
 *    (falta de materia prima, cuota cumplida). No es culpa de Mantención.
 *  - `mantencion`: paros atribuibles a equipos (averías, ajustes, micro
 *    detenciones, cintas). Lo que Mantención debe reducir.
 *  - `sin-clasificar`: causal desconocida o sin anotar — visible a propósito,
 *    nunca se esconde en otro bucket.
 *  - `fuera-turno`: "Planned Downtime" = relleno post-turno de Shoplogix
 *    capturado por la ventana de consulta. No es tiempo del turno.
 *
 * Las reglas se calcaron de los reasons REALES de julio 2026 (Yal, Firestore):
 * COLACION, CUMPLIMIENTO CUOTA, AJUSTE MANTENIMIENTO, FALTA MMPP, CINTAS,
 * Micro Detencion, EJERCICIO COMPENSATORIO, CAMBIO TURNO, ENERGIA. Shoplogix
 * puede renombrar causales (ya pasó con "Planned Downtime"/"DETENCION
 * PROGRAMADA") — el match es por substring case-insensitive y todo lo que no
 * calce cae en `sin-clasificar` para que se note y se agregue la regla.
 *
 * Con esta clasificación se arma la CASCADA del turno:
 *   turno real → −planificado = techo de máquina → −externo −mantención
 *   −sin-clasificar = uso real (uptime). Piezas máx = techo × cadencia real.
 */

import type { StateAggregate } from '@/services/grader/shoplogixStateAggregates'

export type LossBucket =
  | 'produccion'
  | 'planificado'
  | 'externo'
  | 'mantencion'
  | 'sin-clasificar'
  | 'fuera-turno'

interface BucketRule {
  bucket: Exclude<LossBucket, 'produccion'>
  /** Substrings (lowercase) que deben aparecer en el reason del state. */
  match: string[]
}

/** Reglas por reason — la primera que calce gana. Editable al aparecer causales nuevas. */
const REASON_RULES: BucketRule[] = [
  { bucket: 'fuera-turno',  match: ['planned downtime', 'detencion programada', 'detención programada'] },
  { bucket: 'planificado',  match: ['colacion', 'colación'] },
  { bucket: 'planificado',  match: ['ejercicio compensatorio'] },
  { bucket: 'planificado',  match: ['cambio turno', 'cambio de turno'] },
  { bucket: 'planificado',  match: ['charla', 'reunion', 'reunión'] },
  { bucket: 'planificado',  match: ['aseo', 'limpieza', 'sanitiz'] },
  { bucket: 'externo',      match: ['falta mmpp', 'mmpp', 'materia prima'] },
  { bucket: 'externo',      match: ['cumplimiento cuota', 'cuota'] },
  { bucket: 'externo',      match: ['falta personal'] },
  // ENERGIA = corte de suministro eléctrico (confirmado por Orel 2026-07-22)
  // → pérdida externa, no es frente de Mantención.
  { bucket: 'externo',      match: ['energia', 'energía'] },
  { bucket: 'mantencion',   match: ['ajuste mantenimiento', 'mantencion', 'mantención'] },
  { bucket: 'mantencion',   match: ['cintas', 'cinta'] },
]

/**
 * Clasifica un state (o agregado) en su bucket.
 *
 * Orden de decisión:
 *  1. uptime → produccion.
 *  2. reason calza una regla → ese bucket (aplica a break y downtime por igual:
 *     un "FALTA MMPP" es externo aunque venga como type downtime).
 *  3. "Micro Detencion" sin reason → mantencion (interferencias de equipo).
 *  4. downtime sin causal → sin-clasificar (es exactamente lo que el filtro
 *     "Sin anotar" del calendario persigue — no disfrazarlo de avería).
 *  5. resto (break/setup desconocido) → sin-clasificar.
 */
export function classifyLossState(s: { type: string; name?: string; reason?: string }): LossBucket {
  if (s.type === 'uptime') return 'produccion'
  const reason = (s.reason ?? '').toLowerCase().trim()
  if (reason) {
    for (const rule of REASON_RULES) {
      if (rule.match.some((m) => reason.includes(m))) return rule.bucket
    }
    return 'sin-clasificar'
  }
  if ((s.name ?? '').toLowerCase().includes('micro')) return 'mantencion'
  return 'sin-clasificar'
}

export interface LossCascade {
  /** Segundos produciendo (uptime). */
  produccionSec: number
  /** Paradas planificadas de personas (colación, ejercicio, cambio turno). */
  planificadoSec: number
  /** Máquina disponible pero sin alimentación/necesidad del proceso. */
  externoSec: number
  /** Paros atribuibles a equipos — el frente de Mantención. */
  mantencionSec: number
  /** Causal desconocida o sin anotar. */
  sinClasificarSec: number
  /** Planned Downtime (relleno post-turno) — excluido de todo cálculo. */
  fueraTurnoSec: number
  /** Techo real de máquina = todo el tiempo del turno menos planificado y fuera-turno. */
  techoSec: number
  /** Uso real / techo (0-1). El uptime "honesto" que pedía la cascada. */
  usoReal: number
  /** Detalle por causal, ordenado por impacto. */
  items: Array<{ bucket: LossBucket; name: string; reason: string; durationSec: number; count: number }>
}

/**
 * Arma la cascada desde agregados (doc padre — vista mensual, 0 reads extra)
 * o desde states colapsados (página del turno).
 */
export function cascadeFromAggregates(aggs: StateAggregate[]): LossCascade {
  const sums: Record<LossBucket, number> = {
    'produccion': 0, 'planificado': 0, 'externo': 0,
    'mantencion': 0, 'sin-clasificar': 0, 'fuera-turno': 0,
  }
  const items: LossCascade['items'] = []
  for (const a of aggs) {
    const bucket = classifyLossState(a)
    sums[bucket] += a.durationSec
    if (bucket !== 'produccion' && bucket !== 'fuera-turno' && a.durationSec > 0) {
      items.push({ bucket, name: a.name, reason: a.reason, durationSec: a.durationSec, count: a.count })
    }
  }
  const techoSec =
    sums['produccion'] + sums['externo'] + sums['mantencion'] + sums['sin-clasificar']
  return {
    produccionSec:    sums['produccion'],
    planificadoSec:   sums['planificado'],
    externoSec:       sums['externo'],
    mantencionSec:    sums['mantencion'],
    sinClasificarSec: sums['sin-clasificar'],
    fueraTurnoSec:    sums['fuera-turno'],
    techoSec,
    usoReal: techoSec > 0 ? sums['produccion'] / techoSec : 0,
    items: items.sort((a, b) => b.durationSec - a.durationSec),
  }
}

/**
 * Cascada directamente desde `states[]` crudos (página del turno).
 *
 * OJO: `aggregatesFromStates` EXCLUYE los states uptime (el pareto no los
 * necesita; su total viaja en breakdown) — pasarle esos agregados a
 * `cascadeFromAggregates` da produccionSec=0 y usoReal=0%. Esta variante
 * agrega TODO, incluido uptime.
 */
export function cascadeFromStates(
  states: ReadonlyArray<{ type: string; name?: string; reason?: string; durationSec?: number }> | null | undefined,
): LossCascade {
  const pseudo = (states ?? []).map((s) => ({
    type: s.type as StateAggregate['type'],
    name: s.name ?? '',
    reason: s.reason ?? '',
    color: '',
    durationSec: s.durationSec ?? 0,
    count: 1,
  }))
  return cascadeFromAggregates(pseudo)
}

export const LOSS_BUCKET_META: Record<Exclude<LossBucket, 'produccion' | 'fuera-turno'>, { label: string; owner: string }> = {
  'planificado':    { label: 'Planificado',    owner: 'Personas (acordado)' },
  'externo':        { label: 'Externo',        owner: 'Proceso / abastecimiento' },
  'mantencion':     { label: 'Mantención',     owner: 'Equipos' },
  'sin-clasificar': { label: 'Sin clasificar', owner: 'Pendiente de anotar' },
}
