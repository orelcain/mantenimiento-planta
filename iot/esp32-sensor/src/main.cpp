/*
 * Sistema IoT - Monitoreo de Equipos Industriales
 * ESP32 + DHT22 + Firebase Realtime Database
 * 
 * Este código:
 * - Conecta ESP32 a WiFi
 * - Lee temperatura y humedad del sensor DHT22
 * - Envía datos a Firebase cada 5 segundos
 * - Detecta estados críticos (normal/warning/critical)
 * 
 * Autor: Sistema de Mantenimiento Industrial
 * Fecha: 2026-01-10
 */

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <DHTesp.h>
#include <Preferences.h>
#include <time.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <LittleFS.h>
#include <ESPmDNS.h>
#include "webserver_local.h"

// Config local (no versionada) / config de ejemplo (versionada)
#if __has_include("config.h")
#include "config.h"
#elif __has_include("config.example.h")
#include "config.example.h"
#else
#error "Falta config.h. Copia src/config.example.h a src/config.h y completa credenciales."
#endif

// Addons de Firebase (necesarios para tokens)
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ============ DECLARACIONES DE FUNCIONES ============
bool connectWiFi();
void setupFirebase();
String getStatus(float value, float warning, float critical);
uint64_t getTimestamp();
void sendOnlineStatus(bool online);
void sendSensorData();

static void startConfigPortal();
static void stopConfigPortal();
static void handleConfigPortalLoop();
static void initAfterWifiOnce();

static void ensureHttpServerStarted();
static void ensureHttpServerListening();
static void ensureAlwaysOnAp();
static void loadLocalSettings();
static String getApSsid();
static uint16_t getRamBacklogCount();

static void saveWifiNetworksToPrefs(const String* ssids, const String* passes, uint8_t count);
static void clearWifiNetworksFromPrefs();

static String getDeviceId();
static void loadEquipmentId();
static void persistEquipmentId(const String& equipmentId);
static bool hasAssignedEquipment();
static void sendDeviceStatus(bool online);
static void startDeviceAssignmentStream();
static void startApConfigStream();
static void setEquipmentOnlineFor(const String& equipmentId, bool online);

static void printDhtPinState(const char* context);

static void getSimulatedDht(float& temperature, float& humidity);

// ============ CONFIGURACIÓN DE HARDWARE ============
#define DHT_PIN 4        // GPIO4 (D4) - Pin de datos del DHT11
#define DHT_TYPE DHT11   // Tipo de sensor (DHT11)
#define LED_PIN 2        // LED integrado del ESP32

// ============ INTERVALOS DE TIEMPO ============
#define SEND_INTERVAL 5000      // Enviar datos cada 5 segundos
#define RECONNECT_INTERVAL 30000 // Reintentar conexión cada 30 seg

// ============ BUFFER OFFLINE (BACKFILL) ============
// Guarda lecturas en RAM cuando no hay WiFi/Firebase y las envía al volver.
// RAM: útil para cortes breves (rápido). Flash (LittleFS): sobrevive reinicios.
#define READINGS_BUFFER_MAX 720 // ~1 hora a 5s
#define READINGS_FLUSH_BATCH 25 // máx lecturas por ciclo

// Backlog persistente en flash
#define BACKLOG_FILE_PATH "/backlog.csv"
// Guardar offset cada N lecturas enviadas (reduce escrituras NVS)
#define BACKLOG_OFFSET_SAVE_EVERY 10

// ============ UMBRALES DE ALERTA ============
// Temperatura
#define TEMP_WARNING 30.0   // Advertencia si temp > 30°C
#define TEMP_CRITICAL 40.0  // Crítico si temp > 40°C
// Humedad
#define HUM_WARNING 70.0    // Advertencia si humedad > 70%
#define HUM_CRITICAL 85.0   // Crítico si humedad > 85%

// ============ OBJETOS GLOBALES ============
DHTesp dht;
FirebaseData fbdo;
FirebaseData stream;
FirebaseAuth auth;
FirebaseConfig config;

Preferences prefs;

String deviceId;
String currentEquipmentId;

// ============ WIFI PORTAL / CREDENCIALES (PREFERENCES) ============
#define WIFI_MAX_NETWORKS 5

static bool postWifiInitialized = false;
static bool portalActive = false;
static DNSServer dnsServer;
static WebServer portalServer(80);

static String savedWifiSsid[WIFI_MAX_NETWORKS];
static String savedWifiPass[WIFI_MAX_NETWORKS];
static uint8_t savedWifiCount = 0;

static bool httpServerStarted = false;
static bool httpServerListening = false;

// Dashboard / AP settings (Preferences)
static bool apAlwaysOn = false;
static String apSsidCustom;
static String apPassword;
static String deviceName;

static bool fsReady = false;
static uint32_t backlogOffset = 0;
static uint32_t backlogSentSinceSave = 0;
static bool flashBacklogHasFile = false;

// Última lectura (para dashboard local)
static uint64_t lastReadingTs = 0;
static float lastTemperature = NAN;
static float lastHumidity = NAN;
static bool lastSimulated = false;
static String lastTempStatus;
static String lastHumStatus;

static String staHostname;
static bool mdnsStarted = false;

static void loadLocalSettings() {
  prefs.begin("iot", false);
  apAlwaysOn = prefs.getBool("apAlways", true);  // TRUE por defecto: AP siempre activo
  apSsidCustom = prefs.getString("apName", "");
  apPassword = prefs.getString("apPass", "");
  deviceName = prefs.getString("devName", "");
  
  // LIMPIEZA: Si apName contiene SSID de WiFi conocida, borrarlo
  if (apSsidCustom.indexOf("vivo") >= 0 || apSsidCustom.indexOf("iPhone") >= 0 || apSsidCustom.indexOf("Movistar") >= 0) {
    Serial.printf("⚠️  apName contiene SSID WiFi erróneo: '%s'. Limpiando...\n", apSsidCustom.c_str());
    apSsidCustom = "";
    prefs.putString("apName", "");
  }
  prefs.end();

  apSsidCustom.trim();
  apPassword.trim();
  deviceName.trim();

  Serial.printf("⚙️  Config AP: apAlwaysOn=%s, SSID='%s', pass=%s, alias='%s'\n",
    apAlwaysOn ? "true" : "false",
    apSsidCustom.length() ? apSsidCustom.c_str() : "(auto)",
    apPassword.length() >= 8 ? "protegido" : "abierto",
    deviceName.length() ? deviceName.c_str() : "(sin alias)"
  );
}

static String getApSsid() {
  if (apSsidCustom.length() > 0) return apSsidCustom;
  return String("ESP32-") + (deviceId.length() ? deviceId : String("CONFIG"));
}

static void ensureAlwaysOnAp() {
  if (!apAlwaysOn) {
    Serial.println("📡 AP desactivado (apAlwaysOn=false)");
    return;
  }

  Serial.println("📡 Activando AP siempre encendido (modo AP+STA)...");

  // En modo dual, el canal del AP lo determina la red STA conectada.
  wifi_mode_t mode = WiFi.getMode();
  if (mode != WIFI_AP_STA) {
    WiFi.mode(WIFI_AP_STA);
    delay(50);
  }

  const String ssid = getApSsid();
  const bool passOk = (apPassword.length() >= 8);
  if (passOk) {
    WiFi.softAP(ssid.c_str(), apPassword.c_str());
    Serial.printf("✓ AP activo: %s (WPA2 protegido)\n", ssid.c_str());
  } else {
    WiFi.softAP(ssid.c_str());
    Serial.printf("✓ AP activo: %s (abierto - sin contraseña)\n", ssid.c_str());
  }
  Serial.printf("   IP del AP: %s\n", WiFi.softAPIP().toString().c_str());
}

static void ensureHttpServerStarted() {
  if (httpServerStarted) return;
  httpServerStarted = true;

  // Endpoint: estado en JSON
  portalServer.on("/status.json", HTTP_GET, []() {
    String json;
    json.reserve(900);
    json += "{";
    json += "\"deviceId\":\"" + deviceId + "\",";
    json += "\"deviceName\":\"" + deviceName + "\",";
    json += "\"assignedEquipmentId\":\"" + (hasAssignedEquipment() ? currentEquipmentId : String("")) + "\",";
    json += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
    json += "\"ssid\":\"" + WiFi.SSID() + "\",";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    json += "\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + ",";
    json += "\"portalActive\":" + String(portalActive ? "true" : "false") + ",";
    json += "\"apAlwaysOn\":" + String(apAlwaysOn ? "true" : "false") + ",";
    json += "\"apSsid\":\"" + WiFi.softAPSSID() + "\",";
    json += "\"apIp\":\"" + WiFi.softAPIP().toString() + "\",";
    json += "\"lastReadingTs\":" + String((double)lastReadingTs, 0) + ",";
    json += "\"temperature\":" + String(isnan(lastTemperature) ? 0.0 : lastTemperature, 2) + ",";
    json += "\"humidity\":" + String(isnan(lastHumidity) ? 0.0 : lastHumidity, 2) + ",";
    json += "\"tempStatus\":\"" + lastTempStatus + "\",";
    json += "\"humStatus\":\"" + lastHumStatus + "\",";
    json += "\"source\":\"" + String(lastSimulated ? "simulated" : "dht11") + "\",";
    json += "\"ramBacklogCount\":" + String((unsigned)getRamBacklogCount()) + ",";
    json += "\"flashBacklogOffset\":" + String((unsigned long)backlogOffset) + ",";
    json += "\"flashBacklogReady\":" + String(fsReady ? "true" : "false");
    json += "}";

    portalServer.send(200, "application/json", json);
  });

  // Página principal: dashboard en STA; si portalActive o ?cfg=1, mostrar config WiFi.
  portalServer.on("/", HTTP_GET, []() {
    const bool showWifiConfig = portalActive || portalServer.hasArg("cfg");

    String html;
    html.reserve(3200);
    html += "<!doctype html><html><head><meta charset='utf-8'>";
    html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
    html += "<title>ESP32</title>";
    html += "<style>body{font-family:system-ui,Segoe UI,Arial;margin:16px;max-width:820px}";
    html += "input{width:100%;padding:10px;margin:6px 0}button{padding:10px 14px;margin-top:10px}";
    html += ".row{margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:10px}";
    html += ".kv{display:grid;grid-template-columns:180px 1fr;gap:8px;align-items:center}";
    html += "small{color:#666}code{background:#f3f3f3;padding:2px 6px;border-radius:6px}";
    html += "</style></head><body>";

    if (showWifiConfig) {
      html += "<h2>ESP32 - Configuración WiFi</h2>";
      html += "<p><small>Red AP: <b>" + WiFi.softAPSSID() + "</b> · IP: <b>" + WiFi.softAPIP().toString() + "</b></small></p>";
      html += "<form method='POST' action='/save'>";
      html += "<p>Ingresa hasta " + String(WIFI_MAX_NETWORKS) + " redes (SSID + clave). Se guardan en el ESP32.</p>";

      for (uint8_t i = 0; i < WIFI_MAX_NETWORKS; i++) {
        html += "<div class='row'>";
        html += "<label>SSID " + String(i + 1) + "</label>";
        html += "<input name='ssid" + String(i + 1) + "' placeholder='Nombre WiFi' value='";
        if (i < savedWifiCount) html += savedWifiSsid[i];
        html += "'>";
        html += "<label>Clave " + String(i + 1) + "</label>";
        html += "<input name='pass" + String(i + 1) + "' type='password' placeholder='Contraseña' value='";
        if (i < savedWifiCount) html += savedWifiPass[i];
        html += "'>";
        html += "</div>";
      }

      html += "<div class='row'>";
      html += "<h3>Acceso local (AP)</h3>";
      html += "<label>SSID del AP (opcional)</label>";
      html += "<input name='apName' placeholder='Ej: Mantenimiento-ESP32' value='" + apSsidCustom + "'>";
      html += "<label>Clave del AP (opcional, >= 8 chars para WPA2)</label>";
      html += "<input name='apPass' type='password' placeholder='(vacío = abierta)' value='" + apPassword + "'>";
      html += "<label><input type='checkbox' name='apAlways' value='1'";
      if (apAlwaysOn) html += " checked";
      html += "> Mantener AP encendido siempre (AP+STA)</label>";
      html += "</div>";

      html += "<div class='row'>";
      html += "<h3>Nombre del dispositivo</h3>";
      html += "<label>Alias (opcional)</label>";
      html += "<input name='devName' placeholder='Ej: Sensor horno 1' value='" + deviceName + "'>";
      html += "</div>";

      html += "<button type='submit'>Guardar y reiniciar</button>";
      html += "</form>";
      html += "<form method='POST' action='/clear' style='margin-top:14px'>";
      html += "<button type='submit'>Borrar WiFi guardados</button>";
      html += "</form>";

      html += "<p style='margin-top:16px'><a href='/status.json'>Ver status JSON</a></p>";
    } else {
      html += "<h2>ESP32 - Dashboard local</h2>";
      html += "<p><small>Tip: abre <code>/status.json</code> para JSON.</small></p>";
      html += "<div class='row kv'>";
      html += "<div><b>Device ID</b></div><div><code>" + deviceId + "</code></div>";
      html += "<div><b>Nombre</b></div><div>" + (deviceName.length() ? deviceName : String("(sin alias)")) + "</div>";
      html += "<div><b>Equipo asignado</b></div><div><code>" + (hasAssignedEquipment() ? currentEquipmentId : String("(ninguno)")) + "</code></div>";
      html += "<div><b>WiFi</b></div><div>" + String(WiFi.status() == WL_CONNECTED ? "conectado" : "offline") + "</div>";
      html += "<div><b>SSID</b></div><div><code>" + WiFi.SSID() + "</code></div>";
      html += "<div><b>IP</b></div><div><code>" + WiFi.localIP().toString() + "</code></div>";
      html += "<div><b>RSSI</b></div><div><code>" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + " dBm</code></div>";
      html += "<div><b>mDNS</b></div><div><code>" + staHostname + ".local</code></div>";
      html += "<div><b>AP</b></div><div><code>" + WiFi.softAPSSID() + "</code> @ <code>" + WiFi.softAPIP().toString() + "</code></div>";
      html += "</div>";

      html += "<div class='row kv'>";
      html += "<div><b>Temperatura</b></div><div><code>" + String(lastTemperature, 2) + "</code> (" + lastTempStatus + ")</div>";
      html += "<div><b>Humedad</b></div><div><code>" + String(lastHumidity, 2) + "</code> (" + lastHumStatus + ")</div>";
      html += "<div><b>Fuente</b></div><div>" + String(lastSimulated ? "simulada" : "DHT11") + "</div>";
      html += "</div>";

      html += "<div class='row kv'>";
      html += "<div><b>Backlog RAM</b></div><div><code>" + String((unsigned)getRamBacklogCount()) + "</code></div>";
      html += "<div><b>Backlog Flash</b></div><div><code>" + String(fsReady ? "OK" : "NO") + "</code> (offset <code>" + String((unsigned long)backlogOffset) + "</code>)</div>";
      html += "</div>";

      html += "<p><a href='/wifi'>Config WiFi/AP</a> · <a href='/status.json'>status.json</a></p>";
    }

    html += "</body></html>";
    portalServer.send(200, "text/html", html);
  });

  // Configuración (disponible también en STA)
  portalServer.on("/wifi", HTTP_GET, []() {
    portalServer.sendHeader("Location", String("/") + "?cfg=1", true);
    portalServer.send(302, "text/plain", "");
  });

  portalServer.on("/save", HTTP_POST, []() {
    String ssids[WIFI_MAX_NETWORKS];
    String passes[WIFI_MAX_NETWORKS];
    uint8_t count = 0;

    for (uint8_t i = 0; i < WIFI_MAX_NETWORKS; i++) {
      String s = portalServer.arg(String("ssid") + String(i + 1));
      String p = portalServer.arg(String("pass") + String(i + 1));
      s.trim();
      if (s.length() == 0) continue;
      if (count >= WIFI_MAX_NETWORKS) break;
      ssids[count] = s;
      passes[count] = p;
      count++;
    }

    String apName = portalServer.arg("apName");
    String apPass = portalServer.arg("apPass");
    String devName = portalServer.arg("devName");
    const bool apAlways = portalServer.hasArg("apAlways");

    apName.trim();
    apPass.trim();
    devName.trim();

    saveWifiNetworksToPrefs(ssids, passes, count);

    prefs.begin("iot", false);
    prefs.putBool("apAlways", apAlways);
    prefs.putString("apName", apName);
    prefs.putString("apPass", apPass);
    prefs.putString("devName", devName);
    prefs.end();

    portalServer.send(200, "text/html",
      "<html><body><h3>Guardado.</h3><p>Reiniciando...</p></body></html>");
    delay(800);
    ESP.restart();
  });

  portalServer.on("/clear", HTTP_POST, []() {
    clearWifiNetworksFromPrefs();
    portalServer.send(200, "text/html",
      "<html><body><h3>WiFi borrados.</h3><p>Reiniciando...</p></body></html>");
    delay(800);
    ESP.restart();
  });

  // En portalActive, redirigir todo a '/'
  portalServer.onNotFound([]() {
    if (portalActive) {
      portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
      portalServer.send(302, "text/plain", "");
      return;
    }
    portalServer.send(404, "text/plain", "Not found");
  });

}

static void ensureHttpServerListening() {
  // Importante: llamar esto solo DESPUÉS de que WiFi/AP haya inicializado la pila TCP/IP.
  // Si se llama demasiado temprano, lwIP puede assertar (Invalid mbox).
  if (!httpServerStarted) ensureHttpServerStarted();
  if (httpServerListening) return;
  httpServerListening = true;
  portalServer.begin();
}

// Declarado más abajo (variables de estado), pero usado por helpers de buffer.
extern bool firebaseReady;

// ============ BUFFER DE LECTURAS EN RAM ============
enum StatusCode : uint8_t { STATUS_NORMAL = 0, STATUS_WARNING = 1, STATUS_CRITICAL = 2 };
enum SourceCode : uint8_t { SRC_DHT11 = 0, SRC_SIMULATED = 1 };

static StatusCode statusToCode(const String& s) {
  if (s == "critical") return STATUS_CRITICAL;
  if (s == "warning") return STATUS_WARNING;
  return STATUS_NORMAL;
}

static const char* codeToStatus(StatusCode c) {
  switch (c) {
    case STATUS_CRITICAL: return "critical";
    case STATUS_WARNING: return "warning";
    default: return "normal";
  }
}

static const char* codeToSource(SourceCode c) {
  switch (c) {
    case SRC_SIMULATED: return "simulated";
    default: return "dht11";
  }
}

struct BufferedReading {
  uint64_t timestampMs;
  float temperature;
  float humidity;
  StatusCode tempStatus;
  StatusCode humStatus;
  SourceCode source;
  char equipmentId[24];
};

static BufferedReading readingBuf[READINGS_BUFFER_MAX];
static uint16_t readingHead = 0;
static uint16_t readingTail = 0;
static uint16_t readingCount = 0;
static uint32_t bufferedDrops = 0;

static uint16_t getRamBacklogCount() {
  return readingCount;
}

static void bufferReading(
  const String& equipmentId,
  uint64_t timestampMs,
  float temperature,
  float humidity,
  const String& tempStatus,
  const String& humStatus,
  bool simulated
) {
  if (equipmentId.length() == 0) {
    // No hay destino para histórico.
    return;
  }

  // 1) Intentar persistir en flash (sobrevive reinicio)
  if (fsReady) {
    // Usar modo explícito "a" para asegurar creación si no existe.
    File f = LittleFS.open(BACKLOG_FILE_PATH, "a");
    if (f) {
      flashBacklogHasFile = true;
      char line[160];
      // ts,temp,hum,tempStatus,humStatus,source,equipmentId
      // status: 0/1/2, source: 0/1
      const int n = snprintf(
        line,
        sizeof(line),
        "%llu,%.3f,%.3f,%u,%u,%u,%s\n",
        (unsigned long long)timestampMs,
        (double)temperature,
        (double)humidity,
        (unsigned)statusToCode(tempStatus),
        (unsigned)statusToCode(humStatus),
        (unsigned)(simulated ? SRC_SIMULATED : SRC_DHT11),
        equipmentId.c_str()
      );
      if (n > 0) {
        f.print(line);
      }
      f.close();
      return; // Persistido: no duplicar en RAM
    }

    // Si falló, no insistir en cada lectura (evita spam del VFS). Caemos a RAM.
    fsReady = false;
    flashBacklogHasFile = false;
  }

  // 2) Fallback: guardar en RAM
  BufferedReading& slot = readingBuf[readingHead];
  slot.timestampMs = timestampMs;
  slot.temperature = temperature;
  slot.humidity = humidity;
  slot.tempStatus = statusToCode(tempStatus);
  slot.humStatus = statusToCode(humStatus);
  slot.source = simulated ? SRC_SIMULATED : SRC_DHT11;
  memset(slot.equipmentId, 0, sizeof(slot.equipmentId));
  strncpy(slot.equipmentId, equipmentId.c_str(), sizeof(slot.equipmentId) - 1);

  readingHead = (uint16_t)((readingHead + 1) % READINGS_BUFFER_MAX);
  if (readingCount < READINGS_BUFFER_MAX) {
    readingCount++;
  } else {
    // Buffer lleno: sobrescribe el más antiguo.
    readingTail = (uint16_t)((readingTail + 1) % READINGS_BUFFER_MAX);
    bufferedDrops++;
  }
}

static void flushBufferedReadings() {
  if (!firebaseReady) return;
  if (WiFi.status() != WL_CONNECTED) return;

  uint16_t flushed = 0;
  while (readingCount > 0 && flushed < READINGS_FLUSH_BATCH) {
    BufferedReading& r = readingBuf[readingTail];

    if (strlen(r.equipmentId) == 0) {
      // No se puede enviar: descartar.
      readingTail = (uint16_t)((readingTail + 1) % READINGS_BUFFER_MAX);
      readingCount--;
      continue;
    }

    String basePath;
    basePath.reserve(48);
    basePath = "sensors/";
    basePath += r.equipmentId;
    String readingsPath = basePath + "/readings";

    FirebaseJson readingJson;
    readingJson.set("timestamp", (double)r.timestampMs);
    readingJson.set("temperature", r.temperature);
    readingJson.set("humidity", r.humidity);
    readingJson.set("tempStatus", codeToStatus(r.tempStatus));
    readingJson.set("humStatus", codeToStatus(r.humStatus));
    readingJson.set("source", codeToSource(r.source));

    if (!Firebase.RTDB.pushJSON(&fbdo, readingsPath.c_str(), &readingJson)) {
      // Si falla, no consumimos la cola; se reintentará luego.
      Serial.printf("⚠ Backfill falló (se reintentará): %s\n", fbdo.errorReason().c_str());
      break;
    }

    readingTail = (uint16_t)((readingTail + 1) % READINGS_BUFFER_MAX);
    readingCount--;
    flushed++;

    // Pequeño respiro para no bloquear
    delay(10);
  }

  if (flushed > 0) {
    Serial.printf("📤 Backfill: enviadas %u, pendientes %u", (unsigned)flushed, (unsigned)readingCount);
    if (bufferedDrops > 0) {
      Serial.printf(" (drops por buffer lleno: %lu)", (unsigned long)bufferedDrops);
    }
    Serial.println();
  }
}

static bool parseBacklogLine(const String& line, BufferedReading& out) {
  // Formato: ts,temp,hum,tsCode,hsCode,srcCode,equipmentId
  // Ej: 1705160000123,25.1,55.2,0,0,0,720004501
  if (line.length() < 10) return false;

  int idx1 = line.indexOf(',');
  if (idx1 < 0) return false;
  int idx2 = line.indexOf(',', idx1 + 1);
  if (idx2 < 0) return false;
  int idx3 = line.indexOf(',', idx2 + 1);
  if (idx3 < 0) return false;
  int idx4 = line.indexOf(',', idx3 + 1);
  if (idx4 < 0) return false;
  int idx5 = line.indexOf(',', idx4 + 1);
  if (idx5 < 0) return false;
  int idx6 = line.indexOf(',', idx5 + 1);
  if (idx6 < 0) return false;

  const String tsS = line.substring(0, idx1);
  const String tS = line.substring(idx1 + 1, idx2);
  const String hS = line.substring(idx2 + 1, idx3);
  const String tsCodeS = line.substring(idx3 + 1, idx4);
  const String hsCodeS = line.substring(idx4 + 1, idx5);
  const String srcS = line.substring(idx5 + 1, idx6);
  String eq = line.substring(idx6 + 1);
  eq.trim();

  const uint64_t ts = (uint64_t)strtoull(tsS.c_str(), nullptr, 10);
  const float t = (float)atof(tS.c_str());
  const float h = (float)atof(hS.c_str());
  const uint8_t tsC = (uint8_t)atoi(tsCodeS.c_str());
  const uint8_t hsC = (uint8_t)atoi(hsCodeS.c_str());
  const uint8_t srcC = (uint8_t)atoi(srcS.c_str());

  if (ts == 0 || eq.length() == 0) return false;

  out.timestampMs = ts;
  out.temperature = t;
  out.humidity = h;
  out.tempStatus = (StatusCode)tsC;
  out.humStatus = (StatusCode)hsC;
  out.source = (SourceCode)srcC;
  memset(out.equipmentId, 0, sizeof(out.equipmentId));
  strncpy(out.equipmentId, eq.c_str(), sizeof(out.equipmentId) - 1);
  return true;
}

static void saveBacklogOffset() {
  prefs.begin("iot", false);
  prefs.putUInt("blOff", backlogOffset);
  prefs.end();
}

static void loadBacklogOffset() {
  prefs.begin("iot", false);
  backlogOffset = prefs.getUInt("blOff", 0);
  prefs.end();
}

static void flushBacklogFromFlash() {
  if (!fsReady) return;
  if (!firebaseReady) return;
  if (WiFi.status() != WL_CONNECTED) return;

  // Importante: NO usar LittleFS.exists() en cada loop cuando el archivo no existe,
  // porque el VFS spamea logs de error. Sólo intentamos abrir si sabemos que hay backlog.
  if (!flashBacklogHasFile && backlogOffset == 0) return;
  File f = LittleFS.open(BACKLOG_FILE_PATH, FILE_READ);
  if (!f) {
    // Si el FS montó pero no permite abrir, evitamos insistir en cada loop.
    fsReady = false;
    flashBacklogHasFile = false;
    backlogOffset = 0;
    saveBacklogOffset();
    return;
  }

  const size_t size = f.size();
  if (backlogOffset >= size) {
    f.close();
    LittleFS.remove(BACKLOG_FILE_PATH);
    backlogOffset = 0;
    saveBacklogOffset();
    flashBacklogHasFile = false;
    return;
  }

  f.seek(backlogOffset);

  uint16_t flushed = 0;
  while (f.available() && flushed < READINGS_FLUSH_BATCH) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) {
      backlogOffset = (uint32_t)f.position();
      continue;
    }

    BufferedReading r;
    if (!parseBacklogLine(line, r)) {
      // Línea corrupta: saltar
      backlogOffset = (uint32_t)f.position();
      continue;
    }

    String readingsPath;
    readingsPath.reserve(64);
    readingsPath = "sensors/";
    readingsPath += r.equipmentId;
    readingsPath += "/readings";

    FirebaseJson readingJson;
    readingJson.set("timestamp", (double)r.timestampMs);
    readingJson.set("temperature", r.temperature);
    readingJson.set("humidity", r.humidity);
    readingJson.set("tempStatus", codeToStatus(r.tempStatus));
    readingJson.set("humStatus", codeToStatus(r.humStatus));
    readingJson.set("source", codeToSource(r.source));

    if (!Firebase.RTDB.pushJSON(&fbdo, readingsPath.c_str(), &readingJson)) {
      Serial.printf("⚠ Backlog flash falló (se reintentará): %s\n", fbdo.errorReason().c_str());
      break;
    }

    backlogOffset = (uint32_t)f.position();
    flushed++;
    backlogSentSinceSave++;

    if (backlogSentSinceSave >= BACKLOG_OFFSET_SAVE_EVERY) {
      saveBacklogOffset();
      backlogSentSinceSave = 0;
    }

    delay(10);
  }

  const bool reachedEnd = (backlogOffset >= f.size());
  f.close();

  if (flushed > 0) {
    Serial.printf("📤 Backlog flash: enviadas %u", (unsigned)flushed);
    Serial.println();
  }

  if (reachedEnd) {
    LittleFS.remove(BACKLOG_FILE_PATH);
    backlogOffset = 0;
    saveBacklogOffset();
    backlogSentSinceSave = 0;
    flashBacklogHasFile = false;
  } else {
    // Persistir offset al menos una vez por flush
    saveBacklogOffset();
    backlogSentSinceSave = 0;
    flashBacklogHasFile = true;
  }
}

static void loadSavedWifiNetworks() {
  prefs.begin("iot", false);
  savedWifiCount = (uint8_t)prefs.getUChar("wifiCount", 0);
  if (savedWifiCount > WIFI_MAX_NETWORKS) savedWifiCount = WIFI_MAX_NETWORKS;

  for (uint8_t i = 0; i < WIFI_MAX_NETWORKS; i++) {
    savedWifiSsid[i] = "";
    savedWifiPass[i] = "";
  }

  for (uint8_t i = 0; i < savedWifiCount; i++) {
    String kS = String("wS") + String(i);
    String kP = String("wP") + String(i);
    savedWifiSsid[i] = prefs.getString(kS.c_str(), "");
    savedWifiPass[i] = prefs.getString(kP.c_str(), "");
    savedWifiSsid[i].trim();
  }
  prefs.end();
}

static void saveWifiNetworksToPrefs(const String* ssids, const String* passes, uint8_t count) {
  if (count > WIFI_MAX_NETWORKS) count = WIFI_MAX_NETWORKS;

  prefs.begin("iot", false);
  prefs.putUChar("wifiCount", count);
  for (uint8_t i = 0; i < WIFI_MAX_NETWORKS; i++) {
    String kS = String("wS") + String(i);
    String kP = String("wP") + String(i);
    if (i < count) {
      prefs.putString(kS.c_str(), ssids[i]);
      prefs.putString(kP.c_str(), passes[i]);
    } else {
      prefs.remove(kS.c_str());
      prefs.remove(kP.c_str());
    }
  }
  prefs.end();
}

static void clearWifiNetworksFromPrefs() {
  prefs.begin("iot", false);
  prefs.putUChar("wifiCount", 0);
  for (uint8_t i = 0; i < WIFI_MAX_NETWORKS; i++) {
    String kS = String("wS") + String(i);
    String kP = String("wP") + String(i);
    prefs.remove(kS.c_str());
    prefs.remove(kP.c_str());
  }
  prefs.end();
}

// ============ VARIABLES DE ESTADO ============
unsigned long lastSendTime = 0;
unsigned long lastReconnectTime = 0;
bool firebaseReady = false;
int failedAttempts = 0;

static unsigned long lastDeviceStatusMs = 0;
static unsigned long lastStreamReadMs = 0;

static String getDeviceId() {
  // MAC sin ':' para usarla como key en RTDB.
  // Ojo: WiFi.macAddress() puede tocar la pila TCP/IP y crashear si WiFi aún no está inicializado.
  const uint64_t efuseMac = ESP.getEfuseMac();
  const uint16_t macHigh = (uint16_t)(efuseMac >> 32);
  const uint32_t macLow = (uint32_t)(efuseMac & 0xFFFFFFFFULL);

  char out[13];
  snprintf(out, sizeof(out), "%04X%08X", macHigh, macLow);
  return String(out);
}

static bool looksLikePlaceholder(const String& s) {
  if (s.length() == 0) return true;
  // Si alguien dejó el ejemplo sin editar
  if (s == "TU_EQUIPMENT_ID") return true;
  return false;
}

static void loadEquipmentId() {
  prefs.begin("iot", false);
  String stored = prefs.getString("equipmentId", "");
  prefs.end();

  if (!looksLikePlaceholder(stored)) {
    currentEquipmentId = stored;
    return;
  }

  // Fallback: EQUIPMENT_ID desde config.h (si se usa)
  String fallback = String(EQUIPMENT_ID);
  if (!looksLikePlaceholder(fallback)) {
    currentEquipmentId = fallback;
  } else {
    currentEquipmentId = "";
  }
}

static void persistEquipmentId(const String& equipmentId) {
  prefs.begin("iot", false);
  prefs.putString("equipmentId", equipmentId);
  prefs.end();
}

static bool hasAssignedEquipment() {
  return currentEquipmentId.length() > 0;
}

static void setEquipmentOnlineFor(const String& equipmentId, bool online) {
  if (!firebaseReady) return;
  if (equipmentId.length() == 0) return;

  String path;
  path.reserve(96);
  path = "sensors/";
  path += equipmentId;
  path += "/online";
  Firebase.RTDB.setBool(&fbdo, path.c_str(), online);

  if (!online) return;

  path = "sensors/";
  path += equipmentId;
  path += "/lastSeen";
  Firebase.RTDB.setDouble(&fbdo, path.c_str(), (double)getTimestamp());

  path = "sensors/";
  path += equipmentId;
  path += "/equipmentId";
  Firebase.RTDB.setString(&fbdo, path.c_str(), equipmentId);
}

static void sendDeviceStatus(bool online) {
  if (!firebaseReady) return;
  if (deviceId.length() == 0) return;

  // Throttle más permisivo (no más de 1 update por 500ms)
  if (millis() - lastDeviceStatusMs < 500) return;
  lastDeviceStatusMs = millis();

  FirebaseJson json;
  json.set("online", online);
  json.set("lastSeen", (double)getTimestamp());
  json.set("ip", WiFi.localIP().toString());
  json.set("rssi", WiFi.RSSI());
  json.set("wifiSsid", WiFi.SSID());
  json.set("wifiPassword", WiFi.psk()); // Contraseña WiFi actual (útil para debugging/mostrar)
  json.set("mdns", staHostname.length() ? (staHostname + ".local") : "");
  json.set("deviceName", deviceName);
  json.set("firmwareVersion", "2.14.0");
  json.set("sensorType", "dht11");
  json.set("assignedEquipmentId", hasAssignedEquipment() ? currentEquipmentId : "");
  json.set("apAlwaysOn", apAlwaysOn);
  json.set("apSsid", WiFi.softAPSSID());
  json.set("apIp", WiFi.softAPIP().toString());
  json.set("apPassword", apPassword); // Contraseña del AP local

  String path;
  path.reserve(64);
  path = "devices/";
  path += deviceId;

  if (!Firebase.RTDB.setJSON(&fbdo, path.c_str(), &json)) {
    Serial.printf("✗ Error actualizando device status: %s\n", fbdo.errorReason().c_str());
  } else {
    Serial.printf("✓ Device status publicado en devices/%s (online: %s, equipo: %s)\n", 
                  deviceId.c_str(), 
                  online ? "true" : "false",
                  hasAssignedEquipment() ? currentEquipmentId.c_str() : "ninguno");
  }
}

static void streamCallback(FirebaseStream data) {
  if (data.dataTypeEnum() == fb_esp_rtdb_data_type_string) {
    const String oldId = currentEquipmentId;
    String newId = data.stringData();
    newId.trim();

    if (newId != currentEquipmentId) {
      currentEquipmentId = newId;
      persistEquipmentId(currentEquipmentId);
      Serial.printf("🔗 Asignación actualizada desde RTDB: equipmentId=%s\n", currentEquipmentId.c_str());

      if (oldId.length() > 0 && oldId != currentEquipmentId) {
        setEquipmentOnlineFor(oldId, false);
      }
      if (hasAssignedEquipment()) {
        sendOnlineStatus(true);
      }
    }
  } else if (data.dataTypeEnum() == fb_esp_rtdb_data_type_null) {
    if (currentEquipmentId.length() > 0) {
      const String oldId = currentEquipmentId;
      currentEquipmentId = "";
      persistEquipmentId(currentEquipmentId);
      Serial.println("🔌 Asignación eliminada desde RTDB (sin equipo).");
      setEquipmentOnlineFor(oldId, false);
    }
  }
}

static void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("⚠ Stream timeout (reintentando)...");
  }
}

static void startDeviceAssignmentStream() {
  if (!firebaseReady) return;
  if (deviceId.length() == 0) return;

  String path;
  path.reserve(80);
  path = "devices/";
  path += deviceId;
  path += "/assignedEquipmentId";

  if (!Firebase.RTDB.beginStream(&stream, path.c_str())) {
    Serial.printf("✗ Error iniciando stream: %s\n", stream.errorReason().c_str());
    return;
  }
  Firebase.RTDB.setStreamCallback(&stream, streamCallback, streamTimeoutCallback);
  Serial.printf("👂 Escuchando asignación en: %s\n", path.c_str());
}

static FirebaseData apConfigStream;

static void apConfigStreamCallback(FirebaseStream data) {
  if (data.dataTypeEnum() == fb_esp_rtdb_data_type_json) {
    FirebaseJson json;
    json.setJsonData(data.stringData());

    FirebaseJsonData enabled, ssid, password;
    json.get(enabled, "enabled");
    json.get(ssid, "ssid");
    json.get(password, "password");

    bool newApEnabled = enabled.success ? enabled.to<bool>() : true;
    String newSsid = ssid.success ? ssid.to<String>() : "";
    String newPass = password.success ? password.to<String>() : "";
    newSsid.trim();
    newPass.trim();

    Serial.printf("📡 Config AP recibida desde Firebase: enabled=%s, ssid='%s', pass=%s\n",
      newApEnabled ? "true" : "false",
      newSsid.length() ? newSsid.c_str() : "(auto)",
      newPass.length() >= 8 ? "protegido" : "abierto"
    );

    // Guardar en Preferences
    prefs.begin("iot", false);
    prefs.putBool("apAlways", newApEnabled);
    if (newSsid.length() > 0) {
      prefs.putString("apName", newSsid);
    } else {
      prefs.remove("apName");
    }
    if (newPass.length() >= 8) {
      prefs.putString("apPass", newPass);
    } else {
      prefs.remove("apPass");
    }
    prefs.end();

    // Aplicar cambios
    apAlwaysOn = newApEnabled;
    apSsidCustom = newSsid;
    apPassword = newPass;

    Serial.println("✓ Config AP actualizada. Reiniciando AP...");
    WiFi.softAPdisconnect(true);
    delay(500);
    ensureAlwaysOnAp();
  }
}

static void apConfigStreamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("⚠ Stream apConfig timeout (se reconecta automáticamente).");
  }
}

static void startApConfigStream() {
  if (!firebaseReady) return;
  if (deviceId.length() == 0) return;

  String path;
  path.reserve(80);
  path = "devices/";
  path += deviceId;
  path += "/apConfig";

  if (!Firebase.RTDB.beginStream(&apConfigStream, path.c_str())) {
    Serial.printf("⚠ No se pudo iniciar stream apConfig: %s\n", apConfigStream.errorReason().c_str());
    return;
  }

  Firebase.RTDB.setStreamCallback(&apConfigStream, apConfigStreamCallback, apConfigStreamTimeoutCallback);
  Serial.printf("👂 Escuchando config AP en: %s\n", path.c_str());
}

static void printDhtPinState(const char* context) {
  // El DHT normalmente deja la línea en HIGH (pull-up). Si queda siempre LOW,
  // suele ser corto a GND / pinout incorrecto / sensor trabado.
  pinMode(DHT_PIN, INPUT_PULLUP);
  delay(5);
  int level = digitalRead(DHT_PIN);
  Serial.printf("🔌 DHT GPIO%d estado (%s): %s\n", DHT_PIN, context, level ? "HIGH" : "LOW");
}

static void getSimulatedDht(float& temperature, float& humidity) {
  // Simulación simple para poder avanzar con el pipeline (Firebase/PWA)
  // cuando el sensor real no responde.
  static float t = 26.0f;
  static float h = 55.0f;

  // Pequeñas variaciones
  t += ((float)random(-8, 9)) / 10.0f;   // -0.8..+0.8
  h += ((float)random(-15, 16)) / 10.0f; // -1.5..+1.5

  // Clamp razonable
  if (t < 18.0f) t = 18.0f;
  if (t > 40.0f) t = 40.0f;
  if (h < 20.0f) h = 20.0f;
  if (h > 90.0f) h = 90.0f;

  temperature = t;
  humidity = h;
}

// ============ FUNCIÓN: CONFIGURACIÓN INICIAL ============
void setup() {
  // Iniciar comunicación serial
  Serial.begin(115200);
  delay(1000);
  
  Serial.println();
  Serial.println("╔════════════════════════════════════════╗");
  Serial.println("║  ESP32 IoT - Sistema de Monitoreo     ║");
  Serial.println("║  Temperatura y Humedad en Tiempo Real ║");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.println();

  Serial.printf("🧱 Build: %s %s\n", __DATE__, __TIME__);
  Serial.println();

  // ⚠️ SOLO ESTA VEZ: Borrar Preferences para forzar nuevo default apAlwaysOn=true
  // Borra esta sección después de flashear una vez
  #define FORCE_RESET_AP_ALWAYS_ON_DEFAULT true
  #if FORCE_RESET_AP_ALWAYS_ON_DEFAULT
  {
    Serial.println("🔄 RESET: Borrando Preferences para forzar apAlwaysOn=true por defecto");
    prefs.begin("iot", false);
    prefs.remove("apAlways");  // Solo borra este flag, mantiene WiFi/nombres
    prefs.end();
  }
  #endif
  
  // Configurar LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Iniciar sensor DHT con librería DHTesp
  Serial.println("⏳ Inicializando sensor DHT11 con librería DHTesp...");
  printDhtPinState("antes de dht.setup");
  dht.setup(DHT_PIN, DHTesp::DHT11);
  
  // No bloqueamos el arranque esperando el DHT; seguimos aunque falle.
  Serial.println("⏳ Esperando 2 segundos para estabilización del DHT11...");
  delay(2000);
  Serial.println("🔍 Probando lectura inicial del DHT11 (no bloqueante)...");
  {
    TempAndHumidity measurement = dht.getTempAndHumidity();
    if (dht.getStatus() != 0) {
      Serial.printf("⚠️ DHT no responde aún: %s (código: %d). Continuo con Firebase y fallback a simulación.\n",
                    dht.getStatusString(), dht.getStatus());
      printDhtPinState("tras TIMEOUT/ERROR");
    } else {
      Serial.printf("✓ Sensor DHT funcionando: %.1f°C, %.1f%%\n", measurement.temperature, measurement.humidity);
    }
  }
  Serial.println("✓ DHT listo (si falla, se simula)");

  randomSeed(micros());

  // DeviceId disponible incluso antes de WiFi (para SSID del portal)
  if (deviceId.length() == 0) {
    deviceId = getDeviceId();
  }

  // Settings locales (AP/alias)
  loadLocalSettings();

  // Servidor HTTP siempre listo (dashboard + config)
  ensureHttpServerStarted();

  // LittleFS para backlog persistente
  // Montar sobre la partición típica "spiffs" (esquema por defecto en ESP32)
  // para evitar problemas cuando no existe una partición etiquetada como "littlefs".
  fsReady = LittleFS.begin(true, "/littlefs", 10, "spiffs");
  if (fsReady) {
    // Validar que sea escribible (en algunos setups puede montar pero no permitir creación).
    bool canCreate = true;

    // Crear un archivo temporal para probar escritura sin tocar backlog.csv
    {
      File createTest = LittleFS.open("/.writetest", "w");
      if (createTest) {
        createTest.close();
        LittleFS.remove("/.writetest");
      } else {
        canCreate = false;
      }
    }

    if (!canCreate) {
      Serial.println("⚠ LittleFS montó pero no permite crear archivos. Intentando formatear...");
      LittleFS.end();
      LittleFS.format();
      fsReady = LittleFS.begin(true, "/littlefs", 10, "spiffs");

      if (fsReady) {
        File createTest = LittleFS.open("/.writetest", "w");
        if (createTest) {
          createTest.close();
          LittleFS.remove("/.writetest");
        } else {
          fsReady = false;
        }
      }
    }

    if (fsReady) {
      loadBacklogOffset();
      // Detectar backlog existente una sola vez (evita spameo; no usar exists() en loop).
      flashBacklogHasFile = false;
      {
        File backlogProbe = LittleFS.open(BACKLOG_FILE_PATH, FILE_READ);
        if (backlogProbe) {
          const size_t sz = backlogProbe.size();
          flashBacklogHasFile = (sz > 0 && backlogOffset < sz);
          backlogProbe.close();
        }
      }
      Serial.println("💾 LittleFS listo (backlog persistente habilitado)");
    } else {
      Serial.println("⚠ LittleFS no es escribible (backlog persistente deshabilitado; usando RAM)");
    }
  } else {
    Serial.println("⚠ No se pudo inicializar LittleFS (backlog persistente deshabilitado)");
  }
  
  // Conectar a WiFi
  loadSavedWifiNetworks();
  const bool wifiOk = connectWiFi();

  if (!wifiOk) {
    Serial.println("⚠ No hay WiFi. Iniciando portal de configuración...");
    startConfigPortal();
  } else {
    ensureAlwaysOnAp();
  }

  // Inicialización dependiente de WiFi (Firebase/NTP) se hace aquí o luego en loop
  initAfterWifiOnce();
}

// ============ FUNCIÓN: CONECTAR WiFi ============
bool connectWiFi() {
  struct WifiNetwork {
    const char* ssid;
    const char* password;
  };

  static const WifiNetwork networks[] = {
#if defined(WIFI_SSID_1)
    { WIFI_SSID_1, WIFI_PASSWORD_1 },
#endif
#if defined(WIFI_SSID_2)
    { WIFI_SSID_2, WIFI_PASSWORD_2 },
#endif
#if defined(WIFI_SSID_3)
    { WIFI_SSID_3, WIFI_PASSWORD_3 },
#endif
#if defined(WIFI_SSID_4)
    { WIFI_SSID_4, WIFI_PASSWORD_4 },
#endif
#if defined(WIFI_SSID_5)
    { WIFI_SSID_5, WIFI_PASSWORD_5 },
#endif
  };

  const size_t networkCount = sizeof(networks) / sizeof(networks[0]);

  auto beginWifi = []() {
    WiFi.mode(apAlwaysOn ? WIFI_AP_STA : WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
    WiFi.disconnect(true, true);
    delay(200);
  };

  auto tryConnect = [&](const char* ssid, const char* password, uint32_t timeoutMs) -> bool {
    if (!ssid || String(ssid).length() == 0) return false;
    Serial.print("⏳ Conectando a WiFi: ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);

    const uint32_t started = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - started) < timeoutMs) {
      delay(350);
      Serial.print(".");
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
    Serial.println();
    return WiFi.status() == WL_CONNECTED;
  };

  beginWifi();

  // Si el usuario quiere AP siempre activo, levantarlo ya.
  ensureAlwaysOnAp();

  // Construir lista final de redes: primero las guardadas en Preferences, luego las de compile-time.
  String ssids[WIFI_MAX_NETWORKS];
  String passes[WIFI_MAX_NETWORKS];
  uint8_t count = 0;

  auto addNetwork = [&](const String& ssid, const String& pass) {
    if (ssid.length() == 0) return;
    for (uint8_t i = 0; i < count; i++) {
      if (ssids[i] == ssid) return;
    }
    if (count >= WIFI_MAX_NETWORKS) return;
    ssids[count] = ssid;
    passes[count] = pass;
    count++;
  };

  for (uint8_t i = 0; i < savedWifiCount; i++) {
    addNetwork(savedWifiSsid[i], savedWifiPass[i]);
  }

  if (networkCount == 0) {
    // Compatibilidad con config antigua (WIFI_SSID/WIFI_PASSWORD)
    addNetwork(String(WIFI_SSID), String(WIFI_PASSWORD));
  } else {
    for (size_t i = 0; i < networkCount; i++) {
      addNetwork(String(networks[i].ssid), String(networks[i].password));
    }
  }

  if (count == 0) {
    Serial.println("⚠ No hay credenciales WiFi configuradas.");
    return false;
  }

  int bestNetworkIdx = -1;
  int bestRssi = -999;

  if (count > 0) {
    Serial.println("🔎 Escaneando redes WiFi cercanas...");
    int found = WiFi.scanNetworks(/*async=*/false, /*hidden=*/true);
    if (found > 0) {
      for (int i = 0; i < found; i++) {
        String ssid = WiFi.SSID(i);
        int rssi = WiFi.RSSI(i);
        for (uint8_t k = 0; k < count; k++) {
          if (ssid == ssids[k]) {
            if (rssi > bestRssi) {
              bestRssi = rssi;
              bestNetworkIdx = (int)k;
            }
          }
        }
      }
    } else if (found == 0) {
      Serial.println("⚠ No se detectaron redes en el escaneo.");
    }
    WiFi.scanDelete();

    // Si el escaneo funcionó pero ninguna red conocida está presente,
    // no tiene sentido esperar minutos intentando conectar: levantamos portal rápido.
    if (found >= 0 && bestNetworkIdx < 0) {
      Serial.println("⚠ Ninguna red conocida encontrada. Activar portal será más rápido.");
      return false;
    }
  }

  bool connected = false;
  // 1) Intenta primero la mejor conocida (si existe)
  if (bestNetworkIdx >= 0) {
    connected = tryConnect(ssids[bestNetworkIdx].c_str(), passes[bestNetworkIdx].c_str(), 12 * 1000);
  }
  // 2) Fallback: recorrer el resto
  for (uint8_t i = 0; !connected && i < count; i++) {
    if ((int)i == bestNetworkIdx) continue;
    connected = tryConnect(ssids[i].c_str(), passes[i].c_str(), 12 * 1000);
  }

  if (connected) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("✓ WiFi conectado!");
    Serial.print("  SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("  IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("  Señal: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    if (deviceId.length() == 0) {
      deviceId = getDeviceId();
      Serial.print("  Device ID: ");
      Serial.println(deviceId);
    }

    ensureAlwaysOnAp();
    return true;
  }

  Serial.println("✗ Error: No se pudo conectar a ningún WiFi configurado");
  Serial.println("  Verifica credenciales en config.h (WIFI_SSID/WIFI_PASSWORD o WIFI_SSID_1..)");
  return false;
}

static void startConfigPortal() {
  if (portalActive) return;
  portalActive = true;

  ensureHttpServerStarted();

  const String apSsid = getApSsid();
  WiFi.mode(WIFI_AP);
  // Canal fijo para mejorar visibilidad; red visible (hidden=false)
  const bool passOk = (apPassword.length() >= 8);
  if (passOk) {
    WiFi.softAP(apSsid.c_str(), apPassword.c_str(), 1, 0);
  } else {
    WiFi.softAP(apSsid.c_str(), nullptr, 1, 0);
  }
  delay(200);

  ensureHttpServerListening();

  IPAddress ip = WiFi.softAPIP();
  dnsServer.start(53, "*", ip);

  Serial.println("📶 Portal WiFi activo.");
  Serial.print("   SSID: ");
  Serial.println(WiFi.softAPSSID());
  Serial.print("   IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.println("   Abre http://192.168.4.1 en el celular/PC conectado a esa red.");
}

static void stopConfigPortal() {
  if (!portalActive) return;
  portalActive = false;
  dnsServer.stop();
  if (!apAlwaysOn) {
    WiFi.softAPdisconnect(true);
  }
  Serial.println("📶 Portal WiFi detenido.");
}

static void handleConfigPortalLoop() {
  if (portalActive) {
    dnsServer.processNextRequest();
  }
  portalServer.handleClient();
}

static void initAfterWifiOnce() {
  if (WiFi.status() != WL_CONNECTED) return;

  ensureHttpServerListening();

  // Inicializar servidor web local para dashboard de telemetría
  static bool localServerStarted = false;
  if (!localServerStarted) {
    setupLocalWebServer();
    localServerStarted = true;
  }

  // mDNS para acceder como http://<hostname>.local
  if (staHostname.length() == 0) {
    String suffix = deviceId;
    if (suffix.length() > 6) suffix = suffix.substring(suffix.length() - 6);
    staHostname = String("esp32-") + suffix;
  }
  if (!mdnsStarted) {
    if (MDNS.begin(staHostname.c_str())) {
      MDNS.addService("http", "tcp", 80);
      mdnsStarted = true;
      Serial.printf("🌐 mDNS listo: http://%s.local\n", staHostname.c_str());
    } else {
      Serial.println("⚠ No se pudo iniciar mDNS");
    }
  }

  // Si está configurado, mantener AP activo aunque haya WiFi
  ensureAlwaysOnAp();

  // Si el WiFi volvió, apagar portal aunque ya se haya inicializado antes.
  if (portalActive) {
    stopConfigPortal();
  }

  if (postWifiInitialized) return;

  // Configurar hora (NTP)
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  // Configurar Firebase
  setupFirebase();

  postWifiInitialized = true;

  Serial.println();
  Serial.println("✓ Sistema listo!");
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.println();
}

// ============ FUNCIÓN: CONFIGURAR FIREBASE ============
void setupFirebase() {
  Serial.println("⏳ Configurando Firebase...");
  
  // Configurar credenciales - SOLO database_url (sin API_KEY = sin auth)
  config.database_url = FIREBASE_DATABASE_URL;
  config.signer.tokens.legacy_token = FIREBASE_DATABASE_SECRET; // Token legacy (no crea usuarios)
  
  // Configurar reconexión automática
  Firebase.reconnectWiFi(true);
  
  // Configurar timeout
  config.timeout.serverResponse = 10 * 1000; // 10 segundos

  // ⚠️ NO usar Firebase.signUp() - esto crea usuarios anónimos constantemente
  // En su lugar, usar Database Secret (legacy) que NO requiere auth de usuario
  Serial.println("  Conectando con Database Secret (sin crear usuarios)...");
  
  Firebase.begin(&config, &auth);
  
  // Esperar a que esté listo
  Serial.println("  Esperando conexión...");
  int waitCount = 0;
  while (!Firebase.ready() && waitCount < 30) {
    delay(1000);
    Serial.print(".");
    waitCount++;
  }
  
  if (Firebase.ready()) {
    Serial.println();
    Serial.println("✓ Firebase conectado con Database Secret!");
    Serial.println("  (Sin autenticación de usuario - no crea usuarios anónimos)");
    firebaseReady = true;

    // Cargar equipo asignado (NVS/config) y registrar el device
    loadEquipmentId();
    Serial.printf("📌 Equipo asignado (local): %s\n", currentEquipmentId.c_str());
    sendDeviceStatus(true);
    startDeviceAssignmentStream();
    startApConfigStream();
    
    // Enviar estado inicial
    sendOnlineStatus(true);
  } else {
    Serial.println();
    Serial.println("✗ Error: No se pudo conectar a Firebase");
    Serial.println("  Verifica API_KEY, DATABASE_URL y que Auth Anónimo esté habilitado");
    firebaseReady = false;
  }
}

// ============ FUNCIÓN: DETERMINAR ESTADO ============
String getStatus(float value, float warning, float critical) {
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return "normal";
}

// ============ FUNCIÓN: OBTENER TIMESTAMP ============
uint64_t getTimestamp() {
  time_t now;
  time(&now);
  return (uint64_t)now * 1000ULL; // ms epoch, requiere 64-bit
}

// ============ FUNCIÓN: ENVIAR ESTADO ONLINE ============
void sendOnlineStatus(bool online) {
  // Mantener device status siempre (esto publica en devices/)
  sendDeviceStatus(online);

  // Si no hay equipo asignado, solo publicamos device status (arriba) y salimos
  if (!hasAssignedEquipment()) {
    return;
  }

  // A partir de aquí, solo se ejecuta si HAY equipo asignado (publica en sensors/)

  String path;
  path.reserve(96);
  path = "sensors/";
  path += currentEquipmentId;
  path += "/online";
  Firebase.RTDB.setBool(&fbdo, path.c_str(), online);

  path = "sensors/";
  path += currentEquipmentId;
  path += "/lastSeen";
  Firebase.RTDB.setDouble(&fbdo, path.c_str(), (double)getTimestamp());

  if (online) {
    path = "sensors/";
    path += currentEquipmentId;
    path += "/equipmentId";
    Firebase.RTDB.setString(&fbdo, path.c_str(), currentEquipmentId);
  }
}

// ============ FUNCIÓN: ENVIAR DATOS DE SENSOR ============
void sendSensorData() {
  // Leer sensor DHT; si falla, usar valores simulados para continuar.
  float temperature = NAN;
  float humidity = NAN;
  bool simulated = false;

  TempAndHumidity measurement = dht.getTempAndHumidity();
  if (dht.getStatus() == 0) {
    temperature = measurement.temperature;
    humidity = measurement.humidity;
    failedAttempts = 0;
  } else {
    failedAttempts++;
    getSimulatedDht(temperature, humidity);
    simulated = true;
    Serial.printf("✗ Error DHT: %s → usando SIMULACIÓN (intentos fallidos: %d)\n", dht.getStatusString(), failedAttempts);
    printDhtPinState("durante lectura fallida");
  }
  
  // Determinar estados
  String tempStatus = getStatus(temperature, TEMP_WARNING, TEMP_CRITICAL);
  String humStatus = getStatus(humidity, HUM_WARNING, HUM_CRITICAL);
  
  uint64_t timestamp = getTimestamp();

  // Guardar última lectura para el dashboard local
  lastReadingTs = timestamp;
  lastTemperature = temperature;
  lastHumidity = humidity;
  lastSimulated = simulated;
  lastTempStatus = tempStatus;
  lastHumStatus = humStatus;
  
  // Agregar al histórico del servidor web local
  addTelemetryReading(timestamp, temperature, humidity, tempStatus, humStatus, simulated);
  
  // Mostrar en serial
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (simulated) {
    Serial.println("🧪 Fuente: SIMULADA");
  } else {
    Serial.println("✅ Fuente: DHT11");
  }
  Serial.printf("🌡️  Temperatura: %.1f°C [%s]\n", temperature, tempStatus.c_str());
  Serial.printf("💧  Humedad: %.1f%% [%s]\n", humidity, humStatus.c_str());
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  // Si no hay conectividad/Firebase listo, guardamos en buffer y salimos.
  if (WiFi.status() != WL_CONNECTED || !firebaseReady) {
    if (hasAssignedEquipment()) {
      bufferReading(currentEquipmentId, timestamp, temperature, humidity, tempStatus, humStatus, simulated);
      Serial.printf("🧺 Buffer offline: %u pendientes\n", (unsigned)readingCount);
    }
    return;
  }

  // 1. Publicar telemetría en devices/{deviceId}/telemetry (SIEMPRE, asignado o no)
  FirebaseJson deviceTelemetryJson;
  deviceTelemetryJson.set("temperatura/value", temperature);
  deviceTelemetryJson.set("temperatura/unit", "°C");
  deviceTelemetryJson.set("temperatura/status", tempStatus);
  deviceTelemetryJson.set("temperatura/timestamp", (double)timestamp);
  deviceTelemetryJson.set("humedad/value", humidity);
  deviceTelemetryJson.set("humedad/unit", "%");
  deviceTelemetryJson.set("humedad/status", humStatus);
  deviceTelemetryJson.set("humedad/timestamp", (double)timestamp);
  deviceTelemetryJson.set("source", simulated ? "simulated" : "dht11");

  String deviceTelemetryPath;
  deviceTelemetryPath.reserve(64);
  deviceTelemetryPath = "devices/";
  deviceTelemetryPath += getDeviceId();
  deviceTelemetryPath += "/telemetry";

  if (Firebase.RTDB.setJSON(&fbdo, deviceTelemetryPath.c_str(), &deviceTelemetryJson)) {
    Serial.println("✓ Telemetría publicada en devices/{deviceId}/telemetry");
  } else {
    Serial.printf("✗ Error telemetría device: %s\n", fbdo.errorReason().c_str());
  }
  
  // 2. Si está asignado, TAMBIÉN publicar en sensors/{equipmentId} (para historial)
  if (!hasAssignedEquipment()) {
    Serial.println("ℹ️ Sin equipo asignado. Telemetría disponible solo en devices/.");
    return;
  }

  String basePath;
  basePath.reserve(48);
  basePath = "sensors/";
  basePath += currentEquipmentId;
  
  // Temperatura
  FirebaseJson tempJson;
  tempJson.set("value", temperature);
  tempJson.set("unit", "°C");
  tempJson.set("status", tempStatus);
  tempJson.set("timestamp", (double)timestamp);
  tempJson.set("source", simulated ? "simulated" : "dht11");
  
  String tempPath = basePath;
  tempPath += "/temperatura";
  if (Firebase.RTDB.setJSON(&fbdo, tempPath.c_str(), &tempJson)) {
    Serial.println("✓ Temperatura enviada a Firebase");
  } else {
    Serial.printf("✗ Error temperatura: %s\n", fbdo.errorReason().c_str());
  }
  
  // Humedad
  FirebaseJson humJson;
  humJson.set("value", humidity);
  humJson.set("unit", "%");
  humJson.set("status", humStatus);
  humJson.set("timestamp", (double)timestamp);
  humJson.set("source", simulated ? "simulated" : "dht11");
  
  String humPath = basePath;
  humPath += "/humedad";
  if (Firebase.RTDB.setJSON(&fbdo, humPath.c_str(), &humJson)) {
    Serial.println("✓ Humedad enviada a Firebase");
  } else {
    Serial.printf("✗ Error humedad: %s\n", fbdo.errorReason().c_str());
  }

  // Histórico de lecturas (para analítica/predicción)
  FirebaseJson readingJson;
  readingJson.set("timestamp", (double)timestamp);
  readingJson.set("temperature", temperature);
  readingJson.set("humidity", humidity);
  readingJson.set("tempStatus", tempStatus);
  readingJson.set("humStatus", humStatus);
  readingJson.set("source", simulated ? "simulated" : "dht11");

  String readingsPath = basePath;
  readingsPath += "/readings";
  if (!Firebase.RTDB.pushJSON(&fbdo, readingsPath.c_str(), &readingJson)) {
    Serial.printf("✗ Error guardando histórico: %s\n", fbdo.errorReason().c_str());
    // Guardar en buffer para reintento/backfill
    bufferReading(currentEquipmentId, timestamp, temperature, humidity, tempStatus, humStatus, simulated);
  }
  
  // Actualizar estado online
  sendOnlineStatus(true);
  
  // Parpadear LED (feedback visual)
  digitalWrite(LED_PIN, LOW);
  delay(100);
  digitalWrite(LED_PIN, HIGH);
  
  Serial.println();
}

// ============ LOOP PRINCIPAL ============
void loop() {
  handleConfigPortalLoop();
  handleLocalWebServer(); // Dashboard local de telemetría
  initAfterWifiOnce();

  // Reintentar conexión WiFi sin bloquear el muestreo.
  if (WiFi.status() != WL_CONNECTED) {
    // Si el portal está activo, mantenemos AP y no intentamos pasar a STA.
    // (evita que el AP desaparezca y no se vea en el celular)
    if (portalActive) {
      // Igual seguimos midiendo y guardando backlog.
    } else
    if (millis() - lastReconnectTime > RECONNECT_INTERVAL) {
      Serial.println("⚠ WiFi desconectado, intentando reconectar...");
      digitalWrite(LED_PIN, LOW);
      const bool ok = connectWiFi();
      if (!ok && !portalActive) {
        Serial.println("📶 No se pudo reconectar. Activando portal WiFi...");
        startConfigPortal();
      }
      lastReconnectTime = millis();
    }
  }

  // Si ya hay WiFi y Firebase está listo, intentar enviar backlog.
  flushBufferedReadings();
  flushBacklogFromFlash();

  // Verificar Firebase (solo si hay WiFi)
  if (WiFi.status() == WL_CONNECTED && !firebaseReady) {
    if (millis() - lastReconnectTime > RECONNECT_INTERVAL) {
      Serial.println("⚠ Intentando reconectar a Firebase...");
      setupFirebase();
      lastReconnectTime = millis();
    }
  }

  // Procesar stream de asignación (devices/{deviceId}/assignedEquipmentId)
  if (firebaseReady && millis() - lastStreamReadMs > 500) {
    Firebase.RTDB.readStream(&stream);
    lastStreamReadMs = millis();
  }
  
  // Enviar datos según intervalo
  if (millis() - lastSendTime > SEND_INTERVAL) {
    sendSensorData();
    lastSendTime = millis();
  }
  
  // Pequeño delay para no saturar el procesador
  delay(100);
}
