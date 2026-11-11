/**
 * Fila de la lista de Repuestos en el teléfono (piel Apple), opción B del plan:
 * foto de 60 px, nombre, SAP y ubicación, stock a la derecha. Todo lo demás vive en la ficha.
 * Mismo molde que `BodegaRow`: SwipeRow + ListCell.
 */
import { Package, Star, ListPlus, ShoppingBasket } from 'lucide-react'
import { ListCell, SwipeRow, type SwipeAction } from '@/components/piel'
import { cn } from '@/lib/utils'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import { metaFilaBodega } from '@/pages/repuestos/metaFilaBodega'
import type { AreaRepuestoRow } from '@/hooks/repuestos/useAreaRepuestos'

export interface FilaRepuestoMovilProps {
  r: AreaRepuestoRow
  /** `fotosDeFila(r, equiposEnFoco)` calculadas por quien llama. */
  fotos: string[]
  esFavorito: boolean
  /** Sin esto (pase de lectura) la fila no ofrece favorito. */
  onToggleFav?: () => void
  /** Solo con un equipo abierto: abre la hoja «Favorito de este equipo». */
  onAgregarLista?: () => void
  esFavoritoEquipo?: boolean
  /** Agrega o quita la pieza del pedido (sin esto, pase de lectura, no se ofrece). */
  onAlternarPedido?: () => void
  enPedido?: boolean
  onAbrir: () => void
}

/** Estado en texto de 13 px bajo la cifra. «Disponible» no se escribe: el número ya lo dice. */
export function estadoFilaMovil(r: Pick<AreaRepuestoRow, 'stockStatus' | 'stockMinimo'>): { texto: string; cls: string } | null {
  if (r.stockStatus === 'out') return { texto: 'Sin stock', cls: 'text-ink-crit' }
  if (r.stockStatus === 'low') return { texto: r.stockMinimo > 0 ? `Bajo mín ${r.stockMinimo}` : 'Bajo mín', cls: 'text-ink-warn' }
  if (r.stockStatus === 'unset') return { texto: 'Sin configurar', cls: 'text-muted-foreground' }
  return null
}

export function FilaRepuestoMovil({ r, fotos, esFavorito, onToggleFav, onAgregarLista, esFavoritoEquipo, onAlternarPedido, enPedido, onAbrir }: FilaRepuestoMovilProps) {
  const nv = nombreVisible(r)
  const foto = fotos[0]
  const estado = estadoFilaMovil(r)
  const sinStockConfigurado = r.stockStatus === 'unset'
  const meta = metaFilaBodega({
    codigoSAP: r.codigoSAP,
    ubicacion: r.ubicacionBodega && (formatNombreSAP(r.ubicacionBodega).nombre || r.ubicacionBodega),
    equipos: 0,
    valorTotal: 0,
  }, 'nombre')

  // Deslizar a la izquierda: «Pedido» (correo a bodega) y, con un equipo abierto, «Lista»
  // (favorito de este equipo). Cada una con su ícono: el ListPlus es solo de la lista.
  const trailing: SwipeAction[] = [
    ...(onAlternarPedido
      ? [{ label: enPedido ? 'Quitar' : 'Pedido', icon: <ShoppingBasket className={cn('size-5', enPedido && 'stroke-[2.75]')} />, tone: 'brand' as const, onClick: onAlternarPedido }]
      : []),
    ...(onAgregarLista
      ? [{ label: 'Lista', icon: <ListPlus className={cn('size-5', esFavoritoEquipo && 'stroke-[2.75]')} />, tone: 'neutral' as const, onClick: onAgregarLista }]
      : []),
  ]

  return (
    <SwipeRow
      trailing={trailing}
      leading={onToggleFav ? { label: esFavorito ? 'Quitar' : 'Favorito', icon: <Star className={cn('size-5', esFavorito && 'fill-current')} />, onClick: onToggleFav, active: esFavorito } : undefined}
    >
      <ListCell
        className="bg-card"
        leading={
          foto
            ? <img src={foto} alt="" loading="lazy" className="size-[60px] rounded-[12px] object-cover" />
            : <span className="flex size-[60px] items-center justify-center rounded-[12px] bg-muted text-muted-foreground"><Package className="size-6" aria-hidden /></span>
        }
        title={
          <span className="font-normal">
            {esFavorito && <Star className="mr-1 inline size-3.5 fill-current align-[-1px] text-ink-warn" aria-label="Favorito" />}
            {enPedido && <ShoppingBasket className="mr-1 inline size-3.5 align-[-1px] text-primary" aria-label="En el pedido" />}
            {nv.titulo !== '(sin nombre)' ? nv.titulo : <span className="italic text-muted-foreground">Sin nombre</span>}
          </span>
        }
        subtitle={meta}
        trailing={
          <span className="flex flex-col items-end">
            {sinStockConfigurado
              ? <span className="text-title3 leading-tight text-muted-foreground/50">—</span>
              : <span className="text-title3 font-semibold leading-tight tabular-nums text-foreground">{r.stockActual}<span className="ml-1 text-footnote font-normal text-muted-foreground">{r.unidad}</span></span>}
            {estado && <span className={cn('text-footnote font-medium leading-tight', estado.cls)}>{estado.texto}</span>}
          </span>
        }
        onClick={onAbrir}
      />
    </SwipeRow>
  )
}
