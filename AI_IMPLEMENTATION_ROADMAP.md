# 🤖 Roadmap de Implementación de IA - Sistema de Mantenimiento Inteligente

**Fecha**: 27 de diciembre de 2024  
**Versión**: v1.5.0 (Planificación)  
**Objetivo**: Crear un ciclo cerrado de mejora continua usando IA + Data Real

---

## 🎯 Visión: Ciclo Cerrado de Mantenimiento Inteligente

```
┌─────────────────────────────────────────────────────────────┐
│                    CICLO INTELIGENTE                         │
│                                                              │
│  Incidencia → IA Asiste → Data Acumulada → IA Analiza →    │
│  Patrones → Genera Tareas Preventivas → Previene Fallas →  │
│  Menos Incidencias → IA Aprende → MEJORA CONTINUA          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧠 Puntos Estratégicos para IA

### 1. **Asistente de Reporte de Incidencias** (Correctivo)
- IA ayuda a describir mejor el problema
- Sugiere síntomas contextuales
- Pre-llena campos basándose en histórico

### 2. **Clasificación Automática** (Correctivo → Predictivo)
- IA predice prioridad basándose en descripción
- Sugiere si es recurrente
- Alerta si es precursor de fallo mayor

### 3. **Análisis de Patrones** (Correctivo → Preventivo)
- Detecta problemas recurrentes
- Genera tareas preventivas automáticamente
- Recomienda frecuencias óptimas

### 4. **Predicción de Fallas** (Preventivo → Predictivo)
- Análisis de series temporales
- Identifica equipos en riesgo
- Calcula probabilidad de fallo

### 5. **Optimización de Recursos** (Predictivo → Proactivo)
- Sugiere cambios de diseño/proceso
- Identifica causas raíz
- Recomienda mejoras de largo plazo

### 6. **Búsqueda Semántica** (Transversal)
- Buscar incidencias similares
- Encontrar soluciones previas
- Knowledge base inteligente

---

## 🗺️ ROADMAP DE IMPLEMENTACIÓN

### **FASE 1: Asistente de Síntomas (2 semanas) - MVP IA** ⭐

**Objetivo**: Usuario reporta mejor, IA ayuda en tiempo real

#### **1.1 Síntomas Dinámicos con IA**

**Flujo**:
```
Usuario: Escribe "bomba hace ruido"
    ↓
IA (Groq): Analiza contexto del equipo
    ↓
Genera 5 opciones:
  1. Ruido de rodamiento (desgaste)
  2. Cavitación (succión de aire)
  3. Desalineación de eje
  4. Vibración por desbalance
  5. Golpeteo de válvula
    ↓
Usuario selecciona → IA profundiza en el seleccionado
```

**Implementación**:
```typescript
// apps/pwa/functions/src/ai/symptomAssistant.ts

import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generateSymptoms(
  userInput: string,
  equipmentType: string,
  equipmentHistory: Incident[]
) {
  // Construir contexto rico
  const context = {
    equipment: equipmentType,
    userDescription: userInput,
    recentIssues: equipmentHistory.slice(0, 5).map(i => i.sintomas),
    commonPatterns: analyzePatterns(equipmentHistory)
  };

  const prompt = `Eres un experto en mantenimiento industrial.

CONTEXTO:
- Equipo: ${context.equipment}
- Usuario describe: "${userInput}"
- Incidencias previas: ${context.recentIssues.join(', ')}

TAREA:
Genera 5 síntomas específicos y técnicamente precisos que ayuden a diagnosticar el problema.
Considera el historial del equipo y síntomas recurrentes.

FORMATO: Array JSON con objetos { symptom: string, probability: number, severity: string }

Ejemplo:
[
  { "symptom": "Rodamiento dañado", "probability": 0.8, "severity": "alta" },
  { "symptom": "Falta de lubricación", "probability": 0.6, "severity": "media" }
]`;

  const response = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-70b-versatile",
    temperature: 0.7,
    max_tokens: 300,
  });

  return JSON.parse(response.choices[0].message.content);
}
```

**Caché Inteligente**:
```typescript
// Cache por equipo + input similar
const cacheKey = `${equipmentId}:${normalizeInput(userInput)}`;
const cached = await getCachedSymptoms(cacheKey);

if (cached && cached.age < 7 * 24 * 60 * 60 * 1000) { // 7 días
  return cached.symptoms;
}

const symptoms = await generateSymptoms(userInput, equipment, history);
await cacheSymptoms(cacheKey, symptoms);
return symptoms;
```

**Costo estimado**: ~30 llamadas/día × $0 = **$0/mes** ✅

---

#### **1.2 Auto-Completado Inteligente de Descripción**

**Flujo**:
```
Usuario empieza a escribir: "La bomba central..."
    ↓
IA sugiere: "...no genera presión suficiente desde ayer"
    ↓
Usuario acepta o modifica
    ↓
Descripción completa y técnica
```

**Implementación**:
```typescript
export async function suggestDescription(
  partialText: string,
  equipment: Equipment,
  symptoms: string[]
) {
  const prompt = `Completa esta descripción de incidencia técnica.

CONTEXTO:
- Equipo: ${equipment.nombre} (${equipment.tipo})
- Síntomas: ${symptoms.join(', ')}
- Inicio de descripción: "${partialText}"

TAREA:
Completa la descripción de manera técnica y clara.
Máximo 2 oraciones. Sin preámbulos.`;

  // ... llamada a Groq
  return completion;
}
```

---

#### **1.3 Clasificación Automática de Prioridad**

**Flujo**:
```
Usuario describe incidencia + síntomas
    ↓
IA analiza:
  - Palabras clave (paro, parada, emergencia)
  - Tipo de equipo (crítico vs. secundario)
  - Histórico de impacto
    ↓
Sugiere prioridad: "⚠️ CRÍTICA - Detiene línea de producción"
    ↓
Usuario confirma o ajusta
```

**Implementación**:
```typescript
export async function classifyPriority(
  description: string,
  symptoms: string[],
  equipment: Equipment
) {
  const prompt = `Clasifica la prioridad de esta incidencia.

DATOS:
- Equipo: ${equipment.nombre} (Criticidad: ${equipment.criticidad})
- Descripción: ${description}
- Síntomas: ${symptoms.join(', ')}

CLASIFICA en:
- CRÍTICA: Detiene producción o seguridad en riesgo
- ALTA: Afecta significativamente operación
- MEDIA: Requiere atención pronto
- BAJA: Puede esperar planificación

Responde solo: { "priority": "critica|alta|media|baja", "reason": "explicación breve" }`;

  const response = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-70b-versatile",
    temperature: 0.3, // Más determinista
    max_tokens: 100,
  });

  return JSON.parse(response.choices[0].message.content);
}
```

---

### **FASE 2: Análisis de Patrones (3 semanas) - Correctivo → Preventivo** 📊

**Objetivo**: La IA convierte problemas recurrentes en tareas preventivas

#### **2.1 Detector de Recurrencias**

**Cloud Function que corre diariamente**:
```typescript
// apps/pwa/functions/src/ai/patternAnalyzer.ts

export async function analyzeRecurrentIssues() {
  const last90Days = await getIncidents({ days: 90, status: 'cerrada' });
  
  // Agrupar por equipo
  const byEquipment = groupBy(last90Days, 'equipmentId');
  
  for (const [equipmentId, incidents] of Object.entries(byEquipment)) {
    // IA busca patrones
    const patterns = await detectPatterns(incidents);
    
    for (const pattern of patterns) {
      if (pattern.frequency >= 3 && pattern.avgDaysBetween < 60) {
        // GENERA tarea preventiva automáticamente
        await generatePreventiveTask({
          equipmentId,
          pattern,
          suggestedBy: 'ai',
          confidence: pattern.confidence
        });
      }
    }
  }
}

async function detectPatterns(incidents: Incident[]) {
  const prompt = `Analiza estas incidencias del mismo equipo y encuentra patrones.

INCIDENCIAS (últimos 90 días):
${incidents.map(i => `
- Fecha: ${i.createdAt}
- Síntomas: ${i.sintomas.join(', ')}
- Descripción: ${i.descripcion}
- Causa raíz: ${i.causaRaiz || 'N/A'}
`).join('\n')}

TAREA:
Identifica patrones recurrentes y sugiere acciones preventivas.

FORMATO JSON:
[{
  "pattern": "Fuga de aceite en sello",
  "frequency": 4,
  "avgDaysBetween": 22,
  "confidence": 0.85,
  "suggestedAction": "Reemplazar sellos cada 20 días",
  "estimatedFrequency": "mensual"
}]`;

  const response = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-70b-versatile",
    temperature: 0.4,
    max_tokens: 500,
  });

  return JSON.parse(response.choices[0].message.content);
}
```

**Resultado visible**:
```
📊 Dashboard de Patrones Detectados

🔧 Bomba Centrífuga #3
  ⚠️ Patrón detectado: Fuga de aceite en sello
  📈 Ocurrencias: 4 veces en 90 días (cada ~22 días)
  🤖 IA Sugiere: Tarea preventiva "Inspeccionar sellos" cada 20 días
  ✅ Confianza: 85%
  
  [Crear Tarea Preventiva] [Descartar]
```

---

#### **2.2 Predicción de Próxima Falla**

**IA calcula cuándo fallará de nuevo**:
```typescript
export async function predictNextFailure(
  equipmentId: string,
  incidents: Incident[]
) {
  // Análisis de series temporales
  const dates = incidents.map(i => i.createdAt).sort();
  const intervals = calculateIntervals(dates);
  
  const prompt = `Predice la próxima falla basándose en el historial.

HISTORIAL DE FALLAS:
${dates.map((d, i) => `Falla ${i+1}: ${formatDate(d)}`).join('\n')}

INTERVALOS:
${intervals.map(i => `${i} días`).join(', ')}

TAREA:
Calcula la fecha probable de próxima falla usando análisis de tendencia.

FORMATO:
{
  "predictedDate": "YYYY-MM-DD",
  "confidence": 0.0-1.0,
  "reasoning": "explicación",
  "recommendedAction": "acción sugerida"
}`;

  const response = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-70b-versatile",
    temperature: 0.2,
    max_tokens: 200,
  });

  const prediction = JSON.parse(response.choices[0].message.content);
  
  // Guardar en Firestore
  await createPrediction({
    equipmentId,
    ...prediction,
    generatedAt: new Date(),
    type: 'ai-generated'
  });
  
  return prediction;
}
```

---

### **FASE 3: Búsqueda Semántica (2 semanas) - Knowledge Base** 🔍

**Objetivo**: Encontrar soluciones previas a problemas similares

#### **3.1 Embeddings de Incidencias**

```typescript
// Generar embeddings al cerrar incidencia
export async function generateEmbedding(incident: Incident) {
  const text = `${incident.titulo} ${incident.descripcion} ${incident.sintomas.join(' ')} ${incident.causaRaiz}`;
  
  // Usar Gemini o Hugging Face para embeddings (gratis)
  const embedding = await getEmbedding(text);
  
  // Guardar en colección especial
  await saveEmbedding({
    incidentId: incident.id,
    embedding,
    equipmentType: incident.equipmentType,
    resolved: incident.status === 'cerrada',
    resolution: incident.resolution
  });
}

// Buscar similares
export async function findSimilarIncidents(
  description: string,
  symptoms: string[]
) {
  const queryText = `${description} ${symptoms.join(' ')}`;
  const queryEmbedding = await getEmbedding(queryText);
  
  // Búsqueda por similitud coseno
  const similar = await searchSimilar(queryEmbedding, limit: 5);
  
  return similar.map(s => ({
    incident: s.incident,
    similarity: s.score,
    resolution: s.resolution,
    timeToResolve: s.timeToResolve
  }));
}
```

**UI en IncidentForm**:
```tsx
{similarIncidents.length > 0 && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
    <h4 className="font-medium text-blue-900 mb-2">
      💡 Incidencias similares encontradas
    </h4>
    {similarIncidents.map(s => (
      <div key={s.id} className="mb-2">
        <p className="text-sm">{s.titulo}</p>
        <p className="text-xs text-muted-foreground">
          Resuelto en {s.timeToResolve}h - Similitud: {(s.similarity * 100).toFixed(0)}%
        </p>
        <Button size="sm" variant="link" onClick={() => viewResolution(s)}>
          Ver solución →
        </Button>
      </div>
    ))}
  </div>
)}
```

---

### **FASE 4: Optimización Proactiva (3 semanas) - Ciclo Cerrado** 🔄

**Objetivo**: IA sugiere mejoras de largo plazo basándose en todo el histórico

#### **4.1 Análisis de Causa Raíz con IA**

```typescript
export async function analyzeRootCause(
  equipmentId: string,
  recurrentIssues: Incident[]
) {
  const prompt = `Eres un ingeniero senior de mantenimiento.

PROBLEMA RECURRENTE:
Equipo: ${equipment.nombre}
Fallas en últimos 6 meses: ${recurrentIssues.length}

DETALLES:
${recurrentIssues.map(i => `
- ${formatDate(i.createdAt)}: ${i.sintomas.join(', ')}
- Descripción: ${i.descripcion}
- Solución aplicada: ${i.resolution}
- Causa raíz identificada: ${i.causaRaiz || 'No documentada'}
`).join('\n')}

ANÁLISIS REQUERIDO:
1. Identifica la causa raíz REAL (no solo síntomas)
2. Sugiere solución DEFINITIVA (no parches temporales)
3. Estima ROI de la solución propuesta
4. Prioriza según impacto vs. costo

FORMATO:
{
  "rootCause": "descripción técnica de causa raíz",
  "evidence": ["evidencia 1", "evidencia 2"],
  "proposedSolution": "solución permanente",
  "estimatedCost": número,
  "estimatedSavings": "ahorros anuales estimados",
  "roi": número_en_meses,
  "priority": "alta|media|baja"
}`;

  const response = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-70b-versatile",
    temperature: 0.5,
    max_tokens: 600,
  });

  const analysis = JSON.parse(response.choices[0].message.content);
  
  // Guardar como recomendación proactiva
  await createProactiveRecommendation({
    equipmentId,
    ...analysis,
    type: 'root-cause-analysis',
    generatedAt: new Date(),
    status: 'pending-review'
  });
  
  return analysis;
}
```

**Dashboard Proactivo**:
```
🎯 Recomendaciones de Mejora Continua

┌─────────────────────────────────────────────────┐
│ 🔧 Bomba Centrífuga #3                          │
│                                                  │
│ 🧠 Análisis IA:                                 │
│ Causa raíz: Sellos de baja calidad incompatibles│
│ con temperatura operativa                       │
│                                                  │
│ 💡 Solución propuesta:                          │
│ Reemplazar con sellos marca Premium XYZ-500    │
│ Especificación: Temperatura hasta 120°C        │
│                                                  │
│ 💰 ROI:                                         │
│ Costo: $250 USD                                 │
│ Ahorro anual: $1,200 (4 fallas evitadas)      │
│ Retorno: 2.5 meses                             │
│                                                  │
│ 📊 Prioridad: ALTA                              │
│                                                  │
│ [✅ Aprobar] [📝 Editar] [❌ Descartar]        │
└─────────────────────────────────────────────────┘
```

---

### **FASE 5: Dashboard Inteligente (2 semanas) - Visualización** 📈

#### **5.1 Métricas con IA**

```typescript
// Generar insights automáticos
export async function generateInsights() {
  const last30Days = await getIncidents({ days: 30 });
  const metrics = calculateMetrics(last30Days);
  
  const prompt = `Analiza estas métricas de mantenimiento y genera insights accionables.

MÉTRICAS (últimos 30 días):
- Total incidencias: ${metrics.total}
- Tiempo promedio resolución: ${metrics.avgResolutionTime}h
- Equipos más problemáticos: ${metrics.topEquipment.join(', ')}
- Tasa de recurrencia: ${metrics.recurrenceRate}%
- Costo estimado downtime: $${metrics.downtimeCost}

TAREAS PREVENTIVAS:
- Completadas a tiempo: ${metrics.preventiveOnTime}%
- Atrasadas: ${metrics.preventiveOverdue}

GENERA 3-5 insights clave para gerencia con recomendaciones.

FORMATO:
[{
  "insight": "descripción del hallazgo",
  "impact": "alto|medio|bajo",
  "recommendation": "acción recomendada",
  "estimatedSavings": "ahorro potencial"
}]`;

  const response = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-70b-versatile",
    temperature: 0.6,
    max_tokens: 500,
  });

  return JSON.parse(response.choices[0].message.content);
}
```

**Vista en Dashboard**:
```tsx
<Card>
  <CardHeader>
    <CardTitle>🧠 Insights Generados por IA</CardTitle>
  </CardHeader>
  <CardContent>
    {insights.map(insight => (
      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={insight.impact === 'alto' ? 'destructive' : 'default'}>
            {insight.impact.toUpperCase()}
          </Badge>
          <span className="font-medium">{insight.insight}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          💡 {insight.recommendation}
        </p>
        {insight.estimatedSavings && (
          <p className="text-xs text-green-600">
            Ahorro potencial: {insight.estimatedSavings}
          </p>
        )}
      </div>
    ))}
  </CardContent>
</Card>
```

---

## 🔄 CICLO DE RETROALIMENTACIÓN CONTINUA

### **Flujo Completo Integrado:**

```
┌──────────────────────────────────────────────────────────┐
│                   FASE CORRECTIVA                         │
│                                                           │
│  Usuario reporta → IA asiste síntomas → Clasifica       │
│  prioridad → Busca similares → Sugiere solución         │
│                          ↓                                │
└───────────────────────────┬──────────────────────────────┘
                            │
                ┌───────────▼──────────────┐
                │   DATA ACUMULADA         │
                │  (Firestore + Embeddings)│
                └───────────┬──────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│                   ANÁLISIS NOCTURNO (IA)                  │
│                                                           │
│  Detecta patrones → Calcula recurrencias → Predice      │
│  próximas fallas → Identifica causas raíz               │
│                          ↓                                │
└───────────────────────────┬──────────────────────────────┘
                            │
        ┌──────────────────┴──────────────────┐
        │                                     │
┌───────▼─────────┐              ┌───────────▼───────────┐
│ FASE PREVENTIVA │              │  FASE PREDICTIVA      │
│                 │              │                       │
│ Genera tareas   │              │ Alerta equipos en     │
│ automáticamente │              │ riesgo                │
│                 │              │                       │
└───────┬─────────┘              └───────────┬───────────┘
        │                                    │
        └──────────────┬─────────────────────┘
                       │
             ┌─────────▼──────────┐
             │  FASE PROACTIVA    │
             │                    │
             │ Recomienda mejoras │
             │ de largo plazo     │
             │ (cambios diseño)   │
             └─────────┬──────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │  MENOS INCIDENCIAS    │
           │  IA aprende de éxitos │
           │  MEJORA CONTINUA ✨   │
           └───────────────────────┘
```

---

## 💾 Estructura de Datos para IA

### **Nuevas Colecciones Firestore:**

```typescript
// 1. Embeddings para búsqueda semántica
interface IncidentEmbedding {
  id: string
  incidentId: string
  embedding: number[] // Vector 768 dimensiones
  equipmentType: string
  resolved: boolean
  resolution?: string
  createdAt: Date
}

// 2. Patrones detectados por IA
interface DetectedPattern {
  id: string
  equipmentId: string
  pattern: string
  frequency: number
  avgDaysBetween: number
  confidence: number
  suggestedAction: string
  status: 'pending' | 'approved' | 'rejected'
  detectedAt: Date
}

// 3. Predicciones de fallas
interface FailurePrediction {
  id: string
  equipmentId: string
  predictedDate: Date
  confidence: number
  reasoning: string
  recommendedAction: string
  status: 'pending' | 'occurred' | 'prevented'
  generatedAt: Date
}

// 4. Recomendaciones proactivas
interface ProactiveRecommendation {
  id: string
  equipmentId: string
  rootCause: string
  evidence: string[]
  proposedSolution: string
  estimatedCost: number
  estimatedSavings: string
  roi: number // meses
  priority: 'alta' | 'media' | 'baja'
  status: 'pending-review' | 'approved' | 'implemented' | 'rejected'
  generatedAt: Date
  reviewedBy?: string
  reviewedAt?: Date
}

// 5. Caché de respuestas IA
interface AICache {
  id: string
  cacheKey: string
  prompt: string
  response: any
  model: string
  createdAt: Date
  expiresAt: Date
  hitCount: number
}
```

---

## 📊 Costos y Límites

### **Con Groq (gratis):**

**Límites diarios:**
- 14,400 requests/día
- 6,000 tokens/minuto

**Uso estimado:**
- Asistente síntomas: ~100 requests/día
- Análisis nocturno: ~20 requests/día
- Búsqueda semántica: ~50 requests/día
- Insights: ~5 requests/día
- **TOTAL: ~175 requests/día**

**Utilización: 175 / 14,400 = 1.2%** ✅

### **Fallback a Gemini (gratis):**
- 1 millón tokens/día
- Si Groq falla, usa Gemini
- **Costo: $0/mes**

---

## 🚀 PLAN DE EJECUCIÓN

### **Sprint 1-2 (2 semanas): Asistente de Síntomas**
```bash
✅ Configurar Groq API
✅ Implementar generateSymptoms()
✅ Componente DynamicSymptomSelector
✅ Caché inteligente
✅ Auto-clasificación de prioridad
```

### **Sprint 3-5 (3 semanas): Análisis de Patrones**
```bash
✅ Cloud Function diaria
✅ Detector de recurrencias
✅ Generador automático de tareas preventivas
✅ Predicción de fallas
✅ Dashboard de patrones
```

### **Sprint 6-7 (2 semanas): Búsqueda Semántica**
```bash
✅ Sistema de embeddings
✅ Búsqueda por similitud
✅ UI de incidencias similares
✅ Knowledge base inteligente
```

### **Sprint 8-10 (3 semanas): Proactivo**
```bash
✅ Análisis de causa raíz
✅ Generador de recomendaciones
✅ Dashboard proactivo
✅ Sistema de aprobaciones
```

### **Sprint 11-12 (2 semanas): Dashboard Inteligente**
```bash
✅ Generador de insights
✅ Métricas con IA
✅ Visualizaciones interactivas
✅ Reportes ejecutivos automatizados
```

---

## 🎯 Métricas de Éxito

### **Indicadores Clave:**

1. **Reducción de Incidencias Recurrentes**
   - Meta: -30% en 6 meses
   - Medición: Comparar pre vs. post IA

2. **Tiempo de Resolución**
   - Meta: -20% con sugerencias de similares
   - Medición: Avg time to resolution

3. **Adopción de Tareas Preventivas Generadas**
   - Meta: 70% aprobadas por supervisores
   - Medición: approved / total generated

4. **ROI de Recomendaciones Proactivas**
   - Meta: 5x retorno (implementadas vs. ahorros)
   - Medición: savings / implementation cost

5. **Precisión de Predicciones**
   - Meta: 75% de fallas predichas correctamente
   - Medición: occurred / predicted

---

## 💡 Ventajas del Enfoque Progresivo

✅ **Costo $0/mes** (APIs gratuitas)  
✅ **Implementación incremental** (valor desde Sprint 1)  
✅ **Aprendizaje continuo** (cada incidencia mejora el sistema)  
✅ **Human-in-the-loop** (supervisores validan sugerencias)  
✅ **Escalable** (crece con la data)  
✅ **Ciclo cerrado** (IA aprende de resultados)

---

## 🔐 Consideraciones de Seguridad

1. **No enviar datos sensibles**: Anonimizar IDs de equipos en prompts
2. **Rate limiting**: Controlar llamadas para no exceder límites
3. **Fallback robusto**: Si IA falla, sistema funciona en modo manual
4. **Auditoría**: Loggear todas las sugerencias de IA y decisiones humanas
5. **Validación humana**: Siempre requerir aprobación para acciones críticas

---

## 📚 Recursos y Documentación

- **Groq API Docs**: https://console.groq.com/docs
- **Gemini API**: https://ai.google.dev/docs
- **Firebase Functions**: https://firebase.google.com/docs/functions
- **Vector Search**: https://firebase.google.com/docs/firestore/vector-search

---

## 🎉 Próximos Pasos

1. **Crear API Keys** (Groq + Gemini) - 5 minutos
2. **Setup Firebase Functions** - 1 hora
3. **Implementar Sprint 1** - 2 semanas
4. **Testear con usuarios reales** - 1 semana
5. **Iterar basándose en feedback** - Continuo

---

**¿Empezamos con el Sprint 1 (Asistente de Síntomas)?** 🚀

Este es el que da más valor inmediato y sienta las bases para todo lo demás.
