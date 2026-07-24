/**
 * QuickRefView — lámina de "Consulta rápida": grupos de datos duros en
 * tarjetas escaneables (label → valor mono), para uso express en terreno.
 * Los datos vienen de learningQuickRef.ts (piloto hardcodeado por máquina).
 */
import type { QuickRefGroup } from '@/data/learningQuickRef'

export function QuickRefView({ groups }: { groups: QuickRefGroup[] }) {
  return (
    <div className="dp-qr">
      {groups.map(group => (
        <section key={group.title} className="dp-qr-card">
          <h3 className="dp-qr-title">{group.title}</h3>
          <dl className="dp-qr-rows">
            {group.rows.map(row => (
              <div key={row.label} className="dp-qr-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {group.note && <p className="dp-qr-note">{group.note}</p>}
        </section>
      ))}
    </div>
  )
}
