/**
 * Visor de flujos de reacción ante incidencias, en formato "dossier de campo".
 *
 * Cada Flow es una fila hairline (una abierta a la vez); al desplegar muestra el
 * disparador (barra óxido "Cuando sucede"), la secuencia numerada de acciones y
 * el cierre (barra verde). Se lee como un procedimiento de reacción del manual,
 * no como una app.
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Flow } from '@/services/learningContent'

interface Props {
  flows: Flow[]
}

export function FlowDiagramViewer({ flows }: Props) {
  const [expandedFlow, setExpandedFlow] = useState<string | null>(
    flows.length === 1 ? flows[0]?.id ?? null : null,
  )

  if (flows.length === 0) return null

  return (
    <div className="dp-acc">
      {flows.map((flow, idx) => {
        const open = expandedFlow === flow.id
        return (
          <div key={flow.id} className="dp-acc-item" data-open={open}>
            <button
              type="button"
              className="dp-acc-head"
              aria-expanded={open}
              onClick={() => setExpandedFlow(open ? null : flow.id)}
            >
              <span className="dp-acc-no">{String(idx + 1).padStart(2, '0')}</span>
              <span>
                <span className="dp-acc-title">{flow.title}</span>
                <span className="dp-acc-sub">{flow.actions.length} pasos · flujo de reacción</span>
              </span>
              <ChevronDown className="dp-acc-chev h-4 w-4" />
            </button>

            <div
              style={{
                display: 'grid',
                gridTemplateRows: open ? '1fr' : '0fr',
                transition: 'grid-template-rows 260ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                <div className="dp-acc-body-inner">
                  <div className="dp-flow-trigger">
                    <span className="dp-lbl">Cuando sucede</span>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{flow.trigger}</p>
                  </div>

                  <ol className="dp-proc-ol">
                    {flow.actions.map((action, i) => (
                      <li key={i}>
                        <span className="dp-n" />
                        <div className="dp-c">
                          <span style={{ whiteSpace: 'pre-wrap' }}>{action}</span>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div className="dp-flow-end">
                    <span className="dp-lbl">Acción completada</span>
                    <p>Verificar que el problema fue resuelto y registrar la incidencia si aplica.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
