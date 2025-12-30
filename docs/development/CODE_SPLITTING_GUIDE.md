# 🚀 Guía de Code Splitting y Optimización

## 📊 Estado Actual del Bundle

**Build Stats (Última compilación)**:
```
✓ Build time: 9.50s
✓ Total size: 1055.70 KiB

Desglose por archivo:
- firebase.js: 516.35 KB (48.9%) ⚠️ MUY GRANDE
- index.js: 263.77 KB (25.0%) ⚠️ GRANDE
- vendor.js: 178.41 KB (16.9%)
- ui.js: 83.78 KB (7.9%)
- index.css: 34.51 KB (3.3%)
```

**Advertencia de Vite**: 
> ⚠️ Some chunks are larger than 500 KB after minification

---

## 🎯 Objetivos de Optimización

### Meta Principal
Reducir bundle inicial de **1055 KB** a menos de **800 KB** (-24%)

### Estrategias

1. **Code Splitting con React.lazy()** - Carga diferida de páginas
2. **Lazy Loading de componentes pesados** - Mapas, editores
3. **Optimización de imports de Firebase** - Solo lo que se usa
4. **Compresión adicional** - Brotli/Gzip

---

## 🔧 Implementación de Code Splitting

### 1. Páginas a Dividir (Lazy Loading)

#### Páginas Críticas (Cargar al inicio)
- ✅ **LoginPage** - Primera pantalla, debe ser rápida
- ✅ **IncidentsPage** - Página principal después de login

#### Páginas para Lazy Load (Cargar bajo demanda)
- 🎯 **MapPage** - Componente muy pesado (leaflet, mapas)
- 🎯 **PreventivePage** - 1069 líneas, muchos componentes
- 🎯 **SettingsPage** - Solo admins, no todos la usan
- 🎯 **EquipmentPage** - No es crítica al inicio

**Reducción estimada**: ~150-200 KB del initial bundle

### 2. Componentes a Dividir

#### Editores de Mapas (MUY PESADOS)
- 🎯 **PolygonZoneEditor** - 1090 líneas
- 🎯 **ZoneEditor** - 580 líneas  
- 🎯 **IncidentDetail** - 344 líneas, modal complejo

**Reducción estimada**: ~100-150 KB

### 3. Bibliotecas para Optimizar

#### Firebase (516 KB - ¡48% del bundle!)
```typescript
// ❌ ANTES (importa todo Firebase)
import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/storage'
import 'firebase/auth'

// ✅ DESPUÉS (solo lo necesario)
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'
```

**Reducción estimada**: ~100-150 KB

---

## 💻 Código a Implementar

### Paso 1: Modificar App.tsx con Lazy Loading

```typescript
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/store'

// Páginas críticas (carga inmediata)
import LoginPage from '@/pages/LoginPage'
import IncidentsPage from '@/pages/IncidentsPage'

// Páginas lazy (carga diferida)
const MapPage = lazy(() => import('@/pages/MapPage'))
const PreventivePage = lazy(() => import('@/pages/PreventivePage'))
const EquipmentPage = lazy(() => import('@/pages/EquipmentPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

// Componente de loading
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  )
}

function App() {
  const user = useAuthStore((state) => state.user)

  if (!user) {
    return <LoginPage />
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/incidencias" replace />} />
          <Route path="/incidencias" element={<IncidentsPage />} />
          <Route path="/mapa" element={<MapPage />} />
          <Route path="/preventivo" element={<PreventivePage />} />
          <Route path="/equipos" element={<EquipmentPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
```

**Impacto**: 
- Initial bundle: -150 KB aprox
- First Contentful Paint: Mejora de ~1-2 segundos

### Paso 2: Lazy Load de Componentes Pesados

```typescript
// En MapPage.tsx o donde se usen los editores
import { lazy, Suspense, useState } from 'react'

const PolygonZoneEditor = lazy(() => 
  import('@/components/map/PolygonZoneEditor')
)
const ZoneEditor = lazy(() => 
  import('@/components/map/ZoneEditor')
)

function MapPage() {
  const [editorType, setEditorType] = useState<'polygon' | 'simple'>('polygon')

  return (
    <div>
      {/* ... otros componentes ... */}
      
      <Suspense fallback={<div>Cargando editor...</div>}>
        {editorType === 'polygon' ? (
          <PolygonZoneEditor />
        ) : (
          <ZoneEditor />
        )}
      </Suspense>
    </div>
  )
}
```

**Impacto**:
- Los editores solo se cargan cuando el usuario los necesita
- Reduce bundle en ~100 KB

### Paso 3: Optimizar Imports de Firebase

```typescript
// En lib/firebase.ts
// ❌ ANTES
import { initializeApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'
import * as storage from 'firebase/storage'

// ✅ DESPUÉS (tree-shaking friendly)
import { initializeApp } from 'firebase/app'
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore'
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage'
```

**Impacto**:
- Firebase bundle: -100-150 KB
- Solo empaqueta las funciones que realmente usas

### Paso 4: Configurar Manual Chunks en Vite

```typescript
// En vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar Firebase en su propio chunk
          'firebase-core': [
            'firebase/app',
            'firebase/auth'
          ],
          'firebase-data': [
            'firebase/firestore',
            'firebase/storage'
          ],
          // Separar UI libs
          'ui-libs': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs'
          ],
          // Separar charts/visualizaciones
          'vendor-heavy': [
            'recharts',
            'date-fns'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 600 // Ajustar límite de advertencia
  }
})
```

**Impacto**:
- Mejor cacheo: Los chunks solo cambian cuando su contenido cambia
- Parallel loading: El navegador carga múltiples chunks simultáneamente

---

## 📈 Resultados Esperados

### Antes de Optimización
```
Initial Bundle: 1055 KB
Initial Load Time: ~4-5 segundos (3G)
Time to Interactive: ~6-8 segundos
```

### Después de Optimización
```
Initial Bundle: ~650 KB (-38%)
Initial Load Time: ~2-3 segundos (3G) (-50%)
Time to Interactive: ~3-4 segundos (-50%)

Desglose optimizado:
- Main bundle: ~200 KB (crítico)
- Firebase core: ~150 KB (lazy)
- Firebase data: ~200 KB (lazy)
- MapPage: ~100 KB (lazy - solo cuando se visita)
- UI libs: ~100 KB (lazy)
```

---

## ✅ Checklist de Implementación

### Fase 1: Setup Básico (30 min)
- [ ] Modificar App.tsx con lazy loading de páginas
- [ ] Crear PageLoader component
- [ ] Probar navegación entre páginas
- [ ] Verificar que Suspense funciona

### Fase 2: Componentes Pesados (20 min)
- [ ] Lazy load de PolygonZoneEditor
- [ ] Lazy load de ZoneEditor
- [ ] Lazy load de IncidentDetail (si aplica)
- [ ] Agregar loading states adecuados

### Fase 3: Optimización Firebase (15 min)
- [ ] Revisar imports en lib/firebase.ts
- [ ] Cambiar a imports específicos (tree-shakeable)
- [ ] Verificar que todo sigue funcionando
- [ ] Medir reducción en bundle

### Fase 4: Manual Chunks (10 min)
- [ ] Configurar manualChunks en vite.config.ts
- [ ] Probar build
- [ ] Verificar que los chunks se generan correctamente
- [ ] Medir tamaño final

### Fase 5: Testing (15 min)
- [ ] Build de producción
- [ ] Verificar todos los tamaños de chunks
- [ ] Probar en modo incógnito (sin cache)
- [ ] Verificar performance con Lighthouse
- [ ] Probar en conexión lenta (3G simulado)

**Tiempo total estimado**: ~90 minutos

---

## 🎓 Conceptos Clave

### React.lazy()
```typescript
// Carga el componente solo cuando se necesita
const Component = lazy(() => import('./Component'))
```

### Suspense
```typescript
// Muestra un fallback mientras carga
<Suspense fallback={<Loading />}>
  <LazyComponent />
</Suspense>
```

### Tree Shaking
```typescript
// ❌ Importa TODO el módulo
import * as firebase from 'firebase'

// ✅ Solo importa lo que usas
import { getDoc } from 'firebase/firestore'
```

### Code Splitting
El bundler divide el código en múltiples chunks que se cargan bajo demanda.

---

## 📊 Herramientas de Medición

### 1. Lighthouse (Chrome DevTools)
```bash
1. Abrir Chrome DevTools
2. Tab "Lighthouse"
3. Categories: Performance
4. Device: Mobile
5. Run analysis
```

**Métricas clave**:
- **FCP** (First Contentful Paint): < 1.8s
- **LCP** (Largest Contentful Paint): < 2.5s
- **TTI** (Time to Interactive): < 3.8s

### 2. Bundle Analyzer (Opcional)
```bash
npm install -D rollup-plugin-visualizer

# En vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    visualizer({ open: true })
  ]
})
```

Genera gráfico interactivo del bundle.

### 3. Network Tab
```bash
1. Chrome DevTools → Network
2. Throttling: Fast 3G
3. Disable cache
4. Reload
5. Observar:
   - Cuántos archivos se cargan
   - Tamaño total transferido
   - Tiempo de carga
```

---

## 🚨 Consideraciones Importantes

### Suspense y Error Boundaries
Siempre envolver lazy components en ErrorBoundary:

```typescript
import { ErrorBoundary } from 'react-error-boundary'

<ErrorBoundary fallback={<ErrorPage />}>
  <Suspense fallback={<Loading />}>
    <LazyComponent />
  </Suspense>
</ErrorBoundary>
```

### Preloading (Opcional)
Para componentes que sabes que el usuario va a necesitar pronto:

```typescript
// Precargar cuando el usuario hover sobre el botón
<button 
  onMouseEnter={() => {
    import('./MapPage') // Precarga el chunk
  }}
  onClick={() => navigate('/mapa')}
>
  Ver Mapa
</button>
```

### Cache de Service Worker
Asegurarse de que los chunks lazy también se cacheen:

```typescript
// En vite-plugin-pwa config
VitePWA({
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    // Cachear todos los chunks
    runtimeCaching: [{
      urlPattern: /^https:\/\/.*\.js$/,
      handler: 'CacheFirst'
    }]
  }
})
```

---

## 🎯 Próximos Pasos

1. **Implementar Fase 1** (Lazy loading de páginas)
   - Impacto más grande
   - Más fácil de implementar
   - Menos riesgo de bugs

2. **Medir resultados**
   - Antes y después con Lighthouse
   - Comparar bundle sizes
   - Verificar performance real

3. **Si se necesita más optimización**:
   - Fase 2: Lazy components
   - Fase 3: Firebase optimization
   - Fase 4: Manual chunks

4. **Documentar**
   - Actualizar README con nuevos tamaños
   - Agregar métricas de performance
   - Crear guía para nuevos desarrolladores

---

**Última actualización**: ${new Date().toLocaleDateString('es-ES')}
**Estado**: Guía lista, pendiente de implementación
**Prioridad**: Alta - El bundle actual (1055 KB) es muy grande para una PWA
