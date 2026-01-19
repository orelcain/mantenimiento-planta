import { PackageSearch, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui'

interface EmptyStateProps {
  hasFilters: boolean
  onClearFilters: () => void
}

export function EmptyState({ hasFilters, onClearFilters }: EmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="rounded-full bg-muted p-3 mb-4">
          <Filter className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No se encontraron resultados</h3>
        <p className="text-muted-foreground mb-4 max-w-md">
          No hay repuestos que coincidan con los filtros aplicados. Intenta ajustar tus criterios de búsqueda.
        </p>
        <Button variant="outline" onClick={onClearFilters}>
          <X className="h-4 w-4 mr-2" />
          Limpiar filtros
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-muted p-3 mb-4">
        <PackageSearch className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No hay repuestos aún</h3>
      <p className="text-muted-foreground max-w-md">
        Esta máquina no tiene repuestos registrados. Haz clic en "Agregar repuesto" para comenzar.
      </p>
    </div>
  )
}
