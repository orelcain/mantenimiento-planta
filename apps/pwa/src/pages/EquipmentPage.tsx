import { useState, useEffect } from 'react'
import { Plus, Search, Wrench, MapPin } from 'lucide-react'
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
} from '@/components/ui'
import { useAppStore } from '@/store'
import { getEquipments, createEquipment, updateEquipment } from '@/services/equipment'
import { getMainZones } from '@/services/zones'
import type { Equipment, Zone } from '@/types'
import { createEquipmentSchema, updateEquipmentSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { debounce } from '@/lib/rate-limit'

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
  const { equipment, setEquipment, zones, setZones } = useAppStore()
  const [showForm, setShowForm] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterZone, setFilterZone] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Debounced search
  const debouncedSetSearch = debounce((value: string) => {
    setSearchQuery(value)
    logger.info('Equipment search', { query: value })
  }, 300)

  // Cargar datos
  useEffect(() => {
    getEquipments().then(setEquipment)
    getMainZones().then(setZones)
  }, [setEquipment, setZones])

  // Filtrar equipos
  const filteredEquipment = equipment.filter((eq) => {
    const matchesSearch =
      eq.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      eq.codigo.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesZone = filterZone === 'all' || eq.zoneId === filterZone
    const matchesStatus = filterStatus === 'all' || eq.estado === filterStatus
    
    return matchesSearch && matchesZone && matchesStatus
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
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
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
          <p className="text-muted-foreground">Gestión de activos y máquinas</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Equipo
        </Button>
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
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <MapPin className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las zonas</SelectItem>
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                {searchQuery || filterZone !== 'all' || filterStatus !== 'all'
                  ? 'No se encontraron equipos con los filtros aplicados'
                  : 'Comienza agregando un nuevo equipo'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredEquipment.map((eq) => (
            <EquipmentCard
              key={eq.id}
              equipment={eq}
              zone={zones.find((z) => z.id === eq.zoneId)}
              onClick={() => handleEdit(eq)}
            />
          ))
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <EquipmentForm
          equipment={editingEquipment}
          zones={zones}
          onClose={handleCloseForm}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

function EquipmentCard({
  equipment,
  zone,
  onClick,
}: {
  equipment: Equipment
  zone?: Zone
  onClick: () => void
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
          <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="space-y-2 text-sm">
          {zone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {zone.nombre}
            </div>
          )}
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
  zones,
  onClose,
  onSuccess,
}: {
  equipment: Equipment | null
  zones: Zone[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    codigo: equipment?.codigo || '',
    nombre: equipment?.nombre || '',
    descripcion: equipment?.descripcion || '',
    marca: equipment?.marca || '',
    modelo: equipment?.modelo || '',
    numeroSerie: equipment?.numeroSerie || '',
    zoneId: equipment?.zoneId || '',
    criticidad: equipment?.criticidad || 'media' as Equipment['criticidad'],
    estado: equipment?.estado || 'operativo' as Equipment['estado'],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setValidationErrors({})

    try {
      const dataToValidate = {
        codigo: formData.codigo,
        nombre: formData.nombre,
        descripcion: formData.descripcion || undefined,
        marca: formData.marca || undefined,
        modelo: formData.modelo || undefined,
        numeroSerie: formData.numeroSerie || undefined,
        zoneId: formData.zoneId,
        zonePath: [formData.zoneId],
        position: { x: 0, y: 0 },
        criticidad: formData.criticidad,
        estado: formData.estado,
      }

      // Validar con Zod
      const schema = equipment ? updateEquipmentSchema : createEquipmentSchema
      const validation = schema.safeParse(dataToValidate)
      
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

      logger.info(equipment ? 'Updating equipment' : 'Creating equipment', { codigo: formData.codigo })

      if (equipment) {
        await updateEquipment(equipment.id, formData)
      } else {
        await createEquipment({
          ...formData,
          zonePath: [formData.zoneId],
          position: { x: 0, y: 0 },
        })
      }
      
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {equipment ? 'Editar Equipo' : 'Nuevo Equipo'}
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
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                placeholder="EQ-001"
                required
              />
              {validationErrors.codigo && (
                <p className="text-sm text-destructive">{validationErrors.codigo}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoneId">Zona *</Label>
              <Select
                value={formData.zoneId}
                onValueChange={(value) => setFormData({ ...formData, zoneId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar zona" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.zoneId && (
                <p className="text-sm text-destructive">{validationErrors.zoneId}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Bomba centrífuga principal"
              required
            />
            {validationErrors.nombre && (
              <p className="text-sm text-destructive">{validationErrors.nombre}</p>
            )}
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
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : equipment ? 'Guardar Cambios' : 'Crear Equipo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
