# 🔔 Notificaciones Push (FCM) - Implementación

## ✅ Alcance
- Envío automático de alertas cuando se crea una **incidencia predictiva** con prioridad **crítica** o **alta**.
- Envío a **admins y supervisores**.
- PWA recibe notificaciones en Android y en iOS 16.4+ (app instalada en pantalla de inicio).

---

## 1) Configurar Firebase Cloud Messaging
1. Ir a Firebase Console → Project Settings → Cloud Messaging.
2. Generar clave **Web Push (VAPID)** y reemplazarla en la PWA si aplica:
   - Archivo: apps/pwa/src/services/notifications.ts
   - Campo: `vapidKey`

---

## 2) Backend (Cloud Functions)
Ya está implementado un trigger:
- **functions/index.js** → `notifyPredictiveIncident`.
- Dispara cuando se crea un documento en **incidents/**.
- Filtra: `tipo = predictivo` y `prioridad in ['critica','alta']`.

### Despliegue
```bash
firebase deploy --only functions
```

---

## 3) Frontend (PWA)
- Solicitud de permisos y registro de token FCM:
  - apps/pwa/src/services/notifications.ts
  - apps/pwa/src/hooks/useNotifications.ts
  - apps/pwa/src/components/settings/NotificationsSettings.tsx

### Flujo esperado
1. Usuario entra a Configuración → Notificaciones.
2. Presiona **Activar notificaciones**.
3. Se guarda token en Firestore `fcmTokens/{userId}`.
4. Al crear incidencia predictiva crítica/alta se envía push.

---

## 4) Seguridad (Firestore Rules)
- Se agregó regla para que cada usuario sólo pueda escribir su token:
  - match /fcmTokens/{userId}

---

## 5) Pruebas rápidas
1. Activar notificaciones desde la PWA.
2. Crear incidencia predictiva (riesgo alto/crítico).
3. Verificar recepción de push.

---

## 6) Notas iOS
- iOS requiere iOS 16.4+ y la PWA instalada en pantalla de inicio.
- Sin instalación, no llegan notificaciones push.
