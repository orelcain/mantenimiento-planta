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
      background: #f5f7fb;
      padding: 20px;
      color: #1f2937;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      color: #111827;
      margin-bottom: 6px;
      font-size: 1.6em;
      font-weight: 700;
    }
    .meta {
      text-align: center;
      color: #6b7280;
      margin-bottom: 16px;
      font-size: 0.9em;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
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
    .range-bar {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .zoom-controls { display: flex; gap: 8px; }
    .range-btn {
      border: 1px solid #c7d2fe;
      background: #eef2ff;
      color: #3730a3;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 0.85em;
      cursor: pointer;
    }
    .range-btn.active {
      background: #4f46e5;
      color: #fff;
      border-color: #4f46e5;
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
    <h1>ESP32 Sensor Dashboard</h1>
    <div class="meta">
      Device: <b id="deviceId">--</b> · Equipo: <b id="equipment">--</b> · Ruta: <b id="equipmentPath">--</b> · Última: <b id="lastUpdate">--</b>
    </div>

    <div class="grid">
      <div class="chart-card">
        <div class="range-bar">
          <div>
            <button class="range-btn active" data-range="1h">1 h</button>
            <button class="range-btn" data-range="6h">6 h</button>
            <button class="range-btn" data-range="24h">24 h</button>
            <button class="range-btn" data-range="all">Todo</button>
          </div>
          <div class="zoom-controls">
            <button class="range-btn" id="zoomOut">Y−</button>
            <button class="range-btn" id="zoomIn">Y+</button>
          </div>
        </div>
        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>Temperatura (°C)</div>
          <div class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>Humedad (%)</div>
        </div>
        <canvas id="chart1"></canvas>
        <div class="axis-range">
          <span><span class="label">Y</span> <span id="rangeTemp">--</span> · <span id="rangeHum">--</span></span>
          <span><span class="label">X</span> <span id="rangeX">--</span></span>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-value" id="statCurrent">--</div>
            <div class="stat-label">Temp actual</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="statMax">--</div>
            <div class="stat-label">Temp máx</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="statMin">--</div>
            <div class="stat-label">Temp mín</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="humCurrent">--</div>
            <div class="stat-label">Hum actual</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="humMax">--</div>
            <div class="stat-label">Hum máx</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="humMin">--</div>
            <div class="stat-label">Hum mín</div>
          </div>
        </div>
        <div class="axis-range" style="margin-top:10px">
          <span><span class="label">Histórico</span> <span id="historyCount">--</span></span>
          <span><span class="label">Ventana</span> Últimas 100 lecturas</span>
        </div>
      </div>
    </div>

    <div class="footer">Actualización automática cada 5 segundos</div>
  </div>

  <script>
    const chart1Canvas = document.getElementById('chart1');
    let currentRange = '1h';
    let yZoom = 1.0;

    function prepareCanvas(canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w: rect.width, h: rect.height };
    }

    function drawGrid(ctx, pad, plotW, plotH) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      const rows = 4;
      for (let i = 0; i <= rows; i++) {
        const y = pad.top + (plotH / rows) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    function drawSeries(ctx, pad, plotW, plotH, data, color, min, max) {
      if (!data.length) return;
      const span = max - min || 1;
      const step = plotW / Math.max(1, data.length - 1);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = pad.left + i * step;
        const y = pad.top + (1 - (v - min) / span) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    function drawAxesLabels(ctx, pad, plotW, plotH, tMin, tMax, hMin, hMax, startLabel, midLabel, endLabel) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Arial';

      const tMid = (tMin + tMax) / 2;
      const hMid = (hMin + hMax) / 2;

      ctx.textAlign = 'right';
      ctx.fillText(tMax.toFixed(1) + '°C', pad.left - 6, pad.top + 10);
      ctx.fillText(tMid.toFixed(1) + '°C', pad.left - 6, pad.top + plotH / 2 + 4);
      ctx.fillText(tMin.toFixed(1) + '°C', pad.left - 6, pad.top + plotH - 2);

      ctx.textAlign = 'left';
      ctx.fillText(hMax.toFixed(0) + '%', pad.left + plotW + 6, pad.top + 10);
      ctx.fillText(hMid.toFixed(0) + '%', pad.left + plotW + 6, pad.top + plotH / 2 + 4);
      ctx.fillText(hMin.toFixed(0) + '%', pad.left + plotW + 6, pad.top + plotH - 2);

      ctx.textAlign = 'left';
      ctx.fillText(startLabel, pad.left, pad.top + plotH + 14);
      ctx.textAlign = 'center';
      ctx.fillText(midLabel, pad.left + plotW / 2, pad.top + plotH + 14);
      ctx.textAlign = 'right';
      ctx.fillText(endLabel, pad.left + plotW, pad.top + plotH + 14);
    }

    function renderDual(canvas, temp, hum, labels) {
      const { ctx, w, h } = prepareCanvas(canvas);
      const pad = { left: 36, right: 36, top: 12, bottom: 22 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      ctx.clearRect(0, 0, w, h);
      drawGrid(ctx, pad, plotW, plotH);
      drawSeries(ctx, pad, plotW, plotH, temp, '#ef4444', labels.tempMin, labels.tempMax);
      drawSeries(ctx, pad, plotW, plotH, hum, '#3b82f6', labels.humMin, labels.humMax);

      drawAxesLabels(ctx, pad, plotW, plotH,
        labels.tempMin, labels.tempMax,
        labels.humMin, labels.humMax,
        labels.startLabel, labels.midLabel, labels.endLabel
      );
    }

    function filterByRange(data) {
      if (currentRange === 'all') return data;
      const now = Date.now();
      const ranges = { '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000, '24h': 24 * 60 * 60 * 1000 };
      const windowMs = ranges[currentRange] || ranges['1h'];
      return data.filter(d => (now - d.timestamp) <= windowMs);
    }

    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.range) return;
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.range;
        updateData();
      });
    });

    document.getElementById('zoomIn').addEventListener('click', () => {
      yZoom = Math.min(4, yZoom * 1.25);
      updateData();
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
      yZoom = Math.max(0.5, yZoom / 1.25);
      updateData();
    });

    function updateData() {
      fetch('/api/current')
        .then(r => r.json())
        .then(data => {
          document.getElementById('deviceId').textContent = data.deviceId;
          document.getElementById('equipment').textContent = data.equipmentId || 'Sin asignar';
          document.getElementById('equipmentPath').textContent = data.equipmentPath || 'Sin ruta';
          document.getElementById('lastUpdate').textContent = new Date(data.timestamp).toLocaleString('es-ES');
        })
        .catch(() => {});

      fetch('/api/history')
        .then(r => r.json())
        .then(data => {
          const filtered = filterByRange(data);
          const temps = filtered.map(d => d.temperature);
          const hums = filtered.map(d => d.humidity);

          const startTs = filtered.length ? filtered[0].timestamp : 0;
          const endTs = filtered.length ? filtered[filtered.length - 1].timestamp : 0;
          const midTs = filtered.length ? filtered[Math.floor(filtered.length / 2)].timestamp : 0;
          const startLabel = startTs ? new Date(startTs).toLocaleTimeString('es-ES') : '--';
          const midLabel = midTs ? new Date(midTs).toLocaleTimeString('es-ES') : '--';
          const endLabel = endTs ? new Date(endTs).toLocaleTimeString('es-ES') : '--';

          const rawTempMin = temps.length ? Math.min(...temps) : 0;
          const rawTempMax = temps.length ? Math.max(...temps) : 0;
          const rawHumMin = hums.length ? Math.min(...hums) : 0;
          const rawHumMax = hums.length ? Math.max(...hums) : 0;

          const tempCenter = (rawTempMin + rawTempMax) / 2;
          const tempSpan = (rawTempMax - rawTempMin) || 1;
          const tempSpanZoom = tempSpan / yZoom;
          const tempMin = tempCenter - tempSpanZoom / 2;
          const tempMax = tempCenter + tempSpanZoom / 2;

          const humCenter = (rawHumMin + rawHumMax) / 2;
          const humSpan = (rawHumMax - rawHumMin) || 1;
          const humSpanZoom = humSpan / yZoom;
          const humMin = humCenter - humSpanZoom / 2;
          const humMax = humCenter + humSpanZoom / 2;

          renderDual(chart1Canvas, temps, hums, {
            tempMin, tempMax,
            humMin, humMax,
            startLabel, midLabel, endLabel
          });

          if (temps.length > 0) {
            const current = temps[temps.length - 1];
            const max = Math.max(...temps);
            const min = Math.min(...temps);
            document.getElementById('statCurrent').textContent = current.toFixed(1) + '°C';
            document.getElementById('statMax').textContent = max.toFixed(1) + '°C';
            document.getElementById('statMin').textContent = min.toFixed(1) + '°C';

            document.getElementById('rangeTemp').textContent = 'Temp ' + min.toFixed(1) + '–' + max.toFixed(1) + ' °C';
          }

          if (hums.length > 0) {
            const maxH = Math.max(...hums);
            const minH = Math.min(...hums);
            document.getElementById('rangeHum').textContent = 'Hum ' + minH.toFixed(0) + '–' + maxH.toFixed(0) + ' %';
            const currentH = hums[hums.length - 1];
            document.getElementById('humCurrent').textContent = currentH.toFixed(0) + '%';
            document.getElementById('humMax').textContent = maxH.toFixed(0) + '%';
            document.getElementById('humMin').textContent = minH.toFixed(0) + '%';
          }

          if (filtered.length > 0) {
            const startTs = filtered[0].timestamp;
            const endTs = filtered[filtered.length - 1].timestamp;
            const start = new Date(startTs).toLocaleTimeString('es-ES');
            const end = new Date(endTs).toLocaleTimeString('es-ES');
            document.getElementById('rangeX').textContent = start + ' – ' + end;
          } else {
            document.getElementById('rangeX').textContent = 'Sin datos';
          }

          document.getElementById('historyCount').textContent = filtered.length + ' lecturas';
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
