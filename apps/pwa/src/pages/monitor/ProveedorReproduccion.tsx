/**
 * UN reloj para toda la página del monitor (spec §2): la cola de reproducción vive aquí, arriba de todo, y se reparte por
 * contexto a lo que se mueve — «El turno» (`MonitorV2`), el Duelo en PC, el Duelo en celular y la cifra grande del Modo TV
 * (`?pantalla=1`, que usa el monitor clásico). Así las cifras de TODAS las pantallas salen del mismo instante reproducido y
 * no de relojes que se registran en momentos distintos.
 *
 * También entrega `VistaVivaCtx` (hechas, cuota en la hora del cuadro, «A esta hora») a los bloques del monitor clásico, que no
 * pasan por `MonitorV2`; el v2 vuelve a proveerlo con sus propios valores, que son los mismos.
 */
import { useMemo, type ReactNode } from 'react'
import { cuotaA } from '@/services/shoplogix/monitorCompare'
import { minutoDeDatos } from './aEstaHora'
import type { EntradaRep, Tope } from './reproduccionMinuto'
import { VistaVivaCtx, type VistaViva } from './useCifrasVivas'
import { ReproduccionCtx, useReproduccionMinuto } from './useReproduccionMinuto'

export function ProveedorReproduccion({ entrada, tope, optimal, primeraPiezaMs, meta, mostradas, cerrado, children }: {
  entrada: EntradaRep | null
  tope: Tope | null
  /** La curva de la cuota y su origen (la de «A esta hora»): sin ellas no hay cuota viva. */
  optimal: Parameters<typeof cuotaA>[0] | null
  primeraPiezaMs: number | null
  meta: number | null
  /** Las piezas en reposo (`piezasMostradas`): el respaldo mientras el reloj no tiene lectura. */
  mostradas: number
  cerrado: boolean
  children: ReactNode
}) {
  const rep = useReproduccionMinuto(entrada, tope)
  const cuotaEn = useMemo(
    () => (optimal && primeraPiezaMs != null ? (tMs: number) => cuotaA(optimal, minutoDeDatos(tMs, primeraPiezaMs), meta) : null),
    [optimal, primeraPiezaMs, meta],
  )
  const vista = useMemo<VistaViva | null>(
    () => (rep.activa ? { reloj: rep.reloj, cuotaEn, meta, mostradas, cerrado } : null),
    [rep.activa, rep.reloj, cuotaEn, meta, mostradas, cerrado],
  )
  return (
    <ReproduccionCtx.Provider value={rep}>
      <VistaVivaCtx.Provider value={vista}>{children}</VistaVivaCtx.Provider>
    </ReproduccionCtx.Provider>
  )
}
