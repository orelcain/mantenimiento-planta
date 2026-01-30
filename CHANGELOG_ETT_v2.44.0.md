# 🎉 Módulo ETT - Especificaciones Técnicas del Trabajo
## Versión 2.44.0 - 29 de enero de 2026

---

## ✨ Características Principales

### 1. **Módulo Administrativo Completo**
- Nueva sección en admin accesible vía `/admin/ett`
- Protegido: solo usuarios con rol `admin` pueden acceder
- Integrado en menú de navegación principal

### 2. **Formulario Guiado por Pasos (Wizard)**
Diseño intuitivo con 6 pestañas:

#### **Tab 1: General**
- Título de la ETT
- Solicitante y Responsable
- Descripción general
- Observaciones
- Validación de campos requeridos

#### **Tab 2: Trabajo**
- Campo principal de descripción técnica
- Botón "Mejorar con IA" para pulir el texto
- Visualización de mejoras sugeridas
- **Captura de voz**: Grabación de audio con Web Speech API
- Transcripción automática integrable

#### **Tab 3: Materiales**
- Tabla de materiales con columnas: Nombre, Cantidad, Unidad, Especificaciones
- Diálogo para agregar nuevos materiales
- Botón de "Mejorar especificación" con IA
- Soporte para múltiples unidades: piezas, litros, kg, metros, m²

#### **Tab 4: Procedimientos**
- Lista de procedimientos numerados
- Campos: Título, Descripción, Tiempo estimado, Personal requerido, Precauciones
- Agregación dinámica de pasos
- Ordenamiento automático por número

#### **Tab 5: Riesgos**
- Análisis de riesgos y seguridad
- Matriz de probabilidad vs consecuencia
- Medidas preventivas
- EPP (Equipos de Protección Personal)
- Colores visuales por nivel de riesgo

#### **Tab 6: Exportar**
- Botón para descargar en formato Word (.docx)
- Botón para descargar en formato PDF
- Ambos con diseño profesional consistente

### 3. **IA Integrada en Todos los Campos**
Botón "Mejorar con IA" con prompts especializados:

- **Trabajo**: Agrega tecnicismo, clarifica objetivos, enfatiza seguridad
- **Materiales**: Incluye normas (ISO, DIN), especificaciones, criterios de aceptación
- **Procedimientos**: Estructura paso a paso, añade precauciones, verbos imperativos
- **Riesgos**: Especifica EPP, incluye controles, cumplimiento normativo
- **Generación de secciones**: Genera contenido completo cuando está vacío

### 4. **Captura de Voz (Web Speech API)**
- Grabación en vivo con indicador visual
- Transcripción automática a texto
- Integración directa en campo de descripción
- Soporte para español (es-ES)

### 5. **Exportación Profesional**

#### **Word (.docx)**
- Estilos profesionales con colores corporativos (#1F4788, #4472C4)
- Tablas formateadas para materiales y riesgos
- Numeración automática de procedimientos
- Información general en encabezado
- Observaciones en pie de página

#### **PDF**
- Mismo diseño visual que Word
- Generado con html2canvas + jsPDF
- Soporte para múltiples páginas
- Imagen de alta calidad (escala 2x)

### 6. **Base de Datos (Firestore)**
Colección `ett` con estructura:
```
{
  id: string
  general: {
    titulo: string
    fecha: Timestamp
    solicitante: string
    responsable: string
    descripcion_general: string
    observaciones?: string
  }
  trabajo_descripcion: string
  materiales: ETTMaterial[]
  procedimientos: ETProcedimiento[]
  riesgos: ETTRiesgo[]
  adjuntos: ETTAdjunto[]
  estado: 'borrador' | 'en_revision' | 'aprobada' | 'completada' | 'archivada'
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  aprobado_por?: string
  fecha_aprobacion?: Timestamp
}
```

---

## 🛠️ Servicios Implementados

### `services/ett.ts` - CRUD Firestore
- `createETT()`: Crear nueva ETT
- `getETT()`: Obtener ETT por ID
- `listETT()`: Listar con filtros (createdBy, estado)
- `updateETT()`: Actualizar campos
- `updateETTEstado()`: Cambiar estado
- `approveETT()`: Aprobar con metadata
- `deleteETT()`: Eliminar
- `addETTAdjunto()`: Agregar archivo
- `removeETTAdjunto()`: Remover archivo

### `services/ettAI.ts` - IA con Groq
- `improveTrabajoDescripcion()`: Mejora técnica
- `improveMaterialEspecificacion()`: Normas y estándares
- `improveProcedimiento()`: Estructura paso a paso
- `improveRiesgoMedidas()`: Seguridad y EPP
- `generateETTSection()`: Generación completa

### `utils/exportETTWord.ts` - Exportación Word
- `exportETTToWord()`: Genera archivo .docx
- `downloadWord()`: Descarga en navegador
- Tablas formateadas
- Estilos profesionales

### `utils/exportETTPDF.ts` - Exportación PDF
- `exportETTToPDF()`: Genera PDF
- `downloadPDF()`: Descarga en navegador
- Multi-página automática
- Consistencia visual

### `hooks/useSpeechRecognition.ts` - Reconocimiento de voz
- `startListening()`: Inicia grabación
- `stopListening()`: Detiene grabación
- `transcript`: Texto transcrito
- `isListening`: Estado actual

---

## 📦 Dependencias Instaladas

```json
{
  "docx": "^9.5.1",        // Generación Word
  "html2canvas": "^1.4.1",  // Renderizado HTML a canvas
  "jspdf": "^2.5.1",        // Generación PDF
  "uuid": "^13.0.0"         // IDs únicos
}
```

---

## 🎨 Interfaz de Usuario

### Componentes de UI Nuevos
- **Alert**, **AlertDescription**: Mostrar sugerencias de IA
- Diálogos para agregar materiales, procedimientos, riesgos
- Tablas dinámicas con colores visuales
- Indicadores de estado (color-coded badges)

### Colores Corporativos
- Primario: `#1F4788` (Azul oscuro)
- Secundario: `#4472C4` (Azul medio)
- Acento: `#D9E8F5` (Azul claro)

---

## 🔐 Seguridad y Control de Acceso

- **Ruta protegida**: `/admin/ett` requiere rol `admin`
- **CRUD auditado**: Cada operación registra usuario y timestamp
- **Validación de entrada**: Todos los campos requeridos validados
- **Permisos Firestore**: Documentos vinculados a `createdBy`

---

## 📊 Casos de Uso

1. **Crear ETT nueva**: Admin completa formulario guiado
2. **Mejorar textos con IA**: Botón mágico en cada sección
3. **Grabar procedimientos**: Captura de voz para descripción
4. **Compartir documento**: Exportar a Word o PDF profesional
5. **Gestionar versiones**: Cambiar estado de borrador a aprobada

---

## ✅ Testing Manual

```
1. Navegar a /admin/ett
2. Crear nueva ETT
3. Rellenar información general
4. Usar "Mejorar con IA" en trabajo
5. Agregar material con especificación
6. Grabar procedimiento con voz
7. Identificar riesgos
8. Exportar a Word y PDF
9. Verificar documentos generados
```

---

## 🚀 Próximas Mejoras Planeadas

- [ ] Carga de adjuntos (imágenes, planos)
- [ ] Plantillas de ETT reutilizables
- [ ] Historial de cambios y auditoría
- [ ] Aprobación por flujo de trabajo
- [ ] Notificaciones por cambios de estado
- [ ] Versionado de ETT (v1, v2, v3...)
- [ ] Búsqueda y filtrado avanzado
- [ ] Reportes de compliance

---

## 📝 Notas de Desarrollo

- Todos los servicios siguen el patrón existente de la aplicación
- TypeScript strict mode habilitado
- Manejo de errores con logger
- Timestamps en Firestore conversos a Date
- Lazy loading de componente ETTPage
- Bundle size: ~380KB gzipped (incluye html2canvas)

---

## 🎯 Versión: 2.44.0
**Estado**: ✅ PRODUCTION READY  
**Fecha**: 29 de enero de 2026  
**Build**: Stable
