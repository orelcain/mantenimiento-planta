---
name: evaluar-modulo
description: Evaluación integral 360° de un módulo — busca simplificaciones, código muerto, optimizaciones, mejoras UX, problemas de mantenibilidad y complejidad. Genera un score por dimensión, propone una meta de la próxima iteración y guarda el reporte para comparar con corridas futuras. Usar para auditar un módulo existente antes de seguir agregando features.
argument-hint: "<nombre-modulo>"
---

# Evaluar Módulo — Auditoría integral con meta iterativa

Al ejecutar esta skill, hacer una evaluación completa del módulo indicado en 6 dimensiones, generar scores, proponer una meta específica para la próxima iteración, y guardar el reporte en `.claude/skills/evaluar-modulo/reportes/<modulo>-YYYY-MM-DD.md` para poder comparar progreso en el tiempo.

---

## Dimensiones de evaluación

| # | Dimensión | Qué mide | Peso |
|---|-----------|----------|------|
| 1 | **UX / Accesibilidad** | Usabilidad, jerarquía visual, touch targets, contraste, responsive | 20% |
| 2 | **Complejidad & Tamaño** | Líneas por archivo, funciones largas, anidamiento profundo, props drilling | 15% |
| 3 | **Código muerto / duplicación** | Variables sin uso, imports huérfanos, código comentado, lógica duplicada | 15% |
| 4 | **Performance** | Re-renders, `useMemo` mal usado, listas sin virtualizar, queries excesivas | 15% |
| 5 | **Mantenibilidad** | Tipado, nombres claros, magic numbers, helpers in-place, comentarios desactualizados | 15% |
| 6 | **Simplificación / Sobrediseño** | Abstracciones prematuras, flags innecesarios, wrappers sin valor, fallbacks nunca activados | 20% |

Score por dimensión: **0-100** (100 = excelente, 0 = crítico).
Score global: promedio ponderado.

---

## Paso 1: Identificar archivos del módulo

```bash
# Buscar por nombre (pages, components, services, hooks)
find apps/pwa/src -type f \( -name "*<Modulo>*" -o -name "*<modulo>*" \) | grep -v "__tests__\|\.test\." | sort

# Listar tamaños
wc -l $(find apps/pwa/src -type f -name "*<Modulo>*" ! -name "*.test.*")
```

Identificar:
- Página principal
- Servicios (`apps/pwa/src/services/<modulo>/`)
- Componentes propios (`apps/pwa/src/components/<modulo>/`)
- Hooks relacionados
- Tipos

---

## Paso 2: Recolectar métricas automáticas

Ejecutar en paralelo (un bloque multi-tool):

### 2.1 Tamaño y complejidad
```bash
wc -l <archivos-del-modulo>
# Destacar archivos > 500 líneas (code smell)

grep -c "useState\|useEffect\|useMemo\|useCallback\|useRef" <pagina-principal>
# Muchos hooks = probable candidato a extraer
```

### 2.2 Código muerto
```bash
cd apps/pwa && npx tsc --noEmit --skipLibCheck 2>&1 | grep "TS6133\|TS6196\|TS6205" | grep "<modulo>"
```

### 2.3 Duplicación
```bash
grep -n "TODO\|FIXME\|XXX\|HACK" <archivos>
grep -n "eslint-disable\|@ts-ignore\|@ts-expect-error" <archivos>
```

### 2.4 Magic numbers / strings hardcoded
```bash
grep -nE "^\s+(const|let|var).*=\s*[0-9]{3,}" <archivos> | head -20
```

### 2.5 Cantidad de props drilling
```bash
grep -n "interface Props" <componentes> | head
# Componentes con >10 props son sospechosos
```

---

## Paso 3: Lectura guiada + análisis cualitativo

Leer los 3-5 archivos más grandes del módulo completamente. Para cada uno, buscar:

### Código muerto / dead code
- Funciones declaradas pero nunca llamadas (usar skill `audit-unused-locals`)
- Imports huérfanos
- Bloques `if (false)` o `{false && ...}` en JSX
- Código comentado
- Props recibidas pero nunca usadas
- Estados que nunca cambian (podrían ser constantes)

### Sobrediseño / abstracciones innecesarias
- Componentes wrapper que solo delegan
- Hooks custom que encapsulan 1 línea de lógica
- `useMemo`/`useCallback` sobre valores primitivos
- Feature flags sin uso real
- Fallbacks de datos que nunca ocurren en producción
- Config objects con 1 sola opción

### Complejidad
- Funciones > 80 líneas → candidatas a split
- Anidamiento > 4 niveles → mala legibilidad
- Componentes con > 15 props → considerar composition o context
- Ternarios anidados
- Ifs que podrían ser early returns

### Performance smells
- `.map(...).filter(...).sort(...)` sin `useMemo`
- Objetos/arrays inline en props que disparan re-render
- `useEffect` con deps mal definidos
- Listas grandes (>100 items) sin virtualización
- Queries Firestore en loops o dentro de renders

### UX gaps (checklist corto)
- Botones sin `min-h-[44px]` visible
- Textos `text-[10px]` o `text-[11px]` en área de lectura
- Sin estado vacío para listas
- Sin estado de carga para queries
- Sin manejo de errores visible al usuario
- Orden de tabulación roto
- Labels sin `htmlFor`

### Mantenibilidad
- Tipos `any` explícitos o implícitos
- Nombres crípticos (`x`, `tmp`, `data2`)
- Comentarios que contradicen el código
- Dependencias circulares
- Strings duplicados que deberían ser constantes

---

## Paso 4: Generar scores por dimensión

Para cada dimensión, asignar score 0-100 basándose en hallazgos:

| Score | Criterio |
|-------|----------|
| 90-100 | Excelente — 0-2 hallazgos menores, nada accionable urgente |
| 75-89 | Bueno — 3-5 hallazgos, mejoras graduales |
| 60-74 | Aceptable — 6-10 hallazgos, requiere atención |
| 40-59 | Deficiente — >10 hallazgos o 1 crítico, meta principal |
| 0-39 | Crítico — código a refactorizar urgente |

---

## Paso 5: Proponer una meta iterativa

Basándose en la dimensión con el **score más bajo**, proponer UNA meta concreta para la próxima iteración del módulo. La meta debe:

- Ser específica (no "mejorar el código")
- Ser medible (reducir líneas X%, eliminar Y funciones huérfanas, subir contraste de Z elementos)
- Ser alcanzable en 1-2 sesiones
- Apuntar al score más bajo
- Tener criterio de éxito claro

### Formato de la meta:

> **Meta iteración N+1 — <Módulo>**
> **Dimensión objetivo:** <dimensión con score más bajo>
> **Score actual:** XX/100 → **objetivo:** YY/100
> **Acción principal:** <qué hacer concretamente>
> **Criterio de éxito:** <cómo se mide que se cumplió>

---

## Paso 6: Guardar reporte

Crear archivo en `.claude/skills/evaluar-modulo/reportes/<modulo>-YYYY-MM-DD.md`:

```markdown
# Evaluación <Módulo> — YYYY-MM-DD

## Scorecard
| Dimensión | Score | Cambio vs anterior |
|-----------|------:|-------------------:|
| UX / Accesibilidad | XX/100 | +/- X |
| Complejidad & Tamaño | XX/100 | +/- X |
| Código muerto / duplicación | XX/100 | +/- X |
| Performance | XX/100 | +/- X |
| Mantenibilidad | XX/100 | +/- X |
| Simplificación / Sobrediseño | XX/100 | +/- X |
| **GLOBAL (ponderado)** | **XX/100** | **+/- X** |

## Archivos evaluados
- `apps/pwa/src/pages/<Modulo>Page.tsx` — XXX líneas
- ...

## Hallazgos por dimensión

### 1. UX / Accesibilidad — XX/100
- [ ] P0: ...
- [ ] P1: ...

### 2. Complejidad & Tamaño — XX/100
- [ ] ...

(...etc para las 6 dimensiones)

## Meta iteración siguiente
**Dimensión objetivo:** ...
**Score actual → objetivo:** ...
**Acción principal:** ...
**Criterio de éxito:** ...

## Notas libres
...
```

---

## Paso 7: Comparar con reporte anterior (si existe)

```bash
ls .claude/skills/evaluar-modulo/reportes/<modulo>-*.md 2>/dev/null | tail -2
```

Si hay reporte previo:
- Calcular delta de cada dimensión
- Destacar mejoras (↑) y regresiones (↓)
- Verificar si la meta propuesta en el reporte anterior se cumplió
- Documentar qué aprendimos del ciclo

---

## Paso 8: Presentar al usuario

Mostrar en chat (conciso):

1. **Scorecard** (tabla de 6 dimensiones + global)
2. **Top 3 hallazgos críticos** (los más accionables)
3. **Meta propuesta** para la próxima iteración
4. **Pregunta final:** ¿Ejecutamos la meta ahora o la agendamos en CLAUDE.md?

---

## Reglas de estilo del reporte

- Siempre en español
- Código entre backticks, archivos como `path/al/archivo.tsx:123`
- Hallazgos con severidad clara: P0 (crítico), P1 (importante), P2 (nice-to-have)
- No inventar problemas — solo lo que realmente está en el código
- No proponer refactors masivos como meta — meta = un foco, iterativo
- Reportes son snapshots: no editarlos después de crearlos (crear uno nuevo con fecha nueva)
