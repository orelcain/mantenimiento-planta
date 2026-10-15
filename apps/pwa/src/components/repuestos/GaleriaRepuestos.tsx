/**
 * Vista «Galería» de Repuestos: UNA grilla con todos los repuestos que deja la búsqueda y
 * los filtros del hub, en el mismo orden. Con foto: portada (primera foto real, si no la
 * del manual) y vista ampliada al pasar el mouse; sin foto: hueco con botón para agregarla.
 * Recibe las filas ya filtradas por el hub; no conoce Firestore ni el visor.
 */
import { useEffect, useMemo, useState } from 'react'
import { Camera, ImageOff } from 'lucide-react'
import { origenDeFoto } from '@/utils/repuestos/origenFoto'
import { portada } from '@/utils/repuestos/coberturaFotos'
import { FotosHoverCard } from '@/components/repuestos/FotosHoverCard'

const TARJETAS_POR_PAGINA = 48

export interface StockMetaGaleria {
  label: string
  dot: string
  text: string
}

export interface FilaGaleria {
  rowKey: string
  textoBreve: string
  codigoSAP?: string | null
  stockStatus: string
}

/** Nombre a mostrar: el común primero; el oficial (SAP) va debajo si es distinto. */
export interface NombreGaleria {
  titulo: string
  oficial?: string | null
}

interface Props<T extends FilaGaleria> {
  rows: readonly T[]
  fotosDe: (row: T) => string[]
  nombreDe?: (row: T) => NombreGaleria
  stockMeta: Record<string, StockMetaGaleria>
  onAbrirFicha: (row: T) => void
  onAbrirFoto: (row: T, index: number) => void
  /** Si falta, las tarjetas sin foto no muestran el botón de cámara. */
  onAgregarFoto?: (row: T) => void
}

function PuntoStock({ meta }: { meta: StockMetaGaleria | undefined }) {
  if (!meta) return null
  return (
    <span className={`inline-flex items-center gap-1.5 text-caption ${meta.text}`}>
      <span aria-hidden className={`size-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

export function GaleriaRepuestos<T extends FilaGaleria>({
  rows, fotosDe, nombreDe, stockMeta, onAbrirFicha, onAbrirFoto, onAgregarFoto,
}: Props<T>) {
  const [limite, setLimite] = useState(TARJETAS_POR_PAGINA)
  // Otra búsqueda o filtro: se vuelve a la primera página.
  useEffect(() => { setLimite(TARJETAS_POR_PAGINA) }, [rows])

  const mostrados = useMemo(
    () => rows.slice(0, limite).map((row) => ({ row, fotos: fotosDe(row) })),
    [rows, limite, fotosDe],
  )
  const nombre = (row: T): NombreGaleria => (nombreDe ? nombreDe(row) : { titulo: row.textoBreve })

  if (rows.length === 0) {
    return <p className="py-10 text-center text-footnote text-muted-foreground">No hay repuestos con esta búsqueda.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-3">
        {mostrados.map(({ row, fotos }) => {
          const { titulo, oficial } = nombre(row)
          const foto = portada(fotos) ?? ''
          const origen = origenDeFoto(foto)
          const indice = Math.max(0, fotos.indexOf(foto))
          return (
            <div key={row.rowKey} className="overflow-hidden rounded-[22px] bg-card sm:rounded-[26px]">
              <div className="relative aspect-[4/3]">
                {foto ? (
                  <>
                    <FotosHoverCard
                      fotos={fotos}
                      nombre={titulo}
                      codigo={row.codigoSAP ?? undefined}
                      onAbrir={(i) => onAbrirFoto(row, i)}
                      className="block size-full"
                    >
                      <button
                        type="button"
                        aria-label={`Abrir foto de ${titulo}`}
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
                    </FotosHoverCard>
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
                  </>
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground">
                    <ImageOff aria-hidden className="size-5" />
                    {onAgregarFoto ? (
                      <button
                        type="button"
                        aria-label={`Agregar foto a ${titulo}`}
                        onClick={() => onAgregarFoto(row)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-caption font-semibold text-primary"
                      >
                        <Camera aria-hidden className="size-4" /> Agregar foto
                      </button>
                    ) : (
                      <span className="text-caption">Sin foto</span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAbrirFicha(row)}
                className="flex min-h-[44px] w-full flex-col gap-0.5 px-2.5 py-2 text-left"
              >
                <span className="line-clamp-2 text-footnote font-semibold leading-snug">{titulo}</span>
                {oficial && <span className="line-clamp-1 text-caption text-muted-foreground">{oficial}</span>}
                <span className="font-mono text-caption text-muted-foreground">{row.codigoSAP || '—'}</span>
                <PuntoStock meta={stockMeta[row.stockStatus]} />
              </button>
            </div>
          )
        })}
      </div>

      {rows.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + TARJETAS_POR_PAGINA)}
          className="mx-auto flex min-h-[44px] items-center rounded-full bg-muted px-5 text-subhead font-medium"
        >
          Mostrar más ({rows.length - limite})
        </button>
      )}
    </div>
  )
}
