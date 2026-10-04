import { useMemo, useState } from 'react'
import { Cog, MapPin, Package, X } from 'lucide-react'
import { CellIcon, ListCell, ListGroup, Sheet } from '@/components/piel'
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

export interface FavoritoEquipo { id: string; nombre: string }
export interface ListaFavoritos { nombre: string; items: FavoritoEquipo[] }
export interface AreaFila { id: string; nombre: string; equipos: number }

interface Props {
  recientes: RecienteRepuesto[]
  onAbrirReciente: (r: RecienteRepuesto) => void
  onLimpiarRecientes: () => void
  listasFavoritos: ListaFavoritos[]
  favoritosCargando: boolean
  onAbrirEquipo: (id: string, nombre: string) => void
  /** Solo admin: quitar un equipo de su lista desde la hoja «Ver todos». */
  onQuitarFavorito?: (lista: string, id: string) => void
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

const accionHeader = '-my-3 flex min-h-[44px] items-center px-2 text-subhead font-medium text-primary'

export function RepuestosEntrada({
  recientes, onAbrirReciente, onLimpiarRecientes,
  listasFavoritos, favoritosCargando, onAbrirEquipo, onQuitarFavorito,
  areas, onAbrirArea,
}: Props) {
  const [verTodosFav, setVerTodosFav] = useState(false)

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
              subtitle={r.tipo === 'equipo' ? 'Equipo' : <span className="font-mono tabular-nums">{r.id}</span>}
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

      <Sheet open={verTodosFav} onClose={() => setVerTodosFav(false)} title={`Favoritos · ${totalFavoritos}`}>
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto overscroll-contain">
          {listasFavoritos.filter((l) => l.items.length > 0).map((l) => (
            <ListGroup key={l.nombre} title={l.nombre}>
              {l.items.map((f) => (
                <ListCell
                  key={f.id}
                  leading={<CellIcon tone="neutral"><Cog aria-hidden /></CellIcon>}
                  title={nombreBonito(f.nombre)}
                  onClick={() => { setVerTodosFav(false); onAbrirEquipo(f.id, f.nombre) }}
                  trailing={onQuitarFavorito ? (
                    <button
                      type="button"
                      aria-label={`Quitar ${nombreBonito(f.nombre)} de ${l.nombre}`}
                      onClick={(e) => { e.stopPropagation(); onQuitarFavorito(l.nombre, f.id) }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-[18px]" aria-hidden />
                    </button>
                  ) : undefined}
                  className="min-h-[52px]"
                />
              ))}
            </ListGroup>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
