# ⚠️ CHECKLIST DE VERSIONES - OBLIGATORIO

## 🚨 ANTES DE CADA COMMIT: Actualizar TODAS estas versiones

Cuando hagas **cualquier cambio** en el código, actualiza la versión en **TODOS** estos archivos:

### ✅ Archivos que SIEMPRE deben actualizarse:

1. **`package.json`** (raíz)
   ```json
   "version": "X.Y.Z"
   ```

2. **`apps/pwa/package.json`**
   ```json
   "version": "X.Y.Z"
   ```

3. **`apps/pwa/vite.config.ts`**
   ```typescript
   version: 'X.Y.Z'
   ```

4. **`apps/pwa/public/version.json`**
   ```json
   "version": "X.Y.Z"
   ```
   (También actualizar `features` con el cambio actual)

5. **`VERSION.md`**
   - Actualizar "Versión Actual: **vX.Y.Z**"
   - Agregar entrada de changelog con la nueva versión

6. **`iot/esp32-sensor/src/main.cpp`** (si aplica)
   ```cpp
   json.set("firmwareVersion", "X.Y.Z");
   ```

---

## 📋 Flujo de actualización recomendado:

```bash
# 1. Determinar tipo de cambio
PATCH (X.Y.Z+1) - Bugfix o corrección menor
MINOR (X.Y+1.0) - Nueva feature compatible
MAJOR (X+1.0.0) - Breaking change

# 2. Actualizar TODOS los archivos de arriba

# 3. Build y verificar
pnpm -C apps/pwa build

# 4. Commit con mensaje claro
git add -A
git commit -m "feat|fix|chore: descripción - vX.Y.Z"
git push

# 5. (Opcional) Si cambió firmware ESP32, flashear
cd iot/esp32-sensor
platformio run --target upload
```

---

## 🎯 Versión actual del sistema:

**v2.13.2** (11 enero 2026)

### Últimos cambios:
- Lista scrollable visual en Sensores
- Info completa visible sin memorizar códigos
- Badges de colores para estado y criticidad

---

## ⚡ Atajos rápidos:

### Buscar todas las versiones actuales:
```bash
# PowerShell
Select-String -Pattern '"version":|version:|firmwareVersion' -Path package.json,apps/pwa/package.json,apps/pwa/vite.config.ts,apps/pwa/public/version.json,VERSION.md,iot/esp32-sensor/src/main.cpp
```

### Reemplazar versión en batch (PowerShell):
```powershell
$OLD = "2.13.1"
$NEW = "2.13.2"

# Actualizar todos los archivos
(Get-Content package.json) -replace $OLD, $NEW | Set-Content package.json
(Get-Content apps/pwa/package.json) -replace $OLD, $NEW | Set-Content apps/pwa/package.json
(Get-Content apps/pwa/vite.config.ts) -replace $OLD, $NEW | Set-Content apps/pwa/vite.config.ts
(Get-Content apps/pwa/public/version.json) -replace $OLD, $NEW | Set-Content apps/pwa/public/version.json
(Get-Content VERSION.md) -replace $OLD, $NEW | Set-Content VERSION.md
(Get-Content iot/esp32-sensor/src/main.cpp) -replace $OLD, $NEW | Set-Content iot/esp32-sensor/src/main.cpp
```

---

## 🚫 NUNCA olvides:

- ❌ NO commitear sin actualizar versiones
- ❌ NO pushear con versiones desincronizadas
- ❌ NO usar versiones diferentes entre archivos
- ✅ SIEMPRE verificar con `Select-String` antes de commit
- ✅ SIEMPRE actualizar changelog en VERSION.md

---

**Recuerda**: Las versiones inconsistentes causan confusión y problemas de debugging. 
¡Mantén todo sincronizado! 🎯
