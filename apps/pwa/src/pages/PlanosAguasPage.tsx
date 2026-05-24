import { useMemo } from 'react'

/**
 * Módulo Planos de Aguas — Planta Principal.
 *
 * Compara las bajadas de agua dulce/salada entre la referencia de Calidad y el
 * plano nuevo PN10 (AQUA014). Carga el HTML standalone
 * (public/planos-aguas.html) dentro de un iframe a pantalla completa.
 *
 * El HTML embebido ya trae sus propios controles (filtros, fundido/cuadrar capa
 * Calidad, fotos por punto, resumen, QR, modo edición).
 *
 * Acceso: ruta privada (cualquier usuario autenticado). La vista también es
 * consultable por QR sin login porque `planos-aguas.html` es un archivo estático
 * público servido directamente.
 */
export function PlanosAguasPage() {
  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return `${basePath}planos-aguas-embed.html?v=${v}`
  }, [])

  return (
    <div className="h-full w-full">
      <iframe
        src={iframeSrc}
        title="Planos de Aguas — Planta Principal"
        className="w-full h-full border-0"
        allow="fullscreen; clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-modals"
      />
    </div>
  )
}
