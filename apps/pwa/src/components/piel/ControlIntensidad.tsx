/**
 * ControlIntensidad — «Día · Penumbra · Automático» de la paleta Pizarra.
 *
 * Vive en el menú de usuario (a dos toques desde cualquier pantalla), en una fila
 * propia a todo el ancho del menú. Solo se muestra con Pizarra activa: sin ella
 * devuelve null y el selector Sol/Luna de siempre queda como está. Se recuerda por
 * dispositivo (`app-intensidad`).
 *
 * Etiquetas cortas (Día · Noche · Auto): el menú mide ~196 px y cada botón deja
 * ~58 px útiles; «Penumbra» necesita 60 y «Automático» 69 y se truncaban. El nombre
 * completo queda para lectores de pantalla (sr-only) y para el tooltip nativo.
 */
import { SegmentedControl, type Segment } from '@/components/piel/SegmentedControl'
import { useTheme } from '@/hooks/useTheme'
import { paletaPizarraActiva, type Intensidad } from '@/lib/intensidad'

function etiqueta(corta: string, completa: string) {
  return (
    <span title={completa}>
      <span aria-hidden="true">{corta}</span>
      <span className="sr-only">{completa}</span>
    </span>
  )
}

const SEGMENTOS: readonly Segment<Intensidad>[] = [
  { value: 'dia', label: etiqueta('Día', 'Día') },
  { value: 'penumbra', label: etiqueta('Noche', 'Penumbra') },
  { value: 'auto', label: etiqueta('Auto', 'Automático') },
]

export function ControlIntensidad() {
  // Sin Pizarra ni se monta el hook: el selector de siempre queda intacto.
  return paletaPizarraActiva() ? <Selector /> : null
}

function Selector() {
  const { intensidad, setIntensidad } = useTheme()
  return (
    <div className="border-b border-border p-1">
      <SegmentedControl
        value={intensidad}
        onChange={setIntensidad}
        segments={SEGMENTOS}
        ariaLabel="Intensidad de la pantalla"
        // 48 px de alto (jurado): pista y botones; texto de 13 px sin relleno lateral.
        className="h-12 [&_button]:h-12 [&_button>span]:px-0 [&_button>span]:text-footnote"
      />
    </div>
  )
}
