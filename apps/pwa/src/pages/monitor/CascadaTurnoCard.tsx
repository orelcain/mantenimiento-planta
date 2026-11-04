/**
 * «Dónde se fueron las piezas»: la cascada del turno a la meta de Shoplogix, con la perilla (Fase B).
 *
 * Cada barra es una resta contra «podía hacer a la meta» de la vista elegida (Línea o una Baader), y la última es lo que
 * de verdad se hizo. El cálculo vive en `cascadaPerilla.ts` y está testeado aparte; acá solo se dibuja y se elige la vista.
 */


import { useState } from 'react'
import { SegmentedControl, type Segment } from '@/components/piel/SegmentedControl'
import { BotonInfo } from './GlobosFranja'
import type { CascadaPorMeta, PiezasVista } from './cascadaPerilla'

/* La cascada a la meta de Shoplogix con la perilla (Fase B). Las cifras salen de `cascadaPerilla.ts`; aquí solo se
   muestran y se elige la vista (Línea o una Baader). Cada vista cuadra sola: podía − perilla − detenciones − micro −
   vacíos = hizo. El tamaño de texto más chico es 11 px (`text-caption`). */

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString('es-CL')

/** «Evisceradora 1» → «Ev 1» (así lo nombra el encargo y el mockup). */
const etiquetaVista = (nombre: string) => nombre.replace(/^Evisceradora\s*/i, 'Ev ')

/** Tono de cada escalón con los tokens de la piel Pizarra (`--v2-*`). Ningún hex nuevo. */
const TONO = {
  capacidad: 'var(--v2-gris)',
  perilla: 'var(--v2-prog)',
  daba: 'var(--v2-secundaria)',
  detenciones: 'var(--v2-mal)',
  micro: 'var(--v2-mal-texto)',
  vacios: 'var(--v2-mant)',
  hizo: 'var(--v2-acento)',
} as const

interface Escalon {
  clave: keyof typeof TONO
  etiqueta: string
  detalle?: string
  piezas: number
  resta: boolean
  negrita?: boolean
  sub?: boolean
}

function escalonesDe(v: PiezasVista, metas: string, perillas: string, sumaBaaders: boolean): Escalon[] {
  const min = (x: number) => Math.round(x)
  return [
    { clave: 'capacidad', etiqueta: 'Podía hacer a la meta', detalle: `meta ${metas}`, piezas: v.podia, resta: false },
    { clave: 'perilla', etiqueta: 'Perilla más lenta que la meta', detalle: perillas, piezas: v.perilla, resta: true },
    { clave: 'daba', etiqueta: 'Podía hacer con la perilla', piezas: v.podiaConPerilla, resta: false, negrita: true, sub: true },
    {
      clave: 'detenciones',
      etiqueta: 'Detenciones',
      detalle: `${min(v.detenciones.min)} min${sumaBaaders ? ', suma de las 3 Baader' : ''} · ${v.detenciones.veces} ×`,
      piezas: v.detenciones.piezas,
      resta: true,
    },
    { clave: 'micro', etiqueta: 'Microdetenciones', detalle: `${min(v.micro.min)} min · ${v.micro.veces} ×`, piezas: v.micro.piezas, resta: true },
    { clave: 'vacios', etiqueta: 'Vacíos', piezas: v.vacios, resta: true },
    { clave: 'hizo', etiqueta: 'Hizo', piezas: v.hizo, resta: false },
  ]
}

export function CascadaTurnoCard({ cascada, minutosTurno }: { cascada: CascadaPorMeta; minutosTurno: number }) {
  const [vista, setVista] = useState<string>('linea')
  const [info, setInfo] = useState(false)

  const segmentos: Segment<string>[] = [
    { value: 'linea', label: 'Línea' },
    ...cascada.baaders.map((b) => ({ value: b.id, label: etiquetaVista(b.nombre) })),
  ]
  const baader = cascada.baaders.find((b) => b.id === vista) ?? null
  const v: PiezasVista = baader ?? cascada.linea

  const metas = baader
    ? `${baader.meta} pz/min`
    : `${cascada.baaders.map((b) => b.meta).join(' + ')} pz/min`
  const perillas = baader
    ? baader.vara != null && baader.vara !== baader.meta
      ? `${baader.vara} en vez de ${baader.meta}`
      : 'igual a su meta'
    : cascada.baaders.filter((b) => b.perilla > 0).map((b) => `${etiquetaVista(b.nombre)} ${b.vara} en vez de ${b.meta}`).join(' · ') || 'ninguna más lenta que su meta'

  const escalones = escalonesDe(v, metas, perillas, baader == null)
  const d = v.duenos

  return (
    <section className="rounded-card border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">
          <h2 className="text-footnote font-semibold text-muted-foreground">Dónde se fueron las piezas</h2>
          <BotonInfo etiqueta="Cómo se calcula" abierto={info} alCambiar={setInfo} />
        </div>
        <span className="text-caption tabular-nums text-muted-foreground/80">{baader ? etiquetaVista(baader.nombre) : 'Línea'}</span>
      </div>
      {info && (
        <p className="mt-2 text-nota text-muted-foreground">
          Parte de la meta de Shoplogix en el tiempo de producción: el turno menos la detención programada (colación,
          reunión de inicio y ejercicio compensatorio), que no es pérdida de nadie. La perilla se resta primero; desde
          «podía hacer con la perilla» todo se mide a la perilla. Detenciones: minutos con detención no programada de
          cada Baader; en la línea, su suma. Vacíos por diferencia, para que la suma cierre al entero.
        </p>
      )}

      <div className="mt-3">
        <SegmentedControl value={vista} onChange={setVista} segments={segmentos} ariaLabel="Ver por Baader" />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-footnote text-foreground/80">Tiempo de producción</span>
        <span className="text-footnote font-semibold tabular-nums text-foreground">{fmt(v.minProduccion)} min</span>
      </div>
      <p className="text-caption tabular-nums text-muted-foreground">
        ({minutosTurno} del turno − {fmt(v.minProgramada)} de detención programada: colación, reunión y ejercicio), que no es pérdida de nadie
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        {escalones.map((e) => (
          <div key={e.clave} className={`flex flex-col gap-1 ${e.sub ? 'pl-3' : ''}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-footnote text-foreground/80">
                {e.etiqueta}
                {e.detalle && <span className="text-caption tabular-nums text-muted-foreground/80"> · {e.detalle}</span>}
              </span>
              <span
                className={`text-footnote font-semibold tabular-nums ${
                  e.resta ? (e.clave === 'vacios' ? 'text-ink-warn' : 'text-ink-crit') : 'text-foreground'
                }`}
              >
                {e.resta && e.piezas > 0 ? '−' : ''}{fmt(e.piezas)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${v.podia > 0 ? Math.max((Math.abs(e.piezas) / v.podia) * 100, e.piezas ? 0.8 : 0) : 0}%`,
                  background: TONO[e.clave],
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Cuadre: los mismos números de arriba, en una línea. Vista por vista, cierra al entero. */}
      <p className="mt-3 text-footnote tabular-nums text-foreground/80">
        Cuadre: {fmt(v.podia)} − {fmt(v.perilla)} − {fmt(v.detenciones.piezas)} − {fmt(v.micro.piezas)} − {fmt(v.vacios)} = <b>{fmt(v.hizo)}</b> piezas hechas.
      </p>

      {/* La línea de dueños, por vista: quién debe mover cada parte de lo que no se hizo. */}
      {v.perdido > 0 && (
        <p className="mt-2 text-footnote tabular-nums text-foreground/80">
          De <b>{fmt(v.perdido)}</b> piezas bajo la meta, <b>{fmt(d.mantOp)}</b> son de Mantención y operación, <b>{fmt(d.aguas)}</b> de aguas arriba (vacíos y detenciones de acopio, bombeo o ducto) y <b>{fmt(d.produccion)}</b> de producción (perilla).
        </p>
      )}

      <p className="mt-3 text-caption tabular-nums text-muted-foreground">
        {baader
          ? `${etiquetaVista(baader.nombre)}: meta de Shoplogix ${baader.meta} pz/min${baader.vara != null ? `, perilla ${baader.vara}` : ''}.`
          : `Perilla: la velocidad puesta en cada Baader. Meta de Shoplogix: ${cascada.baaders.map((b) => b.meta).join(' · ')} pz/min.`}
      </p>
    </section>
  )
}
