import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Cog, MapPin, Package, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, CellIcon, Disclosure, ListCell, ListGroup, Sheet } from '@/components/piel'
import { normalizeForSearch } from '@/utils/repuestos/searchNormalize'
import type { FavoritoQuitado } from '@/utils/repuestos/favoritosListas'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import type { RecienteRepuesto } from '@/utils/repuestos/recientesRepuestos'

/**
 * Entrada de Repuestos en el teléfono, cuando todavía no hay área, equipo ni búsqueda.
 *
 * Antes: «Selecciona un área», contadores en 0 y un cuadro vacío. Ahora son tres listas
 * agrupadas que llevan a lo que se usa en planta: lo último que se miró (Recientes), los
 * equipos marcados (Favoritos) y el árbol por área (Por área). Una sección sin datos no se
 * dibuja, así nunca aparece un 0 que se lea como «no hay stock».
 */

/** Reciente ya resuelto contra el catálogo: `nombre` es el título a mostrar y `oficial` el nombre SAP (solo si hay nombre común). */
export type RecienteVisible = RecienteRepuesto & { oficial?: string | null }
export interface FavoritoEquipo { id: string; nombre: string }
export interface ListaFavoritos { nombre: string; items: FavoritoEquipo[] }
export interface AreaFila { id: string; nombre: string; equipos: number }

interface Props {
  recientes: RecienteVisible[]
  onAbrirReciente: (r: RecienteRepuesto) => void
  onLimpiarRecientes: () => void
  listasFavoritos: ListaFavoritos[]
  favoritosCargando: boolean
  onAbrirEquipo: (id: string, nombre: string) => void
  /** Solo admin: quitar un equipo de su lista desde la hoja «Ver todos» (modo Editar). */
  onQuitarFavorito?: (lista: string, id: string) => void
  /** Solo admin: deshacer un quitar; devuelve el equipo a su posición y recrea la lista si quedó vacía. */
  onRestaurarFavorito?: (quitado: FavoritoQuitado) => void
  /** «Buscar en todos los repuestos»: pasa el texto al buscador principal. */
  onBuscarTodo?: (texto: string) => void
  areas: AreaFila[]
  onAbrirArea: (id: string) => void
}

const VISIBLES_RECIENTES = 5
const VISIBLES_FAVORITOS = 5

/** Los nombres de SAP y de equipo llegan en mayúsculas; los escritos a mano se respetan. */
function nombreBonito(n: string): string {
  if (/[a-záéíóúñ]/.test(n)) return n
  return formatNombreSAP(n).nombre || n
}

/** Primeros nombres de la lista para la cabecera plegada: «Marel hg, Baader 142 y 9 más». */
function resumenLista(l: ListaFavoritos): string {
  const nombres = l.items.slice(0, 2).map((f) => nombreBonito(f.nombre))
  const resto = l.items.length - nombres.length
  return resto > 0 ? `${nombres.join(', ')} y ${resto} más` : nombres.join(', ')
}

const accionHeader = '-my-3 flex min-h-[44px] items-center px-2 text-subhead font-medium text-primary'

export function RepuestosEntrada({
  recientes, onAbrirReciente, onLimpiarRecientes,
  listasFavoritos, favoritosCargando, onAbrirEquipo, onQuitarFavorito, onRestaurarFavorito, onBuscarTodo,
  areas, onAbrirArea,
}: Props) {
  const [verTodosFav, setVerTodosFav] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [editando, setEditando] = useState(false)
  /** Fila con el signo menos tocado: muestra «Quitar» (clave `lista` + NUL + `id`). */
  const [porQuitar, setPorQuitar] = useState<string | null>(null)
  const [quitados, setQuitados] = useState<FavoritoQuitado[]>([])
  const cuerpoRef = useRef<HTMLDivElement>(null)
  /** Alto del cuerpo congelado al enfocar el buscador, para que la hoja no salte al filtrar. */
  const [altoCongelado, setAltoCongelado] = useState<number | undefined>(undefined)
  const puedeEditar = Boolean(onQuitarFavorito && onRestaurarFavorito)

  const totalFavoritos = useMemo(() => listasFavoritos.reduce((n, l) => n + l.items.length, 0), [listasFavoritos])

  // Los 5 favoritos tocados hace menos tiempo; sin historial, los primeros en el orden guardado.
  const favoritosVisibles = useMemo(() => {
    const planos: FavoritoEquipo[] = []
    const vistos = new Set<string>()
    for (const l of listasFavoritos) for (const it of l.items) {
      if (!vistos.has(it.id)) { vistos.add(it.id); planos.push(it) }
    }
    const porId = new Map(planos.map((f) => [f.id, f]))
    const recientesEquipo: FavoritoEquipo[] = []
    for (const r of recientes) {
      if (r.tipo !== 'equipo') continue
      const f = porId.get(r.id)
      if (f && !recientesEquipo.includes(f)) recientesEquipo.push(f)
    }
    const resto = planos.filter((f) => !recientesEquipo.includes(f))
    return [...recientesEquipo, ...resto].slice(0, VISIBLES_FAVORITOS)
  }, [listasFavoritos, recientes])

  const busqueda = normalizeForSearch(consulta)
  const listasVisibles = useMemo(() => listasFavoritos.filter((l) => l.items.length > 0), [listasFavoritos])
  const coincidencias = useMemo(() => {
    if (!busqueda) return []
    return listasVisibles
      .map((lista) => ({ lista, items: lista.items.filter((f) => normalizeForSearch(nombreBonito(f.nombre)).includes(busqueda)) }))
      .filter((c) => c.items.length > 0)
  }, [listasVisibles, busqueda])

  const cerrarHoja = () => {
    setVerTodosFav(false)
    setConsulta('')
    setEditando(false)
    setPorQuitar(null)
    setQuitados([])
    setAltoCongelado(undefined)
  }

  /** Nombre con subrayado en lo que coincide con la búsqueda (sin cambiar el color del texto). */
  const resaltar = (nombre: string): ReactNode => {
    if (!busqueda) return nombre
    const plano = nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const i = plano.indexOf(busqueda)
    if (i < 0 || plano.length !== nombre.length) return nombre
    return (
      <>
        {nombre.slice(0, i)}
        <mark className="bg-transparent text-inherit underline decoration-primary decoration-2 underline-offset-[3px]">{nombre.slice(i, i + busqueda.length)}</mark>
        {nombre.slice(i + busqueda.length)}
      </>
    )
  }

  const nombreQuitado = (q: FavoritoQuitado) => nombreBonito(q.machineName || q.machineId)

  const quitar = (lista: string, f: FavoritoEquipo) => {
    if (!onQuitarFavorito) return
    const listIndex = listasFavoritos.findIndex((l) => l.nombre === lista)
    const index = listasFavoritos[listIndex]?.items.findIndex((x) => x.id === f.id) ?? -1
    if (listIndex < 0 || index < 0) return
    setQuitados((q) => [...q, { listName: lista, machineId: f.id, machineName: f.nombre, index, listIndex }])
    setPorQuitar(null)
    onQuitarFavorito(lista, f.id)
  }

  const filaFavorito = (lista: string, f: FavoritoEquipo) => {
    const nombre = nombreBonito(f.nombre)
    const clave = `${lista}\u0000${f.id}`
    if (!editando) {
      return (
        <ListCell
          key={f.id}
          leading={<CellIcon tone="neutral"><Cog aria-hidden /></CellIcon>}
          title={resaltar(nombre)}
          onClick={() => { cerrarHoja(); onAbrirEquipo(f.id, f.nombre) }}
          className="min-h-[52px]"
        />
      )
    }
    return (
      <ListCell
        key={f.id}
        leading={
          <div className="-ml-3 flex items-center gap-1">
            <button
              type="button"
              aria-label={`Quitar ${nombre} de ${lista}`}
              aria-expanded={porQuitar === clave}
              onClick={() => setPorQuitar(porQuitar === clave ? null : clave)}
              className="flex size-11 items-center justify-center"
            >
              <span className="relative block size-[22px] rounded-full bg-destructive" aria-hidden>
                <span className="absolute inset-x-[5px] top-[10px] h-[2px] rounded-full bg-destructive-foreground" />
              </span>
            </button>
            <CellIcon tone="neutral"><Cog aria-hidden /></CellIcon>
          </div>
        }
        title={resaltar(nombre)}
        trailing={porQuitar === clave ? (
          <button
            type="button"
            onClick={() => quitar(lista, f)}
            className="flex min-h-[44px] items-center rounded-full bg-destructive px-4 text-subhead font-semibold text-destructive-foreground"
          >
            Quitar
          </button>
        ) : undefined}
        className="min-h-[52px] before:left-[4.6rem]"
      />
    )
  }

  const hayRecientes = recientes.length > 0
  const hayFavoritos = totalFavoritos > 0

  return (
    <div className="flex flex-col gap-6 pb-[calc(env(safe-area-inset-bottom)+7rem)]">
      {hayRecientes && (
        <ListGroup
          title="Recientes"
          action={<button type="button" onClick={onLimpiarRecientes} className={accionHeader}>Borrar</button>}
        >
          {recientes.slice(0, VISIBLES_RECIENTES).map((r) => (
            <ListCell
              key={`${r.tipo}:${r.id}`}
              leading={
                <CellIcon tone="neutral">
                  {r.tipo === 'equipo' ? <Cog aria-hidden /> : <Package aria-hidden />}
                </CellIcon>
              }
              title={nombreBonito(r.nombre)}
              subtitle={r.tipo === 'equipo'
                ? 'Equipo'
                : <>{r.oficial ? `${r.oficial} · ` : ''}<span className="font-mono tabular-nums">{r.id}</span></>}
              onClick={() => onAbrirReciente(r)}
              className="min-h-[52px]"
            />
          ))}
        </ListGroup>
      )}

      {favoritosCargando && !hayFavoritos ? (
        <ListGroup title="Favoritos">
          {[0, 1].map((i) => (
            <div key={i} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5" aria-hidden>
              <div className="size-[30px] shrink-0 animate-pulse rounded-[8px] bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </ListGroup>
      ) : hayFavoritos && (
        <ListGroup
          title="Favoritos"
          action={totalFavoritos > VISIBLES_FAVORITOS ? (
            <button type="button" onClick={() => setVerTodosFav(true)} className={accionHeader}>
              Ver los {totalFavoritos}
            </button>
          ) : undefined}
        >
          {favoritosVisibles.map((f) => (
            <ListCell
              key={f.id}
              leading={<CellIcon tone="neutral"><Cog aria-hidden /></CellIcon>}
              title={nombreBonito(f.nombre)}
              onClick={() => onAbrirEquipo(f.id, f.nombre)}
              className="min-h-[52px]"
            />
          ))}
        </ListGroup>
      )}

      {areas.length > 0 && (
        <ListGroup title="Por área">
          {areas.map((a) => (
            <ListCell
              key={a.id}
              leading={<CellIcon tone="neutral"><MapPin aria-hidden /></CellIcon>}
              title={nombreBonito(a.nombre)}
              value={a.equipos > 0 ? `${a.equipos} equipos` : undefined}
              onClick={() => onAbrirArea(a.id)}
              className="min-h-[52px]"
            />
          ))}
        </ListGroup>
      )}

      <Sheet
        open={verTodosFav}
        onClose={cerrarHoja}
        title="Favoritos"
        surface="grouped"
        headerAction={puedeEditar ? (
          <button
            type="button"
            onClick={() => {
              if (editando) { setEditando(false); setPorQuitar(null); setQuitados([]) } else { setEditando(true) }
            }}
            className={cn('flex min-h-[44px] items-center px-2 text-body text-primary', editando && 'font-semibold')}
          >
            {editando ? 'Listo' : 'Editar'}
          </button>
        ) : undefined}
        toolbar={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              enterKeyHint="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onFocus={() => setAltoCongelado(cuerpoRef.current?.offsetHeight)}
              onBlur={() => { if (!consulta) setAltoCongelado(undefined) }}
              placeholder={`Buscar en ${totalFavoritos} favoritos`}
              aria-label="Buscar en favoritos"
              className="h-[44px] w-full rounded-[22px] border-0 bg-muted pl-10 pr-11 text-body placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:appearance-none"
            />
            {consulta && (
              <button
                type="button"
                onClick={() => { setConsulta(''); setAltoCongelado(undefined) }}
                aria-label="Borrar búsqueda"
                className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-full text-muted-foreground"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            )}
          </div>
        }
      >
        <div ref={cuerpoRef} style={altoCongelado ? { minHeight: altoCongelado } : undefined} className="flex flex-col gap-4">
          {busqueda ? (
            coincidencias.length === 0 ? (
              <div className="px-1 text-subhead text-muted-foreground">
                <p>Ningún favorito coincide con «{consulta.trim()}».</p>
                {onBuscarTodo && (
                  <Button
                    variant="plain"
                    className="-ml-3 mt-1 h-auto min-h-[44px] whitespace-normal text-left"
                    onClick={() => { const t = consulta.trim(); cerrarHoja(); onBuscarTodo(t) }}
                  >
                    Buscar «{consulta.trim()}» en todos los repuestos
                  </Button>
                )}
              </div>
            ) : coincidencias.map((c) => (
              <ListGroup
                key={c.lista.nombre}
                title={<>{c.lista.nombre} <span className="font-normal tabular-nums">· {c.items.length} de {c.lista.items.length}</span></>}
              >
                {c.items.map((f) => filaFavorito(c.lista.nombre, f))}
              </ListGroup>
            ))
          ) : (
            listasVisibles.map((l) => (
              <Disclosure
                key={l.nombre}
                flush
                storageKey={`repuestos-fav-abierta:${l.nombre}`}
                defaultOpen={listasVisibles.length === 1}
                title={
                  <span className="flex items-center gap-2">
                    <span className="block min-w-0 flex-1">
                      <span className="block truncate">{l.nombre}</span>
                      <span className="block truncate text-footnote font-normal text-muted-foreground">{resumenLista(l)}</span>
                    </span>
                    <span className="shrink-0 text-subhead font-normal tabular-nums text-muted-foreground">{l.items.length}</span>
                  </span>
                }
              >
                {l.items.map((f) => filaFavorito(l.nombre, f))}
              </Disclosure>
            ))
          )}
          {quitados.length > 0 && onRestaurarFavorito && (
            <div
              role="status"
              className="sticky bottom-0 flex min-h-[52px] items-center gap-2 rounded-card bg-card py-1 pl-4 pr-2 shadow-[0_2px_12px_rgba(0,0,0,0.10)] dark:shadow-none"
            >
              <span className="min-w-0 flex-1 text-subhead leading-snug">
                {nombreQuitado(quitados[quitados.length - 1]!)} quitado de {quitados[quitados.length - 1]!.listName}
              </span>
              <button
                type="button"
                onClick={() => {
                  const ultimo = quitados[quitados.length - 1]!
                  onRestaurarFavorito(ultimo)
                  setQuitados((q) => q.slice(0, -1))
                }}
                className="flex min-h-[44px] items-center px-3 text-body font-semibold text-primary"
              >
                Deshacer
              </button>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  )
}
