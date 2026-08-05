/**
 * QuizView — Examen interactivo de autoevaluación (temas de curso), en formato
 * "dossier de campo": una pregunta a la vez, opciones como filas hairline, y al
 * responder se revela ✓/✕ + la explicación en barra lateral. Pantalla final con
 * puntaje condensado y repaso. No persiste nada (evaluación local, sin login).
 */
import { useEffect, useMemo, useState } from 'react'
import type { QuizQuestion } from '@/services/learningContent'
import { saveQuizBest } from '@/utils/learningProgress'

export function QuizView({ questions, machineSlug }: { questions: QuizQuestion[]; machineSlug?: string }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)

  // Al terminar, guardar el mejor % como progreso local del módulo.
  useEffect(() => {
    if (!finished || !machineSlug || questions.length === 0) return
    const finalScore = questions.reduce((acc, q) => acc + (answers[q.id] === q.correctIndex ? 1 : 0), 0)
    saveQuizBest(machineSlug, Math.round((finalScore / questions.length) * 100))
  }, [finished, machineSlug, questions, answers])

  const total = questions.length
  const current = questions[index]
  const answeredCurrent = current ? answers[current.id] !== undefined : false
  const score = useMemo(
    () => questions.reduce((acc, q) => acc + (answers[q.id] === q.correctIndex ? 1 : 0), 0),
    [answers, questions],
  )

  if (total === 0 || !current) return null

  const restart = () => {
    setAnswers({})
    setIndex(0)
    setFinished(false)
  }

  // ── Pantalla de resultado ──
  if (finished) {
    const pct = Math.round((score / total) * 100)
    const passed = pct >= 70
    const message = passed
      ? 'Muy bien — dominás el módulo.'
      : pct >= 50
        ? 'Vas bien, repasá los puntos que fallaste.'
        : 'Conviene repasar las lecciones antes de la prueba.'
    const ringColor = passed ? 'var(--dp-ok)' : 'var(--dp-warn)'
    const circumference = 2 * Math.PI * 34
    const offset = circumference * (1 - pct / 100)
    return (
      <div className="dp-quiz">
        <span className="dp-lbl">Resultado</span>
        <div className="dp-quiz-ring">
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r="34" fill="none" stroke="var(--dp-rule-hard)" strokeWidth="6" />
            <circle
              cx="42" cy="42" r="34" fill="none" stroke={ringColor} strokeWidth="6"
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              transform="rotate(-90 42 42)"
            />
            <line
              x1="42" y1="8" x2="42" y2="14" stroke="var(--dp-ink-faint)" strokeWidth="2"
              transform={`rotate(${70 * 3.6 - 90} 42 42)`}
            />
          </svg>
          <div>
            <p className="dp-quiz-score">{score} / {total}</p>
            <p className="dp-quiz-ring-thr">Umbral de aprobación 70%</p>
          </div>
        </div>
        <p className="dp-quiz-pct" style={{ color: ringColor }}>{pct}% de aciertos</p>
        <p className="dp-quiz-msg">{message}</p>
        <button type="button" className="dp-quiz-next" onClick={restart}>↺ Repetir examen</button>

        <ul className="dp-quiz-review">
          {questions.map((q, i) => {
            const ok = answers[q.id] === q.correctIndex
            return (
              <li key={q.id}>
                <span className={`dp-mark ${ok ? 'ok' : 'no'}`}>{ok ? '✓' : '✕'}</span>
                <div>
                  <div className="dp-rq">{i + 1}. {q.question}</div>
                  <div className="dp-ra">Respuesta correcta: <b>{q.options[q.correctIndex]}</b></div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // ── Pregunta actual ──
  const choose = (optIdx: number) => {
    if (answeredCurrent) return
    setAnswers(a => ({ ...a, [current.id]: optIdx }))
  }
  const goNext = () => {
    if (index < total - 1) setIndex(index + 1)
    else setFinished(true)
  }

  const chosen = answers[current.id]
  const progress = ((index + (answeredCurrent ? 1 : 0)) / total) * 100
  const correct = chosen === current.correctIndex

  return (
    <div className="dp-quiz">
      <div className="dp-quiz-progress">
        <span>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
        <span className="dp-quiz-bar"><span style={{ width: `${progress}%` }} /></span>
        <span>Aciertos {score}</span>
      </div>

      <span className="dp-lbl dp-cap">Pregunta {index + 1}</span>
      <p className="dp-q">{current.question}</p>

      <div className="dp-quiz-opts">
        {current.options.map((opt, i) => {
          const isCorrect = i === current.correctIndex
          const isChosen = chosen === i
          const state = answeredCurrent ? (isCorrect ? 'correct' : isChosen ? 'wrong' : undefined) : undefined
          return (
            <button
              key={i}
              type="button"
              className="dp-quiz-opt"
              data-state={state}
              onClick={() => choose(i)}
              disabled={answeredCurrent}
            >
              <span className="dp-k">
                {answeredCurrent && isCorrect ? '✓' : answeredCurrent && isChosen ? '✕' : String.fromCharCode(65 + i)}
              </span>
              <span className="dp-otext">{opt}</span>
            </button>
          )
        })}
      </div>

      {answeredCurrent && (
        <div className={`dp-quiz-fb ${correct ? '' : 'is-wrong'}`}>
          <span className="dp-lbl">{correct ? 'Correcto' : 'Explicación'}</span>
          {current.explanation}
        </div>
      )}

      {answeredCurrent && (
        <div>
          <button type="button" className="dp-quiz-next" onClick={goNext}>
            {index < total - 1 ? 'Siguiente pregunta →' : 'Ver resultado →'}
          </button>
        </div>
      )}
    </div>
  )
}
