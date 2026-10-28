/**
 * PR B — las cifras de «El turno» al ritmo de la reproducción del minuto. UN contexto con el reloj de datos de la vista y la
 * cuota en función de la hora (`cuotaEn(t)`), y UN hook que entrega hechas, cuota y «A esta hora» del MISMO instante. Así la
 * franja, Camino a la meta y el ampliado avanzan juntos pieza a pieza y nunca restan piezas de un segundo contra la cuota de
 * otro. El estado cambia solo cuando cambia un entero (una pieza, o una pieza de cuota): no hay un render por cuadro.
 * Con «reducir movimiento» el reloj ya entrega el minuto entero (fraccionRep = 1), así que todo queda en reposo.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { cifrasDelCuadro } from './aEstaHora'
import type { RelojDeDatos } from './useRelojDeDatos'

export interface VistaViva {
  reloj: RelojDeDatos
  /** La cuota (meta a esa hora) en la hora de planta `tMs`. null sin curva de cuota. */
  cuotaEn: ((tMs: number) => number | null) | null
  meta: number | null
  /** Las piezas en reposo (`piezasMostradas`): el respaldo mientras el reloj no tiene lectura. */
  mostradas: number
  cerrado: boolean
}

export const VistaVivaCtx = createContext<VistaViva | null>(null)

export interface CifrasVivas {
  hechas: number
  cuota: number | null
  aHora: number | null
  tMs: number | null
}

const iguales = (a: CifrasVivas, b: CifrasVivas) =>
  Math.round(a.hechas) === Math.round(b.hechas) && Math.round(a.cuota ?? -1) === Math.round(b.cuota ?? -1) && a.aHora === b.aHora
    && Math.floor((a.tMs ?? 0) / 60_000) === Math.floor((b.tMs ?? 0) / 60_000)

/**
 * Las cifras del instante. Fuera del contexto (vista clásica) o con el turno cerrado devuelve null: quien llama usa sus
 * valores de siempre. `vista` permite pasarlo explícito (componentes que reciben el reloj por props).
 */
export function useCifrasVivas(vista?: VistaViva | null): CifrasVivas | null {
  const ctx = useContext(VistaVivaCtx)
  const v = vista ?? ctx
  const [cifras, setCifras] = useState<CifrasVivas | null>(() => (v && !v.cerrado ? cifrasDelCuadro(v.reloj.cuadro(), v.cuotaEn, v.meta, v.mostradas) : null))
  useEffect(() => {
    if (!v || v.cerrado) { setCifras(null); return }
    return v.reloj.alCuadro((c) => {
      const nuevo = cifrasDelCuadro(c, v.cuotaEn, v.meta, v.mostradas)
      setCifras((prev) => (prev && iguales(prev, nuevo) ? prev : nuevo))
    })
  }, [v])
  return cifras
}
