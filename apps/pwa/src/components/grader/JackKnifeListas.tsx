import { ACCION_CUADRANTE, agruparComentarios, comentariosDe, nivelPrioridad, type CalculoJK, type InformeJK, type TurnoJK } from '@/services/shoplogix/jackKnife'
import { dec1 } from '@/utils/formatoNumeros'

export function JackKnifeListas({ calc, informe, turnos, elegirCausa = () => {}, lamina = false }: {
  calc: CalculoJK; informe: InformeJK | null; turnos: TurnoJK[]; elegirCausa?: (k: string) => void; lamina?: boolean
}) {
  const atacar = [...calc.pts].filter(p => nivelPrioridad(p, calc.un, calc.um) <= 2).sort((a,b) => nivelPrioridad(a, calc.un, calc.um) - nivelPrioridad(b, calc.un, calc.um) || b.min-a.min).slice(0,2)
  return <div className="space-y-4 text-footnote" style={lamina ? { fontSize: 20, lineHeight: 1.4 } : undefined}>
    <section className="border-t-2 border-warning pt-3">
      <h3 className="text-headline font-semibold" style={lamina ? { fontSize: 26 } : undefined}>Atacar ahora</h3>
      {!atacar.length && <p className="text-muted-foreground">Sin causas de nivel 1 o 2.</p>}
      {atacar.map(p => <div key={p.k} className="py-2">
        <button className="min-h-[44px] text-left font-semibold" onClick={() => elegirCausa(p.k)}>{p.k} · <span className="tabular-nums">{p.ev} det. · {dec1(p.mttr)} min</span></button>
        <p>{ACCION_CUADRANTE[p.q]}</p>
        {agruparComentarios(comentariosDe(turnos, calc.desde, calc.hasta, p.k, Infinity)).slice(0,lamina ? 1 : 2).map(g => <p key={g.texto} className="mt-1 break-words text-muted-foreground">{lamina && g.texto.length > 90 ? g.texto.slice(0, 88).trimEnd() + '…' : g.texto} ×{g.n}</p>)}{/* sin line-clamp: html2canvas no lo soporta y corta el texto */}
      </div>)}
    </section>
    {(['mejoraron', 'empeoraron'] as const).map(tipo => <section key={tipo} className={'border-t-2 pt-3 ' + (tipo === 'mejoraron' ? 'border-success' : 'border-destructive')}>
      <h3 className="text-headline font-semibold" style={lamina ? { fontSize: 26 } : undefined}>{tipo === 'mejoraron' ? 'Mejoraron' : 'Empeoraron'} ({informe?.[tipo].length ?? 0})</h3>
      {!informe && <p className="text-muted-foreground">Sin comparación con eventos.</p>}
      {informe?.[tipo].slice(0,3).map(k => {
        const f = informe.filas.find(f => f.causa === k)!
        return <button key={k} className="block min-h-[44px] text-left tabular-nums" onClick={() => elegirCausa(k)}>{k}: {dec1(f.minAntes10)} → {dec1(f.minAhora10)} min cada 10 turnos</button>
      })}
      {(informe?.[tipo].length ?? 0) > 3 && <p className="text-muted-foreground">y {informe![tipo].length - 3} más</p>}
    </section>)}
    {informe && !lamina && <p className="text-caption text-muted-foreground">{[
      informe.aparecieron.length ? 'Aparecieron: ' + informe.aparecieron.join(', ') : '',
      informe.sinHistoria.length ? 'Sin historia: ' + informe.sinHistoria.join(', ') : '',
      informe.desaparecieron.length ? 'Desaparecieron: ' + informe.desaparecieron.join(', ') : '',
    ].filter(Boolean).join(' · ')}</p>}
  </div>
}
