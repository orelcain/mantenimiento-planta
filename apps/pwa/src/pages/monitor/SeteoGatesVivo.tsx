/**
 * Seteo de las 12 gates en vivo (etapa E-F, diseño B del mockup v5 aprobado por Orel el 21-11):
 *  - tabla de las 12 gates a la vista (en celular, una tarjeta por gate) con la Gate 0 al pie y «Cambios del turno»;
 *  - debajo, la pesca del turno por programa y la sugerencia, siempre con su costo en P0.
 *
 * Sin la columna «En la app»: la comparación con el seteo guardado y «Adoptar» van al cierre, en Análisis de turno.
 * Las cuentas viven en `services/grader/espejo/seteoGatesVivo.ts`; aquí solo se dibuja.
 */
import { ChevronRight, History, Info, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { coma1, milesPunto } from '@/services/grader/espejo/alertasGrader'
import { textoGates, type CambioConEfecto, type LadoCambio } from '@/services/grader/espejo/historialGatesVivo'
import {
  EJE_PESO_KG,
  GATE_APAGADA_MIN,
  rangoProgramaKg,
  type GateVivo,
  type SeteoVivo,
  type Solape,
} from '@/services/grader/espejo/seteoGatesVivo'
import { Tarjeta } from './TarjetaVivo'
import { Icono } from './AmpliarV2'
import { coma2, hhmm, kg2, sinLb } from './formatoGateVivo'

const IC = 'h-3.5 w-3.5'
const [EJE_MIN, EJE_MAX] = EJE_PESO_KG
const enEje = (kg: number) => Math.min(100, Math.max(0, ((kg - EJE_MIN) / (EJE_MAX - EJE_MIN)) * 100))
const TICKS = Array.from({ length: EJE_MAX - EJE_MIN + 1 }, (_, i) => EJE_MIN + i)

/** Pill chica de estado (tinte vivo solo en superficie chica). */
export function Marca({ children, tono = 'atento' }: { children: React.ReactNode; tono?: 'atento' | 'gris' | 'acento' }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold leading-[16px]"
      style={tono === 'atento'
        ? { background: 'color-mix(in srgb, var(--v2-atento) 18%, transparent)', color: 'var(--v2-atento-texto)' }
        : tono === 'acento'
          ? { background: 'color-mix(in srgb, var(--v2-acento) 14%, transparent)', color: 'var(--v2-acento)' }
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
function EjePeso({ rango, solapes, mal, programa, className }: { rango: [number, number] | null; solapes: readonly Solape[]; mal?: boolean; programa?: { lo: number; hi: number | null } | null; className?: string }) {
  return (
    <span className={cn('relative block h-2.5 rounded-full bg-muted', className)} role="img" aria-label={rango ? `${kg2(rango[0])} a ${kg2(rango[1])} kg` : 'sin peso'}>
      {programa && (
        <span
          className="absolute -inset-y-1 rounded-[3px] border-x-2"
          style={{ left: `${enEje(programa.lo)}%`, width: `${Math.max(1, enEje(programa.hi ?? EJE_MAX) - enEje(programa.lo))}%`, background: 'rgb(var(--foreground) / 0.22)', borderColor: 'rgb(var(--foreground) / 0.8)' }}
          title={`Rango de la gate: ${kg2(programa.lo)}–${programa.hi === null ? 'sin tope' : kg2(programa.hi)} kg`}
        />
      )}
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

/** El renglón tocable de una gate en el celular: abre su detalle; sin acción es un simple bloque. */
function Tocable({ onClick, etiqueta, children }: { onClick?: () => void; etiqueta: string; children: React.ReactNode }) {
  if (!onClick) return <div className="px-3 py-2.5">{children}</div>
  return (
    <button type="button" onClick={onClick} aria-label={etiqueta} className="block min-h-[44px] w-full rounded-card px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--v2-acento)_8%,transparent)]">
      {children}
    </button>
  )
}

const INFO_CAMBIOS = 'Antes y después: 60 minutos con producción a cada lado del cambio. P0 = piezas a Gate 0 sobre las leídas. pz/min por gate: las piezas del programa nuevo, entre las gates que lo tenían. Un cambio se confirma a las 100 piezas.'

const pzMin = (v: number | null) => (v === null ? '—' : coma1(v))

function Comparacion({ e }: { e: CambioConEfecto }) {
  const { antes, despues } = e
  if (!antes || !despues) {
    return <p className="mt-2.5 text-footnote text-muted-foreground">Antes y después aparece con 10 minutos de producción a cada lado del cambio.</p>
  }
  const cal = (et: string) => sinLb(et.split(' · ')[0] ?? et)
  const mismoCalibre = cal(e.cambio.antes) === cal(e.cambio.despues)
  const minutos = Math.min(antes.minutos, despues.minutos)
  const fila = (rotulo: React.ReactNode, a: string, d: string, unidad?: string, nota?: string) => (
    <>
      <span>{rotulo}{nota && <span className="ml-1 text-nota text-muted-foreground">{nota}</span>}</span>
      <b className="text-right text-subhead">{a}</b>
      <span aria-hidden className="text-center text-muted-foreground">→</span>
      <b className="text-subhead">{d}{unidad && <span className="ml-1 text-nota font-normal text-muted-foreground">{unidad}</span>}</b>
    </>
  )
  const p0 = (l: LadoCambio) => (l.p0Pct === null ? '—' : `${coma2(l.p0Pct)} %`)
  return (
    <>
      <div className="mt-3 grid grid-cols-[1fr_auto_16px_auto] items-baseline gap-x-2 gap-y-1.5 text-footnote tabular-nums" data-testid="comparacion-cambio">
        <span className="text-nota text-muted-foreground">de {milesPunto(antes.piezas)} y {milesPunto(despues.piezas)} pz{minutos < 60 ? ` · ${minutos} min` : ''}</span>
        <span className="text-right text-nota text-muted-foreground">antes</span>
        <span />
        <span className="text-nota text-muted-foreground">después</span>
        {fila('P0', p0(antes), p0(despues), undefined, `${antes.p0Piezas} y ${despues.p0Piezas} pz`)}
        {e.gatesNuevo.length > 0 && fila(`${cal(e.cambio.despues)} por gate`, pzMin(antes.pzMinNuevo), pzMin(despues.pzMinNuevo), 'pz/min')}
        {!mismoCalibre && e.gatesViejo.length > 0 && fila(textoGates(e.gatesViejo), pzMin(antes.pzMinViejo), pzMin(despues.pzMinViejo), 'pz/min')}
      </div>
      <p className="mt-2.5 text-footnote tabular-nums">
        {cal(e.cambio.despues)} en {e.gatesNuevoDespues.length} {e.gatesNuevoDespues.length === 1 ? 'gate' : 'gates'};{' '}
        {e.p0 === 'igual' ? 'P0 igual' : e.p0 === 'sube' ? `P0 subió de ${p0(antes)} a ${p0(despues)}` : e.p0 === 'baja' ? `P0 bajó de ${p0(antes)} a ${p0(despues)}` : 'P0 sin comparar'}.
      </p>
    </>
  )
}

/** Cambios de programa del turno, cada uno con lo que pasó antes y después. */
function CambiosDelTurno({ efectos }: { efectos: readonly CambioConEfecto[] }) {
  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--v2-reja)' }} data-testid="cambios-turno">
      <div className="mb-2 flex items-center gap-2">
        <Icono><History className="h-3.5 w-3.5" /></Icono>
        <h4 className="flex-1 text-[15px] font-medium leading-tight text-foreground">Cambios del turno</h4>
        <details className="relative">
          <summary className="-my-3 -mr-3 grid h-11 w-11 cursor-pointer list-none place-items-center text-muted-foreground [&::-webkit-details-marker]:hidden" aria-label="Cómo se mide"><Info aria-hidden className="h-4 w-4" /></summary>
          <p className="absolute right-0 z-10 mt-1 w-[min(300px,80vw)] rounded-card bg-card p-3 text-footnote text-muted-foreground shadow-lg">{INFO_CAMBIOS}</p>
        </details>
      </div>
      {efectos.length === 0 && <p className="text-footnote text-muted-foreground">Ninguno: cada gate tiene el programa con que arrancó.</p>}
      <ul className="space-y-2">
        {efectos.map((e) => (
          <li key={`${e.cambio.gate}-${e.cambio.desdeTs}`} className="v2-subtarjeta rounded-card px-3.5 py-3" data-gate={e.cambio.gate} data-estado={e.cambio.estado}>
            <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
              <b className="text-subhead tabular-nums">{hhmm(e.cambio.desdeTs)} · G{e.cambio.gate}</b>
              {e.cambio.estado === 'confirmado' ? <Marca tono="acento">confirmado</Marca> : <Marca>sin confirmar · {milesPunto(e.cambio.piezas)} de 100 pz</Marca>}
            </div>
            <p className="mt-0.5 text-footnote tabular-nums">{sinLb(e.cambio.antes)} <span className="text-muted-foreground">→</span> <b>{sinLb(e.cambio.despues)}</b></p>
            {e.cambio.estado === 'provisional'
              ? <p className="mt-2.5 text-footnote text-muted-foreground">Antes y después aparece al confirmar.</p>
              : <Comparacion e={e} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Arriba: las 12 gates a la vista, con la última hora como cifra principal. */
export function SeteoGates({ s, efectos = [], onAbrirGate }: { s: SeteoVivo; efectos?: readonly CambioConEfecto[]; onAbrirGate?: (gate: number) => void }) {
  // Con menos de una hora de grader, «última hora 20:58–21:58» parecía otro turno (video 23-11): se dice cuánto lleva.
  const sub = s.minutosActivosHora < 55
    ? `Lo que dice la máquina, leído de las piezas · grader hasta las ${s.hora.hasta}, ${s.minutosActivosHora} min con producción`
    : `Lo que dice la máquina, leído de las piezas · última hora del grader ${s.hora.desde}–${s.hora.hasta}, ${s.minutosActivosHora} min con producción`
  const solape = textoSolapes(s)
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
              <th className="w-[30%] min-w-[220px] py-1.5 font-normal">Peso real p1–p99 (kg) · franja = rango de la gate<Ticks /></th>
            </tr>
          </thead>
          <tbody>
            {s.gates.map((g) => (
              <tr key={g.gate} className={cn('border-t border-border/60', g.apagada && 'opacity-50', onAbrirGate && 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--v2-acento)_8%,transparent)]')} data-gate={g.gate} data-apagada={g.apagada || undefined} onClick={onAbrirGate ? () => onAbrirGate(g.gate) : undefined}>
                <td className="py-2 pr-3 font-semibold text-foreground">
                  {onAbrirGate ? <button type="button" aria-label={`Abrir el detalle de la gate ${g.gate}`} className="inline-flex min-h-[44px] items-center gap-1" onClick={(e) => { e.stopPropagation(); onAbrirGate(g.gate) }}>G{g.gate}<ChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" /></button> : <>G{g.gate}</>}
                </td>
                <td className="py-2 pr-3 text-foreground">
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="whitespace-nowrap">{g.programa ?? 'Sin piezas'}</span>
                    <MarcaGate g={g} />
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">
                  <span className="text-[15px] font-semibold text-foreground">{coma1(g.pzMinHora)}</span>{' '}
                  <span className="text-[12px] text-muted-foreground">turno {coma1(g.pzMinTurno)} pz/min</span>
                </td>
                <td className="py-2 pr-3 text-right text-foreground/80">{coma1(g.pctHora)} %</td>
                <td className="py-2">
                  <EjePeso rango={g.pesoKg} solapes={solapesDe(g, s)} programa={rangoProgramaKg(g.programa)} />
                  <span className="mt-1 block text-[12px] leading-[16px] text-muted-foreground">{rangoTxt(g.pesoKg)}</span>
                </td>
              </tr>
            ))}
            <tr className={cn('border-t-2 border-border', onAbrirGate && 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--v2-acento)_8%,transparent)]')} data-gate={0} onClick={onAbrirGate ? () => onAbrirGate(0) : undefined}>
              <td className="py-2 pr-3 font-semibold text-foreground">
                {onAbrirGate ? <button type="button" aria-label="Abrir el detalle de Gate 0" className="inline-flex min-h-[44px] items-center gap-1" onClick={(e) => { e.stopPropagation(); onAbrirGate(0) }}>G0<ChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" /></button> : <>G0</>}
              </td>
              <td className="py-2 pr-3 text-foreground">
                Rechazo <span className="text-[12px] text-muted-foreground">P0 {coma1(g0.pctHora)} % última hora · {milesPunto(g0.piezasTurno)} pz en el turno</span>
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-right">
                <span className="text-[15px] font-semibold text-foreground">{coma1(g0.pzMinHora)}</span>{' '}
                <span className="text-[12px] text-muted-foreground">turno {coma1(g0.pzMinTurno)} pz/min</span>
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
          <li key={g.gate} className={cn('v2-subtarjeta rounded-card', g.apagada && 'opacity-55')} data-gate={g.gate}>
            <Tocable onClick={onAbrirGate ? () => onAbrirGate(g.gate) : undefined} etiqueta={`Abrir el detalle de la gate ${g.gate}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-[20px]">
              <b className="font-semibold tabular-nums text-foreground">G{g.gate}</b>
              <span className="text-foreground">{g.programa ?? 'Sin piezas'}</span>
              <MarcaGate g={g} />
            </div>
            <p className="mt-1 text-[13px] leading-[18px] tabular-nums text-foreground">
              <b className="font-semibold">{coma1(g.pzMinHora)} pz/min</b> · {milesPunto(g.piezasHora)} pz · {coma1(g.pctHora)} % de la salida <span className="text-muted-foreground">· turno {coma1(g.pzMinTurno)} pz/min</span>
            </p>
            <EjePeso rango={g.pesoKg} solapes={solapesDe(g, s)} programa={rangoProgramaKg(g.programa)} className="mt-2" />
            <p className="mt-1 text-[12px] leading-[16px] tabular-nums text-muted-foreground">Peso {rangoTxt(g.pesoKg)} kg</p>
            </Tocable>
          </li>
        ))}
        <li className="v2-subtarjeta rounded-card" data-gate={0}>
          <Tocable onClick={onAbrirGate ? () => onAbrirGate(0) : undefined} etiqueta="Abrir el detalle de Gate 0">
          <div className="text-[15px] leading-[20px]"><b className="font-semibold text-foreground">G0</b> <span className="text-foreground">Rechazo</span></div>
          <p className="mt-1 text-[13px] leading-[18px] tabular-nums text-foreground">
            <b className="font-semibold">P0 {coma1(g0.pctHora)} %</b> última hora · {milesPunto(g0.piezasTurno)} pz en el turno
          </p>
          <EjePeso rango={g0.pesoKg} solapes={s.solapes} mal className="mt-2" />
          <p className="mt-1 text-[12px] leading-[16px] tabular-nums text-muted-foreground">Peso {rangoTxt(g0.pesoKg)} kg</p>
          </Tocable>
        </li>
      </ul>

      <p className="mt-3 text-[12px] leading-[16px] text-muted-foreground">
        {solape ? `${solape} ` : ''}Gate gris: sin piezas leídas hace {GATE_APAGADA_MIN} min o más, programa sin confirmar. pz/min por minuto con producción del grader.
      </p>
      <CambiosDelTurno efectos={efectos} />
    </Tarjeta>
  )
}
