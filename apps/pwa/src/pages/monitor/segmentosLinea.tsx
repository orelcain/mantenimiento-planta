/**
 * Segmentos del selector de línea del monitor, por `plantLineId`: orden fijo (Eviscerado, Filete, Yal) y agrupados por
 * planta (Yal en su propia pista, sin rótulo). El rótulo sale de la config (`nombrePlanta.ts`), nunca del documento. Lo usan el selector del monitor
 * (`SelectorLinea`) y el cambio de línea de supervisor (`CambioDeLinea`).
 */
import type { Segment } from '@/components/piel'
import { grupoDeLinea, lineaDeMonitor, ordenSelector, rotuloSelector } from './nombrePlanta'

/** Por qué Yal va aparte y atenuada: se lee al pasar el puntero por su botón. */
export const AYUDA_REFERENCIA = 'Yal la mantiene otro equipo de Mantención. Se muestra para comparar.'

export function segmentosDeLineas(ids: readonly string[], nombreRespaldo: (id: string) => string = (id) => id): Array<Segment<string>> {
  return [...ids]
    .sort((a, b) => ordenSelector(a) - ordenSelector(b))
    .map((id) => {
      const linea = lineaDeMonitor(id)
      if (!linea) return { value: id, label: nombreRespaldo(id) }
      const g = grupoDeLinea(linea)
      const referencia = g.clave === 'referencia'
      // Yal (referencia) va sin rótulo de grupo: solo su botón, con la explicación como `title`.
      return {
        value: id,
        label: rotuloSelector(linea),
        title: referencia ? AYUDA_REFERENCIA : undefined,
        grupo: referencia
          ? { clave: g.clave, titulo: null, ajustado: true, atenuado: true }
          : { clave: g.clave, titulo: g.titulo, tituloCorto: g.tituloCorto },
      }
    })
}
