/**
 * «Lotes del turno» (mockup v4, tarjeta 5): barra del turno con los lotes y el hueco del espejo, la lista de lotes y
 * su ficha (Sheet) con la comparación contra el lote anterior. Las cuentas viven en `lotesTurnoDatos.ts`.
 */
import { Package } from 'lucide-react'
import { Sheet } from '@/components/piel'
import { cn } from '@/lib/utils'
import { coma1, horaDelEje, milesPunto } from '@/services/grader/espejo/alertasGrader'
import { CALIBRES_LB } from '@/services/grader/espejo/pescaVivo'
import { Tarjeta } from './TarjetaVivo'
import { Barra, Seccion } from './PorQueP0'
import { rotuloCalibres } from './hayQueHacerDatos'
import { loteLegible, type FilaLote, type FilaLotes } from './lotesTurnoDatos'

const IC = 'h-3.5 w-3.5'
const kg2 = (v: number | null) => (v === null ? '—' : `${v.toFixed(2).replace('.', ',')} kg`) // decimal-tecnico: ya pasa a coma
/** El lote par se pinta en acento suave; el impar, en acento lleno (como el mockup). */
const colorLote = (k: number) => (k % 2 === 1 ? 'var(--v2-acento)' : 'color-mix(in srgb, var(--v2-acento) 45%, transparent)')

function Etiqueta({ children, aviso }: { children: React.ReactNode; aviso?: boolean }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[12px] font-semibold leading-4"
      style={aviso ? { background: 'var(--v2-reja)', color: 'var(--v2-atento-texto)' } : { background: 'var(--v2-reja)', color: 'rgb(var(--foreground))' }}
    >
      {children}
    </span>
  )
}

const hasta = (f: FilaLote, t0Ms: number) => (f.enCurso ? 'ahora' : horaDelEje(t0Ms, f.hastaMin))

export function LotesDelTurno({ filas, t0Ms, hastaMin, onAbrir }: { filas: readonly FilaLotes[]; t0Ms: number; hastaMin: number; onAbrir: (k: number) => void }) {
  const lotes = filas.filter((f): f is FilaLote => f.tipo === 'lote')
  if (lotes.length === 0) return null
  const ini = lotes[0]!.desdeMin
  const span = Math.max(1, hastaMin - ini)
  const pos = (a: number, b: number) => ({ left: `${((a - ini) / span) * 100}%`, width: `${Math.max(0.5, ((b - a) / span) * 100)}%` })
  return (
    <Tarjeta titulo="Lotes del turno" icono={<Package className={IC} />}>
      <div className="relative mt-3.5 h-3.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {filas.map((f) => (
          <span key={`${f.tipo}-${f.desdeMin}`} className="absolute inset-y-0" style={{ ...pos(f.desdeMin, f.hastaMin), background: f.tipo === 'lote' ? colorLote(f.k) : 'var(--v2-reja)' }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] leading-4 text-muted-foreground tabular-nums">
        <span>{horaDelEje(t0Ms, ini)}</span>
        <span>{horaDelEje(t0Ms, hastaMin)}</span>
      </div>
      <ul className="mt-2" data-testid="lotes-turno">
        {filas.map((f, i) => f.tipo === 'hueco' ? (
          <li key={`h-${f.desdeMin}`} className={cn('grid grid-cols-[12px_1fr_auto] items-center gap-2.5 py-2.5 text-[13px] text-muted-foreground', i > 0 && 'border-t border-border/60')}>
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] border border-dashed" style={{ borderColor: 'var(--v2-gris)' }} />
            <div>
              <p>Sin lectura</p>
              <p className="tabular-nums">{horaDelEje(t0Ms, f.desdeMin)} → {horaDelEje(t0Ms, f.hastaMin)}{f.cambio ? ' · cambio de lote' : ''}</p>
            </div>
            <p className="text-right">—</p>
          </li>
        ) : (
          <li key={`l-${f.k}`} className={cn(i > 0 && 'border-t border-border/60')}>
            <button
              type="button"
              onClick={() => onAbrir(f.k)}
              className="grid min-h-[44px] w-full grid-cols-[12px_1fr_auto] items-center gap-2.5 rounded-[10px] py-2.5 text-left text-[13px] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorLote(f.k) }} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tabular-nums text-foreground">
                  {loteLegible(f.lote)}
                  {f.enCurso && <Etiqueta>en curso</Etiqueta>}
                  {f.cmp?.distinto && <Etiqueta aviso>lote distinto</Etiqueta>}
                </p>
                <p className="tabular-nums text-muted-foreground">
                  {horaDelEje(t0Ms, f.desdeMin)} → {hasta(f, t0Ms)} · {kg2(f.t.perfil.pesoMedioKg)} · {f.t.perfil.dominantePeso ? rotuloCalibres([f.t.perfil.dominantePeso.calibre]) : '—'}
                </p>
              </div>
              <p className="text-right font-semibold tabular-nums text-foreground">
                {milesPunto(f.piezas)} pz
                <small className="block text-[12px] font-normal text-muted-foreground">{milesPunto(Math.round(f.t.perfil.kg))} kg</small>
              </p>
            </button>
          </li>
        ))}
      </ul>
      <details className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
        <summary className="cursor-pointer select-none">El cambio de lote</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Un lote empieza con 30 piezas seguidas; una pieza suelta de otro lote no lo corta.</li>
          <li>Calibre por el peso de cada pieza (cada 2 lb): lo que trae el pescado, no el programa de las gates.</li>
          <li>«Lote distinto»: el peso medio cambia ±10 % o un calibre sube 10 puntos contra el lote anterior. kg = salida, sin Gate 0.</li>
        </ul>
      </details>
    </Tarjeta>
  )
}

/** La ficha de un lote: aviso si es distinto, cifras, calibre (con el anterior entre paréntesis) y calidad. */
export function HojaLote({ filas, k, t0Ms, onCerrar }: { filas: readonly FilaLotes[]; k: number | null; t0Ms: number; onCerrar: () => void }) {
  const lotes = filas.filter((f): f is FilaLote => f.tipo === 'lote')
  const f = k === null ? undefined : lotes.find((x) => x.k === k)
  const ant = f && f.k > 0 ? lotes.find((x) => x.k === f.k - 1) : undefined
  const p = f?.t.perfil
  const c = f?.cmp
  const mx = p ? Math.max(1, ...CALIBRES_LB.map((x) => p.calibrePesoPct[x] ?? 0)) : 1
  const pct0 = (v: number | undefined) => `${Math.round(v ?? 0)} %`
  return (
    <Sheet
      open={!!f}
      onClose={onCerrar}
      title={f ? `Lote ${loteLegible(f.lote)}` : ''}
      description={f ? `${horaDelEje(t0Ms, f.desdeMin)} → ${hasta(f, t0Ms)}${f.enCurso ? ' · en curso' : ''}` : ''}
      surface="grouped"
    >
      {f && p && (
        <div className="v2-vars space-y-3 pb-4" data-testid="hoja-lote">
          {c?.distinto && ant && (
            <section className="rounded-[14px] bg-card p-4 text-[13px] leading-[18px]" style={{ boxShadow: 'inset 3px 0 0 var(--v2-atento)' }}>
              <p className="font-semibold text-foreground">Lote distinto</p>
              <p className="mt-1 text-muted-foreground tabular-nums">
                {c.sube && `${rotuloCalibres([c.sube.calibre])} pasa de ${pct0(c.sube.antes)} a ${pct0(c.sube.pct)}`}
                {c.sube && c.baja && c.baja.calibre !== c.sube.calibre && ` y ${rotuloCalibres([c.baja.calibre])} de ${pct0(c.baja.antes)} a ${pct0(c.baja.pct)}`}
                {c.sube ? '. ' : ''}
                {c.pesoPct !== null && `Peso ${c.pesoPct < 0 ? '−' : '+'}${coma1(Math.abs(c.pesoPct))} %.`}
              </p>
              <p className="mt-1.5 font-semibold text-foreground">{c.sube ? `Revisar gates de ${rotuloCalibres([c.sube.calibre])}` : 'Revisar gates'}</p>
            </section>
          )}
          <section className="grid grid-cols-3 gap-3 rounded-[14px] bg-card p-4">
            {[['Piezas', milesPunto(f.piezas)], ['kg', milesPunto(Math.round(p.kg))], ['Promedio', kg2(p.pesoMedioKg)]].map(([k2, v]) => (
              <div key={k2} className="min-w-0">
                <p className="text-[12px] leading-4 text-muted-foreground">{k2}</p>
                <p className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-foreground">{v}</p>
              </div>
            ))}
          </section>
          <Seccion titulo="Por calibre">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(48px,40%)_auto] items-center gap-x-2 gap-y-1.5">
              {CALIBRES_LB.map((x) => {
                const v = p.calibrePesoPct[x] ?? 0
                return (
                  <Barra
                    key={x}
                    rotulo={rotuloCalibres([x])}
                    pct={(v / mx) * 100}
                    color="var(--v2-acento)"
                    n={`${Math.round(v)} %${ant ? ` (${Math.round(ant.t.perfil.calibrePesoPct[x] ?? 0)})` : ''}`}
                  />
                )
              })}
            </div>
            {ant && <p className="mt-2 text-[12px] leading-4 text-muted-foreground">Entre paréntesis, el lote anterior. Por el peso de cada pieza.</p>}
          </Seccion>
          <Seccion titulo="Por calidad">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(48px,40%)_auto] items-center gap-x-2 gap-y-1.5">
              {Object.entries(p.calidadPct).sort((a, b) => b[1] - a[1]).map(([q, v]) => (
                <Barra key={q} rotulo={q} pct={v} color="var(--v2-acento)" n={`${coma1(v)} %`} />
              ))}
            </div>
          </Seccion>
        </div>
      )}
    </Sheet>
  )
}
