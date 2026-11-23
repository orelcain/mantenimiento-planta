/**
 * «¿Hay que hacer algo?» (mockup v4, tarjeta 2): acciones con dueño (punto ámbar = Mantención, gris = Seteo) y lo
 * que se gana; si no hay ninguna, «Todo en orden». Abajo, los kg a P0 del turno por dueño. Al tocar una acción se
 * abre su detalle (`onAbrir`); sin él la fila no es botón. Las reglas van plegadas en «ⓘ Reglas».
 */
import { Check, ChevronRight, ListChecks } from 'lucide-react'
import { milesPunto } from '@/services/grader/espejo/alertasGrader'
import { Tarjeta } from './TarjetaVivo'
import { ACCION_AGREGAR_KG, ACCION_FOTO_PZ, ACCION_PUERTA_PZ, LOTE_CALIBRE_PTS, LOTE_PESO_PCT, type Accion, type HayQueHacer } from './hayQueHacerDatos'

const tono = (d: Accion['dueno']) => (d === 'mantencion' ? 'var(--v2-mant)' : 'var(--v2-ext)')

function Fila({ a, onAbrir }: { a: Accion; onAbrir?: (a: Accion) => void }) {
  const cuerpo = (
    <>
      <i aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: tono(a.dueno) }} />
      <span className="min-w-0">
        <b className="block text-[15px] font-semibold leading-5 text-foreground">{a.titulo}</b>
        <small className="block text-[13px] leading-[18px] text-muted-foreground tabular-nums">{a.detalle}</small>
      </span>
      {onAbrir ? <ChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" /> : <span />}
    </>
  )
  // `v2-subtarjeta`: el gris de las subtarjetas del monitor (el `--v2-sub` del mockup no existe en monitorGlass.css).
  const clase = 'v2-subtarjeta grid min-h-[52px] w-full grid-cols-[10px_1fr_14px] items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left'
  return (
    <li>
      {onAbrir ? (
        <button type="button" onClick={() => onAbrir(a)} className={`${clase} transition-colors hover:bg-[color-mix(in_srgb,var(--v2-acento)_10%,transparent)]`}>
          {cuerpo}
        </button>
      ) : (
        <div className={clase}>{cuerpo}</div>
      )}
    </li>
  )
}

function Chip({ dueno, texto }: { dueno: Accion['dueno']; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: tono(dueno) }} />
      {texto}
    </span>
  )
}

export function HayQueHacerAlgo({ h, onAbrir }: { h: HayQueHacer; onAbrir?: (a: Accion) => void }) {
  return (
    <Tarjeta titulo="¿Hay que hacer algo?" icono={<ListChecks className="h-3.5 w-3.5" />}>
      <div data-testid="hay-que-hacer">
        {h.acciones.length > 0 ? (
          <ul className="mt-3 grid gap-1.5">
            {h.acciones.map((a) => <Fila key={a.clave} a={a} onAbrir={onAbrir} />)}
          </ul>
        ) : (
          <p className="mt-3.5 flex items-center gap-2.5 text-[20px] font-semibold leading-7 text-foreground">
            <Check aria-hidden className="h-[22px] w-[22px] text-[var(--v2-bien)]" strokeWidth={2.5} />
            Todo en orden
          </p>
        )}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
          <span>kg a P0 del turno:</span>
          <Chip dueno="mantencion" texto={`Mantención ${milesPunto(Math.round(h.kgMantencion))}`} />
          <Chip dueno="seteo" texto={`Seteo ${milesPunto(Math.round(h.kgSeteo))}`} />
        </p>
        <details className="mt-2 text-[12px] leading-4 text-muted-foreground">
          <summary className="cursor-pointer select-none py-1">ⓘ Reglas</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>Limpiar fotocélula: {ACCION_FOTO_PZ} o más piezas de fotocélula en los últimos 15 min.</li>
            <li>Agregar gate: una combinación de calibre y calidad sin gate que ya suma {ACCION_AGREGAR_KG} kg o más a P0 en el turno.</li>
            <li>Repartir un calibre: {ACCION_PUERTA_PZ} o más piezas de «puerta no preparada» en 15 min (necesita la Puerta 0).</li>
            <li>Revisar gates: el lote en curso es distinto del anterior (±{LOTE_PESO_PCT} % de peso o +{LOTE_CALIBRE_PTS} puntos en un calibre).</li>
            <li>Umbrales ilustrativos. Los últimos 15 min se cuentan hasta la última pieza leída. Sin Puerta 0, los kg por dueño son estimados.</li>
          </ul>
        </details>
      </div>
    </Tarjeta>
  )
}
