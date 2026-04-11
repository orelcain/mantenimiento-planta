---
name: grader-historico
description: Guia para construir el archivo historico de produccion Grader desde cero. Cubre que archivos exportar de Matrix, en que orden subirlos, como verificar que quedaron bien en el calendario, y como manejar el caso de subir PP y P0 por separado. Usar cuando el usuario quiere poblar el historial del modulo Grader con datos pasados.
argument-hint: ""
---

# Grader Histórico — Construir archivo de producción desde cero

Guía para cargar datos históricos de la clasificadora al módulo de Calendario.
Una vez cargados, se accede pinchando en el día → sin necesidad de volver a subir el Excel.

---

## Qué archivos exportar de Matrix

Matrix genera dos tipos de Excel por turno:

| Archivo | Columna clave | Contiene |
|---------|--------------|----------|
| **PIEZA_PIEZA** | `PIEZA_PIEZA` o `Peso`, `Calibre`, `Gate` | Todas las piezas clasificadas — es la fuente de verdad de producción |
| **PUERTA_0** | `PUERTA_0` o `Error máquina` | Solo los rechazos con la razón de rechazo (fotocélula, fuera de límites, etc.) |

**Regla**: PIEZA_PIEZA es obligatorio. PUERTA_0 es opcional pero enriquece el análisis de causas P0.

Matrix permite exportar rangos de fechas — se puede exportar 1 semana, 1 mes o más en un solo archivo.

---

## Flujo de carga — opción rápida (desde página principal)

1. Ir a **Análisis Grader** (página normal)
2. Arrastrar el archivo Excel al dropzone
3. Aparece banner azul automáticamente:
   - `"Archivo multi-día detectado — X días · Y turnos"` si es PP
   - `"Archivo P0 multi-día — actualizará causas P0 sin borrar datos PP"` si es PUERTA_0
4. Clic en **"Guardar en Calendario"**
5. Redirige automáticamente al mes con los datos

---

## Flujo de carga — opción batch (múltiples archivos a la vez)

1. Ir a **Carga Masiva** (botón en el header de Análisis Grader)
2. Arrastrar **todos** los archivos PP + P0 juntos al dropzone
3. El sistema auto-detecta cuál es PP y cuál es P0
4. Preview: muestra cuántos días y turnos se van a guardar
5. Clic en **"Guardar todos en Calendario"**

---

## Orden recomendado para carga incremental

Si tenés archivos separados por período (ej: semana 1, semana 2...):

```
1. Subir todos los PP primero
   → Calendario se puebla con días y KPIs
   → Cada día muestra "Falta P0" (badge rojo)

2. Subir los P0 correspondientes
   → Se actualiza solo el campo de causas P0
   → Los KPIs de producción (piezas, peso, etc.) NO se borran
   → Badge "Falta P0" desaparece

3. Verificar en el calendario que los días están completos
   → Sin badges rojos = datos completos
```

**IMPORTANTE**: El sistema usa merge inteligente. Subir P0 después de PP nunca borra los datos de producción. Se puede subir en cualquier orden.

---

## Cómo verificar que quedó bien

En el **Calendario** (`/analisis-grader/calendario`):

| Lo que se ve | Significa |
|---|---|
| Celda con color rojo/amarillo/verde | Día con datos — color según % P0 |
| Badge rojo **"Falta PP"** | No se subió el archivo PIEZA_PIEZA para ese día |
| Badge rojo **"Falta P0"** | No se subió el archivo PUERTA_0 para ese día |
| Sin badges, celda de color | Datos completos ✓ |
| Celda gris/sin color | Sin datos para ese día |

Pinchar en un día → panel derecho muestra cada turno con sus KPIs.

---

## Problemas conocidos y soluciones

### "Maximum call stack size exceeded" al cargar
- **Causa**: archivo con 100k+ registros — el browser se quedó sin stack al procesar
- **Solución**: recargar la página y volver a subir (ya está corregido en v2.75.0+)
- Si sigue fallando: dividir el archivo en períodos más cortos en Matrix antes de exportar

### El calendario muestra el mes actual en vez del mes del archivo
- **Causa**: versión anterior del código
- **Solución**: ya corregido en v2.75.0 — navega automáticamente al mes correcto

### "Failed to fetch dynamically imported module" al navegar al calendario
- **Causa**: caché del navegador con versión vieja de la app
- **Solución**: clic en "Recargar página" — los datos YA están guardados en Firestore, no se pierden

### Subí P0 y los KPIs quedaron en 0
- **Causa**: versión anterior del código (el P0 sobreescribía el PP)
- **Solución**: ya corregido en v2.75.0 — subir el PP nuevamente para restaurar los KPIs

---

## Arquitectura técnica (para debugging)

```
Firestore: graderDailySummaries/{dateKey}__{shiftId}
  - dateKey: "2025-07-14"
  - shiftId: "Turno día" | "Turno tarde" | "Turno noche"
  - hasPieceData: true/false  ← si se subió PP
  - hasGate0Data: true/false  ← si se subió P0
  - totalPieces, pointZeroPct, topP0Causes, etc.

Segmentación: graderSegmenter.ts
  - segmentByDayAndShift() — agrupa registros por día+turno
  - computeShiftSummary() — calcula KPIs del segmento
  - Turno noche cruza medianoche → sessionDate = día anterior

Save strategy:
  - PP upload: setDoc() sin merge → overwrite completo
  - P0-only upload: setDoc({ merge: true }) → solo actualiza topP0Causes + hasGate0Data
```

---

## Checklist de carga inicial

```
[ ] Exportar archivos PP de Matrix (por período o todos juntos)
[ ] Exportar archivos P0 de Matrix
[ ] Subir PP desde Análisis Grader → "Guardar en Calendario"
[ ] Verificar que el calendario muestre los días con colores
[ ] Subir P0 correspondientes
[ ] Verificar que desaparezcan los badges "Falta P0"
[ ] Pinchar en un día y verificar que los KPIs se ven correctos
```
