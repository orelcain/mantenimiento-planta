import type { FilaDespiece } from '@/hooks/usePlano'

/**
 * Modo revisión del despiece (boceto aprobado por Orel, 16-10-2026): una cola con las ubicaciones
 * de repuestos con SAP que no tienen el número marcado; para cada una se toca el número en el
 * dibujo y se guarda. Tres piezas: la banda de arriba, la tarjeta del panel y los botones sobre
 * el dibujo.
 */

export function BandaRevision({ i, total, unica, guardando, onSaltar, onNoEsta, onSalir }: {
  i: number
  total: number
  /** «Corregir ubicación» de UNA pieza: sin cola ni «Saltar» */
  unica: boolean
  guardando: boolean
  onSaltar: () => void
  onNoEsta: () => void
  onSalir: () => void
}) {
  const avance = total ? Math.round((i / total) * 100) : 0
  return (
    <div role="region" aria-label="Modo revisión"
         className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2"
         style={{ background: 'var(--lc-aqua-soft)', borderColor: 'var(--lc-aqua)' }}>
      <span className="text-footnote font-medium" style={{ color: 'var(--lc-ink)' }}>
        {unica ? 'Corregir ubicación' : 'Modo revisión'}
      </span>
      {!unica && (
        <>
          <span className="text-footnote tabular-nums" style={{ color: 'var(--lc-ink)' }}>
            {Math.min(i + 1, total)} de {total} · repuestos con SAP sin ubicar
          </span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full" style={{ background: 'var(--lc-border)' }} aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${avance}%`, background: 'var(--lc-aqua-bright)' }} />
          </span>
        </>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        {!unica && (
          <button type="button" onClick={onSaltar} disabled={guardando}
                  className="min-h-[44px] rounded-ctl border px-3 text-footnote" style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink)' }}>
            Saltar
          </button>
        )}
        <button type="button" onClick={onNoEsta} disabled={guardando}
                className="min-h-[44px] rounded-ctl border px-3 text-footnote" style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink)' }}>
          No está en este dibujo
        </button>
        <button type="button" onClick={onSalir}
                className="min-h-[44px] rounded-ctl border px-3 text-footnote" style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink)' }}>
          Salir
        </button>
      </div>
    </div>
  )
}

export function TarjetaRevision({ fila, codigo, sap, hechas, pendientes, error }: {
  fila: FilaDespiece | null
  codigo: string
  sap?: { s: string; n: string; u: string }
  hechas: { ubicadas: number; noEsta: number }
  pendientes: number
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <section className="rounded-card border p-3" style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-bg-panel)' }}>
        <p className="m-0 text-nota" style={{ color: 'var(--lc-ink-mid)' }}>Busca en el dibujo la posición</p>
        <p className="m-0 my-0.5 text-[30px] font-medium leading-tight tabular-nums">pos. {fila?.pos ?? '…'}</p>
        <p className="m-0 text-[16px] font-medium">{fila?.es || fila?.de || 'Pieza'}</p>
        <p className="m-0 text-nota" style={{ color: 'var(--lc-ink-mid)' }}>
          {fila?.de && fila.es ? `${fila.de} · ` : ''}<span className="font-mono">{codigo}</span>{sap ? ` · SAP ${sap.s}` : ''}
        </p>
      </section>
      <ol className="m-0 flex list-none flex-col gap-2 rounded-card border p-3 text-footnote" style={{ borderColor: 'var(--lc-border)' }}>
        {[
          `Busca el número ${fila?.pos ?? ''} en el dibujo (acerca con la rueda o pellizcando).`,
          'Tócalo: aparece el recuadro rojo.',
          '«Guardar ubicación» y pasa sola a la siguiente.',
        ].map((t, k) => (
          <li key={k} className="flex items-start gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-nota font-medium"
                  style={{ background: 'var(--lc-aqua-bright)', color: 'var(--lc-surface)' }}>{k + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <section className="rounded-card border p-3 text-footnote" style={{ borderColor: 'var(--lc-border)' }}>
        <div className="flex justify-between gap-2">
          <span>Hoy</span>
          <span className="tabular-nums" style={{ color: 'var(--lc-ink-mid)' }}>
            {hechas.ubicadas} ubicadas · {hechas.noEsta} no están
          </span>
        </div>
        <p className="m-0 mt-1 text-nota tabular-nums" style={{ color: 'var(--lc-ink-mid)' }}>Quedan {pendientes} por revisar</p>
      </section>
      {error && <p className="m-0 text-footnote" style={{ color: 'var(--lc-danger)' }}>{error}</p>}
    </div>
  )
}

export function BotonesMarca({ hayMarca, guardando, onGuardar, onDeshacer }: {
  hayMarca: boolean
  guardando: boolean
  onGuardar: () => void
  onDeshacer: () => void
}) {
  if (!hayMarca) {
    return (
      <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-ctl border px-3 py-2 text-footnote"
         style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-aqua)', color: 'var(--lc-ink)' }}>
        Toca el número de la posición en el dibujo
      </p>
    )
  }
  return (
    <div data-controles className="absolute bottom-3 left-3 z-10 flex gap-2">
      <button type="button" onClick={onGuardar} disabled={guardando}
              className="min-h-[44px] rounded-ctl px-4 text-footnote font-medium"
              style={{ background: 'var(--lc-aqua-bright)', color: 'var(--lc-surface)' }}>
        {guardando ? 'Guardando…' : 'Guardar ubicación'}
      </button>
      <button type="button" onClick={onDeshacer} disabled={guardando}
              className="min-h-[44px] rounded-ctl border px-4 text-footnote"
              style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)', color: 'var(--lc-ink)' }}>
        Deshacer
      </button>
    </div>
  )
}
