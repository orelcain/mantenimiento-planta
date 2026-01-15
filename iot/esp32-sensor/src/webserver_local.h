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

// ============ PÁGINA HTML EMBEBIDA ============
const char HTML_DASHBOARD[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>ESP32 - Dashboard Local</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fb;
      padding: 12px;
      color: #1f2937;
      font-size: 14px;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 {
      text-align: center;
      color: #111827;
      margin-bottom: 4px;
      font-size: 1.3em;
      font-weight: 700;
    }
    .meta {
      text-align: center;
      color: #6b7280;
      margin-bottom: 10px;
      font-size: 0.75em;
      line-height: 1.4;
    }
    .chart-card {
      background: white;
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .range-bar {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
    .range-btn {
      border: 1px solid #c7d2fe;
      background: #eef2ff;
      color: #3730a3;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 0.75em;
      cursor: pointer;
      touch-action: manipulation;
    }
    .range-btn.active {
      background: #4f46e5;
      color: #fff;
      border-color: #4f46e5;
    }
    .range-btn.reset { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
    .range-btn.nav { background: #ecfeff; border-color: #a5f3fc; color: #0e7490; }
    .legend {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin: 4px 0 6px;
      font-size: 0.75em;
      color: #555;
    }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-dot { width: 10px; height: 3px; border-radius: 3px; display: inline-block; }
    .chart-container { position: relative; }
    canvas { width: 100%; height: 180px; display: block; touch-action: none; }
    .tooltip {
      position: absolute;
      background: rgba(0,0,0,0.85);
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.75em;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 10;
      white-space: nowrap;
    }
    .tooltip.visible { opacity: 1; }
    .crosshair {
      position: absolute;
      width: 1px;
      background: rgba(17, 24, 39, 0.5);
      top: 0;
      bottom: 0;
      opacity: 0;
      z-index: 6;
    }
    .dot {
      position: absolute;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      opacity: 0;
      z-index: 7;
      border: 1px solid #fff;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
    }
    .dot.temp { background: #ef4444; }
    .dot.hum { background: #3b82f6; }
    .crosshair.visible, .dot.visible { opacity: 1; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-top: 10px;
    }
    .stat {
      text-align: center;
      padding: 6px;
      background: #f8f9fa;
      border-radius: 6px;
    }
    .stat-value {
      font-size: 1.2em;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      font-size: 0.7em;
      color: #666;
      margin-top: 2px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.7em;
      color: #666;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
    }
    .time-controls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 8px;
      font-size: 0.75em;
      color: #475569;
    }
    .time-controls label { font-weight: 600; }
    .time-controls input, .time-controls select {
      padding: 4px 6px;
      border: 1px solid #cbd5f5;
      border-radius: 6px;
      font-size: 1em;
      background: #fff;
    }
    .time-controls button {
      padding: 4px 10px;
      border: none;
      border-radius: 6px;
      background: #6366f1;
      color: #fff;
      cursor: pointer;
      font-size: 0.9em;
    }
    .config-section {
      margin-top: 10px;
      padding: 10px;
      background: #f0f9ff;
      border-radius: 6px;
      border: 1px solid #bae6fd;
    }
    .config-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 0.8em;
    }
    .config-row label { font-weight: 500; color: #0369a1; }
    .config-row input[type="number"] {
      width: 60px;
      padding: 4px 6px;
      border: 1px solid #7dd3fc;
      border-radius: 4px;
      font-size: 1em;
    }
    .config-row input.mini {
      width: 52px;
    }
    .config-row button {
      padding: 4px 10px;
      background: #0284c7;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9em;
    }
    .config-info { font-size: 0.75em; color: #64748b; margin-top: 4px; }
    .footer {
      text-align: center;
      margin-top: 10px;
      color: #6b7280;
      font-size: 0.7em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>ESP32 Sensor</h1>
    <div class="meta">
      <div>Device: <b id="deviceId">--</b> · Equipo: <b id="equipment">--</b></div>
      <div>Ruta: <b id="equipmentPath">--</b></div>
      <div>Última: <b id="lastUpdate">--</b></div>
    </div>

    <div class="chart-card">
      <div class="range-bar">
        <div class="btn-group">
          <button class="range-btn active" data-range="1h">1h</button>
          <button class="range-btn" data-range="6h">6h</button>
          <button class="range-btn" data-range="24h">24h</button>
          <button class="range-btn" data-range="all">Todo</button>
        </div>
        <div class="btn-group">
          <button class="range-btn nav" id="xBack">◀︎</button>
          <button class="range-btn nav" id="xForward">▶︎</button>
          <button class="range-btn nav" id="xNow">Ahora</button>
        </div>
        <div class="btn-group">
          <button class="range-btn" id="zoomOut">Y−</button>
          <button class="range-btn" id="zoomIn">Y+</button>
          <button class="range-btn reset" id="zoomReset">100%</button>
        </div>
      </div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>Temp (°C)</div>
        <div class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>Hum (%)</div>
      </div>
      <div class="chart-container">
        <canvas id="chart1"></canvas>
        <div class="tooltip" id="tooltip"></div>
        <div class="crosshair" id="crosshair"></div>
        <div class="dot temp" id="dotTemp"></div>
        <div class="dot hum" id="dotHum"></div>
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
      <div class="info-row">
        <span>Histórico: <span id="historyCount">--</span></span>
        <span>Ventana: <span id="timeWindow">--</span> · Offset: <span id="timeOffset">0</span></span>
      </div>
      <div class="time-controls">
        <label>Ventana (min)</label>
        <input type="number" id="windowInput" min="0" step="5" value="0">
        <label>Muestras</label>
        <input type="number" id="samplesInput" min="50" max="2000" step="50" value="0">
        <label>Fuente</label>
        <select id="sourceSelect">
          <option value="auto">Auto</option>
          <option value="ram">RAM</option>
          <option value="flash">Flash</option>
        </select>
        <button onclick="applyTimeControls()">Aplicar</button>
      </div>
      
      <div class="config-section">
        <div class="config-row">
          <label>Intervalo:</label>
          <input type="number" id="intervalInput" min="5" max="300" value="10">
          <span>seg</span>
          <button onclick="updateInterval()">OK</button>
        </div>
        <div class="config-row">
          <label>Temp (°C)</label>
          <span title="Advertencia mínima (baja temperatura)">Wmin</span><input type="number" step="0.1" id="tempWarnLow" class="mini" title="Advertencia mínima: si baja de aquí, warning">
          <span title="Advertencia máxima (alta temperatura)">Wmax</span><input type="number" step="0.1" id="tempWarnHigh" class="mini" title="Advertencia máxima: si supera aquí, warning">
          <span title="Crítico mínimo (baja temperatura)">Cmin</span><input type="number" step="0.1" id="tempCritLow" class="mini" title="Crítico mínimo: si baja de aquí, critical">
          <span title="Crítico máximo (alta temperatura)">Cmax</span><input type="number" step="0.1" id="tempCritHigh" class="mini" title="Crítico máximo: si supera aquí, critical">
        </div>
        <div class="config-row">
          <label>Hum (%)</label>
          <span title="Advertencia mínima (baja humedad)">Wmin</span><input type="number" step="0.1" id="humWarnLow" class="mini" title="Advertencia mínima: si baja de aquí, warning">
          <span title="Advertencia máxima (alta humedad)">Wmax</span><input type="number" step="0.1" id="humWarnHigh" class="mini" title="Advertencia máxima: si supera aquí, warning">
          <span title="Crítico mínimo (baja humedad)">Cmin</span><input type="number" step="0.1" id="humCritLow" class="mini" title="Crítico mínimo: si baja de aquí, critical">
          <span title="Crítico máximo (alta humedad)">Cmax</span><input type="number" step="0.1" id="humCritHigh" class="mini" title="Crítico máximo: si supera aquí, critical">
          <button onclick="updateThresholds()">Alertas</button>
        </div>
        <div class="config-info">
          <span id="capacityInfo">--</span> · Flash: <span id="flashInfo">--</span>
        </div>
      </div>
    </div>

    <div class="footer">Auto-refresh · Intervalo: <span id="footerInterval">--</span>s</div>
  </div>

  <script>
    const chart1Canvas = document.getElementById('chart1');
    const tooltip = document.getElementById('tooltip');
    const crosshair = document.getElementById('crosshair');
    const dotTemp = document.getElementById('dotTemp');
    const dotHum = document.getElementById('dotHum');
    let currentRange = '1h';
    let yZoom = 1.0;
    let chartData = { temps: [], hums: [], filtered: [], tsMin: 0, tsMax: 0 };
    let chartLabels = {};
    let pad = { left: 38, right: 32, top: 10, bottom: 18 };
    let xOffsetMs = 0;
    let sendIntervalSeconds = 10;
    let windowOverrideMs = 0;
    let samplesLimitOverride = 0;
    let sourceMode = 'auto';
    let flashHistoryCount = 0;
    let ramHistoryCount = 0;
    let thresholds = {
      tempWarnLow: null,
      tempWarnHigh: null,
      tempCritLow: null,
      tempCritHigh: null,
      humWarnLow: null,
      humWarnHigh: null,
      humCritLow: null,
      humCritHigh: null
    };

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
      ctx.setLineDash([4, 4]);
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    function drawThresholdLine(ctx, pad, plotW, plotH, value, min, max, color, label, alignRight) {
      if (value === null || value === undefined) return;
      if (value < min || value > max) return;
      const span = max - min || 1;
      const y = pad.top + (1 - (value - min) / span) * plotH;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = alignRight ? 'right' : 'left';
      ctx.fillText(label, alignRight ? (pad.left + plotW - 2) : (pad.left + 2), y - 2);
      ctx.restore();
    }

    function drawThresholds(ctx, pad, plotW, plotH, labels) {
      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.tempWarnLow, labels.tempMin, labels.tempMax, '#f59e0b', 'T W−', false);
      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.tempWarnHigh, labels.tempMin, labels.tempMax, '#f59e0b', 'T W+', false);
      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.tempCritLow, labels.tempMin, labels.tempMax, '#dc2626', 'T C−', false);
      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.tempCritHigh, labels.tempMin, labels.tempMax, '#dc2626', 'T C+', false);

      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.humWarnLow, labels.humMin, labels.humMax, '#60a5fa', 'H W−', true);
      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.humWarnHigh, labels.humMin, labels.humMax, '#60a5fa', 'H W+', true);
      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.humCritLow, labels.humMin, labels.humMax, '#2563eb', 'H C−', true);
      drawThresholdLine(ctx, pad, plotW, plotH, thresholds.humCritHigh, labels.humMin, labels.humMax, '#2563eb', 'H C+', true);
    }

    function drawSeriesTime(ctx, pad, plotW, plotH, readings, getVal, color, min, max, tsMin, tsMax) {
      if (!readings.length) return;
      const span = max - min || 1;
      const tsSpan = tsMax - tsMin || 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      readings.forEach((r, i) => {
        const v = getVal(r);
        const x = pad.left + ((r.timestamp - tsMin) / tsSpan) * plotW;
        let norm = (v - min) / span;
        norm = Math.max(0, Math.min(1, norm));
        const y = pad.top + (1 - norm) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    function drawAxesLabels(ctx, pad, plotW, plotH, tMin, tMax, hMin, hMax, startLabel, midLabel, endLabel, curTemp, curHum) {
      ctx.font = '10px system-ui, sans-serif';
      const tMid = (tMin + tMax) / 2;
      const hMid = (hMin + hMax) / 2;

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ef4444';
      ctx.fillText(tMax.toFixed(1), pad.left - 3, pad.top + 8);
      ctx.fillText(tMid.toFixed(1), pad.left - 3, pad.top + plotH / 2 + 3);
      ctx.fillText(tMin.toFixed(1), pad.left - 3, pad.top + plotH - 2);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#3b82f6';
      ctx.fillText(hMax.toFixed(0), pad.left + plotW + 3, pad.top + 8);
      ctx.fillText(hMid.toFixed(0), pad.left + plotW + 3, pad.top + plotH / 2 + 3);
      ctx.fillText(hMin.toFixed(0), pad.left + plotW + 3, pad.top + plotH - 2);

      // Marcas dinámicas de valor actual
      if (typeof curTemp === 'number') {
        const tSpan = (tMax - tMin) || 1;
        const tY = pad.top + (1 - (curTemp - tMin) / tSpan) * plotH;
        if (tY >= pad.top && tY <= pad.top + plotH) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pad.left - 4, tY);
          ctx.lineTo(pad.left - 1, tY);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.textAlign = 'right';
          ctx.fillText(curTemp.toFixed(1), pad.left - 6, tY + 3);
        }
      }
      if (typeof curHum === 'number') {
        const hSpan = (hMax - hMin) || 1;
        const hY = pad.top + (1 - (curHum - hMin) / hSpan) * plotH;
        if (hY >= pad.top && hY <= pad.top + plotH) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pad.left + plotW + 1, hY);
          ctx.lineTo(pad.left + plotW + 4, hY);
          ctx.stroke();
          ctx.fillStyle = '#3b82f6';
          ctx.textAlign = 'left';
          ctx.fillText(curHum.toFixed(0), pad.left + plotW + 6, hY + 3);
        }
      }

      ctx.fillStyle = '#9ca3af';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(startLabel, pad.left, pad.top + plotH + 12);
      ctx.textAlign = 'center';
      ctx.fillText(midLabel, pad.left + plotW / 2, pad.top + plotH + 12);
      ctx.textAlign = 'right';
      ctx.fillText(endLabel, pad.left + plotW, pad.top + plotH + 12);
    }

    function renderDual(canvas, readings, labels) {
      const { ctx, w, h } = prepareCanvas(canvas);
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;
      ctx.clearRect(0, 0, w, h);
      drawGrid(ctx, pad, plotW, plotH);
      drawThresholds(ctx, pad, plotW, plotH, labels);
      drawSeriesTime(ctx, pad, plotW, plotH, readings, r => r.temperature, '#ef4444', labels.tempMin, labels.tempMax, labels.tsMin, labels.tsMax);
      drawSeriesTime(ctx, pad, plotW, plotH, readings, r => r.humidity, '#3b82f6', labels.humMin, labels.humMax, labels.tsMin, labels.tsMax);
      const cur = readings.length ? readings[readings.length - 1] : null;
      drawAxesLabels(ctx, pad, plotW, plotH,
        labels.tempMin, labels.tempMax,
        labels.humMin, labels.humMax,
        labels.startLabel, labels.midLabel, labels.endLabel,
        cur ? cur.temperature : null,
        cur ? cur.humidity : null
      );
    }

    function getWindowMs() {
      if (windowOverrideMs > 0) return windowOverrideMs;
      if (currentRange === 'all') return 0;
      const ranges = { '1h': 3600000, '6h': 21600000, '24h': 86400000 };
      return ranges[currentRange] || 3600000;
    }

    function filterByRange(data, windowMs, offsetMs) {
      if (!windowMs) return data;
      const windowEnd = Date.now() - offsetMs;
      const windowStart = windowEnd - windowMs;
      return data.filter(d => d.timestamp >= windowStart && d.timestamp <= windowEnd);
    }

    function formatSpan(ms) {
      if (!ms) return 'Todo';
      const totalMin = Math.round(ms / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      if (h > 0 && m > 0) return h + 'h ' + m + 'm';
      if (h > 0) return h + 'h';
      return m + 'm';
    }

    function formatOffset(ms) {
      if (!ms) return '0';
      return formatSpan(ms);
    }

    function applyTimeControls() {
      const windowMin = parseInt(document.getElementById('windowInput').value || '0');
      const samples = parseInt(document.getElementById('samplesInput').value || '0');
      const sourceSel = document.getElementById('sourceSelect').value;

      windowOverrideMs = windowMin > 0 ? windowMin * 60000 : 0;
      samplesLimitOverride = samples > 0 ? Math.min(2000, Math.max(50, samples)) : 0;
      sourceMode = sourceSel || 'auto';

      if (windowOverrideMs > 0) {
        currentRange = 'custom';
        document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      }
      xOffsetMs = 0;
      updateData();
    }
    }

    // Touch/Mouse hover para mostrar tooltip
    function handlePointer(e) {
      const rect = chart1Canvas.getBoundingClientRect();
      let clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const plotW = rect.width - pad.left - pad.right;
      const plotH = rect.height - pad.top - pad.bottom;
      
      if (x < pad.left || x > pad.left + plotW || y < pad.top || y > pad.top + plotH) {
        tooltip.classList.remove('visible');
        return;
      }
      
      const dataLen = chartData.filtered.length;
      if (dataLen === 0) return;
      
      const relX = x - pad.left;
      const tsSpan = (chartData.tsMax - chartData.tsMin) || 1;
      const targetTs = chartData.tsMin + (relX / plotW) * tsSpan;
      let nearest = chartData.filtered[0];
      let bestDelta = Math.abs(nearest.timestamp - targetTs);
      for (let i = 1; i < chartData.filtered.length; i++) {
        const d = Math.abs(chartData.filtered[i].timestamp - targetTs);
        if (d < bestDelta) {
          bestDelta = d;
          nearest = chartData.filtered[i];
        }
      }
      const reading = nearest;
      
      if (!reading) return;
      
      const time = new Date(reading.timestamp).toLocaleTimeString('es-ES');
      const date = new Date(reading.timestamp).toLocaleDateString('es-ES');
      tooltip.innerHTML = '<b>' + time + '</b> ' + date + '<br>🌡️ ' + reading.temperature.toFixed(1) + '°C · 💧 ' + reading.humidity.toFixed(0) + '%';
      
      // Posicionar tooltip
      let tx = clientX - rect.left + 10;
      let ty = clientY - rect.top - 40;
      if (tx + 150 > rect.width) tx = clientX - rect.left - 150;
      if (ty < 0) ty = clientY - rect.top + 20;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
      tooltip.classList.add('visible');

      const xPx = pad.left + ((reading.timestamp - chartData.tsMin) / ((chartData.tsMax - chartData.tsMin) || 1)) * plotW;
      const tSpan = (chartLabels.tempMax - chartLabels.tempMin) || 1;
      const hSpan = (chartLabels.humMax - chartLabels.humMin) || 1;
      const yTemp = pad.top + (1 - (reading.temperature - chartLabels.tempMin) / tSpan) * plotH;
      const yHum = pad.top + (1 - (reading.humidity - chartLabels.humMin) / hSpan) * plotH;

      crosshair.style.left = xPx + 'px';
      crosshair.style.top = pad.top + 'px';
      crosshair.style.height = plotH + 'px';
      crosshair.classList.add('visible');

      dotTemp.style.left = (xPx - 3) + 'px';
      dotTemp.style.top = (yTemp - 3) + 'px';
      dotTemp.classList.add('visible');

      dotHum.style.left = (xPx - 3) + 'px';
      dotHum.style.top = (yHum - 3) + 'px';
      dotHum.classList.add('visible');
    }

    function hideTooltip() {
      tooltip.classList.remove('visible');
      crosshair.classList.remove('visible');
      dotTemp.classList.remove('visible');
      dotHum.classList.remove('visible');
    }

    chart1Canvas.addEventListener('mousemove', handlePointer);
    chart1Canvas.addEventListener('touchmove', handlePointer);
    chart1Canvas.addEventListener('touchstart', handlePointer);
    chart1Canvas.addEventListener('mouseleave', hideTooltip);
    chart1Canvas.addEventListener('touchend', hideTooltip);

    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.range) return;
        document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.range;
        xOffsetMs = 0;
        updateData();
      });
    });

    document.getElementById('xBack').addEventListener('click', () => {
      const windowMs = getWindowMs();
      if (!windowMs) return;
      xOffsetMs += windowMs;
      updateData();
    });
    document.getElementById('xForward').addEventListener('click', () => {
      const windowMs = getWindowMs();
      if (!windowMs) return;
      xOffsetMs = Math.max(0, xOffsetMs - windowMs);
      updateData();
    });
    document.getElementById('xNow').addEventListener('click', () => {
      xOffsetMs = 0;
      updateData();
    });

    document.getElementById('zoomIn').addEventListener('click', () => {
      yZoom = Math.min(8, yZoom * 1.5);
      document.getElementById('zoomLevel').textContent = Math.round(yZoom * 100) + '%';
      updateData();
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
      yZoom = Math.max(0.25, yZoom / 1.5);
      document.getElementById('zoomLevel').textContent = Math.round(yZoom * 100) + '%';
      updateData();
    });
    document.getElementById('zoomReset').addEventListener('click', () => {
      yZoom = 1.0;
      document.getElementById('zoomLevel').textContent = '100%';
      updateData();
    });

    function updateData() {
      fetch('/api/current')
        .then(r => r.json())
        .then(data => {
          document.getElementById('deviceId').textContent = data.deviceId || '--';
          document.getElementById('equipment').textContent = data.equipmentId || 'Sin asignar';
          document.getElementById('equipmentPath').textContent = data.equipmentPath || 'Sin ruta';
          document.getElementById('lastUpdate').textContent = data.timestamp ? new Date(data.timestamp).toLocaleString('es-ES') : '--';
        })
        .catch(() => {});

      const windowMs = getWindowMs();
      const preferFlashFor1h = (currentRange === '1h' && flashHistoryCount > ramHistoryCount);
      const autoUseFlash = (currentRange !== '1h' || windowOverrideMs > 0 || preferFlashFor1h);
      const useFlash = sourceMode === 'flash' ? true : (sourceMode === 'ram' ? false : autoUseFlash);
      const windowPoints = windowMs ? Math.ceil((windowMs / 1000) / Math.max(1, sendIntervalSeconds)) : 2000;
      const autoLimit = Math.min(2000, Math.max(100, Math.ceil(windowPoints * 1.2)));
      const limit = samplesLimitOverride > 0 ? samplesLimitOverride : autoLimit;
      const offsetCount = useFlash ? Math.floor((xOffsetMs / 1000) / Math.max(1, sendIntervalSeconds)) : 0;
      const url = '/api/history?source=' + (useFlash ? 'flash' : 'ram') + '&limit=' + limit + '&offset=' + offsetCount;
      
      fetch(url)
        .then(r => r.json())
        .then(response => {
          let data = Array.isArray(response) ? response : 
                       (response._meta ? Object.values(response).filter(Array.isArray)[0] || [] : response);
          const meta = response._meta || { total: data.length, source: 'ram' };

          if (samplesLimitOverride > 0 && data.length > samplesLimitOverride) {
            data = data.slice(data.length - samplesLimitOverride);
          }
          
          const filtered = filterByRange(data, windowMs, xOffsetMs);
          chartData.filtered = filtered;
          const temps = filtered.map(d => d.temperature);
          const hums = filtered.map(d => d.humidity);
          chartData.temps = temps;
          chartData.hums = hums;

          const fallbackEnd = Date.now() - xOffsetMs;
          const fallbackStart = windowMs ? (fallbackEnd - windowMs) : fallbackEnd;
          const startTs = filtered.length ? filtered[0].timestamp : fallbackStart;
          const endTs = filtered.length ? filtered[filtered.length - 1].timestamp : fallbackEnd;
          const midTs = filtered.length ? filtered[Math.floor(filtered.length / 2)].timestamp : (startTs + endTs) / 2;
          const fmt = (ts) => ts ? new Date(ts).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}) : '--';

          // Rangos REALES de los datos (sin margen extra)
          const rawTempMin = temps.length ? Math.min(...temps) : 20;
          const rawTempMax = temps.length ? Math.max(...temps) : 30;
          const rawHumMin = hums.length ? Math.min(...hums) : 40;
          const rawHumMax = hums.length ? Math.max(...hums) : 80;

          // Aplicar zoom centrado en los datos
          const tempCenter = (rawTempMin + rawTempMax) / 2;
          const humCenter = (rawHumMin + rawHumMax) / 2;
          
          // Span con margen mínimo de 2°C para temp y 10% para hum
          let tempSpan = Math.max(2, rawTempMax - rawTempMin);
          let humSpan = Math.max(10, rawHumMax - rawHumMin);
          
          // Aplicar zoom
          tempSpan = tempSpan / yZoom;
          humSpan = humSpan / yZoom;
          
          const tempMin = tempCenter - tempSpan / 2;
          const tempMax = tempCenter + tempSpan / 2;
          const humMin = humCenter - humSpan / 2;
          const humMax = humCenter + humSpan / 2;

          chartLabels = {
            tempMin, tempMax, humMin, humMax,
            startLabel: fmt(startTs), midLabel: fmt(midTs), endLabel: fmt(endTs),
            tsMin: startTs, tsMax: endTs
          };
          chartData.tsMin = startTs;
          chartData.tsMax = endTs;

          renderDual(chart1Canvas, filtered, chartLabels);

          // Stats
          if (temps.length > 0) {
            document.getElementById('statCurrent').textContent = temps[temps.length - 1].toFixed(1) + '°C';
            document.getElementById('statMax').textContent = rawTempMax.toFixed(1) + '°C';
            document.getElementById('statMin').textContent = rawTempMin.toFixed(1) + '°C';
          }
          if (hums.length > 0) {
            document.getElementById('humCurrent').textContent = hums[hums.length - 1].toFixed(0) + '%';
            document.getElementById('humMax').textContent = rawHumMax.toFixed(0) + '%';
            document.getElementById('humMin').textContent = rawHumMin.toFixed(0) + '%';
          }

          const src = meta.source === 'flash' ? '💾' : '🧠';
          const limitText = samplesLimitOverride > 0 ? (' · max ' + samplesLimitOverride) : '';
          document.getElementById('historyCount').textContent = filtered.length + '/' + meta.total + ' ' + src + limitText;
          document.getElementById('timeWindow').textContent = formatSpan(windowMs);
          document.getElementById('timeOffset').textContent = formatOffset(xOffsetMs);
        })
        .catch(() => {});
    }

    function loadConfig() {
      fetch('/api/config')
        .then(r => r.json())
        .then(cfg => {
          document.getElementById('intervalInput').value = cfg.sendIntervalSeconds;
          document.getElementById('footerInterval').textContent = cfg.sendIntervalSeconds;
          sendIntervalSeconds = cfg.sendIntervalSeconds;
          document.getElementById('capacityInfo').textContent = '~' + cfg.estimatedDaysCapacity.toFixed(1) + ' días';
          document.getElementById('flashInfo').textContent = cfg.flashHistoryCount + '/' + cfg.flashHistoryMax;
          flashHistoryCount = cfg.flashHistoryCount || 0;
          ramHistoryCount = cfg.ramHistoryCount || 0;

          thresholds.tempWarnLow = cfg.tempWarnLow;
          thresholds.tempWarnHigh = cfg.tempWarnHigh;
          thresholds.tempCritLow = cfg.tempCritLow;
          thresholds.tempCritHigh = cfg.tempCritHigh;
          thresholds.humWarnLow = cfg.humWarnLow;
          thresholds.humWarnHigh = cfg.humWarnHigh;
          thresholds.humCritLow = cfg.humCritLow;
          thresholds.humCritHigh = cfg.humCritHigh;

          document.getElementById('tempWarnLow').value = cfg.tempWarnLow;
          document.getElementById('tempWarnHigh').value = cfg.tempWarnHigh;
          document.getElementById('tempCritLow').value = cfg.tempCritLow;
          document.getElementById('tempCritHigh').value = cfg.tempCritHigh;
          document.getElementById('humWarnLow').value = cfg.humWarnLow;
          document.getElementById('humWarnHigh').value = cfg.humWarnHigh;
          document.getElementById('humCritLow').value = cfg.humCritLow;
          document.getElementById('humCritHigh').value = cfg.humCritHigh;
        })
        .catch(() => {});
    }

    function updateInterval() {
      const val = parseInt(document.getElementById('intervalInput').value);
      if (val < 5 || val > 300) { alert('Rango: 5-300 seg'); return; }
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendIntervalSeconds: val })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          document.getElementById('footerInterval').textContent = val;
          loadConfig();
        }
      })
      .catch(() => {});
    }

    function updateThresholds() {
      const readVal = (id) => parseFloat(document.getElementById(id).value);
      const tWL = readVal('tempWarnLow');
      const tWH = readVal('tempWarnHigh');
      const tCL = readVal('tempCritLow');
      const tCH = readVal('tempCritHigh');
      const hWL = readVal('humWarnLow');
      const hWH = readVal('humWarnHigh');
      const hCL = readVal('humCritLow');
      const hCH = readVal('humCritHigh');

      if ([tWL, tWH, tCL, tCH, hWL, hWH, hCL, hCH].some(v => Number.isNaN(v))) {
        alert('Completa todos los umbrales');
        return;
      }

      const tempOk = (tCL <= tWL) && (tWL <= tWH) && (tWH <= tCH);
      const humOk = (hCL <= hWL) && (hWL <= hWH) && (hWH <= hCH);
      if (!tempOk || !humOk) {
        alert('Orden inválido. Debe cumplir: Cmin ≤ Wmin ≤ Wmax ≤ Cmax');
        return;
      }

      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempWarnLow: tWL,
          tempWarnHigh: tWH,
          tempCritLow: tCL,
          tempCritHigh: tCH,
          humWarnLow: hWL,
          humWarnHigh: hWH,
          humCritLow: hCL,
          humCritHigh: hCH
        })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          loadConfig();
        }
      })
      .catch(() => {});
    }

    updateData();
    loadConfig();
    setInterval(updateData, 5000);
    setInterval(loadConfig, 30000);
  </script>
</body>
</html>
)rawliteral";

#endif
