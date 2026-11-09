/**
 * EscogerDetencionSheet — antes de abrir un análisis desde el Jack-Knife, elegir cuál de las
 * detenciones de la causa se analiza. Opción A aprobada (acr-desde-jk.html). Spec: §3.
 * Muestra las 4 más largas; «Ver las N» muestra todas. La primera viene elegida.
 */
import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Button, ListCell, ListGroup, Sheet } from '@/components/piel'
import { detencionesDeCausa, type DetencionJK } from '@/services/acr/desdeJackKnife'
import { agruparComentarios, comentariosDe, type TurnoJK } from '@/services/shoplogix/jackKnife'

const VISIBLES = 4

export interface EscogerDetencionSheetProps {
  open: boolean
  onClose: () => void
  /** La causa del Jack-Knife: título de la hoja. */
  causa: string
  /** Turnos de la ventana actual del Jack-Knife (los mismos de la lámina). */
  turnos: readonly TurnoJK[]
  desde: number
  hasta: number
  /** «Seguir»: se llama con la detención elegida. */
  onSeguir: (d: DetencionJK) => void
}

const claveDe = (d: DetencionJK): string => `${d.turnoId}:${d.inicioMs}`

/** DD-MM-AAAA, como en la lectura del análisis. */
const ddmmaaaa = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`
/** DD-MM, como en la lista. */
const ddmm = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`

export function EscogerDetencionSheet({ open, onClose, causa, turnos, desde, hasta, onSeguir }: EscogerDetencionSheetProps) {
  const detenciones = useMemo(() => detencionesDeCausa(turnos, desde, hasta, causa), [turnos, desde, hasta, causa])
  const repetido = useMemo(() => {
    const grupos = agruparComentarios(comentariosDe(turnos, desde, hasta, causa, Infinity))
    return grupos[0] && grupos[0].n >= 2 ? grupos[0] : null
  }, [turnos, desde, hasta, causa])

  const [elegida, setElegida] = useState<string | null>(null)
  const [verTodas, setVerTodas] = useState(false)

  const total = detenciones.length
  const visibles = verTodas ? detenciones : detenciones.slice(0, VISIBLES)
  // La primera (la más larga) viene elegida; si la elegida ya no está en la lista, también.
  const actual = detenciones.find((d) => claveDe(d) === elegida) ?? detenciones[0] ?? null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      surface="grouped"
      size="wide"
      title={causa}
      headerAction={
        <Button variant="plain" className="min-h-11" disabled={!actual} onClick={() => actual && onSeguir(actual)}>
          Seguir
        </Button>
      }
    >
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="px-1 text-title3 font-normal text-foreground">¿Cuál detención analizamos?</p>
          <ListGroup>
            {total === 0 && <ListCell title="No hay detenciones de esta causa en el período." />}
            <div role="radiogroup" aria-label="Detenciones de la causa" className="flex flex-col">
              {visibles.map((d) => {
                const activa = actual !== null && claveDe(d) === claveDe(actual)
                return (
                  <button
                    key={claveDe(d)}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => setElegida(claveDe(d))}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-footnote text-muted-foreground tabular-nums">{`${ddmm(d.dateKey)}, ${d.shiftId}`}</span>
                      {d.comentario ? (
                        <span className="text-body text-foreground">{d.comentario}</span>
                      ) : (
                        <span className="text-footnote text-muted-foreground">Sin comentario en Shoplogix</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-footnote text-muted-foreground tabular-nums">{`${Math.round(d.min)} min`}</span>
                      {activa && <Check className="h-4 w-4 text-primary" aria-hidden />}
                    </span>
                  </button>
                )
              })}
            </div>
            {total > VISIBLES && !verTodas && (
              <button
                type="button"
                onClick={() => setVerTodas(true)}
                className="flex min-h-[44px] w-full items-center px-4 py-3 text-left text-body text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {`Ver las ${total}`}
              </button>
            )}
          </ListGroup>
          {total > VISIBLES && (
            <p className="px-1 text-footnote text-muted-foreground tabular-nums">
              {`Las ${VISIBLES} más largas de ${total} en este período.`}
            </p>
          )}
          {repetido && (
            <p className="px-1 text-footnote text-muted-foreground">
              {`«${repetido.texto}» se repite ${repetido.n} veces.`}
            </p>
          )}
        </div>

        <ListGroup title="Pasa al análisis">
          <ListCell title="Equipo" value={causa} />
          <ListCell title="Fecha" value={actual ? ddmmaaaa(actual.dateKey) : 'Sin fecha'} />
          <ListCell title="Detención" value={actual ? `${Math.round(actual.min)} min` : 'Sin detención'} />
          <ListCell title="Qué se rompió" value={actual?.comentario ?? 'Hay que escribirlo'} />
        </ListGroup>
      </div>
    </Sheet>
  )
}
