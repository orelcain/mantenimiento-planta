import { logger } from '@/lib/logger'
import { httpsCallable } from 'firebase/functions'
import type { Incident, Equipment, AIAnalysis, PredictiveThresholds } from '@/types'
import type { SensorReading, SensorSummaryNode } from '@/services/sensorsRtdb'

// ─── Rate Limit Error con tiempo de espera ──────────────────────────
export class RateLimitError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number, provider: string) {
    super(`Rate limit de ${provider} alcanzado`)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

/** Parsea Retry-After header (segundos o fecha) y devuelve ms a esperar */
function parseRetryAfter(response: Response): number {
  const header = response.headers.get('Retry-After') || response.headers.get('retry-after')
  if (!header) return 60_000 // default 60s
  const secs = Number(header)
  if (!isNaN(secs)) return Math.max(secs * 1000, 5_000)
  const date = Date.parse(header)
  if (!isNaN(date)) return Math.max(date - Date.now(), 5_000)
  return 60_000
}

// Modelo por defecto (usado como parámetro a Cloud Functions, no para llamadas directas)
const MODEL = 'llama-3.3-70b-versatile'

// Las API keys ya NO se usan en el cliente — todo pasa por Cloud Functions
// Estas constantes se mantienen SOLO para referencia interna (convertToGeminiFormat, etc.)
const GEMINI_API_KEY = '' // BLOQUEADO: usar Cloud Function geminiProxy
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`

// Cloud Functions siempre disponibles si están deployadas
export const isAIConfigured = () => true
export const isGeminiConfigured = () => true

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

  // Seguridad: NO hacer fallback directo con API key en cliente
  throw new Error('IA no disponible: Cloud Function groqProxy no configurada. Contacta al administrador.')
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
  // Seguridad: streaming no disponible via Cloud Function, usar non-streaming
  const result = await callGroq(messages, opts)
  onChunk(result.content)
  return result
}

// Direct API calls REMOVED for security — all AI calls go through Cloud Functions

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
  opts?: { temperature?: number; max_tokens?: number; thinkingBudget?: number },
): Promise<{ content: string; tokens: number }> {
  // Seguridad: usar Cloud Function proxy (key nunca llega al browser)
  try {
    const { getFunctions } = await import('firebase/functions')
    const { default: app } = await import('@/services/firebase')
    const functions = getFunctions(app)
    const geminiProxyFn = httpsCallable(functions, 'geminiProxy')

    const { systemInstruction } = convertToGeminiFormat(messages)

    const result = await geminiProxyFn({
      messages,
      model: 'gemini-2.5-flash',
      temperature: opts?.temperature ?? 0.1,
      max_tokens: opts?.max_tokens || 2048,
      systemInstruction: systemInstruction?.parts?.[0]?.text,
    })
    const data = result.data as { content: string; usage?: { totalTokenCount?: number } }
    return { content: data.content, tokens: data.usage?.totalTokenCount || 0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not-found') || msg.includes('NOT_FOUND')) {
      throw new Error('IA Gemini no disponible: Cloud Function geminiProxy no desplegada.')
    }
    throw err
  }
}

/**
 * Gemini Vision — análisis multimodal de imágenes
 * Envía una o más imágenes como base64 junto con un prompt de texto
 */
export async function callGeminiVision(
  imageUrls: string[],
  prompt: string,
  opts?: { temperature?: number; max_tokens?: number; thinkingBudget?: number },
): Promise<{ content: string; tokens: number }> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured')

  // Descargar imágenes y convertir a base64
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = []
  for (const url of imageUrls.slice(0, 3)) {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const mimeType = blob.type || 'image/jpeg'
      const buffer = await blob.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      imageParts.push({ inlineData: { mimeType, data: base64 } })
    } catch {
      // Skip failed image downloads
    }
  }

  if (imageParts.length === 0) {
    return { content: 'No se pudieron cargar las imágenes para análisis.', tokens: 0 }
  }

  const generationConfigVision: Record<string, unknown> = {
    temperature: opts?.temperature ?? 0.3,
    maxOutputTokens: opts?.max_tokens || 1024,
  }
  if (opts?.thinkingBudget && opts.thinkingBudget > 0) {
    generationConfigVision.thinkingConfig = { thinkingBudget: opts.thinkingBudget }
  }

  const body = {
    contents: [{
      parts: [
        ...imageParts,
        { text: prompt },
      ],
    }],
    generationConfig: generationConfigVision,
  }

  const response = await fetch(
    `${GEMINI_API_URL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError(parseRetryAfter(response), 'Gemini')
    }
    const errText = await response.text().catch(() => '')
    throw new Error(`Gemini Vision error: ${response.status} ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const tokens = data.usageMetadata?.totalTokenCount || 0
  return { content: text, tokens }
}

/**
 * Gemini Stream — redirigido a Cloud Function (non-streaming seguro)
 */
export async function callGeminiStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  opts?: { temperature?: number; max_tokens?: number; thinkingBudget?: number },
): Promise<{ content: string; tokens: number }> {
  // Seguridad: streaming via proxy no soportado, usamos non-streaming
  const result = await callGemini(messages, opts)
  onChunk(result.content)
  return result
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

// ===== CAPTURA RÁPIDA DE INTERVENCIÓN (Análisis de Turno · Fase 3) =====

export type InterventionTipo = 'correctivo' | 'preventivo' | 'predictivo' | 'inspeccion'
export type InterventionSeveridad = 'verde' | 'amarillo' | 'rojo'

export interface InterventionSuggestion {
  titulo: string
  tipo: InterventionTipo
  severidad: InterventionSeveridad
}

/**
 * Desde el relato de una intervención (dictado/limpiado), sugiere campos
 * estructurados para `maintenanceLog`: título conciso, tipo de mantención y
 * condición/severidad (1/2/3 → verde/amarillo/rojo). Todo editable por el
 * técnico antes de guardar. Robusto: ante fallo devuelve un default neutro.
 */
export async function suggestInterventionFields(hallazgo: string): Promise<InterventionSuggestion | null> {
  if (!isAIConfigured() || !hallazgo || hallazgo.trim().length < 8) return null

  try {
    const prompt = `Eres un planificador de mantenimiento industrial. A partir del relato de una intervención de mantención en planta, devuelve campos estructurados.

Relato: "${hallazgo}"

Reglas:
- "titulo": frase técnica MUY concisa (máx 6 palabras), formato falla/acción + componente. Ej: "Cambio de rodamiento en bomba".
- "tipo": uno de correctivo | preventivo | predictivo | inspeccion.
   · correctivo = se reparó/atendió una falla ya ocurrida.
   · preventivo = mantención planificada para evitar falla (lubricación, cambio por horas).
   · predictivo = medición/diagnóstico de condición (vibración, termografía, análisis).
   · inspeccion = revisión/chequeo sin intervención mayor.
- "severidad": condición resultante. verde = sin riesgo / resuelto; amarillo = atención / seguimiento; rojo = crítico / equipo comprometido.

Responde SOLO con JSON:
{"titulo": "...", "tipo": "correctivo", "severidad": "verde"}`

    const { content } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 200 }
    )
    const jsonStr = (content || '{}').replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(jsonStr) as Partial<InterventionSuggestion>

    const tipos: InterventionTipo[] = ['correctivo', 'preventivo', 'predictivo', 'inspeccion']
    const sevs: InterventionSeveridad[] = ['verde', 'amarillo', 'rojo']
    return {
      titulo: (parsed.titulo || '').toString().replace(/^"|"$/g, '').replace(/\.$/, '').trim(),
      tipo: tipos.includes(parsed.tipo as InterventionTipo) ? (parsed.tipo as InterventionTipo) : 'correctivo',
      severidad: sevs.includes(parsed.severidad as InterventionSeveridad) ? (parsed.severidad as InterventionSeveridad) : 'amarillo',
    }
  } catch (error) {
    logger.error('Error sugiriendo campos de intervención con IA:', error instanceof Error ? error : new Error(String(error)))
    return null
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
