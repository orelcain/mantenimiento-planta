import { logger } from '@/lib/logger'
import type { Incident, Equipment, AIAnalysis } from '@/types'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile' // Gratis, 14,400 req/día

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
    logger.error('Error generando síntomas con IA:', error)
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
      equipment: inc.equipmentName,
      symptom: inc.sintoma,
      description: inc.descripcion,
      maintenance: inc.maintenanceType,
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
    logger.error('Error analizando patrones:', error)
    return { patterns: [], confidence: 0 }
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
    logger.error('Error prediciendo fallas:', error)
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
      equipment: inc.equipmentName,
      symptom: inc.sintoma,
      description: inc.descripcion,
      resolution: inc.resolucion,
      cost: inc.costoEstimado || 0,
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
    logger.error('Error analizando causa raíz:', error)
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
    logger.error('Error guardando análisis:', error)
  }
}
