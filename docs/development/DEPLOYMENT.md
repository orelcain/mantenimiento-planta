# 🚀 Guía de Deployment - GitHub Pages

## 📋 Configuración de Secrets en GitHub

Para que la aplicación funcione en GitHub Pages, debes configurar los secrets de Firebase:

### 1. Ve a tu repositorio en GitHub
```
https://github.com/orelcain/mantenimiento-planta/settings/secrets/actions
```

### 2. Agrega los siguientes secrets:

Haz click en **"New repository secret"** y agrega cada uno:

| Secret Name | Descripción | Dónde obtenerlo |
|------------|-------------|-----------------|
| `VITE_FIREBASE_API_KEY` | API Key de Firebase | Firebase Console → Project Settings |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth Domain | Firebase Console → Project Settings |
| `VITE_FIREBASE_PROJECT_ID` | Project ID | Firebase Console → Project Settings |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage Bucket | Firebase Console → Project Settings |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging Sender ID | Firebase Console → Project Settings |
| `VITE_FIREBASE_APP_ID` | App ID | Firebase Console → Project Settings |

### 3. Obtener las credenciales de Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Click en el ícono de configuración ⚙️ → **Project Settings**
4. Scroll down hasta **"Your apps"**
5. Selecciona tu app web o crea una nueva
6. Copia los valores del `firebaseConfig`

Ejemplo de configuración:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890abcdef"
};
```

## 🔐 Verificar Secrets Configurados

Después de agregar los secrets:

1. Ve a **Actions** en tu repositorio
2. Verás el workflow ejecutándose automáticamente
3. Si hay errores, revisa los logs del step "Build PWA"

## ✅ Checklist de Deployment

- [ ] Secrets de Firebase configurados en GitHub
- [ ] Firestore Rules desplegadas en Firebase Console
- [ ] Authentication habilitado en Firebase (Email/Password)
- [ ] Storage configurado en Firebase
- [ ] GitHub Pages habilitado en Settings → Pages → Source: GitHub Actions

## 🔍 Troubleshooting

### Error: "unavailable"
**Causa**: Las variables de Firebase no están configuradas en GitHub Secrets
**Solución**: Configura todos los secrets según la tabla arriba

### Error: "Firebase config error"
**Causa**: Algún secret está vacío o mal configurado
**Solución**: Verifica que todos los secrets estén correctamente copiados (sin espacios extras)

### Build falla en GitHub Actions
**Causa**: Secrets no configurados
**Solución**: 
1. Ve a Settings → Secrets → Actions
2. Verifica que todos los 6 secrets estén presentes
3. Re-ejecuta el workflow

## 📝 Notas Importantes

- Los secrets **NO** se ven después de crearlos (por seguridad)
- Si necesitas cambiar un secret, simplemente créalo de nuevo con el mismo nombre
- Los secrets se inyectan durante el **build** en GitHub Actions
- La app compilada incluye estos valores (no son secretos sensibles del lado del cliente)

## 🆘 Soporte

Si tienes problemas:
1. Revisa los logs de GitHub Actions
2. Verifica la consola del navegador (F12)
3. Comprueba que Firebase esté configurado correctamente
