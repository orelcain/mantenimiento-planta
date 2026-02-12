/**
 * Proveedor de IA para análisis de Grader — Groq (Llama 3.3 70B).
 *
 * Envía datos estadísticos completos a Groq y parsea una respuesta
 * estructurada tipo AIGraderOutput.
 */

import type { AIGraderInput, AIGraderOutput } from '../grader/types'

// ============================================================================
// INTERFAZ
// ============================================================================

export interface AIProvider {
  analyzeGrader(payload: AIGraderInput): Promise<AIGraderOutput>
}

// ============================================================================
// SYSTEM PROMPT — analista estadístico profesional
// ============================================================================

const SYSTEM_PROMPT = [
  'Eres un analista estadístico senior especializado en clasificadoras (graders) de salmón en plantas de procesamiento.',
  '',
  'CONTEXTO TÉCNICO:',
  '- Una grader clasifica piezas de salmón por peso en compuertas (gates) asignadas a calibres (0-2lb, 2-4lb, 4-6lb, 6-8lb, 8-10lb, 10-12lb).',
  '- "Punto Cero" (Gate 0) = piezas que NO fueron clasificadas correctamente. Causas: fuera de rango, fuera de límites, no leído por fotocélula, too close/too long, puerta no preparada, otros.',
  '- KPIs clave: % Punto Cero (ideal <2%), Mismatch por gate, CV (variabilidad), balance gates vs demanda.',
  '- El objetivo es MINIMIZAR Punto Cero y MAXIMIZAR eficiencia de clasificación.',
  '',
  'TU ROL:',
  'Analizar los datos estadísticos proporcionados como un analista de datos profesional.',
  '- Identificar patrones, correlaciones y anomalías.',
  '- Proporcionar diagnóstico basado en EVIDENCIA NUMÉRICA.',
  '- Dar recomendaciones ACCIONABLES y priorizadas.',
  '- Ser directo, técnico, sin relleno.',
  '',
  'RESPUESTA:',
  'Responder EXCLUSIVAMENTE en JSON válido con esta estructura exacta (sin markdown, sin bloques de código):',
  '{',
  '  "version": "1.0",',
  '  "summaryBullets": ["string — 4-6 bullets con hallazgos clave, cada uno con datos numéricos"],',
  '  "likelyCauses": [',
  '    {',
  '      "cause": "descripción corta de la causa",',
  '      "confidence": "low|medium|high",',
  '      "evidence": ["evidencia numérica 1", "evidencia 2"]',
  '    }',
  '  ],',
  '  "recommendedActions": [',
  '    {',
  '      "action": "acción concreta",',
  '      "priority": "low|medium|high",',
  '      "why": "justificación con datos"',
  '    }',
  '  ],',
  '  "whatToCheckNext": ["verificación 1", "verificación 2"],',
  '  "disclaimers": ["nota si hay limitaciones en los datos"]',
  '}',
  '',
  'REGLAS ESTRICTAS:',
  '- SIEMPRE incluir datos numéricos en evidence y why.',
  '- NO inventar datos que no estén en el input.',
  '- Priorizar causas raíz sobre síntomas.',
  '- Si la data es incompleta, mencionarlo explícitamente.',
  '- Máximo 5 likelyCauses, 6 recommendedActions, 5 whatToCheckNext.',
  '- Responder SOLO JSON, sin texto antes ni después.',
].join('\n')

// ============================================================================
// GROQ PROVIDER (real)
// ============================================================================

class GroqAIProvider implements AIProvider {
  async analyzeGrader(payload: AIGraderInput): Promise<AIGraderOutput> {
    const userPrompt = buildPrompt(payload)
    const content = await callGroqAPI(userPrompt)
    const parsed = parseAIResponse(content)
    if (parsed.parsed) return parsed.parsed
    throw new Error(parsed.error || 'Respuesta de IA no válida')
  }
}

function buildPrompt(p: AIGraderInput): string {
  const lines: string[] = []

  lines.push('=== DATOS DEL TURNO ===')
  lines.push('Periodo: ' + (p.metadata.startAt || '?') + ' a ' + (p.metadata.endAt || '?'))
  lines.push('Piezas totales: ' + p.kpis.totalPieces.toLocaleString())
  lines.push('Punto Cero: ' + p.kpis.pointZeroPieces.toLocaleString() + ' (' + p.kpis.pointZeroPct + '%)')
  lines.push('Piezas productivas: ' + (p.kpis.totalPieces - p.kpis.pointZeroPieces).toLocaleString())
  if (p.kpis.avgWeightGrams) lines.push('Peso promedio: ' + p.kpis.avgWeightGrams + 'g')
  if (p.kpis.medianWeightGrams) lines.push('Peso mediana: ' + p.kpis.medianWeightGrams + 'g')
  if (p.kpis.dominantCalibre) lines.push('Calibre dominante: ' + p.kpis.dominantCalibre.calibre + ' (' + p.kpis.dominantCalibre.pct + '%)')
  if (p.kpis.dominantQuality) lines.push('Calidad dominante: ' + p.kpis.dominantQuality.quality + ' (' + p.kpis.dominantQuality.pct + '%)')

  lines.push('')
  lines.push('=== DISTRIBUCIÓN POR CALIBRE ===')
  for (const d of p.distributions.byCalibre) {
    lines.push('  ' + d.key + ': ' + d.pieces + ' pz (' + d.pct + '%)')
  }

  if (p.distributions.byQuality.length > 0) {
    lines.push('')
    lines.push('=== DISTRIBUCIÓN POR CALIDAD ===')
    for (const d of p.distributions.byQuality) {
      lines.push('  ' + d.key + ': ' + d.pieces + ' pz (' + d.pct + '%)')
    }
  }

  if (p.distributions.pointZeroByError.length > 0) {
    lines.push('')
    lines.push('=== DESGLOSE PUNTO CERO (errores) ===')
    for (const e of p.distributions.pointZeroByError) {
      lines.push('  ' + e.error + ': ' + e.pieces + ' pz (' + e.pct + '%)')
    }
  }

  lines.push('')
  lines.push('=== BALANCE DE GATES ===')
  for (const gb of p.gateBalance) {
    const extra = gb as unknown as Record<string, unknown>
    lines.push('  ' + gb.calibre + ': demanda ' + gb.demandPct + '%, gates=' + gb.gatesAssigned + ', ideal=' + (extra.idealGates ?? '?') + ', gap=' + (extra.gap ?? '?') + ', sev=' + gb.severity)
  }

  if (p.gateAssignments.length > 0) {
    lines.push('')
    lines.push('=== ASIGNACIÓN DE GATES ===')
    for (const g of p.gateAssignments) {
      if (g.active) lines.push('  Gate ' + g.gateNumber + ': ' + g.assignedCalibre + ' / ' + g.assignedQuality)
    }
  }

  if (p.gateAdvancedStats && p.gateAdvancedStats.length > 0) {
    lines.push('')
    lines.push('=== ESTADÍSTICAS POR GATE ===')
    for (const g of p.gateAdvancedStats) {
      lines.push('  Gate ' + g.gateNumber + ': ' + g.pieces + ' pz, CV=' + (g.cv * 100).toFixed(1) + '%, utiliz=' + g.utilizationPct + '%, mismatch=' + g.mismatchPct + '%')
    }
  }

  if (p.gateSwapSuggestions && p.gateSwapSuggestions.length > 0) {
    lines.push('')
    lines.push('=== SUGERENCIAS DE REASIGNACIÓN (automáticas) ===')
    for (const s of p.gateSwapSuggestions) {
      lines.push('  [' + s.type + '] Gate ' + s.gateNumber + ': ' + s.currentCalibre + ' -> ' + s.suggestedCalibre + ' (impacto: ' + s.impactScore + ')')
      lines.push('    Razón: ' + s.reason)
    }
  }

  if (p.lotAnalysis && p.lotAnalysis.length > 0) {
    lines.push('')
    lines.push('=== ANÁLISIS POR LOTE ===')
    for (const l of p.lotAnalysis) {
      lines.push('  Lote "' + l.lot + '": ' + l.pieces + ' pz, peso=' + l.avgWeightGrams + 'g, std=' + l.stdDevWeightGrams + 'g, P0=' + l.pointZeroPct + '%')
    }
  }

  if (p.matrixEnhanced) {
    lines.push('')
    lines.push('=== CONCENTRACIÓN MATRIZ Q×C ===')
    lines.push('  HHI global: ' + p.matrixEnhanced.globalHHI)
    lines.push('  Desbalance: ' + p.matrixEnhanced.imbalanceScore)
    if (p.matrixEnhanced.maxCell) {
      lines.push('  Celda dominante: ' + p.matrixEnhanced.maxCell.quality + ' x ' + p.matrixEnhanced.maxCell.calibre + ' (' + p.matrixEnhanced.maxCell.pct + '%)')
    }
  }

  if (p.timeSeriesPointZero.length > 0) {
    lines.push('')
    lines.push('=== SERIE TEMPORAL PUNTO CERO ===')
    const ts = p.timeSeriesPointZero
    lines.push('  Buckets: ' + ts.length)
    const pzValues = ts.map(t => t.pointZeroPieces)
    lines.push('  Rango: ' + Math.min(...pzValues) + ' — ' + Math.max(...pzValues) + ' pz/intervalo')
    const avgPz = pzValues.reduce((s, v) => s + v, 0) / pzValues.length
    lines.push('  Promedio: ' + avgPz.toFixed(1) + ' pz/intervalo')
    const mid = Math.floor(ts.length / 2)
    if (mid > 0) {
      const first = pzValues.slice(0, mid).reduce((s, v) => s + v, 0) / mid
      const second = pzValues.slice(mid).reduce((s, v) => s + v, 0) / (ts.length - mid)
      lines.push('  1a mitad: ' + first.toFixed(1) + ', 2a mitad: ' + second.toFixed(1))
    }
  }

  if (p.patternFocus && p.patternFocus.filteredTotalPieces > 0) {
    lines.push('')
    lines.push('=== FOCO DE PATRÓN (PUNTO CERO FILTRADO) ===')
    if (p.patternFocus.selectedCauseLabel) {
      lines.push('  Causa seleccionada: ' + p.patternFocus.selectedCauseLabel)
    }
    if (p.patternFocus.timeRange?.from || p.patternFocus.timeRange?.to) {
      lines.push('  Rango horario: ' + (p.patternFocus.timeRange?.from || '00:00') + ' - ' + (p.patternFocus.timeRange?.to || '23:59'))
    }
    lines.push('  Piezas en foco: ' + p.patternFocus.filteredTotalPieces.toLocaleString())

    if (p.patternFocus.distributionByCalibre.length > 0) {
      lines.push('  Distribución por calibre (foco):')
      for (const c of p.patternFocus.distributionByCalibre) {
        lines.push('    - ' + c.key + ': ' + c.pieces + ' pz (' + c.pct + '%)')
      }
    }

    if (p.patternFocus.distributionByQuality.length > 0) {
      lines.push('  Distribución por calidad (foco):')
      for (const q of p.patternFocus.distributionByQuality) {
        lines.push('    - ' + q.key + ': ' + q.pieces + ' pz (' + q.pct + '%)')
      }
    }

    if (p.patternFocus.hourlyDistribution && p.patternFocus.hourlyDistribution.length > 0) {
      lines.push('  Distribución horaria (foco):')
      for (const h of p.patternFocus.hourlyDistribution) {
        lines.push('    - ' + h.hour + ': ' + h.pieces + ' pz (' + h.pct + '%)')
      }
    }
  }

  lines.push('')
  lines.push('=== COMPLETITUD DE DATOS ===')
  lines.push('  Pieza-pieza: ' + (p.dataCompleteness.hasPieceRecords ? 'SÍ' : 'NO'))
  lines.push('  Gate 0 records: ' + (p.dataCompleteness.hasGate0Records ? 'SÍ' : 'NO'))
  lines.push('  Resumen calidad: ' + (p.dataCompleteness.hasQualitySummary ? 'SÍ' : 'NO'))
  if (p.dataCompleteness.notes.length > 0) {
    lines.push('  Notas: ' + p.dataCompleteness.notes.join('; '))
  }

  lines.push('')
  lines.push('Analiza estos datos como analista estadístico senior. Responde SOLO JSON.')
  return lines.join('\n')
}

async function callGroqAPI(userPrompt: string): Promise<string> {
  // 1. Try Cloud Function proxy (API key secure on server)
  try {
    const { httpsCallable, getFunctions } = await import('firebase/functions')
    const firebaseApp = (await import('@/services/firebase')).default
    const functions = getFunctions(firebaseApp)
    const groqProxy = httpsCallable(functions, 'groqProxy')

    const result = await groqProxy({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 3000,
    })
    const data = result.data as { content: string }
    if (data.content) return data.content
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('not-found') && !msg.includes('NOT_FOUND') && !msg.includes('not found')) {
      console.warn('Cloud Function groqProxy error, trying direct:', msg)
    }
  }

  // 2. Fallback: direct API call
  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
  if (!GROQ_API_KEY) {
    throw new Error('IA no configurada: ni Cloud Function ni API key disponible. Configura VITE_GROQ_API_KEY en .env')
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GROQ_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error('Groq API error ' + response.status + ': ' + errBody.slice(0, 200))
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// ============================================================================
// FALLBACK MOCK (cuando no hay API key ni Cloud Function)
// ============================================================================

class MockAIProvider implements AIProvider {
  async analyzeGrader(payload: AIGraderInput): Promise<AIGraderOutput> {
    await new Promise((r) => setTimeout(r, 800))

    const { kpis, distributions, gateBalance } = payload

    const summaryBullets: string[] = [
      'Se procesaron ' + kpis.totalPieces.toLocaleString() + ' piezas.',
      'Punto Cero: ' + kpis.pointZeroPieces.toLocaleString() + ' (' + kpis.pointZeroPct + '%).',
    ]
    if (kpis.dominantCalibre) summaryBullets.push('Calibre dominante: ' + kpis.dominantCalibre.calibre + ' (' + kpis.dominantCalibre.pct + '%).')
    if (kpis.dominantQuality) summaryBullets.push('Calidad dominante: ' + kpis.dominantQuality.quality + ' (' + kpis.dominantQuality.pct + '%).')

    const likelyCauses: AIGraderOutput['likelyCauses'] = []
    const recommendedActions: AIGraderOutput['recommendedActions'] = []

    if (kpis.pointZeroPct > 2) {
      const topError = distributions.pointZeroByError[0]
      likelyCauses.push({
        cause: 'Punto Cero elevado',
        confidence: kpis.pointZeroPct > 5 ? 'high' : 'medium',
        evidence: [
          'P.Cero en ' + kpis.pointZeroPct + '%',
          topError ? 'Error principal: "' + topError.error + '" (' + topError.pct + '%)' : 'Sin desglose',
        ],
      })
    }

    const criticalGates = gateBalance.filter((g) => g.severity === 'critical')
    if (criticalGates.length > 0) {
      likelyCauses.push({
        cause: 'Desbalance gates',
        confidence: 'high',
        evidence: criticalGates.map(g => g.calibre + ': ' + g.demandPct + '% demanda, ' + g.gatesAssigned + ' gates'),
      })
      recommendedActions.push({
        action: 'Reasignar gates para ' + criticalGates.map(g => g.calibre).join(', '),
        priority: 'high',
        why: 'Calibres con alta demanda tienen pocos gates.',
      })
    }

    return {
      version: '1.0',
      summaryBullets,
      likelyCauses,
      recommendedActions,
      whatToCheckNext: ['Verificar fotocélulas', 'Revisar rangos en Matrix', 'Comparar con turnos anteriores'],
      disclaimers: [
        '⚠ Análisis generado sin IA real (modo local).',
        'Configura VITE_GROQ_API_KEY para obtener diagnóstico profesional con IA.',
      ],
    }
  }
}

// ============================================================================
// SINGLETON — siempre intenta Groq primero (Cloud Function o directo)
// ============================================================================

let currentProvider: AIProvider = new GroqAIProvider()

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
  try {
    return await currentProvider.analyzeGrader(payload)
  } catch (err) {
    // If Groq fails (no key, no cloud function), fall back to mock
    console.warn('Groq AI failed, falling back to mock:', err instanceof Error ? err.message : err)
    const mock = new MockAIProvider()
    return mock.analyzeGrader(payload)
  }
}

/**
 * Valida que la respuesta de IA cumpla con AIGraderOutput.
 * Si el modelo retorna texto no-JSON, intenta extraer JSON.
 */
export function parseAIResponse(raw: string): { parsed?: AIGraderOutput; error?: string; rawText?: string } {
  // Try direct parse
  try {
    const obj = JSON.parse(raw)
    if (obj && Array.isArray(obj.summaryBullets)) {
      return { parsed: { ...obj, version: '1.0' } as AIGraderOutput }
    }
    return { error: 'Respuesta JSON no cumple con el esquema AIGraderOutput.', rawText: raw }
  } catch {
    // Try to extract JSON from markdown code block or text
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
