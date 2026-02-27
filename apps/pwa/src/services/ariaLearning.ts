/**
 * ARIA Learning System — Aprendizaje continuo para la IA de planta
 *
 * Pilares:
 * 1. Feedback loop    — thumbs up/down en respuestas → aprende qué funciona
 * 2. Knowledge base   — extrae "lecciones" de interacciones exitosas
 * 3. Pattern tracking — problemas recurrentes por equipo + soluciones
 * 4. Global memory    — Firestore: compartido entre todos los usuarios/dispositivos
 */

import {
  addDoc, collection, deleteDoc, doc, getDocs, limit,
  orderBy, query, serverTimestamp, updateDoc, where, increment,
} from 'firebase/firestore'
import { db } from './firebase'
import { logger } from '@/lib/logger'

// ─── Types ───────────────────────────────────────────────────────────

export interface AriaFeedback {
  id?: string
  messageId: string
  userId: string
  userQuery: string
  ariaResponse: string
  rating: 'positive' | 'negative'
  reason?: string            // Opcional: why it was bad/good
  correction?: string        // Lo que el usuario dice que era la respuesta correcta
  intents: string[]
  equipmentMentioned?: string
  createdAt?: unknown        // serverTimestamp
}

export interface AriaCorrection {
  id?: string
  userQuery: string
  wrongResponse: string      // Resumen de lo que ARIA dijo mal
  correctResponse: string    // Lo que el usuario indicó como correcto
  category: string           // repuestos, equipos, incidencias, general
  equipmentName?: string
  createdBy: string
  usageCount: number         // Cuántas veces se ha inyectado como contexto
  active: boolean            // admin puede desactivar
  createdAt?: unknown
}

export interface AriaKnowledge {
  id?: string
  type: 'faq' | 'solution' | 'procedure' | 'fact'
  question: string           // Pregunta o patrón que origina
  answer: string             // Respuesta aprendida
  category: string           // incidencias, equipos, repuestos, etc.
  equipmentId?: string
  equipmentName?: string
  confidence: number         // 0-100, sube con feedback positivo
  usageCount: number         // Cuántas veces se ha usado
  source: 'feedback' | 'interaction' | 'manual'
  createdBy: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface AriaEquipmentPattern {
  id?: string
  equipmentId: string
  equipmentName: string
  problemType: string        // Ej: "vibración", "sobrecalentamiento", "fuga"
  occurrences: number
  lastOccurrence?: unknown
  commonSolution?: string    // Solución más frecuente
  avgResolutionHours?: number
  relatedSpares?: string[]   // Repuestos típicos usados
  createdAt?: unknown
  updatedAt?: unknown
}

// ─── Collections ─────────────────────────────────────────────────────

const FEEDBACK_COL = 'ariaFeedback'
const KNOWLEDGE_COL = 'ariaKnowledge'
const PATTERNS_COL = 'ariaEquipmentPatterns'
const CORRECTIONS_COL = 'ariaCorrections'

// ─── Caché local optimizado ──────────────────────────────────────────

interface LearningCache<T> {
  data: T[]
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000  // 5 minutos
const knowledgeCache: LearningCache<AriaKnowledge> = { data: [], timestamp: 0 }
const patternsCache: LearningCache<AriaEquipmentPattern> = { data: [], timestamp: 0 }
const correctionsCache: LearningCache<AriaCorrection> = { data: [], timestamp: 0 }

function isCacheValid<T>(cache: LearningCache<T>): boolean {
  return cache.data.length > 0 && Date.now() - cache.timestamp < CACHE_TTL
}

// ─── FEEDBACK ────────────────────────────────────────────────────────

/** Guardar feedback (thumbs up/down) de una respuesta de ARIA */
export async function saveFeedback(feedback: Omit<AriaFeedback, 'id' | 'createdAt'>): Promise<string> {
  // 1. Guardar el feedback primero (operación crítica)
  let docId: string
  try {
    const docRef = await addDoc(collection(db, FEEDBACK_COL), {
      ...feedback,
      createdAt: serverTimestamp(),
    })
    docId = docRef.id
    logger.info(`ARIA Learning: feedback ${feedback.rating} saved for message ${feedback.messageId} (doc=${docId})`)
  } catch (err) {
    logger.error('ARIA Learning: error saving feedback to Firestore', err instanceof Error ? err : undefined)
    throw err
  }

  // 2. Post-procesamiento (no-crítico, errores no afectan el resultado)
  try {
    if (feedback.rating === 'positive') {
      await reinforceKnowledge(feedback.userQuery, feedback.ariaResponse, feedback.intents, feedback.userId)
    }

    if (feedback.rating === 'negative') {
      await weakenKnowledge(feedback.userQuery)

      if (feedback.correction && feedback.correction.trim().length > 5) {
        await saveCorrection({
          userQuery: feedback.userQuery,
          wrongResponse: extractCompactAnswer(feedback.ariaResponse).slice(0, 300),
          correctResponse: feedback.correction.trim().slice(0, 500),
          category: feedback.intents[0] || 'general',
          equipmentName: feedback.equipmentMentioned,
          createdBy: feedback.userId,
          usageCount: 0,
          active: true,
        })
      }
    }
  } catch (postErr) {
    // No propagar — el feedback ya fue guardado exitosamente
    logger.error('ARIA Learning: post-save processing failed (feedback already saved)', postErr instanceof Error ? postErr : undefined)
  }

  return docId
}

// ─── CORRECTIONS — Reglas de corrección persistentes ─────────────────

/** Guardar una corrección explícita del usuario */
export async function saveCorrection(correction: Omit<AriaCorrection, 'id' | 'createdAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, CORRECTIONS_COL), {
      ...correction,
      createdAt: serverTimestamp(),
    })
    correctionsCache.timestamp = 0 // Invalidar caché
    logger.info(`ARIA Learning: correction saved — "${correction.correctResponse.slice(0, 60)}..."`)
    return docRef.id
  } catch (err) {
    logger.error('ARIA Learning: error saving correction', err instanceof Error ? err : undefined)
    throw err
  }
}

/** Obtener todas las correcciones activas (con caché) */
export async function getCorrections(): Promise<AriaCorrection[]> {
  if (isCacheValid(correctionsCache)) return correctionsCache.data

  try {
    const q = query(
      collection(db, CORRECTIONS_COL),
      where('active', '==', true),
      orderBy('createdAt', 'desc'),
      limit(100),
    )
    const snap = await getDocs(q)
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AriaCorrection))
    correctionsCache.data = data
    correctionsCache.timestamp = Date.now()
    return data
  } catch {
    return correctionsCache.data
  }
}

/** Buscar correcciones relevantes para una consulta */
export async function findRelevantCorrections(userQuery: string, maxResults = 5): Promise<AriaCorrection[]> {
  const allCorrections = await getCorrections()
  const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2)

  const scored = allCorrections.map((c) => {
    const cWords = (c.userQuery + ' ' + c.correctResponse + ' ' + (c.equipmentName || '')).toLowerCase()
    let score = 0
    for (const w of queryWords) {
      if (cWords.includes(w)) score += 10
    }
    // Bonus si la consulta original es muy similar
    const origWords = c.userQuery.toLowerCase().split(/\s+/)
    const overlap = queryWords.filter(w => origWords.some(ow => ow.includes(w) || w.includes(ow))).length
    score += overlap * 15
    return { correction: c, score }
  })

  return scored
    .filter(s => s.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.correction)
}

/** Toggle activación de una corrección (admin) */
export async function toggleCorrection(correctionId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, CORRECTIONS_COL, correctionId), { active })
  correctionsCache.timestamp = 0
}

/** Eliminar corrección (admin) */
export async function deleteCorrection(correctionId: string): Promise<void> {
  await deleteDoc(doc(db, CORRECTIONS_COL, correctionId))
  correctionsCache.timestamp = 0
}

/** Obtener estadísticas de feedback para métricas */
export async function getFeedbackStats(): Promise<{ positive: number; negative: number; total: number }> {
  try {
    const snap = await getDocs(collection(db, FEEDBACK_COL))
    let positive = 0
    let negative = 0
    snap.forEach((d) => {
      const data = d.data()
      if (data.rating === 'positive') positive++
      else negative++
    })
    return { positive, negative, total: positive + negative }
  } catch {
    return { positive: 0, negative: 0, total: 0 }
  }
}

// ─── KNOWLEDGE BASE ──────────────────────────────────────────────────

/** Reforzar o crear conocimiento tras feedback positivo */
async function reinforceKnowledge(
  userQuery: string,
  ariaResponse: string,
  intents: string[],
  userId: string,
): Promise<void> {
  try {
    // Buscar knowledge existente similar
    const existing = await findSimilarKnowledge(userQuery)

    if (existing) {
      // Reforzar confianza (máx 100)
      const newConfidence = Math.min(100, existing.confidence + 5)
      await updateDoc(doc(db, KNOWLEDGE_COL, existing.id!), {
        confidence: newConfidence,
        usageCount: increment(1),
        updatedAt: serverTimestamp(),
      })
    } else {
      // Crear nuevo conocimiento solo si la respuesta es sustancial
      if (ariaResponse.length > 50) {
        // Extraer una versión compacta de la respuesta como knowledge
        const compactAnswer = extractCompactAnswer(ariaResponse)
        await addDoc(collection(db, KNOWLEDGE_COL), {
          type: 'faq',
          question: userQuery.slice(0, 200),
          answer: compactAnswer,
          category: intents[0] || 'general',
          confidence: 60, // Empieza en 60%, sube con más feedback positivo
          usageCount: 1,
          source: 'feedback',
          createdBy: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
    }

    // Invalidar caché
    knowledgeCache.timestamp = 0
  } catch (err) {
    logger.error('ARIA Learning: error reinforcing knowledge', err instanceof Error ? err : undefined)
  }
}

/** Reducir confianza de knowledge que dio respuestas negativas */
async function weakenKnowledge(userQuery: string): Promise<void> {
  try {
    const existing = await findSimilarKnowledge(userQuery)
    if (existing && existing.confidence > 0) {
      const newConfidence = Math.max(0, existing.confidence - 10)
      if (newConfidence === 0) {
        // Eliminar si la confianza llega a 0
        await deleteDoc(doc(db, KNOWLEDGE_COL, existing.id!))
      } else {
        await updateDoc(doc(db, KNOWLEDGE_COL, existing.id!), {
          confidence: newConfidence,
          updatedAt: serverTimestamp(),
        })
      }
      knowledgeCache.timestamp = 0
    }
  } catch (err) {
    logger.error('ARIA Learning: error weakening knowledge', err instanceof Error ? err : undefined)
  }
}

/** Buscar conocimiento similar a una pregunta */
async function findSimilarKnowledge(queryText: string): Promise<AriaKnowledge | null> {
  const allKnowledge = await getKnowledge()
  const queryWords = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 3)

  let bestMatch: AriaKnowledge | null = null
  let bestScore = 0

  for (const k of allKnowledge) {
    const kWords = k.question.toLowerCase().split(/\s+/)
    const overlap = queryWords.filter(w => kWords.some(kw => kw.includes(w) || w.includes(kw))).length
    const score = overlap / Math.max(queryWords.length, 1)
    if (score > 0.4 && score > bestScore) {
      bestScore = score
      bestMatch = k
    }
  }

  return bestMatch
}

/** Extraer respuesta compacta (para almacenar) */
function extractCompactAnswer(response: string): string {
  // Remover emojis, markdown pesado, y limitar longitud
  return response
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ.,;:!?()%$#\-/]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

/** Obtener toda la base de conocimiento (con caché) */
export async function getKnowledge(): Promise<AriaKnowledge[]> {
  if (isCacheValid(knowledgeCache)) return knowledgeCache.data

  try {
    const q = query(
      collection(db, KNOWLEDGE_COL),
      where('confidence', '>', 20),
      orderBy('confidence', 'desc'),
      limit(100),
    )
    const snap = await getDocs(q)
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AriaKnowledge))
    knowledgeCache.data = data
    knowledgeCache.timestamp = Date.now()
    return data
  } catch (err) {
    logger.error('ARIA Learning: error loading knowledge', err instanceof Error ? err : undefined)
    return knowledgeCache.data // Devolver caché stale si falla
  }
}

/** Buscar conocimiento relevante para una consulta */
export async function findRelevantKnowledge(
  userQuery: string,
  intents: string[],
  maxResults = 5,
): Promise<AriaKnowledge[]> {
  const allKnowledge = await getKnowledge()
  const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2)

  // Scoreado por relevancia
  const scored = allKnowledge.map((k) => {
    let score = 0

    // Match de categoría con intents
    if (intents.includes(k.category)) score += 30

    // Match de palabras clave
    const kWords = (k.question + ' ' + k.answer).toLowerCase()
    for (const w of queryWords) {
      if (kWords.includes(w)) score += 10
    }

    // Bonus por confianza
    score += k.confidence * 0.2

    // Bonus por uso
    score += Math.min(k.usageCount * 2, 20)

    return { knowledge: k, score }
  })

  return scored
    .filter((s) => s.score > 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.knowledge)
}

// ─── EQUIPMENT PATTERNS ──────────────────────────────────────────────

/** Registrar un patrón de problema en un equipo */
export async function trackEquipmentProblem(
  equipmentId: string,
  equipmentName: string,
  problemType: string,
  solution?: string,
  resolutionHours?: number,
  relatedSpares?: string[],
): Promise<void> {
  try {
    // Buscar patrón existente
    const q = query(
      collection(db, PATTERNS_COL),
      where('equipmentId', '==', equipmentId),
      where('problemType', '==', problemType),
      limit(1),
    )
    const snap = await getDocs(q)

    if (snap.empty) {
      // Crear nuevo patrón
      await addDoc(collection(db, PATTERNS_COL), {
        equipmentId,
        equipmentName,
        problemType,
        occurrences: 1,
        commonSolution: solution || null,
        avgResolutionHours: resolutionHours || null,
        relatedSpares: relatedSpares || [],
        lastOccurrence: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } else {
      // Actualizar patrón existente
      const existingDoc = snap.docs[0]!
      const data = existingDoc.data()
      const newOccurrences = (data.occurrences || 0) + 1

      const patch: Record<string, unknown> = {
        occurrences: newOccurrences,
        lastOccurrence: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      if (solution) patch.commonSolution = solution
      if (resolutionHours && data.avgResolutionHours) {
        // Promedio móvil
        patch.avgResolutionHours = (data.avgResolutionHours * (newOccurrences - 1) + resolutionHours) / newOccurrences
      } else if (resolutionHours) {
        patch.avgResolutionHours = resolutionHours
      }
      if (relatedSpares?.length) {
        const merged = Array.from(new Set([...(data.relatedSpares || []), ...relatedSpares]))
        patch.relatedSpares = merged
      }

      await updateDoc(doc(db, PATTERNS_COL, existingDoc.id), patch)
    }

    patternsCache.timestamp = 0 // Invalidar caché
  } catch (err) {
    logger.error('ARIA Learning: error tracking equipment pattern', err instanceof Error ? err : undefined)
  }
}

/** Obtener patrones de problemas (con caché) */
export async function getEquipmentPatterns(): Promise<AriaEquipmentPattern[]> {
  if (isCacheValid(patternsCache)) return patternsCache.data

  try {
    const q = query(
      collection(db, PATTERNS_COL),
      orderBy('occurrences', 'desc'),
      limit(50),
    )
    const snap = await getDocs(q)
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AriaEquipmentPattern))
    patternsCache.data = data
    patternsCache.timestamp = Date.now()
    return data
  } catch {
    return patternsCache.data
  }
}

/** Buscar patrones para un equipo específico */
export async function getPatternsForEquipment(equipmentName: string): Promise<AriaEquipmentPattern[]> {
  const all = await getEquipmentPatterns()
  const name = equipmentName.toLowerCase()
  return all.filter((p) => p.equipmentName.toLowerCase().includes(name))
}

// ─── CONTEXT BUILDER PARA RAG ────────────────────────────────────────

/**
 * Construir contexto de aprendizaje para inyectar en el prompt de ARIA.
 * Esto es lo que hace a ARIA "más inteligente" con el tiempo.
 */
export async function buildLearningContext(
  userQuery: string,
  intents: string[],
): Promise<string> {
  const lines: string[] = []

  try {
    // 0. Correcciones del usuario (MÁXIMA PRIORIDAD — evitar repetir errores)
    const relevantCorrections = await findRelevantCorrections(userQuery, 5)
    if (relevantCorrections.length > 0) {
      lines.push('⚠️ CORRECCIONES DEL USUARIO (respeta estas correcciones — el usuario ya indicó que estabas equivocado):')
      for (const c of relevantCorrections) {
        lines.push(`  ❌ Cuando preguntaron "${c.userQuery}", respondiste MAL: "${c.wrongResponse.slice(0, 100)}..."`)
        lines.push(`  ✅ La respuesta CORRECTA es: ${c.correctResponse}`)
        if (c.equipmentName) lines.push(`     Relacionado con: ${c.equipmentName}`)
        // Incrementar uso async
        if (c.id) {
          updateDoc(doc(db, CORRECTIONS_COL, c.id), { usageCount: increment(1) }).catch(() => {})
        }
      }
      lines.push('')
    }

    // 1. Knowledge relevante
    const relevantKnowledge = await findRelevantKnowledge(userQuery, intents, 5)
    if (relevantKnowledge.length > 0) {
      lines.push('🧠 CONOCIMIENTO APRENDIDO (respuestas exitosas anteriores — úsalas como referencia):')
      for (const k of relevantKnowledge) {
        lines.push(`  • [${k.type}] Pregunta: "${k.question}" → ${k.answer.slice(0, 200)} (confianza: ${k.confidence}%)`)
      }
      lines.push('')
    }

    // 2. Patrones de equipo relevantes
    const queryLower = userQuery.toLowerCase()
    const allPatterns = await getEquipmentPatterns()
    const relevantPatterns = allPatterns.filter((p) => {
      const pName = p.equipmentName.toLowerCase()
      return queryLower.includes(pName) ||
        queryLower.includes(p.problemType.toLowerCase()) ||
        intents.some(i => i === 'equipos' || i === 'incidencias')
    }).slice(0, 5)

    if (relevantPatterns.length > 0) {
      lines.push('📊 PATRONES DE PROBLEMAS RECURRENTES (aprende de la historia de la planta):')
      for (const p of relevantPatterns) {
        let line = `  • ${p.equipmentName}: "${p.problemType}" — ${p.occurrences} veces`
        if (p.commonSolution) line += ` | Solución habitual: ${p.commonSolution}`
        if (p.avgResolutionHours) line += ` | Tiempo promedio: ${p.avgResolutionHours.toFixed(1)}h`
        if (p.relatedSpares?.length) line += ` | Repuestos típicos: ${p.relatedSpares.join(', ')}`
        lines.push(line)
      }
      lines.push('')
    }

    // 3. Estadísticas de aprendizaje (para que ARIA sepa que aprende)
    const stats = await getFeedbackStats()
    if (stats.total > 0) {
      const satisfaction = Math.round((stats.positive / stats.total) * 100)
      lines.push(`📈 MÉTRICAS: ${stats.total} evaluaciones recibidas | ${satisfaction}% satisfacción | ${relevantKnowledge.length + allPatterns.length} conocimientos acumulados`)
    }
  } catch (err) {
    logger.error('ARIA Learning: error building learning context', err instanceof Error ? err : undefined)
  }

  return lines.join('\n')
}

/** Aprender de una incidencia resuelta (se llama cuando se cierra una incidencia) */
export async function learnFromResolvedIncident(
  equipmentId: string,
  equipmentName: string,
  problemDescription: string,
  solution: string,
  resolutionHours: number,
  relatedSpares?: string[],
): Promise<void> {
  // Clasificar el tipo de problema
  const problemType = classifyProblem(problemDescription)

  // Registrar patrón
  await trackEquipmentProblem(
    equipmentId,
    equipmentName,
    problemType,
    solution,
    resolutionHours,
    relatedSpares,
  )

  // Crear knowledge si la solución es informativa
  if (solution.length > 20) {
    try {
      await addDoc(collection(db, KNOWLEDGE_COL), {
        type: 'solution',
        question: `Problema en ${equipmentName}: ${problemDescription.slice(0, 100)}`,
        answer: `Solución: ${solution.slice(0, 400)}${relatedSpares?.length ? ` | Repuestos: ${relatedSpares.join(', ')}` : ''}`,
        category: 'incidencias',
        equipmentId,
        equipmentName,
        confidence: 70,
        usageCount: 0,
        source: 'interaction',
        createdBy: 'system',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      knowledgeCache.timestamp = 0
    } catch (err) {
      logger.error('ARIA Learning: error learning from incident', err instanceof Error ? err : undefined)
    }
  }
}

/** Clasificar tipo de problema basado en descripción */
function classifyProblem(description: string): string {
  const lower = description.toLowerCase()
  const categories: [string, RegExp][] = [
    ['vibración', /vibr/],
    ['sobrecalentamiento', /calien|temperat|sobrecal/],
    ['fuga', /fuga|goteo|gotea|derram/],
    ['ruido anormal', /ruido|sonido|golpe/],
    ['falla eléctrica', /el[eé]ctric|corto|voltaje|amper/],
    ['desgaste', /desgas|rotur|rompi|quebr/],
    ['atasco', /atasc|trab[aó]|bloque/],
    ['corrosión', /corrosi|oxid|herrumbr/],
    ['desalineación', /aline|desalin|descuadr/],
    ['lubricación', /lubric|aceite|grasa|engras/],
    ['sensor', /sensor|lectur|medici/],
    ['preventivo', /prevent|mantenci|rutina|program/],
  ]

  for (const [type, regex] of categories) {
    if (regex.test(lower)) return type
  }
  return 'general'
}

// ─── LEARNING STATS — Métricas para el dashboard ────────────────────

export interface LearningStats {
  totalFeedback: number
  positiveFeedback: number
  negativeFeedback: number
  satisfactionRate: number     // 0-100
  totalCorrections: number
  activeCorrections: number
  totalKnowledge: number
  avgConfidence: number        // Confianza promedio del knowledge
  totalPatterns: number
  feedbackByDay: { date: string; positive: number; negative: number }[]
  topCorrections: AriaCorrection[]
  recentFeedback: AriaFeedback[]
}

/** Obtener estadísticas completas de aprendizaje para el dashboard */
export async function getLearningStats(): Promise<LearningStats> {
  try {
    // Cargar todo en paralelo
    const [feedbackSnap, knowledge, corrections, patterns] = await Promise.all([
      getDocs(query(collection(db, FEEDBACK_COL), orderBy('createdAt', 'desc'), limit(500))),
      getKnowledge(),
      getCorrections(),
      getEquipmentPatterns(),
    ])

    // Procesar feedback
    const allFeedback: AriaFeedback[] = []
    feedbackSnap.forEach(d => allFeedback.push({ id: d.id, ...d.data() } as AriaFeedback))

    let positive = 0
    let negative = 0
    const byDay: Record<string, { positive: number; negative: number }> = {}

    for (const f of allFeedback) {
      if (f.rating === 'positive') positive++
      else negative++

      // Agrupar por día
      const ts = f.createdAt && typeof f.createdAt === 'object' && 'seconds' in (f.createdAt as Record<string, unknown>)
        ? new Date((f.createdAt as { seconds: number }).seconds * 1000)
        : new Date()
      const day = ts.toISOString().slice(0, 10)
      if (!byDay[day]) byDay[day] = { positive: 0, negative: 0 }
      if (f.rating === 'positive') byDay[day]!.positive++
      else byDay[day]!.negative++
    }

    const total = positive + negative
    const feedbackByDay = Object.entries(byDay)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30) // Últimos 30 días

    const avgConfidence = knowledge.length > 0
      ? Math.round(knowledge.reduce((s, k) => s + k.confidence, 0) / knowledge.length)
      : 0

    return {
      totalFeedback: total,
      positiveFeedback: positive,
      negativeFeedback: negative,
      satisfactionRate: total > 0 ? Math.round((positive / total) * 100) : 100,
      totalCorrections: corrections.length,
      activeCorrections: corrections.filter(c => c.active).length,
      totalKnowledge: knowledge.length,
      avgConfidence,
      totalPatterns: patterns.length,
      feedbackByDay,
      topCorrections: corrections.slice(0, 10),
      recentFeedback: allFeedback.slice(0, 20),
    }
  } catch (err) {
    logger.error('ARIA Learning: error getting stats', err instanceof Error ? err : undefined)
    return {
      totalFeedback: 0,
      positiveFeedback: 0,
      negativeFeedback: 0,
      satisfactionRate: 100,
      totalCorrections: 0,
      activeCorrections: 0,
      totalKnowledge: 0,
      avgConfidence: 0,
      totalPatterns: 0,
      feedbackByDay: [],
      topCorrections: [],
      recentFeedback: [],
    }
  }
}
