export type TelemetryAuditMeta = {
  generatedAtMs: number
  generatedAtIso: string
  timezone: string
  tzOffsetMinutes: number
  fromMs: number
  toMs: number
  fromIso: string
  toIso: string
  fromLocal: string
  toLocal: string
  presetsLabel?: string
  selectedDevices: Array<{
    deviceId: string
    assignedEquipmentId?: string | null
    equipmentNombre?: string
    equipmentCodigo?: string
    hierarchyPath?: string
    firmwareVersion?: string
    ip?: string
    rssi?: number
  }>
}

export type TelemetryAuditEvent = {
  recordType: 'event'
  timestampMs: number
  timestampIso: string
  timestampLocal: string
  deviceId: string
  assignedEquipmentId?: string | null
  equipmentNombre?: string
  equipmentCodigo?: string
  hierarchyPath?: string
  temperature?: number
  humidity?: number
  tempStatus?: string
  humStatus?: string
  source?: string
  readingId?: string
}

function formatLocal(ms: number): string {
  return new Date(ms).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  // CSV RFC4180-ish
  if (/[\n\r\t",]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function buildTelemetryAuditMeta(params: {
  fromMs: number
  toMs: number
  presetsLabel?: string
  selectedDevices: TelemetryAuditMeta['selectedDevices']
}): TelemetryAuditMeta {
  const generatedAtMs = Date.now()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  const tzOffsetMinutes = -new Date().getTimezoneOffset()

  return {
    generatedAtMs,
    generatedAtIso: toIso(generatedAtMs),
    timezone,
    tzOffsetMinutes,
    fromMs: params.fromMs,
    toMs: params.toMs,
    fromIso: toIso(params.fromMs),
    toIso: toIso(params.toMs),
    fromLocal: formatLocal(params.fromMs),
    toLocal: formatLocal(params.toMs),
    presetsLabel: params.presetsLabel,
    selectedDevices: params.selectedDevices
  }
}

export function exportTelemetryAsCsv(meta: TelemetryAuditMeta, events: TelemetryAuditEvent[]) {
  const headers = [
    'timestampMs',
    'timestampLocal',
    'timestampIso',
    'deviceId',
    'assignedEquipmentId',
    'equipmentCodigo',
    'equipmentNombre',
    'hierarchyPath',
    'temperature',
    'humidity',
    'tempStatus',
    'humStatus',
    'source',
    'readingId'
  ]

  const rows = events
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((e) =>
      headers
        .map((h) => {
          const v = (e as any)[h]
          return csvEscape(v)
        })
        .join(',')
    )

  const metaLines = [
    `# generatedAtLocal: ${formatLocal(meta.generatedAtMs)}`,
    `# timezone: ${meta.timezone} (offsetMinutes=${meta.tzOffsetMinutes})`,
    `# rangeLocal: ${meta.fromLocal} → ${meta.toLocal}`,
    `# rangeIso: ${meta.fromIso} → ${meta.toIso}`,
    `# sensors: ${meta.selectedDevices.map((d) => d.deviceId).join(' | ')}`
  ]

  const csv = `\ufeff${metaLines.join('\n')}\n${headers.join(',')}\n${rows.join('\n')}\n`
  downloadBlob(
    `telemetria_auditoria_v${meta.generatedAtMs}_${meta.fromMs}-${meta.toMs}.csv`,
    new Blob([csv], { type: 'text/csv;charset=utf-8' })
  )
}

export function exportTelemetryAsJsonl(meta: TelemetryAuditMeta, events: TelemetryAuditEvent[]) {
  const lines = [
    JSON.stringify({ recordType: 'meta', ...meta }),
    ...events
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .map((e) => JSON.stringify(e))
  ]

  const jsonl = `${lines.join('\n')}\n`
  downloadBlob(
    `telemetria_auditoria_v${meta.generatedAtMs}_${meta.fromMs}-${meta.toMs}.jsonl`,
    new Blob([jsonl], { type: 'application/x-ndjson;charset=utf-8' })
  )
}

export function exportTelemetryAsHtml(meta: TelemetryAuditMeta, events: TelemetryAuditEvent[]) {
  const payload = {
    meta,
    events: events.sort((a, b) => a.timestampMs - b.timestampMs)
  }

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Visor de eventos - Telemetría</title>
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:16px;color:#111827}
    .muted{color:#6b7280}
    .card{border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:12px}
    table{border-collapse:collapse;width:100%}
    th,td{border-bottom:1px solid #e5e7eb;padding:8px;font-size:12px;vertical-align:top}
    th{position:sticky;top:0;background:#f9fafb;text-align:left}
    input{padding:8px;border:1px solid #e5e7eb;border-radius:8px;width:100%;max-width:520px}
    .grid{display:grid;grid-template-columns:1fr;gap:12px}
    @media(min-width:900px){.grid{grid-template-columns:1fr 1fr}}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px}
  </style>
</head>
<body>
  <h1>Visor de eventos - Telemetría</h1>
  <div class="card">
    <div class="grid">
      <div>
        <div class="muted">Rango (local)</div>
        <div><span class="pill">${meta.fromLocal} → ${meta.toLocal}</span></div>
      </div>
      <div>
        <div class="muted">Zona horaria</div>
        <div><span class="pill">${meta.timezone} (offset ${meta.tzOffsetMinutes} min)</span></div>
      </div>
    </div>
    <div style="margin-top:10px" class="muted">Sensores: ${meta.selectedDevices
      .map((d) => d.deviceId)
      .join(' | ')}</div>
  </div>

  <div class="card">
    <div class="muted" style="margin-bottom:6px">Filtro rápido (texto):</div>
    <input id="q" placeholder="Ej: bomba, MTR-001, esp32-01, humedad, offline..." />
    <div class="muted" style="margin-top:6px">Filtra por deviceId / equipo / valores / estado.</div>
  </div>

  <div class="card">
    <div class="muted" style="margin-bottom:6px">Eventos: <span id="count"></span></div>
    <div style="overflow:auto; max-height:70vh">
      <table>
        <thead>
          <tr>
            <th>Fecha/Hora (local)</th>
            <th>Sensor</th>
            <th>Equipo</th>
            <th>Temp (°C)</th>
            <th>Hum (%)</th>
            <th>Estado</th>
            <th>Origen</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

<script>
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
const payload = ${JSON.stringify(payload)};
const all = payload.events;
const q = document.getElementById('q');
const rows = document.getElementById('rows');
const count = document.getElementById('count');

function rowText(e){
  return [
    e.timestampLocal,
    e.deviceId,
    e.assignedEquipmentId,
    e.equipmentCodigo,
    e.equipmentNombre,
    e.hierarchyPath,
    e.temperature,
    e.humidity,
    e.tempStatus,
    e.humStatus,
    e.source
  ].filter(Boolean).join(' ').toLowerCase();
}

function render(){
  const term = (q.value || '').trim().toLowerCase();
  const filtered = term ? all.filter(e => rowText(e).includes(term)) : all;
  count.textContent = filtered.length;
  rows.innerHTML = filtered.map(e => {
    const equipo = [e.equipmentCodigo, e.equipmentNombre].filter(Boolean).join(' - ') || (e.assignedEquipmentId || '—');
    const estado = [e.tempStatus, e.humStatus].filter(Boolean).join(' / ') || '—';
    const temp = (typeof e.temperature === 'number') ? e.temperature.toFixed(2) : '';
    const hum = (typeof e.humidity === 'number') ? e.humidity.toFixed(2) : '';
    return (
      '<tr>' +
      '<td>' + esc(e.timestampLocal) + '</td>' +
      '<td>' + esc(e.deviceId) + '</td>' +
      '<td>' + esc(equipo) + '</td>' +
      '<td>' + esc(temp) + '</td>' +
      '<td>' + esc(hum) + '</td>' +
      '<td>' + esc(estado) + '</td>' +
      '<td>' + esc(e.source) + '</td>' +
      '</tr>'
    );
  }).join('');
}
q.addEventListener('input', render);
render();
</script>
</body>
</html>
`

  downloadBlob(
    `visor_eventos_telemetria_${meta.fromMs}-${meta.toMs}.html`,
    new Blob([html], { type: 'text/html;charset=utf-8' })
  )
}

export async function exportTelemetryAsPdf(meta: TelemetryAuditMeta, events: TelemetryAuditEvent[]) {
  // Cargar dependencias solo al exportar para no inflar el bundle inicial.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ])

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

  const title = 'Evidencia de Telemetría (Auditoría)'
  doc.setFontSize(16)
  doc.text(title, 40, 40)

  doc.setFontSize(10)
  doc.text(`Generado: ${formatLocal(meta.generatedAtMs)}`, 40, 60)
  doc.text(`Zona horaria: ${meta.timezone} (offset ${meta.tzOffsetMinutes} min)`, 40, 74)
  doc.text(`Rango: ${meta.fromLocal} → ${meta.toLocal}`, 40, 88)
  doc.text(`Sensores: ${meta.selectedDevices.map((d) => d.deviceId).join(' | ')}`, 40, 102)

  const rows = events
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((e) => [
      e.timestampLocal,
      e.deviceId,
      e.equipmentCodigo ?? '',
      e.equipmentNombre ?? '',
      typeof e.temperature === 'number' ? e.temperature.toFixed(2) : '',
      typeof e.humidity === 'number' ? e.humidity.toFixed(2) : '',
      [e.tempStatus, e.humStatus].filter(Boolean).join(' / '),
      e.source ?? ''
    ])

  autoTable(doc as any, {
    startY: 120,
    head: [[
      'Fecha/Hora (local)',
      'Sensor',
      'Código Equipo',
      'Equipo',
      'Temp (°C)',
      'Hum (%)',
      'Estado',
      'Origen'
    ]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [102, 126, 234] }
  })

  const filename = `evidencia_telemetria_${meta.fromMs}-${meta.toMs}.pdf`
  doc.save(filename)
}
