import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2, MessageSquarePlus, Plus, Route, X } from 'lucide-react'
import { Button } from '@/components/piel'
import {
  resumenDeRecorrido,
  tendenciaDeEquipo,
  type EquipoDeRuta,
  type Recorrido,
  type ResultadoEquipo,
  type RutaInspeccion,
} from '@/services/inspecciones/modeloRuta'

export interface PanelRutasProps {
  rutas: RutaInspeccion[]
  /** Las rutas ordenadas por la que lleva más sin recorrerse, con sus días. */
  porAtencion: Array<{ ruta: RutaInspeccion; dias: number | null }>
  /** El recorrido de cada ruta en este turno. */
  deEsteTurno: Map<string, Recorrido>
  /** Todos los recorridos recientes: de ahí sale la tendencia de cada equipo. */
  recorridos: readonly Recorrido[]
  editable: boolean
  trabajando?: boolean
  onIniciar: (rutaId: string) => void
  onMarcar: (rutaId: string, equipoId: string, resultado: ResultadoEquipo | null) => void
  onAnotar: (rutaId: string, equipoId: string, nota: string) => void
  onHallazgo: (ruta: RutaInspeccion, equipo: EquipoDeRuta, nota?: string) => void
  onCerrar: (rutaId: string, cerrado: boolean) => void
}

/**
 * Las rutas de inspección del registro R-MAN-CH-004.
 *
 * Dos pantallas: elegir la ruta y recorrerla. La lista NO dice «toca hoy» — dice cuánto hace que
 * no se recorre y ordena por eso (Orel: con un equipo reducido, obligar a diario o semanal es lo
 * que hace que no se haga ninguna). Y el recorrido se puede dejar a medias, al revés que el
 * post-aseo, donde hay una liberación que firmar.
 */
export function PanelRutas({
  rutas,
  porAtencion,
  deEsteTurno,
  recorridos,
  editable,
  trabajando,
  onIniciar,
  onMarcar,
  onAnotar,
  onHallazgo,
  onCerrar,
}: PanelRutasProps) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const ruta = rutas.find((r) => r.id === abierta)

  if (!ruta) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 rounded-card border border-border bg-card p-4">
          <h2 className="text-headline">Rutas de inspección</h2>
          <p className="text-footnote leading-snug text-muted-foreground">
            Se recorre un área equipo por equipo y se deja lo que se encuentre. No hay frecuencia
            obligatoria: primero las que llevan más tiempo sin recorrerse.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {porAtencion.map(({ ruta: r, dias }) => {
            const rec = deEsteTurno.get(r.id)
            const res = rec ? resumenDeRecorrido(r, rec) : null
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setAbierta(r.id)}
                  className="flex min-h-[60px] w-full items-center gap-3 rounded-card border border-border bg-card px-4 py-2.5 text-left hover:bg-muted-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-subhead font-semibold">{r.nombre}</b>
                    <span className="block text-caption text-muted-foreground">
                      {r.equipos.length} puntos
                      {res && ` · en curso, ${res.revisados} de ${res.total}`}
                    </span>
                  </span>
                  <EtiquetaDias dias={dias} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  const rec = deEsteTurno.get(ruta.id)
  const resumen = rec ? resumenDeRecorrido(ruta, rec) : null
  const cerrado = !!rec?.cerradoEn

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setAbierta(null)}
        className="-ml-2 flex min-h-[44px] w-fit items-center gap-1 rounded-ctl px-2 text-footnote text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronLeft className="size-4" aria-hidden /> Todas las rutas
      </button>

      {!rec ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-5">
          <h2 className="text-headline">{ruta.nombre}</h2>
          <p className="max-w-prose text-footnote text-muted-foreground">
            {ruta.equipos.length} puntos. Lo que encuentres queda como evento de este turno, con su
            equipo y su hora.
          </p>
          {sinEquipo(ruta) > 0 && (
            <p className="max-w-prose rounded-ctl bg-ink-warn/10 p-2.5 text-caption leading-snug text-ink-warn">
              {sinEquipo(ruta)} de los {ruta.equipos.length} puntos vienen del registro sin el nombre del equipo. Se pueden
              revisar igual; lo que se encuentre habrá que ligarlo al equipo a mano.
            </p>
          )}
          {editable ? (
            <Button onClick={() => onIniciar(ruta.id)} disabled={trabajando}>
              {trabajando ? <Loader2 className="animate-spin" /> : <Route />} Empezar el recorrido
            </Button>
          ) : (
            <p className="text-footnote text-muted-foreground">En este turno no se recorrió.</p>
          )}
          <ListaEquipos ruta={ruta} recorridos={recorridos} />
        </div>
      ) : (
        <>
          <header className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-headline">{ruta.nombre}</h2>
              <span className="rounded-full bg-muted-foreground/12 px-2.5 py-0.5 text-caption font-semibold tabular-nums">
                {resumen?.revisados} de {resumen?.total}
              </span>
            </div>
            <p className="text-caption text-muted-foreground">
              Desde {hora(rec.iniciadoEn)} · {rec.iniciadoPorNombre}
              {resumen?.noConformes ? ` · ${resumen.noConformes} sin conformidad` : ''}
              {resumen?.minutosDeRecorrido ? ` · ${resumen.minutosDeRecorrido} min de recorrido` : ''}
              {cerrado && ' · cerrado'}
            </p>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted-foreground/12" aria-hidden>
              <span className="bg-ink-ok" style={{ width: `${((resumen?.conformes ?? 0) / (resumen?.total || 1)) * 100}%` }} />
              <span className="bg-ink-crit" style={{ width: `${((resumen?.noConformes ?? 0) / (resumen?.total || 1)) * 100}%` }} />
            </div>
          </header>

          <ul className="flex flex-col gap-2">
            {ruta.equipos.map((e) => (
              <FilaEquipo
                key={e.id}
                ruta={ruta}
                equipo={e}
                recorrido={rec}
                recorridos={recorridos}
                editable={editable && !cerrado}
                onMarcar={onMarcar}
                onAnotar={onAnotar}
                onHallazgo={onHallazgo}
              />
            ))}
          </ul>

          {editable && (
            <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
              {cerrado ? (
                <>
                  <p className="text-footnote text-muted-foreground">
                    Cerrado con {resumen?.revisados} de {resumen?.total} equipos revisados.
                  </p>
                  <Button variant="plain" onClick={() => onCerrar(ruta.id, false)} disabled={trabajando}>
                    Volver a abrirlo
                  </Button>
                </>
              ) : (
                <>
                  {/* Cerrar no exige completar: cuatro equipos mirados valen cuatro veces más que cero. */}
                  <p className="text-caption leading-snug text-muted-foreground">
                    Se puede cerrar como va. Lo que quede sin revisar simplemente no se registra.
                  </p>
                  <Button onClick={() => onCerrar(ruta.id, true)} disabled={trabajando || !resumen?.revisados}>
                    {trabajando ? <Loader2 className="animate-spin" /> : <Check />} Cerrar el recorrido
                    {resumen ? ` · ${resumen.revisados} de ${resumen.total}` : ''}
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Cuántos puntos de la ruta vienen sin el nombre del equipo. */
function sinEquipo(ruta: RutaInspeccion): number {
  return ruta.equipos.filter((e) => e.sinEquipo).length
}

function EtiquetaDias({ dias }: { dias: number | null }) {
  const [texto, tono] =
    dias == null
      ? ['nunca', 'bg-ink-crit/15 text-ink-crit']
      : dias >= 21
        ? [`hace ${dias} d`, 'bg-ink-warn/15 text-ink-warn']
        : [dias === 0 ? 'hoy' : `hace ${dias} d`, 'bg-muted-foreground/12 text-muted-foreground']
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold tabular-nums ${tono}`}>{texto}</span>
}

function FilaEquipo({
  ruta,
  equipo,
  recorrido,
  recorridos,
  editable,
  onMarcar,
  onAnotar,
  onHallazgo,
}: {
  ruta: RutaInspeccion
  equipo: EquipoDeRuta
  recorrido: Recorrido
  recorridos: readonly Recorrido[]
  editable: boolean
  onMarcar: PanelRutasProps['onMarcar']
  onAnotar: PanelRutasProps['onAnotar']
  onHallazgo: PanelRutasProps['onHallazgo']
}) {
  const [abierto, setAbierto] = useState(false)
  const [anotando, setAnotando] = useState<string | null>(null)
  const r = recorrido.resultados[equipo.id]
  const nota = (recorrido.notas?.[equipo.id] ?? '').trim()
  // La tendencia se calcula sin este recorrido: es la historia, no lo de ahora.
  const tendencia = tendenciaDeEquipo(
    equipo.id,
    recorridos.filter((x) => x.id !== recorrido.id),
  )

  return (
    <li className="rounded-card border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="min-w-0 flex-1">
            <b className={`block text-subhead font-medium ${equipo.sinEquipo ? 'line-clamp-2' : 'truncate'}`}>{equipo.nombre}</b>
            {/* Sin equipo el hallazgo no se puede ligar a la jerarquía: se dice, no se esconde. */}
            {equipo.sinEquipo && <span className="block text-caption text-muted-foreground">Falta el nombre del equipo en el registro</span>}
            {tendencia.veredicto && <span className="block text-caption text-ink-warn">{tendencia.veredicto}</span>}
          </span>
          {recorrido.marcas?.[equipo.id] && (
            <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{hora(recorrido.marcas[equipo.id] ?? '')}</span>
          )}
        </button>
        <div className="flex shrink-0 gap-1.5 pt-1">
          <BotonMarca activo={r === 'conforme'} tono="ok" disabled={!editable} onClick={() => onMarcar(ruta.id, equipo.id, r === 'conforme' ? null : 'conforme')}>
            <Check aria-hidden /> Conforme
          </BotonMarca>
          <BotonMarca
            activo={r === 'no-conforme'}
            tono="mal"
            disabled={!editable}
            onClick={() => {
              if (r === 'no-conforme') onMarcar(ruta.id, equipo.id, null)
              else {
                onMarcar(ruta.id, equipo.id, 'no-conforme')
                setAbierto(true)
                setAnotando(nota)
              }
            }}
          >
            <X aria-hidden /> No
          </BotonMarca>
        </div>
      </div>

      {abierto && equipo.actividad && (
        <p className="mt-1.5 text-caption leading-snug text-muted-foreground">{equipo.actividad}</p>
      )}

      {abierto && tendencia.pasos.length > 0 && <Serie tendencia={tendencia} />}

      {anotando !== null ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            autoFocus
            rows={2}
            maxLength={300}
            value={anotando}
            onChange={(ev) => setAnotando(ev.target.value)}
            placeholder="Qué encontraste"
            className="w-full rounded-ctl bg-muted-foreground/10 p-2.5 text-footnote outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="tinted"
              onClick={() => {
                onAnotar(ruta.id, equipo.id, anotando)
                setAnotando(null)
              }}
            >
              Guardar
            </Button>
            {/* El piso es la observación; el evento queda a un toque, con el texto ya escrito. */}
            {!!anotando.trim() && (
              <Button
                variant="plain"
                onClick={() => {
                  onAnotar(ruta.id, equipo.id, anotando)
                  onHallazgo(ruta, equipo, anotando)
                  setAnotando(null)
                }}
              >
                <Plus /> Registrarlo en la bitácora
              </Button>
            )}
            <Button variant="plain" onClick={() => setAnotando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {nota && (
            <button
              type="button"
              disabled={!editable}
              onClick={() => setAnotando(nota)}
              className="mt-2 block w-full rounded-ctl bg-ink-warn/10 p-2 text-left text-caption leading-snug text-ink-warn disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {nota}
            </button>
          )}
          {editable && !!r && !nota && (
            <button
              type="button"
              onClick={() => setAnotando('')}
              className="mt-1 flex min-h-[44px] items-center gap-1 text-footnote text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4"
            >
              <MessageSquarePlus aria-hidden /> Agregar observación
            </button>
          )}
        </>
      )}
    </li>
  )
}

/** La fila de ✓ y ✕ de las últimas rondas: el patrón que ninguna ronda suelta puede mostrar. */
function Serie({ tendencia }: { tendencia: ReturnType<typeof tendenciaDeEquipo> }) {
  return (
    <div className="mt-2 flex gap-1.5">
      {tendencia.pasos.map((p) => (
        <span key={p.recorridoId} className="flex-1 text-center" title={p.nota ?? ''}>
          <span
            className={`flex h-7 items-center justify-center rounded-ctl text-footnote font-bold ${
              p.resultado === 'conforme' ? 'bg-ink-ok/15 text-ink-ok' : 'bg-ink-crit/20 text-ink-crit'
            }`}
          >
            {p.resultado === 'conforme' ? '✓' : '✕'}
          </span>
          <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">{diaMes(p.en)}</span>
        </span>
      ))}
    </div>
  )
}

/** Los equipos de una ruta que todavía no se empieza, para saber qué incluye. */
function ListaEquipos({ ruta, recorridos }: { ruta: RutaInspeccion; recorridos: readonly Recorrido[] }) {
  return (
    <ul className="flex w-full flex-col gap-1">
      {ruta.equipos.map((e) => {
        const t = tendenciaDeEquipo(e.id, recorridos)
        return (
          <li key={e.id} className="flex items-baseline justify-between gap-3 border-t border-border py-1.5 first:border-0">
            <span className={`min-w-0 flex-1 text-footnote ${e.sinEquipo ? 'line-clamp-2 text-muted-foreground' : 'truncate'}`}>{e.nombre}</span>
            {t.veredicto && <span className="shrink-0 text-caption text-ink-warn">{t.noConformes} hallazgos</span>}
          </li>
        )
      })}
    </ul>
  )
}

function BotonMarca({
  activo,
  tono,
  disabled,
  onClick,
  children,
}: {
  activo: boolean
  tono: 'ok' | 'mal'
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const encendido = tono === 'ok' ? 'bg-ink-ok/15 text-ink-ok' : 'bg-ink-crit/15 text-ink-crit'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      className={`flex min-h-[44px] items-center gap-1 rounded-ctl px-2.5 text-caption font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-3.5 ${
        activo ? encendido : 'bg-muted-foreground/10 text-muted-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function hora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function diaMes(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
