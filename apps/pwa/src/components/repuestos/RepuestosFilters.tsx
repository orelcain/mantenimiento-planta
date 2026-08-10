import { Search, X } from 'lucide-react'
import { Input, Button } from '@/components/ui'

interface RepuestosFiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  onClearFilters: () => void
  filterTipo?: string | null
  onFilterTipoChange?: (tipo: string | null) => void
  tiposDisponibles?: string[]
}

export function RepuestosFilters({
  searchQuery,
  onSearchChange,
  onClearFilters,
  filterTipo = null,
  onFilterTipoChange,
  tiposDisponibles = [],
}: RepuestosFiltersProps) {
  const hasActiveFilters = searchQuery !== '' || filterTipo !== null

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

      {/* Chips de tipo */}
      {tiposDisponibles.length > 0 && onFilterTipoChange && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-nowrap">
          {/* Chip "Todos" */}
          <button
            onClick={() => onFilterTipoChange(null)}
            className={`shrink-0 text-caption px-2 py-0.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
              filterTipo === null
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
            }`}
          >
            Todos
          </button>
          {tiposDisponibles.slice(0, 12).map((tipo) => (
            <button
              key={tipo}
              onClick={() => onFilterTipoChange(filterTipo === tipo ? null : tipo)}
              className={`shrink-0 text-caption px-2 py-0.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
                filterTipo === tipo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {tipo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
