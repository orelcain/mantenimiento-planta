/**
 * La paleta del DUEÑO de una pérdida, en un solo lugar.
 *
 * La usan «Qué pasó en el turno» y el Pareto «Qué se repite»: si cada bloque
 * escribiera sus clases, un día Mantención sería ámbar en uno y naranja en el
 * otro — y el color es parte del lenguaje (ámbar = equipos, celeste = externo,
 * gris = nadie lo anotó). Tintes vivos solo en texto chico (§1.4 de la piel).
 */
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'

export const DUENO_UI: Record<DuenoPerdida, { clase: string; corto: string }> = {
  mantencion: { clase: 'text-amber-700 dark:text-amber-400', corto: 'Mantención · equipos' },
  externo: { clase: 'text-sky-700 dark:text-sky-300', corto: 'Externo' },
  'sin-imputar': { clase: 'text-muted-foreground', corto: 'Sin imputar' },
  programado: { clase: 'text-slate-600 dark:text-slate-300', corto: 'Programado' },
}
