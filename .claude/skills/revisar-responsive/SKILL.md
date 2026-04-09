---
name: revisar-responsive
description: Verificar un modulo o pagina en los 3 breakpoints (desktop, tablet, movil) con screenshots automaticos. Usar cuando se hacen cambios de layout o CSS y se necesita validar que todo se ve bien en todas las pantallas.
argument-hint: "<ruta-pagina>"
---

# Revisar Responsive — Verificacion en 3 breakpoints

Analizar el layout de una pagina en mobile (375px), tablet (768px) y desktop (1280px+).

**IMPORTANTE**: Las herramientas de preview (`preview_start`, `preview_screenshot`) NO estan disponibles en Claude Code web. Esta skill tiene dos modos:

---

## Modo A — Con screenshot del usuario (PREFERIDO)

Si el usuario proporciona un screenshot:

1. **Analizar el screenshot** identificando:
   - Cuanto espacio ocupa cada seccion (% visual)
   - Elementos que se ven cortados o fuera de pantalla
   - Espacios vacios excesivos
   - Texto ilegible o demasiado pequeno

2. **Reportar lo observado** + comparar con el codigo para detectar discrepancias

3. **Pedir screenshots adicionales** si se necesitan otros breakpoints:
   > "Puedes abrir en el celular y mandarme un screenshot?"

---

## Modo B — Analisis de codigo (cuando no hay screenshot)

Leer el codigo del componente y analizar para cada breakpoint:

### Checklist mobile (375px)

```
LAYOUT:
[ ] grid-cols-N → colapsa a grid-cols-1 con sm: o md:?
[ ] flex-row → colapsa a flex-col en mobile?
[ ] max-w fijo que no cabe en 375px?
[ ] padding suficiente para no tocar bordes (minimo px-4)?

TEXTO:
[ ] Hay text-[10px] o text-[11px]? → ilegible en mobile
[ ] line-clamp-2 corta info critica en el texto mas corto?
[ ] Titulos text-3xl o mayores pueden sobresalir?

INTERACCION:
[ ] Todos los botones tienen min-height 44px?
[ ] Links/botones estan juntos (tap accidental)?
[ ] Hay hover-only que no funciona en touch?

OVERFLOW:
[ ] Elementos con width fijo (w-64, w-96) sin max-w?
[ ] Tablas sin overflow-x-auto?
[ ] Imagenes sin max-w-full?
[ ] Texto largo sin break-words o truncate?
```

### Checklist tablet (768px)

```
[ ] Grid de 1 col en mobile pasa a 2 col aqui? (sm:grid-cols-2)
[ ] Sidebar aparece o sigue oculto?
[ ] Padding aumenta? (sm:px-6)
[ ] Imagenes tienen buen tamaño (no gigantes ni miniatura)?
[ ] El header se adapta (elementos que estaban hidden sm:inline aparecen)?
```

### Checklist desktop (1280px+)

```
[ ] max-w limita el contenido para no quedar muy ancho?
[ ] Grid llega a 2-3 columnas?
[ ] No hay espacio vacio excesivo abajo? (usar min-h-dvh flex flex-col)
[ ] Sidebar visible y con navegacion completa?
[ ] Los modales/dropdowns no quedan cortados?
```

---

## Paso 3: Reporte

```
## Responsive Check — <Pagina> — <fecha>

| Breakpoint | Estado | Problema | Fix |
|-----------|--------|----------|-----|
| Mobile 375px | ✅/⚠️/❌ | ... | ... |
| Tablet 768px | ✅/⚠️/❌ | ... | ... |
| Desktop 1280px | ✅/⚠️/❌ | ... | ... |

Problemas criticos (P0): X
Problemas menores (P1): X
```

---

## Paso 4: Fix e iteracion

1. Implementar los fixes
2. Pedirle al usuario que recargue y mande screenshot actualizado
3. Repetir si hay problemas nuevos

---

## Patrones de fix responsive mas comunes en este proyecto

| Problema | Clase problematica | Fix |
|----------|--------------------|-----|
| No colapsa a 1 col | `grid-cols-2` sin `sm:` | `grid-cols-1 sm:grid-cols-2` |
| Espacio vacio desktop | `min-h-screen` | `min-h-dvh flex flex-col` + `flex-1` en main |
| Overflow horizontal | width fijo | `max-w-full` o cambiar a `w-full` |
| Texto cortado | `truncate` agresivo | `break-words` o `line-clamp-2` |
| Boton chico en mobile | `px-2 py-1` | `px-4 py-3 min-h-[44px]` |
| Label oculto mobile | `hidden sm:inline` | mostrar siempre o usar icono+label |
| Padding insuficiente | `px-2` en mobile | `px-4` minimo |
| iOS 100vh bug | `min-h-screen` | `min-h-dvh` |
