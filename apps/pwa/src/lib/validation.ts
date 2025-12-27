/**
 * Esquemas de validación con Zod para todo el sistema
 * Centraliza las reglas de validación para mantener consistencia
 */

import { z } from 'zod'

// ============================================================================
// ESQUEMAS BASE
// ============================================================================

export const emailSchema = z.string()
  .email('Email inválido')
  .min(5, 'Email muy corto')
  .max(100, 'Email muy largo')

export const passwordSchema = z.string()
  .min(6, 'La contraseña debe tener al menos 6 caracteres')
  .max(50, 'La contraseña no puede tener más de 50 caracteres')

export const nameSchema = z.string()
  .min(2, 'Nombre muy corto')
  .max(50, 'Nombre muy largo')
  .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'Solo se permiten letras')

export const codigoSchema = z.string()
  .min(1, 'Código requerido')
  .max(20, 'Código muy largo')
  .regex(/^[A-Z0-9-_]+$/, 'Solo letras mayúsculas, números, guiones y guiones bajos')

export const descripcionSchema = z.string()
  .min(10, 'La descripción debe tener al menos 10 caracteres')
  .max(1000, 'La descripción no puede tener más de 1000 caracteres')

export const tituloSchema = z.string()
  .min(5, 'El título debe tener al menos 5 caracteres')
  .max(100, 'El título no puede tener más de 100 caracteres')

// ============================================================================
// ARCHIVOS Y UPLOADS
// ============================================================================

export const FILE_CONSTRAINTS = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  MAX_IMAGES_PER_INCIDENT: 10,
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > FILE_CONSTRAINTS.MAX_SIZE) {
    return { 
      valid: false, 
      error: `Archivo muy grande (máx ${FILE_CONSTRAINTS.MAX_SIZE / 1024 / 1024}MB)` 
    }
  }
  
  if (!FILE_CONSTRAINTS.ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
    return { 
      valid: false, 
      error: 'Tipo de archivo no permitido. Solo JPG, PNG o WEBP' 
    }
  }
  
  return { valid: true }
}

export function validateFileList(files: File[]): { valid: boolean; error?: string } {
  if (files.length > FILE_CONSTRAINTS.MAX_IMAGES_PER_INCIDENT) {
    return {
      valid: false,
      error: `Máximo ${FILE_CONSTRAINTS.MAX_IMAGES_PER_INCIDENT} imágenes por incidencia`
    }
  }
  
  for (const file of files) {
    const result = validateFile(file)
    if (!result.valid) {
      return result
    }
  }
  
  return { valid: true }
}

// ============================================================================
// USUARIOS
// ============================================================================

export const userRoleSchema = z.enum(['admin', 'supervisor', 'tecnico'])

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nombre: nameSchema,
  apellido: nameSchema,
  rol: userRoleSchema,
})

export const updateUserSchema = z.object({
  nombre: nameSchema.optional(),
  apellido: nameSchema.optional(),
  rol: userRoleSchema.optional(),
  activo: z.boolean().optional(),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nombre: nameSchema,
  apellido: nameSchema,
  inviteCode: z.string()
    .length(8, 'Código de invitación debe tener 8 caracteres')
    .regex(/^[A-Z0-9]+$/, 'Código inválido'),
})

// ============================================================================
// INCIDENCIAS
// ============================================================================

export const incidentPrioritySchema = z.enum(['critica', 'alta', 'media', 'baja'])

export const incidentStatusSchema = z.enum([
  'pendiente', 
  'confirmada', 
  'rechazada', 
  'en_proceso', 
  'cerrada'
])

export const maintenanceTypeSchema = z.enum([
  'correctivo',
  'preventivo', 
  'predictivo',
  'proactivo'
])

export const createIncidentSchema = z.object({
  tipo: maintenanceTypeSchema,
  titulo: tituloSchema,
  descripcion: descripcionSchema,
  zoneId: z.string().optional(), // Opcional cuando se usa hierarchyNodeId
  hierarchyNodeId: z.string().optional(), // Opcional cuando se usa zoneId
  prioridad: incidentPrioritySchema,
  status: z.string().optional(),
  fotos: z.array(z.string()).optional(),
  reportadoPor: z.string(),
  requiresValidation: z.boolean().optional(),
  sintomas: z.array(z.string()).max(20, 'Máximo 20 síntomas').optional(),
  equipmentId: z.string().optional(),
}).refine(
  (data) => data.zoneId || data.hierarchyNodeId,
  { message: 'Debe especificar una zona o un nodo de jerarquía', path: ['zoneId'] }
)

export const updateIncidentSchema = z.object({
  titulo: tituloSchema.optional(),
  descripcion: descripcionSchema.optional(),
  prioridad: incidentPrioritySchema.optional(),
  status: incidentStatusSchema.optional(),
  sintomas: z.array(z.string()).max(20).optional(),
  asignadoA: z.string().optional(),
  resolucion: z.string().min(10).max(1000).optional(),
})

export const closeIncidentSchema = z.object({
  resolucion: z.string()
    .min(20, 'La resolución debe tener al menos 20 caracteres')
    .max(1000, 'La resolución no puede tener más de 1000 caracteres'),
  repuestosUsados: z.array(z.object({
    repuestoId: z.string(),
    cantidad: z.number().positive().int(),
  })).optional(),
})

export const rejectIncidentSchema = z.object({
  rejectionReason: z.string()
    .min(10, 'La razón de rechazo debe tener al menos 10 caracteres')
    .max(500, 'La razón de rechazo no puede tener más de 500 caracteres'),
})

// ============================================================================
// ZONAS
// ============================================================================

export const zoneTypeSchema = z.enum([
  'produccion',
  'almacen',
  'oficinas',
  'mantenimiento',
  'carga_descarga',
  'servicios',
  'seguridad',
  'maquina',
  'otro'
])

export const zoneNivelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3)
])

export const mapPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const createZoneSchema = z.object({
  id: codigoSchema,
  parentId: z.string().nullable(),
  nivel: zoneNivelSchema,
  nombre: z.string().min(2).max(100),
  codigo: codigoSchema,
  tipo: zoneTypeSchema,
  descripcion: z.string().max(500).optional(),
  polygon: z.array(mapPointSchema).min(3, 'Una zona debe tener al menos 3 puntos'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color debe ser hexadecimal').optional(),
  activa: z.boolean(),
  equipmentId: z.string().optional(),
})

export const updateZoneSchema = createZoneSchema.partial().omit({ id: true })

// ============================================================================
// EQUIPOS
// ============================================================================

export const equipmentStatusSchema = z.enum([
  'operativo',
  'en_mantenimiento',
  'fuera_servicio'
])

export const equipmentCriticalitySchema = z.enum(['alta', 'media', 'baja'])

export const createEquipmentSchema = z.object({
  codigo: codigoSchema,
  nombre: z.string().min(2).max(100),
  descripcion: z.string().max(500).optional(),
  marca: z.string().max(50).optional(),
  modelo: z.string().max(50).optional(),
  numeroSerie: z.string().max(50).optional(),
  zoneId: z.string().min(1, 'Zona requerida'),
  zonePath: z.array(z.string()),
  position: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  criticidad: equipmentCriticalitySchema,
  estado: equipmentStatusSchema,
})

export const updateEquipmentSchema = createEquipmentSchema.partial().omit({ codigo: true })

// ============================================================================
// TAREAS PREVENTIVAS
// ============================================================================

export const createPreventiveTaskSchema = z.object({
  equipmentId: z.string().min(1, 'Equipo requerido'),
  tipo: z.string().min(2).max(50),
  nombre: z.string().min(5).max(100),
  descripcion: z.string().max(1000).optional(),
  frecuenciaDias: z.number()
    .int('Frecuencia debe ser un número entero')
    .positive('Frecuencia debe ser positiva')
    .max(365, 'Frecuencia máxima: 365 días'),
  checklist: z.array(z.object({
    id: z.string(),
    tarea: z.string().min(5).max(200),
    completado: z.boolean(),
  })).min(1, 'Debe haber al menos 1 tarea en el checklist'),
  asignadoA: z.string().optional(),
  activo: z.boolean(),
})

export const updatePreventiveTaskSchema = createPreventiveTaskSchema.partial().omit({ equipmentId: true })

export const executePreventiveTaskSchema = z.object({
  taskId: z.string().min(1, 'Task ID requerido'),
  equipmentId: z.string().min(1, 'Equipo requerido'),
  ejecutadoPor: z.string().min(1, 'Usuario requerido'),
  checklistCompletado: z.array(z.object({
    id: z.string(),
    tarea: z.string(),
    completado: z.boolean(),
    observacion: z.string().optional(),
  })).min(1, 'Checklist requerido').refine(
    (items) => items.every(item => item.completado),
    { message: 'Todas las tareas del checklist deben estar completadas' }
  ),
  observaciones: z.string().max(2000).optional(),
  duracionMinutos: z.number()
    .int('Duración debe ser un número entero')
    .positive('Duración debe ser positiva')
    .max(1440, 'Duración máxima: 1440 minutos (24h)'),
})

// ============================================================================
// CÓDIGOS DE INVITACIÓN
// ============================================================================

export const createInviteCodeSchema = z.object({
  rol: userRoleSchema,
  usosMaximos: z.number().int().positive().max(100, 'Máximo 100 usos'),
  expiresInDays: z.number().int().positive().max(365, 'Máximo 365 días').optional(),
})

// ============================================================================
// HELPERS DE VALIDACIÓN
// ============================================================================

/**
 * Formatea errores de Zod a Record<string, string>
 */
export function formatZodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  error.issues.forEach((err) => {
    const path = err.path.map((p) => String(p)).join('.')
    errors[path] = err.message
  })
  return errors
}

/**
 * Valida datos contra un esquema de Zod y retorna errores formateados
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  const errors: Record<string, string> = {}
  result.error.issues.forEach((err) => {
    const path = err.path.map((p) => String(p)).join('.')
    errors[path] = err.message
  })
  
  return { success: false, errors }
}

/**
 * Valida datos y lanza error si falla
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  errorPrefix = 'Validación fallida'
): T {
  const result = validateData(schema, data)
  
  if (!result.success) {
    const errorMessages = Object.entries(result.errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(', ')
    throw new Error(`${errorPrefix}: ${errorMessages}`)
  }
  
  return result.data
}

// ============================================================================
// TIPOS INFERIDOS
// ============================================================================

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type SignUpInput = z.infer<typeof signUpSchema>

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>
export type CloseIncidentInput = z.infer<typeof closeIncidentSchema>
export type RejectIncidentInput = z.infer<typeof rejectIncidentSchema>

export type CreateZoneInput = z.infer<typeof createZoneSchema>
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>

export type CreatePreventiveTaskInput = z.infer<typeof createPreventiveTaskSchema>
export type UpdatePreventiveTaskInput = z.infer<typeof updatePreventiveTaskSchema>
export type ExecutePreventiveTaskInput = z.infer<typeof executePreventiveTaskSchema>

export type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>
