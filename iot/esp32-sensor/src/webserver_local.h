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
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #fff;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      margin-bottom: 30px;
      font-size: 2.5em;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(10px);
      border-radius: 15px;
      padding: 25px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      border: 1px solid rgba(255,255,255,0.18);
    }
    .card h2 {
      font-size: 1.2em;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .value {
      font-size: 3em;
      font-weight: bold;
      margin: 10px 0;
    }
    .unit {
      font-size: 0.5em;
      opacity: 0.8;
    }
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 0.9em;
      font-weight: bold;
      margin-top: 10px;
    }
    .status.normal { background: #10b981; }
    .status.warning { background: #f59e0b; }
    .status.critical { background: #ef4444; }
    .chart-container {
      background: rgba(255,255,255,0.95);
      border-radius: 15px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    }
    canvas {
      width: 100% !important;
      height: 400px !important;
    }
    .info {
      text-align: center;
      margin-top: 20px;
      opacity: 0.8;
      font-size: 0.9em;
    }
    .icon {
      font-size: 1.5em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🌡️ ESP32 Sensor Dashboard</h1>
    
    <div class="cards">
      <div class="card">
        <h2><span class="icon">🌡️</span> Temperatura</h2>
        <div class="value" id="temp">--</div>
        <div class="status" id="tempStatus">--</div>
      </div>
      <div class="card">
        <h2><span class="icon">💧</span> Humedad</h2>
        <div class="value" id="hum">--</div>
        <div class="status" id="humStatus">--</div>
      </div>
      <div class="card">
        <h2><span class="icon">📡</span> Información</h2>
        <div style="font-size: 0.9em; line-height: 1.8;">
          <div><strong>Device ID:</strong> <span id="deviceId">--</span></div>
          <div><strong>Equipo:</strong> <span id="equipment">Sin asignar</span></div>
          <div><strong>Última lectura:</strong> <span id="lastUpdate">--</span></div>
        </div>
      </div>
    </div>

    <div class="chart-container">
      <canvas id="telemetryChart"></canvas>
    </div>

    <div class="info">
      Actualización automática cada 5 segundos | ESP32 IoT System
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
    const ctx = document.getElementById('telemetryChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Temperatura (°C)',
            data: [],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            yAxisID: 'y',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Humedad (%)',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            yAxisID: 'y1',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Temperatura (°C)',
              color: '#ef4444',
              font: { size: 14, weight: 'bold' }
            },
            ticks: { color: '#666' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Humedad (%)',
              color: '#3b82f6',
              font: { size: 14, weight: 'bold' }
            },
            grid: { drawOnChartArea: false },
            ticks: { color: '#666' }
          },
          x: {
            ticks: { color: '#666' }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#333', font: { size: 14 } }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#666',
            borderWidth: 1
          }
        }
      }
    });

    function updateData() {
      fetch('/api/current')
        .then(r => r.json())
        .then(data => {
          document.getElementById('temp').innerHTML = data.temperature.toFixed(1) + '<span class="unit">°C</span>';
          document.getElementById('hum').innerHTML = data.humidity.toFixed(1) + '<span class="unit">%</span>';
          
          document.getElementById('tempStatus').textContent = data.tempStatus;
          document.getElementById('tempStatus').className = 'status ' + data.tempStatus.toLowerCase();
          
          document.getElementById('humStatus').textContent = data.humStatus;
          document.getElementById('humStatus').className = 'status ' + data.humStatus.toLowerCase();
          
          document.getElementById('deviceId').textContent = data.deviceId;
          document.getElementById('equipment').textContent = data.equipmentId || 'Sin asignar';
          document.getElementById('lastUpdate').textContent = new Date(data.timestamp).toLocaleString('es-ES');
        })
        .catch(err => console.error('Error fetching current:', err));

      fetch('/api/history')
        .then(r => r.json())
        .then(data => {
          const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString('es-ES'));
          const temps = data.map(d => d.temperature);
          const hums = data.map(d => d.humidity);

          chart.data.labels = labels;
          chart.data.datasets[0].data = temps;
          chart.data.datasets[1].data = hums;
          chart.update('none');
        })
        .catch(err => console.error('Error fetching history:', err));
    }

    // Actualizar cada 5 segundos
    updateData();
    setInterval(updateData, 5000);
  </script>
</body>
</html>
)rawliteral";

#endif
