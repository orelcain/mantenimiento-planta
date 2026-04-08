# Sidebar Editor — Pendiente de implementar

## Qué se necesita
Admin debe poder editar el sidebar: agregar, mover y reordenar módulos entre las categorías colapsables.

## Estado actual del sidebar
- Archivo: `apps/pwa/src/components/layout/MainLayout.tsx`
- Estructura: array `navGroups: NavGroup[]` con 6 categorías (Principal, Planificación, Equipamiento, Herramientas, Aprendizaje, Administración)
- Cada grupo tiene `{ id, label, items: NavItem[], defaultOpen?, adminOnly? }`
- Estado de colapso en `localStorage('sidebar-groups')`
- Se renderiza en 2 lugares: desktop sidebar (~línea 370) y mobile slide-over (~línea 550)

## Implementación sugerida

### 1. Firestore: colección `app-config`
- Doc `sidebar-layout` con la configuración de grupos y sus items
- Al cargar MainLayout, si existe en Firestore, usar esa config; si no, usar el default hardcoded
- Solo admin puede escribir

### 2. Modo edición del sidebar
- Botón "Editar sidebar" visible solo para admin (junto al botón de colapsar sidebar)
- Al activar: cada item muestra handle de drag, cada grupo muestra zona de drop
- Drag & drop con `@dnd-kit/core` (ya puede estar en el proyecto) o HTML5 drag nativo
- Al soltar: actualizar orden en state y guardar en Firestore

### 3. Funcionalidades del editor
- Reordenar items dentro de un grupo (drag up/down)
- Mover items entre grupos (drag to another group)
- Renombrar grupos (click en el label)
- Crear nuevo grupo
- Ocultar/mostrar items (toggle visibility, no delete)
- Reset a default

### 4. Persistencia
- Guardar en Firestore `app-config/sidebar-layout`
- Todos los usuarios ven la misma configuración
- El admin que editó se guarda en audit (quién, cuándo)

## Archivos a modificar
- `apps/pwa/src/components/layout/MainLayout.tsx` — lógica principal
- `apps/pwa/src/services/appConfig.ts` — nuevo servicio para leer/escribir config del sidebar
- Posiblemente un componente nuevo `SidebarEditor.tsx`

## Dependencias
- Verificar si `@dnd-kit` ya está instalado, si no, considerar HTML5 drag API
