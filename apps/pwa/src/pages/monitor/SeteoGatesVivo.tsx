/**
 * Seteo de las 12 gates en vivo (etapa E-F, diseño B del mockup v5 aprobado por Orel el 21-11):
 *  - tabla de las 12 gates a la vista (en celular, una tarjeta por gate) con la Gate 0 al pie y «Cambios del turno»;
 *  - debajo, la pesca del turno por programa y la sugerencia, siempre con su costo en P0.
 *
 * Sin la columna «En la app»: la comparación con el seteo guardado y «Adoptar» van al cierre, en Análisis de turno.
 * Las cuentas viven en `services/grader/espejo/seteoGatesVivo.ts`; aquí solo se dibuja.
 */
import { Fish, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { coma1, milesPunto } from '@/services/grader/espejo/alertasGrader'
import {
  EJE_PESO_KG,
  GATE_APAGADA_MIN,
  type GateVivo,
  type SeteoVivo,
  type Solape,
} from '@/services/grader/espejo/seteoGatesVivo'
import { Tarjeta } from './TarjetaVivo'

const IC = 'h-3.5 w-3.5'
const kg2 = (v: number) => v.toFixed(2).replace('.', ',') // decimal-tecnico: ya pasa a coma
const hhmm = (ts: string) => ts.slice(11, 16)
/** «8-10 lb · Industrial» → «8-10 Industrial», para frases. */
const sinLb = (p: string) => p.replace(/ lb · /g, ' ').replace(/ lb/g, '')
const [EJE_MIN, EJE_MAX] = EJE_PESO_KG
const enEje = (kg: number) => Math.min(100, Math.max(0, ((kg - EJE_MIN) / (EJE_MAX - EJE_MIN)) * 100))
const TICKS = Array.from({ length: EJE_MAX - EJE_MIN + 1 }, (_, i) => EJE_MIN + i)

/** Pill chica de estado (tinte vivo solo en superficie chica). */
function Marca({ children, tono = 'atento' }: { children: React.ReactNode; tono?: 'atento' | 'gris' }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold leading-[16px]"
      style={tono === 'atento'
        ? { background: 'color-mix(in srgb, var(--v2-atento) 18%, transparent)', color: 'var(--v2-atento-texto)' }
        : { background: 'rgb(142 142 147 / 0.16)', color: 'rgb(var(--muted-foreground))' }}
    >
      {children}
    </span>
  )
}

/** La marca de la gate: desde cuándo tiene el programa, si está sin confirmar o si no recibe piezas. */
function MarcaGate({ g }: { g: GateVivo }) {
  if (g.apagada) {
    return <Marca tono="gris">{g.minSinPiezas === null ? 'sin piezas en el turno' : `sin piezas hace ${milesPunto(g.minSinPiezas)} min`} · programa sin confirmar</Marca>
  }
  if (g.provisional) return <Marca>desde {hhmm(g.provisional.desdeTs)} · sin confirmar ({milesPunto(g.provisional.piezas)} de 100 pz)</Marca>
  if (g.desdeTs) return <Marca>desde {hhmm(g.desdeTs)}</Marca>
  return null
}

/** Peso p1–p99 en el eje común 1–7 kg, con la franja de solape encima donde la cruza. */
function EjePeso({ rango, solapes, mal, className }: { rango: [number, number] | null; solapes: readonly Solape[]; mal?: boolean; className?: string }) {
  return (
    <span className={cn('relative block h-2.5 rounded-full bg-muted', className)} role="img" aria-label={rango ? `${kg2(rango[0])} a ${kg2(rango[1])} kg` : 'sin peso'}>
      {rango && (
        <span
          className="absolute inset-y-0 rounded-full"
          style={{ left: `${enEje(rango[0])}%`, width: `${Math.max(1, enEje(rango[1]) - enEje(rango[0]))}%`, background: mal ? 'var(--v2-mal)' : 'var(--v2-acento)', opacity: mal ? 0.5 : 1 }}
        />
      )}
      {rango && !mal && solapes.map((z) => {
        const a = Math.max(z.desdeKg, rango[0])
        const b = Math.min(z.hastaKg, rango[1])
        if (b <= a) return null
        return <span key={`${z.bajo}-${z.calidad}`} className="absolute -inset-y-0.5 rounded-[3px]" style={{ left: `${enEje(a)}%`, width: `${enEje(b) - enEje(a)}%`, background: 'var(--v2-atento)', opacity: 0.8 }} />
      })}
    </span>
  )
}

function Ticks() {
  return (
    <span className="relative mt-1 block h-3.5" aria-hidden>
      {TICKS.map((k) => (
        <span
          key={k}
          className={cn('absolute text-[11px] font-medium leading-[14px] tabular-nums text-muted-foreground', k === EJE_MIN ? '' : k === EJE_MAX ? '-translate-x-full' : '-translate-x-1/2')}
          style={{ left: `${enEje(k)}%` }}
        >
          {k}
        </span>
      ))}
    </span>
  )
}

const rangoTxt = (r: [number, number] | null) => (r ? `${kg2(r[0])}–${kg2(r[1])}` : '—')

/** La franja de solape se marca solo en las gates de esa calidad y de uno de los dos calibres. */
const solapesDe = (g: GateVivo, s: SeteoVivo) =>
  s.solapes.filter((z) => g.programa === `${z.bajo} · ${z.calidad}` || g.programa === `${z.alto} · ${z.calidad}`)

function textoSolapes(s: SeteoVivo): string | null {
  if (s.solapes.length === 0) return null
  return s.solapes.map((z) => {
    const bajas = s.gates.filter((g) => g.programa === `${z.bajo} · ${z.calidad}` && g.pesoKg && g.pesoKg[1] > z.desdeKg).map((g) => `G${g.gate}`)
    const altas = s.gates.filter((g) => g.programa === `${z.alto} · ${z.calidad}`).map((g) => `G${g.gate}`)
    return `Franja naranja: ${kg2(z.desdeKg)}–${kg2(z.hastaKg)} kg, piezas ${z.calidad} que caen en ${sinLb(z.bajo)} (${bajas.join(', ')}) y también caben en ${sinLb(z.alto)} (${altas.join(', ')}).`
  }).join(' ')
}

/** Arriba: las 12 gates a la vista, con la última hora como cifra principal. */
export function SeteoGates({ s }: { s: SeteoVivo }) {
  const sub = `Lo que dice la máquina, leído de las piezas · última hora ${s.hora.desde}–${s.hora.hasta}, ${s.minutosActivosHora} min con producción`
  const solape = textoSolapes(s)
  const cambios = s.cambios
  const g0 = s.gate0
  return (
    <Tarjeta titulo="Seteo de las gates" sub={sub} icono={<SlidersHorizontal className={IC} />} >
      {/* Escritorio y tablet: la tabla. */}
      <div className="mt-3 hidden overflow-x-auto md:block" data-testid="seteo-tabla">
        <table className="w-full text-[13px] leading-[18px] tabular-nums">
          <thead>
            <tr className="text-left align-bottom text-[12px] text-muted-foreground">
              <th className="py-1.5 pr-3 font-normal">Gate</th>
              <th className="py-1.5 pr-3 font-normal">Programa</th>
              <th className="py-1.5 pr-3 text-right font-normal">pz/min última hora</th>
              <th className="py-1.5 pr-3 text-right font-normal">% del flujo</th>
              <th className="w-[30%] min-w-[220px] py-1.5 font-normal">Peso real p1–p99 (kg)<Ticks /></th>
            </tr>
          </thead>
          <tbody>
            {s.gates.map((g) => (
              <tr key={g.gate} className={cn('border-t border-border/60', g.apagada && 'opacity-50')} data-gate={g.gate} data-apagada={g.apagada || undefined}>
                <td className="py-2 pr-3 font-semibold text-foreground">G{g.gate}</td>
                <td className="py-2 pr-3 text-foreground">
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="whitespace-nowrap">{g.programa ?? 'Sin piezas'}</span>
                    <MarcaGate g={g} />
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">
                  <span className="text-[15px] font-semibold text-foreground">{coma1(g.pzMinHora)}</span>{' '}
                  <span className="text-[12px] text-muted-foreground">turno {coma1(g.pzMinTurno)}</span>
                </td>
                <td className="py-2 pr-3 text-right text-foreground/80">{coma1(g.pctHora)} %</td>
                <td className="py-2">
                  <EjePeso rango={g.pesoKg} solapes={solapesDe(g, s)} />
                  <span className="mt-1 block text-[12px] leading-[16px] text-muted-foreground">{rangoTxt(g.pesoKg)}</span>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border" data-gate={0}>
              <td className="py-2 pr-3 font-semibold text-foreground">G0</td>
              <td className="py-2 pr-3 text-foreground">
                Rechazo <span className="text-[12px] text-muted-foreground">P0 {coma1(g0.pctHora)} % última hora · {milesPunto(g0.piezasTurno)} pz en el turno</span>
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-right">
                <span className="text-[15px] font-semibold text-foreground">{coma1(g0.pzMinHora)}</span>{' '}
                <span className="text-[12px] text-muted-foreground">turno {coma1(g0.pzMinTurno)}</span>
              </td>
              <td className="py-2 pr-3 text-right text-foreground/80">{coma1(g0.pctHora)} %</td>
              <td className="py-2">
                <EjePeso rango={g0.pesoKg} solapes={s.solapes} mal />
                <span className="mt-1 block text-[12px] leading-[16px] text-muted-foreground">{rangoTxt(g0.pesoKg)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Celular: una tarjeta por gate. */}
      <ul className="mt-3 space-y-2 md:hidden" aria-label="Las 12 gates" data-testid="seteo-tarjetas">
        {s.gates.map((g) => (
          <li key={g.gate} className={cn('v2-subtarjeta rounded-card px-3 py-2.5', g.apagada && 'opacity-55')} data-gate={g.gate}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-[20px]">
              <b className="font-semibold tabular-nums text-foreground">G{g.gate}</b>
              <span className="text-foreground">{g.programa ?? 'Sin piezas'}</span>
              <MarcaGate g={g} />
            </div>
            <p className="mt-1 text-[13px] leading-[18px] tabular-nums text-foreground">
              <b className="font-semibold">{coma1(g.pzMinHora)} pz/min</b> · {coma1(g.pctHora)} % <span className="text-muted-foreground">· turno {coma1(g.pzMinTurno)}</span>
            </p>
            <EjePeso rango={g.pesoKg} solapes={solapesDe(g, s)} className="mt-2" />
            <p className="mt-1 text-[12px] leading-[16px] tabular-nums text-muted-foreground">Peso {rangoTxt(g.pesoKg)} kg</p>
          </li>
        ))}
        <li className="v2-subtarjeta rounded-card px-3 py-2.5" data-gate={0}>
          <div className="text-[15px] leading-[20px]"><b className="font-semibold text-foreground">G0</b> <span className="text-foreground">Rechazo</span></div>
          <p className="mt-1 text-[13px] leading-[18px] tabular-nums text-foreground">
            <b className="font-semibold">P0 {coma1(g0.pctHora)} %</b> última hora · {milesPunto(g0.piezasTurno)} pz en el turno
          </p>
          <EjePeso rango={g0.pesoKg} solapes={s.solapes} mal className="mt-2" />
          <p className="mt-1 text-[12px] leading-[16px] tabular-nums text-muted-foreground">Peso {rangoTxt(g0.pesoKg)} kg</p>
        </li>
      </ul>

      <p className="mt-3 text-[12px] leading-[16px] text-muted-foreground">
        {solape ? `${solape} ` : ''}Gate gris: sin piezas leídas hace {GATE_APAGADA_MIN} min o más, programa sin confirmar. pz/min por minuto con producción del grader.
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-[13px] leading-[18px]" data-testid="cambios-turno">
        <span className="font-semibold text-foreground">Cambios del turno</span>
        {cambios.length === 0 && <span className="text-muted-foreground">Ninguno: cada gate tiene el programa con que arrancó.</span>}
        {cambios.map((c) => (
          <span key={`${c.gate}-${c.desdeTs}`} className="tabular-nums text-foreground/80">
            <span className="font-semibold text-foreground">{hhmm(c.desdeTs)}</span> G{c.gate}: {sinLb(c.antes)} → {sinLb(c.despues)}
            {c.estado === 'provisional' && <span className="text-muted-foreground"> (sin confirmar)</span>}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] leading-[16px] text-muted-foreground">La comparación con el seteo de la app y «Adoptar» van al cierre, en Análisis de turno.</p>
    </Tarjeta>
  )
}

const gatesTxt = (gs: SeteoVivo['programas'][number]['gates']) =>
  gs.map((g) => `G${g.gate}${g.desde ? ` desde ${hhmm(g.desde)}` : ''}${g.hasta ? ` hasta ${hhmm(g.hasta)}` : ''}`).join(' · ')

/** Debajo: la pesca del turno por programa y la sugerencia (con su costo en P0). */
export function PescaPorPrograma({ s, publico = false }: { s: SeteoVivo; publico?: boolean }) {
  // La sugerencia está en prueba: solo admin la ve.
  const sg = publico ? null : s.sugerencia
  return (
    <Tarjeta titulo="Pesca por programa" sub={`Turno hasta las ${s.hora.hasta} · salida sin Gate 0`} icono={<Fish className={IC} />}>
      <div className="mt-3 space-y-3" role="list" aria-label="Pesca por programa">
        {s.programas.map((p) => (
          <div key={p.programa} role="listitem" className="grid gap-x-4 gap-y-1 text-[13px] leading-[18px] md:grid-cols-[minmax(170px,1.2fr)_2fr_minmax(170px,1fr)] md:items-center">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{p.grupo ? 'Poco flujo (bajo 1 pz/min por gate)' : p.programa}</p>
              <p className="text-[12px] leading-[16px] tabular-nums text-muted-foreground">{gatesTxt(p.gates)}</p>
            </div>
            <span className="block h-2.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, p.pct)}%`, background: p.grupo ? 'var(--v2-gris)' : 'var(--v2-acento)' }} />
            </span>
            <p className="tabular-nums text-foreground md:text-right">
              <b className="font-semibold">{coma1(p.pct)} %</b>
              <span className="text-muted-foreground"> · {p.grupo ? `hasta ${coma1(p.pzMinGate)}` : coma1(p.pzMinGate)} pz/min{p.gates.length > 1 && !p.grupo ? ' c/u' : ''}</span>
            </p>
          </div>
        ))}
      </div>
      {sg && (
        <div className="v2-subtarjeta mt-4 space-y-1.5 rounded-card px-3 py-3" data-testid="sugerencia-gates">
          <p className="text-[12px] font-semibold leading-[16px] text-muted-foreground">Sugerencia, no acción · en prueba</p>
          <p className="text-[15px] leading-[21px] text-foreground tabular-nums">
            <b className="font-semibold">{sg.pocoFlujo.gates} gates reciben el {coma1(sg.pocoFlujo.pct)} % de la salida y {sg.mucho.gates} gates el {coma1(sg.mucho.pct)} %.</b>{' '}
            Pasar G{sg.gate} ({sinLb(sg.deProg)}) a {sinLb(sg.aProg)} bajaría {sg.gatesDestino.map((g) => `G${g}`).join(', ')} de {coma1(sg.pzMinAntes)} a ~{coma1(sg.pzMinDespues)} pz/min.
          </p>
          <p className="text-[15px] leading-[21px] tabular-nums" style={{ color: sg.costo.piezas > 0 ? 'var(--v2-mal-texto)' : undefined }}>
            Costo en P0: {sg.costo.piezas > 0
              ? `sus ${milesPunto(sg.costo.piezas)} piezas ${sinLb(sg.deProg)} del turno quedarían sin gate; si van a Gate 0, el P0 sube de ${coma1(sg.costo.p0Antes)} % a ~${coma1(sg.costo.p0Despues)} %.`
              : `ninguno: ${sinLb(sg.deProg)} tiene otra gate.`}
          </p>
          <p className="text-[12px] leading-[16px] text-muted-foreground">Falta un dato para decidir: cuántas piezas por minuto aguanta una gate.</p>
        </div>
      )}
    </Tarjeta>
  )
}
