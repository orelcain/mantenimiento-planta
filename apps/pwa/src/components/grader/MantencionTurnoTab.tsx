/**
 * Pestaña «Mantención» del Análisis de Turno — la vista A · Titular del mockup
 * del 26-08: la historia del turno en una frase (quién falló, cuánto costó,
 * cómo respondió Mantención) y detrás los bloques que la respaldan.
 *
 * Orden = el argumento que la app tiene que sostener, no la estructura de la
 * base: titular → nuestra respuesta → lo que costó → reparto de minutos →
 * el evento → aviso de target. Todo sale de `kpisDeTurno` sobre el snapshot
 * que la página YA carga (cero fetch nuevo).
 *
 * Color: solo DOS familias llevan color en las barras —falla (crit) y
 * produciendo (ok)—; el resto va en rampa neutra, que además codifica «no es
 * de Mantención». Los rellenos grandes usan el tinte suavizado (color-mix
 * contra la card), nunca la tinta viva: esa queda para pills y texto.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Wrench, AlertTriangle, TrendingUp } from 'lucide-react'
import { Pill } from '@/components/piel'
import type { KpisTurnoMantencion, KpisMaquinaTurno, EventoFalla } from '@/services/shoplogix/kpisMantencionTurno'
import { targetSospechoso, reenganches } from '@/services/shoplogix/kpisMantencionTurno'
import { nombreCorto } from '@/services/shoplogix/ritmoPorMaquina'
import { cargarTendenciaMantencion, TURNOS_TENDENCIA, type PuntoTendenciaMantencion } from '@/services/shoplogix/tendenciaMantencion'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n))
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDec = (n: number) => nf1.format(n)
/** Hora de planta de un Date wall-clock-as-UTC (la convención del snapshot). */
const hh = (d: Date) => d.toISOString().slice(11, 16)

/* Rellenos suavizados: mezcla de la tinta con la card, para que un bloque
   grande no grite (la tinta viva queda para pills/texto — regla del mockup). */
const FILL = {
  falla: 'color-mix(in oklab, rgb(var(--ink-crit)) 58%, rgb(var(--card)))',
  produccion: 'color-mix(in oklab, rgb(var(--ink-ok)) 45%, rgb(var(--card)))',
  micro: 'color-mix(in oklab, rgb(var(--muted-foreground)) 45%, rgb(var(--card)))',
  externo: 'color-mix(in oklab, rgb(var(--muted-foreground)) 32%, rgb(var(--card)))',
  planificado: 'color-mix(in oklab, rgb(var(--muted-foreground)) 20%, rgb(var(--card)))',
  resto: 'rgb(var(--muted))',
} as const

function Cap({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

/** Una barra de reparto: mismos 100% (la ventana) para las tres máquinas. */
function BarraReparto({ x, ventanaMin }: { x: KpisMaquinaTurno; ventanaMin: number }) {
  const r = x.reparto
  const seg = (min: number, fill: string, title: string) =>
    min > 0.2 ? (
      <span key={title} title={`${title}: ${fmtInt(min)} min`} style={{ width: `${(min / ventanaMin) * 100}%`, background: fill }} />
    ) : null
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-headline text-foreground">{nombreCorto(x.maquina.machineName)}</span>
        <span className="text-caption tabular-nums text-muted-foreground">
          {fmtInt(x.maquina.totalCycles)} pz · {Math.round((x.kpi.uptimeMin / ventanaMin) * 100)}% produciendo
        </span>
      </div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
        {seg(r.falla, FILL.falla, 'Falla técnica')}
        {seg(r.micro, FILL.micro, 'Micro-paros')}
        {seg(r.externo + r.excedido, FILL.externo, 'Externo y excedido')}
        {seg(r.planificado, FILL.planificado, 'Planificado')}
        {seg(r.produccion, FILL.produccion, 'Produciendo')}
        {seg(r['sin-imputar'] + r.resto, FILL.resto, 'Sin clasificar')}
      </div>
      <p className="text-caption tabular-nums text-muted-foreground/80">
        {fmtInt(r.falla)} falla · {fmtDec(r.micro)} micro ({x.kpi.grupos.micro?.n ?? 0}×) ·{' '}
        {fmtDec(r.externo + r.excedido)} ext · {fmtDec(r.planificado)} plan
      </p>
    </div>
  )
}

/** El evento mayor, con sus tramos: paro–arranque fallido–paro, a escala. */
function EventoLane({ evento, fallas }: { evento: EventoFalla & { maquina: string }; fallas: Array<{ desde: Date; hasta: Date; sec: number }> }) {
  const t0 = evento.desde.getTime()
  const span = Math.max(1, evento.hasta.getTime() - t0)
  const tramos = fallas
    .filter((f) => f.hasta.getTime() > t0 && f.desde.getTime() < evento.hasta.getTime())
    .sort((a, b) => a.desde.getTime() - b.desde.getTime())
  return (
    <div className="space-y-1">
      <div className="relative flex h-5 overflow-hidden rounded-full bg-muted">
        {tramos.map((f) => (
          <span
            key={f.desde.toISOString()}
            className="absolute inset-y-0"
            title={`${hh(f.desde)}–${hh(f.hasta)} · ${fmtInt(f.sec / 60)} min`}
            style={{
              left: `${((f.desde.getTime() - t0) / span) * 100}%`,
              width: `${Math.max(1.5, (f.sec * 1000 / span) * 100)}%`,
              background: FILL.falla,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-caption tabular-nums text-muted-foreground/80">
        <span>{hh(evento.desde)}</span>
        {evento.paros > 1 && <span>{evento.paros - 1} arranque{evento.paros > 2 ? 's' : ''} fallido{evento.paros > 2 ? 's' : ''} entre paros</span>}
        <span>{hh(evento.hasta)}</span>
      </div>
    </div>
  )
}

/**
 * T1 — «minutos de falla técnica por turno», small multiples por máquina con
 * eje COMÚN anclado en cero: la serie donde la línea plana en cero es la
 * evidencia y el pico la anomalía. No es MTBF a propósito (con 0 fallas el
 * MTBF no existe y agujerearía justo los turnos del mérito).
 */
function TendenciaMantencion({ plantSlug, shiftId, hastaDateKey }: {
  plantSlug: PlantSlug
  shiftId: string
  hastaDateKey: string
}) {
  const [puntos, setPuntos] = useState<PuntoTendenciaMantencion[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    setPuntos(null)
    setError(false)
    cargarTendenciaMantencion(plantSlug, shiftId, hastaDateKey)
      .then((p) => { if (vivo) setPuntos(p) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [plantSlug, shiftId, hastaDateKey])

  const maquinas = puntos?.length
    /* localeCompare numérico, no orden lexicográfico pelado: la regla de los
       calibres ("10-12 lb" antes que "2-4 lb") vale para cualquier eje de texto. */
    ? [...new Set(puntos.flatMap((p) => p.porMaquina.map((m) => m.name)))]
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    : []
  const maxFalla = puntos?.length
    ? Math.max(30, ...puntos.flatMap((p) => p.porMaquina.map((m) => m.fallaMin)))
    : 30

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <Cap><TrendingUp className="h-3 w-3" />Tendencia · falla técnica por turno ({shiftId})</Cap>
      {error && (
        <p className="mt-2 text-caption text-muted-foreground">No se pudo cargar el historial.</p>
      )}
      {!error && puntos == null && (
        <p className="mt-2 text-caption text-muted-foreground">Cargando los últimos turnos…</p>
      )}
      {!error && puntos != null && puntos.length < 2 && (
        <p className="mt-2 text-caption text-muted-foreground">
          {puntos.length} de {TURNOS_TENDENCIA} turnos con datos — la tendencia aparece al segundo.
        </p>
      )}
      {!error && puntos != null && puntos.length >= 2 && (
        <div className="mt-3 space-y-4">
          {maquinas.map((nombre) => (
            <div key={nombre}>
              <div className="flex items-baseline justify-between">
                <span className="text-footnote text-muted-foreground">{nombreCorto(nombre)}</span>
                <span className="text-caption tabular-nums text-muted-foreground/80">
                  eje 0–{fmtInt(maxFalla)} min
                </span>
              </div>
              {/* Barras desde CERO (acá sí barras: magnitud desde el origen). */}
              <div className="mt-1 flex h-12 items-end gap-1">
                {puntos.map((p, i) => {
                  const m = p.porMaquina.find((x) => x.name === nombre)
                  const falla = m?.fallaMin ?? 0
                  const esHoy = i === puntos.length - 1
                  return (
                    <div
                      key={p.dateKey}
                      className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
                      title={`${p.dateKey} · ${fmtInt(falla)} min de falla${m?.eventos ? ` · ${m.eventos} evento${m.eventos === 1 ? '' : 's'}` : ''}`}
                    >
                      <span
                        className={`w-full rounded-t-[2px] ${esHoy ? '' : ''}`}
                        style={{
                          height: `${Math.max(falla > 0 ? 8 : 2, (falla / maxFalla) * 100)}%`,
                          background: falla > 0 ? FILL.falla : FILL.planificado,
                          outline: esHoy ? '2px solid rgb(var(--primary) / .5)' : undefined,
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-0.5 flex gap-1 text-[10px] tabular-nums text-muted-foreground/80">
                {puntos.map((p, i) => (
                  <span key={p.dateKey} className={`min-w-0 flex-1 truncate text-center ${i === puntos.length - 1 ? 'font-semibold text-brand-ink' : ''}`}>
                    {i === puntos.length - 1 ? 'hoy' : p.dateKey.slice(8)}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-caption leading-snug text-muted-foreground/80">
            Mismo eje para todas las máquinas y todos los turnos: la misma altura significa lo mismo.
            El cero es dato — la fila plana ES la evidencia.
          </p>
        </div>
      )}
    </section>
  )
}

export function MantencionTurnoTab({ kpis, loading, plantSlug, shiftId, dateKey }: {
  kpis: KpisTurnoMantencion | null
  loading?: boolean
  plantSlug: PlantSlug
  shiftId: string | null
  dateKey: string | null
}) {
  if (!kpis) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {loading ? 'Cargando los datos de Shoplogix…' : 'Sin datos de Shoplogix para este turno: esta vista se arma con los states y la producción del sensor.'}
      </div>
    )
  }

  const { porMaquina, ventanaMin, eventos, totalFallaMin, totalEventos, mttrGlobalMin, linea } = kpis
  const conFalla = [...porMaquina].filter((x) => x.reparto.falla > 0).sort((a, b) => b.reparto.falla - a.reparto.falla)
  const sanas = porMaquina.filter((x) => x.reparto.falla === 0)
  /* Verbo en pasado cuando la ventana ya quedó atrás (los Date del snapshot
     son wall-clock sellado como UTC; el reloj se lleva a esa misma base). */
  const ahoraWall = Date.now() - new Date().getTimezoneOffset() * 60_000
  const cerrado = kpis.ventana.end.getTime() < ahoraWall
  const eventoMayor = eventos[0] ?? null
  const fallasDelMayor = eventoMayor
    ? porMaquina.find((x) => x.maquina.machineName === eventoMayor.maquina)?.kpi.fallas ?? []
    : []
  const sospechosas = porMaquina.filter((x) => targetSospechoso(x.velocidad))

  /* Piezas estimadas de la falla, al ritmo DEMOSTRADO de cada máquina (su
     mediana andando) — no al target, que puede estar malo (ver aviso). */
  const pzFalla = conFalla.reduce((a, x) => a + x.reparto.falla * (x.velocidad.medianaAndandoCpm ?? 0), 0)

  /*
   * Reenganche tras el paro mayor, a resolución de los intervalos de 5 min
   * (los que el cliente tiene): cuántos minutos tardó la máquina en volver a
   * su ritmo demostrado después del evento. La resolución fina (1 min) queda
   * para el endpoint backend — por eso se dice con «≤».
   */
  const reengancheMayor = (() => {
    if (!eventoMayor) return null
    const m = porMaquina.find((x) => x.maquina.machineName === eventoMayor.maquina)
    const mediana = m?.velocidad.medianaAndandoCpm
    if (!m || mediana == null) return null
    const buckets = (m.maquina.intervals ?? []).map((iv) => ({
      ms: iv.startAt.getTime(),
      c: iv.cycles || 0,
      e: iv.expectedCycles || 0,
    }))
    const r = reenganches(buckets, [eventoMayor], mediana * 5)
    return r[0]?.min != null ? r[0].min * 5 : null
  })()

  return (
    <div className="space-y-4">
      {/* ── El titular: la historia en 10 segundos ── */}
      <section className="rounded-card border border-border bg-card p-4">
        <Cap><Wrench className="h-3 w-3" />Mantención · respuesta del turno</Cap>
        {totalFallaMin === 0 ? (
          <p className="mt-2 text-[15px] leading-snug text-foreground">
            {cerrado ? 'El turno cerró sin fallas técnicas' : 'El turno va sin fallas técnicas'}:
            disponibilidad <b className="tabular-nums">100%</b> en las {porMaquina.length} máquinas.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[15px] leading-snug text-foreground">
              El turno {cerrado ? 'perdió' : 'lleva'}{' '}
              <b className="tabular-nums text-ink-crit">{fmtInt(totalFallaMin)} min por falla técnica</b>
              {conFalla.length === 1 && <>, toda en <b>{nombreCorto(conFalla[0]!.maquina.machineName)}</b></>}
              {eventoMayor && eventoMayor.sec / 60 > totalFallaMin * 0.6 && <> y casi toda en un solo evento</>}.
            </p>
            <p className="mt-1.5 text-[15px] leading-snug text-foreground">
              Mantención {cerrado ? 'cerró' : 'va cerrando'} las intervenciones con{' '}
              <b className="tabular-nums">{mttrGlobalMin != null ? fmtDec(mttrGlobalMin) : '—'} min</b> de MTTR por evento
              {sanas.length > 0 && (
                <> y {sanas.length === 1 ? 'dejó' : 'dejó'}{' '}
                  <b className="text-ink-ok">{sanas.map((x) => nombreCorto(x.maquina.machineName)).join(' y ')} en 100%</b>{' '}
                  de disponibilidad técnica</>
              )}.
            </p>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
          {porMaquina.map((x) => (
            <Pill
              key={x.maquina.machineid}
              tone={x.kpi.dispTecnicaPct == null ? 'neutral' : x.kpi.dispTecnicaPct >= 99.9 ? 'ok' : x.kpi.dispTecnicaPct >= 90 ? 'warning' : 'critical'}
              dot
              className="tabular-nums normal-case"
            >
              {nombreCorto(x.maquina.machineName)} · {x.kpi.dispTecnicaPct != null ? `${fmtDec(x.kpi.dispTecnicaPct)}%` : '—'}
            </Pill>
          ))}
          <span className="basis-full text-caption text-muted-foreground/80">
            Disponibilidad técnica: solo fallas de equipo — colación, micro y externos van aparte.
          </span>
        </div>
      </section>

      {/* ── Nuestra respuesta / Lo que costó ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-card border border-border bg-card p-4">
          <Cap>Nuestra respuesta</Cap>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            <div>
              <div className="text-display tabular-nums text-foreground">
                {mttrGlobalMin != null ? fmtDec(mttrGlobalMin) : '—'}<span className="text-[15px] font-semibold"> min</span>
              </div>
              <div className="text-footnote text-muted-foreground">MTTR · {totalEventos} evento{totalEventos === 1 ? '' : 's'}</div>
            </div>
            <div>
              <div className="text-display tabular-nums text-foreground">
                {conFalla[0]?.kpi.mtbfMin != null ? fmtInt(conFalla[0].kpi.mtbfMin) : '—'}<span className="text-[15px] font-semibold"> min</span>
              </div>
              <div className="text-footnote text-muted-foreground">
                MTBF{conFalla[0] ? ` de ${nombreCorto(conFalla[0].maquina.machineName)}` : ''}
              </div>
            </div>
            {reengancheMayor != null && (
              <div className="col-span-2 border-t border-border/50 pt-2">
                <div className="text-headline text-foreground">
                  {reengancheMayor === 0
                    ? 'Reenganche inmediato (≤5 min) tras el paro mayor'
                    : <>Reenganche en <span className="tabular-nums">≤{fmtInt(reengancheMayor + 5)} min</span> tras el paro mayor</>}
                </div>
                <div className="text-footnote text-muted-foreground">
                  De vuelta al ritmo demostrado de la máquina, medido en tramos de 5 min.
                </div>
              </div>
            )}
            <div className="col-span-2 border-t border-border/50 pt-2">
              <div className="text-headline text-foreground">
                {sanas.length === porMaquina.length
                  ? 'Todas las máquinas sin intervenir'
                  : `${sanas.length} de ${porMaquina.length} máquinas sin una sola falla`}
              </div>
              <div className="text-footnote text-muted-foreground">La disponibilidad que no se nota es la que se mantiene.</div>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-border bg-card p-4">
          <Cap>Lo que costó</Cap>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <div className="text-display tabular-nums text-ink-crit">
                {fmtInt(totalFallaMin)}<span className="text-[15px] font-semibold"> min</span>
              </div>
              <div className="text-footnote text-muted-foreground">
                falla técnica{conFalla[0] ? ` · ${Math.round((conFalla[0].reparto.falla / ventanaMin) * 100)}% del turno de ${nombreCorto(conFalla[0].maquina.machineName)}` : ''}
              </div>
            </div>
            {conFalla[0] && conFalla[0].kpi.grupos.falla && (
              <Pill tone="critical" className="tabular-nums normal-case">
                {Object.entries(conFalla[0].kpi.grupos.falla.causas)
                  .sort((a, b) => b[1] - a[1])
                  .map(([c, s]) => `${c} ${fmtInt(s / 60)}`)
                  .join(' + ')}
              </Pill>
            )}
          </div>
          <div className="mt-2 space-y-1 border-t border-border/50 pt-2 text-[13px]">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Línea completa abajo</span>
              <span className="tabular-nums"><b>{fmtInt(linea.caidaTotalMin)} min</b> · <span className="text-ink-crit">{fmtInt(linea.caidaNoPlanificadaMin)} no planificados</span></span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Piezas estimadas</span>
              <span className="tabular-nums"><b>≈ {fmtInt(pzFalla)} pz</b></span>
            </div>
            <p className="text-caption text-muted-foreground/80">
              Estimadas al ritmo andando demostrado de cada máquina, no al target del sensor.
            </p>
          </div>
        </section>
      </div>

      {/* ── Reparto del turno ── */}
      <section className="rounded-card border border-border bg-card p-4">
        <Cap>Reparto del turno · {fmtInt(ventanaMin)} min por máquina</Cap>
        <div className="mt-3 space-y-4">
          {porMaquina.map((x) => <BarraReparto key={x.maquina.machineid} x={x} ventanaMin={ventanaMin} />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/50 pt-2.5 text-caption text-muted-foreground/80">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILL.falla }} />Falla técnica</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILL.micro }} />Micro</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILL.externo }} />Externo</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILL.planificado }} />Planificado</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILL.produccion }} />Produciendo</span>
        </div>
        <p className="mt-1.5 text-caption text-muted-foreground/80">
          Las {porMaquina.length} barras miden el mismo turno y arrancan por falla técnica: el bloque rojo se compara de un vistazo.
        </p>
      </section>

      {/* ── El evento del turno ── */}
      {eventoMayor && (
        <section className="rounded-card border border-border bg-card p-4">
          <Cap>El evento del turno</Cap>
          <div className="mt-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-headline text-foreground">{eventoMayor.causas.join(' + ')} · {nombreCorto(eventoMayor.maquina)}</div>
              <div className="text-footnote tabular-nums text-muted-foreground">
                {hh(eventoMayor.desde)} → {hh(eventoMayor.hasta)} · {fmtInt(eventoMayor.sec / 60)} min de falla
              </div>
            </div>
            <Pill tone="critical" className="tabular-nums normal-case">
              1 evento · {eventoMayor.paros} paro{eventoMayor.paros === 1 ? '' : 's'}
            </Pill>
          </div>
          <div className="mt-3">
            <EventoLane evento={eventoMayor} fallas={fallasDelMayor} />
          </div>
        </section>
      )}

      {/* ── Target sospechoso: aviso de DATO, no acusación ── */}
      {sospechosas.map((x) => (
        <section key={x.maquina.machineid} className="rounded-card border border-border bg-card p-4">
          <Cap><AlertTriangle className="h-3 w-3 text-ink-info" />Dato por verificar</Cap>
          <p className="mt-2 text-[13px] leading-snug text-foreground">
            El esperado de <b>{nombreCorto(x.maquina.machineName)}</b>{' '}
            (<span className="tabular-nums">{x.velocidad.esperadoCpm != null ? fmtInt(x.velocidad.esperadoCpm) : '—'} pz/min</span>)
            no calza con su techo demostrado{' '}
            (mediana <span className="tabular-nums">{x.velocidad.medianaAndandoCpm != null ? fmtInt(x.velocidad.medianaAndandoCpm) : '—'}</span>):
            solo el <span className="tabular-nums">{x.velocidad.pctLleno != null ? Math.round(x.velocidad.pctLleno) : '—'}%</span>{' '}
            de sus tramos andando alcanza el 90% del target.
          </p>
          <p className="mt-1 text-caption leading-snug text-muted-foreground">
            O el set point está en la máquina equivocada o la máquina viene degradada — ninguna de las
            dos se afirma sin terreno. Mientras tanto, su % de cumplimiento queda fuera de los rankings.
          </p>
          <p className="mt-1.5 text-[13px] font-medium text-ink-info">
            → Verificar el set point con Producción.
          </p>
        </section>
      ))}

      {/* ── La tendencia: la alerta temprana que justifica todo esto ── */}
      {shiftId && dateKey && (
        <TendenciaMantencion plantSlug={plantSlug} shiftId={shiftId} hastaDateKey={dateKey} />
      )}
    </div>
  )
}
