---
name: auditar-ux-modulo
description: Realizar una auditoria UX profesional de un modulo especifico usando un agente experto en diseño. Genera lista priorizada de mejoras con cambios concretos de CSS/layout. Usar cuando un modulo necesita revision de usabilidad.
argument-hint: "<nombre-modulo> [screenshot-path]"
---

# Auditar UX de Modulo — Revision con agente experto

Al ejecutar, realizar una auditoria UX completa del modulo indicado: leer el codigo, analizar visualmente (con screenshot si hay), y generar mejoras priorizadas e implementables.

---

## Paso 1: Leer el codigo del modulo

Antes de lanzar el agente, leer los archivos relevantes:

```bash
# Encontrar el archivo de la pagina
find apps/pwa/src/pages -name "*<Modulo>*"

# Leer la pagina principal
cat apps/pwa/src/pages/<ModuloPage>.tsx

# Leer componentes usados (si aplica)
find apps/pwa/src/components -name "*<modulo>*"
```

---

## Paso 2: Lanzar agente UX experto

Lanzar con Agent (general-purpose) con este prompt COMPLETO — rellenar [PLACEHOLDERS]:

```
Eres un experto en UX/UI para PWAs industriales. Analiza el modulo "[NOMBRE]" de una app
para tecnicos de planta pesquera. Sin rodeos — necesito problemas reales y fixes concretos.

## Contexto de uso real
- Ambiente: planta de procesamiento de pescado (humedo, resbaladizo, frio)
- Usuarios: tecnicos mecanicos consultando info MIENTRAS trabajan
- Dispositivo: celular personal (gama media-baja), a veces con guantes de nitrilo
- Condiciones de pantalla: mojada, sucia, luz fluorescente 4000K o exterior directo
- Velocidad: el tecnico tiene 10-30 segundos para encontrar lo que necesita

## Codigo del modulo
[PEGAR EL CODIGO COMPLETO LEIDO EN PASO 1]

## Screenshot actual (si hay)
[DESCRIBIR O ADJUNTAR el screenshot — posicion de elementos, que ocupa que espacio, etc.]

## CHECKLIST TECNICO — Verificar cada punto

### Targets tactiles
- [ ] Todos los botones/links tienen min-height 44px (WCAG 2.5.5)?
- [ ] Los elementos interactivos tienen padding suficiente para guantes?
- [ ] Hay elementos tipo <a> o <span onClick> con target menor a 44px?

### Jerarquia visual (regla de 2 segundos)
- [ ] El elemento mas importante es visualmente dominante?
- [ ] El orden visual coincide con el orden de uso del tecnico?
- [ ] Hay informacion critica enterrada abajo o en color tenue?

### Contraste bajo luz industrial
- [ ] Textos secundarios > #888 en fondo oscuro? (minimo #7a8a9a en #0a1628)
- [ ] Textos de 10-11px son ilegibles en planta — hay alguno?
- [ ] Los colores de estado (error, warning, ok) son distinguibles con pantalla sucia?

### Responsive mobile (375px)
- [ ] ¿Grid de 2 columnas colapsa a 1 en mobile?
- [ ] ¿Hay overflow horizontal (scroll inesperado)?
- [ ] ¿Los textos truncados (truncate, line-clamp) cortan info critica?
- [ ] ¿Los elementos flotantes/fixed tienen z-index correcto?

### Navegacion y orientacion
- [ ] El usuario sabe DONDE esta dentro de la app? (breadcrumb o titulo claro)
- [ ] Hay boton de volver visible y grande?
- [ ] La ruta de regreso es obvia?

### Contenido y expectativas
- [ ] ¿Hay contenido "en desarrollo" que promete mas de lo que entrega?
- [ ] ¿Hay listas vacias sin estado vacio util?
- [ ] ¿Los textos de placeholder generan confusion?

### Rendimiento percibido
- [ ] ¿Hay imagenes que podrian preloadearse?
- [ ] ¿Hay skeleton loaders o el contenido "salta"?

## Tu output

Para cada problema encontrado:
- **[P0/P1/P2]** Archivo:linea — Descripcion del problema
- Fix exacto: clase CSS, prop React, o snippet de codigo

Formato tabla al final:
| # | Archivo | Linea | Problema | Fix | Impacto |
|---|---------|-------|----------|-----|---------|

Responde en español. Maximo 500 palabras. Solo problemas reales — no teoricos.
```

---

## Paso 3: Clasificar e implementar

### Clasificacion:
- **P0**: Rompe usabilidad basica — implementar AHORA
- **P1**: Mejora significativa — implementar en esta sesion
- **P2**: Nice-to-have — agregar a pendientes CLAUDE.md

### Implementacion:
1. Aplicar P0 primero (siempre)
2. Aplicar P1 si hay tiempo
3. Verificar con `npx tsc --noEmit` y `pnpm exec eslint . --max-warnings 10`
4. Commit por modulo: `fix(ux): <modulo> — <resumen de cambios>`

---

## Paso 4: Documentar P2

Agregar al CLAUDE.md en la seccion "Pendientes priorizados > P2 — Mejoras UX futuras":

```markdown
- [ ] **UX <Modulo>**: <descripcion del problema P2> — ver auditoria <fecha>
```

---

## Checklist rapido de problemas mas comunes en este proyecto

Antes de lanzar el agente, revisar estos rapidamente en el codigo:

| Check | Buscar en codigo | Fix tipico |
|-------|-----------------|------------|
| Boton sin padding | `<button` sin `py-` | agregar `py-3 min-h-[44px]` |
| Texto muy pequeno | `text-[10px]` o `text-[11px]` | subir a `text-xs` (12px) |
| Color muy tenue | `#2a` o `#3a` en hex | subir a `#6a` minimo |
| Hook condicional | `useEffect` despues de `if return` | mover antes del return |
| Early return sin hook | ver si hay hooks despues de guards | reordenar |
| line-clamp cortando info | `line-clamp-2` en descripcion larga | `line-clamp-3` en mobile |
| Grid impar | 5 items en grid-cols-2 | `sm:col-span-2` en ultimo |
| Espacio muerto | `min-h-screen` sin flex | `min-h-dvh flex flex-col` |
| Back button tiny | `<button>` solo con icon | agregar label + `py-3` |
| Banner WIP antes del contenido | banner de "en desarrollo" arriba | mover al fondo |
