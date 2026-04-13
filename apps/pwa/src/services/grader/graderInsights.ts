/**
 * Motor de insights determinísticos del módulo Grader.
 *
 * Reglas basadas en umbrales configurables que generan alertas
 * con evidencia numérica y recomendaciones.
 */

import type {
  GraderAnalyticsResult,
  DeterministicInsight,
} from './types'
import { computePerGateResponseTime } from './graderGateTiming'

let insightCounter = 0
function nextId(): string {
  return `insight-${++insightCounter}`
}

export function computeDeterministicInsights(
  result: GraderAnalyticsResult,
): DeterministicInsight[] {
  insightCounter = 0
  const insights: DeterministicInsight[] = []

  const thresholds = result.config.errorThresholds ?? {
    photocellPctWarn: 1,
    outOfLimitsPctWarn: 3,
    pointZeroPctWarn: 2,
  }
  const pointZeroCriticalThreshold = thresholds.pointZeroPctCritical
    ?? (thresholds.pointZeroPctWarn * 2)

  // ——— 1. Punto Cero general ———
  if (result.kpis.pointZeroPct >= thresholds.pointZeroPctWarn) {
    // Add classification breakdown to evidence
    const classEvidence = result.pointZeroClassification.causes
      .filter((c) => c.pctOfPointZero >= 1)
      .map((c) => `  → ${c.label}: ${c.pieces.toLocaleString()} pz (${c.pctOfPointZero}% del P.Cero)`)

    insights.push({
      id: nextId(),
      severity: result.kpis.pointZeroPct >= pointZeroCriticalThreshold ? 'critical' : 'warn',
      title: 'Punto Cero elevado',
      evidence: [
        `Punto Cero: ${result.kpis.pointZeroPieces} piezas (${result.kpis.pointZeroPct}%)`,
        `Umbral configurado: ${thresholds.pointZeroPctWarn}%`,
        `Umbral crítico: ${pointZeroCriticalThreshold}%`,
        ...classEvidence,
      ],
      recommendations: [
        'Revisar las causas principales de Punto Cero.',
        'Verificar estado físico de la grader (limpieza, calibración).',
        'Considerar reconfigurar los rangos de clasificación.',
      ],
    })
  }

  // ——— 2. "No leído por fotocélula" (usando clasificación estandarizada) ———
  const photocellCause = result.pointZeroClassification.causes.find((c) => c.cause === 'no_leido_fotocelula')
  if (photocellCause && photocellCause.pctOfTotal >= thresholds.photocellPctWarn) {
    insights.push({
      id: nextId(),
      severity: photocellCause.pctOfTotal >= thresholds.photocellPctWarn * 2 ? 'critical' : 'warn',
      title: 'Error de fotocélula alto',
      evidence: [
        `${photocellCause.label}: ${photocellCause.pieces.toLocaleString()} piezas (${photocellCause.pctOfPointZero}% del P.Cero, ${photocellCause.pctOfTotal}% del total)`,
        `Umbral: ${thresholds.photocellPctWarn}%`,
      ],
      recommendations: [
        'Limpiar y verificar la posición de la fotocélula.',
        'Revisar calibración del sensor óptico.',
        'Comprobar que no haya obstrucciones en la línea.',
      ],
    })
  }

  // ——— 3. "Fuera de límites" + "Fuera de rango" (usando clasificación) ———
  const fueraLimitesCause = result.pointZeroClassification.causes.find((c) => c.cause === 'fuera_de_limites')
  const fueraRangoCause = result.pointZeroClassification.causes.find((c) => c.cause === 'fuera_de_rango')
  const combinedOOBPct = (fueraLimitesCause?.pctOfTotal ?? 0) + (fueraRangoCause?.pctOfTotal ?? 0)

  if (combinedOOBPct >= thresholds.outOfLimitsPctWarn) {
    const evidence: string[] = []
    if (fueraRangoCause) {
      evidence.push(`Fuera de rango: ${fueraRangoCause.pieces.toLocaleString()} pz (${fueraRangoCause.pctOfPointZero}% del P.Cero)`)
    }
    if (fueraLimitesCause) {
      evidence.push(`Fuera de límites: ${fueraLimitesCause.pieces.toLocaleString()} pz (${fueraLimitesCause.pctOfPointZero}% del P.Cero)`)
    }
    evidence.push(`Umbral combinado: ${thresholds.outOfLimitsPctWarn}%`)

    insights.push({
      id: nextId(),
      severity: combinedOOBPct >= thresholds.outOfLimitsPctWarn * 2 ? 'critical' : 'warn',
      title: 'Fuera de rango/límites elevado',
      evidence,
      recommendations: [
        'Revisar rangos de parametrización en Matrix.',
        'Verificar condiciones físicas del producto (tamaño/forma inusuales).',
        'Considerar ampliar los rangos si el producto cambió de especificación.',
      ],
    })
  }

  // ——— 4. Calibre dominante con pocos gates ———
  for (const gb of result.gateBalance) {
    if (gb.severity === 'critical' || gb.severity === 'warn') {
      insights.push({
        id: nextId(),
        severity: gb.severity,
        title: `Desbalance gates para ${gb.calibre}`,
        evidence: [
          `Demanda: ${gb.demandPct}% del total productivo`,
          `Gates asignados activos: ${gb.gatesAssigned}`,
          gb.message,
        ],
        recommendations: [
          `Considerar reasignar más gates al calibre ${gb.calibre}.`,
          'Verificar si otros calibres tienen gates sobrantes.',
          'Evaluar el impacto en Punto Cero por cola de espera.',
        ],
      })
    }
  }

  // ——— 5. Tendencia temporal creciente de Punto Cero ———
  if (result.timeSeriesPointZero.length >= 4) {
    const series = result.timeSeriesPointZero
    const midpoint = Math.floor(series.length / 2)
    const firstHalf = series.slice(0, midpoint)
    const secondHalf = series.slice(midpoint)

    const avgFirst = firstHalf.reduce((s, p) => s + p.pointZeroPieces, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((s, p) => s + p.pointZeroPieces, 0) / secondHalf.length

    if (avgSecond > avgFirst * 1.5 && avgFirst > 0) {
      const growthPct = Math.round(((avgSecond - avgFirst) / avgFirst) * 100)
      insights.push({
        id: nextId(),
        severity: growthPct > 100 ? 'critical' : 'warn',
        title: 'Punto Cero creciente en el tiempo',
        evidence: [
          `Promedio primera mitad del turno: ${avgFirst.toFixed(1)} piezas/intervalo`,
          `Promedio segunda mitad: ${avgSecond.toFixed(1)} piezas/intervalo`,
          `Incremento: +${growthPct}%`,
        ],
        recommendations: [
          'Posible degradación por suciedad acumulada o agua.',
          'Revisar sincronización de la grader.',
          'Programar limpieza a mitad de turno.',
        ],
      })
    }
  }

  // ——— 6. "Too close / too long" (usando clasificación) ———
  const tooCloseCause = result.pointZeroClassification.causes.find((c) => c.cause === 'too_close_too_long')
  if (tooCloseCause && tooCloseCause.pctOfTotal >= 0.5) {
    insights.push({
      id: nextId(),
      severity: tooCloseCause.pctOfTotal >= 2 ? 'warn' : 'info',
      title: 'Piezas "too close/too long"',
      evidence: [
        `${tooCloseCause.label}: ${tooCloseCause.pieces.toLocaleString()} piezas (${tooCloseCause.pctOfPointZero}% del P.Cero, ${tooCloseCause.pctOfTotal}% del total)`,
      ],
      recommendations: [
        'Verificar velocidad del alimentador y separación entre piezas.',
        'Revisar configuración de timing de la grader.',
      ],
    })
  }

  // ——— 7. "Puerta no preparada" (usando clasificación) ———
  const doorCause = result.pointZeroClassification.causes.find((c) => c.cause === 'puerta_no_preparada')
  if (doorCause && doorCause.pctOfTotal >= 0.5) {
    insights.push({
      id: nextId(),
      severity: doorCause.pctOfTotal >= 2 ? 'warn' : 'info',
      title: 'Puerta no preparada frecuente',
      evidence: [
        `${doorCause.label}: ${doorCause.pieces.toLocaleString()} piezas (${doorCause.pctOfPointZero}% del P.Cero, ${doorCause.pctOfTotal}% del total)`,
      ],
      recommendations: [
        'Verificar el mecanismo de actuación de las compuertas.',
        'Revisar tiempo de cierre/apertura de gates.',
        'Verificar velocidad de la línea vs. capacidad de las compuertas.',
      ],
    })
  }

  // ——— 8. Sin datos pieza-pieza ———
  if (result.notes.some((n) => n.includes('pieza-pieza'))) {
    insights.push({
      id: nextId(),
      severity: 'info',
      title: 'Datos incompletos',
      evidence: ['No se cargó archivo pieza-pieza.'],
      recommendations: [
        'Cargar el archivo pieza-pieza para obtener analítica completa.',
        'Sin pieza-pieza, las distribuciones y series temporales pueden ser parciales.',
      ],
    })
  }

  // ——— 9. Cambio de lote con diferencia significativa de peso ———
  if (result.lotAnalysis && result.lotAnalysis.length > 1) {
    const lots = result.lotAnalysis.filter((l) => l.avgWeightGrams > 0)
    for (let i = 1; i < lots.length; i++) {
      const prev = lots[i - 1]!
      const curr = lots[i]!
      const diff = Math.abs(curr.avgWeightGrams - prev.avgWeightGrams)
      const diffPct = prev.avgWeightGrams > 0 ? (diff / prev.avgWeightGrams) * 100 : 0
      if (diffPct >= 15) {
        insights.push({
          id: nextId(),
          severity: diffPct >= 30 ? 'critical' : 'warn',
          title: `Cambio significativo de peso entre lotes`,
          evidence: [
            `Lote "${prev.lot}": peso prom. ${prev.avgWeightGrams}g (${prev.pieces} pz)`,
            `Lote "${curr.lot}": peso prom. ${curr.avgWeightGrams}g (${curr.pieces} pz)`,
            `Diferencia: ${diff.toFixed(0)}g (${diffPct.toFixed(1)}%)`,
          ],
          recommendations: [
            'Al cambiar de lote, el peso promedio cambió significativamente.',
            'Considere agregar o reasignar compuertas para el nuevo rango de calibre.',
            'Verificar si la especie o tipo de producto cambió entre lotes.',
          ],
        })
      }
    }
  }

  // ——— 10. Tendencia de peso creciente/decreciente ———
  if (result.weightTrendSeries && result.weightTrendSeries.length >= 5) {
    const ws = result.weightTrendSeries
    const midpoint = Math.floor(ws.length / 2)
    const avgFirst = ws.slice(0, midpoint).reduce((s, w) => s + w.avgWeightGrams, 0) / midpoint
    const avgSecond = ws.slice(midpoint).reduce((s, w) => s + w.avgWeightGrams, 0) / (ws.length - midpoint)
    const diff = avgSecond - avgFirst
    const diffPct = avgFirst > 0 ? Math.abs(diff / avgFirst) * 100 : 0

    if (diffPct >= 5) {
      insights.push({
        id: nextId(),
        severity: diffPct >= 15 ? 'warn' : 'info',
        title: diff > 0 ? 'Peso promedio creciente en el turno' : 'Peso promedio decreciente en el turno',
        evidence: [
          `Primera mitad: ${avgFirst.toFixed(0)}g promedio`,
          `Segunda mitad: ${avgSecond.toFixed(0)}g promedio`,
          `Cambio: ${diff > 0 ? '+' : ''}${diff.toFixed(0)}g (${diffPct.toFixed(1)}%)`,
        ],
        recommendations: [
          'El peso promedio del producto está cambiando durante la producción.',
          'Posible cambio de materia prima o lote de origen.',
          'Evaluar si la distribución de gates sigue siendo óptima para el nuevo peso.',
        ],
      })
    }
  }

  // ——— 11. Gate con alta variabilidad ———
  if (result.gateAdvancedStats && result.gateAdvancedStats.length > 0) {
    const cvValues = result.gateAdvancedStats.map((g) => g.cv).filter((c) => c > 0)
    const avgCV = cvValues.length > 0 ? cvValues.reduce((s, c) => s + c, 0) / cvValues.length : 0
    for (const gs of result.gateAdvancedStats) {
      if (gs.cv > avgCV * 2 && gs.cv > 0.15) {
        insights.push({
          id: nextId(),
          severity: gs.cv > avgCV * 3 ? 'warn' : 'info',
          title: `Gate ${gs.gateNumber}: alta variabilidad de peso`,
          evidence: [
            `CV: ${(gs.cv * 100).toFixed(1)}% (promedio: ${(avgCV * 100).toFixed(1)}%)`,
            `Peso promedio: ${gs.avgWeightGrams}g ± ${gs.stdDevWeightGrams}g`,
            `Mismatch calibre: ${gs.mismatchPct}%`,
          ],
          recommendations: [
            `Gate ${gs.gateNumber} recibe piezas de pesos muy variables.`,
            'Verificar calibración de la compuerta o si está recibiendo múltiples calibres.',
          ],
        })
      }
    }
  }

  // ——— 12. Concentración Q×C alta ———
  if (result.matrixEnhanced && result.matrixEnhanced.globalHHI > 0.4) {
    insights.push({
      id: nextId(),
      severity: result.matrixEnhanced.globalHHI > 0.6 ? 'warn' : 'info',
      title: 'Alta concentración en Matriz Calidad×Calibre',
      evidence: [
        `HHI global: ${result.matrixEnhanced.globalHHI} (1 = completamente concentrado)`,
        result.matrixEnhanced.maxCell
          ? `Celda dominante: ${result.matrixEnhanced.maxCell.quality} × ${result.matrixEnhanced.maxCell.calibre} (${result.matrixEnhanced.maxCell.pct}%)`
          : '',
      ].filter(Boolean),
      recommendations: [
        'La producción está muy concentrada en pocas combinaciones calidad-calibre.',
        'Esto es normal si el lote es uniforme, pero puede indicar baja diversificación.',
      ],
    })
  }

  // ——— 13. Sugerencias de swap como insights ———
  if (result.gateSwapSuggestions && result.gateSwapSuggestions.length > 0) {
    for (const swap of result.gateSwapSuggestions.slice(0, 3)) {
      insights.push({
        id: nextId(),
        severity: swap.impactScore >= 50 ? 'warn' : 'info',
        title: `Sugerencia: reasignar Gate ${swap.gateNumber}`,
        evidence: swap.evidence,
        recommendations: [swap.reason],
      })
    }
  }

  // ——— 14. Análisis físico: separación entre peces en la cinta ———
  const physicalConfig = result.config.physicalConfig
  if (physicalConfig && result.kpis.productionRatePerHour && result.kpis.productionRatePerHour > 0) {
    const mainBelt = physicalConfig.belts.find((b) => b.beltId === 'main')
    if (mainBelt && mainBelt.speedMps > 0) {
      // Separación entre peces: distancia = velocidad / (piezas/segundo)
      const ratePerSec = result.kpis.productionRatePerHour / 3600
      const spacingMeters = mainBelt.speedMps / ratePerSec
      const spacingCm = spacingMeters * 100
      const salmonLengthCm = physicalConfig.avgSalmonLengthCm
      const gapCm = spacingCm - salmonLengthCm
      const ratioToLength = spacingCm / salmonLengthCm

      if (ratioToLength < 1.4) {
        const tooCloseCause = result.pointZeroClassification.causes.find(
          (c) => c.cause === 'too_close_too_long',
        )
        const evidence: string[] = [
          `Velocidad cinta clasificadora: ${mainBelt.speedMps} m/s`,
          `Tasa de producción: ${result.kpis.productionRatePerHour.toFixed(0)} pz/h`,
          `Separación estimada entre peces: ${spacingCm.toFixed(1)} cm`,
          `Largo promedio salmón configurado: ${salmonLengthCm} cm`,
          `Espacio libre entre peces: ${gapCm.toFixed(1)} cm (${((gapCm / salmonLengthCm) * 100).toFixed(0)}% del largo)`,
        ]
        if (tooCloseCause && tooCloseCause.pieces > 0) {
          evidence.push(`Errores "too close/too long" detectados: ${tooCloseCause.pieces.toLocaleString()} pz (${tooCloseCause.pctOfTotal}% del total)`)
        }
        insights.push({
          id: nextId(),
          severity: ratioToLength < 1.2 ? 'critical' : 'warn',
          title: 'Congestionamiento físico: separación insuficiente entre peces',
          evidence,
          recommendations: [
            `La separación estimada (${spacingCm.toFixed(1)} cm) es menor al mínimo recomendado (1.4× largo del salmón = ${(salmonLengthCm * 1.4).toFixed(0)} cm).`,
            'Reducir la tasa de alimentación de los pockets para aumentar la separación.',
            'Considerar aumentar la velocidad de las cintas de aceleración.',
            ...(ratioToLength < 1.2 ? ['URGENTE: riesgo alto de errores "too close" en cascada — acción inmediata recomendada.'] : []),
          ],
        })
      }
    }
  }

  // ——— 15. Precisión de pesaje en bordes de calibre ———
  // La MS4/12 tiene ±20g (0-5kg) y ±50g (5-15kg). Si el peso promedio de un gate
  // cae cerca del límite entre dos calibres, hay riesgo de clasificación incorrecta.
  if (result.gateAdvancedStats && result.gateAdvancedStats.length > 0) {
    const customRanges = result.config.customWeightRanges
    if (customRanges && customRanges.length > 1) {
      const sortedRanges = [...customRanges].sort((a, b) => a.minGrams - b.minGrams)
      for (const gs of result.gateAdvancedStats) {
        if (gs.pieces < 20 || gs.avgWeightGrams <= 0) continue
        // Precisión del pesaje según rango: ±20g (0-5000g) / ±50g (5001-15000g)
        const precision = gs.avgWeightGrams <= 5000 ? 20 : 50
        // Buscar si el promedio del gate está dentro de [precisionZone] de un límite de calibre
        const boundary = sortedRanges.find((r) => {
          const distToMin = Math.abs(gs.avgWeightGrams - r.minGrams)
          const distToMax = Math.abs(gs.avgWeightGrams - r.maxGrams)
          return distToMin <= precision * 3 || distToMax <= precision * 3
        })
        if (boundary) {
          const distToMin = Math.abs(gs.avgWeightGrams - boundary.minGrams)
          const distToMax = Math.abs(gs.avgWeightGrams - boundary.maxGrams)
          const closestBoundaryDist = Math.min(distToMin, distToMax)
          if (closestBoundaryDist <= precision * 2) {
            insights.push({
              id: nextId(),
              severity: 'info',
              title: `Gate ${gs.gateNumber}: peso promedio muy cercano al límite de calibre`,
              evidence: [
                `Peso promedio: ${gs.avgWeightGrams}g (calibre ${gs.assignedCalibre})`,
                `Límite de calibre más cercano: ${boundary.calibre} (${boundary.minGrams}-${boundary.maxGrams}g)`,
                `Distancia al límite: ${closestBoundaryDist}g`,
                `Precisión del pesaje (MS4/12): ±${precision}g stdev en este rango`,
              ],
              recommendations: [
                `Con ±${precision}g de precisión, piezas de este gate pueden ser asignadas al calibre adyacente.`,
                'Esto es una limitación física del sensor de pesaje, no un error de configuración.',
                'Considerar ampliar el rango de este calibre o agregar un gate de margen.',
              ],
            })
          }
        }
      }
    }
  }

  // ——— 16. Flippers con tiempo de reacción crítico a vel. máx. del fabricante ———
  // La MS4/12 puede operar hasta 1.4 m/s. A esa velocidad, Gate 1 (1.37m) tiene
  // 1.37 / 1.4 = 0.98s — casi 1 segundo. Alertamos cuando < 1.5s a vel. actual.
  if (physicalConfig && physicalConfig.flipperPositions.length > 0) {
    const mainBelt = physicalConfig.belts.find((b) => b.beltId === 'main')
    if (mainBelt && mainBelt.speedMps > 0) {
      // Calcular también a vel. máx. del fabricante para contexto
      const maxSpeedMps = 1.4
      const criticalFlippers = physicalConfig.flipperPositions
        .filter((fp) => fp.distanceFromSensorMeters / mainBelt.speedMps < 1.5)
        .map((fp) => ({
          gateNumber: fp.gateNumber,
          distanceM: fp.distanceFromSensorMeters,
          timeSec: fp.distanceFromSensorMeters / mainBelt.speedMps,
          timeSecAtMaxSpeed: fp.distanceFromSensorMeters / maxSpeedMps,
        }))

      if (criticalFlippers.length > 0) {
        insights.push({
          id: nextId(),
          severity: criticalFlippers.some((f) => f.timeSec < 0.9) ? 'warn' : 'info',
          title: `${criticalFlippers.length} flippers con tiempo de reacción ajustado`,
          evidence: criticalFlippers.map(
            (fp) =>
              `Gate ${fp.gateNumber}: ${fp.distanceM.toFixed(3)} m → ${fp.timeSec.toFixed(2)} s @ ${mainBelt.speedMps} m/s` +
              (mainBelt.speedMps < maxSpeedMps
                ? ` (${fp.timeSecAtMaxSpeed.toFixed(2)} s a vel. máx. 1.4 m/s)`
                : ''),
          ),
          recommendations: [
            'Estos gates tienen menos de 1.5 segundos entre detección y accionamiento del flipper.',
            'Verificar que el actuador neumático responda dentro del tiempo disponible.',
            'Si hay errores "puerta no preparada" en estos gates, reducir la velocidad de la cinta.',
            'Vel. máxima del fabricante (MS4/12): 1.4 m/s — no superar.',
          ],
        })
      }
    }
  }

  // ——— 17. Gate sobrecargada (umbral configurable, default >35%) ———
  // Si un gate acumula demasiado % del total, el flipper puede no resetear a tiempo
  // y aparecen errores "puerta no preparada". La solución: duplicar ese calibre en otra gate.
  if (result.gateAdvancedStats && result.gateAdvancedStats.length > 0 && result.kpis.totalPieces > 100) {
    const overloadWarn = result.config.errorThresholds?.gateOverloadWarnPct ?? 35
    const overloadCritical = result.config.errorThresholds?.gateOverloadCriticalPct ?? 50
    const activeStats = result.gateAdvancedStats.filter((g) => g.pieces > 0)
    if (activeStats.length >= 2) {
      const avgUtilization = 100 / activeStats.length

      for (const g of activeStats) {
        if (g.utilizationPct < overloadWarn) continue

        // Gates con utilización < 40% del promedio → candidatas para absorber carga
        const underloaded = activeStats
          .filter((u) => u.gateNumber !== g.gateNumber && u.utilizationPct < avgUtilization * 0.45)
        const topCandidate = underloaded[0]

        insights.push({
          id: nextId(),
          severity: g.utilizationPct >= overloadCritical ? 'critical' : 'warn',
          title: `Gate ${g.gateNumber} concentra el ${g.utilizationPct.toFixed(1)}% del tráfico`,
          evidence: [
            `Gate ${g.gateNumber}: ${g.pieces.toLocaleString()} pz = ${g.utilizationPct.toFixed(1)}% del total clasificado`,
            `Umbral warn: ${overloadWarn}% · Umbral critical: ${overloadCritical}%`,
            `Promedio esperado por gate activa: ${avgUtilization.toFixed(1)}%`,
            `Calibre: ${g.assignedCalibre} / ${g.assignedQuality}`,
            topCandidate !== undefined
              ? `Gates con baja carga: ${underloaded.map((u) => `Gate ${u.gateNumber} (${u.utilizationPct.toFixed(1)}%)`).join(', ')}`
              : 'Todas las gates activas trabajan a nivel elevado.',
          ],
          recommendations: [
            `Asignar ${g.assignedCalibre} / ${g.assignedQuality} a una gate adicional para distribuir la carga.`,
            ...(topCandidate !== undefined
              ? [`Gate ${topCandidate.gateNumber} tiene capacidad disponible (${topCandidate.utilizationPct.toFixed(1)}% de utilización actual).`]
              : []),
            'Ir a "Configurar compuertas" → duplicar el calibre en otra gate cercana.',
            'Esto reduce el riesgo de "puerta no preparada" y mejora el throughput.',
          ],
        })
      }
    }
  }

  // ——— 18. Conflicto de timing entre gates adyacentes activas (Z2) ———
  // Si dos gates consecutivas están activas, el tiempo entre sus dis Z2 debe ser
  // suficiente para que el salmón pase y el flipper se resetee antes del siguiente.
  // t_disponible = (dis_n+1 - dis_n) / vel_cinta
  // t_requerido  = t_salmón_pasa + t_reset_neumático (per-gate si pneumaticConfig disponible)
  if (physicalConfig && physicalConfig.z2ProgrammedDistancesMm && physicalConfig.z2ProgrammedDistancesMm.length >= 12) {
    const mainBelt2 = physicalConfig.belts.find((b) => b.beltId === 'main')
    const speedMps = mainBelt2?.speedMps ?? 1.28
    const salmonLenM = physicalConfig.avgSalmonLengthCm / 100
    const tSalmonPass = salmonLenM / speedMps
    const marginThreshold = result.config.errorThresholds?.timingMarginWarnSec ?? 0.15

    // Usar modelo neumático per-gate si disponible, si no flat
    const hasPneu = !!physicalConfig.pneumaticConfig
    const flatReset = physicalConfig.flipperResetTimeSec ?? 0.45

    const activeGateNums = result.gates
      .filter((g) => g.active)
      .map((g) => g.gateNumber)
      .sort((a, b) => a - b)

    for (let i = 0; i < activeGateNums.length - 1; i++) {
      const g1 = activeGateNums[i]!
      const g2 = activeGateNums[i + 1]!
      if (g2 !== g1 + 1) continue   // solo gates ADYACENTES (consecutivas en número)

      const dis1 = physicalConfig.z2ProgrammedDistancesMm[g1 - 1]
      const dis2 = physicalConfig.z2ProgrammedDistancesMm[g2 - 1]
      if (!dis1 || !dis2 || dis2 <= dis1) continue

      const tAvailable = (dis2 - dis1) / 1000 / speedMps

      // Reset time per-gate: neumático si disponible
      let tReset: number
      let pneumDetail = ''
      if (hasPneu) {
        const breakdown = computePerGateResponseTime(g1, physicalConfig.pneumaticConfig!)
        tReset = breakdown.totalResponseSec
        pneumDetail = ` (válvula ${(breakdown.valveSwitchSec * 1000).toFixed(0)}ms + línea ${(breakdown.lineChargeSec * 1000).toFixed(0)}ms + cilindro ${(breakdown.cylinderStrokeSec * 1000).toFixed(0)}ms, P_eff ${breakdown.effectivePressureBar.toFixed(1)} bar)`
      } else {
        tReset = flatReset
        pneumDetail = ' (valor plano estimado)'
      }
      const tRequired = tSalmonPass + tReset
      const margin = tAvailable - tRequired

      if (margin < marginThreshold) {
        // Verificar si "puerta no preparada" aparece en la data real
        const doorNotReadyCause = result.pointZeroClassification.causes.find(
          (c) => c.cause === 'puerta_no_preparada',
        )
        insights.push({
          id: nextId(),
          severity: margin < 0 ? 'warn' : 'info',
          title: `Gate ${g1}→${g2}: timing Z2 muy ajustado entre gates adyacentes`,
          evidence: [
            `Tiempo disponible entre dis${g1}=${dis1}mm y dis${g2}=${dis2}mm: ${tAvailable.toFixed(2)} s`,
            `Tiempo requerido (salmón ${physicalConfig.avgSalmonLengthCm}cm + reset ${tReset.toFixed(3)}s${pneumDetail}): ${tRequired.toFixed(2)} s`,
            `Margen: ${margin >= 0 ? '+' : ''}${(margin * 1000).toFixed(0)} ms (umbral: ${(marginThreshold * 1000).toFixed(0)} ms)`,
            ...(doorNotReadyCause && doorNotReadyCause.pieces > 0
              ? [`"Puerta no preparada" en datos: ${doorNotReadyCause.pieces} pz (${doorNotReadyCause.pctOfTotal}%)`]
              : []),
          ],
          recommendations: [
            margin < 0
              ? `El flipper de Gate ${g1} puede no estar reseteado cuando Gate ${g2} deba activarse — causa probable de "puerta no preparada".`
              : `Margen reducido — monitorear si aparecen errores "puerta no preparada" en estos gates.`,
            `Alternativa: bajar dis${g2} en el Z2 para aumentar el tiempo disponible (actualmente ${dis2} mm).`,
            `Alternativa: reducir velocidad Sorting Belt — actualmente ${speedMps} m/s.`,
          ],
        })
      }
    }
  }

  return insights
}

// ============================================================================
// PREDICTIVO v1 (ligero / determinístico)
// ============================================================================

export interface PointZeroTrend {
  direction: 'increasing' | 'decreasing' | 'stable'
  slopePerHour: number
  projectedPctIn2h?: number
  anomalyBuckets: string[] // ISO timestamps de buckets anómalos
}

/**
 * Calcula tendencia de Punto Cero y detección de anomalías simples
 * basada en media ± 2σ sobre la serie temporal.
 */
export function computePointZeroTrend(
  result: GraderAnalyticsResult,
): PointZeroTrend {
  const series = result.timeSeriesPointZero
  if (series.length < 3) {
    return { direction: 'stable', slopePerHour: 0, anomalyBuckets: [] }
  }

  // Linear regression on point zero pieces
  const n = series.length
  const xs = series.map((_, i) => i)
  const ys = series.map((p) => p.pointZeroPieces)

  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY)
    den += (xs[i]! - meanX) * (xs[i]! - meanX)
  }

  const slope = den === 0 ? 0 : num / den
  const intervalMin = result.config.intervalMinutes ?? 15
  const slopePerHour = slope * (60 / intervalMin)

  // Direction
  let direction: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (slopePerHour > 1) direction = 'increasing'
  else if (slopePerHour < -1) direction = 'decreasing'

  // Anomaly detection: mean ± 2σ
  const stdDev = Math.sqrt(
    ys.reduce((s, y) => s + (y - meanY) ** 2, 0) / n,
  )
  const threshold = meanY + 2 * stdDev
  const anomalyBuckets = series
    .filter((p) => p.pointZeroPieces > threshold && threshold > 0)
    .map((p) => p.bucketStart)

  // Projection: value at current + 2h
  const stepsIn2h = Math.ceil(120 / intervalMin)
  const intercept = meanY - slope * meanX
  const projected = intercept + slope * (n - 1 + stepsIn2h)
  const lastTotalPieces = series[n - 1]?.totalPieces ?? result.kpis.totalPieces / n
  const projectedPct =
    lastTotalPieces > 0 ? Math.round((projected / lastTotalPieces) * 10000) / 100 : undefined

  return {
    direction,
    slopePerHour: Math.round(slopePerHour * 100) / 100,
    projectedPctIn2h: projectedPct != null && projectedPct >= 0 ? projectedPct : undefined,
    anomalyBuckets,
  }
}
