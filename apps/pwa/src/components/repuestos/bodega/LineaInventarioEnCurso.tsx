import { ChevronRight } from 'lucide-react'
import type { InventarioSesion } from '@/hooks/repuestos/useBodega'

const DIA_MS = 86_400_000

/** «desde hoy», «hace 1 día», «hace 54 días». Días completos desde `desde`, mínimo 0. */
// eslint-disable-next-line react-refresh/only-export-components -- la función pura va con el componente (la prueba la importa de aquí)
export function textoDiasAbierto(desde: Date, ahora = new Date()): string {
  const dias = Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / DIA_MS))
  if (dias === 0) return 'desde hoy'
  if (dias === 1) return 'hace 1 día'
  return `hace ${dias} días`
}

interface Props {
  enCurso: Pick<InventarioSesion, 'id' | 'nombre' | 'createdAt'>[]
  /** Con id abre ese inventario; sin id lleva a la lista de inventarios. */
  onVer: (id?: string) => void
  /** Celular: una sola línea con botón «Ver ›» a la derecha. */
  compacta?: boolean
  ahora?: Date
}

export function LineaInventarioEnCurso({ enCurso, onVer, compacta = false, ahora }: Props) {
  if (enCurso.length === 0) return null

  const instante = ahora ?? new Date()
  const masAntiguo = enCurso.reduce((a, b) => (b.createdAt.getTime() < a.createdAt.getTime() ? b : a))
  const hace = textoDiasAbierto(masAntiguo.createdAt, instante)
  const uno = enCurso.length === 1
  const punto = <span aria-hidden className="inline-block size-[8px] shrink-0 rounded-full bg-ink-warn" />

  if (compacta) {
    return (
      <div className="flex min-h-[44px] items-center gap-2 text-subhead text-muted-foreground">
        {punto}
        <span className="min-w-0">
          {uno ? (
            <>Inventario en curso <b className="font-semibold text-foreground">{hace}</b></>
          ) : (
            <><b className="font-semibold text-foreground">{enCurso.length} inventarios</b> en curso</>
          )}
        </span>
        <button
          type="button"
          onClick={() => onVer(uno ? masAntiguo.id : undefined)}
          aria-label={uno ? `Ver inventario ${masAntiguo.nombre}` : 'Ver inventarios en curso'}
          className="ml-auto min-h-[44px] px-2 font-semibold text-brand-ink"
        >
          Ver ›
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-subhead text-muted-foreground">
      {punto}
      {uno ? (
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="min-w-0">
            Inventario{' '}
            <b className="inline-block max-w-[28rem] truncate align-bottom font-semibold text-foreground">
              {masAntiguo.nombre}
            </b>{' '}
            en curso <b className="font-semibold text-foreground">{hace}</b>
          </span>
        </span>
      ) : (
        <span className="min-w-0 truncate">
          <b className="font-semibold text-foreground">{enCurso.length} inventarios</b> en curso, el más antiguo{' '}
          <b className="font-semibold text-foreground">{hace}</b>
        </span>
      )}
      <button
        type="button"
        onClick={() => onVer(uno ? masAntiguo.id : undefined)}
        className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-brand-ink"
      >
        {uno ? 'Ver inventario' : 'Ver inventarios'}
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  )
}
