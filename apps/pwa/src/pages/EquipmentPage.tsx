import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Wrench, MapPin } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Label,
  Textarea,
  Checkbox,
} from '@/components/ui'
import { useAppStore } from '@/store'
import { getEquipments, updateEquipment } from '@/services/equipment'
import type { Equipment } from '@/types'
import { updateEquipmentSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { debounce } from '@/lib/rate-limit'
import { usePermissions } from '@/hooks/usePermissions'

const STATUS_CONFIG = {
  operativo: { label: 'Operativo', className: 'bg-success text-success-foreground' },
  en_mantenimiento: { label: 'En Mantenimiento', className: 'bg-warning text-warning-foreground' },
  fuera_servicio: { label: 'Fuera de Servicio', className: 'bg-destructive text-destructive-foreground' },
}

const CRITICIDAD_CONFIG = {
  alta: { label: 'Alta', className: 'bg-destructive text-destructive-foreground' },
  media: { label: 'Media', className: 'bg-warning text-warning-foreground' },
  baja: { label: 'Baja', className: 'bg-muted text-muted-foreground' },
}

export function EquipmentPage() {
  const navigate = useNavigate()
  const { equipment, setEquipment } = useAppStore()
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Debounced search
  const debouncedSetSearch = debounce((value: string) => {
    setSearchQuery(value)
    logger.info('Equipment search', { query: value })
  }, 300)

  // Cargar datos
  useEffect(() => {
    getEquipments().then(setEquipment)
  }, [setEquipment])

  // Filtrar equipos
  const filteredEquipment = equipment.filter((eq) => {
    if (eq.deleted) return false
    const matchesSearch =
      eq.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      eq.codigo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (eq.hierarchyPath?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)

    const matchesStatus = filterStatus === 'all' || eq.estado === filterStatus
    
    return matchesSearch && matchesStatus
  })

  // Stats
  const stats = {
    total: equipment.length,
    operativos: equipment.filter((e) => e.estado === 'operativo').length,
    enMantenimiento: equipment.filter((e) => e.estado === 'en_mantenimiento').length,
    fueraServicio: equipment.filter((e) => e.estado === 'fuera_servicio').length,
  }

  const handleEdit = (eq: Equipment) => {
    setEditingEquipment(eq)
  }

  const handleViewHierarchy = (eq: Equipment) => {
    const focusId = eq.hierarchyNodeId || eq.id
    const q = encodeURIComponent(eq.codigo)
    const focus = encodeURIComponent(focusId)
    navigate(`/hierarchy?q=${q}&focus=${focus}`)
  }

  const handleCloseForm = () => {
    setEditingEquipment(null)
  }

  const handleSuccess = async () => {
    handleCloseForm()
    const updated = await getEquipments()
    setEquipment(updated)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equipos</h1>
          <p className="text-muted-foreground">Se sincroniza automáticamente desde la jerarquía</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-success">{stats.operativos}</div>
            <div className="text-sm text-muted-foreground">Operativos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-warning">{stats.enMantenimiento}</div>
            <div className="text-sm text-muted-foreground">En Mantenimiento</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">{stats.fueraServicio}</div>
            <div className="text-sm text-muted-foreground">Fuera de Servicio</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o código..."
                defaultValue={searchQuery}
                onChange={(e) => debouncedSetSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="operativo">Operativo</SelectItem>
                <SelectItem value="en_mantenimiento">En Mantenimiento</SelectItem>
                <SelectItem value="fuera_servicio">Fuera de Servicio</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Equipment List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredEquipment.length === 0 ? (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center">
              <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No hay equipos</h3>
              <p className="text-muted-foreground">
                {searchQuery || filterStatus !== 'all'
                  ? 'No se encontraron equipos con los filtros aplicados'
                  : 'Aún no hay equipos sincronizados desde la jerarquía'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredEquipment.map((eq) => (
            <EquipmentCard
              key={eq.id}
              equipment={eq}
              onClick={() => handleEdit(eq)}
              onViewHierarchy={() => handleViewHierarchy(eq)}
            />
          ))
        )}
      </div>

      {/* Form Modal */}
      {editingEquipment && (
        <EquipmentForm
          equipment={editingEquipment}
          onClose={handleCloseForm}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

function EquipmentCard({
  equipment,
  onClick,
  onViewHierarchy,
}: {
  equipment: Equipment
  onClick: () => void
  onViewHierarchy: () => void
}) {
  const statusConfig = STATUS_CONFIG[equipment.estado]
  const criticidadConfig = CRITICIDAD_CONFIG[equipment.criticidad]

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{equipment.nombre}</CardTitle>
            <p className="text-sm text-muted-foreground font-mono">{equipment.codigo}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
            {equipment.syncExcluded && (
              <Badge variant="outline" className="text-muted-foreground">
                Excluido
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="space-y-2 text-sm">
          {(equipment.hierarchyPath || equipment.zoneId) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {equipment.hierarchyPath || equipment.zoneId}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onViewHierarchy()
              }}
              title="Ver este equipo en la jerarquía"
            >
              Ver jerarquía
            </Button>
          </div>
          {equipment.marca && (
            <div className="text-muted-foreground">
              {equipment.marca} {equipment.modelo}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Criticidad:</span>
            <Badge variant="outline" className={criticidadConfig.className}>
              {criticidadConfig.label}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EquipmentForm({
  equipment,
  onClose,
  onSuccess,
}: {
  equipment: Equipment
  onClose: () => void
  onSuccess: () => void
}) {
  const { canDeleteEquipment, canEditEquipment } = usePermissions()
  const [isLoading, setIsLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    codigo: equipment.codigo || '',
    nombre: equipment.nombre || '',
    descripcion: equipment.descripcion || '',
    marca: equipment.marca || '',
    modelo: equipment.modelo || '',
    numeroSerie: equipment.numeroSerie || '',
    syncExcluded: Boolean(equipment.syncExcluded),
    criticidad: equipment.criticidad || ('media' as Equipment['criticidad']),
    estado: equipment.estado || ('operativo' as Equipment['estado']),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canEditEquipment) {
      setValidationErrors({ general: 'No tienes permisos para editar equipos.' })
      return
    }

    setIsLoading(true)
    setValidationErrors({})

    try {
      const dataToValidate = {
        // En edición no permitimos cambiar código/nombre (vienen de la jerarquía)
        codigo: equipment.codigo,
        nombre: equipment.nombre,
        descripcion: formData.descripcion || undefined,
        marca: formData.marca || undefined,
        modelo: formData.modelo || undefined,
        numeroSerie: formData.numeroSerie || undefined,
        criticidad: formData.criticidad,
        estado: formData.estado,
      }

      // Validar con Zod
      const validation = updateEquipmentSchema.safeParse(dataToValidate)
      
      if (!validation.success) {
        const errors: Record<string, string> = {}
        validation.error.issues.forEach((err) => {
          const path = err.path.map((p) => String(p)).join('.')
          errors[path] = err.message
        })
        setValidationErrors(errors)
        logger.warn('Equipment validation failed', { errors })
        return
      }

      logger.info('Updating equipment', { equipmentId: equipment.id, codigo: equipment.codigo })

      await updateEquipment(equipment.id, {
        descripcion: formData.descripcion || undefined,
        marca: formData.marca || undefined,
        modelo: formData.modelo || undefined,
        numeroSerie: formData.numeroSerie || undefined,
        syncExcluded: formData.syncExcluded,
        criticidad: formData.criticidad,
        estado: formData.estado,
      })
      
      logger.info('Equipment saved successfully', { codigo: formData.codigo })
      onSuccess()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error saving equipment')
      logger.error('Error saving equipment', err)
      setValidationErrors({ general: 'Error al guardar el equipo. Por favor intenta de nuevo.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!canDeleteEquipment) {
      setValidationErrors({ general: 'No tienes permisos para eliminar equipos.' })
      return
    }

    const ok = window.confirm(
      `¿Eliminar el equipo "${equipment.nombre}" (${equipment.codigo})?\n\nEsto lo oculta del módulo y lo excluye del sync para evitar que se vuelva a crear automáticamente.`
    )
    if (!ok) return

    setIsLoading(true)
    setValidationErrors({})

    try {
      // Eliminación lógica + exclusión: evita que el sync vuelva a crearlo
      logger.info('Soft deleting equipment (exclude from sync)', { equipmentId: equipment.id, codigo: equipment.codigo })
      await updateEquipment(equipment.id, {
        syncExcluded: true,
        deleted: true,
        deletedAt: new Date(),
      })
      logger.info('Equipment soft-deleted successfully', { equipmentId: equipment.id })
      onSuccess()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error deleting equipment')
      logger.error('Error deleting equipment', err)
      setValidationErrors({ general: 'Error al eliminar el equipo. Por favor intenta de nuevo.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Editar Equipo
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {validationErrors.general && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {validationErrors.general}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={formData.codigo}
                disabled
                required
              />
              {validationErrors.codigo && (
                <p className="text-sm text-destructive">{validationErrors.codigo}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                disabled
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Descripción del equipo..."
              rows={2}
            />
            {validationErrors.descripcion && (
              <p className="text-sm text-destructive">{validationErrors.descripcion}</p>
            )}
          </div>

          {canDeleteEquipment && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="syncExcluded"
                checked={formData.syncExcluded}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, syncExcluded: checked === true })
                }
                disabled={isLoading}
              />
              <Label htmlFor="syncExcluded" className="text-sm">
                Excluir del sync (no se actualizará/creará desde jerarquía)
              </Label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="marca">Marca</Label>
              <Input
                id="marca"
                value={formData.marca}
                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                placeholder="Siemens"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelo">Modelo</Label>
              <Input
                id="modelo"
                value={formData.modelo}
                onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                placeholder="XYZ-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="criticidad">Criticidad</Label>
              <Select
                value={formData.criticidad}
                onValueChange={(value: Equipment['criticidad']) =>
                  setFormData({ ...formData, criticidad: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={formData.estado}
                onValueChange={(value: Equipment['estado']) =>
                  setFormData({ ...formData, estado: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operativo">Operativo</SelectItem>
                  <SelectItem value="en_mantenimiento">En Mantenimiento</SelectItem>
                  <SelectItem value="fuera_servicio">Fuera de Servicio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            {canDeleteEquipment && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
              >
                Eliminar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !canEditEquipment}>
              {isLoading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
