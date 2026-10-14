/**
 * purezaColors.ts — color de cada causal del gráfico de pureza por puerta (PurezaPorPuertaCard).
 *
 * Sin `data-paleta="pizarra"` devuelve EXACTAMENTE el hex que el gráfico traía (`hoy`). Con ella,
 * «foco, contexto, estado»: «Coincide» es lo normal (contexto: neutro medio, atenuado); de las
 * causales de mezcla, las cinco que más se miran llevan series 1-5 en orden fijo y las demás van
 * en «Otros». Ninguna usa falla/aviso: el color de estado lo llevan los niveles de pureza (texto
 * `text-ink-*` y barras de peso), no la identidad de la causal.
 */
import { elegirColor } from '@/lib/coloresGrafico'
import type { CausaTipo } from '@/services/grader/graderGateObservations'

const TOKEN: Record<CausaTipo | 'ok', { token: string; alfa: number }> = {
  ok: { token: 'grafico-neutro-medio', alfa: 0.4 },
  calibre_lejano: { token: 'serie-1', alfa: 1 },
  calidad: { token: 'serie-2', alfa: 1 },
  conservacion: { token: 'serie-3', alfa: 1 },
  seteo_distinto: { token: 'serie-4', alfa: 1 },
  calibre_vecino: { token: 'serie-5', alfa: 1 },
  calibre_no_reconocido: { token: 'serie-otros', alfa: 1 },
  sin_dato: { token: 'serie-otros', alfa: 1 },
  otros: { token: 'serie-otros', alfa: 1 },
}

/** Color de una causal (o de «Coincide» con `'ok'`): `hoy` sin Pizarra; con ella, su serie. */
export function colorCausaPureza(clave: CausaTipo | 'ok', hoy: string): string {
  const t = TOKEN[clave]
  return elegirColor(hoy, t.token, t.alfa)
}
