/**
 * QuickRefView — lámina de "Consulta rápida": grupos de datos duros en
 * tarjetas escaneables (label → valor mono), para uso express en terreno.
 * Los datos vienen de learningQuickRef.ts (piloto hardcodeado por máquina).
 *
 * Las filas `sensitive` (claves de servicio) se enmascaran cuando el visitante
 * no tiene sesión iniciada: el Centro es público, las claves no.
 */
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import type { QuickRefGroup } from '@/data/learningQuickRef'

export function QuickRefView({ groups, showSensitive }: {
  groups: QuickRefGroup[]
  /** true = usuario autenticado: se muestran claves de servicio. */
  showSensitive: boolean
}) {
  const [activeTitle, setActiveTitle] = useState(groups[0]?.title)

  // Si cambia de máquina (groups distinto) y el título activo ya no existe, volver al primero.
  useEffect(() => {
    if (!groups.some(g => g.title === activeTitle)) setActiveTitle(groups[0]?.title)
  }, [groups, activeTitle])

  const active = groups.find(g => g.title === activeTitle) ?? groups[0]
  if (!active) return null

  return (
    <div className="dp-qr">
      <nav className="dp-qr-tabs" aria-label="Grupos de consulta rápida">
        {groups.map(group => (
          <button
            key={group.title}
            type="button"
            aria-current={group.title === active.title}
            onClick={() => setActiveTitle(group.title)}
          >
            {group.title}
          </button>
        ))}
      </nav>
      <section className="dp-qr-card">
        <h3 className="dp-qr-title">{active.title}</h3>
        <dl className="dp-qr-rows">
          {active.rows.map(row => (
            <div key={row.label} className="dp-qr-row">
              <dt>{row.label}</dt>
              <dd>
                {row.sensitive && !showSensitive ? (
                  <span className="dp-qr-masked">
                    <Lock style={{ width: 11, height: 11 }} aria-hidden />
                    Inicia sesión para ver la clave
                  </span>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
        {active.note && <p className="dp-qr-note">{active.note}</p>}
      </section>
    </div>
  )
}
