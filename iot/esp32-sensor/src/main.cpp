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

static String getDeviceId();
static void loadEquipmentId();
static void persistEquipmentId(const String& equipmentId);
static bool hasAssignedEquipment();
static void sendDeviceStatus(bool online);
static void startDeviceAssignmentStream();
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

static String deviceId;
static String currentEquipmentId;

// ============ WIFI PORTAL / CREDENCIALES (PREFERENCES) ============
#define WIFI_MAX_NETWORKS 5

static bool postWifiInitialized = false;
static bool portalActive = false;
static DNSServer dnsServer;
static WebServer portalServer(80);

static String savedWifiSsid[WIFI_MAX_NETWORKS];
static String savedWifiPass[WIFI_MAX_NETWORKS];
static uint8_t savedWifiCount = 0;

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
  // MAC sin ':' para usarla como key en RTDB
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  mac.toUpperCase();
  return mac;
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
  json.set("firmwareVersion", "2.14.0");
  json.set("sensorType", "dht11");
  json.set("assignedEquipmentId", hasAssignedEquipment() ? currentEquipmentId : "");

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
  
  // Conectar a WiFi
  loadSavedWifiNetworks();
  const bool wifiOk = connectWiFi();

  if (!wifiOk) {
    Serial.println("⚠ No hay WiFi. Iniciando portal de configuración...");
    startConfigPortal();
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
    WiFi.mode(WIFI_STA);
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
    }
    WiFi.scanDelete();
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
    return true;
  }

  Serial.println("✗ Error: No se pudo conectar a ningún WiFi configurado");
  Serial.println("  Verifica credenciales en config.h (WIFI_SSID/WIFI_PASSWORD o WIFI_SSID_1..)");
  return false;
}

static void startConfigPortal() {
  if (portalActive) return;
  portalActive = true;

  const String apSsid = String("ESP32-") + (deviceId.length() ? deviceId : String("CONFIG"));
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid.c_str());
  delay(200);

  IPAddress ip = WiFi.softAPIP();
  dnsServer.start(53, "*", ip);

  portalServer.on("/", HTTP_GET, []() {
    String html;
    html.reserve(2400);
    html += "<!doctype html><html><head><meta charset='utf-8'>";
    html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
    html += "<title>Config WiFi</title>";
    html += "<style>body{font-family:system-ui,Segoe UI,Arial;margin:16px;max-width:720px}";
    html += "input{width:100%;padding:10px;margin:6px 0}button{padding:10px 14px;margin-top:10px}";
    html += ".row{margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:10px}";
    html += "small{color:#666}</style></head><body>";
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

    html += "<button type='submit'>Guardar y reiniciar</button>";
    html += "</form>";
    html += "<form method='POST' action='/clear' style='margin-top:14px'>";
    html += "<button type='submit'>Borrar WiFi guardados</button>";
    html += "</form>";
    html += "</body></html>";
    portalServer.send(200, "text/html", html);
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

    saveWifiNetworksToPrefs(ssids, passes, count);
    loadSavedWifiNetworks();

    portalServer.send(200, "text/html",
      "<html><body><h3>Guardado.</h3><p>Reiniciando...</p></body></html>");
    delay(800);
    ESP.restart();
  });

  portalServer.on("/clear", HTTP_POST, []() {
    clearWifiNetworksFromPrefs();
    loadSavedWifiNetworks();
    portalServer.send(200, "text/html",
      "<html><body><h3>WiFi borrados.</h3><p>Vuelve atrás y configura nuevamente.</p></body></html>");
  });

  portalServer.onNotFound([]() {
    portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
    portalServer.send(302, "text/plain", "");
  });

  portalServer.begin();
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
  portalServer.stop();
  WiFi.softAPdisconnect(true);
  Serial.println("📶 Portal WiFi detenido.");
}

static void handleConfigPortalLoop() {
  if (!portalActive) return;
  dnsServer.processNextRequest();
  portalServer.handleClient();
}

static void initAfterWifiOnce() {
  if (postWifiInitialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  // Configurar hora (NTP)
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  // Configurar Firebase
  setupFirebase();

  postWifiInitialized = true;
  stopConfigPortal();

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
    sendOnlineStatus(true);
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
  initAfterWifiOnce();

  // Verificar conexión WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠ WiFi desconectado, reconectando...");
    digitalWrite(LED_PIN, LOW);
    connectWiFi();
    return;
  }
  
  // Verificar Firebase
  if (!firebaseReady) {
    if (millis() - lastReconnectTime > RECONNECT_INTERVAL) {
      Serial.println("⚠ Intentando reconectar a Firebase...");
      setupFirebase();
      lastReconnectTime = millis();
    }
    return;
  }

  // Procesar stream de asignación (devices/{deviceId}/assignedEquipmentId)
  if (millis() - lastStreamReadMs > 500) {
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
