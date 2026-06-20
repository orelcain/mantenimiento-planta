/**
 * QuizView — Examen interactivo de autoevaluacion (temas de curso).
 *
 * Muestra una pregunta a la vez:
 *   - el alumno elige una opcion -> se revela si acerto (verde/rojo) + explicacion
 *   - barra de progreso + puntaje en vivo
 *   - pantalla final con % de aciertos y repaso de cada pregunta
 *
 * No persiste nada: la evaluacion es local en el navegador (sin login).
 */
import { useMemo, useState } from 'react'
import { Check, X, RotateCcw, Award, ArrowRight, GraduationCap } from 'lucide-react'
import { LC } from '@/data/learningTheme'
import type { QuizQuestion } from '@/services/learningContent'

export function QuizView({ questions, color }: { questions: QuizQuestion[]; color: string }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)

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
    const resultColor = passed ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444'
    const message = passed
      ? 'Muy bien — dominas el modulo.'
      : pct >= 50
        ? 'Vas bien, repasa los puntos que fallaste.'
        : 'Conviene repasar las lecciones antes de la prueba.'
    return (
      <div className="space-y-4">
        <div
          className="rounded-xl p-6 text-center"
          style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
        >
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: `${resultColor}1f`, border: `1px solid ${resultColor}55` }}
          >
            <Award className="h-7 w-7" style={{ color: resultColor }} />
          </div>
          <p className="text-3xl font-extrabold tabular-nums" style={{ color: LC.ink }}>
            {score} / {total}
          </p>
          <p className="text-sm font-semibold" style={{ color: resultColor }}>{pct}% de aciertos</p>
          <p className="mt-1 text-sm" style={{ color: LC.inkMid }}>{message}</p>
          <button
            type="button"
            onClick={restart}
            className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition active:scale-95"
            style={{ background: `${color}1f`, border: `1px solid ${color}55`, color }}
          >
            <RotateCcw className="h-4 w-4" /> Repetir examen
          </button>
        </div>

        {/* Repaso */}
        <div className="space-y-2.5">
          {questions.map((q, i) => {
            const chosen = answers[q.id]
            const ok = chosen === q.correctIndex
            return (
              <article
                key={q.id}
                className="rounded-lg p-4"
                style={{ background: LC.surface, border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}
                  >
                    {ok ? <Check className="h-3.5 w-3.5" style={{ color: '#22c55e' }} /> : <X className="h-3.5 w-3.5" style={{ color: '#ef4444' }} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: LC.ink }}>{i + 1}. {q.question}</p>
                    <p className="mt-1 text-xs" style={{ color: LC.inkMid }}>
                      Respuesta correcta: <span style={{ color: '#22c55e' }}>{q.options[q.correctIndex]}</span>
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
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

  return (
    <div className="space-y-4">
      {/* Barra de progreso + puntaje */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tabular-nums" style={{ color: LC.inkLo }}>
          {index + 1} / {total}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: LC.border }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${progress}%`, background: color, transition: 'width 0.4s ease' }}
          />
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums" style={{ color: LC.inkMid }}>
          <GraduationCap className="h-3.5 w-3.5" style={{ color }} /> {score}
        </span>
      </div>

      {/* Tarjeta de pregunta */}
      <article className="rounded-xl p-5" style={{ background: LC.surface, border: `1px solid ${LC.border}` }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color }}>
          Pregunta {index + 1}
        </p>
        <h3 className="mt-1.5 text-base font-semibold leading-snug" style={{ color: LC.ink }}>
          {current.question}
        </h3>

        <div className="mt-4 space-y-2.5">
          {current.options.map((opt, i) => {
            const isCorrect = i === current.correctIndex
            const isChosen = chosen === i
            let bg: string = LC.surfaceHi
            let border: string = LC.border
            let fg: string = LC.inkMid
            if (answeredCurrent) {
              if (isCorrect) { bg = 'rgba(34,197,94,0.10)'; border = 'rgba(34,197,94,0.45)'; fg = LC.ink }
              else if (isChosen) { bg = 'rgba(239,68,68,0.10)'; border = 'rgba(239,68,68,0.45)'; fg = LC.ink }
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => choose(i)}
                disabled={answeredCurrent}
                className="flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left text-sm transition disabled:cursor-default"
                style={{ background: bg, border: `1px solid ${border}`, color: fg }}
              >
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: answeredCurrent && isCorrect ? '#22c55e' : answeredCurrent && isChosen ? '#ef4444' : `${color}16`,
                    color: answeredCurrent && (isCorrect || isChosen) ? '#0d1722' : color,
                    border: `1px solid ${answeredCurrent && (isCorrect || isChosen) ? 'transparent' : LC.border}`,
                  }}
                >
                  {answeredCurrent && isCorrect ? <Check className="h-3.5 w-3.5" /> : answeredCurrent && isChosen ? <X className="h-3.5 w-3.5" /> : String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            )
          })}
        </div>

        {/* Explicacion */}
        {answeredCurrent && (
          <div
            className="mt-4 rounded-lg p-3.5"
            style={{ background: `${color}0d`, border: `1px solid ${color}33` }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color }}>
              {chosen === current.correctIndex ? 'Correcto' : 'Explicacion'}
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: LC.inkMid }}>{current.explanation}</p>
          </div>
        )}

        {/* Avanzar */}
        {answeredCurrent && (
          <button
            type="button"
            onClick={goNext}
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition active:scale-95"
            style={{ background: color, color: '#0d1722' }}
          >
            {index < total - 1 ? 'Siguiente pregunta' : 'Ver resultado'}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </article>
    </div>
  )
}
