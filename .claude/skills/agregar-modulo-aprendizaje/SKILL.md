---
name: agregar-modulo-aprendizaje
description: Agregar un nuevo sub-modulo de conocimiento al Centro de Aprendizaje (/aprendizaje). Usar cuando se necesite agregar contenido de capacitacion para tecnicos — manuales, simuladores, guias, troubleshooting, etc.
argument-hint: "<nombre-modulo> <tipo: manual|simulador|guia>"
---

# Agregar Modulo de Aprendizaje — Procedimiento

Agregar un nuevo sub-modulo al Centro de Aprendizaje para tecnicos de planta.

---

## Arquitectura existente

```
/aprendizaje                  → LearningHubPage.tsx (hub con cards)
/aprendizaje/baader-200       → Baader200LearningPublicPage.tsx (manual interactivo)
/aprendizaje/hmi-knuro        → HmiKnuroPublicPage.tsx (simulador parametros)
/aprendizaje/<nuevo-modulo>   → NuevoModuloPage.tsx (lo que vas a crear)
```

## Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `apps/pwa/src/pages/LearningHubPage.tsx` | Hub con array `modules[]` — agregar card aquí |
| `apps/pwa/src/App.tsx` | Rutas — agregar lazy import + Route aquí |
| `apps/pwa/src/components/layout/MainLayout.tsx` | Sidebar — ya tiene link a /aprendizaje |
| `apps/pwa/src/services/` | Servicios Firestore para datos del modulo |
| `apps/pwa/public/` | Archivos HTML embed si el modulo usa iframe |

---

## Paso 1: Decidir el tipo de modulo

### Tipo A — Manual interactivo (como Baader 200)
- Secciones con pasos, medidas, notas, imagenes
- Datos en Firestore
- Embed HTML con viewer/editor
- Referencia: `Baader200LearningPage.tsx` + `baader-200-learn-embed.html`

### Tipo B — Simulador (como HMI Knuro)
- Interfaz interactiva con parametros editables
- Presets guardados en Firestore
- Embed HTML con simulador
- Referencia: `HmiKnuroPage.tsx` + `hmi-knuro-embed.html`

### Tipo C — Guía simple (nuevo, mas ligero)
- Pagina React directa (sin iframe)
- Contenido estático o desde Firestore
- Markdown o componentes React
- Ideal para: protocolos de seguridad, guías rápidas, checklists

---

## Paso 2: Crear los archivos

### 2.1 Pagina publica (requerida)
```
apps/pwa/src/pages/<NombreModulo>PublicPage.tsx
```
- Sin autenticación
- Modo solo lectura
- Carga datos desde Firestore
- Patron: copiar estructura de `Baader200LearningPublicPage.tsx` o `HmiKnuroPublicPage.tsx`

### 2.2 Pagina admin (opcional)
```
apps/pwa/src/pages/<NombreModulo>Page.tsx
```
- Requiere rol admin (AdminRoute)
- Permite editar contenido
- Patron: copiar `Baader200LearningPage.tsx` o `HmiKnuroPage.tsx`

### 2.3 Servicio Firestore (si usa datos dinamicos)
```
apps/pwa/src/services/<nombreModulo>.ts
```
- Colecciones: `<modulo>-sections`, `<modulo>-config`, `<modulo>-history`
- Exportar funciones CRUD
- Patron: copiar `baader200Learning.ts` o `hmiKnuro.ts`

### 2.4 Embed HTML (si usa iframe)
```
apps/pwa/public/<nombre-modulo>-embed.html
```
- HTML autocontenido con CSS y JS inline
- Comunicacion con React via postMessage
- Patron: copiar `baader-200-learn-embed.html`

---

## Paso 3: Registrar el modulo

### 3.1 Agregar card en LearningHubPage.tsx
Abrir `apps/pwa/src/pages/LearningHubPage.tsx` y agregar al array `modules[]`:

```typescript
{
  id: '<slug-del-modulo>',
  title: '<Nombre Visible>',
  subtitle: '<Subtitulo corto>',
  description: '<Descripcion de 1-2 lineas>',
  icon: <LucideIcon>,       // importar de lucide-react
  href: '/aprendizaje/<slug>',
  enabled: true,
  stats: '<N secciones · Feature destacada>',
  color: '#rrggbb',         // color de acento unico
},
```

Si el modulo ya estaba como placeholder (enabled:false), solo cambiar `enabled: true` y completar los campos.

### 3.2 Agregar rutas en App.tsx

```typescript
// Lazy import (junto a los otros ~linea 90)
const NuevoModuloPage = lazyWithReload(() =>
  import('@/pages/NuevoModuloPublicPage').then((mod) => ({ default: mod.NuevoModuloPublicPage }))
)

// Rutas publicas (dentro del bloque de rutas publicas ~linea 253)
<Route path="/aprendizaje/<slug>/:itemId" element={
  <Suspense fallback={<LoadingScreen />}><NuevoModuloPage /></Suspense>
} />
<Route path="/aprendizaje/<slug>" element={
  <Suspense fallback={<LoadingScreen />}><NuevoModuloPage /></Suspense>
} />

// Ruta admin (dentro de adminRoutes ~linea 440, solo si tiene pagina admin)
<Route path="<slug>" element={
  <AdminRoute><Suspense fallback={<LoadingScreen />}><NuevoModuloAdminPage /></Suspense></AdminRoute>
} />
```

### 3.3 (Opcional) Agregar al sidebar admin en MainLayout.tsx
Solo si el modulo tiene pagina admin de edicion:
```typescript
// En adminNavigation[] (~linea 71)
{ name: '<Nombre>', href: '/<slug>', icon: <Icon> },
```

---

## Paso 4: Estructura Firestore (si aplica)

### Colecciones recomendadas:
```
<modulo>-sections    → Contenido principal (secciones, pasos, imagenes)
<modulo>-config      → Configuracion (orden, ajustes globales)
<modulo>-history     → Historial de cambios (audit log)
```

### Reglas Storage (si tiene imagenes):
Agregar en `storage.rules`:
```
match /<modulo>-images/{allPaths=**} {
  allow read;
  allow write: if request.auth != null;
}
```

---

## Paso 5: Verificacion

1. Navegar a `/aprendizaje` — la card del nuevo modulo debe aparecer
2. Click en la card — navega a `/aprendizaje/<slug>`
3. El modulo carga contenido correctamente
4. Mobile: la card se apila y el modulo es responsive
5. Si tiene admin: `/hmi-knuro` o equivalente permite editar
6. Datos persisten en Firestore entre sesiones

---

## Colores disponibles para cards (no repetir)

| Modulo | Color | Hex | Estado |
|--------|-------|-----|--------|
| Baader 200 | Azul | `#4499ff` | ✅ Activo |
| HMI Knuro | Verde | `#44ddaa` | ✅ Activo |
| Seguridad en Planta | Naranja | `#ff6644` | ✅ Activo (`/aprendizaje/seguridad`) |
| Marel | Morado | `#aa66ff` | ✅ Activo (`/aprendizaje/marel`) |
| *Disponibles* | Amarillo `#ffcc44`, Rosa `#ff66aa`, Cyan `#44ccdd` | — | Libres |

---

## Ejemplo rapido: Agregar modulo nuevo (Tipo C - Guia simple)

1. Crear `apps/pwa/src/pages/<Nombre>Page.tsx` — pagina React con secciones
2. En `LearningHubPage.tsx`: agregar card al array `modules[]` con `enabled: true`
3. En `App.tsx`: agregar `<Route path="/aprendizaje/<slug>" element={...} />`
4. Elegir color libre de la tabla (no repetir los ya usados)
5. Si no usa Firestore ni iframe: sin servicios adicionales
