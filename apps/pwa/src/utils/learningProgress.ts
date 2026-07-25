/**
 * learningProgress — estado local de EVALUACIÓN del Centro de Aprendizaje
 * (localStorage, mismo patrón que learningHubPrefs). Sin login: es del
 * dispositivo.
 *
 * Decisión 2026-07 (Orel): el material del Centro es de consulta periódica,
 * no un curso lineal — trackear "% visto" no aporta. Lo único que progresa
 * es la evaluación: acá se guarda el mejor % de examen por máquina/curso.
 */

const QUIZ_KEY = 'learning:quizBest'

type QuizMap = Record<string, number>

function read(): QuizMap {
  try {
    const raw = localStorage.getItem(QUIZ_KEY)
    return raw ? (JSON.parse(raw) as QuizMap) : {}
  } catch {
    return {}
  }
}

/** Guarda el % del examen solo si mejora el anterior. */
export function saveQuizBest(machineSlug: string, pct: number) {
  const map = read()
  if ((map[machineSlug] ?? -1) >= pct) return
  map[machineSlug] = pct
  try {
    localStorage.setItem(QUIZ_KEY, JSON.stringify(map))
  } catch {
    /* storage lleno o bloqueado: el estado es cosmético, no bloquea nada */
  }
}

export function getQuizBest(machineSlug: string): number | null {
  const v = read()[machineSlug]
  return typeof v === 'number' ? v : null
}

/** Umbral de aprobación compartido (mismo que usa QuizView). */
export const QUIZ_PASS_PCT = 70

export function isQuizPassed(machineSlug: string): boolean {
  const best = getQuizBest(machineSlug)
  return best != null && best >= QUIZ_PASS_PCT
}
