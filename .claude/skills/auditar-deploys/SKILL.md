---
name: auditar-deploys
description: Auditar el estado de salud de TODOS los workflows de CI/CD del repo. Detecta workflows bloqueados (fallas consecutivas), degradados (1 falla reciente) y sanos. Usar al inicio de sesion como parte de matar-pendientes, o cuando sospechas que algo no se esta deployando. Este skill existe porque en 2026-04 tuvimos 18 dias con deploy-functions bloqueado sin detectarlo.
argument-hint: ""
---

# Auditar Deploys — Health Check CI/CD

Revisar el estado real de TODOS los workflows del repo para detectar deploys bloqueados.

**Contexto**: Este skill existe porque el workflow `deploy-functions.yml` estuvo 18 dias bloqueado (2026-03-22 → 2026-04-09) por un issue de IAM sin que nadie lo notara — porque `matar-pendientes` y `fix-ci` solo miraban el ultimo commit, no el historial completo de workflows.

---

## Paso 1: Listar todos los workflows del repo

```bash
# Workflows definidos en .github/workflows/
ls .github/workflows/*.yml
```

Anotar cuantos workflows existen. Para este repo son tipicamente 4:
- `deploy.yml` → Deploy PWA to GitHub Pages
- `deploy-firestore-rules.yml` → Deploy Firestore Rules & Indexes
- `deploy-functions.yml` → Deploy Firebase Functions
- `daily-sync.yml` → Daily Sync (versions)

---

## Paso 2: Obtener ultimos runs de cada workflow

```bash
# Obtener los ultimos 30 runs con su workflow, status, conclusion y fecha
gh run list --limit 30 --json workflowName,status,conclusion,createdAt,displayTitle,databaseId
```

Agrupa mentalmente por `workflowName` y analiza:

- **Ultimo run de cada workflow** → su `conclusion` (success / failure / cancelled)
- **Fallas consecutivas** → cuenta cuantas fallas seguidas tiene antes de encontrar un success
- **Fecha del ultimo success** → si hace mas de 7 dias, es sospechoso

---

## Paso 3: Clasificar cada workflow

| Estado | Criterio | Accion |
|--------|----------|--------|
| 🟢 **Sano** | Ultimo run = success | Nada que hacer |
| 🟡 **Degradado** | Ultimo run = failure, pero el anterior fue success | Investigar por si es flake o regresion |
| 🔴 **Bloqueado** | 2+ fallas consecutivas sin exito intermedio | **CRITICO** — investigar YA |
| ⚫ **Inactivo** | Sin runs en > 14 dias (puede ser por path filter, no siempre es malo) | Verificar si deberia haber corrido |

---

## Paso 4: Para cada workflow 🔴 bloqueado

```bash
# Ver el log del ultimo run fallido
gh run view <databaseId> --log-failed 2>&1 | grep -E "error|Error|HTTP|FAIL|✖|permission|denied" | head -30
```

Extraer:
- Mensaje de error principal
- Si es tematico de **permisos/IAM** → documentar como pendiente externo (requiere Firebase Console / gcloud)
- Si es tematico de **lint/tsc/build** → se puede arreglar desde Claude Code
- Si es tematico de **secrets/tokens** → requiere accion manual del usuario
- Si es **flake** (timeout, network) → sugerir re-run

---

## Paso 5: Generar reporte

Presentar al usuario con este formato exacto:

```
🏥 HEALTH CHECK CI/CD — Sesion <fecha>

🟢 Sanos:
  ✓ Deploy PWA to GitHub Pages (ultimo: success, hace Xh)
  ✓ Deploy Firestore Rules & Indexes (ultimo: success, hace Xh)

🟡 Degradados:
  ⚠ <workflow> — 1 falla reciente (<fecha>). Causa: <resumen>

🔴 BLOQUEADOS (accion requerida):
  ✗ <workflow> — N fallas consecutivas desde <fecha ultimo success>
    Error: <resumen 1 linea>
    Fix: <hacible aqui | requiere accion externa>

⚫ Inactivos (sin runs recientes):
  - <workflow> (path filter, revisar si es esperado)

--- RESUMEN ---
Dias desde ultimo deploy exitoso por workflow: ...
Pendientes externos detectados: ...
```

---

## Paso 6: Si hay bloqueados, ofrecer accion

Preguntar al usuario:

> "Encontre N workflow(s) bloqueados. ¿Quieres que:
> 1. Intente arreglarlos ahora (si son hacibles desde Claude Code)
> 2. Los documente como pendientes y sigamos con el plan original
> 3. Veamos los logs completos para decidir"

---

## Notas

- Este skill NO intenta arreglar nada por si solo. Solo reporta.
- Integracion recomendada: ejecutar como Paso 0 de `matar-pendientes` al inicio de cada sesion.
- El skill `fix-ci` se usa cuando ya sabes que hay un fallo y quieres repararlo.
- Si el ultimo run no fue para HEAD actual, puede ser por path filter — verificar con `gh run list --branch main`.

---

## Ejemplo de ejecucion correcta

Usuario: "/auditar-deploys"

Claude:
1. Lee .github/workflows/ (4 archivos)
2. Ejecuta `gh run list --limit 30 --json ...`
3. Agrupa por workflowName
4. Para cada uno identifica estado (verde/amarillo/rojo)
5. Para los rojos, extrae errores con `gh run view --log-failed`
6. Reporta con el formato del Paso 5
7. Si hay rojos, ofrece acciones del Paso 6
