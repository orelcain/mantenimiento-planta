/**
 * Tipos para Especificaciones Técnicas del Trabajo (ETT)
 * Documento profesional que detalla trabajos, materiales y procedimientos
 */

export interface ETTGeneralInfo {
  titulo: string
  codigo?: string // Código único de la ETT
  fecha: Date
  solicitante: string
  responsable: string
  empresa?: string
  area?: string
  descripcion_general: string
  observaciones?: string
}

export interface ETTMaterial {
  id: string
  nombre: string
  descripcion?: string
  cantidad: number
  unidad: string // kg, m, piezas, etc.
  especificaciones?: string
  notas?: string
}

export interface ETProcedimiento {
  id: string
  numero: number
  titulo: string
  descripcion: string
  tiempo_estimado?: string // "2 horas", "30 minutos"
  precauciones?: string
  personal_requerido?: number
  notas?: string
}

export interface ETTRiesgo {
  id: string
  peligro: string
  probabilidad: 'baja' | 'media' | 'alta' | 'muy_alta'
  consecuencia: 'leve' | 'grave' | 'muy_grave' | 'mortal'
  medidas_preventivas: string
  equipos_seguridad?: string[] // EPP requerido
}

export interface ETTAdjunto {
  id: string
  nombre: string
  tipo: 'imagen' | 'documento' | 'diagrama'
  url: string
  descripcion?: string
  uploadedAt: Date
}

export interface ETT {
  id: string
  general: ETTGeneralInfo
  trabajo_descripcion: string // Descripción detallada del trabajo a realizar
  
  // Secciones principales
  materiales: ETTMaterial[]
  procedimientos: ETProcedimiento[]
  riesgos: ETTRiesgo[]
  adjuntos: ETTAdjunto[]
  
  // Metadata
  createdBy: string
  createdAt: Date
  updatedAt: Date
  estado: 'borrador' | 'en_revision' | 'aprobada' | 'completada' | 'archivada'
  
  // Aprobaciones
  aprobado_por?: string
  fecha_aprobacion?: Date
  
  // Para generación de documentos
  numero_paginas?: number
  ultima_exportacion?: Date
}

/**
 * Sugerencias de IA para campos específicos
 */
export interface ETTSugerenciaIA {
  campo: string // "trabajo_descripcion", "procedimientos", etc.
  texto_original: string
  texto_mejorado: string
  mejoras: string[] // Lista de cambios realizados
}

/**
 * Historial de cambios
 */
export interface ETTCambio {
  id: string
  timestamp: Date
  usuario: string
  accion: 'creado' | 'editado' | 'aprobado' | 'exportado'
  detalles: string
}
