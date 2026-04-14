---
name: cerrar-sesion
description: Ejecutar al finalizar una sesion de trabajo. Actualiza CLAUDE.md con cambios realizados, pendientes nuevos, y sugiere skills para mejorar eficiencia. Usar al final de cada sesion o cuando el usuario diga "cerremos sesion", "guardemos progreso", "actualiza el contexto".
argument-hint: ""
---

# Cerrar Sesion — Procedimiento de cierre

Al finalizar cada sesion de trabajo, ejecutar estos pasos para mantener la memoria del proyecto actualizada.

---

## Paso 1: Recopilar cambios de la sesion

Ejecutar:
```bash
cd "D:/a/APP leventamiento de insidencias en planta"
git log --oneline --since="8 hours ago"
```

Esto da la lista de commits de la sesion actual.

## Paso 2: Actualizar CLAUDE.md

Abrir `CLAUDE.md` en la raiz del proyecto y actualizar:

### 2.1 — Version
Si cambio la version en `apps/pwa/src/constants/version.ts`, actualizar la seccion "Version actual".

### 2.2 — Modulos
Si se agregaron nuevos modulos, rutas o paginas:
- Agregar a la tabla de "Modulos del sistema"
- Agregar rutas nuevas a "Rutas publicas" o "Rutas admin"

### 2.3 — Firestore
Si se crearon nuevas colecciones, agregarlas a "Firestore — Colecciones principales".

### 2.4 — Pendientes
- Mover tareas completadas de "Pendientes" a un comentario `<!-- completado -->` o eliminarlas
- Agregar nuevos pendientes que surgieron durante la sesion
- Repriorizar si cambio el orden de importancia

### 2.5 — Skills
Si se crearon nuevas skills en `.claude/skills/`, agregarlas a la tabla "Skills disponibles".

### 2.6 — Notas de sesion
Si hay contexto critico que la proxima sesion necesita saber (bugs conocidos, decisiones de arquitectura, etc.), agregarlo en "Notas para sesiones nuevas".

## Paso 3: Sugerir nuevas skills

Revisar el trabajo realizado en la sesion y pensar:

1. **Patrones repetidos**: ¿Hicimos algo mas de 2 veces que podria ser una skill?
   - Ejemplo: "Cada vez que creamos un modulo nuevo hacemos los mismos 4 pasos" → skill
   - Ejemplo: "Siempre que ajustamos el responsive seguimos el mismo flujo" → skill

2. **Procesos complejos**: ¿Hay procesos de muchos pasos que serian mas faciles con una guia?
   - Ejemplo: "Deploy a produccion requiere 6 pasos" → skill
   - Ejemplo: "Importar datos de Excel a Firestore" → skill

3. **Conocimiento de dominio**: ¿Aprendimos algo sobre el proyecto que vale la pena codificar?
   - Ejemplo: "Las maquinas Baader tienen parametros especificos" → skill de referencia
   - Ejemplo: "El sidebar tiene una estructura especifica para agregar items" → skill

### Formato de sugerencia:
```
💡 Skills sugeridas:
1. [nombre-skill] — Que haria — Por que seria util
2. [nombre-skill] — Que haria — Por que seria util
```

Preguntar al usuario si quiere crear alguna antes de cerrar.

## Paso 4: Crear memoria de sesion (opcional)

Si la sesion fue significativa (muchos cambios, decisiones de arquitectura), crear:
```
.claude/memory/session_<descripcion>.md
```

Con un resumen de:
- Que se hizo
- Decisiones tomadas y por que
- Contexto que podria ser util en el futuro

## Paso 4.5: Pre-push check (OBLIGATORIO antes del commit final)

Antes de pushear, verificar que no hay errores que vayan a romper el CI:

```bash
cd apps/pwa && pnpm exec tsc --noEmit && pnpm exec eslint . --max-warnings 10 && echo "✅ LISTO"
```

Si falla → corregir antes de continuar. Ver skill `/fix-ci` o `/audit-unused-locals`.
Si pasa → continuar con el commit.

## Paso 5: Commit final

```bash
git add CLAUDE.md .claude/memory/ .claude/skills/
git commit -m "docs: update project context after session — <resumen breve>"
git push origin main
```

## Paso 6: Resumen al usuario

Mostrar:
- Commits realizados en la sesion
- Pendientes actualizados
- Skills sugeridas
- Estado del proyecto

---

## Checklist rapido

- [ ] `git log` de la sesion revisado
- [ ] CLAUDE.md version actualizada
- [ ] CLAUDE.md modulos/rutas actualizados
- [ ] CLAUDE.md pendientes actualizados
- [ ] CLAUDE.md skills actualizadas
- [ ] Skills nuevas sugeridas al usuario
- [ ] Memoria de sesion creada (si aplica)
- [ ] Commit y push final
