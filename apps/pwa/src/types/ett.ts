/**
 * Modelo de Especificaciones Técnicas del Trabajo (ETT)
 *
 * Alineado al formato corporativo AquaChile — Adquisiciones / Servicios.
 * Estructura del documento:
 *
 *   1. Encabezado fijo (AQUACHILE / ESPECIFICACIONES TECNICAS Y BASES)
 *   2. Tabla de cabecera EDITABLE (fecha, proyecto, solicitante, sector, ...)
 *   3. CONSIDERACIONES PREVIAS (texto fijo, 6 viñetas estándar)
 *   4. ESPECIFICACIÓN SERVICIO
 *        - Área de intervención      → texto libre EDITABLE
 *        - Descripción de trabajos   → zona libre con BLOQUES flexibles
 *        - Responsabilidades         → lista EDITABLE
 *        - Imágenes de referencia    → adjuntos
 *   5. MATERIAL GRÁFICO / SUMINISTROS / EQUIPOS / ASEO (texto fijo)
 *   6. BASES ADMINISTRATIVAS (texto fijo, 10 cláusulas)
 *
 * Solo las partes editables se almacenan en Firestore.
 * Las partes fijas viven en el exportador (`utils/exportETTWord.ts`).
 */

// ============================================================================
// CABECERA EDITABLE (tabla superior)
// ============================================================================

/**
 * Campos variables de la tabla de información que va al inicio del documento.
 * Se corresponden 1-a-1 con las 7 filas de la tabla de cabecera de AquaChile.
 */
export interface ETTCabecera {
  /** "FECHA REQUERIMIENTO" — fecha en que se emite la ETT */
  fecha_requerimiento: Date
  /** "PROYECTO O SERVICIO" — título/nombre del trabajo */
  proyecto: string
  /** "USUARIO SOLICITANTE" — depto o persona que solicita */
  usuario_solicitante: string
  /** "SECTOR DE REALIZACIÓN" — ubicación física */
  sector_realizacion: string
  /** "FECHA INICIO DEL SERVICIO" — opcional, puede estar vacía */
  fecha_inicio?: Date
  /** "FECHA TÉRMINO DEL SERVICIO" — opcional, puede estar vacía */
  fecha_termino?: Date
  /** "GARANTÍA EXIGIDA" — default: "06 (meses) Garantía Temporada Alta" */
  garantia_texto: string
}

// ============================================================================
// BLOQUES DE CONTENIDO (para la zona "Descripción de trabajos")
// ============================================================================

/**
 * Item de lista. Puede tener sub-items anidados (1 nivel de profundidad).
 * Ejemplo del ETT collarines:
 *
 *   { texto: "Cambio de collarines existentes:", subitems: [
 *       { texto: "45 unidades collarín 90mm salida 32mm" },
 *       { texto: "45 unidades collarín 75mm salida 32mm" },
 *   ]}
 */
export interface ETTListItem {
  texto: string
  subitems?: ETTListItem[]
}

/** Bloque de párrafo de texto simple */
export interface ETTBloqueParrafo {
  tipo: 'parrafo'
  texto: string
  /** Si true, texto en negrita */
  negrita?: boolean
  /** Color del texto (por defecto negro) */
  color?: 'negro' | 'rojo' | 'azul'
}

/** Bloque de lista con viñetas (soporta sub-items anidados) */
export interface ETTBloqueLista {
  tipo: 'lista'
  items: ETTListItem[]
  /** Estilo de viñetas: puntos, números o guiones */
  estilo?: 'bullets' | 'numerada' | 'dash'
}

/**
 * Fila de tabla — envuelve las celdas en un objeto para evitar que Firestore
 * rechace arrays anidados (no permitidos en setDoc).
 */
export interface ETTTablaFila {
  celdas: string[]
}

/**
 * Bloque de tabla con columnas dinámicas.
 *
 * Ejemplo del ETT paneles:
 *   columnas: ['Largo', 'Ancho', 'Espesor', 'Cantidad']
 *   filas:    [{ celdas: ['12 M', '1.15 M', '100 mm', '19'] }]
 *
 * Nota: las filas son objetos porque Firestore NO permite arrays anidados
 * (ver: https://firebase.google.com/docs/firestore/manage-data/data-types).
 */
export interface ETTBloqueTabla {
  tipo: 'tabla'
  columnas: string[]
  filas: ETTTablaFila[]
}

/** Subtítulo dentro de la sección libre (negrita, tamaño mayor) */
export interface ETTBloqueSubtitulo {
  tipo: 'subtitulo'
  texto: string
}

/** Unión discriminada de todos los tipos de bloque posibles */
export type ETTBloque =
  | ETTBloqueParrafo
  | ETTBloqueLista
  | ETTBloqueTabla
  | ETTBloqueSubtitulo

// ============================================================================
// IMÁGENES DE REFERENCIA
// ============================================================================

export interface ETTImagen {
  id: string
  /** Nombre visible del archivo */
  nombre: string
  /** URL en Firebase Storage */
  url: string
  /** Descripción opcional que aparece junto a la imagen */
  descripcion?: string
  /** Timestamp de subida */
  uploadedAt: Date
}

// ============================================================================
// DOCUMENTO ETT COMPLETO
// ============================================================================

/** Estados posibles de una ETT */
export type ETTEstado = 'borrador' | 'aprobada' | 'archivada'

/**
 * Documento ETT completo.
 * Representa una Especificación Técnica de Trabajo lista para exportar a Word.
 */
export interface ETT {
  id: string

  /** Tabla de información superior (editable) */
  cabecera: ETTCabecera

  /** Texto tras "Área de intervención:" */
  area_intervencion: string

  /** Zona libre con bloques flexibles (párrafo, lista, tabla, subtítulo) */
  descripcion_trabajos: ETTBloque[]

  /** Lista tras "Responsabilidades del contratista:" */
  responsabilidades_contratista: string[]

  /** Imágenes de referencia adjuntas */
  imagenes: ETTImagen[]

  // ---- Metadatos ----
  estado: ETTEstado
  createdBy: string
  createdAt: Date
  updatedAt: Date

  // ---- Aprobación (opcional) ----
  aprobado_por?: string
  fecha_aprobacion?: Date

  // ---- Origen (para analytics y duplicación) ----
  /** De qué plantilla o flujo se creó esta ETT */
  origen?: 'paneles' | 'piping' | 'vacia' | 'duplicado' | 'ia'

  /** Si fue duplicada, ID de la ETT original */
  duplicado_de?: string
}

// ============================================================================
// PLANTILLAS BASE
// ============================================================================

/**
 * Tipo de identificador de plantilla.
 * 'paneles'  → plantilla para cambio de material estructural (ETT 1 real)
 * 'piping'   → plantilla para trabajos con tuberías/collarines (ETT 2 real)
 * 'vacia'    → plantilla en blanco (solo estructura mínima)
 */
export type ETTPlantillaId = 'paneles' | 'piping' | 'vacia'

/**
 * Datos por defecto que una plantilla provee para crear una nueva ETT.
 * No incluye los campos de metadata (id, createdAt, createdBy, ...).
 */
export type ETTPlantillaDefaults = Pick<
  ETT,
  | 'cabecera'
  | 'area_intervencion'
  | 'descripcion_trabajos'
  | 'responsabilidades_contratista'
  | 'imagenes'
>

/** Plantilla completa que el usuario puede elegir al crear una ETT nueva */
export interface ETTPlantilla {
  id: ETTPlantillaId
  /** Nombre visible en la UI */
  nombre: string
  /** Descripción corta (1 línea) para el selector de plantillas */
  descripcion: string
  /** Nombre del icono lucide-react */
  icono: string
  /** Valores por defecto al instanciar esta plantilla */
  defaults: ETTPlantillaDefaults
}

// ============================================================================
// ASISTENTE IA
// ============================================================================

/** Contexto que se le pasa a la IA para completar una plantilla */
export interface ETTContextoIA {
  /** ID de la plantilla base a usar */
  plantilla_id: ETTPlantillaId
  /** Descripción del trabajo en lenguaje natural (del usuario) */
  descripcion_usuario: string
  /** Perfil del usuario para pre-rellenar campos (solicitante, etc.) */
  user_profile?: {
    departamento?: string
    nombre?: string
  }
}

/**
 * Resultado de la IA al completar una plantilla.
 * Devuelve campos parciales + lista de preguntas pendientes si le falta info.
 */
export interface ETTCompletadoIA {
  /** Campos de la cabecera que la IA pudo inferir */
  cabecera?: Partial<ETTCabecera>
  /** Texto de "Área de intervención" generado */
  area_intervencion?: string
  /** Bloques de descripción de trabajos generados */
  descripcion_trabajos?: ETTBloque[]
  /** Lista de responsabilidades inferida */
  responsabilidades_contratista?: string[]
  /**
   * Campos que la IA no pudo inferir con la info dada.
   * El frontend debe preguntar al usuario uno por uno.
   */
  campos_faltantes: Array<{
    campo: string
    pregunta: string
    tipo?: 'texto' | 'fecha' | 'numero'
  }>
}
