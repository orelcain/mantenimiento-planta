---
name: claude-orquestador
description: Ver uso de tokens por modelo (haiku/sonnet/opus) en la sesión actual. Ejecutar llamadas directas al modelo óptimo. Entender la lógica de clasificación automática.
argument-hint: "status | classify 'mensaje' | call 'mensaje' [--model haiku|sonnet|opus]"
---

# Orquestador de Modelos Claude

Sistema de optimización de tokens que clasifica cada tarea y sugiere
el modelo más eficiente: **haiku** (simple) → **sonnet** (código/medio) → **opus** (complejo).

---

## Cómo funciona automáticamente

En cada sesión:
1. **`SessionStart`** → resetea el contador de tokens (`session-tokens.json`)
2. **`UserPromptSubmit`** → classifica cada prompt y agrega un hint de modelo
3. Claude recibe el hint y puede usar `Agent(model='haiku'|'sonnet')` para sub-tareas

### Lógica de clasificación

| Modelo | Cuándo | Criterio |
|--------|--------|----------|
| 🐦 Haiku | consultas simples | `len < 100` ó keywords como "qué es", "define", "lista de", "gracias" |
| 🎵 Sonnet | código y análisis | keywords de código: bug, fix, función, hook, refactor, agrega, crea... |
| 🎭 Opus | arquitectura compleja | keywords como "arquitectura", "plan completo", "auditoría", `len > 350` |

### Ahorro de tokens estimado

| Comparación | Costo relativo |
|-------------|---------------|
| Haiku vs Opus (input) | Haiku es ~19x más barato |
| Haiku vs Opus (output) | Haiku es ~19x más barato |
| Sonnet vs Opus (input) | Sonnet es ~5x más barato |

---

## Comandos disponibles

### Ver tokens de la sesión actual

```bash
node .claude/scripts/claude-orchestrator.js status
```

Muestra algo como:
```
📊  USO DE TOKENS — SESIÓN ACTUAL
──────────────────────────────────────────────────
  🐦  haiku   │   5 llamadas │ in:   2,400 tok │ out:   1,800 tok │ ~$0.00001
  🎵  sonnet  │  12 llamadas │ in:  45,000 tok │ out:  18,000 tok │ ~$0.00041
  🎭  opus    │   3 llamadas │ in:  12,000 tok │ out:   8,000 tok │ ~$0.00078
──────────────────────────────────────────────────
  💰  Costo total estimado: ~$0.00120 USD
```

### Clasificar un mensaje sin ejecutarlo

```bash
node .claude/scripts/claude-orchestrator.js classify "arregla el bug en GraderTendenciaTab"
# → {"model":"sonnet","reason":"tarea de código / análisis técnico"}
```

### Llamar directamente a un modelo específico

```bash
# Auto-clasificación
node .claude/scripts/claude-orchestrator.js "qué es un hook de React"
# → llama haiku (simple)

node .claude/scripts/claude-orchestrator.js "analiza el módulo Grader y propón refactors"
# → llama sonnet (análisis técnico)

# Forzar modelo
node .claude/scripts/claude-orchestrator.js "resume esto" --model haiku
```

### Resetear el contador manualmente

```bash
node .claude/scripts/claude-orchestrator.js reset
```

---

## Pipeline — fases paralelas con sub-agentes

Cuando una tarea se puede dividir en fases independientes, usar el subcomando `pipeline` para ejecutarlas **todas en paralelo**, cada una con su modelo óptimo.

### Formato de fases (JSON)

```json
[
  { "id": "analisis",  "prompt": "analiza el componente GraderTendenciaTab y lista sus problemas",  "model": "sonnet" },
  { "id": "tests",     "prompt": "genera 3 casos de test para graderSegmenter.ts",                  "model": "sonnet" },
  { "id": "resumen",   "prompt": "resume en 2 líneas qué hace graderAnalytics.ts" }
]
```

El campo `model` es **opcional** — si se omite, el clasificador automático elige el mejor modelo.

### Ejecutar pipeline

```bash
# Desde archivo
node .claude/scripts/claude-orchestrator.js pipeline fases.json

# Inline (JSON directo)
node .claude/scripts/claude-orchestrator.js pipeline '[{"id":"a","prompt":"qué es useEffect"},{"id":"b","prompt":"implementa el hook useGraderData"}]'
```

### Output del pipeline

```json
{
  "summary": {
    "totalPhases": 3,
    "succeeded": 3,
    "failed": 0,
    "totalMs": 2800,
    "totalTokens": { "input": 4500, "output": 2100 },
    "totalCostUsd": 0.0000245
  },
  "phases": [
    { "id": "analisis", "model": "sonnet", "content": "...", "tokens": {...}, "latencyMs": 1200 },
    { "id": "tests",    "model": "sonnet", "content": "...", "tokens": {...}, "latencyMs": 1800 },
    { "id": "resumen",  "model": "haiku",  "content": "...", "tokens": {...}, "latencyMs": 900  }
  ]
}
```

### Cuándo usar el pipeline

| Situación | Fases sugeridas |
|-----------|----------------|
| Refactor de módulo | analizar código (sonnet) + generar tests (sonnet) + actualizar docs (haiku) |
| Agregar feature | diseño API (opus) + implementar componente (sonnet) + escribir tipos TS (haiku) |
| Debug | reproducir el error (sonnet) + proponer fix (sonnet) + escribir el commit message (haiku) |
| Code review | revisar lógica (opus) + revisar estilo/naming (haiku) + sugerir mejoras (sonnet) |

---

## Cómo aprovechar el orquestador como Claude

Cuando el hook `task-classifier.sh` agrega un hint como:
> 🎵 ORQUESTADOR (sonnet) — tarea de código / análisis técnico. Para sub-tareas delegables usa Agent(model='sonnet').

Actuar así:
1. Para la sub-tarea de código, usar el **Agent tool** con `model: "sonnet"` en lugar de procesarlo directamente con Opus
2. Reservar el contexto de Opus para el razonamiento de alto nivel (qué hacer, cómo estructurarlo)
3. Delegar la escritura/edición real de código a Sonnet via Agent

---

## Requisito: ANTHROPIC_API_KEY

Para que el orquestador haga llamadas directas a la API:
```bash
# En la sesión actual
export ANTHROPIC_API_KEY="sk-ant-..."

# O agregar al .env del proyecto (NUNCA commitear)
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local
```

El hook de clasificación (`task-classifier.sh`) NO necesita la API key — solo ejecuta la lógica de clasificación local.

---

## Archivos del sistema

| Archivo | Propósito |
|---------|-----------|
| `.claude/scripts/claude-orchestrator.js` | Script principal (clasificación, API calls, tracking) |
| `.claude/hooks/session-init.sh` | SessionStart → resetea tokens al iniciar sesión |
| `.claude/hooks/task-classifier.sh` | UserPromptSubmit → agrega hint de modelo |
| `.claude/session-tokens.json` | Archivo de tracking (generado, en .gitignore) |
