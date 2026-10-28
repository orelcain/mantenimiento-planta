/**
 * «Eviscerado | Filete»: el selector de línea del monitor v2. Un solo componente para El turno, Análisis y Duelo, en PC
 * y en celular. Cambia de línea con el link público de la otra (`lineasHermanas`), así que funciona sin sesión; al
 * cambiar, la página conserva la pestaña (`rutaMonitorConservandoVista`). Sin línea hermana, no se muestra.
 */
import { SegmentedControl } from '@/components/piel'

/** Las otras líneas de la planta con monitor vigente (`lineasHermanas`) y el nombre de esta. */
export interface LineasMonitor {
  actual: string
  hermanas: Array<{ nombre: string; token: string }>
  onIr: (token: string) => void
}

export function SelectorLinea({ lineas, className }: { lineas: LineasMonitor | null | undefined; className?: string }) {
  if (!lineas || lineas.hermanas.length === 0) return null
  const todas = [{ nombre: lineas.actual, token: '' }, ...lineas.hermanas].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  return (
    <div className={className}>
      <SegmentedControl
        ariaLabel="Línea del monitor"
        value={lineas.actual}
        segments={todas.map((l) => ({ value: l.nombre, label: l.nombre }))}
        onChange={(nombre) => {
          const destino = lineas.hermanas.find((h) => h.nombre === nombre)
          if (destino) lineas.onIr(destino.token)
        }}
      />
    </div>
  )
}
