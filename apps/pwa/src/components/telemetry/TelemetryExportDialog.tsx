import { useMemo, useState } from 'react'
import { Download, FileJson, FileText, FileSpreadsheet } from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui'
import type { DeviceRow } from '@/services/devicesRtdb'
import type { Equipment } from '@/types'
import { fetchSensorReadingsBounds, fetchSensorReadingsRange } from '@/services/sensorsRtdb'
import {
  buildTelemetryAuditMeta,
  exportTelemetryAsCsv,
  exportTelemetryAsHtml,
  exportTelemetryAsJsonl,
  exportTelemetryAsPdf,
  type TelemetryAuditEvent
} from '@/lib/telemetryAuditExport'

type Preset = '1h' | '6h' | '12h' | '24h' | '48h' | '7d' | 'custom'

function presetToMs(p: Exclude<Preset, 'custom'>): number {
  switch (p) {
    case '1h':
      return 1 * 60 * 60 * 1000
    case '6h':
      return 6 * 60 * 60 * 1000
    case '12h':
      return 12 * 60 * 60 * 1000
    case '24h':
      return 24 * 60 * 60 * 1000
    case '48h':
      return 48 * 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
  }
}

function presetLabel(p: Preset): string {
  switch (p) {
    case '1h':
      return 'Última hora'
    case '6h':
      return 'Últimas 6 horas'
    case '12h':
      return 'Últimas 12 horas'
    case '24h':
      return 'Últimas 24 horas'
    case '48h':
      return 'Últimos 2 días'
    case '7d':
      return 'Última semana'
    case 'custom':
      return 'Personalizado'
  }
}

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`
}

function fromDatetimeLocalValue(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  if (!Number.isFinite(ms)) return null
  return ms
}

export function TelemetryExportDialog(props: {
  devices: DeviceRow[]
  equipment: Equipment[]
  defaultDeviceId?: string
  defaultPreset?: Exclude<Preset, 'custom'>
}) {
  const devicesWithAssignment = useMemo(
    () => props.devices.filter((d) => Boolean(d.assignedEquipmentId)),
    [props.devices]
  )

  const [open, setOpen] = useState(false)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(() =>
    props.defaultDeviceId ? [props.defaultDeviceId] : []
  )
  const [preset, setPreset] = useState<Preset>(props.defaultPreset ?? '24h')

  const now = Date.now()
  const initialFrom = preset === 'custom' ? now - presetToMs('24h') : now - presetToMs(preset)
  const [fromLocal, setFromLocal] = useState<string>(toDatetimeLocalValue(initialFrom))
  const [toLocal, setToLocal] = useState<string>(toDatetimeLocalValue(now))
  const [limit, setLimit] = useState<number>(20_000)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastInfo, setLastInfo] = useState<string | null>(null)

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'

  const selectedDevices = useMemo(() => {
    const set = new Set(selectedDeviceIds)
    return devicesWithAssignment.filter((d) => set.has(d.deviceId))
  }, [devicesWithAssignment, selectedDeviceIds])

  const resolvedRange = useMemo(() => {
    if (preset !== 'custom') {
      const toMs = Date.now()
      const fromMs = toMs - presetToMs(preset)
      return { fromMs, toMs, label: presetLabel(preset) }
    }

    const fromMs = fromDatetimeLocalValue(fromLocal)
    const toMs = fromDatetimeLocalValue(toLocal)
    if (!fromMs || !toMs) return null
    return { fromMs, toMs, label: 'Personalizado' }
  }, [fromLocal, preset, toLocal])

  function toggleDevice(deviceId: string) {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    )
  }

  function setAll(checked: boolean) {
    setSelectedDeviceIds(checked ? devicesWithAssignment.map((d) => d.deviceId) : [])
  }

  async function loadEvents(): Promise<{ meta: ReturnType<typeof buildTelemetryAuditMeta>; events: TelemetryAuditEvent[] } | null> {
    setError(null)
    setLastInfo(null)

    if (!resolvedRange) {
      setError('Rango inválido. Revisa desde/hasta.')
      return null
    }

    const { fromMs, toMs } = resolvedRange
    if (fromMs >= toMs) {
      setError('El rango es inválido: "Desde" debe ser menor a "Hasta".')
      return null
    }

    if (selectedDevices.length === 0) {
      setError('Selecciona al menos 1 sensor/dispositivo.')
      return null
    }

    setBusy(true)

    try {
      const selectedDevicesMeta = selectedDevices.map((d) => {
        const eq = d.assignedEquipmentId
          ? props.equipment.find((e) => e.id === d.assignedEquipmentId) ?? null
          : null

        return {
          deviceId: d.deviceId,
          assignedEquipmentId: d.assignedEquipmentId,
          equipmentNombre: eq?.nombre,
          equipmentCodigo: eq?.codigo,
          hierarchyPath: eq?.hierarchyPath,
          firmwareVersion: d.firmwareVersion,
          ip: d.ip,
          rssi: d.rssi
        }
      })

      const meta = buildTelemetryAuditMeta({
        fromMs,
        toMs,
        presetsLabel: preset !== 'custom' ? presetLabel(preset) : undefined,
        selectedDevices: selectedDevicesMeta
      })

      const results = await Promise.all(
        selectedDevices.map(async (d) => {
          const equipmentId = d.assignedEquipmentId
          if (!equipmentId) return { deviceId: d.deviceId, equipmentId: null, rows: [] as any[] }
          const rows = await fetchSensorReadingsRange({ equipmentId, fromMs, toMs, limit })
          return { deviceId: d.deviceId, equipmentId, rows }
        })
      )

      const events: TelemetryAuditEvent[] = []
      let total = 0
      let truncated = false

      for (const r of results) {
        if (!r.equipmentId) continue
        const eq = props.equipment.find((e) => e.id === r.equipmentId) ?? null

        total += r.rows.length
        if (r.rows.length >= limit) truncated = true

        for (const row of r.rows) {
          const ts = row.timestamp
          events.push({
            recordType: 'event',
            timestampMs: ts,
            timestampIso: new Date(ts).toISOString(),
            timestampLocal: new Date(ts).toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            }),
            deviceId: r.deviceId,
            assignedEquipmentId: r.equipmentId,
            equipmentNombre: eq?.nombre,
            equipmentCodigo: eq?.codigo,
            hierarchyPath: eq?.hierarchyPath,
            temperature: Number.isFinite(row.temperature) ? row.temperature : undefined,
            humidity: Number.isFinite(row.humidity) ? row.humidity : undefined,
            tempStatus: row.tempStatus,
            humStatus: row.humStatus,
            source: row.source,
            readingId: row.id
          })
        }
      }

      if (total === 0) {
        const expectedPaths = results
          .filter((r) => Boolean(r.equipmentId))
          .map((r) => `sensors/${r.equipmentId}/readings`)
          .join(' · ')

        const equipmentIds = Array.from(
          new Set(results.map((r) => r.equipmentId).filter((v): v is string => Boolean(v)))
        )

        let boundsInfo: string | null = null
        try {
          const bounds = await Promise.all(
            equipmentIds.map(async (equipmentId) => {
              const b = await fetchSensorReadingsBounds({ equipmentId })
              return { equipmentId, ...b }
            })
          )

          const fmt = (ms: number) =>
            new Date(ms).toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })

          const parts = bounds
            .map((b) => {
              if (!b.first || !b.last) return `sin histórico en sensors/${b.equipmentId}/readings`
              const firstMs = b.first.timestamp
              const lastMs = b.last.timestamp
              const inRange = lastMs >= fromMs && firstMs <= toMs
              const clockNote =
                lastMs > Date.now() + 5 * 60 * 1000
                  ? ' (ojo: timestamps en el futuro → reloj del ESP32 corrido)'
                  : lastMs < Date.now() - 60 * 24 * 60 * 60 * 1000
                    ? ' (ojo: último dato muy antiguo)'
                    : ''

              return inRange
                ? `histórico existe pero no calzó con filtros (rango DB: ${fmt(firstMs)} → ${fmt(lastMs)})${clockNote}`
                : `rango DB: ${fmt(firstMs)} → ${fmt(lastMs)}${clockNote}`
            })
            .join(' · ')

          if (parts) boundsInfo = parts
        } catch {
          // Si falla el diagnóstico, no bloqueamos el export.
          boundsInfo = null
        }

        setLastInfo(
          expectedPaths
            ? `Export listo (0 lecturas). No hay histórico en el rango. Ruta esperada: ${expectedPaths}.${boundsInfo ? ` Diagnóstico: ${boundsInfo}.` : ''} Si el sensor se asignó recién o acabas de actualizar reglas RTDB, espera 1–2 envíos (5–10s) y reintenta.`
            : 'Export listo (0 lecturas). No hay histórico en el rango. Revisa que el sensor tenga equipo asignado.'
        )
      } else {
        setLastInfo(
          truncated
            ? `Export listo (${total} lecturas). OJO: se alcanzó el límite (${limit}) en al menos 1 sensor.`
            : `Export listo (${total} lecturas).`
        )
      }

      return { meta, events }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error exportando.'
      setError(msg)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function runExport(kind: 'csv' | 'jsonl' | 'html' | 'pdf') {
    const loaded = await loadEvents()
    if (!loaded) return

    const { meta, events } = loaded

    if (kind === 'csv') exportTelemetryAsCsv(meta, events)
    if (kind === 'jsonl') exportTelemetryAsJsonl(meta, events)
    if (kind === 'html') exportTelemetryAsHtml(meta, events)
    if (kind === 'pdf') await exportTelemetryAsPdf(meta, events)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar historial
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exportación de historial (Auditoría)</DialogTitle>
          <DialogDescription>
            Exporta lecturas por rango horario (zona: <span className="font-medium">{timezone}</span>) y agrega contexto de
            asignación sensor↔máquina.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Sensores a exportar</div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedDeviceIds.length === devicesWithAssignment.length && devicesWithAssignment.length > 0}
                  onCheckedChange={(v) => setAll(Boolean(v))}
                  id="export-all"
                />
                <Label htmlFor="export-all" className="text-xs text-muted-foreground">Todos</Label>
              </div>
            </div>

            {devicesWithAssignment.length === 0 ? (
              <div className="text-sm text-muted-foreground mt-2">No hay dispositivos con equipo asignado.</div>
            ) : (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {devicesWithAssignment.map((d) => {
                  const eq = d.assignedEquipmentId
                    ? props.equipment.find((e) => e.id === d.assignedEquipmentId) ?? null
                    : null

                  return (
                    <label key={d.deviceId} className="flex items-start gap-2 rounded border p-2 cursor-pointer">
                      <Checkbox checked={selectedDeviceIds.includes(d.deviceId)} onCheckedChange={() => toggleDevice(d.deviceId)} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-all">{d.deviceId}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {eq ? `${eq.codigo} · ${eq.nombre}` : d.assignedEquipmentId}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Rango</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">⏱️ {presetLabel('1h')}</SelectItem>
                  <SelectItem value="6h">🕐 {presetLabel('6h')}</SelectItem>
                  <SelectItem value="12h">🕛 {presetLabel('12h')}</SelectItem>
                  <SelectItem value="24h">📅 {presetLabel('24h')}</SelectItem>
                  <SelectItem value="48h">📆 {presetLabel('48h')}</SelectItem>
                  <SelectItem value="7d">📊 {presetLabel('7d')}</SelectItem>
                  <SelectItem value="custom">🧾 {presetLabel('custom')}</SelectItem>
                </SelectContent>
              </Select>
              {resolvedRange && (
                <div className="text-xs text-muted-foreground">
                  {new Date(resolvedRange.fromMs).toLocaleString('es-ES', { hour12: false })} →{' '}
                  {new Date(resolvedRange.toMs).toLocaleString('es-ES', { hour12: false })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Límite por sensor</Label>
              <Input
                type="number"
                min={1000}
                max={100000}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 0)}
              />
              <div className="text-xs text-muted-foreground">Evita exports gigantes (por defecto 20.000).</div>
            </div>

            {preset === 'custom' ? (
              <div className="space-y-2">
                <Label>Desde / Hasta</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="datetime-local" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
                  <Input type="datetime-local" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Ventana</Label>
                <div className="rounded border p-3 text-xs text-muted-foreground">
                  Se calcula contra "ahora" al exportar. Para un peritaje con tramo exacto, usa "Personalizado".
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {lastInfo && (
            <div className="rounded border bg-muted/30 p-3 text-sm">
              {lastInfo}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => runExport('csv')} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => runExport('jsonl')} className="gap-2">
              <FileJson className="h-4 w-4" /> JSONL
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => runExport('html')} className="gap-2">
              <FileText className="h-4 w-4" /> Visor HTML
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => runExport('pdf')} className="gap-2">
              <FileText className="h-4 w-4" /> PDF
            </Button>
            {busy && <Badge variant="secondary">Exportando…</Badge>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
