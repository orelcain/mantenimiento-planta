/**
 * Segmentos del selector de línea del monitor, por `plantLineId`: orden fijo (Eviscerado, Filete, Yal) y agrupados por
 * planta. El rótulo sale de la config (`nombrePlanta.ts`), nunca del documento. Lo usan el selector del monitor
 * (`SelectorLinea`) y el cambio de línea de supervisor (`CambioDeLinea`).
 */
import type { ReactNode } from 'react'
import type { Segment } from '@/components/piel'
import { grupoDeLinea, lineaDeMonitor, ordenSelector, rotuloSelector } from './nombrePlanta'
import { AyudaReferencia } from './AyudaReferencia'

export function segmentosDeLineas(ids: readonly string[], nombreRespaldo: (id: string) => string = (id) => id): Array<Segment<string>> {
  return [...ids]
    .sort((a, b) => ordenSelector(a) - ordenSelector(b))
    .map((id) => {
      const linea = lineaDeMonitor(id)
      if (!linea) return { value: id, label: nombreRespaldo(id) }
      const g = grupoDeLinea(linea)
      const referencia = g.clave === 'referencia'
      const titulo: ReactNode = referencia ? <>{g.titulo} <AyudaReferencia /></> : g.titulo
      const tituloCorto: ReactNode = referencia ? <>{g.tituloCorto} <AyudaReferencia /></> : g.tituloCorto
      return {
        value: id,
        label: rotuloSelector(linea),
        grupo: { clave: g.clave, titulo, tituloCorto, ajustado: referencia, atenuado: referencia },
      }
    })
}
