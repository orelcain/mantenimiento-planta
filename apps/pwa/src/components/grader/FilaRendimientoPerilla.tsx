/**
 * «Al rendimiento le faltan X pts»: la partición del rendimiento con la perilla (Fase B).
 *
 * Dos partes: «perilla más lenta que la meta» (producción) y «faltó para llegar a la perilla» (en piezas, los vacíos de la cascada).
 * `contenedor` cambia el rótulo: «carros vacíos» en Eviscerado, «silletas vacías» en Filete (por omisión, silleta).
 * Las cifras vienen ya calculadas por `cascadaPerilla.ts` (`rendimiento` de cada vista); esta fila solo las pinta.
 * La usa la tarjeta de la cascada del monitor (`CascadaTurnoCard`), arriba de los escalones, por Baader y por línea.
 * `PlantKPIBoard` la tiene como prop opcional sin enchufar.
 */
import type { RendimientoPartido } from '@/pages/monitor/cascadaPerilla'
import { vaciasEtiqueta, type Contenedor } from '@/pages/monitor/cascadaTurno'
import { BotonInfo } from '@/pages/monitor/GlobosFranja'
import { useState } from 'react'

const pts = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const piezas = (n: number) => Math.round(n).toLocaleString('es-CL')

export function FilaRendimientoPerilla({ r, contenedor = 'silleta' }: { r: RendimientoPartido; contenedor?: Contenedor }) {
  const [info, setInfo] = useState(false)
  if (r.expMeta <= 0 || r.ptsFalta <= 0) return null
  const pctPerilla = Math.min(100, Math.max(0, (r.ptsPerilla / r.ptsFalta) * 100))
  /* Los vacíos del contenedor de esta línea: «carros vacíos» (los) o «silletas vacías» (las). */
  const vacias = vaciasEtiqueta(contenedor).toLowerCase()
  const articulo = contenedor === 'carro' ? 'los' : 'las'
  return (
    <section className="rounded-card border border-border bg-muted/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">
          <h3 className="text-footnote font-semibold text-foreground">Al rendimiento le faltan</h3>
          <BotonInfo etiqueta="Cómo se calcula el rendimiento" abierto={info} alCambiar={setInfo} />
        </div>
        <span className="text-footnote font-semibold tabular-nums text-foreground">{pts(r.ptsFalta)} pts</span>
      </div>
      {info && (
        <p className="mt-2 text-nota text-muted-foreground">
          El rendimiento cuenta solo los minutos andando (meta × minutos andando). Las detenciones y las micro le restan a la
          disponibilidad, no al rendimiento: por eso lo que faltó para llegar a la perilla son {articulo} {vacias}. Las piezas son las de la cascada.
        </p>
      )}
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full" style={{ width: `${pctPerilla}%`, background: 'var(--v2-prog)' }} />
        <div className="h-full flex-1" style={{ background: 'var(--v2-mant)' }} />
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-footnote text-foreground/80">
            Perilla más lenta que la meta
            <span className="block text-caption tabular-nums text-muted-foreground/80">de producción · {piezas(r.piezasPerilla)} piezas</span>
          </span>
          <span className="text-footnote font-semibold tabular-nums text-foreground">{pts(r.ptsPerilla)} pts</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-footnote text-foreground/80">
            Faltó para llegar a la perilla
            <span className="block text-caption tabular-nums text-muted-foreground/80">{vacias} · {piezas(r.piezasFaltoPerilla)} piezas</span>
          </span>
          <span className="text-footnote font-semibold tabular-nums text-foreground">{pts(r.ptsFaltoPerilla)} pts</span>
        </div>
      </div>
    </section>
  )
}
