# 🔒 Mejoras de Reglas Firestore - v1.1.0

**Fecha:** 26 de diciembre de 2025  
**Versión anterior:** v1.0.6  
**Versión nueva:** v1.1.0

---

## ✅ MEJORAS IMPLEMENTADAS

### 1. Funciones Helper Adicionales

#### **Nuevas funciones de roles:**
```javascript
function isTechnician() // Admin, Supervisor o Técnico
function isActiveUser() // Usuario autenticado Y activo
```

#### **Nuevas funciones de validación:**
```javascript
function isValidDocSize() // Máx 1MB por documento
function isValidEmail(email) // Regex validación email
function isNonEmptyString(value, minLen, maxLen) // String válido sin espacios vacíos
function isFutureTimestamp(timestamp) // Fecha en el futuro
function isPastOrPresentTimestamp(timestamp) // Fecha pasada o actual
```

---

### 2. Incidencias - Validación Exhaustiva

#### **Cambios en `create`:**
- ✅ Validación de tamaño de documento (<1MB)
- ✅ `isNonEmptyString()` para titulo y descripcion (no solo espacios)
- ✅ Validación de `requiresValidation` (bool requerido)
- ✅ Validación de `fotos` como lista con máx 10 elementos
- ✅ **`zoneId` O `hierarchyNodeId` requerido** (al menos uno)
- ✅ Timestamps deben ser pasados o presentes
- ✅ Validación de campos opcionales:
  - `sintomas`: lista con máx 20 elementos
  - `rejectionReason`: 10-500 caracteres
  - `resolucion`: 20-1000 caracteres
  - `tiempoResolucionMinutos`: int
  - `firmaCierre`: string

#### **Cambios en `update`:**
- ✅ Solo usuarios activos pueden actualizar
- ✅ Técnicos pueden actualizar si están asignados (`asignadoA`)
- ✅ Solo supervisores pueden validar (`validatedBy`)
- ✅ Solo supervisores pueden asignar (`asignadoA`)
- ✅ Validación de `updatedAt` como timestamp presente

---

### 3. Usuarios - Validación de Perfil

#### **Cambios en `create`:**
- ✅ Validación de email con regex
- ✅ Rol debe ser: `admin`, `supervisor`, `tecnico`, `usuario`
- ✅ Nombre y apellido: 2-50 caracteres
- ✅ Teléfono: 7-15 caracteres (opcional)
- ✅ Timestamps requeridos

#### **Cambios en `update`:**
- ✅ Solo admin puede cambiar `rol`
- ✅ Solo admin puede cambiar `activo`
- ✅ Owner o admin pueden actualizar perfil
- ✅ Validación de email si se actualiza

---

### 4. Equipos - Validación de Activos

#### **Cambios en `create`:**
- ✅ **`zoneId` O `hierarchyNodeId` requerido**
- ✅ Año de fabricación: 1900-2100
- ✅ Horas de operación: number
- ✅ Timestamps de mantenimiento
- ✅ Especificaciones como map

#### **Cambios en `update`:**
- ✅ Supervisores o técnicos pueden actualizar
- ✅ Validación de tamaño de documento

---

### 5. Tareas Preventivas - Validación de Mantenimiento

#### **Cambios en `create`:**
- ✅ Nombre: 5-100 caracteres
- ✅ Descripción: 10-500 caracteres
- ✅ Frecuencia: 1-365 días
- ✅ Próxima ejecución debe ser futura (`isFutureTimestamp`)
- ✅ Duración estimada: int positivo
- ✅ Instrucciones como lista

#### **Permisos:**
- ✅ Solo supervisores/admin pueden crear
- ✅ Solo admin puede eliminar

---

### 6. Ejecuciones Preventivas - Registro de Trabajos

#### **Cambios en `create`:**
- ✅ Técnicos pueden crear ejecuciones
- ✅ Fecha de ejecución debe ser pasada o presente
- ✅ Ejecutado por debe ser el usuario autenticado
- ✅ Observaciones: 10-500 caracteres (opcional)
- ✅ Fotos: máx 10 elementos

---

## 🔐 MEJORAS DE SEGURIDAD

### Antes vs Después

| Aspecto | Antes (v1.0.6) | Después (v1.1.0) |
|---------|---------------|------------------|
| **Tamaño de docs** | Sin límite | Máx 1MB |
| **Strings vacíos** | Permitidos | Rechazados con `trim()` |
| **Emails** | Sin validación | Regex validación |
| **Timestamps futuros** | Sin validación | `isFutureTimestamp()` |
| **Rol de técnicos** | No existía | Permisos específicos |
| **Usuario activo** | Sin validar | `isActiveUser()` requerido |
| **Asignación** | Sin restricción | Solo supervisores |
| **Validación** | Sin restricción | Solo supervisores |
| **hierarchyNodeId** | No soportado | Validado como alternativa a zoneId |

---

## 📊 IMPACTO

### Seguridad:
- 🔒 **+8 validaciones de integridad de datos**
- 🔒 **+5 funciones helper de validación**
- 🔒 **+3 restricciones de permisos por rol**

### Performance:
- ⚡ Límite de 1MB por documento (evita docs gigantes)
- ⚡ Validación de timestamps (evita consultas futuras)

### Calidad de Datos:
- ✅ No más strings solo con espacios
- ✅ Emails válidos siempre
- ✅ Años de fabricación realistas
- ✅ Frecuencias de mantenimiento sensatas (1-365 días)

---

## 🚀 DESPLIEGUE

### Pasos para desplegar:

```bash
# 1. Validar reglas localmente (opcional)
firebase emulators:start --only firestore

# 2. Desplegar a producción
firebase deploy --only firestore:rules

# 3. Verificar en consola
# https://console.firebase.google.com → Firestore → Rules
```

### Testing recomendado:

```bash
# Correr tests de reglas
firebase emulators:exec --only firestore "npm test"
```

---

## ⚠️ CONSIDERACIONES

### Cambios Breaking:

1. **Usuario activo requerido:**
   - Todos los usuarios deben tener `activo: true`
   - Si existen usuarios sin este campo, agregar antes de desplegar

2. **Rol de técnico:**
   - Nuevo rol `tecnico` disponible
   - Usuarios con acceso limitado pueden usar este rol

3. **hierarchyNodeId en equipos:**
   - Equipos antiguos con solo `zoneId` seguirán funcionando
   - Nuevos equipos pueden usar `hierarchyNodeId`

### Migración de datos existentes:

```javascript
// Script de migración (opcional)
// Si hay usuarios sin campo "activo"
db.collection('users').get().then(snapshot => {
  snapshot.forEach(doc => {
    if (!doc.data().activo) {
      doc.ref.update({ activo: true })
    }
  })
})
```

---

## 📋 PRÓXIMOS PASOS

### Validaciones adicionales pendientes:

- [ ] **Repuestos:** Validar stock >= 0, precio > 0
- [ ] **Inventario:** Validar movimientos con cantidades positivas
- [ ] **Análisis RCA:** Validar estructura de Ishikawa/5 Porqués
- [ ] **Predicciones:** Validar confianza 0-1, fecha futura

### Mejoras de logging:

- [ ] **Auditoría:** Agregar collection `auditLogs` para cambios críticos
- [ ] **Eventos:** Log de validaciones/rechazos/asignaciones

---

## 🔧 ROLLBACK

Si necesitas volver a la versión anterior:

```bash
# Ver historial
firebase firestore:rules:list

# Volver a versión específica
firebase firestore:rules:release <RELEASE_NAME>
```

---

**Última actualización:** 26 de diciembre de 2025  
**Autor:** GitHub Copilot  
**Revisión:** Pendiente de testing en producción
