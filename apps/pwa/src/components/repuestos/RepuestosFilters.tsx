import { Search, X } from 'lucide-react'
import { Input, Button } from '@/components/ui'

interface RepuestosFiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  onClearFilters: () => void
}

export function RepuestosFilters({
  searchQuery,
  onSearchChange,
  onClearFilters,
}: RepuestosFiltersProps) {
  const hasActiveFilters = searchQuery !== ''

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search input — includes código SAP, texto breve, descripción y código fabricante */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por código SAP, fabricante, nombre o descripción..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
