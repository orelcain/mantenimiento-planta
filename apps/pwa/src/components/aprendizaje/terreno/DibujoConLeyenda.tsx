/**
 * Dibujo con la leyenda de piezas debajo.
 *
 * En el teléfono la dirección es leyenda → dibujo: se toca la fila y la posición se
 * ilumina con un anillo (los números impresos quedan a 24 px entre sí, no caben blancos
 * de 44). En el PC, donde el dibujo mide ~500 px, los números del dibujo también se tocan.
 * La fila elegida se despliega con el stock en vivo y el salto a Repuestos.
 */
import { forwardRef, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Maximize2 } from 'lucide-react'
import { FUENTES, type Dibujo, type PiezaLeyenda, type SeccionTerreno } from '@/data/baader200Terreno'
import type { RepuestoResuelto } from '@/hooks/repuestos/useRepuestosByCodigos'
import { Button, ListGroup, SegmentedControl } from '@/components/piel'
import { cn } from '@/lib/utils'
import { ANCLAS, estiloRecorte, posChip, posTexto } from '@/utils/aprendizaje/terreno'
import { FuenteLink, type AbrirFuente } from './enlaces'

export interface StockLeyenda {
  /** false = sin sesión: no se consulta y la leyenda se muestra sin stock. */
  habilitado: boolean
  loading: boolean
  bySap: Map<string, RepuestoResuelto>
}

interface Props {
  seccion: SeccionTerreno
  dibujoId: string
  onDibujo: (id: string) => void
  posActivas: string[]
  piezaActiva: number | null
  onPieza: (indice: number) => void
  onHotspot: (pos: string) => void
  hotspotsTocables: boolean
  stock: StockLeyenda
  onFuente: AbrirFuente
}

/** Nombre corto para el segmentado de dibujos. */
function etiquetaDibujo(d: Dibujo): string {
  // Con 4 pestañas en 343 px caben ~9 caracteres: «Dib. 69·70», «Planta», «Pág. 24».
  const m = d.titulo.match(/^Dibujos? (\d+)(?: y (\d+))?/)
  if (m) return `Dib. ${m[1]}`
  return d.fuente.id === 'planta' ? 'Planta' : `Pág. ${d.fuente.pagina}`
}

export const DibujoConLeyenda = forwardRef<HTMLDivElement, Props>(function DibujoConLeyenda(
  { seccion, dibujoId, onDibujo, posActivas, piezaActiva, onPieza, onHotspot, hotspotsTocables, stock, onFuente },
  figRef,
) {
  const dibujo = seccion.dibujos.find(d => d.id === dibujoId) ?? seccion.dibujos[0]
  if (!dibujo) return null
  const pagina = FUENTES[dibujo.fuente.id]
  const r = estiloRecorte(dibujo.recorte, pagina.ancho, pagina.alto)
  const anillos = (dibujo.hotspots ?? []).filter(h => posActivas.includes(h.pos))

  return (
    <ListGroup title="Dibujo y piezas" id={ANCLAS.dibujo} className="scroll-mt-4">
      {seccion.dibujos.length > 1 && (
        <div className="px-3 pt-3">
          {seccion.dibujos.length <= 4 ? (
            <SegmentedControl
              ariaLabel="Dibujo"
              value={dibujo.id}
              onChange={onDibujo}
              segments={seccion.dibujos.map(d => ({ value: d.id, label: etiquetaDibujo(d) }))}
            />
          ) : (
            <TiraDibujos dibujos={seccion.dibujos} activo={dibujo.id} onChange={onDibujo} />
          )}
        </div>
      )}

      <div
        ref={figRef}
        className="relative mx-3 mt-3 overflow-hidden rounded-[14px] bg-white"
        style={{ aspectRatio: String(r.aspecto) }}
      >
        <img
          src={dibujo.url}
          alt={dibujo.titulo}
          draggable={false}
          className="absolute max-w-none select-none dark:brightness-[.86]"
          style={{ width: `${r.imgAnchoPct}%`, left: `${r.imgIzqPct}%`, top: `${r.imgArribaPct}%` }}
        />
        {anillos.map(h => (
          <span
            key={`${dibujo.id}-${h.pos}`}
            aria-hidden
            className="piel-fade-in pointer-events-none absolute size-[30px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary ring-4 ring-primary/25"
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
          />
        ))}
        {hotspotsTocables && (dibujo.hotspots ?? []).map(h => (
          <button
            key={`hot-${h.pos}`}
            type="button"
            aria-label={`Posición ${h.pos}`}
            onClick={() => onHotspot(h.pos)}
            className="absolute size-[40px] -translate-x-1/2 -translate-y-1/2 rounded-full hover:ring-2 hover:ring-inset hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 py-1 pl-4 pr-2">
        <div className="min-w-0 flex-1 py-2 text-footnote leading-snug text-muted-foreground">
          <div className="line-clamp-2">{dibujo.titulo}</div>
          <div className="mt-1">
            {hotspotsTocables ? 'Haz clic en un número del dibujo o en una pieza' : 'Toca una pieza para verla en el dibujo'}
          </div>
        </div>
        <Button variant="plain" onClick={() => onFuente(dibujo.fuente)} aria-label={`Ampliar ${dibujo.titulo}`}>
          <Maximize2 aria-hidden />
          Ampliar
        </Button>
      </div>
      <div className="px-4 pb-2 text-footnote text-muted-foreground">
        <FuenteLink fuente={dibujo.fuente} onAbrir={onFuente} />
      </div>

      <ul>
        {seccion.leyenda.map((p, i) => (
          <FilaLeyenda
            key={`${p.nombre}-${i}`}
            pieza={p}
            activa={piezaActiva === i}
            onToggle={() => onPieza(i)}
            stock={stock}
          />
        ))}
      </ul>
    </ListGroup>
  )
})

/**
 * Con más de 4 dibujos (cola y contrabancadas trae 19) el segmentado se aplasta: tira de
 * chips desplazable, con el activo centrado también cuando cambia desde la leyenda.
 */
function TiraDibujos({ dibujos, activo, onChange }: { dibujos: Dibujo[]; activo: string; onChange: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [activo])
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Dibujo"
      className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {dibujos.map(d => {
        const esActivo = d.id === activo
        return (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={esActivo}
            onClick={() => onChange(d.id)}
            className={cn(
              'min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-subhead font-medium',
              'transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              esActivo ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-accent',
            )}
          >
            {etiquetaDibujo(d)}
          </button>
        )
      })}
    </div>
  )
}

function FilaLeyenda({ pieza, activa, onToggle, stock }: {
  pieza: PiezaLeyenda
  activa: boolean
  onToggle: () => void
  stock: StockLeyenda
}) {
  const navigate = useNavigate()
  const saps = pieza.sap ?? []
  const resueltos = saps.map(s => stock.bySap.get(s))
  const conStock = resueltos.filter((x): x is RepuestoResuelto => typeof x?.stockFisico === 'number')
  const ubicacion = resueltos.find(x => x?.ubicacion)?.ubicacion
  const codigos = pieza.codigoBaader.join(' / ')
  const codigoPrincipal = pieza.codigoBaader[0]
  const chip = posChip(pieza.pos)

  let lateral: ReactNode = null
  if (!saps.length) {
    lateral = <span className="text-footnote text-muted-foreground">Sin SAP</span>
  } else if (stock.habilitado && stock.loading) {
    lateral = <span aria-label="Cargando stock" className="block h-4 w-12 rounded-full bg-muted motion-safe:animate-pulse" />
  } else if (conStock.length) {
    lateral = (
      <span className="block text-right text-footnote leading-tight text-muted-foreground tabular-nums">
        <b className="block text-headline text-foreground">{conStock.map(x => x.stockFisico).join(' / ')}</b>
        stock{ubicacion ? ` · ${ubicacion}` : ''}
      </span>
    )
  }

  return (
    <li className="relative before:absolute before:left-[70px] before:right-0 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden">
      <button
        type="button"
        aria-pressed={activa}
        onClick={onToggle}
        className={cn(
          'grid min-h-[56px] w-full grid-cols-[minmax(44px,auto)_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-1.5 text-left',
          'transition-colors duration-150 motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          activa ? 'bg-primary/[0.1]' : 'hover:bg-accent',
        )}
      >
        <span
          className={cn(
            'flex min-h-[30px] min-w-[44px] flex-col items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-subhead font-semibold leading-none tabular-nums',
            activa ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {chip.dib && <span className="mb-0.5 text-[10px] font-medium opacity-70">dib. {chip.dib}</span>}
          {chip.texto}
        </span>
        <span className="min-w-0 text-subhead leading-tight">
          {pieza.nombre}
          {chip.varios && (
            <span className="mt-0.5 block text-footnote text-muted-foreground">{posTexto(pieza.pos)}</span>
          )}
          <span className="mt-0.5 block text-footnote text-muted-foreground tabular-nums">
            {codigos || 'Sin código en el catálogo'}
            {saps.length ? ` · SAP ${saps.join(' / ')}` : ''}
          </span>
        </span>
        <span className="justify-self-end">{lateral}</span>
      </button>

      {activa && (
        <div className="piel-fade-in space-y-1 bg-primary/[0.1] pb-2 pl-[70px] pr-4 text-footnote text-muted-foreground">
          {pieza.revisar && (
            <p className="flex gap-1.5 text-foreground">
              <AlertTriangle aria-hidden className="mt-px size-4 shrink-0 text-ink-warn" />
              <span>{pieza.revisar}</span>
            </p>
          )}
          {pieza.confianza === 'media' && <p>Identificada por forma y ubicación: confirmar en la máquina.</p>}
          {pieza.tornilleria && <p>Tornillería estándar.</p>}
          <div className="-ml-5 flex flex-wrap">
            {saps.length ? (
              saps.map(s => (
                <Button key={s} variant="plain" onClick={() => navigate(`/repuestos?q=${encodeURIComponent(s)}`)}>
                  Ver en Repuestos{saps.length > 1 ? ` · ${s}` : ''}
                </Button>
              ))
            ) : codigoPrincipal ? (
              <Button variant="plain" onClick={() => navigate(`/repuestos?q=${encodeURIComponent(codigoPrincipal)}`)}>
                Asignar SAP
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </li>
  )
}
