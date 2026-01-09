import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Camera,
  Plus,
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import type { PhotoEvidence, PhotoEvidenceStatus } from '@/types'
import { cn } from '@/lib/utils'

interface PhotoEvidenceCardProps {
  evidence: PhotoEvidence
  onClick?: () => void
  onAddAfterPhotos?: () => void
  compact?: boolean
}

const STATUS_CONFIG: Record<PhotoEvidenceStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendiente: {
    label: 'Pendiente',
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    icon: Clock,
  },
  en_proceso: {
    label: 'En Proceso',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    icon: AlertCircle,
  },
  corregida: {
    label: 'Corregida',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
    icon: CheckCircle,
  },
  verificada: {
    label: 'Verificada',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    icon: CheckCircle,
  },
}

export function PhotoEvidenceCard({
  evidence,
  onClick,
  onAddAfterPhotos,
  compact = false,
}: PhotoEvidenceCardProps) {
  const safeFormat = (date: Date, fmt: string) => {
    try {
      return format(date, fmt, { locale: es })
    } catch {
      return ''
    }
  }
  const statusConfig = STATUS_CONFIG[evidence.status]
  const StatusIcon = statusConfig.icon
  const hasBeforePhotos = evidence.fotosBefore.length > 0
  const hasAfterPhotos = evidence.fotosAfter.length > 0

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={onClick}
      >
        {/* Thumbnail */}
        <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
          {hasBeforePhotos && evidence.fotosBefore[0] ? (
            <img
              src={evidence.fotosBefore[0].url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          {/* Badge de cantidad de fotos */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
            {evidence.fotosBefore.length} / {evidence.fotosAfter.length}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{evidence.titulo}</h4>
          {evidence.hierarchyPath && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {evidence.hierarchyPath}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge className={cn('text-[10px] px-1.5 py-0', statusConfig.color)}>
              {statusConfig.label}
            </Badge>
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </div>
    )
  }

  return (
    <Card className="overflow-hidden">
      {/* Header con fotos */}
      <div className="relative">
        {/* Grid de thumbnails */}
        <div className="grid grid-cols-2 h-32">
          {/* Antes */}
          <div className="relative border-r border-border">
            {hasBeforePhotos && evidence.fotosBefore[0] ? (
              <img
                src={evidence.fotosBefore[0].url}
                alt="Antes"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Camera className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-medium rounded">
              ANTES ({evidence.fotosBefore.length})
            </div>
          </div>

          {/* Después */}
          <div className="relative">
            {hasAfterPhotos && evidence.fotosAfter[0] ? (
              <img
                src={evidence.fotosAfter[0].url}
                alt="Después"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                {evidence.status === 'pendiente' || evidence.status === 'en_proceso' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onAddAfterPhotos?.()
                    }}
                    className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Plus className="w-8 h-8" />
                    <span className="text-xs">Agregar</span>
                  </button>
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
            )}
            <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-500 text-white text-[10px] font-medium rounded">
              DESPUÉS ({evidence.fotosAfter.length})
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className={cn(
          'absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs font-medium border',
          statusConfig.color
        )}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusConfig.label}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2" onClick={onClick}>
        <h3 className="font-semibold text-sm line-clamp-1">{evidence.titulo}</h3>
        
        {evidence.descripcion && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {evidence.descripcion}
          </p>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {evidence.hierarchyPath && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span className="truncate max-w-[150px]">{evidence.hierarchyPath}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {safeFormat(evidence.createdAt, "d MMM ''yy")}
          </span>
        </div>

        {/* Tags */}
        {evidence.tags && evidence.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {evidence.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
            {evidence.tags.length > 3 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                +{evidence.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
