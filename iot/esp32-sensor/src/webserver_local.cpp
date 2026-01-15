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
  if (currentEquipmentPath.isEmpty()) {
    doc["equipmentPath"] = "";
  } else {
    doc["equipmentPath"] = currentEquipmentPath;
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
  // Leer parámetro de fuente: ram (default para compatibilidad) o flash
  String source = portalServer.arg("source");
  bool useFlash = (source == "flash");
  
  // Leer parámetro de límite (para no saturar memoria con 20000 lecturas)
  int limit = portalServer.arg("limit").toInt();
  if (limit <= 0 || limit > 2000) limit = 500;  // Máximo 500 por request
  
  // Leer parámetro de offset (para paginación)
  int offset = portalServer.arg("offset").toInt();
  if (offset < 0) offset = 0;
  
  JsonDocument doc;
  JsonArray array = doc.to<JsonArray>();
  
  if (useFlash) {
    // Leer desde flash persistente
    uint32_t total = getFlashHistoryCount();
    
    // Calcular inicio (las más recientes primero si se pide desde el final)
    int startIdx = (int)total - limit - offset;
    if (startIdx < 0) startIdx = 0;
    int endIdx = (int)total - offset;
    if (endIdx > (int)total) endIdx = total;
    
    const char* statusNames[] = {"normal", "warning", "critical"};
    
    for (int i = startIdx; i < endIdx; i++) {
      uint64_t ts;
      float temp, hum;
      uint8_t tempSt, humSt;
      bool sim;
      
      if (getFlashReading(i, ts, temp, hum, tempSt, humSt, sim)) {
        JsonObject obj = array.add<JsonObject>();
        obj["timestamp"] = ts;
        obj["temperature"] = temp;
        obj["humidity"] = hum;
        obj["tempStatus"] = statusNames[tempSt < 3 ? tempSt : 0];
        obj["humStatus"] = statusNames[humSt < 3 ? humSt : 0];
        obj["simulated"] = sim;
      }
    }
    
    // Agregar metadata
    doc["_meta"]["total"] = total;
    doc["_meta"]["offset"] = offset;
    doc["_meta"]["limit"] = limit;
    doc["_meta"]["source"] = "flash";
  } else {
    // Leer desde RAM (comportamiento original, máximo 100)
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
    
    // Agregar metadata
    doc["_meta"]["total"] = count;
    doc["_meta"]["source"] = "ram";
  }

  String json;
  serializeJson(doc, json);
  portalServer.send(200, "application/json", json);
}

// Handler para obtener/cambiar configuración
void handleApiConfig() {
  if (portalServer.method() == HTTP_GET) {
    // GET: devolver configuración actual
    JsonDocument doc;
    doc["sendIntervalSeconds"] = getSendIntervalSeconds();
    doc["flashHistoryCount"] = getFlashHistoryCount();
    doc["flashHistoryMax"] = 20000;
    doc["ramHistoryCount"] = telemetryCount;
    doc["ramHistoryMax"] = TELEMETRY_HISTORY_SIZE;

    // Umbrales de alerta
    AlertThresholds t = getAlertThresholds();
    doc["tempWarnLow"] = t.tempWarnLow;
    doc["tempWarnHigh"] = t.tempWarnHigh;
    doc["tempCritLow"] = t.tempCritLow;
    doc["tempCritHigh"] = t.tempCritHigh;
    doc["humWarnLow"] = t.humWarnLow;
    doc["humWarnHigh"] = t.humWarnHigh;
    doc["humCritLow"] = t.humCritLow;
    doc["humCritHigh"] = t.humCritHigh;
    
    // Calcular días estimados de histórico
    uint32_t intervalSec = getSendIntervalSeconds();
    float daysCapacity = (20000.0f * intervalSec) / 86400.0f;
    doc["estimatedDaysCapacity"] = daysCapacity;
    
    String json;
    serializeJson(doc, json);
    portalServer.send(200, "application/json", json);
  } else if (portalServer.method() == HTTP_POST) {
    // POST: actualizar configuración
    String body = portalServer.arg("plain");
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    
    if (err) {
      portalServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }
    
    bool changed = false;
    bool thresholdsChanged = false;

    AlertThresholds t = getAlertThresholds();
    
    if (doc.containsKey("sendIntervalSeconds")) {
      int newInterval = doc["sendIntervalSeconds"].as<int>();
      if (newInterval >= 5 && newInterval <= 300) {
        setSendIntervalSeconds(newInterval);
        changed = true;
      }
    }

    auto setFloat = [&](const char* key, float& target) {
      if (!doc.containsKey(key)) return;
      target = doc[key].as<float>();
      thresholdsChanged = true;
    };

    setFloat("tempWarnLow", t.tempWarnLow);
    setFloat("tempWarnHigh", t.tempWarnHigh);
    setFloat("tempCritLow", t.tempCritLow);
    setFloat("tempCritHigh", t.tempCritHigh);
    setFloat("humWarnLow", t.humWarnLow);
    setFloat("humWarnHigh", t.humWarnHigh);
    setFloat("humCritLow", t.humCritLow);
    setFloat("humCritHigh", t.humCritHigh);

    if (thresholdsChanged) {
      if (!setAlertThresholds(t)) {
        portalServer.send(400, "application/json", "{\"error\":\"Umbrales inválidos\"}");
        return;
      }
      changed = true;
    }
    
    if (changed) {
      portalServer.send(200, "application/json", "{\"success\":true}");
    } else {
      portalServer.send(400, "application/json", "{\"error\":\"No valid changes\"}");
    }
  } else {
    portalServer.send(405, "application/json", "{\"error\":\"Method not allowed\"}");
  }
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
  portalServer.on("/api/config", HTTP_GET, handleApiConfig);
  portalServer.on("/api/config", HTTP_POST, handleApiConfig);
  
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
