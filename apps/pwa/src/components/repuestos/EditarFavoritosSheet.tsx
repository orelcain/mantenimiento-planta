import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, GripVertical, Search, Trash2, X } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { ActionSheet, Button, Pill, SegmentedControl, Sheet } from '@/components/piel'
import { ReAuthConfirmDialog } from '@/components/admin/ReAuthConfirmDialog'
import type { FavList } from '@/services/userPreferences'
import { getGlobalEquipmentCache } from '@/hooks/useGlobalEquipmentSearch'
import { plantaCorta } from '@/hooks/repuestos/dondeSeUsa'
import { normalizeForSearch } from '@/utils/repuestos/searchNormalize'
import {
  agregarEquipos,
  alternarEliminarLista,
  alternarQuitar,
  aplicarBorrador,
  crearBorrador,
  crearLista,
  diffFavoritos,
  renombrarLista,
  reordenar,
  type DiffFavoritos,
  type ItemBorrador,
  type ListaBorrador,
} from '@/hooks/repuestos/edicionFavoritos'

/**
 * Hoja «Editar favoritos de equipos».
 *
 * Se edita un borrador; nada se guarda hasta «Guardar». Agregar, renombrar y reordenar guardan
 * directo. Quitar un equipo o eliminar una lista pide la clave del usuario: un toque suelto
 * (sobre todo con guantes) no puede borrar la lista que alguien armó.
 */

export interface EditarFavoritosSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listas: FavList[]
  /** Nombre de un equipo cuando la lista guardada no lo trae. */
  nombreDe: (id: string) => string
  /** Planta (p. ej. «PLANTA CHONCHI») de un nodo; `undefined` si no se sabe. */
  plantaDe: (id: string) => string | undefined
  onGuardar: (next: FavList[]) => Promise<void>
  /** Lista que recibe los equipos al abrir desde «Agregar a…» (por nombre guardado). */
  listaInicial?: string
  /** Equipo que llega preseleccionado (estrella del árbol). */
  equipoInicial?: { id: string; nombre: string }
}

const NUEVA = '__nueva__'
type FiltroPlanta = 'todas' | 'chonchi' | 'yal'

function Pastilla({ planta }: { planta: string }) {
  if (!planta) return null
  return <Pill tone={planta.toLowerCase().startsWith('chonchi') ? 'neutral' : 'info'}>{planta}</Pill>
}

function FilaEquipo({ lista, item, planta, onQuitar }: {
  lista: string
  item: ItemBorrador
  planta: string
  onQuitar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: item.quitar })
  const style = { transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null), transition }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex min-h-[52px] items-center gap-1 pl-1 pr-1',
        item.quitar && 'bg-destructive-tint',
        isDragging && 'relative z-10 bg-card shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
      )}
    >
      {item.nuevo ? (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Retirar ${item.nombre}`}
          className="flex min-h-[44px] min-w-11 items-center justify-center"
        >
          <Pill tone="info">Nuevo</Pill>
        </button>
      ) : item.quitar ? (
        <span className="size-11 shrink-0" aria-hidden />
      ) : (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${item.nombre} de ${lista}`}
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <span className="relative block size-6 rounded-full bg-destructive" aria-hidden>
            <span className="absolute inset-x-[6px] top-[11px] h-[2px] rounded-full bg-destructive-foreground" />
          </span>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-body', item.quitar && 'text-muted-foreground line-through')}>{item.nombre}</p>
        {item.quitar && <p className="text-footnote text-muted-foreground">· se quitará</p>}
      </div>
      {!item.quitar && <Pastilla planta={planta} />}
      {item.quitar ? (
        <button type="button" onClick={onQuitar} className="flex min-h-[44px] items-center px-3 text-body font-semibold text-primary">
          Deshacer
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Reordenar ${item.nombre}`}
          className="flex size-11 shrink-0 touch-none items-center justify-center text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
      )}
    </li>
  )
}

function EncabezadoLista({ lista, onRenombrar }: { lista: ListaBorrador; onRenombrar: (nombre: string) => void }) {
  const [texto, setTexto] = useState(lista.nombre)
  useEffect(() => { setTexto(lista.nombre) }, [lista.nombre])
  const confirmar = () => {
    const limpio = texto.trim()
    if (limpio && limpio !== lista.nombre) onRenombrar(limpio)
    // Si el nombre no era válido (vacío o repetido) el borrador no cambia: se vuelve al anterior.
    setTexto(lista.nombre)
  }
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      aria-label={`Nombre de la lista ${lista.nombre}`}
      className="h-11 min-w-0 flex-1 truncate rounded-ctl bg-transparent px-2 text-subhead font-semibold focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    />
  )
}

function BloqueLista({ lista, plantaDe, onBorrador }: {
  lista: ListaBorrador
  plantaDe: (id: string) => string | undefined
  onBorrador: (f: (b: ListaBorrador[]) => ListaBorrador[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const alSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const desde = lista.items.findIndex((i) => i.id === e.active.id)
    const hacia = lista.items.findIndex((i) => i.id === e.over!.id)
    if (desde >= 0 && hacia >= 0) onBorrador((b) => reordenar(b, lista.key, desde, hacia))
  }
  const vigentes = lista.items.filter((i) => !i.quitar).length

  return (
    <section className="flex flex-col">
      <header className="flex items-center gap-1 px-2">
        <EncabezadoLista lista={lista} onRenombrar={(n) => onBorrador((b) => renombrarLista(b, lista.key, n))} />
        <span className="text-subhead tabular-nums text-muted-foreground">{vigentes}</span>
        <button
          type="button"
          onClick={() => onBorrador((b) => alternarEliminarLista(b, lista.key))}
          aria-label={`Eliminar lista ${lista.nombre}`}
          className="flex size-11 items-center justify-center text-muted-foreground"
        >
          <Trash2 className="size-[18px]" aria-hidden />
        </button>
      </header>
      <div className="overflow-hidden rounded-card bg-card">
        {lista.eliminada ? (
          <div className="flex min-h-[52px] items-center gap-2 bg-destructive-tint pl-4 pr-1">
            <p className="min-w-0 flex-1 text-subhead">La lista se eliminará al guardar</p>
            <button
              type="button"
              onClick={() => onBorrador((b) => alternarEliminarLista(b, lista.key))}
              className="flex min-h-[44px] items-center px-3 text-body font-semibold text-primary"
            >
              Deshacer
            </button>
          </div>
        ) : lista.items.length === 0 ? (
          <p className="px-4 py-3.5 text-subhead text-muted-foreground">Sin equipos todavía. Agrégalos desde el buscador.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
            <SortableContext items={lista.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border/60">
                {lista.items.map((it) => (
                  <FilaEquipo
                    key={it.id}
                    lista={lista.nombre}
                    item={it}
                    planta={plantaCorta(plantaDe(it.id))}
                    onQuitar={() => onBorrador((b) => alternarQuitar(b, lista.key, it.id))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </section>
  )
}

/** «Se agregarán 2 · se quitarán 1 · …» o «Sin cambios». */
function resumenDe(d: DiffFavoritos): string {
  if (!d.hayCambios) return 'Sin cambios'
  const partes: string[] = []
  if (d.agregados.length) partes.push(`Se agregarán ${d.agregados.length}`)
  if (d.quitados.length) partes.push(`se quitarán ${d.quitados.length}`)
  if (d.listasEliminadas.length) partes.push(d.listasEliminadas.length === 1 ? '1 lista se eliminará' : `${d.listasEliminadas.length} listas se eliminarán`)
  if (d.renombres.length) partes.push(d.renombres.length === 1 ? '1 lista renombrada' : `${d.renombres.length} listas renombradas`)
  if (partes.length === 0) return 'Cambió el orden'
  const txt = partes.join(' · ')
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

/** Frase para la clave: «para quitar BAADER 200 · Chonchi de Fileteo y la lista "Cintas"». */
function motivoDe(d: DiffFavoritos, plantaDe: (id: string) => string | undefined): string {
  const partes: string[] = []
  for (const q of d.quitados) {
    if (d.listasEliminadas.includes(q.lista)) continue
    const planta = plantaCorta(plantaDe(q.machineId))
    partes.push(`${q.nombre}${planta ? ` · ${planta}` : ''} de ${q.lista}`)
  }
  for (const l of d.listasEliminadas) partes.push(`la lista «${l}»`)
  const vistos = partes.slice(0, 3)
  const resto = partes.length - vistos.length
  const unidos = vistos.length > 1 ? `${vistos.slice(0, -1).join(', ')} y ${vistos[vistos.length - 1]}` : (vistos[0] ?? '')
  return `para quitar ${unidos}${resto > 0 ? ` y ${resto} más` : ''}`
}

export function EditarFavoritosSheet({
  open, onOpenChange, listas, nombreDe, plantaDe, onGuardar, listaInicial, equipoInicial,
}: EditarFavoritosSheetProps) {
  const [borrador, setBorrador] = useState<ListaBorrador[]>([])
  const [sel, setSel] = useState<Map<string, string>>(new Map())
  const [consulta, setConsulta] = useState('')
  const [filtro, setFiltro] = useState<FiltroPlanta>('todas')
  const [destino, setDestino] = useState<string>(NUEVA)
  const [nombreNueva, setNombreNueva] = useState('')
  const [descartar, setDescartar] = useState(false)
  const [claveAbierta, setClaveAbierta] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Las props que solo se leen al abrir van en refs: si no, cada render del padre reiniciaría el borrador.
  const propsRef = useRef({ listas, nombreDe, listaInicial, equipoInicial })
  propsRef.current = { listas, nombreDe, listaInicial, equipoInicial }

  useEffect(() => {
    if (!open) return
    const p = propsRef.current
    const b = crearBorrador(p.listas, p.nombreDe)
    setBorrador(b)
    const ini = (p.listaInicial ? b.find((l) => l.origen === p.listaInicial) : undefined) ?? b[0]
    setDestino(ini?.key ?? NUEVA)
    setSel(p.equipoInicial ? new Map([[p.equipoInicial.id, p.equipoInicial.nombre]]) : new Map())
    setConsulta('')
    setFiltro('todas')
    setNombreNueva('')
    setDescartar(false)
    setClaveAbierta(false)
    setGuardando(false)
    setError(null)
  }, [open])

  const diff = useMemo(() => diffFavoritos(listas, borrador), [listas, borrador])
  const yaIds = useMemo(() => new Set(borrador.filter((l) => !l.eliminada).flatMap((l) => l.items.map((i) => i.id))), [borrador])

  // Resultados: desde 2 letras se busca en todos los equipos; antes, solo lo ya elegido (p. ej. el de la estrella).
  const grupos = useMemo(() => {
    const q = normalizeForSearch(consulta)
    const base: { id: string; nombre: string; sub: string; planta: string }[] = []
    if (q.length < 2) {
      for (const [id, nombre] of sel) base.push({ id, nombre, sub: '', planta: plantaCorta(plantaDe(id)) })
    } else {
      for (const e of getGlobalEquipmentCache() ?? []) {
        if (e.oculto) continue
        const nombre = e.alias || e.nombre
        if (!normalizeForSearch(`${e.nombre} ${e.alias ?? ''} ${e.codigo}`).includes(q)) continue
        base.push({ id: e.linkedMachineId || e.id, nombre, sub: e.codigo, planta: plantaCorta(plantaDe(e.id)) })
        if (base.length >= 60) break
      }
    }
    const filtrados = base.filter((r) => filtro === 'todas' || r.planta.toLowerCase().startsWith(filtro))
    const porPlanta = new Map<string, typeof filtrados>()
    for (const r of filtrados) {
      const k = r.planta || 'Sin planta'
      porPlanta.set(k, [...(porPlanta.get(k) ?? []), r])
    }
    return [...porPlanta.entries()]
  }, [consulta, filtro, sel, plantaDe])

  const cambiar = (f: (b: ListaBorrador[]) => ListaBorrador[]) => setBorrador((b) => f(b))

  const alternarSel = (id: string, nombre: string) => setSel((m) => {
    const n = new Map(m)
    if (n.has(id)) n.delete(id); else n.set(id, nombre)
    return n
  })

  const destinoNuevo = destino === NUEVA
  const nombreNuevaValido = !destinoNuevo || (nombreNueva.trim() !== '' && crearLista(borrador, nombreNueva).key !== null)
  const puedeAgregar = sel.size > 0 && nombreNuevaValido

  const agregarSeleccion = () => {
    if (!puedeAgregar) return
    const equipos = [...sel].map(([id, nombre]) => ({ id, nombre }))
    let key = destino
    let base = borrador
    if (destinoNuevo) {
      const r = crearLista(borrador, nombreNueva)
      if (!r.key) return
      base = r.borrador
      key = r.key
      setDestino(r.key)
    }
    setBorrador(agregarEquipos(base, key, equipos))
    setSel(new Map())
    setNombreNueva('')
  }

  const intentarCerrar = () => {
    if (guardando) return
    if (diff.hayCambios) setDescartar(true)
    else onOpenChange(false)
  }

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(aplicarBorrador(borrador))
      onOpenChange(false)
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const alGuardar = () => {
    if (!diff.hayCambios || guardando) return
    if (diff.requiereClave) setClaveAbierta(true)
    else void guardar()
  }

  const nListas = borrador.filter((l) => !l.eliminada).length

  return (
    <>
      <Sheet
        open={open}
        onClose={intentarCerrar}
        title="Favoritos de equipos"
        surface="grouped"
        size="wide"
        actions={
          <div className="flex flex-col gap-2 pb-[max(4px,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <p role="status" className="min-w-0 flex-1 text-footnote text-muted-foreground tabular-nums">
                {error ?? resumenDe(diff)}
              </p>
              <Button variant="plain" onClick={intentarCerrar} disabled={guardando}>Cancelar</Button>
              <Button
                variant={diff.requiereClave ? 'destructive' : 'filled'}
                onClick={alGuardar}
                disabled={!diff.hayCambios || guardando}
                className="!flex-none"
              >
                {diff.requiereClave ? 'Quitar y guardar' : 'Guardar'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8">
          <div className="flex flex-col gap-5">
            {borrador.length === 0 && (
              <p className="px-2 text-subhead text-muted-foreground">Aún no hay listas. Busca equipos y crea la primera.</p>
            )}
            {borrador.map((l) => (
              <BloqueLista key={l.key} lista={l} plantaDe={plantaDe} onBorrador={cambiar} />
            ))}
          </div>

          <section className="flex flex-col gap-3" aria-label="Agregar equipos">
            <h3 className="px-2 text-subhead font-semibold text-muted-foreground">Agregar equipos</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                enterKeyHint="search"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Buscar equipo"
                aria-label="Buscar equipo para agregar"
                className="h-[44px] w-full rounded-[22px] border-0 bg-muted pl-10 pr-11 text-body placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:appearance-none"
              />
              {consulta && (
                <button
                  type="button"
                  onClick={() => setConsulta('')}
                  aria-label="Borrar búsqueda"
                  className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-full text-muted-foreground"
                >
                  <X className="size-[18px]" aria-hidden />
                </button>
              )}
            </div>
            <SegmentedControl<FiltroPlanta>
              ariaLabel="Planta"
              value={filtro}
              onChange={setFiltro}
              segments={[
                { value: 'todas', label: 'Todas' },
                { value: 'chonchi', label: 'Chonchi' },
                { value: 'yal', label: 'Yal' },
              ]}
            />

            {grupos.length === 0 ? (
              <p className="px-2 text-subhead text-muted-foreground">
                {normalizeForSearch(consulta).length < 2 ? 'Escribe al menos 2 letras para buscar.' : 'Ningún equipo coincide.'}
              </p>
            ) : grupos.map(([planta, filas]) => (
              <div key={planta} className="flex flex-col">
                <h4 className="px-2 pb-1 text-footnote font-semibold text-muted-foreground">{planta}</h4>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-card bg-card">
                  {filas.map((r) => {
                    const ya = yaIds.has(r.id)
                    const marcado = sel.has(r.id)
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={ya || marcado}
                          disabled={ya}
                          onClick={() => alternarSel(r.id, r.nombre)}
                          className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left disabled:opacity-60"
                        >
                          <span
                            className={cn(
                              'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                              marcado || ya ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                            )}
                            aria-hidden
                          >
                            {(marcado || ya) && <Check className="size-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body">{r.nombre}</span>
                            {r.sub && <span className="block truncate text-footnote text-muted-foreground">{r.sub}</span>}
                          </span>
                          {ya && <span className="text-footnote text-muted-foreground">Ya está</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}

            <div className="flex flex-col gap-2">
              <label className="px-2 text-footnote font-semibold text-muted-foreground" htmlFor="fav-destino">Agregar a la lista</label>
              <select
                id="fav-destino"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="h-11 w-full rounded-ctl border-0 bg-muted px-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {borrador.filter((l) => !l.eliminada).map((l) => <option key={l.key} value={l.key}>{l.nombre}</option>)}
                <option value={NUEVA}>Nueva lista…</option>
              </select>
              {destinoNuevo && (
                <input
                  value={nombreNueva}
                  onChange={(e) => setNombreNueva(e.target.value)}
                  placeholder="Nombre de la nueva lista"
                  aria-label="Nombre de la nueva lista"
                  className="h-11 w-full rounded-ctl border-0 bg-muted px-3 text-body placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              )}
              <Button variant="tinted" onClick={agregarSeleccion} disabled={!puedeAgregar || (nListas === 0 && !destinoNuevo)}>
                {sel.size === 1 ? 'Agregar 1 equipo' : `Agregar ${sel.size} equipos`}
              </Button>
            </div>
          </section>
        </div>
      </Sheet>

      <ActionSheet
        open={descartar}
        title="¿Descartar los cambios?"
        description="Lo que editaste en las listas no se guardará."
        confirmLabel="Descartar cambios"
        onConfirm={() => { setDescartar(false); onOpenChange(false) }}
        cancelLabel="Seguir editando"
        onCancel={() => setDescartar(false)}
      />

      <ReAuthConfirmDialog
        elevado
        open={claveAbierta}
        onOpenChange={setClaveAbierta}
        reason={motivoDe(diff, plantaDe)}
        onConfirmed={guardar}
      />
    </>
  )
}
