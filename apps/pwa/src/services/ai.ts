import { logger } from '@/lib/logger'
import { httpsCallable } from 'firebase/functions'
import type { Incident, Equipment, AIAnalysis, PredictiveThresholds } from '@/types'
import type { SensorReading, SensorSummaryNode } from '@/services/sensorsRtdb'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile' // Gratis, 14,400 req/día

// ─── Gemini 2.0 Flash (Google) — Gratis: 15 RPM, 1500 RPD ──────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''
const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`

export const isAIConfigured = () => !!GROQ_API_KEY || !!GEMINI_API_KEY || useCloudProxy;
export const isGeminiConfigured = () => !!GEMINI_API_KEY

// Intentar usar Cloud Function proxy (más seguro, key no expuesta)
let useCloudProxy = true
let groqProxyFn: ReturnType<typeof httpsCallable> | null = null

async function getGroqProxy() {
  if (groqProxyFn) return groqProxyFn
  try {
    const { getFunctions } = await import('firebase/functions')
    const { default: app } = await import('@/services/firebase')
    const functions = getFunctions(app)
    groqProxyFn = httpsCallable(functions, 'groqProxy')
    return groqProxyFn
  } catch {
    useCloudProxy = false
    return null
  }
}

/**
 * Llamada centralizada a Groq: primero intenta Cloud Function, luego directo
 */
export async function callGroq(messages: Array<{ role: string; content: string }>, opts?: { temperature?: number; max_tokens?: number }): Promise<{ content: string; tokens: number }> {
  // Intentar Cloud Function proxy (API key segura en server)
  if (useCloudProxy) {
    try {
      const proxy = await getGroqProxy()
      if (proxy) {
        const result = await proxy({ messages, model: MODEL, temperature: opts?.temperature ?? 0.3, max_tokens: opts?.max_tokens || 2048 })
        const data = result.data as { content: string; usage?: { total_tokens?: number } }
        return { content: data.content, tokens: data.usage?.total_tokens || 0 }
      }
    } catch (err: unknown) {
      // Si falla (Cloud Function no deployada o error), fallback a llamada directa
      const errorMsg = err instanceof Error ? err.message : String(err)
      if (
        errorMsg.includes('not-found') || errorMsg.includes('NOT_FOUND') || errorMsg.includes('not found') ||
        errorMsg.includes('internal') || errorMsg.includes('INTERNAL') ||
        errorMsg.includes('unavailable') || errorMsg.includes('UNAVAILABLE') ||
        errorMsg.includes('500') || errorMsg.includes('503') || errorMsg.includes('deadline-exceeded')
      ) {
        useCloudProxy = false
        logger.info('Cloud Function groqProxy no disponible, usando llamada directa')
      } else {
        throw err
      }
    }
  }

  // Fallback: llamada directa (API key en cliente)
  if (!GROQ_API_KEY) {
    throw new Error('IA no configurada: ni Cloud Function ni API key disponible')
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.max_tokens || 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`)
  }

  const data = await response.json()
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: data.usage?.total_tokens || 0,
  }
}

/**
 * Streaming version of callGroq — calls onChunk with each text delta
 * Falls back to non-streaming if Cloud Function is used
 */
export async function callGroqStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  opts?: { temperature?: number; max_tokens?: number }
): Promise<{ content: string; tokens: number }> {
  // If no direct API key, fall back to non-streaming
  if (!GROQ_API_KEY) {
    const result = await callGroq(messages, opts)
    onChunk(result.content)
    return result
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.max_tokens || 2048,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No readable stream available')
  }

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          fullContent += delta
          onChunk(fullContent)
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return { content: fullContent, tokens: 0 }
}

// ─── Gemini 2.0 Flash ───────────────────────────────────────────────

/**
 * Convierte array de mensajes estilo OpenAI a formato Gemini
 */
function convertToGeminiFormat(messages: Array<{ role: string; content: string }>) {
  const systemParts: string[] = []
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content)
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })
    }
  }

  // Gemini requiere que contents alterne user/model y empiece con user
  // Si hay dos mensajes seguidos del mismo rol, combinarlos
  const merged: Array<{ role: string; parts: Array<{ text: string }> }> = []
  for (const c of contents) {
    const last = merged[merged.length - 1]
    if (last && last.role === c.role) {
      last.parts.push(...c.parts)
    } else {
      merged.push({ ...c, parts: [...c.parts] })
    }
  }

  return {
    systemInstruction: systemParts.length > 0
      ? { parts: [{ text: systemParts.join('\n\n') }] }
      : undefined,
    contents: merged,
  }
}

/**
 * Llamada a Gemini 2.0 Flash (non-streaming) — para razonamiento y análisis
 */
export async function callGemini(
  messages: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; max_tokens?: number },
): Promise<{ content: string; tokens: number }> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured')

  const { systemInstruction, contents } = convertToGeminiFormat(messages)

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts?.temperature ?? 0.1,
      maxOutputTokens: opts?.max_tokens || 1024,
    },
  }
  if (systemInstruction) body.systemInstruction = systemInstruction

  const response = await fetch(
    `${GEMINI_API_URL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Gemini API error: ${response.status} ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const tokens = data.usageMetadata?.totalTokenCount || 0
  return { content: text, tokens }
}

/**
 * Streaming Gemini 2.0 Flash — para respuestas principales
 */
export async function callGeminiStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  opts?: { temperature?: number; max_tokens?: number },
): Promise<{ content: string; tokens: number }> {
  if (!GEMINI_API_KEY) {
    // Fallback a Groq si no hay Gemini configurado
    return callGroqStream(messages, onChunk, opts)
  }

  const { systemInstruction, contents } = convertToGeminiFormat(messages)

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts?.temperature ?? 0.3,
      maxOutputTokens: opts?.max_tokens || 2048,
    },
  }
  if (systemInstruction) body.systemInstruction = systemInstruction

  const response = await fetch(
    `${GEMINI_API_URL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Gemini stream error: ${response.status} ${errText.slice(0, 200)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No readable stream available')

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const delta = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (delta) {
          fullContent += delta
          onChunk(fullContent)
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return { content: fullContent, tokens: 0 }
}

export type SensorForecast = {
  riesgo: 'bajo' | 'medio' | 'alto' | 'critico'
  confianza: number
  resumen: string
  recomendacion: string
}

export type ThresholdSuggestion = PredictiveThresholds

// ===== GENERACIÓN DE SÍNTOMAS CONTEXTUALES =====

export async function generateSymptoms(equipment: Equipment): Promise<string[]> {
  if (!isAIConfigured()) {
    logger.warn('IA no configurada, usando síntomas estáticos')
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

    const { content, tokens } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 500 }
    )
    
    const symptoms = JSON.parse(content || '[]')
    symptoms.push('Otro') // Siempre agregar opción "Otro"

    // Guardar análisis
    await saveAIAnalysis({
      equipmentId: equipment.id,
      analysisType: 'symptom_suggestion',
      input: { equipmentName: equipment.nombre },
      output: symptoms,
      confidence: 0.9,
      model: MODEL,
      tokens,
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
  if (!isAIConfigured() || incidents.length < 5) {
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

    const { content, tokens } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2, max_tokens: 1500 }
    )
    const result = JSON.parse(content || '{}')

    await saveAIAnalysis({
      analysisType: 'pattern_detection',
      input: { incidentCount: incidents.length },
      output: result,
      confidence: result.confidence || 0,
      model: MODEL,
      tokens,
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
  if (!isAIConfigured()) return null
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

    const { content, tokens } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2, max_tokens: 600 }
    )
    const result = JSON.parse(content || '{}') as SensorForecast

    await saveAIAnalysis({
      equipmentId: params.equipment.id,
      analysisType: 'prediction',
      input: payload,
      output: result,
      confidence: result.confianza || 0,
      model: MODEL,
      tokens,
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
  if (!isAIConfigured()) return null
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

    const { content, tokens } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2, max_tokens: 700 }
    )
    const result = JSON.parse(content || '{}') as ThresholdSuggestion

    await saveAIAnalysis({
      equipmentId: params.equipment.id,
      analysisType: 'prediction',
      input: payload,
      output: result,
      confidence: 0.7,
      model: MODEL,
      tokens,
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
  if (!isAIConfigured() || historicalData.length < 3) return null

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

    const { content, tokens } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 800 }
    )
    const result = JSON.parse(content || 'null')

    await saveAIAnalysis({
      equipmentId,
      analysisType: 'prediction',
      input: { dataPoints: historicalData.length },
      output: result,
      confidence: result.confidence || 0,
      model: MODEL,
      tokens,
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
  if (!isAIConfigured() || incidents.length < 3) {
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

    const { content, tokens } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2, max_tokens: 1200 }
    )
    const result = JSON.parse(content || '{}')

    await saveAIAnalysis({
      analysisType: 'root_cause',
      input: { incidentCount: incidents.length },
      output: result,
      confidence: result.confidence || 0,
      model: MODEL,
      tokens,
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

// Extender refineText para soportar contexto de transcripción
export async function refineText(text: string, isTranscriptionCleanup = false): Promise<string> {
  if (!isAIConfigured()) {
    logger.warn('IA no configurada para refineText.')
    return text
  }
  if (!text || text.length < 3) {
    return text
  }

  try {
    const prompt = isTranscriptionCleanup 
      ? `Eres un experto técnico industrial.
Tu tarea es corregir la transcripción de voz a texto de un reporte de mantenimiento.
El texto original puede tener errores fonéticos, palabras mal interpretadas o muletillas dado que fue dictado.
1. Corrije los errores técnicos (Ej: "bomba centriguga" -> "bomba centrífuga").
2. Hazlo CONCISO y PRECISO.
3. Mantén el sentido original pero con lenguaje profesional.
4. NO agregues introducciones ni explicaciones.
5. NO uses comillas.

Texto original transcrito: "${text}"

Responde SOLO con el texto corregido.`
      : `Eres un redactor técnico industrial SENIOR.
Tu tarea es generar un TÍTULO o DESCRIPCIÓN para un reporte de falla técnica.
Debe ser EXTREMADAMENTE CONCISO, DIRECTO y PROFESIONAL.
Evita verbos pasivos. Usa formato sujeto + falla o falla + componente.
Ejemplos buenos: "Fuga de aceite en motor", "Rodamiento atascado", "Vibración excesiva eje X".
Ejemplos malos: "Me parece que la maquina esta sonando mal", "Problema con el aceite".

Texto base: "${text}"

Responde SOLO con el texto técnico mejorado. Sin comillas ni puntos finales.`

    const { content } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 300 }
    )
    let refined = content?.trim() || text
    // Limpieza extra
    refined = refined.replace(/^"|"$/g, '').replace(/\.$/, '')
    
    return refined

  } catch (error) {
    logger.error('Error refinando texto con IA:', error instanceof Error ? error : new Error(String(error)))
    return text
  }
}

// ===== EXTRACCIÓN DE SÍNTOMAS DESDE DESCRIPCIÓN =====

// Extender input para considerar todo el contexto
export async function extractSymptomsFromDescription(
  description: string, 
  knownSymptoms?: string[],
  context?: {
    title?: string
    priority?: string
    equipmentName?: string
    locationName?: string
  }
): Promise<string[]> {
  if (!isAIConfigured()) {
    return []
  }

  if (!description || description.length < 10) return []

  try {
    const contextPrompt = context 
    ? `
Contexto Adicional:
- Título: ${context.title || 'N/A'}
- Prioridad: ${context.priority || 'N/A'}
- Equipo/Ubicación: ${context.equipmentName || context.locationName || 'N/A'}
` : ''

    const prompt = `Como experto técnico senior en diagnóstico de fallas industriales (RCA), analiza la siguiente descripción y extrae los síntoma raíz o modos de falla físicos.

Entrada: "${description}"
${contextPrompt}

Reglas estrictas:
1. Sé extremadamente técnico, preciso y conciso (máx 3 palabras por síntoma).
2. Evita términos vagos como "fallo", "problema", "mal funcionamiento". Usa el síntoma físico observable.
3. Si el texto implica una consecuencia (ej: "se paró la línea"), deduce la causa física probable si hay contexto (ej: "Bloqueo mecánico", "Falla eléctrica").
4. Normaliza los términos (ej: "ruido raro" -> "Ruido anormal", "vibradera" -> "Vibración excesiva").
5. Responde SOLO con un array JSON de strings.

Síntomas Conocidos (prioriza estos si aplican):
${knownSymptoms ? JSON.stringify(knownSymptoms) : 'Ninguno'}

Ejemplo Salida: ["Fuga de refrigerante", "Sobrecalentamiento motor"]`

    const { content } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 300 }
    )
    
    // Limpieza básica por si el modelo incluye markdown
    const jsonStr = (content || '[]').replace(/```json/g, '').replace(/```/g, '').trim()
    
    return JSON.parse(jsonStr)

  } catch (error) {
    logger.error('Error extrayendo síntomas con IA:', error instanceof Error ? error : new Error(String(error)))
    return []
  }
}
