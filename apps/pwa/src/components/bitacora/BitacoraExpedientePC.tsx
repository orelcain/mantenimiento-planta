import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Plus, Share } from 'lucide-react'
import { Button } from '@/components/piel'
import type { EventoBitacora, FotoEvento } from '@/services/bitacora/bitacora.types'
import { tecnicosDelEvento } from '@/services/bitacora/bitacora.types'
import { minutosParadaDe, type ResumenBitacora } from '@/services/bitacora/resumenBitacora'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'
import { codigoEquipoDe, etiquetaTipo, nombreRepuesto, normalizarRepuestos, tieneHora, tituloDe } from '@/services/bitacora/presentacionEvento'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'
import { tecnicosConTrabajos, tituloTurno, totalesTurno } from './expedienteBitacora'

/**
 * La Bitácora del turno en PC como expediente (opción A, Orel 10-11-2026): a la
 * izquierda el turno y sus cifras (300 px); a la derecha un título que dice qué
 * pasó y una tabla de trabajos que cierra con su total. El correo y WhatsApp
 * van en «Compartir». El teléfono no usa este componente.
 */
export function BitacoraExpedientePC({
  turnoNombre,
  horario,
  fecha,
  planta,
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
  onCompartir,
  compartiendo,
  enlaces,
}: {
  turnoNombre: string
  horario: string
  fecha: string
  planta: string
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
  onCompartir: () => void
  compartiendo?: boolean
  enlaces: { etiqueta: ReactNode; onClick: () => void }[]
}) {
  const total = totalesTurno(eventos)
  const tecnicos = tecnicosConTrabajos(eventos, presentes)
  const cifras: { rotulo: string; valor: string; tenue?: boolean }[] = [
    { rotulo: 'Detención anotada', valor: formatoMinutos(r.minutosParada) },
    { rotulo: 'Fallas', valor: String(r.fallas) },
    ...(r.afectados > 0 ? [{ rotulo: 'Siguió gracias a Mantención', valor: String(r.afectados) }] : []),
    ...(r.enVentana > 0 ? [{ rotulo: 'Sin detener producción', valor: String(r.enVentana) }] : []),
    r.fallas > 0
      ? { rotulo: 'MTTR · MTBF', valor: `${r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin)} · ${mtbf == null ? '—' : formatoMinutos(mtbf)}` }
      : { rotulo: 'MTTR · MTBF', valor: 'sin fallas', tenue: true },
    { rotulo: 'Pendientes', valor: String(r.pendientesDelTurno) },
  ]

  return (
    <div className="grid min-h-[calc(100dvh-6rem)] grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-[16px] border border-border bg-background">
      <aside aria-label="Turno" className="flex flex-col border-r border-border bg-card px-5 pb-4 pt-5">
        <p className="text-footnote text-muted-foreground">Bitácora · {planta}</p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onAnterior}
            aria-label="Turno anterior"
            className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[17px] font-semibold leading-tight">{turnoNombre}</p>
            <p className="truncate text-[13px] text-muted-foreground first-letter:uppercase">{horario}</p>
          </div>
          <button
            type="button"
            onClick={onSiguiente}
            aria-label="Turno siguiente"
            className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-border text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {!esActual && (
          <button type="button" onClick={onHoy} className="mt-1.5 self-center text-[13px] text-primary hover:underline">
            Ir al turno en curso
          </button>
        )}
        <div className="mt-2 text-[13px]">{barra}</div>

        <p className="mt-5 text-[22px] font-semibold leading-tight tabular-nums">
          {r.eventos} {r.eventos === 1 ? 'trabajo' : 'trabajos'}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {fotos} {fotos === 1 ? 'foto' : 'fotos'} · {total.repuestos} {total.repuestos === 1 ? 'repuesto usado' : 'repuestos usados'}
        </p>
        <dl className="mt-3.5 border-t border-border">
          {cifras.map((c) => (
            <div key={c.rotulo} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 text-[15px] last:border-b-0">
              <dt>{c.rotulo}</dt>
              <dd className={`tabular-nums ${c.tenue ? 'text-muted-foreground' : ''}`}>{c.valor}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold">Técnicos</h2>
          <button type="button" onClick={onTecnicos} className="text-[13px] text-primary hover:underline">
            {presentes.length ? 'Editar' : 'Agregar'}
          </button>
        </div>
        <ul className="mt-1.5 border-t border-border">
          {tecnicos.length === 0 && <li className="py-2 text-[15px] italic text-muted-foreground">Nadie marcado todavía</li>}
          {tecnicos.map((t) => (
            <li key={t.nombre} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-[7px] text-[15px] last:border-b-0">
              <span className="min-w-0 truncate">
                {t.nombre}
                {!t.presente && <span className="text-[13px] text-muted-foreground"> · no marcado</span>}
              </span>
              <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                {t.trabajos} {t.trabajos === 1 ? 'trabajo' : 'trabajos'}
              </span>
            </li>
          ))}
        </ul>

        <h2 className="mb-1.5 mt-5 text-[17px] font-semibold">Entrega de turno</h2>
        <button
          type="button"
          onClick={onObservacion}
          className="min-h-[36px] rounded-[8px] border border-border px-2.5 py-2 text-left text-[15px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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

        <div className="flex-1" />
        <nav aria-label="Más de la bitácora" className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {enlaces.map((l, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground/60" aria-hidden>·</span>}
              <button type="button" onClick={l.onClick} className="inline-flex items-center gap-1 text-primary hover:underline">
                {l.etiqueta}
              </button>
            </span>
          ))}
        </nav>
      </aside>

      <section aria-label="Trabajos del turno" className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-5 border-b border-border px-7 pb-3.5 pt-[18px]">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground first-letter:uppercase">
              {turnoNombre} · {fecha}
            </p>
            <h1 className="mt-0.5 text-[22px] font-semibold leading-tight">{tituloTurno(r, fotos)}</h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="tinted" className="min-h-[36px] rounded-[8px]" onClick={onCompartir} disabled={compartiendo}>
              <Share /> Compartir
            </Button>
            <Button className="min-h-[36px] rounded-[8px]" onClick={onNuevo}>
              <Plus /> Nuevo evento
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-6 px-7 pb-6 pt-1.5">
          {antes}
          {cargando ? (
            <div className="flex flex-col gap-2 pt-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-[8px] bg-muted-foreground/10 motion-reduce:animate-none" />
              ))}
            </div>
          ) : hechos.length === 0 && borradores.length === 0 && pendientes.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[17px] font-semibold">Aún no hay trabajos en este turno</p>
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
                  <h2 className="flex items-center gap-1.5 pb-1 pt-1 text-[17px] font-semibold">
                    <span className="size-2 shrink-0 rounded-full bg-ink-warn" aria-hidden />
                    Pendiente para el turno siguiente
                    <span className="font-normal text-muted-foreground tabular-nums"> · {pendientes.length}</span>
                  </h2>
                  <TablaTrabajos filas={pendientes} numeroDe={numeroDe} onAbrir={onAbrir} onVerFoto={onVerFoto} />
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/** Columnas: a 1280 px o más, «Quién» va en su columna; más angosto, bajo el equipo. */
const COLUMNAS =
  'grid grid-cols-[28px_minmax(150px,200px)_84px_minmax(0,1fr)_112px] gap-x-4 xl:grid-cols-[28px_minmax(170px,230px)_92px_minmax(0,1fr)_150px_132px]'

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
        <span role="columnheader">Equipo</span>
        <span role="columnheader">Tipo</span>
        <span role="columnheader">Qué se hizo</span>
        <span role="columnheader" className="hidden xl:block">
          Quién
        </span>
        <span role="columnheader">Evidencia</span>
      </div>
      {filas.map((e) => (
        <FilaTrabajo key={e.id} evento={e} numero={numeroDe.get(e.id)} onAbrir={() => onAbrir(e)} onVerFoto={(f, i) => onVerFoto(e, f, i)} />
      ))}
      {cierra && total && (
        <div role="row" className={`${COLUMNAS} items-baseline border-t border-border py-2.5 font-semibold`}>
          <span role="cell" />
          <span role="cell">
            {publicados} {publicados === 1 ? 'trabajo' : 'trabajos'}, {total.equipos} {total.equipos === 1 ? 'equipo' : 'equipos'}
          </span>
          <span role="cell" className="text-[13px] font-normal text-muted-foreground">
            {total.tipos.length} {total.tipos.length === 1 ? 'tipo' : 'tipos'}
          </span>
          <span role="cell" className="text-[13px] font-normal text-muted-foreground">
            {total.tipos.map(([t, n]) => `${n} ${t}`).join(' · ')} · {total.repuestos} {total.repuestos === 1 ? 'repuesto' : 'repuestos'}
          </span>
          <span role="cell" className="hidden xl:block">
            {total.tecnicos} {total.tecnicos === 1 ? 'técnico' : 'técnicos'}
          </span>
          <span role="cell">
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
  const fotos = e.fotos ?? []
  const parada = minutosParadaDe(e)
  const impacto =
    e.impacto === 'con-parada'
      ? { punto: 'bg-ink-crit', texto: `Detuvo la máquina${parada ? ` ${formatoMinutos(parada)}` : ''}` }
      : e.impacto === 'afecta-sin-detener'
        ? { punto: 'bg-ink-warn', texto: `Afectó sin detener${e.contingencia?.trim() ? `: ${e.contingencia.trim()}` : ''}` }
        : e.impacto === 'en-ventana'
          ? { punto: 'bg-ink-ok', texto: `Sin detener${e.ventana?.trim() ? `: ${e.ventana.trim()}` : ' producción'}` }
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
      className={`${COLUMNAS} cursor-pointer items-center border-b border-border/60 py-[7px] hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
    >
      <span role="cell" className="text-[13px] text-muted-foreground tabular-nums">
        {numero ?? ''}
      </span>
      <span role="cell" className="min-w-0">
        <span className="block truncate">{equipo}</span>
        <span className="block truncate text-[13px] text-muted-foreground tabular-nums">{debajo}</span>
        {quien && <span className="block truncate text-[13px] text-muted-foreground xl:hidden">{quien}</span>}
      </span>
      <span role="cell" className="text-[13px]">
        {borrador ? <span className="text-primary">En redacción</span> : etiquetaTipo(e)}
        {e.pendiente && !borrador && <span className="block text-ink-warn">Pendiente</span>}
      </span>
      <span role="cell" className="min-w-0">
        {titulo && <span className="block font-semibold">{titulo}</span>}
        {e.descripcion?.trim() ? (
          <span className={`${titulo ? 'line-clamp-1' : 'line-clamp-2'} whitespace-pre-line`}>{e.descripcion}</span>
        ) : (
          !titulo && <span className="italic text-muted-foreground">Sin descripción todavía</span>
        )}
        {impacto && (
          <span className="mt-0.5 flex items-center gap-1.5 text-[13px]">
            <span className={`size-2 shrink-0 rounded-full ${impacto.punto}`} aria-hidden />
            {impacto.texto}
          </span>
        )}
        {repuestos.length > 0 && (
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            Repuestos: {repuestos.map((x) => `${x.cantidad > 1 ? `${x.cantidad}× ` : ''}${(x.nombreComun ?? '').trim() || nombreRepuesto(x) || x.codigoSAP}`).join(' · ')}
          </span>
        )}
      </span>
      <span role="cell" className="hidden min-w-0 truncate text-[13px] xl:block">
        {quien || <span className="text-muted-foreground">sin técnico marcado</span>}
      </span>
      <span role="cell" className="flex items-center gap-1">
        {fotos.length === 0 ? (
          <span className="text-[13px] text-muted-foreground">sin fotos</span>
        ) : (
          <>
            {fotos.slice(0, 2).map((f, i) => (
              <button
                key={f.path || f.url}
                type="button"
                aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
                onClick={(ev) => {
                  ev.stopPropagation()
                  onVerFoto([...fotos], i)
                }}
                className="size-10 shrink-0 overflow-hidden rounded-[4px] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img src={f.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
            <span className="pl-0.5 text-[13px] text-muted-foreground tabular-nums">{fotos.length}</span>
          </>
        )}
      </span>
    </div>
  )
}
