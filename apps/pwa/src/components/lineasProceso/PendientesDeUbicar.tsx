import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import { Button } from '@/components/piel'
import type { EquipoElegido, EquipoPendiente } from '@/services/lineasProceso/pendientesDeUbicar'
import { etiquetaCortaTurno } from '@/services/bitacora/entregaTurno'

/** Un equipo entre los que el admin puede elegir: del árbol o manual del diagrama. */
export interface OpcionUbicar {
  id: string
  nombre: string
  codigo: string
  /** «Eviscerado», «Acopio»… lo que desambigua nombres repetidos entre plantas. */
  ruta: string
  /** Parte de su línea que pasa por él, si está en el diagrama con flujo (0–1). */
  peso?: number
}

/**
 * El grupo «Nombrados a mano en la bitácora» de la bandeja de revisión del editor de líneas
 * (Orel, 21-09-2026). Un técnico escribió «baader 143», no le atinó a la búsqueda, y el
 * evento quedó sin equipo: acá se resuelve desde el diagrama, no abriendo evento por evento.
 *
 * Tres salidas por nombre: elegir el equipo real (corrige todos sus eventos), crear un
 * elemento manual con ese nombre, o «no es un equipo» (un área, una sala) para que no vuelva.
 *
 * Forma: filas de lista con filete, como los otros grupos de la bandeja; sin tarjetas dentro
 * de la tarjeta (HIG «Boxes»). El campo de búsqueda y los botones conservan su relleno.
 */
export function PendientesDeUbicar({
  grupos,
  opciones,
  cargando,
  trabajando,
  onElegir,
  onCrearManual,
  onDescartar,
}: {
  grupos: readonly EquipoPendiente[]
  opciones: readonly OpcionUbicar[]
  cargando?: boolean
  /** Clave del grupo cuyos eventos se están reescribiendo. */
  trabajando?: string | null
  onElegir: (grupo: EquipoPendiente, equipo: EquipoElegido) => void
  onCrearManual: (nombre: string) => void
  onDescartar: (grupo: EquipoPendiente) => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [consulta, setConsulta] = useState('')

  const t = consulta.trim().toLowerCase()
  const palabras = t.split(/\s+/).filter(Boolean)
  const resultados = useMemo(() => {
    if (!palabras.length) return []
    // Todas las palabras, en cualquier orden: «142 baader» encuentra la BAADER 142 N1.
    return opciones
      .filter((o) => {
        const texto = `${o.nombre} ${o.codigo} ${o.ruta}`.toLowerCase()
        return palabras.every((p) => texto.includes(p))
      })
      .slice(0, 8)
  }, [opciones, palabras])

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-subhead font-semibold">Nombrados a mano en la bitácora</h3>
        <span
          className={`rounded-full px-2 text-caption font-semibold tabular-nums ${
            grupos.length ? 'bg-ink-warn/15 text-ink-warn' : 'bg-muted-foreground/12 text-muted-foreground'
          }`}
        >
          {cargando ? <Loader2 className="inline size-3 animate-spin" /> : grupos.length}
        </span>
      </div>
      <p className="text-caption leading-snug text-muted-foreground">
        {grupos.length
          ? 'Alguien los escribió en un evento y no calzan con nada del diagrama ni del árbol. Hasta ubicarlos, su falla no se le cobra a ninguna línea y el correo los deja «sin evaluar».'
          : cargando
            ? 'Leyendo los eventos de los últimos 60 días…'
            : 'Ninguno: todo lo escrito en la bitácora en 60 días calza con un equipo.'}
      </p>

      {grupos.length > 0 && (
        <ul className="mt-1 flex flex-col border-t border-border">
          {grupos.map((g) => {
            const desplegado = abierto === g.clave
            const ocupado = trabajando === g.clave
            return (
              <li key={g.clave} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(desplegado ? null : g.clave)
                    setConsulta('')
                  }}
                  aria-expanded={desplegado}
                  className="flex min-h-[44px] w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
                >
                  {desplegado ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                  <span className={`min-w-0 flex-1 truncate text-footnote ${desplegado ? 'font-semibold' : ''}`}>{g.nombre}</span>
                  <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                    {g.eventos.length} {g.eventos.length === 1 ? 'evento' : 'eventos'} · {g.ultimo.slice(8, 10)}-{g.ultimo.slice(5, 7)}
                  </span>
                </button>

                {desplegado && (
                  <div className="flex flex-col gap-3 pb-3 pl-6">
                    {/* Sus eventos: quién, cuándo y qué, para reconocer de qué máquina hablaban. */}
                    <ul className="flex flex-col gap-0.5 text-caption leading-snug text-muted-foreground">
                      {g.eventos.slice(0, 4).map((e) => (
                        <li key={e.id} className="truncate">
                          {etiquetaCortaTurno(e.turnoId)} · {e.registradoPor || e.autorNombre || 'sin nombre'}: «{(e.descripcion || '').trim().slice(0, 90)}»
                        </li>
                      ))}
                      {g.eventos.length > 4 && <li>… y {g.eventos.length - 4} más</li>}
                    </ul>

                    <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                      <label className="text-caption font-semibold uppercase tracking-wider text-muted-foreground" htmlFor={`ubicar-${g.clave}`}>
                        Es este equipo
                      </label>
                      <div className="relative">
                        <input
                          id={`ubicar-${g.clave}`}
                          value={consulta}
                          onChange={(ev) => setConsulta(ev.target.value)}
                          placeholder="Buscar entre los equipos creados"
                          autoComplete="off"
                          className="min-h-[44px] w-full rounded-ctl bg-muted-foreground/10 px-3 pr-10 text-footnote outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                        {consulta && (
                          <button
                            type="button"
                            aria-label="Borrar búsqueda"
                            onClick={() => setConsulta('')}
                            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground [&>svg]:size-4"
                          >
                            <X aria-hidden />
                          </button>
                        )}
                      </div>
                      {palabras.length > 0 && (
                        <ul className="flex flex-col">
                          {resultados.map((o) => (
                            <li key={o.id} className="border-b border-border last:border-b-0">
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() => onElegir(g, { id: o.id, nombre: o.nombre, codigo: o.codigo })}
                                className="flex min-h-[44px] w-full flex-col justify-center text-left disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                <span className="text-footnote">{o.nombre}</span>
                                <span className="text-caption text-muted-foreground">
                                  {[o.codigo, o.ruta, o.peso != null ? `en el diagrama, ${Math.round(o.peso * 100)} %` : ''].filter(Boolean).join(' · ')}
                                </span>
                              </button>
                            </li>
                          ))}
                          {!resultados.length && <li className="py-2 text-caption text-muted-foreground">Nada con ese nombre. Prueba con menos palabras o con el número.</li>}
                        </ul>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-border pt-2.5">
                      <Button variant="tinted" disabled={ocupado} onClick={() => onCrearManual(g.nombre)}>
                        Crear elemento manual «{g.nombre.length > 24 ? `${g.nombre.slice(0, 23)}…` : g.nombre}»
                      </Button>
                      <Button variant="tinted" disabled={ocupado} onClick={() => onDescartar(g)}>
                        No es un equipo
                      </Button>
                      {ocupado && <Loader2 className="size-4 animate-spin self-center text-muted-foreground" />}
                    </div>
                    <p className="text-caption leading-snug text-muted-foreground">
                      Elegir un equipo corrige {g.eventos.length === 1 ? 'el evento' : `los ${g.eventos.length} eventos`}: nombre, N° de equipo y enlace. Queda en la
                      bitácora y en el próximo correo.
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
