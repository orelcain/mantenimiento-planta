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
    .legend {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin: 6px 0 10px;
      font-size: 0.9em;
      color: #555;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-dot { width: 12px; height: 4px; border-radius: 4px; display: inline-block; }
    canvas { width: 100%; height: 260px; display: block; }
    .axis-range {
      display: flex;
      justify-content: space-between;
      font-size: 0.85em;
      color: #666;
      margin-top: 6px;
    }
    .axis-range .label { font-weight: 600; color: #444; }
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
        <div class="chart-title">1. Línea de Tiempo Clásica</div>
        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>Temperatura (°C)</div>
        </div>
        <canvas id="chart1"></canvas>
        <div class="axis-range">
          <span><span class="label">Y</span> <span id="rangeTemp1">--</span></span>
          <span><span class="label">X</span> Tiempo (últimas lecturas)</span>
        </div>
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
        <div class="chart-title">2. Área Suavizada con Gradiente</div>
        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:#667eea"></span>Temperatura (°C)</div>
        </div>
        <canvas id="chart2"></canvas>
        <div class="axis-range">
          <span><span class="label">Y</span> <span id="rangeTemp2">--</span></span>
          <span><span class="label">X</span> Tiempo (últimas lecturas)</span>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">3. Doble Eje (Temperatura + Humedad)</div>
        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>Temperatura (°C)</div>
          <div class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>Humedad (%)</div>
        </div>
        <canvas id="chart3"></canvas>
        <div class="axis-range">
          <span><span class="label">Y</span> <span id="rangeTemp3">--</span> · <span id="rangeHum3">--</span></span>
          <span><span class="label">X</span> Tiempo (últimas lecturas)</span>
        </div>
      </div>
    </div>

    <div class="footer">Actualización automática cada 5 segundos</div>
  </div>

  <script>
    const chart1Canvas = document.getElementById('chart1');
    const chart2Canvas = document.getElementById('chart2');
    const chart3Canvas = document.getElementById('chart3');

    function prepareCanvas(canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w: rect.width, h: rect.height };
    }

    function drawGrid(ctx, w, h) {
      ctx.strokeStyle = '#eef0f5';
      ctx.lineWidth = 1;
      const rows = 4;
      for (let i = 1; i <= rows; i++) {
        const y = (h / (rows + 1)) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    function drawSeries(ctx, w, h, data, color, fillColor) {
      if (!data.length) return;
      const min = Math.min(...data);
      const max = Math.max(...data);
      const span = max - min || 1;
      const pad = 10;
      const step = w / Math.max(1, data.length - 1);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = i * step;
        const y = h - pad - ((v - min) / span) * (h - pad * 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (fillColor) {
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
    }

    function renderSingle(canvas, data, color, fillColor) {
      const { ctx, w, h } = prepareCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      drawGrid(ctx, w, h);
      drawSeries(ctx, w, h, data, color, fillColor);
    }

    function renderDual(canvas, temp, hum) {
      const { ctx, w, h } = prepareCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      drawGrid(ctx, w, h);
      drawSeries(ctx, w, h, temp, '#ef4444', null);
      drawSeries(ctx, w, h, hum, '#3b82f6', null);
    }

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

          renderSingle(chart1Canvas, temps, '#ef4444', 'rgba(239, 68, 68, 0.12)');
          renderSingle(chart2Canvas, temps, '#667eea', 'rgba(102, 126, 234, 0.25)');
          renderDual(chart3Canvas, temps, hums);

          if (temps.length > 0) {
            const current = temps[temps.length - 1];
            const max = Math.max(...temps);
            const min = Math.min(...temps);
            document.getElementById('statCurrent').textContent = current.toFixed(1) + '°C';
            document.getElementById('statMax').textContent = max.toFixed(1) + '°C';
            document.getElementById('statMin').textContent = min.toFixed(1) + '°C';

            document.getElementById('rangeTemp1').textContent = min.toFixed(1) + '–' + max.toFixed(1) + ' °C';
            document.getElementById('rangeTemp2').textContent = min.toFixed(1) + '–' + max.toFixed(1) + ' °C';
            document.getElementById('rangeTemp3').textContent = 'Temp ' + min.toFixed(1) + '–' + max.toFixed(1) + ' °C';
          }

          if (hums.length > 0) {
            const maxH = Math.max(...hums);
            const minH = Math.min(...hums);
            document.getElementById('rangeHum3').textContent = 'Hum ' + minH.toFixed(0) + '–' + maxH.toFixed(0) + ' %';
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
