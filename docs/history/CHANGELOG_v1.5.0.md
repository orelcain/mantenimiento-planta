# 🚀 Changelog - v1.5.0

**Fecha:** 27 de diciembre de 2025  
**Tipo:** Feature Release (Inteligencia Artificial + IoT)

---

## ✨ Nuevas Funcionalidades

### 🤖 **Inteligencia Artificial Generativa**
- ✅ **Síntomas contextuales con IA**: Al seleccionar un equipo, el sistema genera automáticamente síntomas específicos usando Groq AI (gratis)
- ✅ **Servicio `ai.ts`**: 
  - `generateSymptoms()`: Sugerencias inteligentes por equipo
  - `analyzeRecurrentIssues()`: Detección de patrones
  - `predictNextFailure()`: Predicción de fallas
  - `analyzeRootCause()`: Análisis de causa raíz con ROI
- ✅ **Indicador visual**: Badge "Sugerencias IA" con icono ✨ Sparkles

### 🔐 **Gestión de Permisos Configurable**
- ✅ **Panel de administración**: `PermissionsManager.tsx`
- ✅ **25+ permisos configurables** por rol:
  - 🚨 Incidencias (crear, ver, editar, eliminar, validar, asignar, cerrar)
  - 🔧 Mantenimiento (preventivo, predictivo, proactivo)
  - 👥 Usuarios (ver, crear, editar, eliminar, roles)
  - 📡 IoT (ver sensores, configurar, gestionar dispositivos)
  - 📊 Reportes (ver, exportar, analytics)
- ✅ **Permisos por defecto** optimizados por rol
- ✅ **Guardado persistente** (localStorage + Firestore)
- ✅ **Badges de solo Admin** para permisos críticos

### 🗑️ **Eliminación de Incidencias**
- ✅ **Botón "Eliminar"** en `IncidentDetail.tsx`
- ✅ **Restricción a Admin**: Solo usuarios con rol `admin` pueden eliminar
- ✅ **Confirmación de seguridad**: Diálogo de confirmación antes de borrar
- ✅ **Icono Trash2** de Lucide React

### 🔍 **Mejoras en Síntomas**
- ✅ **Opción "Otro"** agregada a lista de síntomas comunes
- ✅ **Síntomas dinámicos**: Cambian según equipo seleccionado
- ✅ **Loading state**: Spinner mientras genera síntomas con IA

### 📡 **Preparación IoT**
- ✅ **Tipos TypeScript completos**:
  - `IoTDevice`: Gestión de dispositivos (ESP32, LOGO 8, PLCs)
  - `SensorReading`: Lecturas de sensores con timestamp
  - `SensorData`: Datos históricos y anomalías
  - `IoTAlert`: Alertas automáticas con thresholds
  - `AIAnalysis`: Análisis de IA con confidence scores
  - `PatternDetection`: Detección de patrones recurrentes
- ✅ **Configuración AppSettings** para IoT y IA
- ✅ **9 tipos de sensores** soportados: vibración, temperatura, corriente, presión, flujo, humedad, RPM, potencia, sonido

---

## 📚 Documentación Nueva

### 📄 **IMPLEMENTATION_MASTER_PLAN.md**
Plan maestro de 12 semanas para implementar:
- 4 tipos de mantenimiento (Correctivo, Preventivo, Predictivo, Proactivo)
- Integración completa con IA (Groq gratuita)
- IoT con LOGO 8 + ESP32 ($328 USD hardware total)
- 6 sprints detallados con entregables

### 📄 **LOGO8_SETUP.md**
Guía técnica completa para conectar LOGO 8:
- 3 opciones de conexión (Modbus TCP recomendada)
- Firmware ESP32 Gateway completo
- Mapeo de variables sugerido
- Troubleshooting y checklist

### 📄 **AI_IMPLEMENTATION_ROADMAP.md**
Roadmap detallado de implementación IA:
- 5 fases progresivas
- Código de ejemplo con Groq API
- Prompts optimizados para mantenimiento
- Análisis de costos ($0/mes vs $180-360/mes OpenAI)

---

## 🔧 Mejoras Técnicas

### TypeScript
- ✅ Tipos `Equipment` exportados en `@/types`
- ✅ Tipos IoT completos con JSDoc
- ✅ Tipos IA con confidence scores

### Componentes
- ✅ `IncidentForm.tsx`: Integración con servicio IA
- ✅ `IncidentDetail.tsx`: Botón eliminar con permisos
- ✅ `PermissionsManager.tsx`: Nuevo componente admin (270 líneas)
- ✅ `HierarchySelector`: Callback con objeto `equipment`

### Servicios
- ✅ `ai.ts`: Servicio completo con Groq (310 líneas)
- ✅ Cache de análisis IA en Firestore
- ✅ Manejo de errores con fallbacks

---

## 📊 Estadísticas

- **Archivos modificados**: 8
- **Archivos nuevos**: 5
- **Líneas de código agregadas**: ~1,200
- **Documentación nueva**: 3 archivos, ~15,000 palabras
- **Tipos TypeScript nuevos**: 12

---

## 🎯 Próximos Pasos

### Sprint 1 (2 semanas)
1. Obtener Groq API Key (gratis)
2. Configurar `.env` con `VITE_GROQ_API_KEY`
3. Probar generación de síntomas en producción
4. Configurar permisos personalizados

### Sprint 2 (3 semanas) - PRIORITARIO
1. Comprar ESP32 Gateway ($8)
2. Conectar LOGO 8 → Firebase
3. Dashboard IoT tiempo real
4. Auto-generación de incidencias por sensores

---

## 🐛 Fixes

- ✅ Eliminación de incidencias ahora funcional (antes solo backend)
- ✅ Síntomas "Otro" disponible en todos los reportes
- ✅ Import de `Equipment` type corregido

---

## 🔄 Breaking Changes

**Ninguno** - Esta versión es 100% compatible con v1.4.0

---

## 📝 Notas de Actualización

### Para Desarrolladores
```bash
# Actualizar dependencias
npm install

# Configurar API Key de Groq (opcional)
echo "VITE_GROQ_API_KEY=gsk_tu_key_aqui" >> apps/pwa/.env

# Rebuild
npm run build
```

### Para Usuarios Admin
1. Acceder a panel de permisos (nueva sección)
2. Revisar permisos por rol
3. Ajustar según necesidades de la organización
4. Guardar cambios

---

## 🙏 Créditos

- **IA Provider**: Groq (llama-3.3-70b-versatile, gratis)
- **IoT Hardware**: ESP32 + LOGO 8
- **Framework**: React + TypeScript + Firebase + Vite

---

**Versión anterior**: [v1.4.0](./RESUMEN_v1.4.0.md)  
**Repositorio**: Sistema de Levantamiento de Incidencias en Planta  
**Autor**: GitHub Copilot + Usuario
