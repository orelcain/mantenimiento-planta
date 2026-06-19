# .ai/ — Coordinación de agentes (local · Codex · Claude)

Esta carpeta es el **cerebro del proyecto** que git sincroniza entre todos los agentes
(incluido Codex cloud, que solo ve el repo). Cualquier agente que trabaje en este repo
DEBE leerla al empezar y actualizarla al terminar.

## Archivos

- `MEMORY.md` — estado canónico del proyecto: decisiones estables, modelo de datos, arquitectura, dónde está cada cosa.
- `WORKLOG.md` — bitácora append-only: qué hizo cada agente, cuándo, en qué archivos, resultado.
- `TASKS.md` — backlog + tablero de reclamo: cada tarea tiene estado y dueño para no pisarse.

> La estrategia general y el registro de TODOS los proyectos viven en la "memoria empresa"
> (fuera del repo): `C:\Users\orelc\OneDrive\ANTARFOOD\AI_PROJECT_MEMORY.md`,
> `AI_TEAM_PROTOCOL.md` y `AI_PROJECT_REGISTRY.md`. (Codex cloud no las ve; si trabajas en
> cloud, guíate por esta carpeta.)

## Ritual de inicio (cada agente, cada sesión)

1. Leer `MEMORY.md`, la cola de `WORKLOG.md` y `TASKS.md`.
2. Tomar/crear una tarea en `TASKS.md` y marcarla `EN CURSO — <agente>` (commitear ese cambio).
3. `git pull` y crear rama: `git switch -c <agente>/<tarea-corta>`.

## Al terminar

1. Verificar: `npx tsc --noEmit` + `npx eslint <archivos>` limpios (y preview si es UI).
2. Anotar en `WORKLOG.md` (1 entrada) y actualizar `MEMORY.md` si hubo una decisión estable.
3. Marcar la tarea `HECHO` o `EN REVISIÓN` en `TASKS.md`.
4. Abrir PR. NO commitear a `main`.

## Reglas de oro

- `main` AUTO-DESPLIEGA a producción (Firebase). **Nunca** commitear directo a `main`; `main` siempre debe quedar desplegable.
- 1 tarea = 1 rama. Cambios chicos. No tocar archivos fuera del alcance de tu tarea.
- Commits con autor: terminar el mensaje con `Agent: claude` | `Agent: codex` | `Agent: local-qwen`.
- Flujo ESTRICTO con revisión cruzada: PR + verificación verde + revisa OTRO agente + el merge a `main` lo aprueba el humano.
- Si no pudiste verificar algo, dilo explícito ("pendiente de verificar").
