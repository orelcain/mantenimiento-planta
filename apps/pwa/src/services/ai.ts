import { logger } from '@/lib/logger'
import type { Incident, Equipment, AIAnalysis, PredictiveThresholds } from '@/types'
import type { SensorReading, SensorSummaryNode } from '@/services/sensorsRtdb'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile' // Gratis, 14,400 req/día

export const isAIConfigured = () => !!GROQ_API_KEY;

export type SensorForecast = {
  riesgo: 'bajo' | 'medio' | 'alto' | 'critico'
  confianza: number
  resumen: string
  recomendacion: string
}

export type ThresholdSuggestion = PredictiveThresholds

// ===== GENERACIÓN DE SÍNTOMAS CONTEXTUALES =====

export async function generateSymptoms(equipment: Equipment): Promise<string[]> {
  if (!GROQ_API_KEY) {
    logger.warn('GROQ_API_KEY no configurada, usando síntomas estáticos')
    return [
      'Vibración anormal',
      'Ruido inusual',
      'Calentamiento excesivo',
      'Fuga de fluido',
      'No arranca',
      'Otro'
    ]
  }

  try {
    const prompt = `Eres un experto en mantenimiento industrial. Genera una lista de 8-10 síntomas comunes para este equipo:

Equipo: ${equipment.nombre}
Tipo: ${equipment.descripcion || 'N/A'}
Marca: ${equipment.marca || 'N/A'}
Modelo: ${equipment.modelo || 'N/A'}

Responde SOLO con una lista JSON de strings, sin explicación adicional.
Ejemplo: ["Vibración excesiva", "Ruido anormal", ...]`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || '[]'
    
    const symptoms = JSON.parse(content)
    symptoms.push('Otro') // Siempre agregar opción "Otro"

    // Guardar análisis
    await saveAIAnalysis({
      equipmentId: equipment.id,
      analysisType: 'symptom_suggestion',
      input: { equipmentName: equipment.nombre },
      output: symptoms,
      confidence: 0.9,
      model: MODEL,
      tokens: data.usage?.total_tokens || 0,
      createdAt: new Date(),
    })

    return symptoms
  } catch (error) {
    logger.error('Error generando síntomas con IA:', error instanceof Error ? error : new Error(String(error)))
    return [
      'Vibración anormal',
      'Ruido inusual',
      'Calentamiento excesivo',
      'Fuga de fluido',
      'No arranca',
      'Otro'
    ]
  }
}

// ===== ANÁLISIS DE PATRONES RECURRENTES =====

export async function analyzeRecurrentIssues(incidents: Incident[]): Promise<{
  patterns: Array<{
    description: string
    frequency: number
    equipmentIds: string[]
    recommendation: string
  }>
  confidence: number
}> {
  if (!GROQ_API_KEY || incidents.length < 5) {
    return { patterns: [], confidence: 0 }
  }

  try {
    const summary = incidents.map(inc => ({
      equipment: inc.equipmentId || 'N/A',
      symptoms: inc.sintomas?.join(', ') || 'N/A',
      description: inc.descripcion,
      type: inc.tipo,
      date: inc.createdAt,
    }))

    const prompt = `Eres un experto en análisis de mantenimiento predictivo. Analiza estos incidentes y detecta patrones recurrentes:

${JSON.stringify(summary, null, 2)}

Identifica:
1. Equipos con fallas repetitivas
2. Síntomas que se repiten
3. Correlaciones entre mantenimientos

Responde SOLO con JSON:
{
  "patterns": [
    {
      "description": "Descripción del patrón",
      "frequency": número de veces que ocurre,
      "equipmentIds": ["id1", "id2"],
      "recommendation": "Acción preventiva recomendada"
    }
  ],
  "confidence": 0.0-1.0
}`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`)

    const data = await response.json()
    const result = JSON.parse(data.choices[0]?.message?.content || '{}')

    await saveAIAnalysis({
      analysisType: 'pattern_detection',
      input: { incidentCount: incidents.length },
      output: result,
      confidence: result.confidence || 0,
      model: MODEL,
      tokens: data.usage?.total_tokens || 0,
      createdAt: new Date(),
    })

    return result
  } catch (error) {
    logger.error('Error analizando patrones:', error instanceof Error ? error : new Error(String(error)))
    return { patterns: [], confidence: 0 }
  }
}

// ===== PREDICCIÓN IA DESDE LECTURAS IoT =====

export async function predictSensorForecast(params: {
  equipment: Equipment
  summary: SensorSummaryNode | null
  readings: SensorReading[]
}): Promise<SensorForecast | null> {
  if (!GROQ_API_KEY) return null
  if (!params.readings || params.readings.length < 5) return null

  try {
    const last = params.readings[params.readings.length - 1]
    const payload = {
      equipment: {
        id: params.equipment.id,
        nombre: params.equipment.nombre,
        codigo: params.equipment.codigo,
      },
      summary: {
        online: params.summary?.online ?? null,
        lastSeen: params.summary?.lastSeen ?? null,
      },
      lastReading: last,
      recent: params.readings.slice(-20),
    }

    const prompt = `Eres un analista de mantenimiento predictivo. Con base en las últimas lecturas de un sensor, estima riesgo y recomendación.

Datos:
${JSON.stringify(payload, null, 2)}

Responde SOLO con JSON:
{
  "riesgo": "bajo|medio|alto|critico",
  "confianza": 0.0-1.0,
  "resumen": "Resumen breve",
  "recomendacion": "Acción sugerida"
}`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 600,
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const data = await response.json()
    const result = JSON.parse(data.choices[0]?.message?.content || '{}') as SensorForecast

    await saveAIAnalysis({
      equipmentId: params.equipment.id,
      analysisType: 'prediction',
      input: payload,
      output: result,
      confidence: result.confianza || 0,
      model: MODEL,
      tokens: data.usage?.total_tokens || 0,
      createdAt: new Date(),
    })

    return result
  } catch (error) {
    logger.error('Error generando predicción IA:', error instanceof Error ? error : new Error(String(error)))
    return null
  }
}

// ===== SUGERIR UMBRALES PREDICTIVOS =====

export async function suggestPredictiveThresholds(params: {
  equipment: Equipment
  readings: SensorReading[]
}): Promise<ThresholdSuggestion | null> {
  if (!GROQ_API_KEY) return null
  if (!params.readings || params.readings.length < 10) return null

  try {
    const payload = {
      equipment: {
        id: params.equipment.id,
        nombre: params.equipment.nombre,
        codigo: params.equipment.codigo,
      },
      recent: params.readings.slice(-30),
    }

    const prompt = `Eres un analista de mantenimiento predictivo. Sugiere umbrales para temperatura/humedad y tendencias (por minuto). Usa valores numéricos realistas para sensores industriales. Devuelve JSON.

Datos:
${JSON.stringify(payload, null, 2)}

Responde SOLO con JSON:
{
  "tempWarnLow": number,
  "tempWarnHigh": number,
  "tempCritLow": number,
  "tempCritHigh": number,
  "humWarnLow": number,
  "humWarnHigh": number,
  "humCritLow": number,
  "humCritHigh": number,
  "tempSlopeWarn": number,
  "tempSlopeCrit": number,
  "humSlopeWarn": number,
  "humSlopeCrit": number,
  "offlineMs": number
}`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 700,
      }),
    })

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`)

    const data = await response.json()
    const result = JSON.parse(data.choices[0]?.message?.content || '{}') as ThresholdSuggestion

    await saveAIAnalysis({
      equipmentId: params.equipment.id,
      analysisType: 'prediction',
      input: payload,
      output: result,
      confidence: 0.7,
      model: MODEL,
      tokens: data.usage?.total_tokens || 0,
      createdAt: new Date(),
    })

    return result
  } catch (error) {
    logger.error('Error sugiriendo umbrales IA:', error instanceof Error ? error : new Error(String(error)))
    return null
  }
}

// ===== PREDICCIÓN DE FALLAS =====

export async function predictNextFailure(
  equipmentId: string,
  historicalData: any[]
): Promise<{
  probability: number
  estimatedDays: number
  confidence: number
  recommendation: string
} | null> {
  if (!GROQ_API_KEY || historicalData.length < 3) return null

  try {
    const prompt = `Analiza este histórico de mantenimiento y predice cuándo podría ocurrir la próxima falla:

${JSON.stringify(historicalData, null, 2)}

Responde SOLO con JSON:
{
  "probability": 0.0-1.0,
  "estimatedDays": número de días hasta próxima falla estimada,
  "confidence": 0.0-1.0,
  "recommendation": "Acción recomendada"
}`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 800,
      }),
    })

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`)

    const data = await response.json()
    const result = JSON.parse(data.choices[0]?.message?.content || 'null')

    await saveAIAnalysis({
      equipmentId,
      analysisType: 'prediction',
      input: { dataPoints: historicalData.length },
      output: result,
      confidence: result.confidence || 0,
      model: MODEL,
      tokens: data.usage?.total_tokens || 0,
      createdAt: new Date(),
    })

    return result
  } catch (error) {
    logger.error('Error prediciendo fallas:', error instanceof Error ? error : new Error(String(error)))
    return null
  }
}

// ===== ANÁLISIS DE CAUSA RAÍZ =====

export async function analyzeRootCause(incidents: Incident[]): Promise<{
  rootCause: string
  solution: string
  estimatedCost: number
  estimatedSavings: number
  confidence: number
}> {
  if (!GROQ_API_KEY || incidents.length < 3) {
    return {
      rootCause: 'Datos insuficientes para análisis',
      solution: 'Recopilar más información',
      estimatedCost: 0,
      estimatedSavings: 0,
      confidence: 0,
    }
  }

  try {
    const summary = incidents.map(inc => ({
      equipment: inc.equipmentId || 'N/A',
      symptoms: inc.sintomas?.join(', ') || 'N/A',
      description: inc.descripcion,
      resolution: inc.resolucion,
      date: inc.createdAt,
    }))

    const prompt = `Eres un experto en análisis de causa raíz (RCA) industrial. Analiza estos incidentes recurrentes y encuentra la CAUSA RAÍZ real (no solo síntomas):

${JSON.stringify(summary, null, 2)}

Identifica:
1. Causa raíz profunda (no superficial)
2. Solución permanente (no parches)
3. Costo estimado de implementar solución
4. Ahorro anual estimado eliminando recurrencias

Responde SOLO con JSON:
{
  "rootCause": "Causa raíz identificada",
  "solution": "Solución permanente detallada",
  "estimatedCost": número en USD,
  "estimatedSavings": ahorro anual en USD,
  "confidence": 0.0-1.0
}`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    })

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`)

    const data = await response.json()
    const result = JSON.parse(data.choices[0]?.message?.content || '{}')

    await saveAIAnalysis({
      analysisType: 'root_cause',
      input: { incidentCount: incidents.length },
      output: result,
      confidence: result.confidence || 0,
      model: MODEL,
      tokens: data.usage?.total_tokens || 0,
      createdAt: new Date(),
    })

    return result
  } catch (error) {
    logger.error('Error analizando causa raíz:', error instanceof Error ? error : new Error(String(error)))
    return {
      rootCause: 'Error en análisis',
      solution: 'Revisar manualmente',
      estimatedCost: 0,
      estimatedSavings: 0,
      confidence: 0,
    }
  }
}

// ===== GUARDAR ANÁLISIS EN FIRESTORE =====

async function saveAIAnalysis(analysis: Omit<AIAnalysis, 'id'>): Promise<void> {
  try {
    // Implementar cuando tengas Firebase configurado
    logger.info('Análisis IA generado:', analysis)
  } catch (error) {
    logger.error('Error guardando análisis:', error instanceof Error ? error : new Error(String(error)))
  }
}

// ===== REFINAMIENTO DE TEXTO (BOTÓN MÁGICO) =====

export async function refineText(text: string): Promise<string> {
  if (!GROQ_API_KEY) {
    logger.warn('GROQ_API_KEY faltante en refineText.')
    return text
  }
  if (!text || text.length < 5) {
    logger.warn('Texto muy corto para refinar:', text)
    return text
  }

  try {
    const prompt = `Eres un experto técnico industrial.
Reescribe esta descripción para que sea clara, técnica y profesional.
Corrige ortografía y gramática.

Texto original: "${text}"

Responde SOLO con el texto reescrito.`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content?.trim() || text

  } catch (error) {
    logger.error('Error refinando texto con IA:', error instanceof Error ? error : new Error(String(error)))
    return text
  }
}

// ===== EXTRACCIÓN DE SÍNTOMAS DESDE DESCRIPCIÓN =====

export async function extractSymptomsFromDescription(description: string, knownSymptoms?: string[]): Promise<string[]> {
  if (!GROQ_API_KEY) {
    logger.warn('GROQ_API_KEY faltante en extractSymptomsFromDescription.')
    return []
  }
  if (!description || description.length < 10) return []

  try {
    const prompt = `Analiza esta descripción de falla y extrae una lista de síntomas breves.
${knownSymptoms ? 'Considera estos síntomas conocidos: ' + JSON.stringify(knownSymptoms) : ''}

Descripción: "${description}"

Responde SOLO con JSON array: ["Síntoma 1", "Síntoma 2"]`

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || '[]'
    
    // Limpieza básica por si el modelo incluye markdown
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim()
    
    return JSON.parse(jsonStr)

  } catch (error) {
    logger.error('Error extrayendo síntomas con IA:', error instanceof Error ? error : new Error(String(error)))
    return []
  }
}
