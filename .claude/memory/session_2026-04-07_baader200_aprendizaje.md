# Sesion 2026-04-07 — Baader 200 UX + Centro de Aprendizaje + Sidebar

## Resumen
14 commits. Rediseño completo de la vista movil/tablet del modulo Baader 200, creacion del Centro de Aprendizaje como modulo independiente, y reorganizacion del sidebar en categorias colapsables.

## Decisiones de arquitectura
- **Imagenes Baader 200 movil**: thumbnails sin crop arriba del contenido + lightbox con zoom al crop al tocar. Descartamos mostrar crop en thumbnail porque se veia muy pequeño.
- **Breakpoints**: desktop >900px (2 col), tablet 701-900px (1 col grande), movil <700px (thumbnails + lightbox)
- **Divisor draggable**: persiste en localStorage, clamp 25%-75%, oculto en tablet/movil
- **Centro de Aprendizaje**: ruta publica /aprendizaje, cards para sub-modulos, Baader 200 y HMI Knuro migrados a /aprendizaje/baader-200 y /aprendizaje/hmi-knuro. Rutas legacy siguen funcionando.
- **Sidebar**: 6 grupos colapsables, estado en localStorage, auto-expand del grupo con la ruta activa
- **CLAUDE.md**: creado como fuente de verdad del proyecto, se lee automaticamente cada sesion

## Problemas encontrados y resueltos
- `object-fit: fill` distorsionaba diagramas → cambiado a `contain`
- CSS `!important` en media queries anulaba estilos inline del crop → usar `:not(.edit-mode)` selector
- Imagenes con `loading="lazy"` no cargaban al cambiar seccion → src reset fuerza carga
- Navegacion relativa en pestañas salia del /learn → rutas absolutas
- Posiciones admin se perdian al bloquear → siempre aplicar layout guardado

## Skills sugeridas (no creadas)
- `revisar-responsive` — verificacion automatica en 3 breakpoints
- `deploy-produccion` — procedimiento de deploy a gh-pages
- `auditar-ux-modulo` — revision UX con agente experto
