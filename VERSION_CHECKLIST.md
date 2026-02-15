# ⚠️ CHECKLIST DE VERSIONES Y PUBLICACIÓN - OBLIGATORIO

Este es el estándar oficial para cerrar cada mejora del proyecto.

---

## ✅ Regla base

- Cada mejora terminada debe cerrar con: **versionado + validación + commit + push**.
- No se deja trabajo “listo” sin publicar en `main`.

---

## 📦 Archivos de versión obligatorios (PWA)

Para cada release `X.Y.Z`, mantener sincronizados:

1. `apps/pwa/package.json` → `"version": "X.Y.Z"`
2. `apps/pwa/src/constants/version.ts` → `APP_VERSION`, `VERSION_DATE`, `VERSION_NAME`
3. `apps/pwa/public/version.json` → `version`, `buildDate`, `buildTimestamp`, `features[0..n]`
4. `VERSION.md` → `Versión Actual: **vX.Y.Z**` + entrada del release
5. `CHANGELOG.md` → encabezado `## [X.Y.Z] - YYYY-MM-DD`

Validación automática oficial:

```bash
pnpm run release:pwa:verify
```

---

## 🔢 SemVer (cómo elegir versión)

- `PATCH` (`X.Y.Z+1`): fixes, ajustes UX menores, mejoras no disruptivas.
- `MINOR` (`X.Y+1.0`): features nuevas compatibles.
- `MAJOR` (`X+1.0.0`): cambios incompatibles / breaking.

---

## 🧪 Secuencia obligatoria de cierre

```bash
# 0) Sincronizar rama
git pull --rebase origin main

# 1) Implementar cambios

# 2) Bump de versión y docs de release (5 archivos obligatorios)

# 3) Validación técnica completa
pnpm run release:pwa:finalize

# 4) Publicar
git add -A
git commit -m "release: vX.Y.Z <resumen-corto>"
git push origin main
```

Si `push` falla por `non-fast-forward`, repetir:

```bash
git pull --rebase origin main
git push origin main
```

---

## 🧾 Convención de mensajes de commit

### Commit de release (obligatorio al cierre)

```text
release: vX.Y.Z <resumen-corto>
```

Ejemplo:

```text
release: v2.48.01 gantt ux clean + role-based edit
```

### Commit intermedio (opcional durante desarrollo)

```text
feat(gantt): <descripcion>
fix(gantt): <descripcion>
docs(versionado): <descripcion>
chore(ci): <descripcion>
```

---

## 🚫 No permitido

- Commit sin bump de versión cuando corresponde a una mejora cerrada.
- Push con archivos de versión desincronizados.
- Omitir `CHANGELOG.md` o `VERSION.md` en releases.

---

## 🎯 Resultado esperado

Cada mejora queda trazable con:

- versión visible en runtime,
- historial de cambios documentado,
- validación técnica ejecutada,
- publicación inmediata en `main`.
