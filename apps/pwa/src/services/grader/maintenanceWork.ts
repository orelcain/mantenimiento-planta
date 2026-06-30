/**
 * maintenanceWork — "Trabajo de Mantención" del período, contado como CICLO DE MEJORA
 * (TPM), no como conteo de correctivas.
 *
 * Premisa (Orel): resolver correctivas NO es el logro; el logro es que a raíz de la
 * correctiva se haga CAUSA RAÍZ → PREVENCIÓN/PREDICCIÓN → la falla NO vuelve → la
 * producción se afina. Eso demuestra que Mantención es PILAR de la producción (TPM).
 *
 * Por eso las métricas cuentan esa historia:
 *   - Correctivo (lo que apareció): resueltas + MTTR.
 *   - Causa raíz (el puente: entender para que no vuelva): % con causa raíz documentada.
 *   - Prevención (lo que hicimos): preventivas cumplidas vs vencidas + % cumplimiento.
 *   - Madurez TPM: % de trabajo proactivo (preventivo/predictivo/proactivo) y si SUBE.
 *   - ¿No vuelve?: equipos con incidencia recurrente en el período.
 *
 * Función PURA (testeable sin Firestore); recibe arrays ya cargados + el rango.
 */
import type { Incident, PreventiveExecution } from '@/types'

export interface MaintenanceWork {
  // Correctivo (input)
  correctivasResueltas: number
  mttrCorrectivoMin: number | null // mediana de tiempo de resolución, en minutos
  // Causa raíz (el puente a la prevención)
  conCausaRaiz: number
  causaRaizPct: number | null // de las correctivas resueltas
  // Prevención (output)
  preventivasCumplidas: number
  preventivasVencidas: number
  cumplimientoPct: number | null
  // Madurez TPM (mezcla del trabajo)
  totalIncidencias: number
  proactivas: number // tipo preventivo/predictivo/proactivo, creadas en el rango
  correctivas: number // tipo correctivo, creadas en el rango
  proactivoPct: number | null
  /** Tendencia del % proactivo: 1ª mitad vs 2ª mitad del rango. */
  proactivoTrend: 'mejor' | 'igual' | 'peor' | null
  // ¿No vuelve?
  equiposRecurrentes: number // equipos con ≥2 incidencias creadas en el rango
}

const CLOSED = new Set<Incident['status']>(['resuelta', 'cerrada'])
const PROACTIVO = new Set(['preventivo', 'predictivo', 'proactivo'])

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
/** Mediana de un array de números (vacío → null). */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
function asDate(d: Date | string | undefined): Date | null {
  if (!d) return null
  const x = d instanceof Date ? d : new Date(d)
  return isNaN(x.getTime()) ? null : x
}

/**
 * @param incidents  Todas las incidencias disponibles (se filtran por el rango aquí).
 * @param executions Ejecuciones de preventivas (preventiveExecutions).
 * @param vencidasCount  N° de preventivas activas vencidas HOY (de getOverdueTasks()).
 * @param range  { start, end } en 'YYYY-MM-DD' inclusive.
 */
export function computeMaintenanceWork(
  incidents: Incident[],
  executions: PreventiveExecution[],
  vencidasCount: number,
  range: { start: string; end: string },
): MaintenanceWork {
  const inRange = (k: string | null): boolean => !!k && k >= range.start && k <= range.end

  // Incidencias creadas en el rango (para mezcla/recurrencia/madurez)
  const creadas = incidents.filter((i) => inRange(dateKey(asDate(i.createdAt) ?? new Date(0))))
  const correctivas = creadas.filter((i) => i.tipo === 'correctivo').length
  const proactivas = creadas.filter((i) => PROACTIVO.has(i.tipo)).length
  const totalIncidencias = creadas.length
  const proactivoPct = totalIncidencias > 0 ? (proactivas / totalIncidencias) * 100 : null

  // Tendencia del % proactivo: parte el rango por la mitad (por fecha de creación)
  let proactivoTrend: MaintenanceWork['proactivoTrend'] = null
  if (totalIncidencias >= 4) {
    const sorted = [...creadas].sort(
      (a, b) => (asDate(a.createdAt)?.getTime() ?? 0) - (asDate(b.createdAt)?.getTime() ?? 0),
    )
    const mid = Math.floor(sorted.length / 2)
    const pct = (arr: Incident[]): number =>
      arr.length ? arr.filter((i) => PROACTIVO.has(i.tipo)).length / arr.length : 0
    const p1 = pct(sorted.slice(0, mid))
    const p2 = pct(sorted.slice(mid))
    proactivoTrend = p2 > p1 + 0.02 ? 'mejor' : p2 < p1 - 0.02 ? 'peor' : 'igual'
  }

  // Recurrencia: equipos con ≥2 incidencias creadas en el rango
  const porEquipo = new Map<string, number>()
  for (const i of creadas) {
    if (!i.equipmentId) continue
    porEquipo.set(i.equipmentId, (porEquipo.get(i.equipmentId) ?? 0) + 1)
  }
  const equiposRecurrentes = [...porEquipo.values()].filter((n) => n >= 2).length

  // Correctivas RESUELTAS en el rango (por fecha de resolución) + MTTR + causa raíz
  const resueltas = incidents.filter(
    (i) => i.tipo === 'correctivo' && CLOSED.has(i.status) && inRange(dateKey(asDate(i.resolvedAt) ?? new Date(0))),
  )
  const correctivasResueltas = resueltas.length
  const mttrs = resueltas
    .map((i) => {
      if (typeof i.tiempoResolucionMinutos === 'number') return i.tiempoResolucionMinutos
      const c = asDate(i.createdAt)
      const r = asDate(i.resolvedAt)
      return c && r ? (r.getTime() - c.getTime()) / 60000 : null
    })
    .filter((x): x is number => x !== null && isFinite(x) && x >= 0)
  const mttrCorrectivoMin = median(mttrs)
  const conCausaRaiz = resueltas.filter((i) => !!i.causaRaiz && i.causaRaiz.trim().length > 0).length
  const causaRaizPct = correctivasResueltas > 0 ? (conCausaRaiz / correctivasResueltas) * 100 : null

  // Prevención cumplida en el rango vs vencidas hoy
  const preventivasCumplidas = executions.filter((e) => inRange(dateKey(asDate(e.fechaEjecucion) ?? new Date(0)))).length
  const preventivasVencidas = Math.max(0, vencidasCount)
  const denom = preventivasCumplidas + preventivasVencidas
  const cumplimientoPct = denom > 0 ? (preventivasCumplidas / denom) * 100 : null

  return {
    correctivasResueltas,
    mttrCorrectivoMin,
    conCausaRaiz,
    causaRaizPct,
    preventivasCumplidas,
    preventivasVencidas,
    cumplimientoPct,
    totalIncidencias,
    proactivas,
    correctivas,
    proactivoPct,
    proactivoTrend,
    equiposRecurrentes,
  }
}

/** Frase-titular para la diapositiva/PDF: cuenta el ciclo TPM, no el conteo. */
export function maintenanceWorkHeadline(w: MaintenanceWork): string {
  const parts: string[] = []
  if (w.correctivasResueltas > 0) {
    const mttr = w.mttrCorrectivoMin != null ? ` (MTTR ${formatMin(w.mttrCorrectivoMin)})` : ''
    parts.push(`Mantención resolvió ${w.correctivasResueltas} correctiva(s)${mttr}`)
  }
  if (w.causaRaizPct != null) {
    parts.push(`documentó causa raíz en ${Math.round(w.causaRaizPct)}% para que no vuelvan`)
  }
  if (w.preventivasCumplidas > 0 || w.preventivasVencidas > 0) {
    const cmp = w.cumplimientoPct != null ? ` (${Math.round(w.cumplimientoPct)}% cumplimiento)` : ''
    parts.push(`cumplió ${w.preventivasCumplidas} preventiva(s)${cmp}`)
  }
  if (w.proactivoPct != null) {
    const t = w.proactivoTrend === 'mejor' ? ', y el trabajo proactivo va en alza' : ''
    parts.push(`el ${Math.round(w.proactivoPct)}% del trabajo ya es proactivo${t}`)
  }
  if (parts.length === 0) return 'Sin actividad de mantención registrada en el período.'
  return parts.join('; ') + '.'
}

function formatMin(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}min` : `${h}h`
}
