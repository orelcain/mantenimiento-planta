/**
 * «Ver otro día»: la lista de turnos de los últimos 45 días, agrupada por día,
 * para saltar a cualquiera sin recorrer flecha por flecha. Una lista de turnos
 * que EXISTEN (no un calendario libre): así no hay días muertos que tocar.
 */
import { Check } from 'lucide-react'
import { ListCell, ListGroup, Sheet } from '@/components/piel'
import { agruparPorDia, type TurnoNavegable } from './turnosArchivo'

function fmtDia(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  const s = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function OtroDiaSheet({ open, onClose, lista, actualId, onElegir }: {
  open: boolean
  onClose: () => void
  lista: TurnoNavegable[]
  /** El turno que se está mirando: va marcado. */
  actualId: string | null
  onElegir: (t: TurnoNavegable, esVigente: boolean) => void
}) {
  const vigenteId = lista[0]?.shiftDocId ?? null
  const grupos = agruparPorDia(lista)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ver otro día"
      description="Turnos de los últimos 45 días. Toca uno para abrirlo."
      surface="grouped"
    >
      <div className="flex flex-col gap-6 pb-4">
        {grupos.map((g) => (
          <ListGroup key={g.dateKey} title={fmtDia(g.dateKey)}>
            {g.turnos.map((t) => {
              const esVigente = t.shiftDocId === vigenteId
              const marcado = t.shiftDocId === actualId
              return (
                <ListCell
                  key={t.shiftDocId}
                  data-turno={t.shiftDocId}
                  aria-current={marcado ? 'true' : undefined}
                  title={t.extraordinario ? 'Turno extraordinario' : t.shiftId}
                  subtitle={[esVigente ? 'Turno actual' : null, t.ini ? `Desde ${t.ini}` : null].filter(Boolean).join(' · ') || undefined}
                  value={t.piezas != null ? `${t.piezas.toLocaleString('es-CL')} pz` : undefined}
                  trailing={marcado ? <Check className="size-5 text-primary" aria-label="Lo estás mirando" /> : undefined}
                  chevron={false}
                  onClick={() => onElegir(t, esVigente)}
                />
              )
            })}
          </ListGroup>
        ))}
      </div>
    </Sheet>
  )
}
