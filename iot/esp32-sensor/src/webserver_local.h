/*
 * Servidor Web Local para ESP32
 * Dashboard de telemetría con gráficos en tiempo real
 * Accesible via WiFi AP (192.168.4.1) o IP local
 */

#ifndef WEBSERVER_LOCAL_H
#define WEBSERVER_LOCAL_H

#include <WebServer.h>
#include <Arduino.h>

// ============ CONFIGURACIÓN ============
#define LOCAL_WEB_SERVER_PORT 80
#define TELEMETRY_HISTORY_SIZE 100 // Últimas 100 lecturas en RAM

// ============ SERVIDOR Y DATOS ============
// NOTA: Usamos portalServer de main.cpp (puerto 80 compartido)
extern WebServer portalServer;

// Estructura para histórico de lecturas
struct TelemetryReading {
  uint64_t timestamp;
  float temperature;
  float humidity;
  String tempStatus;
  String humStatus;
  bool simulated;
};

// Histórico circular en RAM
extern TelemetryReading telemetryHistory[TELEMETRY_HISTORY_SIZE];
extern uint16_t telemetryIndex;
extern uint16_t telemetryCount;

// Funciones externas del main.cpp para intervalo e histórico flash
extern uint16_t getSendIntervalSeconds();
extern void setSendIntervalSeconds(uint16_t sec);
extern uint32_t getFlashHistoryCount();
extern bool getFlashReading(uint32_t index, uint64_t& ts, float& temp, float& hum, uint8_t& tempSt, uint8_t& humSt, bool& sim);

// ============ UMBRALES DE ALERTA (TEMP/HUM) ============
struct AlertThresholds {
  float tempWarnLow;
  float tempWarnHigh;
  float tempCritLow;
  float tempCritHigh;
  float humWarnLow;
  float humWarnHigh;
  float humCritLow;
  float humCritHigh;
};

AlertThresholds getAlertThresholds();
bool setAlertThresholds(const AlertThresholds& t);

// ============ FUNCIONES PÚBLICAS ============
void setupLocalWebServer();
void handleLocalWebServer();
void addTelemetryReading(uint64_t ts, float temp, float hum, String tempSt, String humSt, bool sim);

// ============ PÁGINA HTML EMBEBIDA (LIVIANA) ============
const char HTML_DASHBOARD[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ESP32 - Lecturas Locales</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial;margin:16px;color:#111827}
    .card{max-width:420px;border:1px solid #e5e7eb;border-radius:12px;padding:16px}
    .row{display:flex;justify-content:space-between;margin:6px 0}
    .muted{color:#6b7280;font-size:0.9em}
    .btn{display:inline-block;margin-top:12px;background:#2563eb;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none}
  </style>
</head>
<body>
  <h2>ESP32 - Lecturas Locales</h2>
  <div class="card">
    <div class="row"><strong>Temperatura</strong><span id="t">--</span></div>
    <div class="row"><strong>Humedad</strong><span id="h">--</span></div>
    <div class="row"><strong>Estado</strong><span id="s">--</span></div>
    <div class="row muted">Última lectura: <span id="ts">--</span></div>
  </div>
  <div class="card" style="margin-top:10px">
    <div class="row"><strong>WiFi</strong><span id="wifi">--</span></div>
    <div class="row"><strong>SSID</strong><span id="ssid">--</span></div>
    <div class="row"><strong>IP</strong><span id="ip">--</span></div>
    <div class="row"><strong>RSSI</strong><span id="rssi">--</span></div>
  </div>
  <a class="btn" href="/status.json">Ver estado JSON</a>
  <script>
    async function load(){
      try{
        const r=await fetch('/api/current',{cache:'no-store'});
        if(!r.ok) return;
        const d=await r.json();
        document.getElementById('t').textContent = (d.temperature ?? '--') + ' °C';
        document.getElementById('h').textContent = (d.humidity ?? '--') + ' %';
        document.getElementById('s').textContent = `${d.tempStatus || '--'} / ${d.humStatus || '--'}`;
        document.getElementById('ts').textContent = d.timestamp ? new Date(d.timestamp).toLocaleString('es-ES') : '--';
      }catch(e){}

      try{
        const r2=await fetch('/status.json',{cache:'no-store'});
        if(!r2.ok) return;
        const s=await r2.json();
        document.getElementById('wifi').textContent = s.wifiConnected ? 'Conectado' : 'Desconectado';
        document.getElementById('ssid').textContent = s.ssid || '--';
        document.getElementById('ip').textContent = s.ip || '--';
        document.getElementById('rssi').textContent = (s.rssi ?? '--') + ' dBm';
      }catch(e){}
    }
    load();
    setInterval(load, 5000);
  </script>
</body>
</html>
)rawliteral";

#endif
