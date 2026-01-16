/*
 * network_local.cpp - Sistema de Red Local ESP32
 * 
 * Implementación optimizada del AP + Captive Portal
 * 
 * Características:
 * - AP siempre abierto (sin contraseña) para fácil conexión
 * - Captive portal automático para iOS, Android y Windows
 * - Servidor HTTP ligero con cleanup automático
 * - DNS que redirige todo al dashboard
 */

#include "network_local.h"
#include <WiFi.h>
#include <DNSServer.h>

// ============ SERVIDOR HTTP GLOBAL ============
// Usado por main.cpp y webserver_local.cpp
WebServer portalServer(HTTP_PORT);

// ============ VARIABLES INTERNAS ============
static DNSServer dnsServer;
static bool serverStarted = false;
static bool apStarted = false;
static String apSsidCustom = "";
static String apPasswordCustom = "";
static unsigned long lastCleanup = 0;

// Cleanup cada 60 segundos para evitar memory leaks
#define CLEANUP_INTERVAL_MS 60000

// ============ RESPUESTAS CAPTIVE PORTAL ============

// HTML mínimo para captive portal (sin "Success")
static const char CAPTIVE_HTML[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ESP32</title>
</head>
<body style="font-family:system-ui,Segoe UI,Arial;margin:16px">
  <h3>ESP32 - Red local</h3>
  <p><a href="/">Abrir lecturas locales</a></p>
</body>
</html>
)rawliteral";

// ============ HANDLERS CAPTIVE PORTAL ============

static void handleCaptivePortal() {
  portalServer.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  portalServer.sendHeader("Pragma", "no-cache");
  portalServer.sendHeader("Expires", "-1");
  portalServer.send_P(200, "text/html", CAPTIVE_HTML);
}

// ============ CONFIGURACIÓN BÁSICA ============

// ============ FUNCIONES PÚBLICAS ============

void networkLocalInit() {
  if (apStarted) return;
  
  Serial.println("🌐 Iniciando red local...");
  
  // Configurar modo AP+STA (permite conexión a internet + clientes locales)
  WiFi.mode(WIFI_AP_STA);
  delay(100);
  
  // Configurar IP fija del AP
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  
  // Obtener SSID (personalizado o por defecto con MAC)
  String ssid = apSsidCustom;
  if (ssid.length() == 0) {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[7];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X", mac[3], mac[4], mac[5]);
    ssid = String(AP_SSID_DEFAULT) + "-" + String(macStr);
  }
  
  // Iniciar AP (WPA2 si hay contraseña válida)
  const bool passOk = apPasswordCustom.length() >= 8;
  if (passOk) {
    WiFi.softAP(ssid.c_str(), apPasswordCustom.c_str(), 1, 0, 4);
  } else {
    WiFi.softAP(ssid.c_str(), nullptr, 1, 0, 4);
  }
  apStarted = true;
  
  Serial.printf("✓ AP activo: %s\n", ssid.c_str());
  Serial.printf("  IP: %s\n", WiFi.softAPIP().toString().c_str());
  
  // Iniciar DNS (redirige todas las peticiones al AP)
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", AP_IP);
  Serial.println("✓ DNS captive portal activo");
  
  // Captive portal simple: cualquier ruta no registrada devuelve HTML básico
  portalServer.onNotFound(handleCaptivePortal);
  
  lastCleanup = millis();
}

void networkLocalStartServer() {
  if (serverStarted) return;
  
  // Iniciar servidor HTTP
  portalServer.begin();
  serverStarted = true;
  Serial.println("✓ Servidor HTTP activo en puerto 80");
}

void networkLocalLoop() {
  // Procesar peticiones DNS (captive portal)
  dnsServer.processNextRequest();
  
  // Procesar peticiones HTTP
  if (serverStarted) {
    portalServer.handleClient();
  }
  
  // Cleanup periódico para evitar memory leaks
  unsigned long now = millis();
  if (serverStarted && (now - lastCleanup > CLEANUP_INTERVAL_MS)) {
    portalServer.close();  // Libera conexiones inactivas
    portalServer.begin();  // Re-inicia el servidor
    lastCleanup = now;
  }
}

void networkLocalSetApSsid(const String& ssid) {
  apSsidCustom = ssid;
}

void networkLocalSetApPassword(const String& password) {
  apPasswordCustom = password;
}

String networkLocalGetApSsid() {
  return WiFi.softAPSSID();
}

uint8_t networkLocalGetClientCount() {
  return WiFi.softAPgetStationNum();
}

WebServer& getHttpServer() {
  return portalServer;
}

bool networkLocalIsReady() {
  return serverStarted && apStarted;
}
