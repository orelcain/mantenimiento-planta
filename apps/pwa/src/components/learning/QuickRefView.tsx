/**
 * QuickRefView — lámina de "Consulta rápida": grupos de datos duros en
 * tarjetas escaneables (label → valor mono), para uso express en terreno.
 * Los datos vienen de learningQuickRef.ts (piloto hardcodeado por máquina).
 *
 * Las filas `sensitive` (claves de servicio) se enmascaran cuando el visitante
 * no tiene sesión iniciada: el Centro es público, las claves no.
 */
import { Lock } from 'lucide-react'
import type { QuickRefGroup } from '@/data/learningQuickRef'

export function QuickRefView({ groups, showSensitive }: {
  groups: QuickRefGroup[]
  /** true = usuario autenticado: se muestran claves de servicio. */
  showSensitive: boolean
}) {
  return (
    <div className="dp-qr">
      {groups.map(group => (
        <section key={group.title} className="dp-qr-card">
          <h3 className="dp-qr-title">{group.title}</h3>
          <dl className="dp-qr-rows">
            {group.rows.map(row => (
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
          {group.note && <p className="dp-qr-note">{group.note}</p>}
        </section>
      ))}
    </div>
  )
}
