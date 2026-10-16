/**
 * Fila de chips de equipo sobre los resultados: «Todos 41 · Baader 142 30 · Knuro 12».
 *
 * Reemplaza el desplegable «Todos los equipos». Las opciones salen de los RESULTADOS ya filtrados
 * por búsqueda y demás filtros (pero no por esta misma faceta), con filas únicas.
 * Se oculta sola cuando no aporta (≤ 3 filas o una única opción). En el teléfono se desliza en
 * horizontal sin envolver.
 *
 * Sin búsqueda salían 30+ chips y tapaban la pantalla: se muestran los MAX_VISIBLES con más
 * repuestos (más el activo si quedó fuera) y un chip «N más» que despliega el resto.
 */
import { useEffect, useMemo, useState } from 'react'
import { facetasDeEquipo, ocultarFacetas, type Faceta, type FilaConEquipos } from '@/utils/repuestos/facetasEquipo'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import { cn } from '@/lib/utils'

export interface ChipsEquipoProps {
  rows: readonly FilaConEquipos[]
  plantaDe: (nodeId: string) => string | undefined
  faceta: Faceta | null
  onChange: (faceta: Faceta | null) => void
  className?: string
}

/** Cuántos equipos se ven antes de «N más» (una línea en PC). */
export const MAX_VISIBLES = 8

/** Chip de 36 px visibles dentro de una zona táctil de 44 (el alto extra es parte del botón). */
function Chip({ activo, onClick, etiqueta, conteo }: { activo: boolean; onClick: () => void; etiqueta: string; conteo: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="group inline-flex min-h-[44px] shrink-0 items-center"
    >
      <span
        className={cn(
          'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[length:calc(14px*var(--escala-texto,1))] transition-colors',
          activo ? 'bg-primary font-medium text-primary-foreground' : 'bg-card font-normal text-foreground group-hover:bg-muted',
        )}
      >
        {etiqueta}
        <span className={cn('text-footnote font-normal tabular-nums', activo ? 'opacity-80' : 'text-muted-foreground')}>{conteo}</span>
      </span>
    </button>
  )
}

export function ChipsEquipo({ rows, plantaDe, faceta, onChange, className }: ChipsEquipoProps) {
  const facetas = useMemo(() => facetasDeEquipo(rows, plantaDe), [rows, plantaDe])
  const [abierto, setAbierto] = useState(false)
  // Otra búsqueda u otro alcance: vuelve a la vista corta.
  useEffect(() => { setAbierto(false) }, [facetas.nivel, facetas.opciones.length])
  if (ocultarFacetas(rows, facetas)) return null
  const esActiva = (clave: string) => faceta?.nivel === facetas.nivel && faceta.clave === clave
  const ocultas = facetas.opciones.length - MAX_VISIBLES
  const visibles = abierto || ocultas <= 0
    ? facetas.opciones
    : [...facetas.opciones.slice(0, MAX_VISIBLES), ...facetas.opciones.slice(MAX_VISIBLES).filter((o) => esActiva(o.clave))]
  return (
    <div
      role="group"
      aria-label="Filtrar por equipo"
      className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0', className)}
    >
      <Chip activo={!faceta} onClick={() => onChange(null)} etiqueta="Todos" conteo={rows.length} />
      {visibles.map((o) => (
        <Chip
          key={o.clave}
          activo={esActiva(o.clave)}
          onClick={() => onChange({ nivel: facetas.nivel, clave: o.clave })}
          etiqueta={formatNombreSAP(o.etiqueta).nombre || o.etiqueta}
          conteo={o.conteo}
        />
      ))}
      {ocultas > 0 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex min-h-[44px] shrink-0 items-center px-2 text-[length:calc(14px*var(--escala-texto,1))] font-medium text-primary"
        >
          {abierto ? 'Ver menos' : `${ocultas} más`}
        </button>
      )}
    </div>
  )
}
