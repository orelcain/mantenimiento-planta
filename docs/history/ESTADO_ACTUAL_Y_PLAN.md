# 📊 Estado Actual del Sistema y Plan de Mejoras

**Fecha**: 27 de diciembre de 2024  
**Versión actual**: v1.4.0  
**Revisión solicitada por**: Usuario

---

## 🎯 Preguntas del Usuario

1. **¿Cómo manejamos las incidencias?** ¿Podemos eliminar las rechazadas?
2. **¿Admin puede eliminar cualquier dependencia?** ¿Supervisores/técnicos NO?
3. **¿Tenemos filtros de funciones por tipo de usuario implementados?**
4. **¿Están implementados los 4 tipos de mantenimiento?** ¿Se alimentan de data de incidencias?
5. **¿Tenemos síntomas generativos con IA?** ¿Cómo manejar la contextualización por área/equipo?

---

## ✅ ESTADO ACTUAL

### 1. Sistema de Permisos (✅ Implementado)

**Archivo**: `apps/pwa/src/hooks/usePermissions.tsx`

#### **Permisos de Incidencias:**
```typescript
canCreateIncident: true,                    // ✅ Todos pueden reportar
canEditIncident: isAdmin || isSupervisor,  // ✅ Admin/Supervisor editan
canDeleteIncident: isAdmin,                 // ✅ SOLO Admin elimina
canValidateIncident: isAdmin || isSupervisor,
canAssignIncident: isAdmin || isSupervisor,
canCloseIncident: isAdmin || isSupervisor || isTechnician,
canRejectIncident: isAdmin || isSupervisor,
```

#### **Funcionalidad de Eliminación:**
- ✅ Existe función `deleteIncident(id)` en `services/incidents.ts` (línea 199)
- ✅ Permiso `canDeleteIncident` solo para Admin
- ❌ **NO hay UI** para eliminar incidencias (botón faltante)
- ❌ **NO hay confirmación** de eliminación implementada

#### **Otros Permisos Implementados:**
```typescript
// Equipos
canCreateEquipment: isAdmin || isSupervisor,
canEditEquipment: isAdmin || isSupervisor || isTechnician,
canDeleteEquipment: isAdmin,  // ✅ Solo Admin

// Zonas
canCreateZone: isAdmin,
canEditZone: isAdmin,
canDeleteZone: isAdmin,  // ✅ Solo Admin

// Tareas Preventivas
canCreatePreventiveTask: isAdmin || isSupervisor,
canDeletePreventiveTask: isAdmin,  // ✅ Solo Admin

// Usuarios
canManageUsers: isAdmin,  // ✅ Solo Admin
canChangeUserRole: isAdmin,
canDeactivateUser: isAdmin,
```

**✅ CONCLUSIÓN**: Sistema de permisos robusto y bien implementado.

---

### 2. Tipos de Mantenimiento (⚠️ Parcialmente Implementado)

**Archivo**: `apps/pwa/src/types/index.ts` (línea 8)

#### **Tipos Definidos:**
```typescript
export type MaintenanceType = 'correctivo' | 'preventivo' | 'predictivo' | 'proactivo'
```

#### **Estado de Implementación:**

| Tipo | Estado | Detalles |
|------|--------|----------|
| **Correctivo** | ✅ Completo | Sistema de incidencias actual, con asignación de técnicos y seguimiento |
| **Preventivo** | ✅ Completo | `PreventivePage.tsx` con tareas programadas, checklists, ejecución |
| **Predictivo** | ⚠️ Definido | Tipo existe en `FailurePrediction` interface, **NO implementado** |
| **Proactivo** | ❌ Sin implementar | Solo está en el tipo, **NO tiene lógica ni UI** |

#### **Análisis Detallado:**

**✅ Mantenimiento Correctivo (Incidencias):**
- Reporte de fallas
- Asignación a técnicos
- Estados: pendiente → confirmada → en_proceso → cerrada
- Fotos, prioridades, validación por supervisor
- **Síntomas básicos** (9 predefinidos): Vibración, Ruido anormal, Calentamiento, etc.

**✅ Mantenimiento Preventivo:**
- Tareas programadas (`PreventiveTask`)
- Frecuencias: diario, semanal, mensual, trimestral, semestral, anual
- Checklists de verificación
- Historial de ejecuciones (`PreventiveExecution`)
- Tipos: Inspección, Lubricación, Limpieza, Calibración, etc.

**⚠️ Mantenimiento Predictivo:**
```typescript
// Interface existe pero NO hay implementación
interface FailurePrediction {
  id: string
  equipmentId: string
  nivelRiesgo: 'bajo' | 'medio' | 'alto' | 'critico'
  confianza: number // 0-1
  indicadores: string[]
  recomendacion: string
  fechaPrediccion: Date
  modelVersion: string
  atendido: boolean
}
```
- ❌ NO hay colección Firestore
- ❌ NO hay servicios para crear/leer predicciones
- ❌ NO hay UI para visualizar alertas predictivas
- ❌ NO hay análisis de datos históricos

**❌ Mantenimiento Proactivo:**
- ❌ NO hay estructura de datos
- ❌ NO hay lógica de análisis de causa raíz recurrente
- ❌ NO hay generación automática de recomendaciones
- ❌ NO hay UI

---

### 3. Sistema de Síntomas (⚠️ Básico, Sin IA)

**Archivo**: `apps/pwa/src/components/incidents/IncidentForm.tsx` (línea 37)

#### **Estado Actual:**
```typescript
const COMMON_SYMPTOMS = [
  'Vibración', 'Ruido anormal', 'Calentamiento', 'Fuga de aceite', 
  'Fuga de agua', 'Humo', 'Olor extraño', 'No enciende', 'Se detiene solo'
]
```

**Características:**
- ✅ Selector de chips visual (multiselección)
- ✅ Se guardan en `incident.sintomas[]`
- ❌ **NO es contextual** (mismos síntomas para todos los equipos)
- ❌ **NO usa IA** para generar sub-síntomas
- ❌ **NO hay opción "Otro"** para agregar custom
- ❌ **NO se enriquece** la lista con el tiempo
- ❌ **NO hay árbol jerárquico** de síntomas

#### **Ejemplo del Problema:**
```
Usuario reporta incidencia en "Baranda desoldada" (estructura)
  → Ve opción "Fuga de agua" ❌ (no tiene sentido)
  → Ve opción "Humo" ❌ (no aplica)
  
Usuario reporta en "Bomba hidráulica"
  → Ve "No enciende" ❌ (es mecánica, no eléctrica)
```

**✅ Existe Plan Documentado**: `AI_SYMPTOM_SYSTEM_PLAN.md`
- 457 líneas de arquitectura detallada
- 4 fases de implementación
- Estimación: 16-20 semanas
- Costo estimado: $53k-80k desarrollo + $240-590/mes operacional

---

### 4. Integración Entre Tipos de Mantenimiento

**❌ FALTA COMPLETAMENTE**

No existe lógica para:
- **Generar tareas preventivas** desde análisis de incidencias recurrentes
- **Escalar a predictivo** cuando se detectan patrones
- **Sugerir acciones proactivas** basadas en históricos
- **Feedback loop** entre tipos de mantenimiento

**Ejemplo de lo que DEBERÍA pasar:**
```
Incidencia recurrente: "Fuga de aceite en Bomba #3" (5 veces en 3 meses)
          ↓
Sistema detecta patrón
          ↓
GENERA automáticamente tarea preventiva:
  "Inspeccionar sellos de Bomba #3 cada 30 días"
          ↓
Si fallas continúan → ESCALA a predictivo:
  "Alerta: Bomba #3 muestra patrón de fallo inminente"
          ↓
Análisis de causa raíz → PROACTIVO:
  "Recomendación: Cambiar marca de sellos por durabilidad"
```

---

## 🔴 GAPS IDENTIFICADOS

### **Gap #1: Eliminación de Incidencias**
- **Backend**: ✅ Función existe
- **Permisos**: ✅ Solo Admin
- **UI**: ❌ Falta botón en `IncidentDetail`
- **Confirmación**: ❌ Falta modal de advertencia
- **Restricciones**: ⚠️ No valida si tiene relaciones (equipos, técnicos asignados)

### **Gap #2: Mantenimiento Predictivo**
- **Estructura**: ⚠️ Interface definida, no usada
- **Colección Firestore**: ❌ No existe
- **Servicios**: ❌ No existen
- **Análisis de datos**: ❌ No existe
- **UI/Dashboard**: ❌ No existe

### **Gap #3: Mantenimiento Proactivo**
- **Todo**: ❌ No implementado

### **Gap #4: Síntomas Inteligentes con IA**
- **Contextualización**: ❌ No existe
- **Árbol jerárquico**: ❌ No existe
- **IA generativa**: ❌ No existe
- **Opción "Otro"**: ❌ No existe
- **Learning**: ❌ No se enriquece con uso

### **Gap #5: Integración de Tipos de Mantenimiento**
- **Análisis recurrencia**: ❌ No existe
- **Escalamiento automático**: ❌ No existe
- **Recomendaciones**: ❌ No existe
- **Métricas MTBF**: ❌ No existe

---

## 📋 PLAN DE IMPLEMENTACIÓN

### 🎯 FASE 1: Quick Wins (1-2 semanas)

#### **1.1 Botón de Eliminación para Admin** ⭐ PRIORIDAD ALTA

**Archivos a modificar:**
- `apps/pwa/src/components/incidents/IncidentDetail.tsx`

**Implementación:**
```typescript
// Agregar en DialogFooter
{permissions.canDeleteIncident && (
  <Button
    variant="destructive"
    onClick={() => {
      if (confirm('¿Estás seguro de eliminar esta incidencia? Esta acción no se puede deshacer.')) {
        handleDelete()
      }
    }}
  >
    <Trash2 className="h-4 w-4 mr-2" />
    Eliminar
  </Button>
)}

const handleDelete = async () => {
  try {
    setIsLoading(true)
    await deleteIncident(incident.id)
    
    // Eliminar fotos de Storage
    for (const photoUrl of incident.fotos) {
      await deleteFile(photoUrl)
    }
    
    toast.success('Incidencia eliminada')
    onClose()
  } catch (error) {
    toast.error('Error al eliminar')
    logger.error('Error deleting incident:', error)
  } finally {
    setIsLoading(false)
  }
}
```

**Validaciones adicionales:**
- Verificar estado (solo permitir eliminar si está "rechazada" o "cerrada")
- Advertir si tiene técnico asignado
- Mostrar información de eliminación en logs

**Estimación**: 4-6 horas

---

#### **1.2 Opción "Otro" en Síntomas** ⭐ PRIORIDAD ALTA

**Archivos a modificar:**
- `apps/pwa/src/components/incidents/IncidentForm.tsx`

**Implementación:**
```typescript
const [customSymptom, setCustomSymptom] = useState('')
const [showCustomInput, setShowCustomInput] = useState(false)

// Agregar botón "Otro" al final de COMMON_SYMPTOMS
<button
  type="button"
  onClick={() => setShowCustomInput(true)}
  className="px-3 py-1.5 rounded-full text-sm border border-dashed"
>
  ➕ Otro
</button>

// Input condicional
{showCustomInput && (
  <div className="flex gap-2 mt-2">
    <Input
      placeholder="Describe el síntoma..."
      value={customSymptom}
      onChange={(e) => setCustomSymptom(e.target.value)}
    />
    <Button
      size="sm"
      onClick={() => {
        if (customSymptom.trim()) {
          setSelectedSymptoms([...selectedSymptoms, customSymptom.trim()])
          setCustomSymptom('')
          setShowCustomInput(false)
        }
      }}
    >
      Agregar
    </Button>
  </div>
)}
```

**Mejora adicional**: Guardar síntomas custom en colección `symptomsSuggestions` para enriquecer lista maestra.

**Estimación**: 2-3 horas

---

#### **1.3 Filtro por Estado en Incidencias** ⭐ PRIORIDAD MEDIA

**Archivos a modificar:**
- `apps/pwa/src/pages/IncidentsPage.tsx`

**Implementación:**
Agregar selector múltiple de estados:
- Todas
- Pendientes
- Confirmadas
- Rechazadas ← ⭐ Útil para que Admin las revise antes de eliminar
- En Proceso
- Cerradas

**Estimación**: 2-3 horas

---

### 🎯 FASE 2: Síntomas Contextuales (2-3 semanas)

#### **2.1 Síntomas por Categoría de Equipo** ⭐ PRIORIDAD MEDIA

**Objetivo**: Filtrar síntomas relevantes según el equipo/área seleccionado

**Estructura de datos:**
```typescript
interface SymptomCategory {
  id: string
  name: string // "Eléctrico", "Mecánico", "Hidráulico", "Neumático", "Estructural"
  symptoms: string[]
  equipmentTypes: string[] // Tipos de equipo donde aplica
}

// Ejemplo
{
  name: "Eléctrico",
  symptoms: ["No enciende", "Chispas", "Fusible fundido", "Cable quemado"],
  equipmentTypes: ["motor", "panel_control", "bomba_electrica"]
},
{
  name: "Estructural",
  symptoms: ["Grieta", "Desoldadura", "Corrosión", "Deformación"],
  equipmentTypes: ["baranda", "soporte", "estructura"]
}
```

**Lógica**:
1. Usuario selecciona equipo/zona con hierarchyNodeId
2. Sistema busca categoría del equipo
3. Filtra y muestra solo síntomas relevantes
4. Mantiene opción "Otro" para casos no cubiertos

**Estimación**: 1 semana

---

#### **2.2 Árbol Jerárquico de Síntomas (Sin IA aún)** ⭐ PRIORIDAD BAJA

**Estructura**:
```
Síntoma principal: "Fuga de agua"
  ↓
Sub-síntomas:
  - Rotura de tubería
  - Goteo en conexión
  - Sello deteriorado
    ↓ (si selecciona "Goteo en conexión")
    Detalle:
      - Intermitente
      - Constante
      - Solo con presión
```

**Implementación**: Selector en cascada (sin IA, con datos predefinidos)

**Estimación**: 1.5 semanas

---

### 🎯 FASE 3: Mantenimiento Predictivo Básico (3-4 semanas)

#### **3.1 Colección y Servicios de Predicciones**

**Firestore Collection**: `failurePredictions`

**Servicios a crear** (`apps/pwa/src/services/predictive.ts`):
```typescript
export async function createPrediction(data: Omit<FailurePrediction, 'id'>)
export async function getPredictions(equipmentId?: string)
export async function updatePrediction(id: string, data: Partial<FailurePrediction>)
export async function markPredictionAsAttended(id: string, userId: string)
```

**Estimación**: 3 días

---

#### **3.2 Análisis de Patrones de Incidencias**

**Firebase Function** (Cloud Function o local con cron):
```typescript
// Ejecutar diariamente
async function analyzeFail urePatterns() {
  // 1. Buscar incidencias recurrentes por equipo
  const incidents = await getIncidents({ last90Days: true })
  
  // 2. Agrupar por equipmentId y tipo de falla
  const patterns = groupByEquipmentAndSymptom(incidents)
  
  // 3. Calcular MTBF (Mean Time Between Failures)
  const predictions = patterns
    .filter(p => p.frequency > 2 && p.avgDaysBetweenFailures < 60)
    .map(p => ({
      equipmentId: p.equipmentId,
      nivelRiesgo: calculateRiskLevel(p),
      confianza: calculateConfidence(p),
      indicadores: p.symptoms,
      recomendacion: generateRecommendation(p),
      fechaPrediccion: new Date(),
      modelVersion: '1.0-basic'
    }))
  
  // 4. Guardar predicciones
  for (const pred of predictions) {
    await createPrediction(pred)
  }
}
```

**Estimación**: 1 semana

---

#### **3.3 Dashboard de Alertas Predictivas**

**Nueva página**: `apps/pwa/src/pages/PredictivePage.tsx`

**Componentes**:
- Lista de equipos con predicciones activas
- Indicadores de riesgo (crítico, alto, medio, bajo)
- Gráfico de tendencias por equipo
- Botón "Marcar como atendido"
- Enlace para crear tarea preventiva desde predicción

**Estimación**: 1.5 semanas

---

### 🎯 FASE 4: Síntomas con IA Generativa (4-6 semanas) ⚠️ Requiere presupuesto

**Basado en**: `AI_SYMPTOM_SYSTEM_PLAN.md`

#### **4.1 Infraestructura (Semana 1-2)**

**Crear**:
- Firebase Function como proxy de OpenAI/Claude API
- Colección `symptomNodes` en Firestore para caché
- Colección `symptomKnowledge` para aprendizaje
- Rate limiting y control de costos

**API Key necesaria**: OpenAI GPT-4 o Anthropic Claude 3.5

---

#### **4.2 Componente Dinámico (Semana 3-4)**

**Crear**: `apps/pwa/src/components/incidents/DynamicSymptomSelector.tsx`

**Flujo**:
1. Usuario escribe síntoma inicial
2. Sistema llama Firebase Function con contexto:
   - Tipo de equipo
   - Historial del equipo
   - Síntomas previos similares
3. IA genera 3-5 sub-síntomas relevantes
4. Se cachean en Firestore
5. Usuario selecciona → proceso recursivo hasta nivel 3-4

---

#### **4.3 Integración y Testing (Semana 5-6)**

- Conectar con jerarquía de equipos
- Testing con usuarios reales
- Ajuste de prompts según feedback
- Monitoreo de costos

**Costo operacional estimado**: $180-360/mes (con caché)

---

### 🎯 FASE 5: Mantenimiento Proactivo (2-3 semanas)

#### **5.1 Análisis de Causa Raíz**

**Objetivo**: Identificar causas recurrentes y sugerir acciones preventivas definitivas

**Colección**: `rootCauseAnalyses`

**Lógica**:
```typescript
// Cuando se cierra una incidencia recurrente
if (incident.recurrenceCount >= 3) {
  // Analizar histórico
  const relatedIncidents = await getRelatedIncidents(incident.equipmentId, incident.symptoms)
  
  // Detectar causa común
  const rootCause = analyzeRootCause(relatedIncidents)
  
  // Generar recomendación proactiva
  const recommendation = {
    issue: "Fuga de aceite recurrente",
    rootCause: "Sellos de baja calidad",
    action: "Cambiar a sellos marca Premium, especificación XYZ",
    estimatedCost: 150,
    estimatedDowntimeSaved: "4 horas/mes"
  }
  
  // Guardar en dashboard
  await createProactiveRecommendation(recommendation)
}
```

**Estimación**: 1.5 semanas

---

#### **5.2 Dashboard Proactivo**

**Nueva página**: `apps/pwa/src/pages/ProactivePage.tsx`

**Secciones**:
- Recomendaciones pendientes
- Acciones implementadas y su impacto
- ROI de mantenimiento proactivo
- Métricas: reducción de fallas, ahorro de tiempo

**Estimación**: 1 semana

---

## 📊 PRIORIZACIÓN RECOMENDADA

### ⚡ SPRINT 1 (2 semanas) - Quick Wins
1. ✅ Botón eliminar incidencias (Admin only)
2. ✅ Opción "Otro" en síntomas
3. ✅ Filtro por estado (incluyendo "Rechazadas")
4. ✅ Mejorar confirmaciones de eliminación

**Valor de negocio**: Alto (solicitud directa del usuario)  
**Esfuerzo**: Bajo  
**Riesgo**: Mínimo

---

### 🎯 SPRINT 2-3 (4 semanas) - Síntomas Contextuales
1. Síntomas por categoría de equipo
2. Árbol jerárquico (sin IA)
3. Guardar síntomas custom para enriquecer lista

**Valor de negocio**: Medio-Alto (mejora UX)  
**Esfuerzo**: Medio  
**Riesgo**: Bajo

---

### 📈 SPRINT 4-6 (6 semanas) - Predictivo Básico
1. Colección y servicios
2. Análisis de patrones (cron job)
3. Dashboard de alertas
4. Integración con preventivo (crear tareas desde alertas)

**Valor de negocio**: Alto (ROI medible)  
**Esfuerzo**: Alto  
**Riesgo**: Medio

---

### 🤖 FASE FUTURA (Requiere presupuesto) - IA Generativa
1. Infraestructura OpenAI/Claude
2. Componente dinámico
3. Sistema de aprendizaje

**Valor de negocio**: Muy Alto (diferenciador)  
**Esfuerzo**: Muy Alto  
**Riesgo**: Alto (costos, complejidad)  
**Requiere**: API Key ($180-360/mes operacional)

---

## 🔍 REPOSITORIOS DE REFERENCIA

### Sistemas de Mantenimiento con RBAC

**ERPNext (Frappe)**
- Repo: `frappe/erpnext`
- Módulo: `erpnext/maintenance/`
- **Características relevantes**:
  - Sistema robusto de permisos por rol
  - `MaintenanceSchedule`, `MaintenanceVisit`
  - Asset Maintenance con tareas preventivas
  - Roles: Maintenance User, Maintenance Manager
  - **Lección**: Separación clara entre "Visit" (correctivo) y "Schedule" (preventivo)

**Archivos clave**:
- `erpnext/maintenance/doctype/maintenance_schedule/maintenance_schedule.py`
- `erpnext/assets/doctype/asset_maintenance/asset_maintenance.py`
- `erpnext/setup/doctype/authorization_control/authorization_control.py`

---

## 📝 RESUMEN EJECUTIVO

### ✅ Lo que SÍ tenemos y funciona bien:
1. Sistema de permisos robusto (30+ permisos)
2. Mantenimiento correctivo completo (incidencias)
3. Mantenimiento preventivo completo (tareas programadas)
4. Asignación de técnicos con notificaciones
5. Sistema de jerarquía de 8 niveles

### ⚠️ Lo que falta implementar:
1. **UI para eliminar incidencias** (backend existe)
2. **Mantenimiento predictivo** (análisis de patrones)
3. **Mantenimiento proactivo** (recomendaciones inteligentes)
4. **Síntomas contextuales** (filtrados por equipo)
5. **Sistema de IA generativa** (requiere presupuesto)
6. **Integración entre tipos** de mantenimiento

### 💡 Recomendación:
**Empezar con Fase 1 (Quick Wins)** para dar respuesta inmediata a las preguntas del usuario, luego evaluar presupuesto y recursos para fases 2-5.

---

## 📞 Siguiente Paso

**¿Quieres que implemente algo específico ahora?** Por ejemplo:
1. Botón de eliminación para admin
2. Opción "Otro" en síntomas
3. Filtro por estado "Rechazadas"
4. Todo lo de Fase 1 (Quick Wins)

O prefieres discutir más sobre alguna fase específica antes de empezar?
