# Sesión 2026-04-16 — Mobile Home: WIP Ribbons + QR Share + Menú

## Resumen
Sesión continuada de contexto compactado. Se implementó la experiencia completa del home móvil con marcadores visuales de desarrollo, compartir QR y reorganización de la navegación.

## Cambios implementados

### 1. WIP Ribbons (bandas "EN DESARROLLO")
- Componente `WipRibbon` con banda diagonal `rotate(38deg)` en amber-400
- Para chips de navegación: posición absoluta, overflow-hidden, z-10
- Para CTAs: pill badge inline con 🚧
- Admin puede tocar la banda → overlay de confirmación → Firestore `appConfig/wipOverrides`
- Persistencia real-time via `onSnapshot` — todos los usuarios ven el cambio al instante

### 2. WIP automático de formación
- `wip: !Object.values(m.sections).some(Boolean)` desde `LEARNING_MACHINES`
- Cuando admin añade contenido real a cualquier sección, la banda desaparece automáticamente
- No requiere cambio de código para liberar un módulo — sólo agregar contenido al LearningHub

### 3. Menú en header home
- Botón ≡ (Lucide `Menu`) arriba-izquierda del home móvil
- Llama `useAppStore(s => s.setSidebarOpen)(true)` — sin prop drilling

### 4. QR Share Card
- `AppShareCard` en acordeón al fondo del home
- `QRCodeSVG` de `qrcode.react` (ya instalado ^4.2.0)
- URL = `window.location.origin + import.meta.env.BASE_URL`
- Botón "Compartir enlace" → Web Share API con fallback clipboard

### 5. Limpieza de navegación
- Bottom nav bar oculta en `/` via clase `hidden` condicional en `MainLayout.tsx`
- Main sin padding-bottom en `/`
- Sin duplicados: HMI Knuro + HMI Grader SÓLO en Herramientas (no en Formación)

### 6. Nuevos archivos creados
- `apps/pwa/src/services/wipOverrides.ts`
- `apps/pwa/src/hooks/useWipOverrides.ts`

### 7. Launch.json limpieza
- `C:/Users/pc hp/OneDrive/ANTARFOOD/.claude/launch.json` → solo "Mantenimiento Planta (PWA)"
- Requiere `cmd.exe /c D: && cd D:\a\APP... && pnpm run dev` (cross-drive)
- Todos los demás launch.json del repo → `configurations: []`

## Commits de esta sesión (en origin/main)
```
6ca78405 fix(mobile): HMI Grader a Herramientas en admin (sin duplicar en Formación)
8da31ece feat(mobile): ribbon tappable admin + fix duplicados + menú en home
a8fa73db feat(mobile): ribbon diagonal "en desarrollo" + WIP automático formación
7a3d4e63 feat(mobile): más WIP badges + QR compartir app
efff8b83 feat(mobile): badge 🚧 en tiles WIP del home móvil
```

## Gotchas descubiertos
1. **Cherry-pick con hash relativo peligroso**: Si el branch tiene commits extras, `HEAD~1` captura el wrong commit. Siempre usar hash explícito `git cherry-pick a1b2c3d`.
2. **launch.json cwd debe ser relativo**: `preview_start` rechaza paths absolutos. Solución: `cmd.exe /c D: && cd <path> && <cmd>`.
3. **Linter puede revertir archivos**: Después de un commit exitoso, el linter puede restaurar el estado anterior en working tree. Los cherry-picks deben venir del hash committeado, no del working tree.

## Estado al cerrar
- v2.94.0 taggeada y pusheada
- CI verde en origin/main
- Preview server activo en port 5173 (serverId ba20082a...)
