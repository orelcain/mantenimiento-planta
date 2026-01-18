# 🔑 Cómo obtener y configurar el VAPID Key correcto

## 🚨 Problema actual
El error **401 (Unauthorized)** indica que el VAPID key configurado no es válido para el proyecto de Firebase.

## ✅ Solución - Obtener VAPID Key de Firebase Console

### Paso 1: Ir a Firebase Console
1. Abre [Firebase Console](https://console.firebase.google.com)
2. Selecciona el proyecto: **mantenimiento-planta-771a3**

### Paso 2: Acceder a Cloud Messaging
1. Ve a **Project Settings** (ícono de engranaje arriba a la izquierda)
2. Selecciona la pestaña **Cloud Messaging**

### Paso 3: Copiar Web Push certificates
1. Busca la sección **"Web Push certificates"** (o "Web Push (VAPID)")
2. Si no hay ninguno, haz clic en **"Generate Key Pair"**
3. Se generará automáticamente un par de claves
4. Copia la clave pública (la que comienza con `BN...` o similar)

### Paso 4: Actualizar en el código
1. Abre el archivo: `apps/pwa/src/services/notifications.ts`
2. Busca la línea con `vapidKey: '...'`
3. Reemplaza con tu VAPID key copiado de Firebase Console

```typescript
// Línea ~41 en notifications.ts
vapidKey: 'PEGA_TU_VAPID_KEY_AQUI',  // Ejemplo: BN3x4Y5z...
```

## 🔍 Verificar que sea correcto
- El VAPID key debe ser una cadena de ~88 caracteres
- Comienza típicamente con `BN` o similar
- Solo contiene caracteres alfanuméricos, `_` y `-`

## 🧪 Después de actualizar:

1. **Reconstruir la PWA**:
   ```bash
   cd apps/pwa
   pnpm build
   ```

2. **Hacer commit y push**:
   ```bash
   git add -A
   git commit -m "fix: Actualizar VAPID key de FCM"
   git push
   ```

3. **GitHub Pages se reconstruirá automáticamente**

4. **Limpiar caché** en el navegador:
   - Ctrl+Shift+Del o Command+Shift+Delete
   - Selecciona "Cookies and other site data"

5. **Probar las notificaciones nuevamente**

## ❓ Preguntas frecuentes

**P: ¿Dónde veo mis claves?**
R: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates

**P: ¿Qué si genera errores aún?**
R: Abre DevTools → Console y copia el error exacto para debuguear.

**P: ¿Puedo usar sin VAPID key?**
R: Sí, el código ahora intenta usar sin VAPID key primero (Firebase usa el configurado por defecto).

---

## 📝 Alternativa: Usar configuración por defecto de Firebase

Si no tienes VAPID key configurado en Firebase Console, el código ahora intentará:

1. Primero: Obtener token sin VAPID key (usa configuración por defecto de Firebase)
2. Fallback: Usar VAPID key explícita

Esto es más flexible y no requiere hardcodear el VAPID key.
