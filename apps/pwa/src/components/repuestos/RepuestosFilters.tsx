import { Search, X } from 'lucide-react'
import { Input, Button } from '@/components/ui'
import type { TagGlobal } from '@/types/tags'

interface RepuestosFiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  stockFilter: 'all' | 'with-stock' | 'without-stock' | 'low-stock'
  onStockFilterChange: (value: 'all' | 'with-stock' | 'without-stock' | 'low-stock') => void
  solicitudFilter: 'all' | 'with-solicitud' | 'without-solicitud'
  onSolicitudFilterChange: (value: 'all' | 'with-solicitud' | 'without-solicitud') => void
  availableTags: TagGlobal[]
  onClearFilters: () => void
}

export function RepuestosFilters({
  searchQuery,
  onSearchChange,
  selectedTags,
  onTagsChange,
  stockFilter,
  onStockFilterChange,
  solicitudFilter,
  onSolicitudFilterChange,
  availableTags,
  onClearFilters,
}: RepuestosFiltersProps) {
  const hasActiveFilters = 
    searchQuery !== '' || 
    selectedTags.length > 0 || 
    stockFilter !== 'all' || 
    solicitudFilter !== 'all'

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por código SAP, texto breve o descripción..."
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
