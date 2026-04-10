---
name: grader-diario
description: Guia de trabajo con el modulo Analisis Grader durante un turno de produccion real. Cubre flujo de carga, interpretacion de KPIs, lectura de Tendencia, cuándo aplicar sugerencias de IA. Usar al inicio de sesion cuando se va a trabajar con datos de la clasificadora.
argument-hint: ""
---

# Analisis Grader — Guia de uso en turno

Modulo de soporte de decisiones en tiempo real para operadores de la clasificadora de salmones.

---

## Flujo de trabajo en turno

```
1. Exportar Excel desde software Matrix
   └── Archivo PIEZA_PIEZA (obligatorio — fuente de verdad)
   └── Archivo PUERTA_0 (opcional — enriquece razones de rechazo)

2. Subir a /analisis-grader
   └── Arrastrar ambos archivos al dropzone único
   └── El análisis se dispara automáticamente al detectar PIEZA_PIEZA

3. Revisar KPIs en la parte superior
   └── % Punto Cero = KPI principal. >3.5% = crítico, >2% = advertencia
   └── Peso promedio y mediano (calibre inferido)
   └── Distribución de calibres

4. Revisar tab Tendencia (el más importante durante el turno)
   └── Panel proyección: ¿cómo cerrará el turno?
   └── Recomendaciones automáticas si P0 proyectado > umbral

5. Aplicar sugerencias de compuerta si P0 > umbral
   └── Tab Compuertas o tab Sugerencias
   └── Botón "Aplicar" actualiza la configuración de gates en vivo

6. Guardar sesión al final del turno
   └── Botón "Guardar Sesión" en el action bar
   └── Queda en /analisis-grader/sesiones para comparar turnos futuros
```

---

## Arquitectura de datos

| Concepto | Descripcion |
|----------|-------------|
| `PIEZA_PIEZA` | Fuente de verdad. Peso, calibre, calidad, gate, lote, timestamp por pieza |
| `PUERTA_0` | Enriquece razones de rechazo (fotocélula, fuera de límites, etc.) |
| Gate 0 / Punto Cero | Rechazados. El % es el KPI principal del turno |
| Gates 1–12 | Compuertas activas. Cada una tiene calibre + calidad asignados |
| Intervalo | Agrupación de datos cada 15 min (configurable) |

---

## KPIs y su interpretación

| KPI | Verde | Amarillo | Rojo |
|-----|-------|----------|------|
| % Punto Cero | < 2% | 2–3.5% | > 3.5% |
| CV de peso (variabilidad) | < 15% | 15–25% | > 25% |
| Concentración HHI | Baja | Media | Alta (una compuerta tiene todo) |

---

## Tab Tendencia — clave para proyectar el turno

El tab Tendencia usa regresión lineal sobre los datos observados para proyectar cómo cerrará el turno.

**Panel de proyección** (top de la card):
- **Tiempo restante**: minutos hasta el fin del turno configurado
- **P0 proyectado al cierre**: si es rojo, actuar ahora
- **Piezas proyectadas**: estimación de producción total del turno
- **Tendencia de peso**: ↑ subiendo, ↓ bajando, → estable

**¿Cuándo actuar?**
- P0 proyectado > umbral crítico (3.5%) → aplicar sugerencias inmediatamente
- P0 proyectado > umbral warn (2%) → monitorear, preparar ajuste
- CV creciendo en tabla de intervalos → posible problema de sensor

**Reacción temprana**:
Los umbrales son ajustables (por defecto: warn 2%, crítico 3.5%).
Las recomendaciones automáticas sugieren cambios de compuerta basados en la proyección.

---

## Análisis IA

Presionar "Analizar ahora" en el tab Tendencia para obtener:
- Recomendaciones priorizadas (alta/media/baja)
- Razones con evidencia de los datos
- Historial de corridas anteriores (Ver historial)
- Comparativa de consistencia entre corridas

**Cuándo confiar en la IA:**
- Consistencia alta (> 70%) entre corridas → recomendar confianza
- Consistencia baja (< 40%) → tomar como hipótesis, corroborar con planta

---

## Archivos clave en el código

```
apps/pwa/src/pages/AnalisisGrader/
  AnalisisGraderWizardPage.tsx      ← contenedor principal
  AnalisisGraderUploadPage.tsx      ← dropzone + auto-análisis
  AnalisisGraderDashboardPage.tsx   ← dashboard completo (~4500 líneas)

apps/pwa/src/services/grader/
  graderAnalytics.ts                ← motor de cálculo KPIs, HHI
  graderInsights.ts                 ← insights deterministas + tendencia
  graderParser.ts                   ← parseo Excel Matrix (PP y P0)
  types.ts                          ← ParsedMatrixData, GateAssignment, etc.
  graderShiftSchedule.ts            ← ventanas de turno (inicio/fin)
```

---

## Pendientes de desarrollo próxima sesión

Ver sección P0 en CLAUDE.md. Resumen:
1. Panel proyección turno (top de Tendencia)
2. Chart de peso modo simple/detallado (toggle)
3. Badge P0 cierre prominente (header de card)
4. Umbrales colapsables
5. Comparativa turno día/noche
6. Detección de degradación de sensores
