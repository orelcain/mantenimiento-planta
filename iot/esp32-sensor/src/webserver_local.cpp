/*
 * Implementación del servidor web local
 */

#include "webserver_local.h"
#include <ArduinoJson.h>

// ============ VARIABLES GLOBALES ============
WebServer localServer(LOCAL_WEB_SERVER_PORT);

TelemetryReading telemetryHistory[TELEMETRY_HISTORY_SIZE];
uint16_t telemetryIndex = 0;
uint16_t telemetryCount = 0;

// Variables externas del main.cpp
extern String deviceId;
extern String currentEquipmentId;

// ============ HANDLERS HTTP ============

void handleDashboard() {
  localServer.send_P(200, "text/html", HTML_DASHBOARD);
}

void handleApiCurrent() {
  if (telemetryCount == 0) {
    localServer.send(503, "application/json", "{\"error\":\"No data available\"}");
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
  localServer.send(200, "application/json", json);
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
  localServer.send(200, "application/json", json);
}

void handleNotFound() {
  localServer.send(404, "text/plain", "404 Not Found");
}

// ============ SETUP ============

void setupLocalWebServer() {
  localServer.on("/", handleDashboard);
  localServer.on("/api/current", handleApiCurrent);
  localServer.on("/api/history", handleApiHistory);
  localServer.onNotFound(handleNotFound);

  localServer.begin();
  Serial.println("✅ Servidor web local iniciado en puerto " + String(LOCAL_WEB_SERVER_PORT));
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
  localServer.handleClient();
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
