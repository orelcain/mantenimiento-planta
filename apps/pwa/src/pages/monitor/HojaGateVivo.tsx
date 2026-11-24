/**
 * Hoja de una gate (tanda 2, opción B «Puntos por minuto» aprobada por Orel): arriba la curva de pesos de la última
 * hora sobre el rango de su programa, con el conteo hacia el mínimo, hacia el máximo y sobre el tope; debajo, una
 * tira por minuto con un punto por pieza. Gate 0 usa un eje de 0,5 a 6 kg y el color del dueño del P0.
 *
 * Se abre desde «Seteo de las gates» y desde «A qué gate fueron» de la hoja de un minuto. Las cuentas viven en
 * `services/grader/espejo/detalleGateVivo.ts`; aquí solo se dibuja.
 */
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { milesPunto } from '@/services/grader/espejo/alertasGrader'
import { kgALbTxt, type DetalleGate, type MinutoGate, type RangoLbKg } from '@/services/grader/espejo/detalleGateVivo'
import { acentoAl, FONDO_SUB, hhmm, kg2, programaTxt } from './formatoGateVivo'
import type { ArmadoGate } from './hojaGateDatos'

const lb = (n: number | null) => (n === null ? 'UP' : String(n))
/** Los calibres nominales de Gate 0 en kg (el fondo del eje, como las bandas de las gates). */
const BANDAS_G0: Array<[number, number]> = [[2, 4], [4, 6], [6, 8], [8, 10], [10, 12]]
const KG_LB = 0.453592

const GRUPO = 'rounded-card bg-card p-4'
const sobreTope = 'var(--v2-atento)'

/** Posición de un peso en el eje, en %. */
const enEje = (kg: number, eje: [number, number]) => Math.min(100, Math.max(0, ((kg - eje[0]) / (eje[1] - eje[0])) * 100))

function Curva({ det, rango, g0 }: { det: DetalleGate; rango: RangoLbKg | null; g0?: boolean }) {
  const alto = 72
  const mx = Math.max(1, ...det.curva.map((c) => c.n))
  const x = (kg: number) => enEje(kg, det.eje)
  const ancho = (det.paso / (det.eje[1] - det.eje[0])) * 100
  return (
    <div className="relative" style={{ height: alto }} role="img" aria-label="Pesos de la última hora">
      {g0
        ? BANDAS_G0.map(([l, h]) => <span key={l} className="absolute inset-y-0 rounded-[3px]" style={{ left: `${x(l * KG_LB)}%`, width: `calc(${x(h * KG_LB) - x(l * KG_LB)}% - 2px)`, background: FONDO_SUB }} />)
        : rango && (
          <>
            <span className="absolute inset-y-0 rounded-t-[6px]" style={{ left: `${x(rango.loKg)}%`, width: `${(rango.hiKg === null ? 100 : x(rango.hiKg)) - x(rango.loKg)}%`, background: acentoAl(13) }} />
            {rango.hiKg !== null && <span className="absolute inset-y-0 right-0 rounded-t-[6px]" style={{ left: `${x(rango.hiKg)}%`, background: 'color-mix(in srgb, var(--v2-atento) 16%, transparent)' }} />}
          </>
        )}
      {det.curva.filter((c) => c.n > 0).map((c) => {
        const encima = rango?.hiKg != null && c.kg >= rango.hiKg - 1e-6
        return (
          <i
            key={c.kg}
            className="absolute bottom-0 rounded-t-[3px]"
            style={{ left: `${x(c.kg)}%`, width: `calc(${ancho}% - ${g0 ? 1 : 2}px)`, minWidth: 3, height: Math.max(2, (c.n / mx) * (alto - 4)), background: g0 ? 'var(--v2-mal)' : encima ? sobreTope : 'var(--v2-acento)' }}
          />
        )
      })}
    </div>
  )
}

function Rotulos({ rango, eje }: { rango: RangoLbKg; eje: [number, number] }) {
  const x = (kg: number) => enEje(kg, eje)
  const medio = rango.hiKg === null ? null : (rango.loKg + rango.hiKg) / 2
  return (
    <div className="relative mt-1 h-[34px] border-t border-border">
      <span className="absolute top-0.5 -translate-x-1/2 text-center text-nota tabular-nums" style={{ left: `${x(rango.loKg)}%` }}>
        <b>{lb(rango.loLb)} lb</b><br /><span className="text-muted-foreground">{kg2(rango.loKg)}</span>
      </span>
      {medio !== null && rango.hiLb !== null && (
        <span className="absolute top-0.5 -translate-x-1/2 text-center text-nota tabular-nums text-muted-foreground" style={{ left: `${x(medio)}%` }}>
          {(rango.loLb + rango.hiLb) / 2}<br />{kg2(medio)}
        </span>
      )}
      {rango.hiKg !== null && (
        <span className="absolute top-0.5 -translate-x-1/2 text-center text-nota tabular-nums" style={{ left: `${x(rango.hiKg)}%` }}>
          <b>{lb(rango.hiLb)} lb</b><br /><span className="text-muted-foreground">{kg2(rango.hiKg)} kg</span>
        </span>
      )}
    </div>
  )
}

function EjeG0({ eje }: { eje: [number, number] }) {
  const x = (kg: number) => enEje(kg, eje)
  return (
    <>
      <div className="relative h-[18px] border-t border-border">
        {BANDAS_G0.map(([l, h]) => (
          <span key={l} className="absolute top-0.5 -translate-x-1/2 text-nota tabular-nums text-muted-foreground" style={{ left: `${x(((l + h) / 2) * KG_LB)}%` }}>{l}-{h}</span>
        ))}
      </div>
      <div className="relative h-4">
        {[1, 2, 3, 4, 5, 6].map((k) => (
          <span key={k} className={cn('absolute text-nota tabular-nums text-muted-foreground', k === 6 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${x(k)}%` }}>{k}{k === 6 ? ' kg' : ''}</span>
        ))}
      </div>
    </>
  )
}

function Reparto({ det, rango }: { det: DetalleGate; rango: RangoLbKg }) {
  const r = det.reparto
  if (!r) return <p className="mt-3 text-footnote text-muted-foreground">{lb(rango.loLb)}-UP lb no tiene tope: no hay reparto entre el mínimo y el máximo.</p>
  const t = r.haciaMin + r.haciaMax + r.sobre
  const pct = (n: number) => (t > 0 ? Math.round((n / t) * 100) : 0)
  const col = (n: number, rot: string) => (
    <div>
      <b className="block text-headline tabular-nums">{milesPunto(n)}</b>
      <span className="text-nota text-muted-foreground tabular-nums">{rot} · <span className="whitespace-nowrap">{pct(n)} %</span></span>
    </div>
  )
  return (
    <>
      <div className="mt-3.5 flex h-2.5 gap-0.5" role="img" aria-label={`${r.haciaMin} hacia el ${lb(rango.loLb)}, ${r.haciaMax} hacia el ${lb(rango.hiLb)}, ${r.sobre} sobre el ${lb(rango.hiLb)}`}>
        <i className="block rounded-full" style={{ flex: Math.max(r.haciaMin, 0.001), background: 'var(--v2-acento)', opacity: 0.55 }} />
        <i className="block rounded-full" style={{ flex: Math.max(r.haciaMax, 0.001), background: 'var(--v2-acento)' }} />
        <i className="block rounded-full" style={{ flex: Math.max(r.sobre, 0.001), background: sobreTope }} />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {col(r.haciaMin, `hacia el ${lb(rango.loLb)}`)}
        {col(r.haciaMax, `hacia el ${lb(rango.hiLb)}`)}
        {col(r.sobre, `sobre el ${lb(rango.hiLb)}`)}
      </div>
    </>
  )
}

/** Una tira por minuto: un punto por pieza sobre el mismo eje; al tocarla se ven los pesos. */
function TiraMinuto({ m, eje, rango, g0, programa }: { m: MinutoGate; eje: [number, number]; rango: RangoLbKg | null; g0: boolean; programa: string | null }) {
  const x = (kg: number) => enEje(kg, eje)
  const sinPunto = m.piezas - m.puntos.reduce((s, p) => s + p.cantidad, 0)
  return (
    <details className="group">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
        <span className="w-[38px] shrink-0 text-footnote tabular-nums text-muted-foreground">{m.hora}</span>
        <span className="relative h-4 flex-1 rounded-full" style={{ background: FONDO_SUB }}>
          {g0
            ? BANDAS_G0.map(([l, h]) => <span key={l} className="absolute inset-y-[3px] rounded-full" style={{ left: `${x(l * KG_LB)}%`, width: `calc(${x(h * KG_LB) - x(l * KG_LB)}% - 2px)`, background: FONDO_SUB }} />)
            : rango && <span className="absolute inset-y-0" style={{ left: `${x(rango.loKg)}%`, width: `${(rango.hiKg === null ? 100 : x(rango.hiKg)) - x(rango.loKg)}%`, background: acentoAl(13) }} />}
          {m.puntos.map((p, i) => {
            const color = g0 ? (p.dueno === 'mantencion' ? 'var(--v2-mant)' : p.dueno === 'seteo' ? 'var(--v2-ext)' : 'var(--v2-gris)') : rango?.hiKg != null && p.kg >= rango.hiKg ? sobreTope : 'var(--v2-acento)'
            return <i key={i} className="absolute top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full" style={{ left: `${x(p.kg)}%`, background: color, boxShadow: '0 0 0 1.5px rgb(var(--card))' }} />
          })}
        </span>
        <span className="w-[34px] shrink-0 text-right text-footnote tabular-nums">{m.piezas} pz</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="pb-2.5 pl-12">
        {g0 ? (
          <ul className="space-y-0.5">
            {m.puntos.map((p, i) => (
              <li key={i} className="text-footnote tabular-nums"><b>{kg2(p.kg)} kg</b> <span className="text-muted-foreground">· {kgALbTxt(p.kg)} · {p.motivo ?? 'Sin motivo'}{p.calidad ? ` · ${p.calidad}` : ''}</span></li>
            ))}
          </ul>
        ) : (
          <>
            <p className="flex flex-wrap gap-x-2.5 gap-y-1">
              {m.puntos.map((p, i) => (
                <span key={i} className="text-footnote tabular-nums" style={rango?.hiKg != null && p.kg >= rango.hiKg ? { color: 'var(--v2-atento-texto)' } : undefined}>{kg2(p.kg)} <span className="text-nota text-muted-foreground">{kgALbTxt(p.kg)}</span></span>
              ))}
            </p>
            <p className="mt-0.5 text-nota text-muted-foreground">kg y lb{programa ? ` · ${programaTxt(programa)}` : ''}{sinPunto > 0 ? ` · ${sinPunto} sin peso` : ''}</p>
          </>
        )}
      </div>
    </details>
  )
}

const MINUTOS_A_LA_VISTA = 6

function Tiras({ det, rango, g0, programa }: { det: DetalleGate; rango: RangoLbKg | null; g0: boolean; programa: string | null }) {
  const [todos, setTodos] = useState(false)
  const lista = todos ? det.minutos : det.minutos.slice(0, MINUTOS_A_LA_VISTA)
  const resto = det.minutos.length - lista.length
  return (
    <div className={cn(GRUPO, 'divide-y divide-[color:var(--v2-reja)] !py-0.5')}>
      {lista.length === 0 && <p className="py-3 text-footnote text-muted-foreground">Sin piezas en la última hora.</p>}
      {lista.map((m) => <TiraMinuto key={m.hora} m={m} eje={det.eje} rango={rango} g0={g0} programa={programa} />)}
      {resto > 0 && (
        <button type="button" onClick={() => setTodos(true)} className="flex min-h-[44px] w-full items-center text-subhead" style={{ color: 'var(--v2-acento)' }}>
          <span className="flex-1 text-left">{resto === 1 ? '1 minuto más' : `${resto} minutos más`}</span>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1.5 ml-4 mt-4 text-footnote text-muted-foreground">{children}</h4>
}

function Marca({ children, activa }: { children: React.ReactNode; activa?: boolean }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold leading-4"
      style={activa ? { background: 'color-mix(in srgb, var(--v2-atento) 18%, transparent)', color: 'var(--v2-atento-texto)' } : { background: 'rgb(142 142 147 / 0.16)', color: 'rgb(var(--muted-foreground))' }}
    >
      {children}
    </span>
  )
}

/** El cuerpo de la hoja de una gate (de 1 a 12) o de Gate 0. */
export function CuerpoGate({ a }: { a: ArmadoGate }) {
  const { det, rango } = a
  const g0 = a.gate === 0
  const total = det.piezas - det.sinPeso
  return (
    <div className="space-y-0" data-testid="hoja-gate" data-gate={a.gate}>
      <div className={GRUPO}>
        {total === 0 ? (
          <p className="text-footnote text-muted-foreground">Sin piezas con peso en la última hora.</p>
        ) : (
          <>
            <Curva det={det} rango={rango} g0={g0} />
            {g0 ? <EjeG0 eje={det.eje} /> : rango && <Rotulos rango={rango} eje={det.eje} />}
            {g0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {det.porCalibre.map((c) => (
                  <div key={c.rotulo}>
                    <b className="block text-headline tabular-nums">{milesPunto(c.n)}</b>
                    <span className="text-nota text-muted-foreground">{c.rotulo === 'otras' ? 'otras' : `en ${c.rotulo}`}</span>
                  </div>
                ))}
              </div>
            ) : rango && <Reparto det={det} rango={rango} />}
            {a.borde && a.borde.bajo !== null && a.borde.alto !== null && (
              <p className="mt-3 text-nota text-muted-foreground tabular-nums">
                En el 10 % de cada extremo del rango observado ({kg2(a.borde.minKg ?? 0)}–{kg2(a.borde.maxKg ?? 0)} kg): {Math.round(a.borde.bajo)} % abajo y {Math.round(a.borde.alto)} % arriba, de {milesPunto(a.borde.piezas)} pz.
              </p>
            )}
          </>
        )}
      </div>
      <Titulo>Minuto a minuto</Titulo>
      <Tiras det={det} rango={rango} g0={g0} programa={a.programa} />
      {g0 ? (
        <p className="ml-4 mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-nota text-muted-foreground">
          <span className="inline-flex items-center gap-1"><i aria-hidden className="h-2 w-2 rounded-full" style={{ background: 'var(--v2-mant)' }} />Mantención</span>
          <span className="inline-flex items-center gap-1"><i aria-hidden className="h-2 w-2 rounded-full" style={{ background: 'var(--v2-ext)' }} />Seteo</span>
        </p>
      ) : (
        <>
          <Titulo>Historial</Titulo>
          <div className={cn(GRUPO, 'space-y-1 !py-1.5')}>
            {a.cambios.length === 0 ? (
              <div className="flex min-h-[44px] items-center gap-2">
                <span className="flex-1 text-subhead">{a.programa ? programaTxt(a.programa) : 'Sin programa'}{a.desdeHora ? ` desde ${a.desdeHora}` : ''}</span>
                <Marca>sin cambios</Marca>
              </div>
            ) : a.cambios.map((c) => (
              <div key={c.desdeTs} className="flex min-h-[44px] items-center gap-2">
                <span className="flex-1 text-subhead tabular-nums">{hhmm(c.desdeTs)} · {programaTxt(c.antes)} → <b>{programaTxt(c.despues)}</b></span>
                <Marca activa={c.estado === 'provisional'}>{c.estado === 'provisional' ? `sin confirmar · ${c.piezas} de 100 pz` : 'confirmado'}</Marca>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
