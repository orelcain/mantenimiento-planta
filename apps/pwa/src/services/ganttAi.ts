import { httpsCallable, getFunctions } from 'firebase/functions'
import firebaseApp from '@/services/firebase'
import type { GanttTaskComment } from '@/types'

interface EstimateInput {
  taskTitle: string
  taskDescription?: string
  currentProgress: number
  comments: Pick<GanttTaskComment, 'content' | 'reportedProgress' | 'createdByName' | 'createdAt'>[]
}

interface EstimateOutput {
  suggestedProgress: number
  rationale: string
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function buildPrompt(input: EstimateInput): string {
  const lines: string[] = []
  lines.push('Eres analista de avance de mantenimiento industrial.')
  lines.push('Calcula un porcentaje de avance (0-100) basado en comentarios de técnicos.')
  lines.push('Responde SOLO JSON con esta forma: {"suggestedProgress": number, "rationale": string}')
  lines.push('')
  lines.push(`Tarea: ${input.taskTitle}`)
  lines.push(`Descripción: ${input.taskDescription || 'Sin descripción'}`)
  lines.push(`Avance actual: ${input.currentProgress}%`)
  lines.push('Comentarios recientes:')

  input.comments.slice(0, 12).forEach((comment, index) => {
    lines.push(
      `${index + 1}. [${comment.createdAt.toLocaleString()}] ${comment.createdByName || 'técnico'} · ${comment.reportedProgress ?? 'sin % explícito'}% · ${comment.content}`
    )
  })

  lines.push('Reglas:')
  lines.push('- Si hay porcentajes explícitos recientes, priorízalos.')
  lines.push('- Si no hay evidencia de avance, no subir agresivamente.')
  lines.push('- Mantén coherencia temporal de los comentarios.')

  return lines.join('\n')
}

function extractJson(text: string): EstimateOutput | null {
  const raw = text.trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<EstimateOutput>
    if (typeof parsed.suggestedProgress !== 'number') return null
    return {
      suggestedProgress: clampProgress(parsed.suggestedProgress),
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim() : 'Sugerencia generada por IA.',
    }
  } catch {
    return null
  }
}

function heuristicEstimate(input: EstimateInput): EstimateOutput {
  const explicit = input.comments
    .map((comment) => comment.reportedProgress)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (explicit.length > 0) {
    const average = explicit.reduce((acc, value) => acc + value, 0) / explicit.length
    const weighted = Math.round(input.currentProgress * 0.35 + average * 0.65)
    return {
      suggestedProgress: clampProgress(weighted),
      rationale: 'Promedio ponderado por reportes explícitos de técnicos.',
    }
  }

  const lower = input.comments.map((comment) => comment.content.toLowerCase()).join(' | ')
  const positiveHints = ['terminado', 'finalizado', 'completado', 'cerrado', 'operativo', 'normalizado']
  const blockedHints = ['bloqueado', 'pendiente', 'esperando', 'falta', 'atraso', 'detenido']

  const hasPositive = positiveHints.some((token) => lower.includes(token))
  const hasBlocked = blockedHints.some((token) => lower.includes(token))

  if (hasPositive && !hasBlocked) {
    return {
      suggestedProgress: clampProgress(Math.max(input.currentProgress, input.currentProgress + 15)),
      rationale: 'Comentarios con señales de cierre o recuperación operativa.',
    }
  }

  if (hasBlocked) {
    return {
      suggestedProgress: clampProgress(Math.min(input.currentProgress, input.currentProgress + 3)),
      rationale: 'Comentarios indican bloqueo o espera; avance conservador.',
    }
  }

  return {
    suggestedProgress: clampProgress(input.currentProgress),
    rationale: 'Sin evidencia suficiente para ajustar el avance.',
  }
}

export async function estimateGanttProgressFromComments(input: EstimateInput): Promise<EstimateOutput> {
  const fallback = heuristicEstimate(input)

  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
  const forceLocalFallback = host.endsWith('github.io')
  if (forceLocalFallback) {
    return {
      ...fallback,
      rationale: `${fallback.rationale} (estimación local por disponibilidad del entorno)`
    }
  }

  try {
    const functions = getFunctions(firebaseApp)
    const groqProxy = httpsCallable(functions, 'groqProxy')
    const prompt = buildPrompt(input)

    const result = await groqProxy({
      messages: [
        {
          role: 'system',
          content:
            'Eres experto en planificación de mantenimiento. Debes responder estrictamente en JSON válido con suggestedProgress (0-100) y rationale.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 500,
    })

    const content = (result.data as { content?: string })?.content || ''
    const parsed = extractJson(content)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}
