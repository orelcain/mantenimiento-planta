/**
 * notasOperador — lo que el operador escribió, listo para colgar de su causa.
 *
 * Vive fuera de `MonitorShiftParts` porque son transformaciones de datos, no
 * componentes: mezclarlas ahí rompía el fast refresh del archivo entero (la
 * regla `react-refresh/only-export-components` lo dice sin rodeos).
 *
 * El texto del piso es el único castellano que sube de la línea —"ERROR 801 SE
 * REINICIA LA BAADER"— y hasta hace poco vivía en un bloque aparte que nadie
 * leía. Ahora cada nota va pegada a la parada que explica.
 */
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'

/**
 * Los comentarios que Shoplogix marca para el turno COMPLETO.
 *
 * Vienen con `f`/`h` cubriendo la jornada entera (07:45→15:30), así que no
 * describen una parada y `notasPorCausa` los descarta. Hasta ahora se perdían:
 * el 07-08 el operador anotó «Se abren guías de bronce baader 200» —una falla
 * mecánica de la máquina— y esa línea no la leía nadie.
 */
export function notasDelTurno(comments: PublicMonitorLive['comments']): string[] {
  const MIN_DUR_MS = 2 * 60 * 60_000
  const out: string[] = []
  for (const c of comments ?? []) {
    const texto = (c.t ?? '').trim()
    if (!texto || !c.f || !c.h) continue
    const a = Date.parse(c.f)
    const b = Date.parse(c.h)
    if (Number.isNaN(a) || Number.isNaN(b) || b - a <= MIN_DUR_MS) continue
    /*
     * La línea viene armada de acá, comillas incluidas: la causa va FUERA de
     * las comillas —«Se abren guías de bronce» — Baader 200/PERNOS/RESORTES—
     * porque el operador no la escribió, la puso Shoplogix. Armarla en el JSX
     * dejaba la comilla de cierre después de la causa.
     */
    const linea = c.r ? `«${texto}» — ${c.r}` : `«${texto}»`
    if (!out.includes(linea)) out.push(linea)
  }
  return out
}

/** Un comentario del operador, ubicado en el tiempo. */
export interface NotaDeOperador {
  desde: string
  /** Hora de fin. null cuando el comentario no marca un tramo, solo un instante. */
  hasta: string | null
  texto: string
  /**
   * Su tramo en el eje del gráfico (minutos desde el primer dato), para poder
   * saltar al momento que el operador estaba describiendo. null sin `t0`.
   */
  desdeMin: number | null
  hastaMin: number | null
}

export function notasPorCausa(
  comments: PublicMonitorLive['comments'],
  fmtHora: (iso: string) => string,
  /** Primer tramo con dato: el minuto 0 del eje que comparten los gráficos. */
  t0?: string | null,
): Map<string, NotaDeOperador[]> {
  const MAX_DUR_MS = 2 * 60 * 60_000
  const t0Ms = t0 ? Date.parse(t0) : NaN
  const base = Number.isNaN(t0Ms) ? null : t0Ms
  const out = new Map<string, NotaDeOperador[]>()
  for (const c of comments ?? []) {
    const texto = (c.t ?? '').trim()
    if (!texto || !c.r || !c.f) continue
    const a = Date.parse(c.f)
    if (Number.isNaN(a)) continue
    const b = c.h ? Date.parse(c.h) : a
    if (!Number.isNaN(b) && b - a > MAX_DUR_MS) continue
    const lista = out.get(c.r) ?? []
    if (lista.some((n) => n.texto === texto)) continue   // el mismo viene duplicado
    if (lista.length >= 2) continue
    /*
     * El comentario YA venía con tramo (`c.f`/`c.h`) y se estaba tirando el
     * final: en pantalla decía «09:17 · atrapamiento cuchillos» sin decir
     * hasta cuándo, que es justo lo que se pregunta al leerlo.
     */
    const tieneTramo = !Number.isNaN(b) && b > a
    lista.push({
      desde: fmtHora(c.f),
      hasta: tieneTramo ? fmtHora(new Date(b).toISOString()) : null,
      texto,
      desdeMin: base == null ? null : (a - base) / 60_000,
      hastaMin: base == null ? null : ((tieneTramo ? b : a) - base) / 60_000,
    })
    out.set(c.r, lista)
  }
  return out
}
