---
name: baul
description: Mostrar todas las skills disponibles (proyecto + personales). Usar cuando quieras ver el catalogo completo o no recuerdes el nombre de alguna skill.
argument-hint: ""
---

# Baul de Skills

Al ejecutar, mostrar al usuario TODAS las skills disponibles leyendo los SKILL.md de:
1. Las skills del proyecto actual: buscar en `.claude/skills/*/SKILL.md`
2. Las skills personales (si existen): buscar en `C:/Users/pc hp/.claude/skills/*/SKILL.md`

## Formato de salida

Leer cada SKILL.md, extraer `name` y `description` del frontmatter, y mostrar:

```
🧰 SKILLS DISPONIBLES

📂 Proyecto actual:
  /nombre-skill    — descripcion corta
  /nombre-skill    — descripcion corta

👤 Personales (todos los proyectos):
  /nombre-skill    — descripcion corta
  /nombre-skill    — descripcion corta

Total: X skills
Tip: escribe /<nombre> para ejecutar
```

Si no hay skills personales, omitir esa seccion.
