/**
 * «Mis equipos» en PC: lo acumulado a la izquierda y una lista por vez a la derecha. Al buscar,
 * los resultados toman el lugar de la tabla. El borrador vive en `EditarFavoritosSheet`.
 * Mockup aprobado (opción B): https://claude.ai/artifact/Ea8CkhDEamJtEj61FH2ojU
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
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
import { Button, Sheet } from '@/components/piel'
import { Checkbox } from '@/components/ui/checkbox'
import { getGlobalEquipmentCache } from '@/hooks/useGlobalEquipmentSearch'
import { plantaCorta } from '@/hooks/repuestos/dondeSeUsa'
import {
  alternarEliminarLista,
  alternarQuitar,
  renombrarLista,
  reordenar,
  type DiffFavoritos,
  type ItemBorrador,
  type ListaBorrador,
} from '@/hooks/repuestos/edicionFavoritos'
import { useRespaldoEquipos, type RespaldoEquipos } from '@/hooks/repuestos/useRespaldoEquipos'
import { cn } from '@/lib/utils'
import { cifra, contarPorSeccion, nombreSeccion, ordenarResultados, sumaColumna } from '@/utils/repuestos/misEquiposResumen'

const FILA = 'grid grid-cols-[20px_24px_minmax(0,1fr)_92px_106px_74px_62px_62px_70px] items-center gap-x-[10px]'
const FILA_RES = 'grid grid-cols-[18px_minmax(0,1fr)_92px_106px_74px_190px] items-center gap-x-[10px]'
const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const CAMPO = `h-[36px] rounded-ctl border border-border bg-background px-2.5 text-subhead text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary`
const BOTON_TEXTO = `text-subhead text-muted-foreground hover:text-foreground rounded-ctl ${FOCO}`
const DATO = 'flex min-h-[28px] items-center justify-between gap-3 border-t border-border text-subhead tabular-nums'
const CAP = 'mb-1.5 text-footnote text-muted-foreground'

export type FiltroPlanta = 'todas' | 'chonchi' | 'yal'
export interface ResultadoEquipo { id: string; nombre: string; sub: string; planta: string }
export const NUEVA_LISTA = '__nueva__'

interface FichaEquipo { nodeId: string; codigo: string; seccion: string | undefined }

const Punto = ({ color }: { color: string }) => <span className={cn('mr-1.5 inline-block size-[7px] rounded-full align-[1px]', color)} aria-hidden />

function FilaEquipoPC({ lista, item, orden, ficha, respaldo, onQuitar }: {
  lista: string
  item: ItemBorrador
  orden: number | null
  ficha: FichaEquipo | undefined
  respaldo: RespaldoEquipos
  onQuitar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: item.quitar })
  const style = { transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null), transition }
  const nodo = ficha?.nodeId ?? ''
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(FILA, 'min-h-[32px] border-t border-border text-subhead tabular-nums', isDragging && 'relative z-10 bg-card shadow-[0_4px_16px_rgba(0,0,0,0.18)]')}
    >
      {item.quitar ? <span /> : (
        <button
          type="button"
          aria-label={`Reordenar ${item.nombre}`}
          className={cn('flex h-[30px] w-5 cursor-grab touch-none items-center justify-center text-muted-foreground', FOCO)}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
      <span className="text-right text-muted-foreground">{orden ?? ''}</span>
      <span className={cn('truncate', item.quitar && 'text-muted-foreground line-through')}>{item.nombre}</span>
      <span className="truncate text-muted-foreground">{ficha?.codigo || '—'}</span>
      {item.quitar ? (
        <span><Punto color="bg-fill-critical" />Se quitará</span>
      ) : item.nuevo ? (
        <span><Punto color="bg-primary" />Nuevo</span>
      ) : (
        <span className="truncate text-muted-foreground">{ficha?.seccion ? nombreSeccion(ficha.seccion) : '—'}</span>
      )}
      <span className="text-right">{cifra(respaldo.repuestos.get(nodo))}</span>
      <span className="text-right">{cifra(respaldo.conSap.get(nodo))}</span>
      <span className="text-right">{ficha?.codigo ? cifra(respaldo.eventos.get(ficha.codigo)) : '—'}</span>
      {item.quitar ? (
        <button type="button" onClick={onQuitar} className={cn('justify-self-end rounded-ctl text-subhead text-primary', FOCO)}>Deshacer</button>
      ) : (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={item.nuevo ? `Retirar ${item.nombre}` : `Quitar ${item.nombre} de ${lista}`}
          className={cn('flex h-[30px] w-6 items-center justify-center justify-self-end rounded-ctl text-muted-foreground hover:text-foreground', FOCO)}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export interface TituloListaRef { editar: () => void }

const TituloLista = forwardRef<TituloListaRef, { lista: ListaBorrador; onRenombrar: (nombre: string) => void }>(function TituloLista({ lista, onRenombrar }, ref) {
  const [texto, setTexto] = useState(lista.nombre)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { setTexto(lista.nombre) }, [lista.nombre, lista.key])
  useImperativeHandle(ref, () => ({ editar: () => { input.current?.focus(); input.current?.select() } }), [])
  const confirmar = () => {
    const limpio = texto.trim()
    if (limpio && limpio !== lista.nombre) onRenombrar(limpio)
    // Un nombre vacío o repetido no cambia el borrador: se vuelve al anterior.
    setTexto(lista.nombre)
  }
  return (
    <input
      ref={input}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      aria-label={`Nombre de la lista ${lista.nombre}`}
      className={cn('block h-[30px] w-full min-w-0 truncate rounded-ctl bg-transparent text-title2 font-semibold text-foreground', FOCO)}
    />
  )
})

function TablaLista({ lista, fichas, respaldo, onBorrador }: {
  lista: ListaBorrador
  fichas: ReadonlyMap<string, FichaEquipo>
  respaldo: RespaldoEquipos
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
  const vigentes = lista.items.filter((i) => !i.quitar)
  const nodo = (i: ItemBorrador) => fichas.get(i.id)?.nodeId ?? ''
  const col = (m: ReadonlyMap<string, number | null>, k: (i: ItemBorrador) => string) => sumaColumna(vigentes.map((i) => m.get(k(i))))
  const eventos = sumaColumna(vigentes.map((i) => {
    const c = fichas.get(i.id)?.codigo
    return c ? respaldo.eventos.get(c) : 0
  }))
  let orden = 0
  return (
    <>
      <div className={cn(FILA, 'sticky top-0 z-[1] min-h-[26px] bg-card text-footnote text-muted-foreground')}>
        <span /><span className="text-right">N.º</span><span>Equipo</span><span>Código</span><span>Sección</span>
        <span className="text-right">Repuestos</span><span className="text-right">Con SAP</span><span className="text-right">Bitácora</span><span />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
        <SortableContext items={lista.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {lista.items.map((it) => (
            <FilaEquipoPC
              key={it.id}
              lista={lista.nombre}
              item={it}
              orden={it.quitar ? null : ++orden}
              ficha={fichas.get(it.id)}
              respaldo={respaldo}
              onQuitar={() => onBorrador((b) => alternarQuitar(b, lista.key, it.id))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className={cn(FILA, 'min-h-[32px] border-t border-border text-subhead font-semibold tabular-nums')}>
        <span /><span />
        <span>{vigentes.length === 1 ? '1 equipo' : `${vigentes.length} equipos`}</span>
        <span /><span />
        <span className="text-right">{cifra(col(respaldo.repuestos, nodo))}</span>
        <span className="text-right">{cifra(col(respaldo.conSap, nodo))}</span>
        <span className="text-right">{cifra(eventos)}</span>
        <span />
      </div>
    </>
  )
}

export interface EditarFavoritosPCProps {
  open: boolean
  onClose: () => void
  borrador: ListaBorrador[]
  activa: string | null
  onActiva: (key: string) => void
  onBorrador: (f: (b: ListaBorrador[]) => ListaBorrador[]) => void
  onCrearLista: (nombre: string) => boolean
  plantaDe: (id: string) => string | undefined
  seccionDe: (id: string) => string | undefined
  diff: DiffFavoritos
  consulta: string
  buscando: boolean
  onConsulta: (valor: string) => void
  onVolver: () => void
  filtro: FiltroPlanta
  onFiltro: (f: FiltroPlanta) => void
  conteo: Record<FiltroPlanta, number>
  grupos: [string, ResultadoEquipo[]][]
  seleccion: ReadonlyMap<string, string>
  onAlternar: (id: string, nombre: string) => void
  yaIds: ReadonlySet<string>
  destino: string
  onDestino: (valor: string) => void
  nombreNueva: string
  onNombreNueva: (valor: string) => void
  puedeAgregar: boolean
  onAgregar: () => void
  guardando: boolean
  error: string | null
  onGuardar: () => void
}

export function EditarFavoritosPC({
  open, onClose, borrador, activa, onActiva, onBorrador, onCrearLista, plantaDe, seccionDe, diff, consulta, buscando,
  onConsulta, onVolver, filtro, onFiltro, conteo, grupos, seleccion, onAlternar, yaIds, destino, onDestino,
  nombreNueva, onNombreNueva, puedeAgregar, onAgregar, guardando, error, onGuardar,
}: EditarFavoritosPCProps) {
  const lista = borrador.find((l) => l.key === activa) ?? borrador[0]
  const titulo = useRef<TituloListaRef>(null)
  const [creando, setCreando] = useState(false)
  const [nombreCrear, setNombreCrear] = useState('')

  // id guardado (nodo o máquina vinculada) → ficha del equipo.
  const porId = useMemo(() => {
    const m = new Map<string, FichaEquipo>()
    for (const e of getGlobalEquipmentCache() ?? []) {
      const f = { nodeId: e.id, codigo: e.codigo, seccion: seccionDe(e.id) }
      m.set(e.id, f)
      if (e.linkedMachineId) m.set(e.linkedMachineId, f)
    }
    return m
  }, [seccionDe])

  const vigentes = useMemo(() => borrador.filter((l) => !l.eliminada).flatMap((l) => l.items.filter((i) => !i.quitar)), [borrador])
  const unicos = useMemo(() => [...new Map(vigentes.map((i) => [i.id, i])).values()], [vigentes])
  const equipos = useMemo(() => unicos.flatMap((i) => {
    const f = porId.get(i.id)
    return f ? [{ nodeId: f.nodeId, codigo: f.codigo }] : []
  }), [unicos, porId])
  const idsResultado = useMemo(() => [...new Set(grupos.flatMap(([, fs]) => fs.flatMap((r) => porId.get(r.id)?.nodeId ?? [])))], [grupos, porId])
  const respaldo = useRespaldoEquipos(open, equipos, idsResultado)

  const secciones = contarPorSeccion(vigentes.map((i) => porId.get(i.id)?.seccion))
  const eventos = sumaColumna(equipos.filter((e) => e.codigo).map((e) => respaldo.eventos.get(e.codigo)))
  const sinRepuestos = equipos.every((e) => respaldo.repuestos.has(e.nodeId)) ? equipos.filter((e) => respaldo.repuestos.get(e.nodeId) === 0).length : null
  const { total: repTotal, conSap } = respaldo.sinRepetir ?? { total: null, conSap: null }
  const pctSap = repTotal && conSap !== null ? ` · ${Math.round((conSap / repTotal) * 100)} %` : ''

  const plantas = lista ? [...new Set(lista.items.map((i) => plantaCorta(plantaDe(porId.get(i.id)?.nodeId ?? i.id))).filter(Boolean))] : []
  const subtitulo = [
    plantas.length ? `Planta ${plantas.join(' y ')}` : '',
    lista?.origen && lista.origen !== lista.nombre ? `antes «${lista.origen}»` : '',
  ].filter(Boolean).join(' · ')

  const textoConsulta = consulta.trim()
  const hayConsulta = textoConsulta.length >= 2
  const totalVisibles = conteo[filtro]
  const filas = grupos.flatMap(([, f]) => f)
  const yaEnListas = filas.filter((r) => yaIds.has(r.id)).length
  const disponiblesPor = (p: FiltroPlanta) => grupos.filter(([n]) => n.toLowerCase().startsWith(p)).flatMap(([, f]) => f).filter((r) => !yaIds.has(r.id)).length
  const listaDe = (id: string) => borrador.find((l) => !l.eliminada && l.items.some((i) => i.id === id))?.nombre
  const n = seleccion.size
  const destinoNuevo = destino === NUEVA_LISTA
  const nListas = borrador.filter((l) => !l.eliminada).length

  const confirmarCrear = () => {
    if (onCrearLista(nombreCrear)) { setCreando(false); setNombreCrear('') }
  }

  return (
    <Sheet open={open} onClose={onClose} presentacionPC="libre" title="Mis equipos">
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-[22px] overflow-y-auto border-r border-border bg-background px-5 py-6">
          <div>
            <p className={CAP}>Mis listas</p>
            {borrador.map((l) => {
              const on = l.key === lista?.key
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => onActiva(l.key)}
                  aria-current={on ? 'true' : undefined}
                  className={cn('-mx-2.5 flex min-h-[36px] w-[calc(100%+20px)] items-center justify-between gap-3 rounded-ctl px-2.5 text-left text-subhead tabular-nums', FOCO, on && 'bg-muted-foreground/15 font-semibold')}
                >
                  <span className={cn('truncate', l.eliminada && 'text-muted-foreground line-through')}>{l.nombre}</span>
                  <span>{l.items.filter((i) => !i.quitar).length}</span>
                </button>
              )
            })}
            <div className={cn(DATO, 'mt-1 font-semibold')}><span>Total equipos</span><span>{vigentes.length}</span></div>
            {creando ? (
              <input
                autoFocus
                value={nombreCrear}
                onChange={(e) => setNombreCrear(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmarCrear()
                  if (e.key === 'Escape') { e.stopPropagation(); setCreando(false); setNombreCrear('') }
                }}
                onBlur={() => { if (!nombreCrear.trim()) setCreando(false) }}
                placeholder="Nombre de la lista"
                aria-label="Nombre de la lista nueva"
                className={cn(CAMPO, 'mt-1.5 w-full')}
              />
            ) : (
              <button type="button" onClick={() => setCreando(true)} className={cn('mt-1 min-h-[30px] rounded-ctl text-subhead text-primary', FOCO)}>Nueva lista</button>
            )}
          </div>

          <div>
            <p className={CAP}>Por sección de la línea</p>
            {secciones.map((s) => <div key={s.nombre} className={DATO}><span>{s.nombre}</span><span>{s.n}</span></div>)}
          </div>

          <div>
            <p className={CAP}>Lo que respalda estas listas</p>
            <div className={DATO}><span>Repuestos, sin repetir</span><span>{cifra(repTotal)}</span></div>
            <div className={DATO}><span>Con código SAP</span><span>{cifra(conSap)}{pctSap}</span></div>
            <div className={DATO}><span>Eventos de bitácora</span><span>{cifra(eventos)}</span></div>
            <div className={DATO}><span><Punto color="bg-fill-warning" />Sin repuestos cargados</span><span>{cifra(sinRepuestos)}</span></div>
          </div>

          <div className="mt-auto">
            <p className={CAP}>Al guardar</p>
            {!diff.hayCambios ? (
              <div className={DATO}><span className="text-muted-foreground">Sin cambios</span></div>
            ) : (
              <>
                {diff.agregados.length > 0 && <div className={DATO}><span>Se agregan</span><span>{diff.agregados.length}</span></div>}
                {diff.quitados.length > 0 && <div className={DATO}><span>Se quitan</span><span>{diff.quitados.length}</span></div>}
                {diff.listasEliminadas.length > 0 && <div className={DATO}><span>Listas eliminadas</span><span>{diff.listasEliminadas.length}</span></div>}
                {diff.renombres.length > 0 && <div className={DATO}><span>Listas renombradas</span><span>{diff.renombres.length}</span></div>}
                {diff.agregados.length + diff.quitados.length + diff.listasEliminadas.length + diff.renombres.length === 0 && (
                  <div className={DATO}><span>Cambió el orden</span></div>
                )}
              </>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex items-start justify-between gap-5 px-7 pb-3.5 pt-5">
            <div className="min-w-0 flex-1">
              {buscando ? (
                <>
                  <h2 className="truncate text-title2 font-semibold">
                    {hayConsulta ? `${totalVisibles >= 60 ? 'Primeros 60 equipos' : totalVisibles === 1 ? '1 equipo' : `${totalVisibles} equipos`} con «${textoConsulta}»` : n === 1 ? '1 equipo por agregar' : `${n} equipos por agregar`}
                  </h2>
                  <p className="text-footnote text-muted-foreground">
                    {`${disponiblesPor('chonchi')} disponibles en Chonchi, ${disponiblesPor('yal')} en Yal · ${yaEnListas} ya en tus listas`}
                  </p>
                </>
              ) : lista ? (
                <>
                  <TituloLista ref={titulo} lista={lista} onRenombrar={(nombre) => onBorrador((b) => renombrarLista(b, lista.key, nombre))} />
                  <p className="min-h-[18px] text-footnote text-muted-foreground">{subtitulo}</p>
                </>
              ) : (
                <h2 className="text-title2 font-semibold">Mis equipos</h2>
              )}
            </div>
            <div className="flex shrink-0 gap-5">
              {buscando ? (
                <button type="button" onClick={onVolver} className={cn(BOTON_TEXTO, 'min-h-[30px]')}>Volver a la lista</button>
              ) : lista && (
                <>
                  <button type="button" onClick={() => titulo.current?.editar()} className={cn(BOTON_TEXTO, 'min-h-[30px]')}>Renombrar</button>
                  <button type="button" onClick={() => onBorrador((b) => alternarEliminarLista(b, lista.key))} className={cn(BOTON_TEXTO, 'min-h-[30px]')}>Eliminar lista</button>
                </>
              )}
              <button type="button" onClick={onClose} disabled={guardando} className={cn(BOTON_TEXTO, 'min-h-[30px]')}>Cerrar</button>
            </div>
          </header>

          <div className="flex items-center gap-2.5 px-7 pb-3.5">
            <div className="relative w-[380px]">
              <input
                type="search"
                value={consulta}
                onChange={(e) => onConsulta(e.target.value)}
                placeholder="Buscar equipo para agregar"
                aria-label="Buscar equipo para agregar"
                className={cn(CAMPO, 'w-full pr-9 [&::-webkit-search-cancel-button]:appearance-none')}
              />
              {consulta && (
                <button type="button" onClick={() => onConsulta('')} aria-label="Borrar búsqueda" className={cn('absolute right-0 top-0 flex size-[36px] items-center justify-center rounded-ctl text-muted-foreground', FOCO)}>
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
            <div role="group" aria-label="Planta" className="grid grid-cols-3 overflow-hidden rounded-ctl border border-border">
              {([['todas', 'Todas'], ['chonchi', 'Chonchi'], ['yal', 'Yal']] as const).map(([v, t], i) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={filtro === v}
                  onClick={() => onFiltro(v)}
                  className={cn('h-[34px] min-w-[76px] px-3 text-subhead tabular-nums', FOCO, i > 0 && 'border-l border-border', filtro === v ? 'bg-muted-foreground/15 text-foreground' : 'text-muted-foreground')}
                >
                  {hayConsulta ? `${t} ${conteo[v]}` : t}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-2">
            {buscando ? (
              grupos.length === 0 ? (
                <p className="py-3 text-subhead text-muted-foreground">Ningún equipo coincide.</p>
              ) : (
                <>
                  <div className={cn(FILA_RES, 'sticky top-0 z-[1] min-h-[26px] bg-card text-footnote text-muted-foreground')}>
                    <span /><span>Equipo</span><span>Código</span><span>Sección</span><span className="text-right">Repuestos</span><span>Estado</span>
                  </div>
                  {grupos.map(([planta, fs]) => (
                    <div key={planta}>
                      <div className="flex justify-between border-t border-border pb-1.5 pt-3 text-footnote font-semibold tabular-nums text-muted-foreground"><span>{planta}</span><span>{fs.length}</span></div>
                      {ordenarResultados(fs, yaIds).map((r) => {
                        const ya = yaIds.has(r.id)
                        const marcado = seleccion.has(r.id)
                        const f = porId.get(r.id)
                        return (
                          <label key={r.id} className={cn(FILA_RES, 'min-h-[32px] cursor-pointer border-t border-border text-subhead tabular-nums', ya && 'cursor-default text-muted-foreground')}>
                            <Checkbox checked={ya || marcado} disabled={ya} onCheckedChange={() => onAlternar(r.id, r.nombre)} aria-label={r.nombre} className="disabled:opacity-60" />
                            <span className="truncate">{r.nombre}</span>
                            <span className="truncate text-muted-foreground">{r.sub || f?.codigo || '—'}</span>
                            <span className="truncate text-muted-foreground">{f?.seccion ? nombreSeccion(f.seccion) : '—'}</span>
                            <span className="text-right">{cifra(respaldo.repuestos.get(f?.nodeId ?? ''))}</span>
                            <span className="truncate text-muted-foreground">{ya ? `En ${listaDe(r.id) ?? 'tus listas'}` : marcado ? 'Seleccionado' : ''}</span>
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </>
              )
            ) : !lista ? (
              <p className="py-3 text-subhead text-muted-foreground">Aún no hay listas. Busca equipos y crea la primera.</p>
            ) : lista.eliminada ? (
              <div className="flex min-h-[36px] items-center gap-4 border-t border-border">
                <p className="text-subhead"><Punto color="bg-fill-critical" />La lista se eliminará al guardar</p>
                <button type="button" onClick={() => onBorrador((b) => alternarEliminarLista(b, lista.key))} className={cn('rounded-ctl text-subhead text-primary', FOCO)}>Deshacer</button>
              </div>
            ) : lista.items.length === 0 ? (
              <p className="border-t border-border py-3 text-subhead text-muted-foreground">Sin equipos todavía. Agrégalos desde el buscador.</p>
            ) : (
              <TablaLista lista={lista} fichas={porId} respaldo={respaldo} onBorrador={onBorrador} />
            )}
          </div>

          {buscando && (
            <div className="flex items-center gap-2.5 border-t border-border bg-background/50 px-7 py-3">
              <span className="flex-1 text-subhead tabular-nums">{n === 1 ? '1 seleccionado' : `${n} seleccionados`}</span>
              <label htmlFor="fav-destino-pc" className="text-footnote text-muted-foreground">Agregar a</label>
              <select id="fav-destino-pc" value={destino} onChange={(e) => onDestino(e.target.value)} className={cn(CAMPO, 'w-[210px]')}>
                {borrador.filter((l) => !l.eliminada).map((l) => <option key={l.key} value={l.key}>{l.nombre}</option>)}
                <option value={NUEVA_LISTA}>Nueva lista…</option>
              </select>
              {destinoNuevo && (
                <input value={nombreNueva} onChange={(e) => onNombreNueva(e.target.value)} placeholder="Nombre de la nueva lista" aria-label="Nombre de la nueva lista" className={cn(CAMPO, 'w-[220px]')} />
              )}
              <Button size="sm" className="!min-h-[36px] !flex-none !rounded-ctl !px-[18px] !text-subhead" onClick={onAgregar} disabled={!puedeAgregar || (nListas === 0 && !destinoNuevo)}>
                {n === 1 ? 'Agregar 1 equipo' : `Agregar ${n} equipos`}
              </Button>
            </div>
          )}

          <footer className="flex items-center gap-3.5 border-t border-border px-7 py-3">
            <p role="status" className={cn('min-w-0 flex-1 text-footnote', error ? 'text-ink-crit' : 'text-muted-foreground')}>
              {error ?? (diff.requiereClave ? 'Para quitar se pide tu clave de usuario.' : '')}
            </p>
            <Button variant="plain" size="sm" className="!min-h-[36px] !px-0 !text-subhead !font-normal !text-muted-foreground" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button
              size="sm"
              variant={diff.requiereClave ? 'destructive' : 'filled'}
              className="!min-h-[36px] !flex-none !rounded-ctl !px-[18px] !text-subhead"
              onClick={onGuardar}
              disabled={!diff.hayCambios || guardando}
            >
              {diff.requiereClave ? 'Quitar y guardar' : 'Guardar'}
            </Button>
          </footer>
        </section>
      </div>
    </Sheet>
  )
}
