/*
 * Config de ejemplo (SIN secretos) - ESP32 IoT Sensor
 *
 * 1) Copia este archivo como `config.h` en la misma carpeta (`src/`).
 * 2) Completa tus credenciales WiFi y Firebase.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============ CONFIGURACIÓN WiFi ============
#define WIFI_SSID "TU_WIFI"
#define WIFI_PASSWORD "TU_PASSWORD_WIFI"

// ============ CONFIGURACIÓN FIREBASE ============
// Firebase Console → ⚙️ Configuración del proyecto → Web API Key
#define FIREBASE_API_KEY "TU_FIREBASE_WEB_API_KEY"

// Realtime Database URL (ej: https://tu-proyecto-default-rtdb.firebaseio.com)
#define FIREBASE_DATABASE_URL "https://TU_PROYECTO-default-rtdb.firebaseio.com"

// ============ CONFIGURACIÓN DE EQUIPO ============
// ID del equipo (copiar desde la PWA)
#define EQUIPMENT_ID "TU_EQUIPMENT_ID"

#endif // CONFIG_H
