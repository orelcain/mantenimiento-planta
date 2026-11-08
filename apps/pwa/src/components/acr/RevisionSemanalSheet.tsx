/**
 * RevisionSemanalSheet — la lista semanal del supervisor (SPEC_ACR_R1.md §6). Se abre desde la
 * métrica «Acciones fuertes» de Trabajo de Mantención. Lista las acciones de los ACR del período,
 * primero las débiles. Solo quien puede editar cambia la fuerza; el resto ve la lista.
 */
import { useEffect, useState } from 'react'
import { ListGroup, Pill, SegmentedControl, Sheet } from '@/components/piel'
import { guardarAcr } from '@/services/acr/acrFirestore'
import { resumenFuerza } from '@/services/acr/acrLogica'
import {
  ETIQUETA_FUERZA,
  TONO_FUERZA,
  type Acr,
  type AccionAcr,
  type FuerzaAccion,
} from '@/services/acr/acr.types'
import { logger } from '@/lib/logger'

export interface RevisionSemanalSheetProps {
  open: boolean
  onClose: () => void
  /** Los ACR del período (la página ya los carga). */
  acrs: Acr[]
  /** Texto del período, p. ej. «21-09-2026 → 27-09-2026». */
  periodo: string
  /** Supervisor o admin: solo entonces se puede cambiar la fuerza. */
  puedeEditar: boolean
  /** Reemplaza el guardado en Firestore (la vitrina lo usa). */
  onGuardar?: (acr: Acr) => void
}

const ORDEN: Record<FuerzaAccion, number> = { debil: 0, media: 1, fuerte: 2 }
const FUERZA_SEGMENTOS = (['debil', 'media', 'fuerte'] as const).map((f) => ({ value: f, label: ETIQUETA_FUERZA[f] }))

interface FilaRevision {
  acr: Acr
  accion: AccionAcr
}

function filasDelPeriodo(acrs: readonly Acr[]): FilaRevision[] {
  return acrs
    .flatMap((acr) => acr.acciones.map((accion) => ({ acr, accion })))
    .sort((x, y) => ORDEN[x.accion.fuerza] - ORDEN[y.accion.fuerza])
}

export function RevisionSemanalSheet({ open, onClose, acrs, periodo, puedeEditar, onGuardar }: RevisionSemanalSheetProps) {
  // Copia local: al cambiar una fuerza la lista se actualiza sin esperar a recargar el período.
  const [lista, setLista] = useState<Acr[]>(acrs)
  useEffect(() => setLista(acrs), [acrs])

  const filas = filasDelPeriodo(lista)
  const resumen = resumenFuerza(filas.map((f) => f.accion))

  const cambiarFuerza = (acrId: string, accionId: string, fuerza: FuerzaAccion) => {
    const actual = lista.find((a) => a.id === acrId)
    if (!actual) return
    const siguiente: Acr = {
      ...actual,
      acciones: actual.acciones.map((x) => (x.id === accionId ? { ...x, fuerza } : x)),
      updatedAt: new Date(),
    }
    setLista((prev) => prev.map((a) => (a.id === acrId ? siguiente : a)))
    if (onGuardar) {
      onGuardar(siguiente)
      return
    }
    guardarAcr(siguiente, false).catch((e: unknown) => {
      logger.error('No se pudo guardar la fuerza de la acción', e instanceof Error ? e : undefined, { acrId })
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      surface="grouped"
      title="Revisión semanal"
      description={periodo}
      actions={
        <p className="text-footnote text-muted-foreground">
          {puedeEditar
            ? 'Toca la fuerza para subirla. Se guarda al tocar.'
            : 'Solo lectura: la fuerza la cambia un supervisor.'}
        </p>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-body font-semibold tabular-nums text-foreground">
          {resumen.fuertePct == null
            ? 'Sin acciones en el período'
            : `${Math.round(resumen.fuertePct)} % fuertes · ${resumen.fuerte} de ${resumen.acciones} acciones`}
        </p>

        {filas.length === 0 ? (
          <ListGroup>
            <p className="px-4 py-3 text-body text-muted-foreground">No hay ACR con acciones en este período.</p>
          </ListGroup>
        ) : (
          <ListGroup title="Acciones, primero las débiles">
            {filas.map(({ acr, accion }) => (
              <div key={accion.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Pill tone={TONO_FUERZA[accion.fuerza]} className="shrink-0">
                    {ETIQUETA_FUERZA[accion.fuerza]}
                  </Pill>
                  <p className="text-body text-foreground">{accion.texto}</p>
                </div>
                <p className="text-footnote text-muted-foreground">
                  Falla: {acr.definicion} · Equipo: {acr.equipo}
                </p>
                {puedeEditar && (
                  <SegmentedControl
                    ariaLabel={`Fuerza de la acción: ${accion.texto}`}
                    value={accion.fuerza}
                    onChange={(f) => cambiarFuerza(acr.id, accion.id, f)}
                    segments={FUERZA_SEGMENTOS}
                  />
                )}
              </div>
            ))}
          </ListGroup>
        )}
      </div>
    </Sheet>
  )
}
