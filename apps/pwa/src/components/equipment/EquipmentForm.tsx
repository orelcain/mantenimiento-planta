import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui'
import { updateEquipment } from '@/services/equipment'
import { updateEquipmentSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { usePermissions } from '@/hooks/usePermissions'
import type { Equipment } from '@/types'

/**
 * Formulario de edición de un equipo (datos básicos: descripción, marca,
 * modelo, n° serie, criticidad, estado y exclusión de sync). Código y nombre
 * son de solo lectura (vienen de la jerarquía SAP). Reutilizado por la página
 * de Equipos y por el expediente del Centro Técnico Documental.
 */
export function EquipmentForm({
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
    nombreComun: equipment.nombreComun || '',
    descripcion: equipment.descripcion || '',
    marca: equipment.marca || '',
    modelo: equipment.modelo || '',
    numeroSerie: equipment.numeroSerie || '',
    tipo: equipment.tipo || '',
    syncExcluded: Boolean(equipment.syncExcluded),
    criticidad: equipment.criticidad || ('media' as Equipment['criticidad']),
    estado: equipment.estado || ('operativo' as Equipment['estado']),
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!canEditEquipment) {
      setValidationErrors({ general: 'No tienes permisos para editar equipos.' })
      return
    }

    setIsLoading(true)
    setValidationErrors({})

    try {
      const dataToValidate = {
        codigo: equipment.codigo,
        nombre: equipment.nombre,
        descripcion: formData.descripcion || undefined,
        marca: formData.marca || undefined,
        modelo: formData.modelo || undefined,
        numeroSerie: formData.numeroSerie || undefined,
        tipo: formData.tipo || undefined,
        criticidad: formData.criticidad,
        estado: formData.estado,
      }

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
        tipo: formData.tipo || undefined,
        nombreComun: formData.nombreComun.trim() || undefined,
        syncExcluded: formData.syncExcluded,
        criticidad: formData.criticidad,
        estado: formData.estado,
      })

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
      logger.info('Soft deleting equipment (exclude from sync)', { equipmentId: equipment.id, codigo: equipment.codigo })
      await updateEquipment(equipment.id, {
        syncExcluded: true,
        deleted: true,
        deletedAt: new Date(),
      })
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
          <DialogTitle>Editar Equipo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {validationErrors.general && (
            <div className="p-3 rounded-card bg-destructive/10 text-destructive text-sm">{validationErrors.general}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input id="codigo" value={formData.codigo} disabled required />
              {validationErrors.codigo && <p className="text-sm text-destructive">{validationErrors.codigo}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" value={formData.nombre} disabled />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nombreComun">Nombre común / apodo</Label>
            <Input
              id="nombreComun"
              value={formData.nombreComun}
              onChange={(e) => setFormData({ ...formData, nombreComun: e.target.value })}
              placeholder='Cómo le dicen en planta (ej. "Motor cinta larga grader")'
            />
            <p className="text-caption text-muted-foreground">
              El “Nombre” viene del SAP y no se edita. El nombre común es buscable.
            </p>
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
            {validationErrors.descripcion && <p className="text-sm text-destructive">{validationErrors.descripcion}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Input
              id="tipo"
              list="equipment-tipos"
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              placeholder="Motor, Bomba, Compresor…"
            />
            <datalist id="equipment-tipos">
              {[
                'Motor',
                'Bomba',
                'Compresor',
                'Ventilador',
                'Evaporador',
                'Condensador',
                'Tablero',
                'Reductor',
                'Intercambiador',
                'Cinta transportadora',
                'Chiller',
                'Válvula',
              ].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {validationErrors.tipo && <p className="text-sm text-destructive">{validationErrors.tipo}</p>}
          </div>

          {canDeleteEquipment && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="syncExcluded"
                checked={formData.syncExcluded}
                onCheckedChange={(checked) => setFormData({ ...formData, syncExcluded: checked === true })}
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
                onValueChange={(value: Equipment['criticidad']) => setFormData({ ...formData, criticidad: value })}
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
                onValueChange={(value: Equipment['estado']) => setFormData({ ...formData, estado: value })}
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
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isLoading}>
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
