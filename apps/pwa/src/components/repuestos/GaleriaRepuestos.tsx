/**
 * Vista «Galería» de Repuestos: avance de fotos reales, grilla de «Con foto real» y
 * «Solo manual», y lista de trabajo «Sin foto» (ordenada por prioridad).
 * Recibe las filas ya filtradas por el hub; no conoce Firestore ni el visor.
 */
import { useEffect, useMemo, useState } from 'react'
import { Camera } from 'lucide-react'
import { ListCell, ListGroup, SegmentedControl } from '@/components/piel'
import { origenDeFoto } from '@/utils/repuestos/origenFoto'
import { claseFotos, coberturaFotos, ordenarSinFoto, portada, type ClaseFotos, type FilaSinFoto } from '@/utils/repuestos/coberturaFotos'
import { esComun } from '@/hooks/repuestos/filtrosDeRepuestos'

const TARJETAS_POR_PAGINA = 48
const FILAS_POR_PAGINA = 50

export interface StockMetaGaleria {
  label: string
  dot: string
  text: string
}

export interface FilaGaleria extends FilaSinFoto {
  textoBreve: string
  codigoSAP?: string | null
  stockStatus: string
}

interface Props<T extends FilaGaleria> {
  rows: readonly T[]
  fotosDe: (row: T) => string[]
  /** Nombre a mostrar (por defecto `textoBreve`). */
  nombreDe?: (row: T) => string
  stockMeta: Record<string, StockMetaGaleria>
  onAbrirFicha: (row: T) => void
  onAbrirFoto: (row: T, index: number) => void
  /** Si falta, no se muestra el botón de cámara en «Sin foto». */
  onAgregarFoto?: (row: T) => void
}

type Segmento = ClaseFotos

function PuntoStock({ meta }: { meta: StockMetaGaleria | undefined }) {
  if (!meta) return null
  return (
    <span className={`inline-flex items-center gap-1.5 text-footnote ${meta.text}`}>
      <span aria-hidden className={`size-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

export function GaleriaRepuestos<T extends FilaGaleria>({
  rows, fotosDe, nombreDe, stockMeta, onAbrirFicha, onAbrirFoto, onAgregarFoto,
}: Props<T>) {
  const [segmento, setSegmento] = useState<Segmento>('real')
  const [limite, setLimite] = useState(TARJETAS_POR_PAGINA)

  const clasificadas = useMemo(
    () => rows.map((row) => { const fotos = fotosDe(row); return { row, fotos, clase: claseFotos(fotos) } }),
    [rows, fotosDe],
  )
  const cob = useMemo(() => coberturaFotos(rows, fotosDe), [rows, fotosDe])
  const visibles = useMemo(() => {
    if (segmento === 'sin') {
      const orden = ordenarSinFoto(clasificadas.filter((c) => c.clase === 'sin').map((c) => c.row))
      return orden.map((row) => ({ row, fotos: [] as string[] }))
    }
    return clasificadas.filter((c) => c.clase === segmento)
  }, [clasificadas, segmento])

  // Al cambiar de segmento o de filtros, se vuelve a la primera página.
  useEffect(() => { setLimite(segmento === 'sin' ? FILAS_POR_PAGINA : TARJETAS_POR_PAGINA) }, [segmento, rows])

  const porPagina = segmento === 'sin' ? FILAS_POR_PAGINA : TARJETAS_POR_PAGINA
  const mostrados = visibles.slice(0, limite)
  const nombre = (row: T) => (nombreDe ? nombreDe(row) : row.textoBreve)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-card p-4">
        <div className="text-title2 font-bold tabular-nums">{cob.pctReal} % con foto real</div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Avance de fotos reales"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={cob.pctReal}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${cob.pctReal}%` }} />
        </div>
        <p className="mt-2 text-footnote tabular-nums text-muted-foreground">
          {cob.real} con foto real · {cob.manual} solo manual · {cob.sin} sin foto de {cob.total}
        </p>
      </div>

      <SegmentedControl<Segmento>
        ariaLabel="Cobertura de fotos"
        value={segmento}
        onChange={setSegmento}
        segments={[
          { value: 'real', label: <>Con foto<span className="hidden sm:inline">&nbsp;real</span>&nbsp;<span className="tabular-nums">({cob.real})</span></> },
          { value: 'manual', label: <><span className="hidden sm:inline">Solo m</span><span className="sm:hidden">M</span>anual&nbsp;<span className="tabular-nums">({cob.manual})</span></> },
          { value: 'sin', label: <>Sin foto&nbsp;<span className="tabular-nums">({cob.sin})</span></> },
        ]}
      />

      {visibles.length === 0 ? (
        <div className="rounded-card border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {segmento === 'sin' ? 'Todos los repuestos de esta vista tienen foto.' : 'Ningún repuesto de esta vista cumple.'}
        </div>
      ) : segmento === 'sin' ? (
        <ListGroup>
          {mostrados.map(({ row }) => (
            <ListCell
              key={row.rowKey}
              className="min-h-[56px]"
              title={nombre(row)}
              subtitle={
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono">{row.codigoSAP || '—'}</span>
                  <PuntoStock meta={stockMeta[row.stockStatus]} />
                </span>
              }
              trailing={
                <span className="flex items-center gap-2">
                  {esComun(row) && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-caption font-semibold text-brand-ink">Común</span>
                  )}
                  {onAgregarFoto && (
                    <button
                      type="button"
                      aria-label={`Agregar foto a ${nombre(row)}`}
                      onClick={(e) => { e.stopPropagation(); onAgregarFoto(row) }}
                      className="flex size-[44px] items-center justify-center rounded-full bg-primary/15 text-brand-ink"
                    >
                      <Camera className="size-5" aria-hidden />
                    </button>
                  )}
                </span>
              }
              onClick={() => onAbrirFicha(row)}
            />
          ))}
        </ListGroup>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
          {mostrados.map(({ row, fotos }) => {
            const foto = portada(fotos) ?? ''
            const origen = origenDeFoto(foto)
            const indice = Math.max(0, fotos.indexOf(foto))
            return (
              <div key={row.rowKey} className="overflow-hidden rounded-[22px] bg-card sm:rounded-[26px]">
                <div className="relative aspect-[4/3]">
                  <button
                    type="button"
                    aria-label={`Abrir foto de ${nombre(row)}`}
                    onClick={() => onAbrirFoto(row, indice)}
                    className="block size-full"
                  >
                    <img
                      src={foto}
                      alt=""
                      loading="lazy"
                      className={`size-full ${origen === 'manual' ? 'bg-white object-contain' : 'object-cover'}`}
                    />
                  </button>
                  {origen !== 'otra' && (
                    <span
                      className={`pointer-events-none absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-caption font-semibold ${
                        origen === 'bodega' ? 'bg-primary/15 text-brand-ink' : 'bg-warning/15 text-ink-warn'
                      }`}
                    >
                      {origen === 'bodega' ? 'Bodega' : 'Manual'}
                    </span>
                  )}
                  {fotos.length > 1 && (
                    <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-caption font-semibold tabular-nums text-white">
                      {fotos.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onAbrirFicha(row)}
                  className="flex min-h-[44px] w-full flex-col gap-1 p-3 text-left"
                >
                  <span className="line-clamp-2 text-subhead font-semibold">{nombre(row)}</span>
                  <span className="font-mono text-[13px] text-muted-foreground">{row.codigoSAP || '—'}</span>
                  <PuntoStock meta={stockMeta[row.stockStatus]} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {visibles.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + porPagina)}
          className="mx-auto flex min-h-[44px] items-center rounded-full bg-muted px-5 text-subhead font-medium"
        >
          Mostrar más ({visibles.length - limite})
        </button>
      )}
    </div>
  )
}
