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

// ============ FUNCIONES PÚBLICAS ============
void setupLocalWebServer();
void handleLocalWebServer();
void addTelemetryReading(uint64_t ts, float temp, float hum, String tempSt, String humSt, bool sim);

// ============ PÁGINA HTML EMBEBIDA ============
const char HTML_DASHBOARD[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 - Dashboard Local</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      color: white;
      margin-bottom: 10px;
      font-size: 2.4em;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .meta {
      text-align: center;
      color: rgba(255,255,255,0.9);
      margin-bottom: 20px;
      font-size: 0.95em;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
      gap: 25px;
    }
    .chart-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transition: transform 0.3s;
    }
    .chart-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 36px rgba(0,0,0,0.3);
    }
    .chart-title {
      font-size: 1.3em;
      font-weight: 600;
      margin-bottom: 15px;
      color: #667eea;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      background: #667eea;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.7em;
      font-weight: 500;
    }
    canvas { max-height: 300px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 15px;
    }
    .stat {
      text-align: center;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .stat-value {
      font-size: 1.5em;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      font-size: 0.85em;
      color: #666;
      margin-top: 4px;
    }
    .footer {
      text-align: center;
      margin-top: 16px;
      color: rgba(255,255,255,0.85);
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 ESP32 Sensor Dashboard</h1>
    <div class="meta">
      Device: <b id="deviceId">--</b> · Equipo: <b id="equipment">--</b> · Última: <b id="lastUpdate">--</b>
    </div>

    <div class="grid">
      <div class="chart-card">
        <div class="chart-title">
          1. Línea de Tiempo Clásica
          <span class="badge">Básico</span>
        </div>
        <canvas id="chart1"></canvas>
        <div class="stats">
          <div class="stat">
            <div class="stat-value" id="statCurrent">--</div>
            <div class="stat-label">Actual</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="statMax">--</div>
            <div class="stat-label">Máx</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="statMin">--</div>
            <div class="stat-label">Mín</div>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">
          2. Área Suavizada con Gradiente
          <span class="badge">Premium</span>
        </div>
        <canvas id="chart2"></canvas>
      </div>

      <div class="chart-card">
        <div class="chart-title">
          3. Doble Eje (Temperatura + Humedad)
          <span class="badge">Recomendado</span>
        </div>
        <canvas id="chart3"></canvas>
      </div>
    </div>

    <div class="footer">Actualización automática cada 5 segundos</div>
  </div>

  <script>
    const chart1 = new Chart(document.getElementById('chart1').getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{
        label: 'Temperatura (°C)',
        data: [],
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        tension: 0.25,
        fill: true
      }]} ,
      options: { responsive: true, maintainAspectRatio: false }
    });

    const chart2 = new Chart(document.getElementById('chart2').getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{
        label: 'Temperatura (°C)',
        data: [],
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.25)',
        tension: 0.4,
        fill: true
      }]} ,
      options: { responsive: true, maintainAspectRatio: false }
    });

    const chart3 = new Chart(document.getElementById('chart3').getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Temperatura (°C)', data: [], borderColor: '#ef4444', yAxisID: 'y', tension: 0.35 },
          { label: 'Humedad (%)', data: [], borderColor: '#3b82f6', yAxisID: 'y1', tension: 0.35 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left' },
          y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
        }
      }
    });

    function updateData() {
      fetch('/api/current')
        .then(r => r.json())
        .then(data => {
          document.getElementById('deviceId').textContent = data.deviceId;
          document.getElementById('equipment').textContent = data.equipmentId || 'Sin asignar';
          document.getElementById('lastUpdate').textContent = new Date(data.timestamp).toLocaleString('es-ES');
        })
        .catch(() => {});

      fetch('/api/history')
        .then(r => r.json())
        .then(data => {
          const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString('es-ES'));
          const temps = data.map(d => d.temperature);
          const hums = data.map(d => d.humidity);

          chart1.data.labels = labels;
          chart1.data.datasets[0].data = temps;
          chart1.update('none');

          chart2.data.labels = labels;
          chart2.data.datasets[0].data = temps;
          chart2.update('none');

          chart3.data.labels = labels;
          chart3.data.datasets[0].data = temps;
          chart3.data.datasets[1].data = hums;
          chart3.update('none');

          if (temps.length > 0) {
            const current = temps[temps.length - 1];
            const max = Math.max(...temps);
            const min = Math.min(...temps);
            document.getElementById('statCurrent').textContent = current.toFixed(1) + '°C';
            document.getElementById('statMax').textContent = max.toFixed(1) + '°C';
            document.getElementById('statMin').textContent = min.toFixed(1) + '°C';
          }
        })
        .catch(() => {});
    }

    updateData();
    setInterval(updateData, 5000);
  </script>
</body>
</html>
)rawliteral";

#endif
