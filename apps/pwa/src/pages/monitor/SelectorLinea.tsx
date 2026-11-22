/**
 * «Eviscerado | Filete»: el selector de línea del monitor v2. Un solo componente para El turno, Análisis y Duelo, en PC
 * y en celular. Cambia de línea con el link público de la otra (`lineasHermanas`), así que funciona sin sesión; al
 * cambiar, la página conserva la pestaña (`rutaMonitorConservandoVista`). Sin línea hermana, no se muestra.
 */
import { SegmentedControl } from '@/components/piel'
import { segmentosDeLineas } from './segmentosLinea'

/** Las otras líneas con monitor vigente (`lineasHermanas`, con su `plantLineId`) y la clave de esta (`actual`). */
export interface LineasMonitor {
  /** `plantLineId` de la línea que se mira. */
  actual: string
  hermanas: Array<{ nombre: string; token: string; plantLineId?: string }>
  onIr: (token: string) => void
}

export function SelectorLinea({ lineas, className, disposicion = 'apilada' }: { lineas: LineasMonitor | null | undefined; className?: string; disposicion?: 'apilada' | 'en-linea' }) {
  if (!lineas || lineas.hermanas.length === 0) return null
  const ids = [lineas.actual, ...lineas.hermanas.map((h) => h.plantLineId).filter((x): x is string => !!x)]
  const porId = new Map(lineas.hermanas.filter((h) => h.plantLineId).map((h) => [h.plantLineId as string, h.token]))
  return (
    <div className={className}>
      <SegmentedControl
        ariaLabel="Línea del monitor"
        value={lineas.actual}
        segments={segmentosDeLineas(ids, (id) => lineas.hermanas.find((h) => h.plantLineId === id)?.nombre ?? id)}
        disposicionGrupos={disposicion}
        onChange={(id) => {
          const token = porId.get(id)
          if (token != null) lineas.onIr(token)
        }}
      />
    </div>
  )
}
