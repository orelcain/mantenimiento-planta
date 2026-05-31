import { useState, useMemo, Fragment } from 'react'
import { Search, MoreVertical, Zap, ImageOff } from 'lucide-react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge } from '@/components/ui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { PlantAsset, PlantAssetImagen } from '@/types/repuestos'
import { normalizeForSearch } from '@/utils/repuestos'

interface MotorasBombasTableProps {
  assets: PlantAsset[]
  loading: boolean
  onSelect: (asset: PlantAsset) => void
}

/** Agrupación = subárea si existe, si no el área (o "Sin área"). */
const groupKeyOf = (a: PlantAsset) => (a.subarea?.trim() || a.area?.trim() || 'Sin área')

/** URLs de las fotos de un asset, principal primero. */
function assetPhotoUrls(asset: PlantAsset): string[] {
  return (asset.imagenes ?? [])
    .slice()
    .sort(
      (a: PlantAssetImagen, b: PlantAssetImagen) =>
        (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0) || (a.orden ?? 0) - (b.orden ?? 0),
    )
    .map((img) => img.url)
    .filter(Boolean)
}

export function MotorasBombasTable({ assets, loading, onSelect }: MotorasBombasTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'all' | 'motor' | 'bomba'>('all')
  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null)

  // Áreas/subáreas con su conteo (para los chips)
  const groups = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of assets) m.set(groupKeyOf(a), (m.get(groupKeyOf(a)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [assets])

  const filtered = useMemo(() => {
    let result = assets
    if (tipoFilter !== 'all') result = result.filter((a) => a.tipo === tipoFilter)
    if (areaFilter !== 'all') result = result.filter((a) => groupKeyOf(a) === areaFilter)
    if (searchQuery.trim()) {
      const query = normalizeForSearch(searchQuery)
      result = result.filter((a) =>
        normalizeForSearch(a.equipo).includes(query) ||
        normalizeForSearch(a.area).includes(query) ||
        normalizeForSearch(a.subarea).includes(query) ||
        normalizeForSearch(a.componente).includes(query) ||
        normalizeForSearch(a.marca).includes(query) ||
        normalizeForSearch(a.modeloTipo).includes(query) ||
        normalizeForSearch(a.codigoSAP).includes(query) ||
        normalizeForSearch(a.descripcionSAP).includes(query),
      )
    }
    return result
  }, [assets, searchQuery, tipoFilter, areaFilter])

  // Filas agrupadas por área/subárea (para encabezados de sección)
  const grouped = useMemo(() => {
    const m = new Map<string, PlantAsset[]>()
    for (const a of filtered) {
      const k = groupKeyOf(a)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([key, items]) => [key, items.slice().sort((x, y) => x.equipo.localeCompare(y.equipo))] as const)
  }, [filtered])

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando motores y bombas...</div>
  }

  const renderRow = (asset: PlantAsset) => {
    const photos = assetPhotoUrls(asset)
    const thumb = photos[0]
    return (
      <tr key={asset.id} className="hover:bg-muted/50 transition-colors">
        <td className="px-3 py-2">
          {thumb ? (
            <button
              type="button"
              onClick={() => setLightboxPhotos(photos)}
              className="group relative mx-auto block h-11 w-11 overflow-hidden rounded-md border border-border transition-all hover:ring-2 hover:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title={`Ver foto${photos.length > 1 ? `s (${photos.length})` : ''}`}
              aria-label={`Ver foto de ${asset.equipo}`}
            >
              <img src={thumb} alt={asset.equipo} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
              {photos.length > 1 && (
                <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">{photos.length}</span>
              )}
            </button>
          ) : (
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/50" title="Sin foto">
              <ImageOff className="h-4 w-4" />
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <Badge variant={asset.tipo === 'motor' ? 'default' : 'secondary'}>
            <Zap className="h-3 w-3 mr-1" />
            {asset.tipo === 'motor' ? 'Motor' : 'Bomba'}
          </Badge>
        </td>
        <td className="px-4 py-3 font-medium text-foreground">{asset.equipo || '-'}</td>
        <td className="px-4 py-3">
          {asset.modeloTipo ? <span className="font-mono text-xs text-foreground">{asset.modeloTipo}</span> : <span className="text-muted-foreground">-</span>}
        </td>
        <td className="px-4 py-3">
          {asset.codigoSAP ? <span className="font-mono text-xs text-foreground">{asset.codigoSAP}</span> : <span className="text-muted-foreground">-</span>}
          {asset.descripcionSAP && (
            <span className="block max-w-[180px] text-[10px] leading-tight text-muted-foreground" title={asset.descripcionSAP}>{asset.descripcionSAP}</span>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{asset.componente || '-'}</td>
        <td className="px-4 py-3">{asset.marca || '-'}</td>
        <td className="px-4 py-3">
          {asset.potencia ? <span className="font-mono text-sm">{asset.potencia}</span> : <span className="text-muted-foreground">-</span>}
        </td>
        <td className="px-4 py-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => onSelect(asset)} className="h-8 w-8 p-0" title="Ver detalle">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por equipo, modelo, marca, SAP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as any)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="motor">Motores</SelectItem>
            <SelectItem value="bomba">Bombas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Chips por área/subárea */}
      <div className="flex flex-wrap gap-1.5">
        {[{ key: 'all', label: 'Todas', count: assets.length }, ...groups.map(([key, count]) => ({ key, label: key, count }))].map((chip) => (
          <button
            key={chip.key}
            onClick={() => setAreaFilter(chip.key)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
              areaFilter === chip.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted',
            ].join(' ')}
          >
            {chip.label} <span className="opacity-70">{chip.count}</span>
          </button>
        ))}
      </div>

      {/* Tabla agrupada */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-2 text-center font-semibold w-16">Foto</th>
                <th className="px-4 py-2 text-left font-semibold">Tipo</th>
                <th className="px-4 py-2 text-left font-semibold">Equipo</th>
                <th className="px-4 py-2 text-left font-semibold">Modelo</th>
                <th className="px-4 py-2 text-left font-semibold">SAP</th>
                <th className="px-4 py-2 text-left font-semibold">Componente</th>
                <th className="px-4 py-2 text-left font-semibold">Marca</th>
                <th className="px-4 py-2 text-left font-semibold">Potencia</th>
                <th className="px-4 py-2 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {grouped.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    {searchQuery || tipoFilter !== 'all' || areaFilter !== 'all'
                      ? 'No se encontraron motores o bombas'
                      : 'No hay motores o bombas registradas'}
                  </td>
                </tr>
              ) : (
                grouped.map(([groupName, items]) => (
                  <Fragment key={groupName}>
                    {/* Encabezado de sección por área/subárea */}
                    <tr className="bg-muted/30 border-y">
                      <td colSpan={9} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {groupName} <span className="ml-1 opacity-60">({items.length})</span>
                      </td>
                    </tr>
                    {items.map(renderRow)}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground">
        Mostrando {filtered.length} de {assets.length} motores/bombas
        {areaFilter !== 'all' && ` · área: ${areaFilter}`}
      </div>

      {/* Visor de fotos a pantalla completa (pan + zoom) */}
      {lightboxPhotos && <ImageLightbox photos={lightboxPhotos} onClose={() => setLightboxPhotos(null)} />}
    </div>
  )
}
