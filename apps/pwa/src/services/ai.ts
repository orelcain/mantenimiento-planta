import { logger } from '@/lib/logger'
import { httpsCallable } from 'firebase/functions'
import type { Incident, Equipment, AIAnalysis, PredictiveThresholds } from '@/types'
import type { SensorReading, SensorSummaryNode } from '@/services/sensorsRtdb'
import { groqNoVaAContestar, conTechoParaGemini } from './ai/groqCaido'

// ─── Rate Limit Error con tiempo de espera ──────────────────────────
export class RateLimitError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number, provider: string) {
    super(`Rate limit de ${provider} alcanzado`)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

// Modelo por defecto (usado como parámetro a Cloud Functions, no para llamadas directas)
const MODEL = 'llama-3.3-70b-versatile'
// OJO: Groq dejó de servir este modelo (404). Mientras no se actualice, cada
// llamada cae en el suplente Gemini — ver `groqNoVaAContestar`.

// Las API keys ya NO se usan en el cliente — todo pasa por Cloud Functions.

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
      // Groq caído: hoy devuelve 404 porque ya no sirve el modelo que se le
      // pide. Antes eso subía tal cual y cada función que dependía de Groq
      // quedaba sin respuesta —`extractSymptomsFromDescription` devolvía `[]`,
      // que en pantalla se ve como "esta descripción no tiene síntomas"—.
      // Gemini ya está configurado y respondiendo: se usa como suplente.
      if (groqNoVaAContestar(err)) {
        logger.warn('Groq no contestó; se responde con Gemini', {
          motivo: err instanceof Error ? err.message : String(err),
        })
        return await callGemini(messages, conTechoParaGemini(opts))
      }

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

  // Sin proxy de Groq queda Gemini, que va por su propia Cloud Function.
  logger.warn('groqProxy no disponible; se responde con Gemini')
  return await callGemini(messages, conTechoParaGemini(opts))
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
 * Llamada a Gemini (non-streaming) — para razonamiento y análisis
 */
export async function callGemini(
  messages: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; max_tokens?: number; thinkingBudget?: number; model?: string },
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
      model: opts?.model || 'gemini-3.5-flash',
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
  // Descargar imágenes en el CLIENTE (son URLs de Storage, no requieren la
  // API key) y convertir a base64 — solo el análisis en sí pasa por el
  // proxy (geminiVisionProxy), que es quien tiene la key real (secret de
  // Cloud Functions, nunca llega al browser).
  const imageParts: Array<{ mimeType: string; data: string }> = []
  for (const url of imageUrls.slice(0, 3)) {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const mimeType = blob.type || 'image/jpeg'
      const buffer = await blob.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      imageParts.push({ mimeType, data: base64 })
    } catch {
      // Skip failed image downloads
    }
  }

  if (imageParts.length === 0) {
    return { content: 'No se pudieron cargar las imágenes para análisis.', tokens: 0 }
  }

  try {
    const { getFunctions } = await import('firebase/functions')
    const { default: app } = await import('@/services/firebase')
    const functions = getFunctions(app)
    const geminiVisionProxyFn = httpsCallable(functions, 'geminiVisionProxy')

    const result = await geminiVisionProxyFn({
      imageParts,
      prompt,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.max_tokens || 1024,
      thinkingBudget: opts?.thinkingBudget,
    })
    const data = result.data as { content: string; usage?: { totalTokenCount?: number } }
    return { content: data.content, tokens: data.usage?.totalTokenCount || 0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not-found') || msg.includes('NOT_FOUND')) {
      throw new Error('Gemini Vision no disponible: Cloud Function geminiVisionProxy no desplegada.')
    }
    throw err
  }
}

/**
 * Gemini Stream — redirigido a Cloud Function (non-streaming seguro)
 */
export async function callGeminiStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  opts?: { temperature?: number; max_tokens?: number; thinkingBudget?: number; model?: string },
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

/**
 * Glosario de términos VÁLIDOS de la planta (áreas, equipos, marcas) que la IA
 * NO debe "corregir" al limpiar transcripciones. Clave para que no cambie
 * "Acopio" (un área) por "acoplamiento", "Yal" por "ya", etc.
 * Ampliar con los nombres reales de equipos a medida que aparezcan.
 */
export const PLANT_GLOSSARY = [
  // Plantas / áreas
  'Acopio', 'Riles', 'Yal', 'Chonchi', 'Eviscerado', 'Filete', 'Empaque',
  'Frigorífico', 'Cámaras', 'Antecámara', 'Sacrificio', 'Emparrillado', 'Túneles',
  'Sala de Máquinas', 'Sala de Caldera', 'Sala de Freón', 'Subestación', 'Pontón',
  'Caseta de Agua de Mar', 'Agua de Mar',
  // Equipos / marcas / términos técnicos
  'Baader', 'Marelec', 'grader', 'fileteadora', 'glaseador', 'enzunchadora',
  'empacadora', 'rodamiento', 'chumacera', 'sello mecánico', 'variador de frecuencia',
  'bomba de agua de mar', 'sistema de bombeo de peces', 'DAF', 'filtro tornillo',
]

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
      ? `Eres un experto técnico de mantenimiento de una planta procesadora de salmón.
Corrige la transcripción de voz a texto de un reporte de mantenimiento (puede tener errores fonéticos o muletillas porque fue dictado).

TÉRMINOS VÁLIDOS DE LA PLANTA — si aparecen (o algo que suene parecido), MANTENLOS tal cual; NO los "corrijas" a otra palabra:
${PLANT_GLOSSARY.join(', ')}.
Ejemplo CRÍTICO: "acopio" es un ÁREA de la planta — NUNCA lo cambies a "acoplamiento".

Reglas:
1. Corrige solo errores fonéticos obvios que NO estén en la lista de arriba (Ej: "bomba centriguga" -> "bomba centrífuga").
2. Conciso y profesional, mantén el sentido original.
3. NO agregues introducciones, explicaciones ni comillas.

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

// ===== ANÁLISIS IA + PREDICTIVO POR ÁREA (Fase 3b) =====

export interface AreaInterventionInput {
  fecha: Date
  tipo: string
  severidad: string
  hallazgo: string
  tecnico?: string
}

export interface AreaInsights {
  resumen: string                 // 1-2 frases del estado de mantención del área
  riesgo: 'bajo' | 'medio' | 'alto' | 'critico'
  patrones: Array<{ descripcion: string; frecuencia: number; recomendacion: string }>
  equiposAVigilar: string[]       // componentes/equipos mencionados de forma recurrente
  proximaAccion: string           // acción preventiva sugerida (RCM)
  confianza: number               // 0..1
}

/** Nº mínimo de intervenciones para que el análisis sea significativo. */
export const MIN_AREA_INTERVENTIONS = 3

/**
 * Análisis RCM/predictivo a NIVEL DE ÁREA sobre las intervenciones capturadas
 * (`maintenanceLog` de una línea/área de Análisis de Turno). Complementa a
 * `analyzeRecurrentIssues`/`predictNextFailure` (que son por equipo/incidente):
 * aquí la unidad es el ÁREA, alimentada por la Captura Rápida de Intervención.
 *
 * Demuestra el aporte de Mantención: detecta patrones recurrentes, equipos a
 * vigilar y la próxima acción preventiva → de "registramos" a "optimizamos".
 * Robusto: ante datos insuficientes o fallo devuelve null (el caller guía).
 */
export async function analyzeAreaInterventions(
  entries: AreaInterventionInput[],
  areaLabel: string,
): Promise<AreaInsights | null> {
  if (!isAIConfigured() || entries.length < MIN_AREA_INTERVENTIONS) return null

  try {
    // Resumen compacto y ordenado (más reciente primero), acotado para el prompt.
    const sorted = [...entries].sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, 60)
    const summary = sorted.map((e) => ({
      fecha: e.fecha.toISOString().slice(0, 10),
      tipo: e.tipo,
      condicion: e.severidad, // verde/amarillo/rojo = Cond 1/2/3
      hallazgo: e.hallazgo,
    }))

    const prompt = `Eres un ingeniero de confiabilidad (RCM) analizando el historial de intervenciones de mantención de un ÁREA de planta: "${areaLabel}".

Intervenciones (más reciente primero):
${JSON.stringify(summary, null, 2)}

Analiza y entrega:
1. Estado general de mantención del área (resumen breve, 1-2 frases).
2. Nivel de riesgo del área (bajo/medio/alto/critico) según frecuencia y condición de las intervenciones.
3. Patrones recurrentes (fallas/equipos que se repiten) con su frecuencia y una recomendación preventiva por patrón.
4. Equipos o componentes a vigilar (nombres/menciones que se repiten en los hallazgos).
5. La PRÓXIMA acción preventiva concreta recomendada (enfoque RCM, evitar recurrencia).

Responde SOLO con JSON:
{
  "resumen": "string",
  "riesgo": "bajo|medio|alto|critico",
  "patrones": [{ "descripcion": "string", "frecuencia": number, "recomendacion": "string" }],
  "equiposAVigilar": ["string"],
  "proximaAccion": "string",
  "confianza": 0.0-1.0
}`

    const { content } = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2, max_tokens: 1200 },
    )
    const jsonStr = (content || '{}').replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(jsonStr) as Partial<AreaInsights>

    const riesgos: AreaInsights['riesgo'][] = ['bajo', 'medio', 'alto', 'critico']
    return {
      resumen: (parsed.resumen || '').toString().trim(),
      riesgo: riesgos.includes(parsed.riesgo as AreaInsights['riesgo']) ? (parsed.riesgo as AreaInsights['riesgo']) : 'medio',
      patrones: Array.isArray(parsed.patrones)
        ? parsed.patrones.slice(0, 6).map((p) => ({
            descripcion: String(p?.descripcion ?? '').trim(),
            frecuencia: Number(p?.frecuencia) || 0,
            recomendacion: String(p?.recomendacion ?? '').trim(),
          })).filter((p) => p.descripcion)
        : [],
      equiposAVigilar: Array.isArray(parsed.equiposAVigilar)
        ? parsed.equiposAVigilar.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
        : [],
      proximaAccion: (parsed.proximaAccion || '').toString().trim(),
      confianza: typeof parsed.confianza === 'number' ? Math.max(0, Math.min(1, parsed.confianza)) : 0.5,
    }
  } catch (error) {
    logger.error('Error analizando intervenciones del área con IA:', error instanceof Error ? error : new Error(String(error)))
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
