---
name: matar-pendientes
description: Revisar el CLAUDE.md, clasificar pendientes por esfuerzo/impacto y ejecutarlos en orden. Usar al inicio de sesion para tener un plan de ataque claro antes de empezar a codear.
argument-hint: ""
---

# Matar Pendientes — Plan de Ataque

Al ejecutar esta skill, leer el CLAUDE.md, auditar el estado de los deploys, analizar los pendientes y proponer un plan de ataque ordenado para la sesion.

---

## Paso 0a: Sync con GitHub (OBLIGATORIO si hubo trabajo en otro PC o claude.ai)

```bash
cd "D:/a/APP leventamiento de insidencias en planta"
git pull origin main
# Ver qué llegó:
git log --oneline ORIG_HEAD..HEAD 2>/dev/null || git log --oneline -5
```

Mostrar resumen de commits nuevos y archivos clave cambiados.

---

## Paso 0b: Health check de CI/CD (OBLIGATORIO)

**Antes de cualquier otra cosa**, verificar que los 4 workflows esten verdes. Esta skill fue agregada despues de un incidente de 18 dias con `deploy-functions.yml` bloqueado sin que nadie lo notara.

```bash
cd "D:/a/APP leventamiento de insidencias en planta"
gh run list --limit 20
```

Agrupar por `workflowName` y verificar que el ultimo run de cada workflow sea `success`. Si alguno tiene fallas consecutivas, **documentarlo como item 0 del plan de ataque** (antes de cualquier feature).

**TIP — Si se eligen sync + deploys + pendientes juntos**: ejecutar los 3 en paralelo (multi-tool en una sola respuesta):
- `git pull origin main`
- `gh run list --limit 20`
- `grep -A 200 'Pendientes priorizados' CLAUDE.md | head -80`

---

## Paso 1: Leer el estado actual

```bash
# Leer CLAUDE.md para ver pendientes
grep -A 200 "Pendientes priorizados" CLAUDE.md | head -80

# Ver commits recientes para entender qué se hizo ultimo
git log --oneline -10
```

---

## Paso 2: Clasificar pendientes

Para cada pendiente, evaluar:

| Criterio | Descripcion |
|----------|-------------|
| **Requiere CLI externo** | Firebase CLI, gh CLI, etc. — NO hacible desde Claude Code web |
| **Solo frontend** | Cambios en React/CSS/TS — Hacible directo |
| **Firestore rules** | Editar `firestore.rules` — Hacible, pero requiere deploy manual |
| **Esfuerzo** | Alto (>2h), Medio (30min-2h), Bajo (<30min) |
| **Impacto** | Critico (rompe algo), Alto (mejora notoria), Bajo (nice-to-have) |

### Matriz de prioridad:

```
IMPACTO ALTO + ESFUERZO BAJO  → Hacer primero (quick wins)
IMPACTO ALTO + ESFUERZO ALTO  → Planificar bien, hacer segundo
IMPACTO BAJO + ESFUERZO BAJO  → Llenar tiempos muertos
IMPACTO BAJO + ESFUERZO ALTO  → Dejar para otra sesion
REQUIERE CLI EXTERNO           → Documentar para hacer manualmente
```

---

## Paso 3: Proponer plan

Presentar al usuario:

```
📋 PLAN DE ATAQUE — Sesion <fecha>

⚡ Quick wins (< 30 min cada uno):
  1. [pendiente] — motivo
  2. [pendiente] — motivo

🔨 Trabajos medianos (30min - 2h):
  3. [pendiente] — motivo

🏔️ Trabajo pesado (> 2h, solo si hay tiempo):
  4. [pendiente] — motivo

⏸️ Requiere accion manual externa:
  - [pendiente] — necesita: Firebase CLI / acceso servidor / etc.

Tiempo estimado total de lo hacible: ~X horas
```

Preguntar: "¿Empezamos por el plan propuesto o quieres cambiar el orden?"

---

## Paso 4: Ejecutar

Ir atacando uno a uno:
- Marcar como completado en el CLAUDE.md al terminar cada uno
- Si surge algo bloqueante, documentarlo y pasar al siguiente
- Si aparecen pendientes nuevos durante la sesion, agregarlos al CLAUDE.md

---

## Paso 5: Al finalizar

Siempre terminar la sesion con `/cerrar-sesion` para:
- Actualizar CLAUDE.md con el estado real
- Crear memoria de sesion
- Sugerir nuevas skills detectadas

---

## Reglas para clasificar pendientes de este proyecto

**Hacible desde Claude Code:**
- Cambios en `apps/pwa/src/` (React, TS, CSS)
- Cambios en `firestore.rules` (se edita aqui, se deploya manualmente)
- Cambios en `apps/pwa/public/` (assets estaticos)
- Bump de version + merge a main

**NO hacible desde Claude Code (requiere maquina local):**
- `firebase deploy --only functions` (requiere Firebase CLI autenticado)
- `firebase deploy --only firestore:rules` (requiere Firebase CLI)
- `firebase appcheck:enable` (requiere Firebase CLI)
- Cualquier cosa que requiera credenciales de servicio locales
