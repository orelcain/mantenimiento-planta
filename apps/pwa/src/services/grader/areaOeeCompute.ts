/**
 * OEE de ÁREA — combina las máquinas instrumentadas con las etapas que no lo están.
 *
 * Caso que lo motiva: el área Filete tiene UNA máquina en Shoplogix (la Baader
 * 200 de Línea 1) y una GEA sin integración. El OEE de la Baader no describe el
 * área: si la GEA para, el área no produce aunque la Baader marque bien.
 *
 *   A_área = uptime_máquinas / (tiempo rastreado + paros de etapa)
 *   R_área ≈ R_máquina        (la máquina instrumentada es el proxy del cuello)
 *   Q_área = Q del Grader, o NO APLICA donde no hay Grader (Filete)
 *   OEE_área = A × R × Q, y A × R donde no hay Q (se rotula, no se finge un 100%)
 *
 * ⚠ DOBLE CONTEO — la regla que hace defendible el número: los paros de etapa
 * solo SUMAN si no detuvieron a la máquina instrumentada. Si la GEA paró y con
 * eso paró la Baader, esos minutos YA están en el downtime del sensor, y el paro
 * correspondiente se anota como causa de ese paro (panel "Causa de los paros",
 * `paros` con `origen: 'shoplogix'`) en vez de como paro de etapa. Por eso acá se
 * excluyen los `origen: 'shoplogix'`: no son tiempo adicional.
 */

import type { PlantKPIs } from './plantKpiCompute'
import type { ParoEtapa } from '@/types'

export interface AreaLoss {
  label: string
  min: number
  /** De dónde vino el minuto perdido: la máquina o una etapa sin instrumentar. */
  fuente: 'maquina' | 'etapa'
}

export interface AreaOee {
  /** OEE de la máquina instrumentada (lo que ya se mostraba). */
  oeeMachine: number | null
  /** OEE del área, penalizado por los paros de etapa. */
  oeeArea: number | null
  availabilityMachine: number | null
  availabilityArea: number | null
  performance: number | null
  quality: number | null
  /** true cuando el OEE es A×R porque el área no tiene medición de calidad. */
  sinCalidad: boolean
  /** Minutos de paro de etapa (capturados a mano) considerados. */
  etapaMin: number
  /** Base de tiempo: minutos rastreados por el sensor + paros de etapa. */
  baseMin: number
  /** Pareto de pérdidas de tiempo, de mayor a menor. */
  perdidas: AreaLoss[]
  perdidasTotal: number
}

/** Paro de etapa del período, ya filtrado por mes/línea por el caller. */
export type StageStop = Pick<ParoEtapa, 'etapa' | 'duracionMin' | 'origen' | 'causa' | 'categoria' | 'stopKey'>

/**
 * Calcula el OEE de área. Devuelve null si no hay KPIs de máquina: sin la base
 * de tiempo del sensor no se puede afirmar nada del área.
 */
export function computeAreaOee(kpis: PlantKPIs | null, stops: StageStop[]): AreaOee | null {
  if (!kpis) return null

  const uptimeMin   = kpis.machines.reduce((a, m) => a + (m.uptimeMin ?? 0), 0)
  const downtimeMin = kpis.machines.reduce((a, m) => a + (m.downtimeMin ?? 0), 0)
  const setupMin    = kpis.machines.reduce((a, m) => a + (m.setupMin ?? 0), 0)
  const trackedMin  = uptimeMin + downtimeMin + setupMin

  // Paros de etapa que SÍ son tiempo adicional (ver nota de doble conteo arriba).
  const etapaStops = stops.filter((s) => s.origen !== 'shoplogix')
  const etapaMin = etapaStops.reduce((a, s) => a + (s.duracionMin || 0), 0)

  const baseMin = trackedMin + etapaMin
  const availabilityMachine = kpis.availability
  const availabilityArea = baseMin > 0 ? uptimeMin / baseMin : null

  const performance = kpis.performance
  const quality = kpis.quality
  const sinCalidad = quality === null

  const mul = (...xs: (number | null)[]): number | null =>
    xs.every((x) => x !== null) ? (xs as number[]).reduce((a, b) => a * b, 1) : null

  const oeeMachine = sinCalidad
    ? mul(availabilityMachine, performance)
    : mul(availabilityMachine, performance, quality)
  const oeeArea = sinCalidad
    ? mul(availabilityArea, performance)
    : mul(availabilityArea, performance, quality)

  // ── Pareto ────────────────────────────────────────────────────────────────
  // El downtime de la máquina se reparte por la CAUSA anotada (lo que hace útil
  // haber dictado las causas); lo que quede sin anotar se muestra como tal en
  // vez de esconderlo en un balde genérico.
  const anotados = stops.filter((s) => s.origen === 'shoplogix')
  const anotadoMin = anotados.reduce((a, s) => a + (s.duracionMin || 0), 0)
  const porCausa = new Map<string, number>()
  for (const s of anotados) {
    const label = (s.causa || '').trim() || 'Paro anotado sin texto'
    porCausa.set(label, (porCausa.get(label) ?? 0) + (s.duracionMin || 0))
  }

  const porEtapa = new Map<string, number>()
  for (const s of etapaStops) {
    const label = (s.etapa || '').trim() || 'Etapa sin nombre'
    porEtapa.set(label, (porEtapa.get(label) ?? 0) + (s.duracionMin || 0))
  }

  // Nunca negativo: si lo anotado supera el downtime medido (anotaciones de
  // turnos fuera del período, o duraciones redondeadas), se corta en 0 en vez de
  // mostrar un balde absurdo.
  const sinAnotar = Math.max(0, downtimeMin - anotadoMin)

  const perdidas: AreaLoss[] = [
    ...[...porCausa.entries()].map(([label, min]) => ({ label, min, fuente: 'maquina' as const })),
    ...(sinAnotar > 0 ? [{ label: 'Paros sin causa anotada', min: sinAnotar, fuente: 'maquina' as const }] : []),
    ...[...porEtapa.entries()].map(([label, min]) => ({ label, min, fuente: 'etapa' as const })),
  ].sort((a, b) => b.min - a.min)

  return {
    oeeMachine,
    oeeArea,
    availabilityMachine,
    availabilityArea,
    performance,
    quality,
    sinCalidad,
    etapaMin,
    baseMin,
    perdidas,
    perdidasTotal: perdidas.reduce((a, p) => a + p.min, 0),
  }
}
