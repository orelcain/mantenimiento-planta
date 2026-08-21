/**
 * «Dónde se fueron las piezas»: la cascada del turno, dibujada.
 *
 * Cada barra es una resta contra la capacidad de la máquina, y la última es lo
 * que de verdad se hizo. Las barras están a la MISMA escala (capacidad = 100%)
 * porque la comparación entre pérdidas es el punto: con cada barra normalizada a
 * su propio máximo, 72 piezas y 534 se verían igual de grandes.
 *
 * El cálculo vive en `cascadaTurno.ts` y está testeado aparte; acá solo se
 * dibuja.
 */


import type { Cascada } from './cascadaTurno'

const fmt = (n: number) => Math.abs(n).toLocaleString('es-CL')

const hhmm = (ms: number | null) =>
  ms == null ? null : new Date(ms).toISOString().slice(11, 16)

/** Tono de cada paso. Semánticos: parado es crítico, andando es atención. */
const TONO: Record<Cascada['pasos'][number]['clave'], string> = {
  capacidad: 'bg-brand-ink/25',
  detenciones: 'bg-destructive',
  micro: 'bg-destructive/70',
  vacias: 'bg-warning',
  producido: 'bg-brand-ink',
}

export function CascadaTurnoCard({ cascada }: { cascada: Cascada }) {
  const corte = hhmm(cascada.corteWallMs)
  const anchoDe = (piezas: number) =>
    cascada.capacidad > 0 ? `${Math.max((Math.abs(piezas) / cascada.capacidad) * 100, 0.8)}%` : '0%'

  return (
    <section className="rounded-card border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-footnote font-semibold text-muted-foreground">
          Dónde se fueron las piezas
        </h2>
        {corte && (
          <span className="text-caption tabular-nums text-muted-foreground/70">
            tramos cerrados hasta las {corte}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {cascada.pasos.map(paso => {
          const esResta = paso.piezas < 0
          const detalle = [
            paso.minutos != null ? `${paso.minutos} min` : null,
            paso.veces ? `${paso.veces} ×` : null,
            paso.clave === 'vacias' ? `${100 - cascada.silletasLlenasPor100} de cada 100` : null,
          ].filter(Boolean).join(' · ')
          return (
            <div key={paso.clave} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-footnote text-foreground/80">
                  {paso.etiqueta}
                  {detalle && (
                    <span className="text-caption tabular-nums text-muted-foreground/70"> · {detalle}</span>
                  )}
                </span>
                <span
                  className={`text-footnote font-semibold tabular-nums ${
                    esResta ? (paso.clave === 'vacias' ? 'text-ink-warn' : 'text-ink-crit') : 'text-foreground'
                  }`}
                >
                  {esResta ? '−' : ''}{fmt(paso.piezas)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${TONO[paso.clave]}`}
                  style={{ width: anchoDe(paso.piezas) }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/*
        La conclusión, escrita. Sin esta línea la cascada es un gráfico bonito
        del que cada uno saca lo que quiere; con ella dice a quién le toca.
        OJO: NO dice «sin las detenciones habríamos hecho X»: eso supone un turno
        ideal que no ocurrió. Dice dónde se fue el tiempo, que es lo que pasó.
      */}
      {cascada.perdido > 0 && (
        <p className="mt-3 text-footnote text-foreground/80">
          De las <b className="tabular-nums">{fmt(cascada.perdido)}</b> piezas que no se hicieron,{' '}
          <b className="tabular-nums">{fmt(cascada.perdidoParado)}</b> fueron con la línea parada y{' '}
          <b className="tabular-nums">{fmt(cascada.perdidoAndando)}</b> con la línea andando y la
          silleta vacía.{' '}
          {cascada.perdidoAndando > cascada.perdidoParado ? (
            <>La mayor parte <b>no es una falla</b>: es abastecimiento aguas arriba.</>
          ) : (
            <>La mayor parte se perdió <b>con la línea detenida</b>.</>
          )}
        </p>
      )}

      {/* Pie de contexto. NO va en un `Pill`: el primitivo rinde a 9,5 px, bajo
          el piso de 11 de la constitución (§9/§64), y una frase larga tampoco es
          para lo que sirve una píldora. */}
      <p className="mt-3 text-caption tabular-nums text-muted-foreground">
        {cascada.silletasLlenasPor100} de cada 100 silletas con pieza · máquina a{' '}
        {cascada.ritmoMaquina} pz/min · {cascada.minutosEnMarcha} min andando
      </p>
    </section>
  )
}
