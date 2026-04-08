---
name: revisar-responsive
description: Verificar un modulo o pagina en los 3 breakpoints (desktop, tablet, movil) con screenshots automaticos. Usar cuando se hacen cambios de layout o CSS y se necesita validar que todo se ve bien en todas las pantallas.
argument-hint: "<ruta-a-verificar>"
---

# Revisar Responsive — Verificacion en 3 breakpoints

Tomar screenshots automaticos de una pagina en desktop, tablet y movil para validar que el layout es correcto.

## Procedimiento

### 1. Asegurar que el preview server esta corriendo
```
preview_start con el server correspondiente
```

### 2. Navegar a la ruta indicada
```js
preview_eval: window.location.href = '<ruta>'
```

### 3. Capturar desktop (>900px)
```
preview_resize: preset "desktop"
preview_screenshot
```
Verificar: 2 columnas, sidebar visible, imagenes a la derecha

### 4. Capturar tablet (768px)
```
preview_resize: preset "tablet"
preview_screenshot
```
Verificar: 1 columna, texto legible, imagenes grandes

### 5. Capturar movil (375px)
```
preview_resize: preset "mobile"
preview_screenshot
```
Verificar: 1 columna, thumbnails, font legible, targets 44px+

### 6. Reportar
Listar problemas encontrados por breakpoint:
```
| Breakpoint | Estado | Problemas |
|-----------|--------|-----------|
| Desktop   | ✅/❌  | ...       |
| Tablet    | ✅/❌  | ...       |
| Movil     | ✅/❌  | ...       |
```

### 7. Fix
Si hay problemas, corregir y repetir desde paso 3.
