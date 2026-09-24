import { useEffect, useRef } from 'react'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { PlanoAparicion } from '@/hooks/usePlano'
import { marcaEnHoja } from '@/utils/recorridoPlano'

/**
 * Barra para recorrer TODAS las ubicaciones de un código en el plano:
 * ‹ 3 de 6 › + la lista numerada (fila deslizable en el teléfono).
 * Cada toque cambia de hoja si hace falta y hace zoom a la marca.
 * Las ya vistas quedan con ✓ para saber cuáles se revisaron.
 */
export function RecorridoUbicaciones({
  codigo, nombre, puntos, i, vistos, etiquetaDe, onIr, onCerrar, compacto = false,
}: {
  codigo: string
  nombre?: string
  /** ya ordenados (ordenarPuntos) */
  puntos: PlanoAparicion[]
  i: number
  vistos: ReadonlySet<number>
  /** "Fig. 70-8 · Caballete" en el despiece, "Hoja 12 · …" en los eléctricos */
  etiquetaDe: (p: PlanoAparicion) => string
  onIr: (i: number) => void
  onCerrar: () => void
  /** teléfono: fila de chips en vez de lista */
  compacto?: boolean
}) {
  const total = puntos.length
  const filaRef = useRef<HTMLDivElement>(null)
  // En el teléfono la fila sigue al actual: con 6+ chips el 5º queda fuera de vista.
  useEffect(() => {
    filaRef.current?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [i])

  const etiqueta = (k: number) => {
    const p = puntos[k]!
    const m = marcaEnHoja(puntos, k)
    return `${etiquetaDe(p)}${m ? ` · marca ${m}` : ''}`
  }

  return (
    <section aria-label={`Ubicaciones de ${codigo}`} className="mb-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 font-mono text-caption tabular-nums" style={{ color: 'var(--lc-ink-mid)' }}>
            {codigo} · {total} ubicaciones
          </p>
          {nombre && (
            <p className="m-0 truncate text-[17px] font-semibold leading-snug" style={{ color: 'var(--lc-ink)' }}>{nombre}</p>
          )}
        </div>
        {/* En el teléfono la hoja inferior ya trae su × (cierra todo): una
            segunda × apilada debajo confundía. */}
        {!compacto && (
          <button type="button" onClick={onCerrar} aria-label="Terminar el recorrido"
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full"
                  style={{ color: 'var(--lc-ink-mid)' }}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onIr((i - 1 + total) % total)} aria-label="Ubicación anterior"
                className="flex h-[44px] w-[44px] items-center justify-center rounded-full"
                style={{ background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
          <ChevronLeft size={20} />
        </button>
        <span className="text-footnote font-semibold tabular-nums" aria-live="polite" style={{ color: 'var(--lc-ink)' }}>
          {i + 1} de {total}
        </span>
        <button type="button" onClick={() => onIr((i + 1) % total)} aria-label="Ubicación siguiente"
                className="flex h-[44px] w-[44px] items-center justify-center rounded-full"
                style={{ background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {compacto ? (
        <div ref={filaRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
          {puntos.map((p, k) => {
            const actual = k === i
            return (
              <button key={k} type="button" onClick={() => onIr(k)} aria-current={actual}
                      title={etiqueta(k)}
                      className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-footnote"
                      style={{
                        background: actual ? 'var(--lc-aqua-bright)' : 'var(--lc-surface-hi)',
                        color: actual ? 'var(--lc-surface)' : 'var(--lc-ink)',
                      }}>
                <Numero n={k + 1} actual={actual} visto={vistos.has(k)} enChip />
                <span className="whitespace-nowrap tabular-nums">{etiquetaDe(p).split(' · ')[0]}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {puntos.map((_, k) => {
            const actual = k === i
            return (
              <li key={k}>
                <button type="button" onClick={() => onIr(k)} aria-current={actual}
                        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-ctl px-1.5 py-1 text-left"
                        style={{ background: actual ? 'var(--lc-aqua-soft)' : 'transparent' }}>
                  <Numero n={k + 1} actual={actual} visto={vistos.has(k)} />
                  <span className="min-w-0 flex-1 text-footnote leading-snug" style={{ color: 'var(--lc-ink)' }}>
                    {etiqueta(k)}
                  </span>
                  {vistos.has(k) && !actual && (
                    <Check size={14} aria-label="ya vista" style={{ color: 'var(--lc-nuevo)' }} />
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {!compacto && (
        <p className="m-0 text-caption" style={{ color: 'var(--lc-ink-ghost)' }}>
          Enter en el buscador: siguiente · Mayús + Enter: anterior
        </p>
      )}
    </section>
  )
}

function Numero({ n, actual, visto, enChip = false }: { n: number; actual: boolean; visto: boolean; enChip?: boolean }) {
  return (
    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-caption font-bold tabular-nums"
          style={actual
            ? enChip
              ? { background: 'var(--lc-surface)', color: 'var(--lc-aqua-bright)' }
              : { background: 'var(--lc-aqua-bright)', color: 'var(--lc-surface)' }
            : visto
            ? { background: 'var(--lc-nuevo-soft)', color: 'var(--lc-nuevo)' }
            : { background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
      {n}
    </span>
  )
}
