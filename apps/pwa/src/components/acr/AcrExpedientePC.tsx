/**
 * Piezas de la ventana de Causa raíz en PC: el expediente de la máquina (izquierda) y el plan de
 * acción (tabla causa → acción). Solo dibujan: el estado vive en `AcrRapidoSheet`.
 * Mockup aprobado: «D pulida», https://claude.ai/artifact/XaU32mQWJKynEijEWQGS8y
 */
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { ETIQUETA_FOTO } from '@/config/bitacora'
import { useRepuestosByCodigos } from '@/hooks/repuestos/useRepuestosByCodigos'
import {
  ETIQUETA_6M,
  ETIQUETA_FUERZA,
  ETIQUETA_NIVEL,
  type AccionAcr,
  type CausaAcr,
  type EventoRefAcr,
  type FuerzaAccion,
} from '@/services/acr/acr.types'
import type { Repeticion } from '@/services/acr/repeticion'
import { diaMes, equipoCorto, gruposPlan, partesEquipo, plazoAccion, totalesPlan } from './acrExpedienteTextos'

const FILETE = 'border-t border-border'
const PUNTO = 'mr-1.5 inline-block size-[7px] rounded-full align-[1px]'
const PUNTO_FUERZA: Record<FuerzaAccion, string> = { fuerte: 'bg-fill-ok', media: 'bg-fill-warning', debil: 'bg-fill-critical' }

export function Punto({ clase }: { clase: string }) {
  return <span aria-hidden className={`${PUNTO} ${clase}`} />
}

function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-[5px] ${FILETE}`}>
      <span className="text-footnote text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 text-right text-subhead text-foreground">{children}</span>
    </div>
  )
}

export interface RielExpedienteProps {
  evento: EventoRefAcr
  equipo: string
  turno: string
  minutos: string
  registro: string
  tutorial: boolean
  repeticion: Repeticion | null
  /** Campo «¿Qué se rompió?». */
  preguntaUno: ReactNode
  /** Fila de Jack-Knife (ausente en vitrinas y en la práctica). */
  jackKnife?: ReactNode
  /** Interruptor de pieza guardada. */
  pieza: ReactNode
}

export function RielExpediente({ evento, equipo, turno, minutos, registro, tutorial, repeticion, preguntaUno, jackKnife, pieza }: RielExpedienteProps) {
  const { tipo, nombre } = partesEquipo(equipo)
  const repuestos = useMemo(() => evento.repuestos ?? [], [evento.repuestos])
  const { bySap } = useRepuestosByCodigos(useMemo(() => repuestos.map((r) => r.codigoSAP), [repuestos]))
  const antecedentes = useMemo(
    () => [...(repeticion?.eventos ?? [])].sort((a, b) => a.fechaTurno.localeCompare(b.fechaTurno)),
    [repeticion],
  )
  const fotos = evento.fotos
  const primera = fotos[0]

  return (
    <aside aria-label="Expediente de la máquina" className="min-h-0 overflow-y-auto overscroll-contain border-r border-border bg-background px-5 pb-4 pt-[18px]">
      {tipo && <p className="text-footnote text-muted-foreground">{tipo}</p>}
      <p className="mb-2.5 text-headline text-foreground">{nombre}</p>

      {primera ? (
        <figure data-tutorial="t-fotos">
          {fotos.length > 1 ? (
            <div className="grid grid-cols-2 gap-1.5" aria-label="Fotos del evento">
              {fotos.slice(0, 4).map((f) => (
                <img key={f.path} src={f.thumbUrl ?? f.url} alt={ETIQUETA_FOTO[f.etiqueta]} className="h-[92px] w-full rounded-ctl bg-muted-foreground/10 object-cover" />
              ))}
            </div>
          ) : (
            <img src={primera.thumbUrl ?? primera.url} alt={ETIQUETA_FOTO[primera.etiqueta]} className="h-32 w-full rounded-ctl bg-muted-foreground/10 object-cover" />
          )}
          <figcaption className="mb-2.5 mt-1 text-footnote text-muted-foreground">
            {fotos.length > 1 ? `${fotos.length} fotos de la Bitácora.` : `${ETIQUETA_FOTO[primera.etiqueta]}. Viene de la Bitácora.`}
          </figcaption>
        </figure>
      ) : (
        <p data-tutorial={tutorial ? 't-fotos' : undefined} className="mb-2.5 text-footnote text-muted-foreground">
          {tutorial ? 'Aquí entran solas las fotos que subiste en la Bitácora.' : 'Sin fotos en la Bitácora.'}
        </p>
      )}

      {preguntaUno}

      <div className="mt-2.5">
        <Dato rotulo="Turno">{turno}</Dato>
        <Dato rotulo="Detención">{minutos}</Dato>
        <Dato rotulo="Registró">{registro}</Dato>
        {jackKnife}
        {repuestos.map((r) => {
          const maestro = bySap.get(r.codigoSAP)
          const detalle = [`SAP ${r.codigoSAP}.`, maestro?.posicionManual && `${maestro.posicionManual}.`, maestro?.ubicacion && `${maestro.ubicacion}.`]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={r.codigoSAP} className={`py-[5px] ${FILETE}`}>
              <p className="text-footnote text-muted-foreground">Repuesto usado</p>
              <p className="text-subhead text-foreground">{`${r.nombreComun || r.nombre || 'Repuesto'}, ${r.cantidad} UN`}</p>
              <p className="text-footnote text-muted-foreground">{detalle}</p>
            </div>
          )
        })}
      </div>

      {repeticion && (
        <section data-tutorial="t-alert" className="mt-3.5">
          <h3 className="mb-1 text-headline text-foreground">Antecedentes, 30 días</h3>
          {antecedentes.length > 0 ? (
            <>
              {antecedentes.map((e) => (
                <div key={e.id} className={`grid grid-cols-[40px_38px_minmax(0,1fr)_22px] items-baseline gap-x-1.5 py-1 ${FILETE}`}>
                  <span className="text-footnote text-muted-foreground tabular-nums">{diaMes(e.fechaTurno)}</span>
                  <span className="text-subhead text-foreground">{equipoCorto(e.equipo)}</span>
                  <span className="truncate text-subhead text-foreground" title={e.descripcion}>{e.descripcion}</span>
                  <span className="text-right text-subhead tabular-nums text-foreground">{e.minutosParada ?? ''}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-foreground pt-1 text-footnote text-foreground tabular-nums">
                <span>{repeticion.resumen.split(' · ').slice(0, 2).join(', ')}</span>
                <span className="flex-none">{`${repeticion.minutos} min`}</span>
              </div>
            </>
          ) : (
            <p className={`pt-1 text-subhead text-foreground ${FILETE}`}>{repeticion.resumen}</p>
          )}
        </section>
      )}

      <div className={`mt-3 pt-1.5 ${FILETE}`}>{pieza}</div>
    </aside>
  )
}

/** Mismas columnas en encabezado, filas y totales; la de causa crece con la ventana. */
const GRUPO = 'grid grid-cols-[78px_minmax(0,.425fr)_minmax(0,1fr)] gap-x-3'
const ACCION = 'grid w-full grid-cols-[minmax(0,1fr)_92px_84px_70px] items-start gap-x-3 text-left'
const FOCO = 'rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

const MARCA_NIVEL: Record<CausaAcr['nivel'], string> = { fisica: 't-fis', humana: 't-hum', latente: 't-lat' }

function FilaAccion({ accion, onEditar }: { accion: AccionAcr; onEditar: (id: string) => void }) {
  const plazo = plazoAccion(accion)
  const sinResponsable = accion.responsable.trim() === ''
  return (
    <button type="button" data-tutorial="t-accion" onClick={() => onEditar(accion.id)} className={`${ACCION} ${FOCO}`}>
      <span className="text-subhead text-foreground">{accion.texto.trim() || 'Sin texto'}</span>
      <span className={`text-subhead ${sinResponsable ? 'text-muted-foreground' : 'text-foreground'}`}>{sinResponsable ? 'Sin asignar' : accion.responsable}</span>
      <span className={`text-subhead tabular-nums ${plazo.apagado ? 'text-muted-foreground' : 'text-foreground'}`}>{plazo.texto}</span>
      <span className="text-subhead text-foreground"><Punto clase={PUNTO_FUERZA[accion.fuerza]} />{ETIQUETA_FUERZA[accion.fuerza]}</span>
    </button>
  )
}

export interface PlanAccionPCProps {
  causas: CausaAcr[]
  acciones: AccionAcr[]
  onEditarCausa: (id: string) => void
  onEditarAccion: (id: string) => void
  onAgregarAccion: (causaId: string) => void
}

export function PlanAccionPC({ causas, acciones, onEditarCausa, onEditarAccion, onAgregarAccion }: PlanAccionPCProps) {
  const grupos = gruposPlan(causas, acciones)
  const totales = totalesPlan(causas, acciones)
  return (
    <div data-tutorial="t-propuesta">
      <div className={`${GRUPO} border-t border-foreground py-[3px] text-footnote text-muted-foreground`}>
        <span>Nivel</span>
        <span>Causa</span>
        <div className={ACCION}>
          <span>Acción que la ataca</span>
          <span>Responsable</span>
          <span>Plazo</span>
          <span>Fuerza</span>
        </div>
      </div>
      {grupos.map(({ causa, acciones: propias }) => (
        <div key={causa?.id ?? 'sin-causa'} className={`${GRUPO} py-2 ${FILETE}`}>
          {causa ? (
            <button
              type="button"
              data-tutorial={MARCA_NIVEL[causa.nivel]}
              onClick={() => onEditarCausa(causa.id)}
              className={`col-span-2 grid grid-cols-subgrid items-start text-left ${FOCO}`}
            >
              <span>
                <span className="block text-subhead text-foreground">{ETIQUETA_NIVEL[causa.nivel]}</span>
                {causa.m6 && <span className="block text-footnote text-muted-foreground">{ETIQUETA_6M[causa.m6]}</span>}
              </span>
              <span className="text-subhead text-foreground">{causa.texto.trim() || 'Sin texto'}</span>
            </button>
          ) : (
            <p className="col-span-2 text-subhead text-muted-foreground">Sin causa asignada</p>
          )}
          <div className="flex flex-col gap-2 divide-y divide-border/60 [&>*+*]:pt-2">
            {propias.map((a) => (
              <FilaAccion key={a.id} accion={a} onEditar={onEditarAccion} />
            ))}
            {propias.length === 0 && causa && (
              <button type="button" onClick={() => onAgregarAccion(causa.id)} className={`self-start text-subhead text-primary ${FOCO}`}>
                Sin acción. Agregar
              </button>
            )}
          </div>
        </div>
      ))}
      <div className={`${GRUPO} border-t border-foreground py-1 text-footnote text-foreground tabular-nums`}>
        <span />
        <span>{totales.causas}</span>
        <div className={ACCION}>
          <span>{totales.acciones}</span>
          <span>{totales.asignadas}</span>
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
