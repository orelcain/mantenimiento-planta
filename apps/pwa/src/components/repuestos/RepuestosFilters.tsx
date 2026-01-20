import { Search, X } from 'lucide-react'
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button, Badge } from '@/components/ui'
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

  const handleTagToggle = (tagNombre: string) => {
    if (selectedTags.includes(tagNombre)) {
      onTagsChange(selectedTags.filter((t) => t !== tagNombre))
    } else {
      onTagsChange([...selectedTags, tagNombre])
    }
  }

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Stock filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Stock:</span>
          <Select value={stockFilter} onValueChange={onStockFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="with-stock">Con stock</SelectItem>
              <SelectItem value="without-stock">Sin stock</SelectItem>
              <SelectItem value="low-stock">Stock bajo (&lt;5)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Solicitud filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Solicitud:</span>
          <Select value={solicitudFilter} onValueChange={onSolicitudFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="with-solicitud">Con solicitud</SelectItem>
              <SelectItem value="without-solicitud">Sin solicitud</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tags filter */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Tags:</span>
          {availableTags.map((tag) => {
            const isSelected = selectedTags.includes(tag.nombre)
            return (
              <Badge
                key={tag.nombre}
                variant={isSelected ? 'default' : 'outline'}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleTagToggle(tag.nombre)}
              >
                {tag.nombre}
                {tag.tipo && (
                  <span className="ml-1 text-xs opacity-75">
                    ({tag.tipo === 'stock' ? '📦' : '📋'})
                  </span>
                )}
              </Badge>
            )
          })}
        </div>
      )}

      {/* Active filters summary */}
      {hasActiveFilters && (
        <div className="text-xs text-muted-foreground">
          Filtros activos:{' '}
          {searchQuery && <span className="font-medium">búsqueda</span>}
          {searchQuery && (selectedTags.length > 0 || stockFilter !== 'all' || solicitudFilter !== 'all') && ', '}
          {selectedTags.length > 0 && <span className="font-medium">{selectedTags.length} tag(s)</span>}
          {selectedTags.length > 0 && (stockFilter !== 'all' || solicitudFilter !== 'all') && ', '}
          {stockFilter !== 'all' && <span className="font-medium">stock</span>}
          {stockFilter !== 'all' && solicitudFilter !== 'all' && ', '}
          {solicitudFilter !== 'all' && <span className="font-medium">solicitud</span>}
        </div>
      )}
    </div>
  )
}
