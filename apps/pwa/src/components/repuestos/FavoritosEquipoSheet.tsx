import { useState } from 'react'
import { Check, Plus, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CellIcon, ListCell, ListGroup, Sheet } from '@/components/piel'
import type { RepuestoIdentificable } from '@/hooks/repuestos/identidadDeRepuesto'
import type { RepuestoFavoritosEquipo } from '@/hooks/repuestos/useRepuestoFavoritosEquipo'
import { LISTA_GENERAL } from '@/utils/repuestos/favoritosEquipo'

/**
 * Hoja «Favoritos de <equipo>» para UN repuesto: marcarlo como favorito del equipo, ponerlo en
 * una lista con nombre del equipo, o crear una lista nueva con él adentro.
 *
 * Es aparte de las estrellas globales: lo que se marca acá solo vale para este equipo.
 * Misma hoja en PC y celular (todas las filas miden ≥44 px).
 */
export interface FavoritosEquipoSheetProps {
  open: boolean
  onClose: () => void
  equipoNombre: string
  repuestoTitulo: string
  rep: RepuestoIdentificable | null
  fav: RepuestoFavoritosEquipo
}

export function FavoritosEquipoSheet({ open, onClose, equipoNombre, repuestoTitulo, rep, fav }: FavoritosEquipoSheetProps) {
  const [nueva, setNueva] = useState('')
  if (!rep) return null
  const esFav = fav.esFavorito(rep)
  const nombreValido = nueva.trim().length > 0 && !fav.listas.some((l) => l.name === nueva.trim())
  const crear = () => {
    if (!nombreValido) return
    fav.crearLista(nueva, rep)
    setNueva('')
  }
  // La lista general se muestra arriba como «Favorito de este equipo»; acá van las que armó el usuario.
  const listas = fav.listas.filter((l) => l.name !== LISTA_GENERAL)

  return (
    <Sheet
      open={open}
      onClose={() => { setNueva(''); onClose() }}
      title={`Favoritos de ${equipoNombre}`}
      description={repuestoTitulo}
      surface="grouped"
    >
      <ListGroup footer="Solo valen para este equipo. Tus estrellas de cada fila (Favoritos de todos los equipos) no cambian.">
        <ListCell
          leading={<CellIcon tone="neutral"><Star aria-hidden className={cn(esFav && 'fill-current')} /></CellIcon>}
          title="Favorito de este equipo"
          subtitle={esFav ? 'Marcado' : 'Sin marcar'}
          trailing={esFav ? <Check className="size-5 text-primary" aria-hidden /> : undefined}
          onClick={() => fav.toggleFav(rep)}
          role="button"
          aria-pressed={esFav}
          chevron={false}
          className="min-h-[44px]"
        />
      </ListGroup>

      <ListGroup title="Listas de este equipo" className="mt-4">
        {listas.length === 0 && (
          <ListCell title="Aún no hay listas" subtitle="Crea la primera abajo." className="min-h-[44px]" />
        )}
        {listas.map((l) => {
          const dentro = fav.enLista(l.name, rep)
          return (
            <ListCell
              key={l.name}
              title={l.name}
              subtitle={`${l.repuestoIds.length} ${l.repuestoIds.length === 1 ? 'repuesto' : 'repuestos'}`}
              trailing={(
                <span className="flex items-center gap-1">
                  {dentro && <Check className="size-5 text-primary" aria-hidden />}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar la lista «${l.name}»? Los repuestos no se borran.`)) fav.eliminarLista(l.name) }}
                    className="inline-grid min-h-[44px] min-w-[44px] place-items-center rounded-full text-muted-foreground hover:text-destructive"
                    aria-label={`Eliminar la lista ${l.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </span>
              )}
              onClick={() => fav.toggleEnLista(l.name, rep)}
              role="checkbox"
              aria-checked={dentro}
              chevron={false}
              className="min-h-[44px]"
            />
          )
        })}
      </ListGroup>

      <form
        onSubmit={(e) => { e.preventDefault(); crear() }}
        className="mb-4 flex items-center gap-2"
      >
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Nueva lista (ej. Sensores)"
          aria-label="Nombre de la lista nueva"
          maxLength={40}
          className="min-h-[44px] min-w-0 flex-1 rounded-ctl bg-card px-3 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="submit"
          disabled={!nombreValido}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-body font-medium text-primary-foreground disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden /> Crear
        </button>
      </form>
    </Sheet>
  )
}
