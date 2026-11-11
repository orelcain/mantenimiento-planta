/**
 * AcrLectura — opción B del ACR: vista de solo lectura, en grupos (Evidencia, Causas, Acciones,
 * Verificación). Spec: SPEC_ACR.md §5. Mockup aprobado: acr-mockup.html (marco B).
 * El botón «Editar» abre la tarjeta R1 (AcrRapidoSheet); quien monta este componente decide cómo.
 */
import { Link } from 'react-router-dom'
import { Button, ListCell, ListGroup, Sheet } from '@/components/piel'
import {
  ETIQUETA_6M,
  ETIQUETA_FUERZA,
  ETIQUETA_NIVEL,
  ETIQUETA_RESULTADO,
  type Acr,
  type AccionAcr,
  type ResultadoVerificacion,
} from '@/services/acr/acr.types'
import { resumenFuerza } from '@/services/acr/acrLogica'
import { fechaVerificacion } from '@/services/acr/acrHistorial'
import { codificarEstadoJK } from '@/services/shoplogix/jackKnife'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'
import { useUbicacionJK } from './useUbicacionJK'
import { textoUbicacionJK } from './textoUbicacionJK'

export interface AcrLecturaProps {
  open: boolean
  onClose: () => void
  acr: Acr
  onEditar: () => void
  /** Si existe, la lectura deja marcar acciones hechas y el resultado de la verificación. */
  onActualizar?: (a: Acr) => void
}

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

export function AcrLectura({ open, onClose, acr, onEditar, onActualizar }: AcrLecturaProps) {
  const minutos = acr.minutosDetencion != null ? `${acr.minutosDetencion} min` : 'Sin detención'
  return (
    <Sheet
      open={open}
      onClose={onClose}
      surface="grouped"
      size="wide"
      title="Análisis de causa raíz"
      description={`${acr.equipo} · ${fechaCorta(acr.fechaTurno)} · ${minutos}`}
      actions={
        <Button data-tutorial="t-editar" variant="filled" size="block" onClick={onEditar}>
          Editar
        </Button>
      }
    >
      <AcrLecturaCuerpo acr={acr} onActualizar={onActualizar} />
    </Sheet>
  )
}

export interface AcrLecturaCuerpoProps {
  acr: Acr
  onActualizar?: (a: Acr) => void
}

/** El contenido de la lectura, sin hoja: lo usan la hoja del celular y el panel de PC. */
export function AcrLecturaCuerpo({ acr, onActualizar }: AcrLecturaCuerpoProps) {
  const fuerza = resumenFuerza(acr.acciones)
  const causaDe = (id: string | null): string =>
    (id && acr.causas.find((c) => c.id === id)?.texto) || 'Sin causa asociada'
  const cambiarAccion = (id: string, cambio: Partial<AccionAcr>) =>
    onActualizar?.({
      ...acr,
      acciones: acr.acciones.map((x) => (x.id === id ? { ...x, ...cambio } : x)),
      updatedAt: new Date(),
    })
  const cambiarResultado = (resultado: ResultadoVerificacion) =>
    onActualizar?.({ ...acr, verificacion: { ...acr.verificacion, resultado }, updatedAt: new Date() })

  return (
      /* Celular: una columna en el orden de siempre. PC (lg): izquierda = definición, evidencia y
          verificación; derecha = causas y acciones. Cada bloque fija su celda para que el orden
          del celular no cambie. */
      <div data-tutorial="t-lectura" className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-2 lg:col-start-1 lg:row-start-1">
          <p className="text-body text-foreground">{acr.definicion}</p>
          <p className="text-footnote text-muted-foreground">
            Estado: {acr.estado === 'cerrado' ? 'cerrado' : 'borrador'}
          </p>
        </div>

        <ListGroup title="Evidencia" className="lg:col-start-1 lg:row-start-2">
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

        <ListGroup title="Causas" className="lg:col-start-2 lg:row-start-1">
          {acr.causas.length === 0 && <ListCell title="Sin causas registradas" />}
          {acr.causas.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5 px-4 py-3">
              <p className="text-footnote text-muted-foreground">{ETIQUETA_NIVEL[c.nivel]}</p>
              <p className="text-body text-foreground">{c.texto}</p>
              {c.m6 && <p className="text-footnote text-muted-foreground">6M · {ETIQUETA_6M[c.m6]}</p>}
            </div>
          ))}
        </ListGroup>

        <ListGroup
          className="lg:col-start-2 lg:row-start-2"
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
              <p className="text-footnote text-muted-foreground">{ETIQUETA_FUERZA[a.fuerza]}</p>
              <p className="text-body text-foreground">{a.texto}</p>
              <p className="text-footnote text-muted-foreground">
                Ataca: {causaDe(a.causaId)}, responsable: {a.responsable || 'sin asignar'}
                {a.fechaLimite ? `, límite ${fechaCorta(a.fechaLimite)}` : ''}
              </p>
              {onActualizar && <ControlAccionHecha accion={a} onCambiar={(c) => cambiarAccion(a.id, c)} />}
            </div>
          ))}
        </ListGroup>

        {acr.causaJK !== undefined && (
          <GrupoEnJackKnife causa={acr.causaJK} className="lg:col-start-2 lg:row-start-3" />
        )}

        <ListGroup data-tutorial="t-verificacion" title="Verificación" className="lg:col-start-1 lg:row-start-3">
          <ListCell title={acr.verificacion.criterio} subtitle={`Vence el ${fechaCorta(fechaVerificacion(acr))}`} />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-body text-foreground">Resultado</span>
            <span className="text-body text-foreground">{ETIQUETA_RESULTADO[acr.verificacion.resultado]}</span>
          </div>
          {onActualizar && acr.verificacion.resultado === 'pendiente' && (
            <ControlResultado onElegir={cambiarResultado} />
          )}
        </ListGroup>
      </div>
  )
}

/** Marcar una acción hecha, o deshacerlo. Lo usan la hoja del celular y el panel de PC. */
export function ControlAccionHecha({ accion, onCambiar }: { accion: AccionAcr; onCambiar: (cambio: Partial<AccionAcr>) => void }) {
  if (accion.estado === 'hecha') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-footnote text-muted-foreground">
          {accion.hechaEn ? `Hecha el ${fechaCorta(accion.hechaEn)}` : 'Hecha'}
        </span>
        <Button variant="plain" className="min-h-11" onClick={() => onCambiar({ estado: 'pendiente', hechaEn: null })}>
          Deshacer
        </Button>
      </div>
    )
  }
  return (
    <Button
      variant="plain"
      className="min-h-11 self-start"
      onClick={() => onCambiar({ estado: 'hecha', hechaEn: fechaLocal(new Date()) })}
    >
      Marcar hecha
    </Button>
  )
}

/** Eficaz / No eficaz, mientras la verificación esté pendiente. */
export function ControlResultado({ onElegir }: { onElegir: (resultado: ResultadoVerificacion) => void }) {
  return (
    <div className="flex flex-wrap gap-3 px-4 py-3">
      <Button variant="plain" className="min-h-11" onClick={() => onElegir('eficaz')}>
        Eficaz
      </Button>
      <Button variant="plain" className="min-h-11" onClick={() => onElegir('no_eficaz')}>
        No eficaz
      </Button>
    </div>
  )
}

/** «En el Jack-Knife»: la causa del análisis, o que no aparece en el gráfico. */
function GrupoEnJackKnife({ causa, className }: { causa: string | null; className?: string }) {
  if (causa === null) {
    return (
      <ListGroup title="En el Jack-Knife" className={className}>
        <ListCell title="No aparece en el Jack-Knife" />
      </ListGroup>
    )
  }
  return <GrupoCausaJK causa={causa} className={className} />
}

function GrupoCausaJK({ causa, className }: { causa: string; className?: string }) {
  const u = useUbicacionJK(causa)
  const texto = textoUbicacionJK(u)
  if (u.estado !== 'listo' || !u.punto) {
    return (
      <ListGroup title="En el Jack-Knife" className={className}>
        <ListCell title={causa} subtitle={texto.detalle} />
      </ListGroup>
    )
  }
  const destino = `/jack-knife${codificarEstadoJK({ pl: BITACORA_PLANTA.id, v: '90', vs: 'imp', cmp: 'ant', causa })}`
  return (
    <ListGroup title="En el Jack-Knife" className={className} footer="Abre el Jack-Knife con esta causa marcada.">
      <Link
        to={destino}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body text-foreground">{causa}</span>
          <span className="text-footnote text-muted-foreground tabular-nums">{texto.detalle}</span>
        </span>
        {texto.nivel !== null && <span className="shrink-0 text-body text-foreground tabular-nums">{texto.nivel}</span>}
      </Link>
    </ListGroup>
  )
}
