/**
 * Fila de chips-filtro y hoja «Más» de la lista de Repuestos en el teléfono (piel Apple).
 *
 *   [ Todos 41 ] [ Bajo 3 ] [ Sin stock 2 ] [ Más ]
 *
 * Todo lo que antes se veía como fila sobre la lista (estados restantes, valor, favoritos,
 * Con fotos, chips de equipo, Lista o Galería y el botón Filtros) vive en la hoja «Más».
 * Es presentacional: el hub conserva el estado de filtro de siempre. La lógica de qué chip
 * mostrar y cuándo «Más» está activo está en `chipsFiltroMovil.ts`.
 */
import { Check } from 'lucide-react'
import { ListCell, ListGroup, SegmentedControl, Sheet } from '@/components/piel'
import { ChipsEquipo, type ChipsEquipoProps } from '@/components/repuestos/ChipsEquipo'
import { facetasDeEquipo, ocultarFacetas } from '@/utils/repuestos/facetasEquipo'
import { formatoValorCompacto } from '@/utils/repuestos/resumenStock'
import { cn } from '@/lib/utils'
import type { ChipEstado, ClaveChipEstado } from './chipsFiltroMovil'
import type { EstadoResumenStock } from './ResumenStockFila'

const CHIP = 'group inline-flex min-h-[44px] shrink-0 items-center'
const PASTILLA = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-subhead transition-colors'

/** Chips de 44 px de alto; se desliza en horizontal si no caben. */
export function ChipsFiltroMovil({ chips, onEstado, mas, onMas }: {
  chips: readonly ChipEstado[]
  onEstado: (clave: ClaveChipEstado) => void
  mas: { activo: boolean; etiqueta: string }
  onMas: () => void
}) {
  return (
    <div role="group" aria-label="Filtrar por estado de stock" className="-mx-4 mb-1 flex items-center gap-1.5 overflow-x-auto px-4">
      {chips.map((c) => (
        <button key={c.clave} type="button" aria-pressed={c.activo} onClick={() => onEstado(c.clave)} className={CHIP}>
          <span className={cn(PASTILLA, c.activo ? 'bg-primary font-medium text-primary-foreground' : 'bg-card font-normal text-foreground')}>
            {c.etiqueta}
            <span className={cn('text-footnote font-normal tabular-nums', c.activo ? 'opacity-80' : 'text-muted-foreground')}>{c.n.toLocaleString('es-CL')}</span>
          </span>
        </button>
      ))}
      <button type="button" aria-haspopup="dialog" aria-pressed={mas.activo} onClick={onMas} className={CHIP}>
        <span className={cn(PASTILLA, 'max-w-[16rem]', mas.activo ? 'bg-primary font-medium text-primary-foreground' : 'bg-card font-normal text-foreground')}>
          <span className="truncate">{mas.etiqueta}</span>
        </span>
      </button>
    </div>
  )
}

function Cuenta({ n, activo }: { n?: number; activo: boolean }) {
  return (
    <span className="flex items-center gap-2 text-subhead tabular-nums text-muted-foreground">
      {n !== undefined && n.toLocaleString('es-CL')}
      {activo && <Check className="size-5 text-primary" aria-hidden />}
    </span>
  )
}

function Opcion({ titulo, n, activo, deshabilitada, onClick }: { titulo: string; n?: number; activo: boolean; deshabilitada?: boolean; onClick: () => void }) {
  return (
    <ListCell
      title={titulo}
      trailing={<Cuenta n={n} activo={activo} />}
      onClick={deshabilitada ? undefined : onClick}
      aria-pressed={activo}
      aria-disabled={deshabilitada || undefined}
      className={cn('min-h-[52px]', deshabilitada && 'opacity-40')}
    />
  )
}

export interface MasFiltrosSheetProps {
  open: boolean
  onClose: () => void
  total: number
  estadoActivo: EstadoResumenStock
  ok: number
  comunSinStock: number
  valor: number
  onEstado: (e: 'ok' | 'comunSinStock') => void
  favoritos: { n: number; activo: boolean; onToggle: () => void }
  /** Solo con un equipo abierto: «Favoritos de este equipo» y una opción por lista. */
  favoritosEquipo: null | {
    total: number
    porLista: readonly { nombre: string; n: number }[]
    filtro: string | null
    onToggle: (clave: string) => void
  }
  conFotos: boolean
  onConFotos: () => void
  equipo: Pick<ChipsEquipoProps, 'rows' | 'plantaDe' | 'faceta' | 'onChange'>
  vista: 'lista' | 'galeria'
  onVista: (v: 'lista' | 'galeria') => void
  /** Cantidad de filtros activos de la hoja «Filtros» (la hoja completa se abre desde aquí). */
  filtrosHoja: number
  onAbrirFiltros: () => void
}

export function MasFiltrosSheet(p: MasFiltrosSheetProps) {
  const mostrarEquipo = !ocultarFacetas(p.equipo.rows, facetasDeEquipo(p.equipo.rows, p.equipo.plantaDe))
  const fe = p.favoritosEquipo
  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title="Más filtros"
      surface="grouped"
    >
      <div className="tipo-ingenieria flex flex-col gap-4 pb-2">
        {(p.ok > 0 || p.estadoActivo === 'ok' || p.comunSinStock > 0 || p.estadoActivo === 'comunSinStock') && (
          <ListGroup title="Estado">
            {(p.ok > 0 || p.estadoActivo === 'ok') && (
              <Opcion titulo="Disponibles" n={p.ok} activo={p.estadoActivo === 'ok'} onClick={() => p.onEstado('ok')} />
            )}
            {(p.comunSinStock > 0 || p.estadoActivo === 'comunSinStock') && (
              <Opcion titulo="Común sin stock" n={p.comunSinStock} activo={p.estadoActivo === 'comunSinStock'} onClick={() => p.onEstado('comunSinStock')} />
            )}
          </ListGroup>
        )}

        {formatoValorCompacto(p.valor) && (
          <p className="px-4 text-footnote text-muted-foreground">
            Valor en bodega de lo que se ve: <span className="font-medium text-foreground">{formatoValorCompacto(p.valor)}</span>
          </p>
        )}

        <ListGroup title="Favoritos">
          <Opcion
            titulo={fe ? 'Favoritos (todos)' : 'Favoritos'}
            n={p.favoritos.n}
            activo={p.favoritos.activo}
            deshabilitada={p.favoritos.n === 0 && !p.favoritos.activo}
            onClick={p.favoritos.onToggle}
          />
          {fe && (
            <Opcion
              titulo="Favoritos de este equipo"
              n={fe.total}
              activo={fe.filtro === '*'}
              deshabilitada={fe.total === 0 && fe.filtro !== '*'}
              onClick={() => fe.onToggle('*')}
            />
          )}
          {fe?.porLista.map((l) => (
            <Opcion
              key={l.nombre}
              titulo={l.nombre}
              n={l.n}
              activo={fe.filtro === l.nombre}
              deshabilitada={l.n === 0 && fe.filtro !== l.nombre}
              onClick={() => fe.onToggle(l.nombre)}
            />
          ))}
        </ListGroup>

        <ListGroup title="Mostrar">
          <Opcion titulo="Con fotos" activo={p.conFotos} onClick={p.onConFotos} />
        </ListGroup>

        {mostrarEquipo && (
          <section className="flex flex-col gap-1">
            <h3 className="px-4 text-subhead font-semibold text-muted-foreground">Equipo</h3>
            <ChipsEquipo {...p.equipo} />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="px-4 text-subhead font-semibold text-muted-foreground">Vista</h3>
          <SegmentedControl<'lista' | 'galeria'>
            ariaLabel="Vista de repuestos"
            value={p.vista}
            onChange={p.onVista}
            segments={[{ value: 'lista', label: 'Lista' }, { value: 'galeria', label: 'Galería' }]}
          />
        </section>

        <ListGroup>
          <ListCell
            title="Clase, tipo, listas y más"
            trailing={p.filtrosHoja > 0 ? <span className="text-subhead tabular-nums text-muted-foreground">{p.filtrosHoja}</span> : undefined}
            onClick={p.onAbrirFiltros}
            className="min-h-[52px]"
          />
        </ListGroup>
      </div>
    </Sheet>
  )
}
