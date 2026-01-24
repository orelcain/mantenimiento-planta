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
extern String currentEquipmentPath;

// ============ HANDLERS HTTP ============

void handleDashboard() {
  portalServer.sendHeader("Connection", "close");  // Cerrar conexión después de enviar
  portalServer.send_P(200, "text/html", HTML_DASHBOARD);
}

void handleApiCurrent() {
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  if (currentEquipmentId.isEmpty()) {
    doc["equipmentId"] = nullptr;
  } else {
    doc["equipmentId"] = currentEquipmentId;
  }
  if (currentEquipmentPath.isEmpty()) {
    doc["equipmentPath"] = "";
  } else {
    doc["equipmentPath"] = currentEquipmentPath;
  }

  // Primero intentar RAM
  if (telemetryCount > 0) {
    uint16_t lastIdx = (telemetryIndex == 0) ? telemetryCount - 1 : telemetryIndex - 1;
    TelemetryReading& reading = telemetryHistory[lastIdx];
    doc["timestamp"] = reading.timestamp;
    doc["temperature"] = reading.temperature;
    doc["humidity"] = reading.humidity;
    doc["tempStatus"] = reading.tempStatus;
    doc["humStatus"] = reading.humStatus;
    doc["simulated"] = reading.simulated;
    doc["source"] = "ram";
  } 
  // Fallback a flash si RAM vacío
  else {
    uint32_t flashCount = getFlashHistoryCount();
    if (flashCount > 0) {
      uint64_t ts;
      float temp, hum;
      uint8_t tempSt, humSt;
      bool sim;
      const char* statusNames[] = {"normal", "warning", "critical"};
      
      if (getFlashReading(flashCount - 1, ts, temp, hum, tempSt, humSt, sim)) {
        doc["timestamp"] = ts;
        doc["temperature"] = temp;
        doc["humidity"] = hum;
        doc["tempStatus"] = statusNames[tempSt < 3 ? tempSt : 0];
        doc["humStatus"] = statusNames[humSt < 3 ? humSt : 0];
        doc["simulated"] = sim;
        doc["source"] = "flash";
      } else {
        portalServer.send(503, "application/json", "{\"error\":\"No data available\"}");
        return;
      }
    } else {
      portalServer.send(503, "application/json", "{\"error\":\"No data available\"}");
      return;
    }
  }

  String json;
  serializeJson(doc, json);
  portalServer.sendHeader("Connection", "close");
  portalServer.send(200, "application/json", json);
}

void handleApiWifiStatus() {
  JsonDocument doc;
  doc["ssid"] = WiFi.SSID();
  doc["ip"] = WiFi.localIP().toString();
  doc["connected"] = (WiFi.status() == WL_CONNECTED);

  String json;
  serializeJson(doc, json);
  portalServer.sendHeader("Connection", "close");
  portalServer.send(200, "application/json", json);
}

void handleApiWifiConfig() {
  if (portalServer.method() != HTTP_POST) {
    portalServer.send(405, "application/json", "{\"error\":\"Method not allowed\"}");
    return;
  }

  String body = portalServer.arg("plain");
  JsonDocument doc;
  auto err = deserializeJson(doc, body);
  if (err) {
    portalServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }

  const char* ssid = doc["ssid"] | "";
  const char* password = doc["password"] | "";
  const bool reconnect = doc["reconnect"] | true;

  if (!ssid || String(ssid).length() == 0) {
    portalServer.send(400, "application/json", "{\"error\":\"SSID requerido\"}");
    return;
  }

  applyWifiConfig(String(ssid), String(password), reconnect);
  portalServer.send(200, "application/json", "{\"ok\":true}");
}

// ============ SETUP ============

void setupLocalWebServer() {
  // Registrar endpoints del dashboard en portalServer
  portalServer.on("/", handleDashboard);
  portalServer.on("/api/current", handleApiCurrent);
  portalServer.on("/api/wifi", HTTP_GET, handleApiWifiStatus);
  portalServer.on("/api/wifi", HTTP_POST, handleApiWifiConfig);

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
