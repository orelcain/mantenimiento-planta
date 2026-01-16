/*
 * Config de ejemplo (SIN secretos) - ESP32 IoT Sensor
 *
 * 1) Copia este archivo como `config.h` en la misma carpeta (`src/`).
 * 2) Completa tus credenciales WiFi y Firebase.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============ CONFIGURACIÓN WiFi ============
// Opción A (simple): 1 sola red
// #define WIFI_SSID "TU_WIFI"
// #define WIFI_PASSWORD "TU_PASSWORD_WIFI"

// Opción B (recomendada): varias redes (fallback automático)
// El ESP32 escanea y se conecta a la conocida con mejor señal.
#define WIFI_SSID_1 "TU_WIFI_1"
#define WIFI_PASSWORD_1 "TU_PASSWORD_WIFI_1"

// #define WIFI_SSID_2 "TU_WIFI_2"
// #define WIFI_PASSWORD_2 "TU_PASSWORD_WIFI_2"

// #define WIFI_SSID_3 "TU_WIFI_3"
// #define WIFI_PASSWORD_3 "TU_PASSWORD_WIFI_3"

// #define WIFI_SSID_4 "TU_WIFI_4"
// #define WIFI_PASSWORD_4 "TU_PASSWORD_WIFI_4"

// #define WIFI_SSID_5 "TU_WIFI_5"
// #define WIFI_PASSWORD_5 "TU_PASSWORD_WIFI_5"

// ============ CONFIGURACIÓN FIREBASE ============
// Firebase Console → ⚙️ Configuración del proyecto → Web API Key
#define FIREBASE_API_KEY "TU_FIREBASE_WEB_API_KEY"

// Realtime Database URL (ej: https://tu-proyecto-default-rtdb.firebaseio.com)
#define FIREBASE_DATABASE_URL "https://TU_PROYECTO-default-rtdb.firebaseio.com"

// ============ CONFIGURACIÓN DE EQUIPO ============
// ID del equipo (opcional): se usa como fallback si aún no emparejas el ESP32.
// Recomendado: emparejar desde la PWA (ruta /sensors) y dejar esto vacío.
#define EQUIPMENT_ID ""

// ============ OTA (Actualización por WiFi) ============
// Habilita OTA en producción. Requiere al menos 8 caracteres si defines password.
// #define OTA_ENABLED 1
// #define OTA_PASSWORD "TU_CLAVE_OTA"

#endif // CONFIG_H
