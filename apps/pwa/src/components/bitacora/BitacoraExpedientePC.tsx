import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/piel'
import type { EventoBitacora, FotoEvento } from '@/services/bitacora/bitacora.types'
import { tecnicosDelEvento } from '@/services/bitacora/bitacora.types'
import { minutosParadaDe, type ResumenBitacora } from '@/services/bitacora/resumenBitacora'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'
import { codigoEquipoDe, etiquetaTipo, nombreRepuesto, normalizarRepuestos, tieneHora, tituloDe } from '@/services/bitacora/presentacionEvento'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'
import { tituloTurno } from '@/services/bitacora/tituloTurno'
import { pluralTipo, tecnicosConTrabajos, totalesTurno } from './expedienteBitacora'

/**
 * La Bitácora del turno en PC (mockup A, Orel 10-11-2026, corregido): arriba, el turno con ‹ › y
 * el título que dice qué pasó; debajo, la franja de cifras y los técnicos; el cuerpo en dos
 * columnas con su propio desplazamiento: a la izquierda la tabla de trabajos con su total y la
 * entrega de turno; a la derecha, «Para enviar» (correo o WhatsApp, lo arma la página). El
 * teléfono no usa este componente.
 */
export function BitacoraExpedientePC({
  turnoNombre,
  horario,
  fecha,
  esActual,
  onAnterior,
  onSiguiente,
  onHoy,
  barra,
  resumen: r,
  mtbf,
  fotos,
  eventos,
  hechos,
  pendientes,
  borradores,
  numeroDe,
  cargando,
  presentes,
  onTecnicos,
  observacion,
  onObservacion,
  antes,
  onAbrir,
  onVerFoto,
  onNuevo,
  envio,
  enlaces,
}: {
  turnoNombre: string
  horario: string
  fecha: string
  esActual: boolean
  onAnterior: () => void
  onSiguiente: () => void
  onHoy: () => void
  /** Estado de sincronización (una línea). */
  barra: ReactNode
  resumen: ResumenBitacora
  mtbf: number | null
  /** Fotos de los eventos publicados. */
  fotos: number
  /** Publicados (cuentan en las cifras y en el total). */
  eventos: readonly EventoBitacora[]
  hechos: readonly EventoBitacora[]
  pendientes: readonly EventoBitacora[]
  borradores: readonly EventoBitacora[]
  numeroDe: ReadonlyMap<string, number>
  cargando: boolean
  presentes: readonly string[]
  onTecnicos: () => void
  observacion: { texto: string; autor: string | null }
  onObservacion: () => void
  /** Pendientes y borradores de turnos anteriores: van sobre la tabla. */
  antes?: ReactNode
  onAbrir: (e: EventoBitacora) => void
  onVerFoto: (e: EventoBitacora, fotos: FotoEvento[], indice: number) => void
  onNuevo: () => void
  /** La columna «Para enviar» completa (la arma la página). */
  envio: ReactNode
  enlaces: { etiqueta: ReactNode; onClick: () => void }[]
}) {
  const total = totalesTurno(eventos)
  const tecnicos = tecnicosConTrabajos(eventos, presentes)
  const cifras: { rotulo: string; valor: string }[] = [
    { rotulo: 'Detención anotada', valor: formatoMinutos(r.minutosParada) },
    { rotulo: 'Fallas', valor: String(r.fallas) },
    ...(r.afectados > 0 ? [{ rotulo: r.afectados === 1 ? 'Siguió gracias a Mantención' : 'Siguieron gracias a Mantención', valor: String(r.afectados) }] : []),
    ...(r.enVentana > 0 ? [{ rotulo: 'Sin detener producción', valor: String(r.enVentana) }] : []),
    {
      rotulo: 'MTTR · MTBF',
      valor: r.fallas > 0 ? `${r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin)} · ${mtbf == null ? '—' : formatoMinutos(mtbf)}` : 'sin fallas',
    },
    { rotulo: 'Pendientes', valor: String(r.pendientesDelTurno) },
    { rotulo: 'Fotos', valor: String(fotos) },
  ]

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col">
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAnterior}
              aria-label="Turno anterior"
              className="flex size-9 shrink-0 items-center justify-center rounded-ctl border border-border text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="px-1 text-[13px] text-muted-foreground first-letter:uppercase">
              {turnoNombre} · {fecha} · {horario}
            </p>
            <button
              type="button"
              onClick={onSiguiente}
              aria-label="Turno siguiente"
              className="flex size-9 shrink-0 items-center justify-center rounded-ctl border border-border text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight className="size-4" />
            </button>
            {!esActual && (
              <button type="button" onClick={onHoy} className="inline-flex min-h-[36px] items-center text-[13px] text-primary hover:underline">
                Ir al turno en curso
              </button>
            )}
            <div className="text-[13px]">{barra}</div>
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold leading-tight">{tituloTurno(r, fotos)}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <nav aria-label="Más de la bitácora" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            {enlaces.map((l, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-muted-foreground/60" aria-hidden>
                    ·
                  </span>
                )}
                <button type="button" onClick={l.onClick} className="inline-flex min-h-[36px] items-center gap-1 text-primary hover:underline">
                  {l.etiqueta}
                </button>
              </span>
            ))}
          </nav>
          <Button size="sm" className="h-auto min-h-[36px] !rounded-ctl px-3.5 text-[15px] whitespace-nowrap" onClick={onNuevo}>
            <Plus /> Nuevo evento
          </Button>
        </div>
      </header>

      <dl className="mt-3 flex flex-wrap gap-x-9 gap-y-2 border-y border-border py-3">
        {cifras.map((c) => (
          <div key={c.rotulo} className="flex flex-col">
            <dt className="text-[13px] text-muted-foreground">{c.rotulo}</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{c.valor}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
        <span className="text-muted-foreground">Técnicos</span>
        {tecnicos.length === 0 && <span className="italic text-muted-foreground">Nadie marcado todavía</span>}
        {tecnicos.map((t) => (
          <span key={t.nombre} className="tabular-nums">
            {t.nombre} · {t.trabajos} {t.trabajos === 1 ? 'trabajo' : 'trabajos'}
            {!t.presente && <span className="text-muted-foreground"> (no marcado)</span>}
          </span>
        ))}
        <button type="button" onClick={onTecnicos} className="inline-flex min-h-[36px] items-center text-primary hover:underline">
          {presentes.length ? 'Editar' : 'Agregar'}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_540px] gap-7 pt-4">
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pb-6 pr-1 [&_button]:text-[15px] [&_.text-headline]:text-[15px] [&_.text-body]:text-[15px] [&_.text-subhead]:text-[15px] [&_.text-caption]:text-[13px] [&_.text-xs]:text-[13px]">
          {antes}
          {cargando ? (
            <div className="flex flex-col gap-2 pt-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-ctl bg-muted-foreground/10 motion-reduce:animate-none" />
              ))}
            </div>
          ) : hechos.length === 0 && borradores.length === 0 && pendientes.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[15px] font-semibold">Aún no hay trabajos en este turno</p>
              <p className="mx-auto mt-1 max-w-[46ch] text-[15px] text-muted-foreground">
                Registra fallas, ajustes y rondas con sus fotos. Lo que se carga en el celular aparece aquí solo.
              </p>
            </div>
          ) : (
            <>
              {(hechos.length > 0 || borradores.length > 0) && (
                <TablaTrabajos filas={[...hechos, ...borradores]} numeroDe={numeroDe} onAbrir={onAbrir} onVerFoto={onVerFoto} total={total} cierra />
              )}
              {pendientes.length > 0 && (
                <div>
                  <h2 className="flex items-center gap-1.5 pb-1 pt-1 text-[15px] font-semibold">
                    <span className="size-2 shrink-0 rounded-full bg-ink-warn" aria-hidden />
                    Pendiente para el turno siguiente
                    <span className="font-normal text-muted-foreground tabular-nums"> · {pendientes.length}</span>
                  </h2>
                  <TablaTrabajos filas={pendientes} numeroDe={numeroDe} onAbrir={onAbrir} onVerFoto={onVerFoto} />
                </div>
              )}
            </>
          )}

          <div>
            <h2 className="pb-1.5 text-[15px] font-semibold">Entrega de turno</h2>
            <button
              type="button"
              onClick={onObservacion}
              className="min-h-[36px] w-full rounded-ctl border border-border px-2.5 py-2 text-left text-[15px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {observacion.texto ? (
                <>
                  <span className="line-clamp-4 whitespace-pre-line">{observacion.texto}</span>
                  {observacion.autor && <span className="mt-1 block text-[13px] text-muted-foreground">{observacion.autor}</span>}
                </>
              ) : (
                <span className="text-muted-foreground">Agregar nota: estado de la planta…</span>
              )}
            </button>
          </div>
        </div>

        <aside aria-label="Para enviar" className="flex min-h-0 flex-col overflow-y-auto border-l border-border pl-7 [&_.text-caption]:text-[13px] [&_.text-body]:text-[15px] [&_button]:text-[15px]">
          <h2 className="pb-3 text-[15px] font-semibold">Para enviar</h2>
          <div className="flex flex-col gap-3">{envio}</div>
        </aside>
      </div>
    </div>
  )
}

/** Columnas: Nº · equipo y qué se hizo · quién · fotos. */
const COLUMNAS = 'grid grid-cols-[32px_minmax(0,1fr)_150px_84px] gap-x-4'

function TablaTrabajos({
  filas,
  numeroDe,
  onAbrir,
  onVerFoto,
  total,
  cierra,
}: {
  filas: readonly EventoBitacora[]
  numeroDe: ReadonlyMap<string, number>
  onAbrir: (e: EventoBitacora) => void
  onVerFoto: (e: EventoBitacora, fotos: FotoEvento[], indice: number) => void
  total?: ReturnType<typeof totalesTurno>
  cierra?: boolean
}) {
  const publicados = filas.filter((e) => e.estado !== 'borrador').length
  return (
    <div role="table" aria-label="Trabajos" className="text-[15px]">
      <div role="row" className={`${COLUMNAS} border-b border-border py-2 text-[13px] text-muted-foreground`}>
        <span role="columnheader">N°</span>
        <span role="columnheader">Equipo y qué se hizo</span>
        <span role="columnheader">Quién</span>
        <span role="columnheader">Fotos</span>
      </div>
      {filas.map((e) => (
        <FilaTrabajo key={e.id} evento={e} numero={numeroDe.get(e.id)} onAbrir={() => onAbrir(e)} onVerFoto={(f, i) => onVerFoto(e, f, i)} />
      ))}
      {cierra && total && (
        <div role="row" className={`${COLUMNAS} items-baseline border-t border-border py-2.5 font-semibold`}>
          <span role="cell" />
          <span role="cell">
            {publicados} {publicados === 1 ? 'trabajo' : 'trabajos'}, {total.equipos} {total.equipos === 1 ? 'equipo' : 'equipos'} ·{' '}
            <span className="font-normal text-[13px] text-muted-foreground">
              {total.tipos.map(([t, n]) => `${n} ${pluralTipo(t, n)}`).join(', ')}
              {total.repuestos > 0 && ` · ${total.repuestos} ${total.repuestos === 1 ? 'repuesto' : 'repuestos'}`}
            </span>
          </span>
          <span role="cell" className="text-[13px] font-normal text-muted-foreground">
            {total.tecnicos} {total.tecnicos === 1 ? 'técnico' : 'técnicos'}
          </span>
          <span role="cell" className="text-[13px] font-normal text-muted-foreground">
            {total.fotos} {total.fotos === 1 ? 'foto' : 'fotos'}
          </span>
        </div>
      )}
    </div>
  )
}

function FilaTrabajo({
  evento: e,
  numero,
  onAbrir,
  onVerFoto,
}: {
  evento: EventoBitacora
  numero?: number
  onAbrir: () => void
  onVerFoto: (fotos: FotoEvento[], indice: number) => void
}) {
  const borrador = e.estado === 'borrador'
  const titulo = nombreEquipoLegible(tituloDe(e))
  const equipo = nombreEquipoLegible(e.equipo) || (borrador ? 'Sin equipo todavía' : 'Sin equipo')
  const codigo = codigoEquipoDe(e)
  const quien = tecnicosDelEvento(e).join(', ')
  const repuestos = normalizarRepuestos(e.repuestos)
  const fotosEvento = e.fotos ?? []
  const parada = minutosParadaDe(e)
  // El impacto va en el color de aviso: lo que costó (o no) a la línea, con su palabra.
  const impacto =
    e.impacto === 'con-parada'
      ? `Detuvo la máquina${parada ? ` ${formatoMinutos(parada)}` : ''}`
      : e.impacto === 'afecta-sin-detener'
        ? `Afectó sin detener${e.contingencia?.trim() ? `: ${e.contingencia.trim()}` : ''}`
        : e.impacto === 'en-ventana'
          ? `Sin detener${e.ventana?.trim() ? `: ${e.ventana.trim()}` : ' producción'}`
          : null
  const debajo = [codigo || 'sin código', tieneHora(e) ? `${e.horaInicio}${e.horaTermino ? `–${e.horaTermino}` : ''}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault()
          onAbrir()
        }
      }}
      className={`${COLUMNAS} cursor-pointer items-start border-b border-border/60 py-2.5 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
    >
      <span role="cell" className="pt-0.5 text-[13px] text-muted-foreground tabular-nums">
        {numero ?? ''}
      </span>
      <span role="cell" className="min-w-0">
        <span className="block font-semibold">
          {equipo}
          <span className="text-[13px] font-normal text-muted-foreground">
            {' · '}
            {borrador ? 'En redacción' : etiquetaTipo(e)}
          </span>
        </span>
        <span className="block text-[13px] text-muted-foreground tabular-nums">{debajo}</span>
        {titulo && <span className="mt-1 block">{titulo}</span>}
        {e.descripcion?.trim() ? (
          <span className="mt-0.5 block whitespace-pre-line">{e.descripcion}</span>
        ) : (
          !titulo && <span className="mt-1 block italic text-muted-foreground">Sin descripción todavía</span>
        )}
        {impacto && <span className="mt-0.5 block text-[13px] text-ink-warn">{impacto}</span>}
        {e.pendiente && !borrador && <span className="mt-0.5 block text-[13px] text-ink-warn">Pendiente para el turno siguiente</span>}
        {repuestos.length > 0 && (
          <span className="mt-0.5 block text-[13px] text-muted-foreground">
            Repuestos: {repuestos.map((x) => `${x.cantidad > 1 ? `${x.cantidad}× ` : ''}${(x.nombreComun ?? '').trim() || nombreRepuesto(x) || x.codigoSAP}`).join(' · ')}
          </span>
        )}
      </span>
      <span role="cell" className="min-w-0">
        {quien || <span className="text-muted-foreground">sin técnico marcado</span>}
      </span>
      <span role="cell" className="flex flex-wrap items-center gap-1">
        {fotosEvento.length === 0 ? (
          <span className="text-[13px] text-muted-foreground">sin fotos</span>
        ) : (
          <>
            {fotosEvento.slice(0, 2).map((f, i) => (
              <button
                key={f.path || f.url}
                type="button"
                aria-label={`Ver foto ${i + 1} de ${fotosEvento.length}`}
                onClick={(ev) => {
                  ev.stopPropagation()
                  onVerFoto([...fotosEvento], i)
                }}
                className="size-10 shrink-0 overflow-hidden rounded-ctl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img src={f.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
            <span className="pl-0.5 text-[13px] text-muted-foreground tabular-nums">{fotosEvento.length}</span>
          </>
        )}
      </span>
    </div>
  )
}
