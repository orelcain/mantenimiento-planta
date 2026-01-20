import { useState, useMemo } from 'react'
import { Search, MoreVertical, Zap } from 'lucide-react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge } from '@/components/ui'
import type { PlantAsset } from '@/types/repuestos'

interface MotorasBombasTableProps {
  assets: PlantAsset[]
  loading: boolean
  onSelect: (asset: PlantAsset) => void
}

export function MotorasBombasTable({ assets, loading, onSelect }: MotorasBombasTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'all' | 'motor' | 'bomba'>('all')

  const filtered = useMemo(() => {
    let result = assets

    // Filtro por tipo
    if (tipoFilter !== 'all') {
      result = result.filter((a) => a.tipo === tipoFilter)
    }

    // Búsqueda por texto
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((a) => {
        return (
          a.equipo?.toLowerCase().includes(query) ||
          a.area?.toLowerCase().includes(query) ||
          a.componente?.toLowerCase().includes(query) ||
          a.marca?.toLowerCase().includes(query) ||
          a.codigoSAP?.toLowerCase().includes(query)
        )
      })
    }

    return result
  }, [assets, searchQuery, tipoFilter])

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando motores y bombas...</div>
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por equipo, área, marca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as any)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="motor">Motores</SelectItem>
            <SelectItem value="bomba">Bombas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Tipo</th>
                <th className="px-4 py-2 text-left font-semibold">Equipo</th>
                <th className="px-4 py-2 text-left font-semibold">Área</th>
                <th className="px-4 py-2 text-left font-semibold">Componente</th>
                <th className="px-4 py-2 text-left font-semibold">Marca</th>
                <th className="px-4 py-2 text-left font-semibold">Potencia</th>
                <th className="px-4 py-2 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {searchQuery || tipoFilter !== 'all'
                      ? 'No se encontraron motores o bombas'
                      : 'No hay motores o bombas registradas'}
                  </td>
                </tr>
              ) : (
                filtered.map((asset) => (
                  <tr key={asset.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <Badge variant={asset.tipo === 'motor' ? 'default' : 'secondary'}>
                        <Zap className="h-3 w-3 mr-1" />
                        {asset.tipo === 'motor' ? 'Motor' : 'Bomba'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{asset.equipo || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{asset.area || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{asset.componente || '-'}</td>
                    <td className="px-4 py-3">{asset.marca || '-'}</td>
                    <td className="px-4 py-3">
                      {asset.potencia ? (
                        <span className="font-mono text-sm">{asset.potencia}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelect(asset)}
                        className="h-8 w-8 p-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground">
        Mostrando {filtered.length} de {assets.length} motores/bombas
      </div>
    </div>
  )
}
