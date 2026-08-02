/**
 * actionPlanSuggestions.ts — Función pura `deriveSuggestions` y tipos.
 *
 * Extraída de `ActionPlanPanel.tsx` para satisfacer
 * `react-refresh/only-export-components` (un componente debe ser el único
 * export del archivo) y para que pueda testearse / reusarse sin el coste
 * del componente React.
 *
 * Ver principios UI/UX en CLAUDE.md sección "Reglas de desarrollo".
 */

import type { MatrixP0Cause } from '@/services/grader/types'
import type { MachineImpact } from '@/services/shoplogix/shoplogixCorrelation'
import { shortMachineName } from './graderMachineNames'

// ── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Acción directa que se puede ejecutar desde el panel sin salir de la página.
 * - 'belt-rpm': abre el modal de ajuste de velocidades Danfoss
 * - 'gate-change': abre el modal de cambio de gate
 * - 'global-config': navega a la configuración global (Línea física)
 * - 'wizard-gates': navega al wizard de gates
 */
export type ActionTrigger = 'belt-rpm' | 'gate-change' | 'global-config' | 'wizard-gates'

export interface SuggestedAction {
  id: string
  category: 'terreno' | 'oficina' | 'verificar'
  title: string
  description: string
  severity: 'critical' | 'warning' | 'recommended'
  estimatedImpact?: { metric: 'P0%' | 'throughput'; deltaPct: number }
  /** Si está presente, el card muestra un botón "Ejecutar" que dispara la acción en la PWA */
  actionTrigger?: ActionTrigger
  /** Etiqueta personalizada para el botón de acción (default: "Ejecutar") */
  actionLabel?: string
}

/**
 * Contexto extra para enriquecer las sugerencias con señales que YA detectó
 * el sistema (correlación upstream, pendiente del scatter Baader↔P0%).
 */
export interface SuggestionContext {
  /** Top máquina(s) con mayor overlap en paros del Grader (de byMachine summary). */
  upstreamByMachine?: MachineImpact[]
  /** Tiempo total (seg) de paro del Grader correlacionado upstream causal. */
  upstreamCausedDurSec?: number
  /**
   * Pendiente del scatter ritmo Baader vs P0% Grader, ya convertido a magnitud
   * operacional ("+N pts P0% por -10 ciclos/5min"). Solo cuando hay datos
   * suficientes y la dirección es 'neg' (más Baader → menos P0%).
   */
  scatterSlope?: {
    deltaP0_per_minus10cycles: number
    direction: 'neg' | 'pos' | 'flat'
  } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Helper local para formatear duraciones de manera amigable. */
function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`
}

// ── Función principal ────────────────────────────────────────────────────────

export function deriveSuggestions(
  p0Pct: number,
  dominantCause: MatrixP0Cause | null,
  context: SuggestionContext = {},
): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  if (p0Pct >= 4) {
    actions.push({
      id: 'p0-critical-general',
      category: 'verificar',
      title: 'P0 crítico — revisar con supervisor',
      description: `Rechazo ${p0Pct.toFixed(1)}% supera umbral crítico (4%). Escalar para decisión de detención o ajuste urgente.`,
      severity: 'critical',
    })
  }

  if (dominantCause === 'fuera_de_limites') {
    actions.push(
      {
        id: 'fl-calibration-terreno',
        category: 'terreno',
        title: 'Verificar calibración de pesos en gate 0',
        description: 'Causa dominante: Fuera de límites. Verificar que el peso patrón (5 kg) esté dentro de ±5 g. Limpiar bandeja de tara si hay residuos.',
        severity: p0Pct >= 4 ? 'critical' : 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -1.5 },
      },
      {
        id: 'fl-config-limits-oficina',
        category: 'oficina',
        title: 'Revisar límites de calibre configurados',
        description: 'Verificar que los límites inferiores/superiores de calibre en la configuración física coincidan con la especie procesada actualmente.',
        severity: 'warning',
        actionTrigger: 'global-config',
        actionLabel: 'Abrir config',
      },
      {
        id: 'fl-verify-species',
        category: 'verificar',
        title: 'Confirmar especie y talla objetivo',
        description: 'Confirmar con planta que la especie y talla objetivo sean las mismas que las configuradas en Matrix.',
        severity: 'recommended',
      },
    )
  }

  if (dominantCause === 'no_leido_fotocelula') {
    actions.push(
      {
        id: 'nf-sensor-terreno',
        category: 'terreno',
        title: 'Limpiar fotocélula de entrada',
        description: 'Causa dominante: No leído por fotocélula. Limpiar lente del sensor con paño seco. Verificar que no haya peces demasiado juntos bloqueando la lectura (gap < 10 cm).',
        severity: p0Pct >= 3 ? 'critical' : 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -1.0 },
      },
      {
        id: 'nf-speed-oficina',
        category: 'oficina',
        title: 'Reducir velocidad de cinta si gap es insuficiente',
        description: 'Si el throughput permite, reducir la velocidad de alimentación para aumentar el gap entre peces y evitar lecturas perdidas.',
        severity: 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -0.8 },
        actionTrigger: 'belt-rpm',
        actionLabel: 'Ajustar RPM',
      },
      {
        id: 'nf-sensor-verify',
        category: 'verificar',
        title: 'Verificar sincronía eye-sync',
        description: 'Confirmar que el parámetro eye-sync en Matrix esté habilitado y calibrado para la cinta actual.',
        severity: 'recommended',
      },
    )
  }

  if (dominantCause === 'puerta_no_preparada') {
    actions.push(
      {
        id: 'pnp-timing-terreno',
        category: 'terreno',
        title: 'Verificar mecanismo de puertas',
        description: 'Causa dominante: Puerta no preparada. Inspeccionar que las puertas de desvío no tengan resistencia mecánica o desalineación.',
        severity: 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -0.6 },
      },
      {
        id: 'pnp-timing-oficina',
        category: 'oficina',
        title: 'Ajustar timing de apertura de puertas',
        description: 'En la configuración física, revisar el parámetro de anticipación de apertura (ms) en las gates con mayor incidencia.',
        severity: 'warning',
        actionTrigger: 'global-config',
        actionLabel: 'Abrir config',
      },
    )
  }

  if (p0Pct >= 2 && p0Pct < 4 && actions.filter(a => a.category === 'verificar').length === 0) {
    actions.push({
      id: 'general-verify',
      category: 'verificar',
      title: 'Monitorear evolución en próximos 30 min',
      description: `P0 en ${p0Pct.toFixed(1)}% (zona warning). Verificar si la tendencia es ascendente antes de intervenir.`,
      severity: 'recommended',
    })
  }

  // ── Contexto upstream: derivar acciones de las señales Shoplogix ──────────
  //
  // El sistema YA sabe qué Evisceradoras causaron paros del Grader (vía
  // `summarizeCorrelations.byMachine`) y la magnitud de la correlación
  // ritmo Baader→P0% (vía `scatterSlopeMagnitude`). Convertimos eso en
  // acciones concretas — la información existía, solo no estaba conectada.

  // 1) Máquina top con overlap significativo (>= 5 min causados) → atender
  const topMachine = context.upstreamByMachine?.[0]
  if (topMachine && topMachine.totalOverlapSec >= 300) {
    // Denominador = suma de los solapes POR MÁQUINA, no la unión del tiempo
    // muerto. Con la unión, dos Baader paradas a la vez cubren el mismo paro
    // del Grader y una sola podía dar 114% — un porcentaje imposible que le
    // quitaba credibilidad al panel entero.
    const sumaSolapes = (context.upstreamByMachine ?? []).reduce((a, m) => a + m.totalOverlapSec, 0)
    const sharePct = sumaSolapes > 0 ? (topMachine.totalOverlapSec / sumaSolapes) * 100 : 0
    actions.push({
      id: `upstream-attend-${topMachine.machineid}`,
      category: 'terreno',
      title: `Atender ${shortMachineName(topMachine.machineName)} (mantención prioritaria)`,
      description: `Esta máquina causó ${fmtDur(topMachine.totalOverlapSec)} de paro del Grader en ${topMachine.pauseCount} evento${topMachine.pauseCount !== 1 ? 's' : ''} (${sharePct.toFixed(0)}% del paro upstream atribuido a máquinas). Priorizar mantención reduce tiempo muerto sin tener que cambiar configuración del Grader.`,
      severity: topMachine.totalOverlapSec >= 1800 ? 'critical' : 'warning',
    })
  }

  // 2) Pendiente negativa significativa del scatter → investigar ritmo upstream
  if (context.scatterSlope?.direction === 'neg' && context.scatterSlope.deltaP0_per_minus10cycles >= 0.3) {
    actions.push({
      id: 'scatter-baader-rate',
      category: 'oficina',
      title: 'Investigar caídas de ritmo en las Baader',
      description: `Detectada correlación operacional: cada -10 ciclos/5min de las Baaders → +${context.scatterSlope.deltaP0_per_minus10cycles.toFixed(2)} puntos P0% del Grader. Indica que la calidad del corte en evisceración impacta la clasificación. Verificar materia prima, dotación de operadores y mantenciones programadas en esa línea.`,
      severity: 'warning',
    })
  }

  return actions
}
