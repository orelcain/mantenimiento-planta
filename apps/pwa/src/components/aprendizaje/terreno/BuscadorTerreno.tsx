/**
 * Buscador de la referencia de terreno: responde con el VALOR, no con un enlace
 * («trucha» → 4 mm; «pos 11» → Entrada derecha). Índice en memoria, sin red.
 * Sin texto muestra ejemplos y las secciones por zona.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { INDICE_TERRENO, SECCIONES_TERRENO } from '@/data/baader200Terreno'
import { Button } from '@/components/piel'
import { cn } from '@/lib/utils'
import { buscar, construirIndiceBusqueda, type EntradaBusqueda } from '@/utils/aprendizaje/terreno'
import { ListaSecciones } from './HojaSecciones'

const EJEMPLOS = ['trucha', 'pos 11', '177', '94011760']

export function BuscadorTerreno({ abierto, onCerrar, onElegir, actualId }: {
  abierto: boolean
  onCerrar: () => void
  onElegir: (e: EntradaBusqueda) => void
  actualId?: string
}) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const indice = useMemo(() => construirIndiceBusqueda(SECCIONES_TERRENO, INDICE_TERRENO), [])
  const r = useMemo(() => buscar(indice, q), [indice, q])

  useEffect(() => {
    if (!abierto) return
    inputRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  const elegir = (e: EntradaBusqueda) => {
    if (!e.disponible) return
    onCerrar()
    onElegir(e)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Buscar en el manual" className="piel-fade-in fixed inset-0 z-[90] flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-[640px] items-center gap-2 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] lg:px-5">
        <label className="flex h-[44px] min-w-0 flex-1 items-center gap-2 rounded-[22px] bg-muted px-3.5 text-muted-foreground">
          <Search aria-hidden className="size-[18px] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Medida, pos. o código"
            aria-label="Buscar medida, posición o código"
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              aria-label="Borrar"
              onClick={() => { setQ(''); inputRef.current?.focus() }}
              className="-mr-2.5 grid size-[44px] shrink-0 place-items-center rounded-full"
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </label>
        <Button variant="plain" className="px-2" onClick={onCerrar}>Cancelar</Button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[640px] px-4 pb-10 lg:px-5">
          {!q.trim() ? (
            <>
              <div className="flex flex-wrap gap-2 pb-2">
                {EJEMPLOS.map(ej => (
                  <button
                    key={ej}
                    type="button"
                    onClick={() => setQ(ej)}
                    className="min-h-[44px] rounded-full bg-card px-4 text-subhead shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:bg-accent dark:shadow-none"
                  >
                    {ej}
                  </button>
                ))}
              </div>
              <ListaSecciones
                actualId={actualId}
                onElegir={id => elegir({ clave: id, tipo: 'seccion', titulo: '', sub: '', seccionId: id, disponible: true, texto: '', tituloNorm: '' })}
              />
            </>
          ) : r.total === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-headline">No aparece en el manual</p>
              <p className="mt-1 text-footnote text-muted-foreground">
                Prueba con una especie, una medida en mm, «pos 11» o un código Baader.
              </p>
            </div>
          ) : (
            <div className="space-y-2" aria-live="polite">
              {r.porPos && <Grupo titulo="Piezas" lista={r.piezas} onElegir={elegir} esPos />}
              <Grupo titulo="Medidas" lista={r.medidas} onElegir={elegir} />
              {!r.porPos && <Grupo titulo="Piezas" lista={r.piezas} onElegir={elegir} esPos />}
              <Grupo titulo="Pasos" lista={r.pasos.slice(0, 6)} onElegir={elegir} />
              <Grupo titulo="Secciones" lista={r.secciones} onElegir={elegir} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Grupo({ titulo, lista, onElegir, esPos }: {
  titulo: string
  lista: EntradaBusqueda[]
  onElegir: (e: EntradaBusqueda) => void
  esPos?: boolean
}) {
  if (!lista.length) return null
  return (
    <section>
      <h3 className="px-4 pb-1.5 pt-2 text-footnote text-muted-foreground">{titulo}</h3>
      <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        {lista.map(e => (
          <button
            key={e.clave}
            type="button"
            disabled={!e.disponible}
            onClick={() => onElegir(e)}
            className={cn(
              'relative grid min-h-[56px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-left',
              "before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden",
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              e.disponible ? 'hover:bg-accent' : 'cursor-default text-muted-foreground',
            )}
          >
            <span className="min-w-0">
              <span className={cn('block text-body leading-snug', e.tipo === 'paso' && 'line-clamp-2')}>{e.titulo}</span>
              <span className="mt-0.5 block text-footnote text-muted-foreground">{e.sub}</span>
            </span>
            {e.valor && (esPos ? (
              <span className="grid h-[30px] min-w-[44px] shrink-0 place-items-center whitespace-nowrap rounded-full bg-muted px-2 text-subhead font-semibold tabular-nums">
                {e.valor}
              </span>
            ) : (
              <span className="whitespace-nowrap text-title2 font-bold tabular-nums">{e.valor}</span>
            ))}
          </button>
        ))}
      </div>
    </section>
  )
}
