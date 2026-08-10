/**
 * CatalogoPublicPage — Buscador de códigos de fabricante, 100% público.
 *
 * Pensado para pasarle el link (o el QR) a alguien de bodega: escribe el número
 * grabado en la pieza y ve qué es, de qué máquina y en qué conjunto/página del
 * manual está. Sin sesión, sin sidebar, sin acceso al resto de la app.
 *
 * - NO requiere autenticación: los catálogos son JSON estáticos ya públicos
 *   (`/data/codigos-fabricante/*.json`), así que no se toca Firestore.
 * - En modo invitado se OMITEN a propósito el enlace al PDF del manual
 *   (documento del fabricante, solo para gente logueada) y el cruce contra el
 *   maestro de repuestos.
 * - `noindex` para que el link circule sin quedar indexado en buscadores.
 * - Ruta: /catalogo
 */
import { useEffect } from 'react'
import { ScanSearch } from 'lucide-react'
import { CodigosFabricanteView } from '@/pages/repuestos/CodigosFabricanteView'

export function CatalogoPublicPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Códigos de fabricante · Antarfood'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.title = prevTitle
      meta.remove()
    }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3 sm:px-6">
          <ScanSearch className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-foreground">Códigos de fabricante · Antarfood</h1>
            <p className="truncate text-caption text-muted-foreground">Consulta de despieces oficiales · solo lectura</p>
          </div>
        </div>
      </header>
      <CodigosFabricanteView publico />
    </div>
  )
}
