/**
 * learningProgress — progreso local del Centro de Aprendizaje (localStorage,
 * mismo patrón que learningHubPrefs). Sin login: el progreso es del dispositivo.
 *
 * Modelo simple y honesto:
 *  · "visitado": el usuario abrió esa pestaña/sección de la máquina.
 *  · "examen": mejor % logrado en el examen (QuizView) de la máquina.
 *  · % de avance = pestañas visitadas / pestañas con contenido.
 *  · estado: aprobado (examen ≥70) · en curso (algo visitado) · sin iniciar.
 */

const VISITED_KEY = 'learning:visited'
const QUIZ_KEY = 'learning:quizBest'

type VisitedMap = Record<string, string[]>
type QuizMap = Record<string, number>

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage lleno o bloqueado: el progreso es cosmético, no bloquea nada */
  }
}

export function markSectionVisited(machineSlug: string, tabId: string) {
  const map = read<VisitedMap>(VISITED_KEY, {})
  const list = map[machineSlug] ?? []
  if (list.includes(tabId)) return
  map[machineSlug] = [...list, tabId]
  write(VISITED_KEY, map)
}

export function getVisitedSections(machineSlug: string): string[] {
  return read<VisitedMap>(VISITED_KEY, {})[machineSlug] ?? []
}

/** Guarda el % del examen solo si mejora el anterior. */
export function saveQuizBest(machineSlug: string, pct: number) {
  const map = read<QuizMap>(QUIZ_KEY, {})
  if ((map[machineSlug] ?? -1) >= pct) return
  map[machineSlug] = pct
  write(QUIZ_KEY, map)
}

export function getQuizBest(machineSlug: string): number | null {
  const v = read<QuizMap>(QUIZ_KEY, {})[machineSlug]
  return typeof v === 'number' ? v : null
}

export type MachineProgressState = 'aprobado' | 'en-curso' | 'sin-iniciar'

export interface MachineProgress {
  /** 0–100, avance por secciones visitadas. */
  pct: number
  state: MachineProgressState
  /** Mejor % de examen si existe. */
  quizBest: number | null
}

export function getMachineProgress(machineSlug: string, totalSections: number): MachineProgress {
  const visited = getVisitedSections(machineSlug)
  const quizBest = getQuizBest(machineSlug)
  const pct = totalSections > 0
    ? Math.min(100, Math.round((visited.length / totalSections) * 100))
    : 0
  const state: MachineProgressState =
    quizBest != null && quizBest >= 70 ? 'aprobado'
    : visited.length > 0 ? 'en-curso'
    : 'sin-iniciar'
  return { pct: state === 'aprobado' ? 100 : pct, state, quizBest }
}
