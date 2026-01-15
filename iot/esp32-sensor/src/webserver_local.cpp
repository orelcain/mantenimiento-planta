/*
 * Implementación del servidor web local
 */

#include "webserver_local.h"
#include <ArduinoJson.h>

// ============ VARIABLES GLOBALES ============
// NOTA: portalServer definido en main.cpp
extern WebServer portalServer;

TelemetryReading telemetryHistory[TELEMETRY_HISTORY_SIZE];
uint16_t telemetryIndex = 0;
uint16_t telemetryCount = 0;

// Variables externas del main.cpp
extern String deviceId;
extern String currentEquipmentId;

// ============ HANDLERS HTTP ============

// Página simple de captive portal (iOS/Android/Windows)
static const char CAPTIVE_PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ESP32 - Portal</title>
  <meta http-equiv="refresh" content="0; url=/" />
  <style>
    body{font-family:system-ui,Segoe UI,Arial;margin:20px}
    a{color:#2563eb}
  </style>
</head>
<body>
  <p>Redirigiendo al panel local...</p>
  <p><a href="/">Abrir panel</a></p>
</body>
</html>
)rawliteral";

static void handleCaptivePortal() {
  portalServer.send_P(200, "text/html", CAPTIVE_PORTAL_HTML);
}

void handleDashboard() {
  portalServer.send_P(200, "text/html", HTML_DASHBOARD);
}

void handleApiCurrent() {
  if (telemetryCount == 0) {
    portalServer.send(503, "application/json", "{\"error\":\"No data available\"}");
    return;
  }

  // Obtener última lectura
  uint16_t lastIdx = (telemetryIndex == 0) ? telemetryCount - 1 : telemetryIndex - 1;
  TelemetryReading& reading = telemetryHistory[lastIdx];

  JsonDocument doc;
  doc["deviceId"] = deviceId;
  if (currentEquipmentId.isEmpty()) {
    doc["equipmentId"] = nullptr;
  } else {
    doc["equipmentId"] = currentEquipmentId;
  }
  doc["timestamp"] = reading.timestamp;
  doc["temperature"] = reading.temperature;
  doc["humidity"] = reading.humidity;
  doc["tempStatus"] = reading.tempStatus;
  doc["humStatus"] = reading.humStatus;
  doc["simulated"] = reading.simulated;

  String json;
  serializeJson(doc, json);
  portalServer.send(200, "application/json", json);
}

void handleApiHistory() {
  JsonDocument doc;
  JsonArray array = doc.to<JsonArray>();

  // Iterar sobre el buffer circular
  uint16_t count = min(telemetryCount, (uint16_t)TELEMETRY_HISTORY_SIZE);
  uint16_t startIdx = (telemetryCount >= TELEMETRY_HISTORY_SIZE) 
                      ? telemetryIndex 
                      : 0;

  for (uint16_t i = 0; i < count; i++) {
    uint16_t idx = (startIdx + i) % TELEMETRY_HISTORY_SIZE;
    TelemetryReading& r = telemetryHistory[idx];

    JsonObject obj = array.add<JsonObject>();
    obj["timestamp"] = r.timestamp;
    obj["temperature"] = r.temperature;
    obj["humidity"] = r.humidity;
    obj["tempStatus"] = r.tempStatus;
    obj["humStatus"] = r.humStatus;
    obj["simulated"] = r.simulated;
  }

  String json;
  serializeJson(doc, json);
  portalServer.send(200, "application/json", json);
}

void handleNotFound() {
  // Captive Portal: redirigir todo al dashboard
  // Esto hace que al conectarse al WiFi AP se abra automáticamente el navegador
  if (WiFi.getMode() & WIFI_MODE_AP) {
    // Responder 200 para forzar detección de portal cautivo
    handleCaptivePortal();
  } else {
    portalServer.send(404, "text/plain", "404 Not Found");
  }
}

// ============ SETUP ============

void setupLocalWebServer() {
  // Registrar endpoints del dashboard en portalServer
  portalServer.on("/", handleDashboard);
  portalServer.on("/api/current", handleApiCurrent);
  portalServer.on("/api/history", handleApiHistory);
  
  // Captive Portal: capturar todas las peticiones comunes de detección
  portalServer.on("/generate_204", handleCaptivePortal);          // Android
  portalServer.on("/gen_204", handleCaptivePortal);               // Android
  portalServer.on("/ncsi.txt", handleCaptivePortal);              // Windows
  portalServer.on("/hotspot-detect.html", handleCaptivePortal);   // iOS/macOS
  portalServer.on("/library/test/success.html", handleCaptivePortal); // iOS (captive.apple.com)
  portalServer.on("/canonical.html", handleCaptivePortal);        // Firefox
  portalServer.on("/success.txt", handleCaptivePortal);           // Firefox
  portalServer.on("/connecttest.txt", handleCaptivePortal);       // Windows
  
  portalServer.onNotFound(handleNotFound);

  Serial.println("✅ Endpoints del dashboard registrados en puerto " + String(LOCAL_WEB_SERVER_PORT));
  Serial.println("🌐 Accede via:");
  
  if (WiFi.getMode() & WIFI_MODE_AP) {
    Serial.println("   - AP: http://192.168.4.1");
  }
  
  if (WiFi.getMode() & WIFI_MODE_STA && WiFi.status() == WL_CONNECTED) {
    Serial.println("   - STA: http://" + WiFi.localIP().toString());
  }
}

// ============ LOOP ============

void handleLocalWebServer() {
  // portalServer.handleClient() se llama desde main.cpp en handleConfigPortalLoop()
  // No hacer nada aquí para evitar llamadas duplicadas
}

// ============ AGREGAR LECTURA AL HISTÓRICO ============

void addTelemetryReading(uint64_t ts, float temp, float hum, String tempSt, String humSt, bool sim) {
  telemetryHistory[telemetryIndex].timestamp = ts;
  telemetryHistory[telemetryIndex].temperature = temp;
  telemetryHistory[telemetryIndex].humidity = hum;
  telemetryHistory[telemetryIndex].tempStatus = tempSt;
  telemetryHistory[telemetryIndex].humStatus = humSt;
  telemetryHistory[telemetryIndex].simulated = sim;

  telemetryIndex = (telemetryIndex + 1) % TELEMETRY_HISTORY_SIZE;
  
  if (telemetryCount < TELEMETRY_HISTORY_SIZE) {
    telemetryCount++;
  }
}
