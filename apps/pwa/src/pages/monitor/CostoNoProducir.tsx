/**
 * Costo de no producir, en pesos, dentro del monitor con sesión.
 *
 * Tres tarjetas (mockup aprobado: `_IDEAS/mockup-costo-no-producir.html`, opción A):
 *  a) Costo de lo detenido: piezas del turno × kg por pieza × margen por kg.
 *  b) Evitado por reparar rápido (solo Mantención), contra lo habitual de cada causa.
 *  c) Cada detención, con su dueño, minutos, piezas y pesos.
 *
 * ⚠ Nunca supone un margen ni un peso: si falta, lo dice y no pinta cifras en
 * pesos. Los márgenes se leen UNA vez por apertura (sin onSnapshot: techo de
 * costos del proyecto). Lo calcula `costoNoProducir.ts`; aquí solo se muestra.
 */
import { useEffect, useMemo, useState } from 'react'
import { Bloque } from './MonitorShiftParts'
import { DUENO_UI } from './duenoUi'
import { causaLegible } from './ritmoVivo'
import { motivoEnEspanol } from '@/services/shoplogix/shoplogixColors'
import { DUENO_META, type DuenoPerdida, type GrupoDelTurno } from '@/services/shoplogix/monitorEventos'
import {
  CASOS_MINIMOS,
  costoEnPesos,
  evitadoPorRepararRapido,
  fmtPesos,
  habitualPorCausa,
  margenClpPorKg,
  type ConfigCostoNoProducir,
  type CostoEnPesos,
  type Moneda,
} from '@/services/shoplogix/costoNoProducir'
import { guardarMargen, leerConfigCostoNoProducir } from '@/services/shoplogix/costoNoProducirConfig'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface CostoNoProducirProps {
  grupos: GrupoDelTurno[]
  pesoKg: number | null
  lineId: string | null
  lineLabel: string | null
  dateKey: string | null
  turnosAnteriores: Array<{ causas?: Array<{ reason: string; min: number; count: number }> | null }>
  puedeEditar: boolean
  autor: string
}

const ORDEN_DUENOS: DuenoPerdida[] = ['mantencion', 'externo', 'sin-imputar']

/** Piezas a la decena, con «≈», como toda cifra valorizada del monitor. */
function fmtPiezas(n: number): string {
  return `≈ ${(Math.round(n / 10) * 10).toLocaleString('es-CL')} pz`
}

function fmtDecimal(n: number, dec = 1): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtFechaCorta(aaaammdd: string): string {
  const [a, m, d] = aaaammdd.split('-')
  return a && m && d ? `${d}-${m}-${a}` : aaaammdd
}

function nombreCausa(reason: string): string {
  return causaLegible(motivoEnEspanol(reason)) ?? reason
}

function plural(n: number, uno: string, muchos: string): string {
  return `${n} ${n === 1 ? uno : muchos}`
}

interface FilaDetencion {
  reason: string
  dueno: DuenoPerdida
  min: number
  piezas: number
  pesos?: number
}

/** Sin valorizar: las mismas filas que `costoEnPesos`, para mostrar piezas aunque falte el margen. */
function filasDe(grupos: GrupoDelTurno[]): FilaDetencion[] {
  const out: FilaDetencion[] = []
  for (const g of grupos) {
    if (g.dueno === 'programado' || g.piezas == null) continue
    for (const c of g.causas) {
      if (c.piezas == null || !(c.piezas > 0)) continue
      out.push({ reason: c.reason, dueno: g.dueno, min: c.min, piezas: c.piezas })
    }
  }
  return out.sort((a, b) => b.piezas - a.piezas)
}

export function CostoNoProducir(props: CostoNoProducirProps) {
  const { grupos, pesoKg, lineId, lineLabel, dateKey, turnosAnteriores, puedeEditar, autor } = props
  const [cfg, setCfg] = useState<ConfigCostoNoProducir | null>(null)
  const [cargada, setCargada] = useState(false)
  const [editando, setEditando] = useState(false)

  /* Una lectura por apertura: cambiar de turno no vuelve a leer. */
  useEffect(() => {
    let vivo = true
    leerConfigCostoNoProducir().then((c) => {
      if (!vivo) return
      setCfg(c)
      setCargada(true)
    })
    return () => { vivo = false }
  }, [])

  const margen = useMemo(() => margenClpPorKg(cfg, lineId, dateKey), [cfg, lineId, dateKey])
  const clpPorKg = margen?.clpPorKg ?? null
  const costo = useMemo(
    () => costoEnPesos({ grupos, pesoKg, clpPorKg }),
    [grupos, pesoKg, clpPorKg],
  )
  const habitual = useMemo(() => habitualPorCausa(turnosAnteriores), [turnosAnteriores])
  const evitado = useMemo(
    () => evitadoPorRepararRapido({ grupos, habitual, pesoKg, clpPorKg }),
    [grupos, habitual, pesoKg, clpPorKg],
  )

  if (!cargada || !cfg) return null
  if (costo == null) return null

  const valorizado: CostoEnPesos | null = 'total' in costo ? costo : null
  const faltaMargen = 'falta' in costo && costo.falta === 'margen'
  const faltaPeso = 'falta' in costo && costo.falta === 'peso'
  const totalMin = valorizado ? valorizado.total.min : grupos.filter((g) => g.dueno !== 'programado').reduce((s, g) => s + (g.piezas != null ? g.min : 0), 0)
  const totalPz = valorizado
    ? valorizado.total.piezas
    : grupos.reduce((s, g) => s + (g.dueno !== 'programado' && g.piezas != null ? g.piezas : 0), 0)
  const filas: FilaDetencion[] = valorizado ? valorizado.detenciones : filasDe(grupos)

  const origenTexto = margen
    ? `Margen $${Math.round(margen.clpPorKg).toLocaleString('es-CL')}/kg vigente desde ${fmtFechaCorta(margen.origen.vigenteDesde)}${pesoKg ? ` · peso ${Math.round(pesoKg * 1000).toLocaleString('es-CL')} g` : ''}`
    : null

  return (
    <div className="lg:col-span-6">
      <Bloque
        id="costo-no-producir"
        titulo="Costo de no producir"
        extra={valorizado ? <span className="tabular-nums font-semibold text-foreground">{fmtPesos(valorizado.total.pesos)}</span> : null}
      >
        <div className="mt-3 space-y-3">
          {/* a) Costo de lo detenido */}
          <article className={`rounded-card border p-3 ${faltaMargen || faltaPeso ? 'border-dashed border-border bg-muted/40' : 'border-border bg-muted/30'}`}>
            <p className="text-[11px] text-muted-foreground">Costo de lo detenido</p>
            {valorizado ? (
              <>
                <p className="mt-0.5 text-[28px] font-bold leading-tight tabular-nums text-foreground">{fmtPesos(valorizado.total.pesos)}</p>
                <p className="text-[12px] text-muted-foreground tabular-nums">
                  {`${Math.round(valorizado.total.min)} min de línea → ${fmtPiezas(valorizado.total.piezas)} → ≈ ${fmtDecimal(valorizado.total.kg / 1000)} t × $${Math.round(clpPorKg ?? 0).toLocaleString('es-CL')}/kg`}
                </p>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-border" role="img" aria-label="Reparto del costo por dueño">
                  {ORDEN_DUENOS.map((d) => {
                    const p = valorizado.porDueno.find((x) => x.dueno === d)
                    if (!p || valorizado.total.pesos <= 0) return null
                    return <i key={d} className={`block h-full ${DUENO_UI[d].barra}`} style={{ width: `${(p.pesos / valorizado.total.pesos) * 100}%` }} />
                  })}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-muted-foreground">
                  {valorizado.porDueno.map((p) => (
                    <li key={p.dueno} className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${DUENO_UI[p.dueno].barra}`} aria-hidden="true" />
                      {`${DUENO_META[p.dueno].label} ${fmtPesos(p.pesos)}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-[22px] font-bold tabular-nums text-foreground">{`${fmtPiezas(totalPz)} · ${Math.round(totalMin)} min`}</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {faltaMargen
                    ? 'Falta el margen de esta línea para mostrarlo en pesos.'
                    : 'Falta el peso promedio del turno (nadie cargó la cuota).'}
                </p>
                {faltaMargen && puedeEditar && (
                  <button type="button" onClick={() => setEditando(true)} className="tap-44 mt-2 rounded-ctl border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground">
                    Definir margen
                  </button>
                )}
              </>
            )}
            {origenTexto && (
              <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                {origenTexto}
                {puedeEditar && (
                  <>
                    {' · '}
                    <button type="button" onClick={() => setEditando(true)} className="underline underline-offset-2">Cambiar margen</button>
                  </>
                )}
              </p>
            )}
          </article>

          {/* b) Evitado por reparar rápido (solo si hubo detenciones de Mantención y se puede valorizar) */}
          {valorizado && evitado && (
            <article className="rounded-card border border-border bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">Evitado por reparar rápido · Mantención</p>
              {evitado.causas.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-muted-foreground">Aún no hay historia suficiente para comparar (mínimo 5 casos por causa).</p>
              ) : (
                <>
                  <p className="mt-0.5 text-[24px] font-bold tabular-nums text-foreground">{fmtPesos(evitado.evitado.pesos)}</p>
                  <p className="text-[12.5px] text-muted-foreground tabular-nums">
                    {evitado.evitado.eventos === 0
                      ? 'Ninguna detención resuelta antes de lo habitual'
                      : `${plural(evitado.evitado.eventos, 'detención resuelta', 'detenciones resueltas')} ${Math.round(evitado.evitado.min)} min antes de lo habitual`}
                  </p>
                </>
              )}
              {evitado.sobre.eventos > 0 && (
                <p className="mt-2 border-t border-border pt-2 text-[12px] text-muted-foreground tabular-nums">
                  {`Sobre lo habitual: ${plural(evitado.sobre.eventos, 'detención', 'detenciones')}, ${Math.round(evitado.sobre.min)} min, ${fmtPesos(evitado.sobre.pesos)}. Se muestra aparte, no se resta.`}
                </p>
              )}
            </article>
          )}

          {/* c) Cada detención */}
          <article className="rounded-card border border-border bg-muted/30 p-3">
            <p className="mb-1 text-[11px] text-muted-foreground">Cada detención</p>
            <ul className="divide-y divide-border">
              {filas.map((f, i) => {
                const contra = evitado?.causas.find((c) => c.reason === f.reason)
                const h = habitual.get(f.reason)
                const conRef = f.dueno === 'mantencion' && contra != null && h != null && valorizado != null
                return (
                  <li key={`${f.reason}-${i}`} className="flex items-start justify-between gap-3 py-2 text-[13.5px]">
                    <div className="min-w-0">
                      <p className="text-foreground">{nombreCausa(f.reason)}</p>
                      <p className={`text-[11.5px] ${DUENO_UI[f.dueno].clase}`}>{`${DUENO_META[f.dueno].label} · ${Math.round(f.min)} min · ${fmtPiezas(f.piezas)}`}</p>
                      {conRef && contra && h && (
                        <p className="text-[11.5px] text-muted-foreground tabular-nums">
                          {`Habitual ${Math.round(h.min)} min (${plural(h.casos, 'caso', 'casos')})`}
                          {contra.bajo.eventos > 0 && ` · evitó ${fmtPesos(contra.bajo.pesos)}`}
                          {contra.sobre.eventos > 0 && ` · ${Math.round(contra.sobre.min)} min sobre`}
                        </p>
                      )}
                    </div>
                    {f.pesos != null && valorizado && (
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">{fmtPesos(f.pesos)}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 border-t border-border pt-2 text-[12px] text-muted-foreground">
              {'Colación, reuniones y lo programado no entran: ahí no se pierde producción. «Habitual» es lo que esa misma causa duró en promedio en los turnos anteriores cargados; con menos de ' + CASOS_MINIMOS + ' casos no se calcula.'}
            </p>
          </article>
        </div>
      </Bloque>

      {puedeEditar && (
        <EditorMargen
          abierto={editando}
          onCerrar={() => setEditando(false)}
          lineId={lineId}
          lineLabel={lineLabel}
          dateKey={dateKey}
          autor={autor}
          tipoCambioActual={cfg.tipoCambioClpPorUsd}
          onGuardado={(nueva) => { setCfg(nueva); setEditando(false) }}
        />
      )}
    </div>
  )
}

interface EditorMargenProps {
  abierto: boolean
  onCerrar: () => void
  lineId: string | null
  lineLabel: string | null
  dateKey: string | null
  autor: string
  tipoCambioActual: number | null
  onGuardado: (cfg: ConfigCostoNoProducir) => void
}

function EditorMargen({ abierto, onCerrar, lineId, lineLabel, dateKey, autor, tipoCambioActual, onGuardado }: EditorMargenProps) {
  const [margen, setMargen] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('CLP')
  const [tipoCambio, setTipoCambio] = useState(tipoCambioActual ? String(tipoCambioActual) : '')
  const [vigente, setVigente] = useState(dateKey ? dateKey.slice(0, 10) : '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const numero = (s: string) => Number(s.replace(',', '.').trim())

  async function guardar() {
    setError(null)
    if (!lineId) { setError('Falta la línea a la que corresponde el margen.'); return }
    setGuardando(true)
    try {
      const nueva = await guardarMargen({
        lineId,
        margenPorKg: numero(margen),
        moneda,
        vigenteDesde: vigente,
        tipoCambioClpPorUsd: moneda === 'USD' ? numero(tipoCambio) : null,
        autor,
      })
      onGuardado(nueva)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el margen.')
    } finally {
      setGuardando(false)
    }
  }

  const campo = 'w-full rounded-ctl border border-border bg-muted/40 px-3 py-2 text-[14px] text-foreground tabular-nums'

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Margen por kilo</DialogTitle>
          <DialogDescription>Un turno pasado se valoriza con el margen que regía ese día. Cada cambio queda con fecha y autor.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-[14px]">
          <label className="block">
            <span className="text-[12px] text-muted-foreground">Línea</span>
            <p className="mt-1 text-foreground">{lineLabel ?? lineId ?? '—'}</p>
          </label>
          <label className="block">
            <span className="text-[12px] text-muted-foreground">Margen por kilo</span>
            <input className={campo} inputMode="decimal" value={margen} onChange={(e) => setMargen(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[12px] text-muted-foreground">Moneda</span>
            <select className={campo} value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
          </label>
          {moneda === 'USD' && (
            <label className="block">
              <span className="text-[12px] text-muted-foreground">Tipo de cambio (CLP por USD)</span>
              <input className={campo} inputMode="decimal" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className="text-[12px] text-muted-foreground">Vigente desde</span>
            <input className={campo} type="date" value={vigente} onChange={(e) => setVigente(e.target.value)} />
          </label>
          {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-ctl border border-border px-3.5 py-2 text-[13px] font-semibold text-foreground">Cancelar</button>
          <button type="button" disabled={guardando} onClick={guardar} className="rounded-ctl bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
            Guardar margen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
