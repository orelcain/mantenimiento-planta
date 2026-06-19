# AGENTS.md — Instrucciones para agentes (Codex, Claude, locales)

App de mantenimiento de planta (PWA React + Vite + Firebase). **Esta es la app VIVA y en
producción.** Repo: `github.com/orelcain/mantenimiento-planta` (rama `main`).

## Leer ANTES de trabajar

1. `.ai/MEMORY.md` — estado canónico del proyecto (modelo de datos, arquitectura, dónde está cada cosa).
2. `.ai/WORKLOG.md` — qué hicieron los otros agentes (lee la cola).
3. `.ai/TASKS.md` — backlog y tablero de reclamo. **Reclama tu tarea ahí (estado `EN CURSO — <agente>`) antes de tocar código.**
4. Si corres localmente y tienes acceso a OneDrive, lee también la "memoria empresa":
   `C:\Users\orelc\OneDrive\ANTARFOOD\AI_PROJECT_MEMORY.md`, `AI_TEAM_PROTOCOL.md`, `AI_PROJECT_REGISTRY.md`.
   (Codex cloud NO ve OneDrive → para cloud, la fuente es esta carpeta `.ai/`.)

## Reglas de oro (no romper producción)

- `main` **auto-despliega a producción** (push a `main` → GitHub Actions → Firebase Hosting). **Nunca** commitear directo a `main`. `main` siempre debe quedar desplegable.
- 1 tarea = 1 rama (`<agente>/<tarea-corta>`). `git pull` antes de empezar. Cambios chicos. No tocar archivos fuera del alcance de tu tarea.
- Antes de PR (definición de hecho): `npx tsc --noEmit` + `npx eslint <archivos>` limpios; si es UI, verificar en preview; actualizar `.ai/WORKLOG.md` y `.ai/MEMORY.md` (si hubo decisión).
- Flujo ESTRICTO con revisión cruzada: PR → revisa OTRO agente → el merge a `main` lo aprueba el humano.
- Commits con autor en el pie del mensaje: `Agent: codex` | `Agent: claude` | `Agent: local-qwen`.
- NO tocar `firestore.rules` / `functions/` / `firebase.json` sin pedido explícito (proyecto Firebase compartido).

## Notas del proyecto

- Monorepo (Turbo). PWA en `apps/pwa/`. Backend `functions/`. Scripts admin en `scripts/` (usan `serviceAccountKey.json` en la raíz, fuera de git).
- Secretos (`apps/pwa/.env.local`, `serviceAccountKey.json`) ya están en disco, NO en git.
- Modelo de repuestos: maestro único `repuestos` por código SAP (~7.657 docs). Detalle en `.ai/MEMORY.md`.
