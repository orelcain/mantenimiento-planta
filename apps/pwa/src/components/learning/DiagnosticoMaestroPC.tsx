/**
 * Diagnóstico de una ficha en PC (forma B del lienzo, 10-11-2026): lista de casos
 * agrupada a la izquierda y el caso elegido a la derecha, cada uno con scroll propio.
 * Reemplaza la columna única de 9.600 px; en celular sigue `DiagnosisList`.
 */
import { useMemo, useState, type ReactNode } from 'react'
import type { DiagnosisEntry } from '@/services/learningContent'
import { agruparCasos, tituloCaso } from './diagnosticoGrupos'

interface Props {
  entries: DiagnosisEntry[]
  /** Acción extra del caso (p. ej. «Abrir en Perilla 5»), la decide la página. */
  accion?: (entry: DiagnosisEntry) => ReactNode
}

const dos = (n: number) => String(n).padStart(2, '0')

export function DiagnosticoMaestroPC({ entries, accion }: Props) {
  const [consulta, setConsulta] = useState('')
  const [elegidoId, setElegidoId] = useState<string | null>(entries[0]?.id ?? null)
  const grupos = useMemo(() => agruparCasos(entries, consulta), [entries, consulta])

  const indice = Math.max(0, entries.findIndex(e => e.id === elegidoId))
  const caso = entries[indice]
  if (!caso) return null
  const titulo = tituloCaso(caso)
  const mostrarSintoma = !!caso.title && !!caso.symptom && caso.title !== caso.symptom
  const anterior = entries[indice - 1]
  const siguiente = entries[indice + 1]

  return (
    <div className="dp-md">
      <div className="dp-md-lista">
        <input
          type="search"
          className="dp-md-buscar"
          placeholder="Síntoma o código"
          aria-label="Buscar caso"
          value={consulta}
          onChange={e => setConsulta(e.target.value)}
        />
        {grupos.length === 0 && <p className="dp-md-vacio">Ningún caso coincide con «{consulta.trim()}».</p>}
        {grupos.map(g => (
          <div key={g.id} role="group" aria-label={g.titulo}>
            <div className="dp-md-grupo">
              <span>{g.titulo}{g.sinSolucion > 0 && ` · ${g.sinSolucion} sin solución del fabricante`}</span>
              <span className="dp-n">{g.casos.length}</span>
            </div>
            {g.casos.map(c => (
              <button
                key={c.entry.id}
                type="button"
                className="dp-md-it"
                aria-current={c.entry.id === caso.id}
                onClick={() => setElegidoId(c.entry.id)}
              >
                <span className="dp-n">{dos(c.numero)}</span>
                <span>{tituloCaso(c.entry)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <article className="dp-md-caso" aria-live="polite">
        <span className="dp-md-eyebrow">Caso {dos(indice + 1)} de {entries.length}</span>
        <h3 className="dp-md-titulo">{titulo}</h3>
        {mostrarSintoma && (
          <p style={{ margin: '8px 0 14px', whiteSpace: 'pre-wrap' }}>{caso.symptom}</p>
        )}
        {caso.possibleCauses.length > 0 && (
          <div className="dp-md-bloque">
            <span className="dp-lbl">Causas probables</span>
            <ul>
              {caso.possibleCauses.map((c, i) => <li key={i}><span style={{ whiteSpace: 'pre-wrap' }}>{c}</span></li>)}
            </ul>
          </div>
        )}
        {caso.solution && (
          <div className="dp-md-bloque">
            <span className="dp-lbl">Solución</span>
            <div style={{ whiteSpace: 'pre-wrap' }}>{caso.solution}</div>
          </div>
        )}
        <div className="dp-md-acciones">
          {accion?.(caso)}
          {anterior && (
            <button type="button" className="dp-btn" onClick={() => setElegidoId(anterior.id)}>‹ Caso {dos(indice)}</button>
          )}
          {siguiente && (
            <button type="button" className="dp-btn" onClick={() => setElegidoId(siguiente.id)}>Caso {dos(indice + 2)} ›</button>
          )}
        </div>
      </article>
    </div>
  )
}
