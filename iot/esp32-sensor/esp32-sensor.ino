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
#include <DHT.h>
#include <time.h>
#include "config.h"

// Addons de Firebase (necesarios para tokens)
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ============ CONFIGURACIÓN DE HARDWARE ============
#define DHT_PIN 4        // GPIO4 (D4) - Pin de datos del DHT22
#define DHT_TYPE DHT22   // Tipo de sensor (DHT22 o DHT11)
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
DHT dht(DHT_PIN, DHT_TYPE);
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ============ VARIABLES DE ESTADO ============
unsigned long lastSendTime = 0;
unsigned long lastReconnectTime = 0;
bool firebaseReady = false;
int failedAttempts = 0;

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
  
  // Iniciar sensor DHT
  Serial.println("⏳ Inicializando sensor DHT22...");
  dht.begin();
  delay(2000); // DHT necesita tiempo para estabilizarse
  Serial.println("✓ Sensor DHT22 inicializado");
  
  // Conectar a WiFi
  connectWiFi();
  
  // Configurar Firebase
  setupFirebase();
  
  // Configurar hora (NTP)
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  
  Serial.println();
  Serial.println("✓ Sistema listo!");
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.println();
}

// ============ FUNCIÓN: CONECTAR WiFi ============
void connectWiFi() {
  Serial.print("⏳ Conectando a WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Parpadear LED
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH); // LED encendido = conectado
    Serial.println();
    Serial.println("✓ WiFi conectado!");
    Serial.print("  IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("  Señal: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println();
    Serial.println("✗ Error: No se pudo conectar al WiFi");
    Serial.println("  Verifica SSID y contraseña en config.h");
  }
}

// ============ FUNCIÓN: CONFIGURAR FIREBASE ============
void setupFirebase() {
  Serial.println("⏳ Configurando Firebase...");
  
  // Configurar credenciales
  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_DATABASE_URL;
  
  // Configurar autenticación anónima
  Serial.println("  Autenticando...");
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("✓ Autenticación exitosa");
  } else {
    Serial.printf("✗ Error de autenticación: %s\n", config.signer.signupError.message.c_str());
  }
  
  // Callback de token
  config.token_status_callback = tokenStatusCallback;
  
  // Configurar reconexión automática
  Firebase.reconnectWiFi(true);
  
  // Iniciar Firebase
  Firebase.begin(&config, &auth);
  
  // Esperar a que el token esté listo
  Serial.println("  Esperando token...");
  int waitCount = 0;
  while (!Firebase.ready() && waitCount < 30) {
    delay(1000);
    Serial.print(".");
    waitCount++;
  }
  
  if (Firebase.ready()) {
    Serial.println();
    Serial.println("✓ Firebase conectado!");
    firebaseReady = true;
    
    // Enviar estado inicial
    sendOnlineStatus(true);
  } else {
    Serial.println();
    Serial.println("✗ Error: No se pudo conectar a Firebase");
    Serial.println("  Verifica API_KEY y DATABASE_URL en config.h");
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
unsigned long getTimestamp() {
  time_t now;
  time(&now);
  return (unsigned long)now * 1000; // Convertir a milisegundos
}

// ============ FUNCIÓN: ENVIAR ESTADO ONLINE ============
void sendOnlineStatus(bool online) {
  String path = "sensors/" + String(EQUIPMENT_ID) + "/online";
  Firebase.RTDB.setBool(&fbdo, path.c_str(), online);
  
  path = "sensors/" + String(EQUIPMENT_ID) + "/lastSeen";
  Firebase.RTDB.setInt(&fbdo, path.c_str(), getTimestamp());
  
  if (online) {
    path = "sensors/" + String(EQUIPMENT_ID) + "/equipmentId";
    Firebase.RTDB.setString(&fbdo, path.c_str(), EQUIPMENT_ID);
  }
}

// ============ FUNCIÓN: ENVIAR DATOS DE SENSOR ============
void sendSensorData() {
  // Leer sensor DHT
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  
  // Verificar lecturas válidas
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("✗ Error: Lectura del sensor DHT falló");
    Serial.println("  Verifica las conexiones del sensor");
    failedAttempts++;
    
    // Si falla muchas veces, reiniciar
    if (failedAttempts > 10) {
      Serial.println("⚠ Demasiados errores, reiniciando ESP32...");
      delay(1000);
      ESP.restart();
    }
    return;
  }
  
  failedAttempts = 0; // Resetear contador de errores
  
  // Determinar estados
  String tempStatus = getStatus(temperature, TEMP_WARNING, TEMP_CRITICAL);
  String humStatus = getStatus(humidity, HUM_WARNING, HUM_CRITICAL);
  
  unsigned long timestamp = getTimestamp();
  
  // Mostrar en serial
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.printf("🌡️  Temperatura: %.1f°C [%s]\n", temperature, tempStatus.c_str());
  Serial.printf("💧  Humedad: %.1f%% [%s]\n", humidity, humStatus.c_str());
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  // Enviar a Firebase
  String basePath = "sensors/" + String(EQUIPMENT_ID);
  
  // Temperatura
  FirebaseJson tempJson;
  tempJson.set("value", temperature);
  tempJson.set("unit", "°C");
  tempJson.set("status", tempStatus);
  tempJson.set("timestamp", timestamp);
  
  if (Firebase.RTDB.setJSON(&fbdo, (basePath + "/temperatura").c_str(), &tempJson)) {
    Serial.println("✓ Temperatura enviada a Firebase");
  } else {
    Serial.printf("✗ Error temperatura: %s\n", fbdo.errorReason().c_str());
  }
  
  // Humedad
  FirebaseJson humJson;
  humJson.set("value", humidity);
  humJson.set("unit", "%");
  humJson.set("status", humStatus);
  humJson.set("timestamp", timestamp);
  
  if (Firebase.RTDB.setJSON(&fbdo, (basePath + "/humedad").c_str(), &humJson)) {
    Serial.println("✓ Humedad enviada a Firebase");
  } else {
    Serial.printf("✗ Error humedad: %s\n", fbdo.errorReason().c_str());
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
  // Verificar conexión WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠ WiFi desconectado, reconectando...");
    digitalWrite(LED_PIN, LOW);
    connectWiFi();
    if (WiFi.status() == WL_CONNECTED) {
      firebaseReady = true;
      setupFirebase();
    }
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
  
  // Enviar datos según intervalo
  if (millis() - lastSendTime > SEND_INTERVAL) {
    sendSensorData();
    lastSendTime = millis();
  }
  
  // Pequeño delay para no saturar el procesador
  delay(100);
}

// ============ CALLBACK: ESTADO DEL TOKEN ============
void tokenStatusCallback(TokenInfo info) {
  if (info.status == token_status_error) {
    Serial.printf("✗ Error de token: %s\n", info.error.message.c_str());
    firebaseReady = false;
  } else if (info.status == token_status_ready) {
    Serial.println("✓ Token listo");
    firebaseReady = true;
  }
}
