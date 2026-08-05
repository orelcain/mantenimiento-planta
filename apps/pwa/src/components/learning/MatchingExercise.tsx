/**
 * MatchingExercise — ejercicio de relacionar término ↔ definición en dos
 * columnas hairline (sin piezas de rompecabezas ni color de bloque). Click en
 * un término, luego en su definición; si coincide queda marcado en verde, si
 * no, se resalta en rojo un instante y vuelve a quedar libre.
 */
import { useMemo, useState } from 'react'

export interface MatchingPair {
  id: string
  term: string
  definition: string
}

export function MatchingExercise({ pairs }: { pairs: MatchingPair[] }) {
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null)
  const [wrongDef, setWrongDef] = useState<string | null>(null)

  const shuffledDefs = useMemo(
    () => [...pairs].sort((a, b) => a.definition.localeCompare(b.definition)),
    [pairs],
  )

  const done = matched.size === pairs.length

  const pickTerm = (id: string) => {
    if (matched.has(id)) return
    setSelectedTerm(id === selectedTerm ? null : id)
  }

  const pickDefinition = (defId: string) => {
    if (!selectedTerm || matched.has(defId)) return
    if (selectedTerm === defId) {
      setMatched(prev => new Set(prev).add(defId))
      setSelectedTerm(null)
    } else {
      setWrongDef(defId)
      setTimeout(() => setWrongDef(null), 500)
    }
  }

  return (
    <div className="dp-match">
      <div className="dp-match-grid">
        <div>
          {pairs.map(p => (
            <button
              key={p.id}
              type="button"
              className="dp-match-item"
              disabled={matched.has(p.id)}
              data-state={matched.has(p.id) ? 'matched' : selectedTerm === p.id ? 'selected' : undefined}
              onClick={() => pickTerm(p.id)}
            >
              {p.term}
            </button>
          ))}
        </div>
        <div>
          {shuffledDefs.map(p => (
            <button
              key={p.id}
              type="button"
              className="dp-match-item"
              disabled={matched.has(p.id)}
              data-state={matched.has(p.id) ? 'matched' : wrongDef === p.id ? 'wrong' : undefined}
              onClick={() => pickDefinition(p.id)}
            >
              {p.definition}
            </button>
          ))}
        </div>
      </div>
      <div className={`dp-match-status ${done ? 'is-done' : ''}`}>
        {done ? `Completo — ${pairs.length}/${pairs.length}` : `${matched.size}/${pairs.length} relacionados`}
      </div>
    </div>
  )
}
