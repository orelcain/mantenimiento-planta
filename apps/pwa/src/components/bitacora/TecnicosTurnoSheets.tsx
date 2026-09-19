import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pencil, Search, Trash2, X } from 'lucide-react'
import { Button, Sheet, Tag } from '@/components/piel'
import {
  agregarTecnico,
  claveNombre,
  quitarTecnico,
  renombrarTecnico,
  type AjustesTecnicos,
  type TecnicoDeLista,
} from '@/services/bitacora/listaTecnicos'

/**
 * Hojas de técnicos de la bitácora (mockup aprobado 15-09-2026):
 *  - «Técnicos del turno»: marcar quién está de verdad (sobre lo que dice el calendario).
 *  - «Lista de técnicos»: agregar, corregir o quitar nombres de la lista maestra.
 */

const CELDA =
  'relative flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left before:absolute before:left-[3.25rem] before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'

export function TecnicosDelTurnoSheet({
  open,
  lista,
  deTurnoCalendario,
  marcados,
  onMarcados,
  onGuardar,
  onAbrirLista,
  onClose,
}: {
  open: boolean
  lista: TecnicoDeLista[]
  /** Nombres (ya renombrados) que el calendario pone de turno: llevan la etiqueta «Calendario». */
  deTurnoCalendario: string[]
  /**
   * Borrador de marcas CONTROLADO por la página: vive fuera de la hoja para que
   * ir a «Lista de técnicos» y volver no borre lo marcado (revisión 15-09), y
   * para que un snapshot que llega no lo pise.
   */
  marcados: string[]
  onMarcados: (marcados: string[]) => void
  onGuardar: (presentes: string[]) => void
  /** Sin ella no se ofrece editar la lista (el pase de bitácora solo la lee). */
  onAbrirLista?: () => void
  onClose: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const inputBusquedaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setBusqueda('')
  }, [open])

  const esDeCalendario = useMemo(() => new Set(deTurnoCalendario.map(claveNombre)), [deTurnoCalendario])
  const visibles = lista.filter((t) => claveNombre(t.nombre).includes(claveNombre(busqueda)))
  const marcado = (n: string) => marcados.some((m) => claveNombre(m) === claveNombre(n))
  const alternar = (n: string) => onMarcados(marcado(n) ? marcados.filter((m) => claveNombre(m) !== claveNombre(n)) : [...marcados, n])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Técnicos del turno"
      actions={
        <>
          <Button variant="tinted" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              // Orden de la lista, no el orden en que se tocaron; y quien estaba
              // presente pero ya salió de la lista NO se pierde (va al final).
              const enLista = lista.map((t) => t.nombre).filter((n) => marcado(n))
              const fuera = marcados.filter((m) => !lista.some((t) => claveNombre(t.nombre) === claveNombre(m)))
              onGuardar([...enLista, ...fuera])
              onClose()
            }}
          >
            Guardar ({marcados.length})
          </Button>
        </>
      }
    >
      <div className="-mx-6 flex max-h-[min(62vh,560px)] flex-col gap-4 overflow-y-auto px-6 pb-1 [&>*]:shrink-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="bitacora-buscar-tecnico" className="sr-only">Buscar técnico</label>
          <input
            ref={inputBusquedaRef}
            id="bitacora-buscar-tecnico"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar técnico…"
            autoComplete="off"
            // HIG «Virtual keyboards»: acá Enter no envía nada, solo filtra.
            enterKeyHint="search"
            className="h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 pl-9 pr-9 text-campo text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
          {/* HIG «Search fields»: borrar sin cinco toques de backspace; el foco
              se queda en el campo para seguir buscando (19-09-2026). */}
          {busqueda.length > 0 && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => {
                setBusqueda('')
                inputBusquedaRef.current?.focus()
              }}
              className="absolute right-0 top-0 flex h-[44px] w-[44px] items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-footnote text-muted-foreground">Marca a los que están en el turno</span>
            {onAbrirLista && (
              <Button variant="plain" className="-my-2 -mr-3 shrink-0" onClick={onAbrirLista}>
                Lista de técnicos
              </Button>
            )}
          </div>
          <div className="overflow-hidden rounded-card bg-muted-foreground/10">
            {visibles.map((t) => {
              const on = marcado(t.nombre)
              return (
                <button key={t.clave} type="button" role="checkbox" aria-checked={on} onClick={() => alternar(t.nombre)} className={`${CELDA} hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}>
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${on ? 'bg-primary text-primary-foreground' : 'shadow-[inset_0_0_0_1.5px_rgb(var(--muted-foreground)/0.45)]'}`}
                    aria-hidden
                  >
                    {on && <Check className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1 text-body">{t.nombre}</span>
                  {esDeCalendario.has(claveNombre(t.nombre)) && <Tag>Calendario</Tag>}
                </button>
              )
            })}
            {visibles.length === 0 && <p className="px-4 py-3 text-footnote text-muted-foreground">Nadie con ese nombre en la lista.</p>}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

export function ListaTecnicosSheet({
  open,
  lista,
  ajustes,
  onGuardar,
  onClose,
}: {
  open: boolean
  lista: TecnicoDeLista[]
  ajustes: AjustesTecnicos
  onGuardar: (ajustes: AjustesTecnicos) => void
  onClose: () => void
}) {
  const [nuevo, setNuevo] = useState('')
  const [editando, setEditando] = useState<{ clave: string; texto: string } | null>(null)
  const [confirmarQuitar, setConfirmarQuitar] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNuevo('')
    setEditando(null)
    setConfirmarQuitar(null)
  }, [open])

  const agregar = () => {
    if (!nuevo.trim()) return
    onGuardar(agregarTecnico(ajustes, nuevo))
    setNuevo('')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lista de técnicos"
      description={`${lista.length} ${lista.length === 1 ? 'nombre' : 'nombres'} · la planilla del calendario más los ajustes de la bitácora`}
      actions={<Button onClick={onClose}>Listo</Button>}
    >
      <div className="-mx-6 flex max-h-[min(62vh,560px)] flex-col gap-4 overflow-y-auto px-6 pb-1 [&>*]:shrink-0">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            agregar()
          }}
        >
          <label htmlFor="bitacora-tecnico-nuevo" className="sr-only">Nombre del técnico nuevo</label>
          <input
            id="bitacora-tecnico-nuevo"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del técnico nuevo"
            autoComplete="off"
            maxLength={60}
            className="h-[44px] min-w-0 flex-1 rounded-ctl border-0 bg-muted-foreground/10 px-3 text-campo text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button type="submit" variant="tinted" disabled={!nuevo.trim()}>
            Agregar
          </Button>
        </form>

        <div className="overflow-hidden rounded-card bg-muted-foreground/10">
          {lista.map((t) =>
            editando?.clave === t.clave ? (
              <form
                key={t.clave}
                className={`${CELDA} before:left-4`}
                onSubmit={(e) => {
                  e.preventDefault()
                  onGuardar(renombrarTecnico(ajustes, t.clave, editando.texto))
                  setEditando(null)
                }}
              >
                <label htmlFor="bitacora-tecnico-editar" className="sr-only">Corregir nombre</label>
                <input
                  id="bitacora-tecnico-editar"
                  autoFocus
                  value={editando.texto}
                  onChange={(e) => setEditando({ clave: t.clave, texto: e.target.value })}
                  maxLength={60}
                  className="h-[40px] min-w-0 flex-1 rounded-ctl border-0 bg-card px-3 text-campo text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Button type="submit" size="sm" disabled={!editando.texto.trim()}>
                  Listo
                </Button>
              </form>
            ) : (
              <div key={t.clave} className={`${CELDA} before:left-4`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{t.nombre}</span>
                  <span className="block text-caption text-muted-foreground">
                    {t.origen === 'calendario' ? 'Del calendario' : 'Agregado'}
                    {t.nombre !== t.clave ? ` · antes «${t.clave}»` : ''}
                  </span>
                </span>
                {confirmarQuitar === t.clave ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      onGuardar(quitarTecnico(ajustes, t))
                      setConfirmarQuitar(null)
                    }}
                  >
                    Quitar
                  </Button>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Corregir ${t.nombre}`}
                      onClick={() => setEditando({ clave: t.clave, texto: t.nombre })}
                      className="flex size-[44px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar ${t.nombre}`}
                      onClick={() => setConfirmarQuitar(t.clave)}
                      className="flex size-[44px] shrink-0 items-center justify-center rounded-full text-ink-crit hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            ),
          )}
        </div>
        <p className="text-footnote text-muted-foreground">
          Quitar a alguien del calendario solo lo oculta en la bitácora: el calendario no cambia. Los eventos ya guardados conservan el nombre con que se registraron.
        </p>
      </div>
    </Sheet>
  )
}
