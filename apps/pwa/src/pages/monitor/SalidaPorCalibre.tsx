/**
 * Salida por calibre (tanda 2, opción B «Matriz calibre × calidad», elegida por Orel): una sola tarjeta que reemplaza
 * «Calibre y calidad» y «Pesca por programa». Cada celda lleva el % de la salida y las gates que
 * la reciben (la columna Industrial ocupa solo su ancho); lo de poco flujo y la sugerencia quedan plegados.
 */
import { useMemo } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { coma1, milesPunto } from '@/services/grader/espejo/alertasGrader'
import { calibreCorto, salidaPorCalibre, textoGatesParte, type CalibreSalida } from '@/services/grader/espejo/salidaCalibreVivo'
import type { SeteoVivo } from '@/services/grader/espejo/seteoGatesVivo'
import { Tarjeta } from './TarjetaVivo'
import { acentoAl, sinLb } from './formatoGateVivo'

const IC = 'h-3.5 w-3.5'

/** Matriz calibre × calidad: cada celda dice el % de la salida y las gates que la reciben, con el tono según el %. */
function Matriz({ calibres, columnas }: { calibres: CalibreSalida[]; columnas: string[] }) {
  return (
    <table className="w-full border-separate text-footnote tabular-nums" style={{ borderSpacing: 3 }}>
      <thead>
        <tr className="text-nota text-muted-foreground">
          <th scope="col" className="py-1 text-left font-normal">lb</th>
          {columnas.map((q, i) => <th key={q} scope="col" className={i === 0 ? 'py-1 text-right font-normal' : 'w-[1%] whitespace-nowrap py-1 text-right font-normal'}>{q}</th>)}
        </tr>
      </thead>
      <tbody>
        {calibres.map((c) => (
          <tr key={c.calibre} data-calibre={c.calibre}>
            <td className="whitespace-nowrap py-1 pr-1 font-medium">{calibreCorto(c.calibre)}</td>
            {columnas.map((q) => {
              const p = c.partes.find((x) => x.calidad === q)
              if (!p || p.pct <= 0) return <td key={q} className="py-1 text-right text-muted-foreground">—</td>
              const fuerte = p.pct > 45
              return (
                <td key={q} className="whitespace-nowrap rounded-[10px] px-2 py-1 text-right" style={{ background: acentoAl(Math.max(6, Math.round(p.pct * 1.1))), color: fuerte ? 'rgb(var(--card))' : undefined }}>
                  <b className="block text-subhead">{coma1(p.pct)} %</b>
                  <span className="block text-[11px] leading-[14px]">{textoGatesParte(p.gates)}</span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** La sugerencia en prueba, con su costo en P0 (nunca una acción). Solo admin. */
function Sugerencia({ s }: { s: NonNullable<SeteoVivo['sugerencia']> }) {
  return (
    <div className="space-y-1.5 pb-3 pt-1" data-testid="sugerencia-gates">
      <p className="text-subhead tabular-nums">
        <b className="font-semibold">{s.pocoFlujo.gates} gates reciben el {coma1(s.pocoFlujo.pct)} % de la salida y {s.mucho.gates} gates el {coma1(s.mucho.pct)} %.</b>{' '}
        Pasar G{s.gate} ({sinLb(s.deProg)}) a {sinLb(s.aProg)} bajaría {s.gatesDestino.map((g) => `G${g}`).join(', ')} de {coma1(s.pzMinAntes)} a ~{coma1(s.pzMinDespues)} pz/min.
      </p>
      <p className="text-subhead tabular-nums" style={{ color: s.costo.piezas > 0 ? 'var(--v2-mal-texto)' : undefined }}>
        Costo en P0: {s.costo.piezas > 0
          ? `sus ${milesPunto(s.costo.piezas)} piezas ${sinLb(s.deProg)} del turno quedarían sin gate; si van a Gate 0, el P0 sube de ${coma1(s.costo.p0Antes)} % a ~${coma1(s.costo.p0Despues)} %.`
          : `ninguno: ${sinLb(s.deProg)} tiene otra gate.`}
      </p>
      <p className="text-nota text-muted-foreground">Sugerencia, no acción. Falta un dato para decidir: cuántas piezas por minuto aguanta una gate.</p>
    </div>
  )
}

const FILA_PLEGADA = 'flex min-h-[44px] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden'

export function SalidaPorCalibre({ s, publico = false }: { s: SeteoVivo; publico?: boolean }) {
  const so = useMemo(() => salidaPorCalibre(s.programas), [s.programas])
  // La sugerencia está en prueba: solo admin la ve.
  const sg = publico ? null : s.sugerencia
  const columnas = so.calidad.map((q) => q.calidad)
  const pctPoco = so.poco.reduce((a, c) => a + c.pct, 0)
  const nombres = so.poco.map((c) => calibreCorto(c.calibre))
  const rotuloPoco = `${nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0] ?? ''} lb`
  return (
    <Tarjeta titulo="Salida por calibre" sub={`Turno hasta las ${s.hora.hasta} · sin Gate 0`} icono={<Layers className={IC} />}>
      {so.calibres.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin piezas con peso todavía.</p>
      ) : (
        <>
          <div className="mt-3" data-testid="salida-calidad">
            <p className="flex flex-wrap justify-between gap-x-3 text-footnote tabular-nums">
              {so.calidad.map((q) => <span key={q.calidad}>{q.calidad} <b>{coma1(q.pct)} %</b></span>)}
            </p>
          </div>
          <div className="mt-2"><Matriz calibres={so.principales} columnas={columnas} /></div>
          {so.poco.length > 0 && (
            <details className="border-t" style={{ borderColor: 'var(--v2-reja)' }} data-testid="poco-flujo">
              <summary className={FILA_PLEGADA}>
                <span className="flex-1 text-subhead">{rotuloPoco}</span>
                <span className="text-footnote tabular-nums text-muted-foreground">{coma1(pctPoco)} % · {so.gatesPoco} {so.gatesPoco === 1 ? 'gate' : 'gates'}</span>
                <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </summary>
              <div className="pb-1"><Matriz calibres={so.poco} columnas={columnas} /></div>
              <p className="pb-2 text-nota text-muted-foreground">Poco flujo: menos de 1 pz/min por gate.</p>
            </details>
          )}
          {sg && (
            <details className="border-t" style={{ borderColor: 'var(--v2-reja)' }}>
              <summary className={FILA_PLEGADA}>
                <span className="flex-1 text-subhead">Sugerencia</span>
                <span className="inline-flex rounded-full px-2 py-px text-[11px] font-semibold leading-4 text-muted-foreground" style={{ background: 'rgb(142 142 147 / 0.16)' }}>en prueba</span>
                <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </summary>
              <Sugerencia s={sg} />
            </details>
          )}
        </>
      )}
    </Tarjeta>
  )
}
