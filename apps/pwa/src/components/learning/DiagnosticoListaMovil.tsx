/**
 * Diagnóstico de una ficha en celular (forma B del lienzo, 10-11-2026): buscador y
 * lista agrupada; tocar un caso lo despliega en su lugar (uno abierto a la vez).
 * Reemplaza la columna con los 29 casos abiertos de una vez.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DiagnosisEntry } from '@/services/learningContent'
import { agruparCasos, tituloCaso } from './diagnosticoGrupos'

interface Props {
  entries: DiagnosisEntry[]
  accion?: (entry: DiagnosisEntry) => ReactNode
}

const dos = (n: number) => String(n).padStart(2, '0')

export function DiagnosticoListaMovil({ entries, accion }: Props) {
  const [consulta, setConsulta] = useState('')
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const grupos = useMemo(() => agruparCasos(entries, consulta), [entries, consulta])

  return (
    <div className="dp-ml">
      <input
        type="search"
        className="dp-ml-buscar"
        placeholder="Síntoma o código"
        aria-label="Buscar caso"
        value={consulta}
        onChange={e => setConsulta(e.target.value)}
      />
      {grupos.length === 0 && <p className="dp-md-vacio">Ningún caso coincide con «{consulta.trim()}».</p>}
      {grupos.map(g => (
        <div key={g.id} role="group" aria-label={g.titulo}>
          <div className="dp-ml-grupo">
            <span>{g.titulo}{g.sinSolucion > 0 && ` · ${g.sinSolucion} sin solución del fabricante`}</span>
            <span className="dp-n">{g.casos.length}</span>
          </div>
          {g.casos.map(({ entry, numero }) => {
            const abierto = entry.id === abiertoId
            const mostrarSintoma = !!entry.title && !!entry.symptom && entry.title !== entry.symptom
            return (
              <div key={entry.id} className="dp-ml-caso" data-abierto={abierto}>
                <button
                  type="button"
                  className="dp-ml-it"
                  aria-expanded={abierto}
                  onClick={() => setAbiertoId(abierto ? null : entry.id)}
                >
                  <span className="dp-n">{dos(numero)}</span>
                  <span>{tituloCaso(entry)}</span>
                  <ChevronDown className="dp-ml-chev h-4 w-4" aria-hidden />
                </button>
                {abierto && (
                  <div className="dp-ml-detalle">
                    {mostrarSintoma && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{entry.symptom}</p>}
                    {entry.possibleCauses.length > 0 && (
                      <div className="dp-md-bloque">
                        <span className="dp-lbl">Causas probables</span>
                        <ul>{entry.possibleCauses.map((c, i) => <li key={i}><span style={{ whiteSpace: 'pre-wrap' }}>{c}</span></li>)}</ul>
                      </div>
                    )}
                    {entry.solution && (
                      <div className="dp-md-bloque">
                        <span className="dp-lbl">Solución</span>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{entry.solution}</div>
                      </div>
                    )}
                    {accion?.(entry)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
