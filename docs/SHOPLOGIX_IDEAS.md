# Shoplogix — Mejoras naturales & ideas

Registro vivo de ideas que van surgiendo mientras construimos la integración.
Mantener ordenado por prioridad + estado. Cada idea incluye contexto y valor.

**Leyenda de prioridad:**
- 🔥 P0 — alto valor, bajo esfuerzo (hacer pronto)
- ⚡ P1 — alto valor, esfuerzo medio
- 💡 P2 — valor nicho o exploratorio
- 📌 Backlog — ver si surge necesidad real

---

## 🎯 Próxima sesión — decidido por usuario 2026-04-24

### A. Emparejar gráfico Grader ↔ Baaders (alineación pixel-perfect)
**Contexto actual:** tenemos shiftWindow alignment (mismo rango lógico de tiempo)
pero el Grader usa ECharts (con padding interno) y los Baaders usan divs flex.
Una línea vertical a las 14:37 NO cae en el mismo X pixel en ambos charts.

**Mejora propuesta:**
- Extraer el xAxis layout del ECharts del Grader (grid.left / grid.right)
- Aplicar mismo padding al panel upstream
- O (más ambicioso): renderizar los 3 Baader Gantts COMO series ECharts
  dentro del mismo gráfico del Grader → alineación nativa perfecta
- Render vertical lines visibles en ambos charts al hacer hover

**Esfuerzo:** 1-2 días (cauteloso).
**Valor:** CORRELACIÓN VISUAL INMEDIATA — ver el paro Grader y ver arriba qué
estaban haciendo las Baaders en ese mismo pixel.

### B. Marcadores de paros Baader SOBRE timeline del Grader
Complemento de A: cuando una Baader está parada, mostrar una pequeña franja
coloreada en una "sub-fila" del chart del Grader (ej: abajo del eje X)
indicando qué Baader estaba parada y por qué.

### C. Mejoras visuales a los gráficos de los Baaders
Ideas específicas:
- Altura mayor del Gantt (actual h-4, probar h-6 o h-8)
- Separación visual más clara entre máquinas (borde o fondo alternado)
- Colores más brand-consistent con el resto del Grader
- Hover estados con más info (piezas totales en ese intervalo, etc.)
- Zoom/pan sincronizado con el timeline del Grader

**Todo esto depende de A primero** — si conseguimos alineación pixel-perfect,
muchas de estas mejoras emergen naturales.

---

## 🔥 P0 — hacer pronto

### 1. Hora local Chile en timestamps (fmtHHmm)
**Contexto:** Ahora mostramos `getUTCHours()` para que coincida con lo que
Shoplogix muestra en su UI. Pero el operador chileno ve "08:00" cuando su
reloj marca 05:00 (UTC-3) en invierno. Ambiguo.

**Mejora:** detectar si el timestamp viene con offset real vs "wall-clock
disfrazado de UTC" y mostrar hora local real.

**Esfuerzo:** 1-2h. **Valor:** evitar confusión de operadores.

---

### 2. Microparadas por máquina — ranking automático
**Contexto:** En Feb 26 vimos E3 con 61 microparadas (vs 32 y 40 en E1/E2).
Eso es señal de problema mecánico específico.

**Mejora:** en el panel, destacar con color (amarillo/rojo) si una máquina
tiene >50% más microparadas que el promedio de la línea. Badge "⚠️ Atención".

**Esfuerzo:** 30 min. **Valor:** mantención predictiva visible sin clics.

---

### 3. Click en máquina → highlight en timeline del Grader
**Contexto:** Si clickeo Evisceradora 2 en el panel upstream, debería
resaltar en el timeline del Grader el mismo rango horario con un overlay
sutil. Así se conecta visualmente.

**Esfuerzo:** 2-3h. **Valor:** sinergia visual inmediata.

---

## ⚡ P1 — esfuerzo medio

### 4. Tick marks de horas en el Gantt Baader
**Contexto:** El mini-gantt muestra colores pero sin referencias de hora.
Difícil saber si un paro fue "a las 11" o "a las 14".

**Mejora:** agregar una escala horaria sutil arriba/abajo del gantt
con marcas cada 1h (08:00, 09:00, etc).

---

### 5. Alineación temporal con el shift del Grader
**Contexto:** El Grader tiene su propia ventana de turno (ej: 07:00-19:00).
Shoplogix puede tener diferente (ej: 08:00-15:15). Si los alineamos al
mismo eje X, se ve mejor la correlación.

**Mejora:** pasar `shiftWindow` del Grader al panel upstream. Renderizar
el Gantt en el rango del Grader. Donde Baader no tiene data → gris claro.

---

### 6. Correlación automática de paros
**Contexto:** Si hay un paro del Grader entre 14:30-14:45 y las 3 Baaders
pararon entre 14:25-14:35, la causa raíz probablemente es upstream.

**Mejora:** detectar paros temporalmente correlacionados (±5 min) y
mostrar texto automático: "Este paro del Grader coincide con Limpieza
de Ducto en E2 (−3 min) → probable causa raíz upstream".

---

### 7. Export de turno con data upstream
**Contexto:** El PDF export del Grader actual no incluye Baaders.

**Mejora:** agregar sección "Contexto upstream" al PDF con:
- Mini tabla por Baader (total, ratio, runtime, microparadas)
- Observación automática si alguna tuvo anomalías

---

### 8. Panel colapsable por default en móvil
**Contexto:** En móvil el panel expandido ocupa mucha pantalla.

**Mejora:** `defaultCollapsed={isMobile}` con un badge de resumen
en el header cuando está colapsado.

---

## 💡 P2 — valor específico

### 9. Estado "en vivo" para máquinas corriendo
**Contexto:** Cuando una Baader está actualmente `current: true` y en
`type: uptime`, debería mostrar un badge pulsante "● En vivo".

---

### 10. Comentarios del operador
**Contexto:** Shoplogix summary trae `comments[]`. Si el operador de
Baader dejó anotaciones, mostrarlas en el panel colapsable.

---

### 11. Comparación con turno anterior
**Contexto:** "E2 hoy tuvo 40 microparadas vs 12 de ayer — investigar"

**Mejora:** query del turno previo mismo día o mismo shift día anterior,
mostrar delta.

---

### 12. Scatter P0% Grader vs ritmo Baader
**Contexto:** Clásico diagnóstico de causa raíz.

**Mejora:** pestaña nueva "Correlaciones" con scatter plot. Cada punto
= 5 min. X = ritmo promedio Baaders, Y = P0% Grader. Buscar patrones.

---

### 13. Alertas push cuando Baader para >15 min
**Contexto:** Supervisor del Grader podría tener un FCM push cuando
una Baader para prolongadamente (impacto inminente).

---

## 📌 Backlog — para pensar

### 14. Integrar Marel HG (pesaje inicial)
Aún no verificamos si Shoplogix trackea la Marel. Si sí, agregarla al
head del pipeline: Marel → B1/B2/B3 → Grader.

### 15. Sistema Knuro (limpieza adosada a Baaders)
Si Shoplogix lo trackea separado. Sino, puede ser un subestado de la
propia Baader (ej: `reason: "Knuro error"`).

### 16. Datos de otras plantas AquaChile
La API nos da acceso a Cardonal, Calbuco, Quellon, Magallanes también.
¿Valor para comparativa inter-planta?

### 17. Tendencia semanal de OEE por Baader
Gráfico pequeño al hover de la máquina mostrando últimos 7 turnos.

### 18. Login automatizado Shoplogix
Deuda técnica. Replicar POST login → auto-refresh cookie cada 7h.
Actual: manual cada 8h.

### 19. Observación de calidad por tipo de pescado
Si las Baaders procesan COHO vs SALMÓN ATLÁNTICO distinto, ¿cambia
el P0 del Grader? Data de `productionUnits` puede ayudar.

### 20. Benchmark inter-máquina
E1 vs E2 vs E3 a lo largo del tiempo. ¿Alguna consistentemente peor?

---

## ✅ Hechas (referencia)

- Panel UpstreamMachinesPanel con KPIs Shoplogix-style (verde/amarillo/rojo)
- Leyenda de paros con durations agregadas
- Mini Gantt coloreado + mini barras producción + línea objetivo
- Expand/collapse por máquina
- Cloud Function con sync automático
- Firestore rules shoplogix/
- Doc de deploy SHOPLOGIX_DEPLOY.md
- Ticks horarios + shiftWindow alignment (iter 1)
- Badge "⚠️ Atención" para microparadas anómalas (iter 1)
- UpstreamCorrelationCard — hipótesis automática de causa raíz por paro Grader (iter 2)

## ✅ P0 corregidos

### 21. leadSec positivo — FIX aplicado
**Era:** contributors mostraban `lead +86 min` (Baader paró DESPUÉS del
Grader → no puede ser causa).

**Fix:** `correlatePausesWithUpstream` ahora filtra contributors con
`leadSec > 120` (tolerancia de 2 min para lag de sensor).
Tests agregados: 2 casos nuevos.

---

## 🧪 Observaciones del campo (para revisar)

### Feb 26 — actualRuntime 11.2% es muy bajo
E1 tuvo solo 11.2% de runtime en 9h de turno. La categoría "Planned Downtime"
domina con 4h 15min por máquina. Posibles causas:
- Día de mantención programada
- Cambio de producto a mitad turno
- Paro anticipado

Valdría la pena revisar: ¿estos "Planned Downtime" son realmente planificados
o Shoplogix los registra así por default cuando no hay señal OPC?

### Ticks 10:00-22:00 UTC vs hora Chile
Los ticks se ven "10:00, 11:00, ..." pero en hora Chile eso sería 07:00-19:00.
Los datos de Shoplogix aparecen en el rango correcto visualmente (overlap de
hora-wall-clock), pero el LABEL de los ticks es UTC. Podría confundir al
operador que espera ver "hora de la planta".

**Fix propuesto** (P0 idea 1 en arriba): display con Chile TZ ajustada.
