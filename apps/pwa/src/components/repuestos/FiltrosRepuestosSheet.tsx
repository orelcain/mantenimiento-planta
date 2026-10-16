/**
 * Hoja de filtros de Repuestos: lo que antes eran cuatro desplegables y un chip en la barra.
 *
 *   Clase · Tipo (muestra 4 y «Ver los N») · Stock · Piezas de despiece sin SAP · Listas
 *   [ Ver 41 repuestos ]   ← único botón relleno; el número es el de la lista, en vivo
 *
 * Es presentacional: el hub calcula los conteos (cada uno con TODOS los demás filtros puestos, para
 * que «Tipo: Rodamiento 0» no se ofrezca) y esta hoja solo dibuja lo que tenga resultados. La
 * opción ya elegida se muestra siempre, aunque haya quedado en 0, para poder quitarla.
 */
import { useState, type ReactNode } from 'react'
import { Button, Sheet, SegmentedControl } from '@/components/piel'
import { cn } from '@/lib/utils'

export interface OpcionFiltro {
  value: string
  label: string
  count: number
}

export interface FiltrosRepuestosSheetProps {
  open: boolean
  onClose: () => void
  clases: readonly OpcionFiltro[]
  clase: string
  onClase: (v: string) => void
  tipos: readonly OpcionFiltro[]
  tipo: string
  onTipo: (v: string) => void
  /** Stock: sin «todos»; el segmento «Todos» lo agrega la hoja. */
  stocks: readonly OpcionFiltro[]
  stock: string
  onStock: (v: string) => void
  /** Cuántas piezas de despiece sin SAP hay con los demás filtros puestos. */
  despieceSinSap: number
  /** Interruptor «Piezas de despiece sin SAP» (= inverso de «solo con SAP»). */
  incluirSinSap: boolean
  onIncluirSinSap: (v: boolean) => void
  listas: readonly OpcionFiltro[]
  lista: string
  onLista: (v: string) => void
  /** Cuántos filtros hay activos: con alguno aparece «Limpiar». */
  activos: number
  onLimpiar: () => void
  /** Resultados con lo puesto ahora mismo. */
  total: number
}

const TIPOS_VISIBLES = 4

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex min-h-[44px] items-center"
    >
      <span
        className={cn(
          'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium',
          activo ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
        )}
      >
        {children}
      </span>
    </button>
  )
}

function Cuenta({ n, activo }: { n: number; activo: boolean }) {
  return <span className={cn('text-footnote font-normal tabular-nums', activo ? 'opacity-80' : 'text-muted-foreground')}>{n}</span>
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-1 text-subhead font-semibold">{titulo}</h3>
      {children}
    </section>
  )
}

/** Muestra las opciones con resultados (y la elegida, aunque esté en 0). */
const conResultados = (ops: readonly OpcionFiltro[], elegida: string): OpcionFiltro[] =>
  ops.filter((o) => o.count > 0 || o.value === elegida)

export function FiltrosRepuestosSheet(p: FiltrosRepuestosSheetProps) {
  const [verTodosTipos, setVerTodosTipos] = useState(false)
  const clases = conResultados(p.clases, p.clase)
  const tipos = conResultados(p.tipos, p.tipo)
  const tiposMostrados = verTodosTipos ? tipos : tipos.filter((t, i) => i < TIPOS_VISIBLES || t.value === p.tipo)
  const stocks = conResultados(p.stocks, p.stock)
  const listas = conResultados(p.listas, p.lista)

  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title="Filtros"
      surface="grouped"
      headerAction={
        p.activos > 0 ? (
          <Button variant="plain" size="md" onClick={p.onLimpiar}>Limpiar</Button>
        ) : undefined
      }
      actions={
        <Button variant="filled" size="block" onClick={p.onClose}>
          Ver {p.total.toLocaleString('es-CL')} {p.total === 1 ? 'repuesto' : 'repuestos'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {clases.length > 1 && (
          <Grupo titulo="Clase">
            <div className="-my-1 flex flex-wrap gap-x-2">
              <Chip activo={p.clase === 'all'} onClick={() => p.onClase('all')}>Todas</Chip>
              {clases.map((c) => (
                <Chip key={c.value} activo={p.clase === c.value} onClick={() => p.onClase(c.value)}>
                  {c.label} <Cuenta n={c.count} activo={p.clase === c.value} />
                </Chip>
              ))}
            </div>
          </Grupo>
        )}

        {tipos.length > 1 && (
          <Grupo titulo="Tipo">
            <div className="-my-1 flex flex-wrap gap-x-2">
              <Chip activo={p.tipo === 'all'} onClick={() => p.onTipo('all')}>Todos</Chip>
              {tiposMostrados.map((t) => (
                <Chip key={t.value} activo={p.tipo === t.value} onClick={() => p.onTipo(t.value)}>
                  {t.label} <Cuenta n={t.count} activo={p.tipo === t.value} />
                </Chip>
              ))}
              {tipos.length > TIPOS_VISIBLES && (
                <button
                  type="button"
                  onClick={() => setVerTodosTipos((v) => !v)}
                  className="inline-flex min-h-[44px] items-center px-2 text-subhead font-medium text-brand-ink"
                >
                  {verTodosTipos ? 'Ver menos' : `Ver los ${tipos.length}`}
                </button>
              )}
            </div>
          </Grupo>
        )}

        {stocks.length > 0 && (
          <Grupo titulo="Stock">
            <SegmentedControl<string>
              ariaLabel="Stock"
              value={p.stock}
              onChange={p.onStock}
              segments={[{ value: 'all', label: 'Todos' }, ...stocks.map((s) => ({ value: s.value, label: s.label }))]}
            />
          </Grupo>
        )}

        {(p.despieceSinSap > 0 || p.incluirSinSap) && (
          <button
            type="button"
            role="switch"
            aria-checked={p.incluirSinSap}
            onClick={() => p.onIncluirSinSap(!p.incluirSinSap)}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-card bg-card px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body font-semibold">
                Piezas de despiece sin SAP <span className="font-normal tabular-nums text-muted-foreground">({p.despieceSinSap.toLocaleString('es-CL')})</span>
              </span>
              <span className="text-footnote text-muted-foreground">Piezas del dibujo que aún no tienen código SAP</span>
            </span>
            <span className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none', p.incluirSinSap ? 'bg-fill-ok' : 'bg-muted-foreground/30')}>
              <span className={cn('absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none', p.incluirSinSap ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
            </span>
          </button>
        )}

        {listas.length > 0 && (
          <Grupo titulo="Mis listas">
            <div className="-my-1 flex flex-wrap gap-x-2">
              <Chip activo={p.lista === 'all'} onClick={() => p.onLista('all')}>Todas</Chip>
              {listas.map((l) => (
                <Chip key={l.value} activo={p.lista === l.value} onClick={() => p.onLista(l.value)}>
                  {l.label} <Cuenta n={l.count} activo={p.lista === l.value} />
                </Chip>
              ))}
            </div>
          </Grupo>
        )}
      </div>
    </Sheet>
  )
}
