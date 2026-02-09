/**
 * Proveedor de IA desacoplado para análisis de Grader.
 *
 * Interfaz genérica con implementación mock.
 * TODO: Conectar a endpoint real (Grok, OpenAI, etc.)
 */

import type { AIGraderInput, AIGraderOutput } from '../grader/types'

// ============================================================================
// INTERFAZ
// ============================================================================

export interface AIProvider {
  analyzeGrader(payload: AIGraderInput): Promise<AIGraderOutput>
}

// ============================================================================
// MOCK PROVIDER (determinístico – genera respuesta basada en los datos)
// ============================================================================

class MockAIProvider implements AIProvider {
  async analyzeGrader(payload: AIGraderInput): Promise<AIGraderOutput> {
    // Simulate latency
    await new Promise((r) => setTimeout(r, 1500))

    const { kpis, distributions, gateBalance, timeSeriesPointZero, dataCompleteness } = payload

    const summaryBullets: string[] = []
    const likelyCauses: AIGraderOutput['likelyCauses'] = []
    const recommendedActions: AIGraderOutput['recommendedActions'] = []
    const whatToCheckNext: string[] = []
    const disclaimers: string[] = [
      'Esta respuesta fue generada por un motor mock local (sin IA real).',
      'Los resultados son orientativos basados en reglas heurísticas.',
    ]

    // Summary
    summaryBullets.push(
      `Se procesaron ${kpis.totalPieces.toLocaleString()} piezas en el periodo analizado.`,
    )
    summaryBullets.push(
      `Punto Cero: ${kpis.pointZeroPieces.toLocaleString()} piezas (${kpis.pointZeroPct}%).`,
    )

    if (kpis.dominantCalibre) {
      summaryBullets.push(
        `Calibre dominante: ${kpis.dominantCalibre.calibre} con ${kpis.dominantCalibre.pct}% del total.`,
      )
    }

    if (kpis.dominantQuality) {
      summaryBullets.push(
        `Calidad dominante: ${kpis.dominantQuality.quality} con ${kpis.dominantQuality.pct}%.`,
      )
    }

    // Causes
    if (kpis.pointZeroPct > 2) {
      const topError = distributions.pointZeroByError[0]
      likelyCauses.push({
        cause: 'Punto Cero elevado por errores de clasificación',
        confidence: kpis.pointZeroPct > 5 ? 'high' : 'medium',
        evidence: [
          `Punto Cero en ${kpis.pointZeroPct}% (umbral recomendado: 2%)`,
          topError
            ? `Error principal: "${topError.error}" con ${topError.pieces} piezas (${topError.pct}%)`
            : 'Sin desglose de errores disponible',
        ],
      })
    }

    // Gate balance issues
    const criticalGates = gateBalance.filter((g) => g.severity === 'critical')
    if (criticalGates.length > 0) {
      likelyCauses.push({
        cause: 'Desbalance en asignación de gates',
        confidence: 'high',
        evidence: criticalGates.map(
          (g) => `${g.calibre}: ${g.demandPct}% demanda con ${g.gatesAssigned} gates`,
        ),
      })

      recommendedActions.push({
        action: `Reasignar gates para calibres con alta demanda (${criticalGates.map((g) => g.calibre).join(', ')})`,
        priority: 'high',
        why: `Calibres con demanda >${criticalGates[0]?.demandPct}% tienen menos de 3 gates activos.`,
      })
    }

    // Trend
    if (timeSeriesPointZero.length >= 4) {
      const mid = Math.floor(timeSeriesPointZero.length / 2)
      const first = timeSeriesPointZero.slice(0, mid)
      const second = timeSeriesPointZero.slice(mid)
      const avgFirst = first.reduce((s, p) => s + p.pointZeroPieces, 0) / first.length
      const avgSecond = second.reduce((s, p) => s + p.pointZeroPieces, 0) / second.length

      if (avgSecond > avgFirst * 1.3) {
        likelyCauses.push({
          cause: 'Degradación progresiva durante el turno',
          confidence: 'medium',
          evidence: [
            `Promedio Punto Cero primera mitad: ${avgFirst.toFixed(1)} pz/intervalo`,
            `Promedio segunda mitad: ${avgSecond.toFixed(1)} pz/intervalo`,
            `Incremento: +${Math.round(((avgSecond - avgFirst) / avgFirst) * 100)}%`,
          ],
        })

        recommendedActions.push({
          action: 'Programar limpieza a mitad de turno',
          priority: 'medium',
          why: 'El Punto Cero crece con el tiempo, sugiriendo acumulación de suciedad/agua.',
        })
      }
    }

    // General recommendations
    if (kpis.pointZeroPct > 1) {
      recommendedActions.push({
        action: 'Revisar parametrización de rangos en Matrix',
        priority: kpis.pointZeroPct > 3 ? 'high' : 'medium',
        why: `Punto Cero en ${kpis.pointZeroPct}% sugiere posible desajuste de rangos.`,
      })
    }

    // Checklist
    whatToCheckNext.push('Verificar estado físico de fotocélulas y sensores')
    whatToCheckNext.push('Revisar configuración de rangos por calibre en Matrix')
    whatToCheckNext.push('Comparar con turnos anteriores para detectar tendencias')

    if (!dataCompleteness.hasGate0Records) {
      whatToCheckNext.push('Cargar archivo Puerta 0 para mejor desglose de errores')
    }
    if (!dataCompleteness.hasPieceRecords) {
      whatToCheckNext.push('Cargar archivo pieza-pieza para análisis completo')
    }

    // Disclaimers for missing data
    for (const note of dataCompleteness.notes) {
      disclaimers.push(note)
    }

    return {
      version: '1.0',
      summaryBullets,
      likelyCauses,
      recommendedActions,
      whatToCheckNext,
      disclaimers,
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let currentProvider: AIProvider = new MockAIProvider()

export function setAIProvider(provider: AIProvider) {
  currentProvider = provider
}

export function getAIProvider(): AIProvider {
  return currentProvider
}

/**
 * Conveniencia: analiza datos de grader con el provider actual.
 */
export async function analyzeGrader(payload: AIGraderInput): Promise<AIGraderOutput> {
  return currentProvider.analyzeGrader(payload)
}

/**
 * Valida que la respuesta de IA cumpla con AIGraderOutput.
 * Si el modelo retorna texto no-JSON, intenta extraer JSON.
 */
export function parseAIResponse(raw: string): { parsed?: AIGraderOutput; error?: string; rawText?: string } {
  // Try direct parse
  try {
    const obj = JSON.parse(raw)
    if (obj && obj.version === '1.0' && Array.isArray(obj.summaryBullets)) {
      return { parsed: obj as AIGraderOutput }
    }
    return { error: 'Respuesta JSON no cumple con el esquema AIGraderOutput.', rawText: raw }
  } catch {
    // Try to extract JSON from text
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0])
        if (obj && Array.isArray(obj.summaryBullets)) {
          return { parsed: { ...obj, version: '1.0' } as AIGraderOutput }
        }
      } catch {
        // fall through
      }
    }
    return { error: 'No se pudo parsear JSON de la respuesta IA.', rawText: raw }
  }
}
