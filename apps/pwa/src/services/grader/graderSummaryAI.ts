/**
 * Análisis IA (Groq) construido desde un `GraderDailySummary`.
 *
 * Construye un `AIGraderInput` simplificado a partir de los KPIs pre-computados
 * en Firestore, luego lo envía al proveedor IA existente (`analyzeGrader`).
 *
 * No requiere re-parsear ningún Excel.  Los campos que el full-dashboard calcula
 * desde los registros individuales (gateBalance, gateSwapSuggestions, lotes,
 * matriz Q×C) se omiten o se aproximan desde `gateDistribution`.
 *
 * Si se pasan `recentTurns` se incluye contexto histórico en el prompt como
 * "serie temporal de P0% de los últimos N turnos".
 */

import type { GraderDailySummary } from './types'
import type { AIGraderInput, AIGraderOutput } from './types'
import { analyzeGrader } from '@/services/ai/aiProvider'

/**
 * Construye el payload `AIGraderInput` desde un resumen diario.
 */
export function buildAIInputFromSummary(
  summary: GraderDailySummary,
  recentTurns?: GraderDailySummary[],
): AIGraderInput {
  // ── KPIs ────────────────────────────────────────────────────────────────────
  const calibreDist = summary.calibreDistribution ?? []
  const qualityDist = summary.qualityDistribution ?? []
  const causes      = summary.topP0Causes ?? []

  const dominant = (arr: Array<{ pieces: number; pct: number }>, key: string) => {
    const top = [...arr].sort((a, b) => b.pieces - a.pieces)[0]
    if (!top) return undefined
    return { [key]: (top as any)[key], pct: top.pct, pieces: top.pieces } as any
  }

  const kpis: AIGraderInput['kpis'] = {
    totalPieces:          summary.totalPieces,
    pointZeroPieces:      summary.pointZeroPieces,
    pointZeroPct:         summary.pointZeroPct,
    totalWeightKg:        summary.totalWeightKg,
    avgWeightGrams:       summary.avgWeightGrams,
    productionRatePerHour: summary.productionRatePerHour,
    topPointZeroErrors:   causes,
    dominantCalibre:      dominant(calibreDist, 'calibre'),
    dominantQuality:      dominant(qualityDist, 'quality'),
  }

  // ── Distribuciones ──────────────────────────────────────────────────────────
  const byCalibre = calibreDist.map((d) => ({ key: d.calibre, pieces: d.pieces, pct: d.pct }))
  const byQuality = qualityDist.map((d) => ({ key: d.quality, pieces: d.pieces, pct: d.pct }))

  // ── Gate stats aproximadas desde gateDistribution ──────────────────────────
  const gateDist = summary.gateDistribution ?? []
  const totalGatePieces = gateDist.filter((g) => g.gate > 0).reduce((s, g) => s + g.pieces, 0)
  const gateAdvancedStats = gateDist
    .filter((g) => g.gate > 0)
    .map((g) => ({
      gateNumber:     g.gate,
      pieces:         g.pieces,
      cv:             0,   // no disponible desde summary
      utilizationPct: totalGatePieces > 0 ? Number(((g.pieces / totalGatePieces) * 100).toFixed(1)) : 0,
      mismatchPct:    0,   // no disponible desde summary
    }))

  // ── Serie temporal (P0% de turnos recientes) ─────────────────────────────────
  const prior = (recentTurns ?? [])
    .filter((t) => t.totalPieces >= 200)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.shiftId.localeCompare(b.shiftId))
    .slice(-20)

  // Usar timeSeriesPointZero como serie diaria de P0 (un bucket por turno histórico)
  const timeSeriesPointZero = prior.map((t) => ({
    bucketStart:     t.startAt ?? `${t.dateKey}T00:00:00.000Z`,
    totalPieces:     t.totalPieces,
    pointZeroPieces: t.pointZeroPieces,
    pointZeroPct:    t.pointZeroPct,
  }))

  // ── Completitud de datos ────────────────────────────────────────────────────
  const notes: string[] = ['Datos provenientes de resumen pre-computado en Firestore.']
  if (!summary.hasPieceData)  notes.push('Sin datos de registros PIEZA_PIEZA individuales.')
  if (!summary.hasGate0Data)  notes.push('Sin datos de registros PUERTA_0 individuales.')
  if (!calibreDist.length)    notes.push('Sin distribución por calibre.')
  if (!qualityDist.length)    notes.push('Sin distribución por calidad.')
  if (!gateDist.length)       notes.push('Sin distribución por compuerta.')
  if (prior.length > 0)       notes.push(`Contexto histórico: ${prior.length} turnos anteriores incluidos.`)

  return {
    version: '1.0',
    metadata: {
      startAt:     summary.startAt,
      endAt:       summary.endAt,
      totalPieces: summary.totalPieces,
    },
    kpis,
    distributions: {
      byCalibre,
      byQuality,
      pointZeroByError: causes,
    },
    timeSeriesPointZero,
    gateAssignments:   [],  // no disponible desde summary
    gateBalance:       [],  // no disponible desde summary
    gateAdvancedStats,
    dataCompleteness: {
      hasPieceRecords:      summary.hasPieceData ?? false,
      hasGate0Records:      summary.hasGate0Data ?? false,
      hasQualitySummary:    qualityDist.length > 0,
      hasProductionSummary: summary.productionRatePerHour != null,
      hasFolioRecords:      false,
      notes,
    },
  }
}

/**
 * Envía el resumen al proveedor IA y devuelve el diagnóstico estructurado.
 */
export async function analyzeGraderFromSummary(
  summary: GraderDailySummary,
  recentTurns?: GraderDailySummary[],
): Promise<AIGraderOutput> {
  const input = buildAIInputFromSummary(summary, recentTurns)
  return analyzeGrader(input)
}
