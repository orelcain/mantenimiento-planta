/**
 * La paleta del DUEÑO de una pérdida, en un solo lugar.
 *
 * La usan «Qué pasó en el turno» y el Pareto «Qué se repite»: si cada bloque
 * escribiera sus clases, un día Mantención sería ámbar en uno y naranja en el
 * otro — y el color es parte del lenguaje (ámbar = equipos, celeste = externo,
 * gris = nadie lo anotó). Tintes vivos solo en texto chico (§1.4 de la piel).
 */
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'

export const DUENO_UI: Record<DuenoPerdida, { clase: string; barra: string; corto: string }> = {
  /*
   * `barra` es el mismo lenguaje en RELLENO, con tokens: una barra que dice de
   * quién es la pérdida se lee sin pasar por la etiqueta. Rellenos grandes no
   * llevan tinte vivo (§1.4), por eso el gris va suavizado y el acento se toma
   * de `primary` en vez de un celeste crudo.
   */
  mantencion: { clase: 'text-amber-700 dark:text-amber-400', barra: 'bg-ink-warn', corto: 'Mantención · equipos' },
  externo: { clase: 'text-sky-700 dark:text-sky-300', barra: 'bg-primary', corto: 'Externo' },
  'sin-imputar': { clase: 'text-muted-foreground', barra: 'bg-muted-foreground/[0.45]', corto: 'Sin imputar' },
  programado: { clase: 'text-slate-600 dark:text-slate-300', barra: 'bg-muted-foreground/[0.3]', corto: 'Programado' },
}
