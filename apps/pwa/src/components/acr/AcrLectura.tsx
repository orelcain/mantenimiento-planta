/**
 * AcrLectura — opción B del ACR: vista de solo lectura, en grupos (Evidencia, Causas, Acciones,
 * Verificación). Spec: SPEC_ACR.md §5. Mockup aprobado: acr-mockup.html (marco B).
 * El botón «Editar» abre la hoja guiada (AcrSheet); quien monta este componente decide cómo.
 */
import { Button, ListCell, ListGroup, Pill, Sheet } from '@/components/piel'
import {
  ETIQUETA_6M,
  ETIQUETA_FUERZA,
  ETIQUETA_NIVEL,
  ETIQUETA_RESULTADO,
  TONO_FUERZA,
  TONO_NIVEL,
  type Acr,
  type ResultadoVerificacion,
} from '@/services/acr/acr.types'
import { resumenFuerza } from '@/services/acr/acrLogica'

export interface AcrLecturaProps {
  open: boolean
  onClose: () => void
  acr: Acr
  onEditar: () => void
}

const TONO_RESULTADO: Record<ResultadoVerificacion, 'neutral' | 'ok' | 'critical'> = {
  pendiente: 'neutral',
  eficaz: 'ok',
  no_eficaz: 'critical',
}

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

export function AcrLectura({ open, onClose, acr, onEditar }: AcrLecturaProps) {
  const minutos = acr.minutosDetencion != null ? `${acr.minutosDetencion} min` : 'Sin detención'
  const fuerza = resumenFuerza(acr.acciones)
  const causaDe = (id: string | null): string =>
    (id && acr.causas.find((c) => c.id === id)?.texto) || 'Sin causa asociada'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      surface="grouped"
      title="Análisis de causa raíz"
      description={`${acr.equipo} · ${fechaCorta(acr.fechaTurno)} · ${minutos}`}
      actions={
        <Button variant="filled" size="block" onClick={onEditar}>
          Editar
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-body text-foreground">{acr.definicion}</p>
          <p className="text-footnote text-muted-foreground">
            Estado: {acr.estado === 'cerrado' ? 'cerrado' : 'borrador'}
          </p>
        </div>

        <ListGroup title="Evidencia">
          {acr.evidencias.length === 0 && (
            <ListCell
              title="Sin fotos"
              subtitle={acr.piezaGuardada ? 'Pieza dañada guardada' : 'Falta evidencia'}
            />
          )}
          {acr.evidencias.map((e) => (
            <ListCell
              key={e.path}
              title={e.nota || 'Foto'}
              subtitle={e.origen === 'bitacora' ? 'Desde el evento de Bitácora' : 'Agregada en el análisis'}
            />
          ))}
          {acr.evidencias.length > 0 && (
            <ListCell
              title="Pieza dañada guardada antes de limpiar"
              value={acr.piezaGuardada ? 'Sí' : 'No'}
            />
          )}
        </ListGroup>

        <ListGroup title="Causas">
          {acr.causas.length === 0 && <ListCell title="Sin causas registradas" />}
          {acr.causas.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5 px-4 py-3">
              <Pill tone={TONO_NIVEL[c.nivel]} className="self-start">
                {ETIQUETA_NIVEL[c.nivel]}
              </Pill>
              <p className="text-body text-foreground">{c.texto}</p>
              {c.m6 && <p className="text-footnote text-muted-foreground">6M · {ETIQUETA_6M[c.m6]}</p>}
            </div>
          ))}
        </ListGroup>

        <ListGroup
          title="Acciones"
          footer={
            fuerza.fuertePct == null
              ? 'Sin acciones todavía.'
              : `${Math.round(fuerza.fuertePct)} % de las acciones son fuertes.`
          }
        >
          {acr.acciones.length === 0 && <ListCell title="Sin acciones registradas" />}
          {acr.acciones.map((a) => (
            <div key={a.id} className="flex flex-col gap-1.5 px-4 py-3">
              <Pill tone={TONO_FUERZA[a.fuerza]} className="self-start">
                {ETIQUETA_FUERZA[a.fuerza]}
              </Pill>
              <p className="text-body text-foreground">{a.texto}</p>
              <p className="text-footnote text-muted-foreground">
                Ataca: {causaDe(a.causaId)} · Responsable: {a.responsable || 'sin asignar'}
                {a.fechaLimite ? ` · Límite ${fechaCorta(a.fechaLimite)}` : ''}
              </p>
            </div>
          ))}
        </ListGroup>

        <ListGroup title="Verificación">
          <ListCell title={acr.verificacion.criterio} subtitle={`${acr.verificacion.dias} días`} />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-body text-foreground">Resultado</span>
            <Pill tone={TONO_RESULTADO[acr.verificacion.resultado]}>
              {ETIQUETA_RESULTADO[acr.verificacion.resultado]}
            </Pill>
          </div>
        </ListGroup>
      </div>
    </Sheet>
  )
}
