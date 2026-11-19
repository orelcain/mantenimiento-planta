import { desgloseDeAlertas } from '@/hooks/repuestos/estadoDeStock'
import { contarParaFiltro } from '@/hooks/repuestos/filtrosDeStock'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'

interface Props {
  items: readonly BodegaMergedItem[]
  /** Celular: frase corta; la de PC lleva además «definido» al final. */
  compacta?: boolean
}

/** Resumen de alertas del stock: cuántas piezas piden atención y cuántas están en cero sin mínimo. */
export function FraseAlertas({ items, compacta = false }: Props) {
  const d = desgloseDeAlertas(items)
  const configuradas = contarParaFiltro(items, 'configurados')
  const n = (x: number) => x.toLocaleString('es-CL')

  return (
    <p className="text-subhead text-muted-foreground">
      <b className="font-semibold text-foreground tabular-nums">{n(d.alertas)} en alerta</b>
      {': '}
      <span className="tabular-nums">{n(d.bajoMinimo)}</span> bajo mínimo y{' '}
      <span className="tabular-nums">{n(d.sinStockConMinimo)}</span> sin stock, de{' '}
      <span className="tabular-nums">{n(configuradas)}</span> configuradas.
      {d.enCeroSinMinimo > 0 && (
        <>
          {' '}Otras <span className="tabular-nums">{n(d.enCeroSinMinimo)}</span> están en cero sin mínimo
          {compacta ? '.' : ' definido.'}
        </>
      )}
    </p>
  )
}
