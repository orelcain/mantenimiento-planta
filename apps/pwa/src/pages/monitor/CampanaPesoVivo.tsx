/**
 * Peso del turno (tanda 2, opción A «Una campana con las gates» aprobada por Orel): una sola tarjeta que reemplaza
 * «Zona compartida», «Bordes de gate» y «Peso». Dice cuántas piezas son y la media; la campana crece por capas (lo leído
 * hasta cada hito del turno) sobre los rangos de las gates, y encima se marca la zona compartida. Los bordes de cada
 * gate viven en la hoja de esa gate.
 */
import { useMemo } from 'react'
import { ChartColumn, Info } from 'lucide-react'
import { milesPunto } from '@/services/grader/espejo/alertasGrader'
import { CAMPANA_DESDE_KG, CAMPANA_HASTA_KG, CAMPANA_PASO_KG, ZONA_KG, campanaDelTurno } from '@/services/grader/espejo/campanaPesoVivo'
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import type { ZonaCompartida } from '@/services/grader/espejo/pescaVivo'
import type { SeteoVivo } from '@/services/grader/espejo/seteoGatesVivo'
import { Tarjeta } from './TarjetaVivo'
import { acentoOpaco, FONDO_SUB, kg2 } from './formatoGateVivo'

const IC = 'h-3.5 w-3.5'
const W = 311
const ALTO = 120
const x = (kg: number) => ((kg - CAMPANA_DESDE_KG) / (CAMPANA_HASTA_KG - CAMPANA_DESDE_KG)) * W
/** Opacidad de cada capa, de la más antigua (delante, plena) a la de ahora (detrás, clara). */
const OPACIDADES: Record<number, number[]> = { 1: [100], 2: [100, 40], 3: [100, 62, 32] }

const calCorto = (c: string) => c.replace(/ lb$/, '')

interface Props {
  /** Piezas del turno en orden de hora. */
  piezas: readonly PiezaEspejo[]
  seteo: SeteoVivo | null
  zonaTurno: ZonaCompartida
  zonaHora: ZonaCompartida
  hasta: string
  desdeHora: string
}

export function CampanaPesoVivo({ piezas, seteo, zonaTurno, zonaHora, hasta, desdeHora }: Props) {
  const programas = useMemo(() => seteo?.gates.map((g) => g.programa) ?? [], [seteo])
  const c = useMemo(() => campanaDelTurno(piezas, programas), [piezas, programas])
  const ops = OPACIDADES[Math.min(3, Math.max(1, c.capas.length))] ?? [100]
  const bins = Math.round((CAMPANA_HASTA_KG - CAMPANA_DESDE_KG) / CAMPANA_PASO_KG)
  const ancho = W / bins - 2
  const alto = (v: number) => (v / c.maximo) * ALTO
  const lados = zonaTurno.lados
  const par = lados.length === 2 ? lados : null
  const pct810 = zonaHora.pct810
  return (
    <Tarjeta titulo="Peso del turno" sub={`Salida de las gates 1 a 12 hasta las ${hasta}`} icono={<ChartColumn className={IC} />}>
      {c.capas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin piezas con peso todavía.</p>
      ) : (
        <>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 tabular-nums" data-testid="campana-cifras">
            <span className="text-title3">{milesPunto(c.piezas)}</span><span className="text-footnote text-muted-foreground">piezas, media</span>
            <span className="text-title3">{kg2(c.mediaKg ?? 0)}</span><span className="text-footnote text-muted-foreground">kg</span>
          </p>
          <svg viewBox={`0 -4 ${W} ${ALTO + 4}`} width="100%" className="mt-3 block overflow-visible" role="img" aria-label="Distribución del peso del turno, por capas de hora">
            {par && <rect x={x(ZONA_KG[0])} y={-4} width={x(ZONA_KG[1]) - x(ZONA_KG[0])} height={ALTO + 4} style={{ fill: 'color-mix(in srgb, var(--v2-atento) 22%, transparent)' }} />}
            {[...c.capas].reverse().map((capa, k) => {
              const idx = c.capas.length - 1 - k
              return capa.bins.map((v, i) => v > 0 && (
                <rect key={`${capa.rotulo}-${i}`} x={x(CAMPANA_DESDE_KG + i * CAMPANA_PASO_KG) + 1} y={ALTO - alto(v)} width={ancho} height={alto(v)} rx={1.5} style={{ fill: acentoOpaco(ops[idx] ?? 100) }} />
              ))
            })}
            {c.mediaKg !== null && <line x1={x(c.mediaKg)} x2={x(c.mediaKg)} y1={-4} y2={ALTO} strokeWidth={1} strokeDasharray="3 3" style={{ stroke: 'rgb(var(--foreground))' }} />}
          </svg>
          <div className="relative mt-1 h-[18px]" aria-hidden>
            {c.bandas.map((b) => {
              const a = Math.max(CAMPANA_DESDE_KG, b.desdeKg)
              const z = Math.min(CAMPANA_HASTA_KG, b.hastaKg ?? CAMPANA_HASTA_KG)
              if (z <= a) return null
              const w = ((x(z) - x(a)) / W) * 100
              return (
                <span key={b.rotulo} className="absolute top-0 h-3.5 rounded-full text-center text-[11px] leading-[14px] tabular-nums text-muted-foreground" style={{ left: `${(x(a) / W) * 100}%`, width: `calc(${w}% - 2px)`, background: FONDO_SUB }}>
                  {w >= 9 ? b.rotulo : ''}
                </span>
              )
            })}
          </div>
          <div className="relative h-4" aria-hidden>
            {[2, 3, 4, 5, 6].map((k) => (
              <span key={k} className="absolute text-nota tabular-nums text-muted-foreground" style={{ left: `${(x(k) / W) * 100}%`, transform: `translateX(${k === 2 ? '0' : k === 6 ? '-100%' : '-50%'})`, whiteSpace: 'nowrap' }}>{k}{k === 6 ? ' kg' : ''}</span>
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-nota tabular-nums text-muted-foreground" aria-label="Capas de la campana">
            {c.capas.map((capa, i) => (
              <li key={capa.rotulo} className="inline-flex items-center gap-1">
                <i aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: acentoOpaco(ops[i] ?? 100), boxShadow: 'inset 0 0 0 1px var(--v2-acento)' }} />{capa.rotulo} · {milesPunto(capa.piezas)}
              </li>
            ))}
          </ul>
          <details className="mt-1 text-footnote text-muted-foreground">
            <summary className="-ml-2 inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-2 [&::-webkit-details-marker]:hidden"><Info aria-hidden className="h-4 w-4" />Cómo se lee</summary>
            <p className="pb-1">
              Salida de las gates 1 a 12, sin Gate 0 ni piezas sin peso, en tramos de 100 g. Cada capa contiene a la anterior: lo leído hasta la hora que dice y lo que llegó después. La línea punteada es la media.
              {c.fuera > 0 ? ` ${milesPunto(c.fuera)} piezas pesan menos de 2 kg o más de 6 kg y no se dibujan.` : ''}
              {par ? ` La franja naranja es la zona compartida: piezas Premium entre ${kg2(ZONA_KG[0])} y ${kg2(ZONA_KG[1])} kg caben en 8-10 y en 10-12, y la gate que las recibe depende del programa de cada una, no de la balanza. Los bordes de cada gate están en su hoja.` : ' Los bordes de cada gate están en su hoja.'}
            </p>
          </details>
          {par && zonaTurno.piezas > 0 && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--v2-reja)' }} data-testid="zona-compartida">
              <p className="flex items-center gap-2 text-footnote tabular-nums">
                <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: 'color-mix(in srgb, var(--v2-atento) 45%, transparent)' }} />
                <span className="flex-1">Zona compartida {kg2(ZONA_KG[0])}–{kg2(ZONA_KG[1])} kg</span>
                <b>{milesPunto(zonaTurno.piezas)} pz</b>
              </p>
              <div className="mt-2 flex h-2.5 gap-0.5" role="img" aria-label={par.map((l) => `${milesPunto(l.piezas)} por gates ${calCorto(l.calibre)}`).join(', ')}>
                {par.map((l, i) => <i key={l.calibre} className="block rounded-full" style={{ flex: Math.max(l.piezas, 0.001), background: 'var(--v2-acento)', opacity: i === 0 ? 0.55 : 1 }} />)}
              </div>
              <p className="mt-1.5 flex justify-between gap-2 text-footnote tabular-nums">
                {par.map((l) => <span key={l.calibre}><b>{milesPunto(l.piezas)}</b> <span className="text-muted-foreground">por gates {calCorto(l.calibre)}</span></span>)}
              </p>
              <p className="mt-1.5 text-nota text-muted-foreground tabular-nums">
                Del turno hasta las {hasta}.{zonaHora.piezas > 0 && pct810 !== null ? ` En la última hora (${desdeHora}–${hasta}): ${milesPunto(zonaHora.piezas)} pz, el ${Math.round(pct810)} % a ${calCorto(par[0]!.calibre)}.` : ''}
              </p>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  )
}
