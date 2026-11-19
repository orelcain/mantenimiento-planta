import { Fragment, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Star } from 'lucide-react'
import { ListGroup } from '@/components/piel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { BuscadorBodega } from '@/components/repuestos/bodega/BuscadorBodega'
import { FraseAlertas } from '@/components/repuestos/bodega/FraseAlertas'
import { contarParaFiltro, type StockFilterKey } from '@/hooks/repuestos/filtrosDeStock'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'

/**
 * Stock de Bodega en celular: solo presentación. StockTab (BodegaView) es dueño de búsqueda,
 * filtro, orden, límite y de la lista filtrada; aquí solo se dibuja. No importa nada de BodegaView.
 */

export type CampoOrden = 'nombre' | 'sap' | 'stock' | 'valor' | 'equipos'
export type DireccionOrden = 'asc' | 'desc'

const OPCIONES_ORDEN: [CampoOrden, string][] = [['nombre', 'Nombre'], ['stock', 'Stock'], ['valor', 'Valor'], ['equipos', 'Equipos']]

type Chip = { key: StockFilterKey; label: string; punto?: string; icono?: typeof Star }

const ALERTAS: Chip = { key: 'alertas', label: 'Alertas', punto: 'bg-ink-crit' }
const CHIPS: Chip[] = [
  { key: 'configurados', label: 'Configurados' },
  { key: 'bajo', label: 'Bajo mínimo', punto: 'bg-ink-warn' },
  { key: 'sin', label: 'Sin stock', punto: 'bg-ink-crit' },
  { key: 'sinEquipo', label: 'Sin equipo' },
  { key: 'sinContar', label: 'Sin contar' },
  { key: 'sinConfig', label: 'Sin configurar' },
  { key: 'todos', label: 'Todos con SAP' },
  { key: 'favoritos', label: 'Favoritos', icono: Star },
]

interface Props {
  items: BodegaMergedItem[]
  /** Sobre qué cuentan los chips: lo que deja la búsqueda (así la cifra = filas al pulsar). Sin esto, `items`. */
  contables?: BodegaMergedItem[]
  /** La lista ya filtrada y ordenada (la que cuenta «Exportar CSV»). */
  filtradas: BodegaMergedItem[]
  filtro: StockFilterKey
  onFiltro: (f: StockFilterKey) => void
  busca: string
  onBusca: (s: string) => void
  limite: number
  onMas: () => void
  ordenCampo: CampoOrden
  ordenDir: DireccionOrden
  onOrden: (c: CampoOrden) => void
  titulo: string
  pie?: string
  /** El menú «⋯» de acciones, junto al buscador. */
  acciones: ReactNode
  /** Pedidos por atender (ya sin nada si no hay). */
  pedidos?: ReactNode
  /** Línea del inventario en curso (solo celular). */
  inventario?: ReactNode
  /** Una fila de la lista (BodegaRow), con sus acciones. */
  fila: (i: BodegaMergedItem) => ReactNode
}

export function StockListaMovil({
  items, contables = items, filtradas, filtro, onFiltro, busca, onBusca, limite, onMas,
  ordenCampo, ordenDir, onOrden, titulo, pie, acciones, pedidos, inventario, fila,
}: Props) {
  const chips = [...(contarParaFiltro(items, 'alertas') > 0 || filtro === 'alertas' ? [ALERTAS] : []), ...CHIPS]

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <BuscadorBodega valor={busca} onCambio={onBusca} esPC={false} />
        </div>
        {acciones}
      </div>

      {inventario}
      {pedidos}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {chips.map(c => {
          const on = filtro === c.key
          const Icono = c.icono
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={e => { onFiltro(c.key); e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-subhead font-medium transition-colors',
                on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted-foreground/[0.15]',
              )}
            >
              {c.punto && <span className={cn('size-2 rounded-full', c.punto)} aria-hidden />}
              {Icono && <Icono className="size-3.5" />}
              {c.label}
              <span className={cn('text-footnote font-semibold tabular-nums', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {contarParaFiltro(contables, c.key)}
              </span>
            </button>
          )
        })}
      </div>

      <FraseAlertas items={items} compacta />

      {filtradas.length === 0 ? (
        <p className="py-12 text-center text-subhead text-muted-foreground">
          {items.length === 0 ? 'No hay repuestos con código SAP' : 'Sin resultados'}
        </p>
      ) : (
        <>
          <ListGroup
            title={titulo}
            footer={pie}
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="relative inline-flex h-8 items-center gap-1 rounded-full bg-muted px-3 text-footnote font-medium text-foreground hover:bg-muted-foreground/[0.15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 after:absolute after:inset-x-0 after:-inset-y-[6px] after:content-['']">
                    <ArrowUpDown className="size-3.5" />Ordenar
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  {OPCIONES_ORDEN.map(([campo, label]) => (
                    <DropdownMenuItem key={campo} className={cn('gap-2 py-2', ordenCampo === campo && 'font-semibold')} onClick={() => onOrden(campo)}>
                      {label}
                      {ordenCampo === campo && (
                        <span className="ml-auto text-muted-foreground">{ordenDir === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            {filtradas.slice(0, limite).map(i => (
              <Fragment key={i.rowKey}>{fila(i)}</Fragment>
            ))}
          </ListGroup>
          {filtradas.length > limite && (
            <button
              type="button"
              onClick={onMas}
              className="mx-auto mt-3 flex min-h-[44px] items-center rounded-full bg-muted px-5 text-subhead font-medium"
            >
              Mostrar más ({filtradas.length - limite})
            </button>
          )}
        </>
      )}
    </>
  )
}
