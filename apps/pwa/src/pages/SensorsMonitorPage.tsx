import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Cpu, Thermometer, Droplets, Link2, Settings2, Save, X } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { useCanSee, useIsAdmin } from '@/store'
import { getEquipments } from '@/services/equipment'
import { subscribeDevices, updateDeviceThresholds, type DeviceRow, type SensorThresholds } from '@/services/devicesRtdb'
import { subscribeSensorReadings, fetchLastSensorReadings, type SensorReading } from '@/services/sensorsRtdb'
import type { Equipment } from '@/types'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

function formatDateTime(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '—'
  const ts = timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getAreaLabel(equipment?: Equipment): string {
  if (!equipment?.hierarchyPath) return 'Sin área'
  const parts = equipment.hierarchyPath.split('>').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[1]!
  return parts[0] ?? 'Sin área'
}

function getTelemetryAlert(device: DeviceRow): 'normal' | 'warning' | 'critical' {
  const temp = device.telemetry?.temperatura?.status
  const hum = device.telemetry?.humedad?.status
  if (temp === 'critical' || hum === 'critical') return 'critical'
  if (temp === 'warning' || hum === 'warning') return 'warning'
  return 'normal'
}

function isDeviceFresh(device: DeviceRow, nowMs: number): boolean {
  const lastSeen = device.lastSeen
  const tempTs = device.telemetry?.temperatura?.timestamp
  const humTs = device.telemetry?.humedad?.timestamp

  const norm = (ts?: number) => {
    if (!ts || !Number.isFinite(ts)) return 0
    return ts > 0 && ts < 1e12 ? ts * 1000 : ts
  }

  const freshestTs = Math.max(norm(lastSeen), norm(tempTs), norm(humTs))
  if (freshestTs <= 0) return false

  const intervalSec = device.sendInterval && device.sendInterval > 0 ? device.sendInterval : 10
  // Ventana de frescura: 10× intervalo o mínimo 120 s
  const freshnessWindowMs = Math.max(intervalSec * 10 * 1000, 120_000)

  // Aceptar online=true solo si además hay señal reciente.
  if (device.online === true) {
    return nowMs - freshestTs <= freshnessWindowMs
  }

  return nowMs - freshestTs <= freshnessWindowMs
}

// Umbrales por defecto (sincronizados con firmware ESP32)
const DEFAULT_THRESHOLDS = {
  tempWarnLow: 15,
  tempWarnHigh: 30,
  tempCritLow: 10,
  tempCritHigh: 40,
  humWarnLow: 30,
  humWarnHigh: 70,
  humCritLow: 20,
  humCritHigh: 85,
}

type ChartMode = 'dual' | 'temperature' | 'humidity'

function resolveThresholds(device?: SensorThresholds): typeof DEFAULT_THRESHOLDS {
  return {
    tempWarnLow: device?.tempWarnLow ?? DEFAULT_THRESHOLDS.tempWarnLow,
    tempWarnHigh: device?.tempWarnHigh ?? DEFAULT_THRESHOLDS.tempWarnHigh,
    tempCritLow: device?.tempCritLow ?? DEFAULT_THRESHOLDS.tempCritLow,
    tempCritHigh: device?.tempCritHigh ?? DEFAULT_THRESHOLDS.tempCritHigh,
    humWarnLow: device?.humWarnLow ?? DEFAULT_THRESHOLDS.humWarnLow,
    humWarnHigh: device?.humWarnHigh ?? DEFAULT_THRESHOLDS.humWarnHigh,
    humCritLow: device?.humCritLow ?? DEFAULT_THRESHOLDS.humCritLow,
    humCritHigh: device?.humCritHigh ?? DEFAULT_THRESHOLDS.humCritHigh,
  }
}

/* ── Editor de umbrales (solo admin) ── */
function ThresholdEditor({ deviceId, current, onClose }: {
  deviceId: string
  current: SensorThresholds
  onClose: () => void
}) {
  const resolved = resolveThresholds(current)
  const [form, setForm] = useState(resolved)
  const [saving, setSaving] = useState(false)

  const set = (key: keyof typeof form, val: string) => {
    const n = parseFloat(val)
    if (!Number.isNaN(n)) setForm(prev => ({ ...prev, [key]: n }))
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updateDeviceThresholds(deviceId, form)
      onClose()
    } catch (err) {
      console.error('Error guardando umbrales', err)
    } finally {
      setSaving(false)
    }
  }, [deviceId, form, onClose])

  const field = (label: string, key: keyof typeof form, color: string) => (
    <div className="flex items-center gap-2">
      <label className={`text-[11px] w-20 text-right ${color}`}>{label}</label>
      <input
        type="number"
        step="0.5"
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        className="h-7 w-16 rounded border border-border/50 bg-background/60 px-1.5 text-xs text-center tabular-nums"
      />
    </div>
  )

  return (
    <div className="rounded-xl border border-border/40 bg-card p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5" /> Umbrales de alerta
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-orange-400 flex items-center gap-1"><Thermometer className="h-3 w-3" /> Temperatura (°C)</p>
          {field('Crít. bajo', 'tempCritLow', 'text-red-400')}
          {field('Adv. bajo', 'tempWarnLow', 'text-amber-400')}
          {field('Adv. alto', 'tempWarnHigh', 'text-amber-400')}
          {field('Crít. alto', 'tempCritHigh', 'text-red-400')}
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-cyan-400 flex items-center gap-1"><Droplets className="h-3 w-3" /> Humedad (%)</p>
          {field('Crít. bajo', 'humCritLow', 'text-blue-400')}
          {field('Adv. bajo', 'humWarnLow', 'text-cyan-400')}
          {field('Adv. alto', 'humWarnHigh', 'text-cyan-400')}
          {field('Crít. alto', 'humCritHigh', 'text-blue-400')}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={handleSave}>
          <Save className="h-3 w-3 mr-1" />{saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}

const CHART_MIN_H = 120
const CHART_MAX_H = 600
const CHART_DEFAULT_H = 192  // 12rem
const CHART_STORAGE_PREFIX = 'chart-h-'
const CHART_HISTORY_LIMIT = 5000

function getStoredChartHeight(deviceId: string): number {
  try {
    const v = localStorage.getItem(CHART_STORAGE_PREFIX + deviceId)
    if (v) {
      const n = parseInt(v, 10)
      if (n >= CHART_MIN_H && n <= CHART_MAX_H) return n
    }
  } catch { /* noop */ }
  return CHART_DEFAULT_H
}

function TrendSparkline({
  readings,
  sendIntervalSec,
  thresholds,
  deviceId,
}: {
  readings?: SensorReading[]
  sendIntervalSec?: number
  thresholds?: SensorThresholds
  deviceId: string
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [countdownMs, setCountdownMs] = useState(() => Date.now())
  const [timeFilterPreset, setTimeFilterPreset] = useState<'all' | '15' | '60' | '240' | '1440' | 'custom'>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [chartMode, setChartMode] = useState<ChartMode>('dual')
  const [showThresholds, setShowThresholds] = useState(true)

  // ── Resizable chart height ──
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const [chartH, setChartH] = useState(() => isMobile ? CHART_DEFAULT_H : getStoredChartHeight(deviceId))
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ active: boolean; startY: number; startH: number }>({ active: false, startY: 0, startH: 0 })

  const persistTimer = useRef<ReturnType<typeof setTimeout>>()
  const persistHeight = useCallback((h: number) => {
    if (isMobile) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      try { localStorage.setItem(CHART_STORAGE_PREFIX + deviceId, String(h)) } catch { /* noop */ }
    }, 300)
  }, [deviceId, isMobile])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragState.current.active) return
      e.preventDefault()
      const delta = e.clientY - dragState.current.startY
      const newH = Math.min(CHART_MAX_H, Math.max(CHART_MIN_H, dragState.current.startH + delta))
      setChartH(newH)
    }
    const onUp = (e: PointerEvent) => {
      if (!dragState.current.active) return
      dragState.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const delta = e.clientY - dragState.current.startY
      const finalH = Math.min(CHART_MAX_H, Math.max(CHART_MIN_H, dragState.current.startH + delta))
      setChartH(finalH)
      persistHeight(finalH)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [persistHeight])

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragState.current = { active: true, startY: e.clientY, startH: chartH }
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [chartH])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 640) setChartH(CHART_DEFAULT_H)
      else setChartH(getStoredChartHeight(deviceId))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [deviceId])

  const normalizedReadings = useMemo(() => {
    return (readings ?? [])
      .filter(
        (r) => Number.isFinite(r.timestamp) && Number.isFinite(r.temperature) && Number.isFinite(r.humidity)
      )
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [readings])

  const timeFilteredReadings = useMemo(() => {
    if (normalizedReadings.length === 0) return []

    if (timeFilterPreset === 'all') return normalizedReadings

    if (timeFilterPreset === 'custom') {
      const fromMs = customFrom ? new Date(customFrom).getTime() : Number.NEGATIVE_INFINITY
      const toMs = customTo ? new Date(customTo).getTime() : Number.POSITIVE_INFINITY
      return normalizedReadings.filter((reading) => reading.timestamp >= fromMs && reading.timestamp <= toMs)
    }

    const minutes = Number.parseInt(timeFilterPreset, 10)
    if (!Number.isFinite(minutes) || minutes <= 0) return normalizedReadings
    const fromMs = nowMs - minutes * 60_000
    return normalizedReadings.filter((reading) => reading.timestamp >= fromMs)
  }, [normalizedReadings, timeFilterPreset, customFrom, customTo, nowMs])

  useEffect(() => {
    if (!sendIntervalSec || sendIntervalSec <= 0) return
    // Countdown display: every 1s (lightweight — only updates text, not chart)
    const countdownTimer = window.setInterval(() => setCountdownMs(Date.now()), 1000)
    // Data filter refresh: every 15s (reduces chart recalculations)
    const dataTimer = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => {
      window.clearInterval(countdownTimer)
      window.clearInterval(dataTimer)
    }
  }, [sendIntervalSec])

  if (timeFilteredReadings.length < 2) {
    return (
      <div className="rounded-md border p-2 text-xs text-muted-foreground">
        Sin histórico suficiente para graficar cambios.
      </div>
    )
  }

  const th = resolveThresholds(thresholds)
  const showTemp = chartMode === 'dual' || chartMode === 'temperature'
  const showHum = chartMode === 'dual' || chartMode === 'humidity'

  const tempData = timeFilteredReadings.map(r => [r.timestamp, r.temperature])
  const humData = timeFilteredReadings.map(r => [r.timestamp, r.humidity])

  const markAreaTemp = showThresholds && chartMode === 'temperature' ? {
    silent: true,
    data: [
      [{ yAxis: th.tempCritHigh, itemStyle: { color: 'rgba(239, 68, 68, 0.15)' } }, { yAxis: 'max' }],
      [{ yAxis: th.tempWarnHigh, itemStyle: { color: 'rgba(245, 158, 11, 0.12)' } }, { yAxis: th.tempCritHigh }],
      [{ yAxis: th.tempWarnLow, itemStyle: { color: 'rgba(34, 197, 94, 0.08)' } }, { yAxis: th.tempWarnHigh }],
      [{ yAxis: th.tempCritLow, itemStyle: { color: 'rgba(245, 158, 11, 0.12)' } }, { yAxis: th.tempWarnLow }],
      [{ yAxis: 'min', itemStyle: { color: 'rgba(239, 68, 68, 0.15)' } }, { yAxis: th.tempCritLow }]
    ]
  } : undefined

  const markLineTemp = showThresholds && chartMode === 'temperature' ? {
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed', width: 1 },
    data: [
      { yAxis: th.tempCritHigh, lineStyle: { color: '#ef4444' }, label: { formatter: '{c}°', position: 'insideStartBottom', color: '#ef4444' } },
      { yAxis: th.tempWarnHigh, lineStyle: { color: '#f59e0b' }, label: { formatter: '{c}°', position: 'insideStartBottom', color: '#f59e0b' } },
      { yAxis: th.tempWarnLow, lineStyle: { color: '#f59e0b' }, label: { formatter: '{c}°', position: 'insideStartTop', color: '#f59e0b' } },
      { yAxis: th.tempCritLow, lineStyle: { color: '#ef4444' }, label: { formatter: '{c}°', position: 'insideStartTop', color: '#ef4444' } }
    ]
  } : undefined

  const markAreaHum = showThresholds && chartMode === 'humidity' ? {
    silent: true,
    data: [
      [{ yAxis: th.humCritHigh, itemStyle: { color: 'rgba(59, 130, 246, 0.15)' } }, { yAxis: 'max' }],
      [{ yAxis: th.humWarnHigh, itemStyle: { color: 'rgba(6, 182, 212, 0.12)' } }, { yAxis: th.humCritHigh }],
      [{ yAxis: th.humWarnLow, itemStyle: { color: 'rgba(34, 197, 94, 0.08)' } }, { yAxis: th.humWarnHigh }],
      [{ yAxis: th.humCritLow, itemStyle: { color: 'rgba(6, 182, 212, 0.12)' } }, { yAxis: th.humWarnLow }],
      [{ yAxis: 'min', itemStyle: { color: 'rgba(59, 130, 246, 0.15)' } }, { yAxis: th.humCritLow }]
    ]
  } : undefined

  const markLineHum = showThresholds && chartMode === 'humidity' ? {
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed', width: 1 },
    data: [
      { yAxis: th.humCritHigh, lineStyle: { color: '#3b82f6' }, label: { formatter: '{c}%', position: 'insideStartBottom', color: '#3b82f6' } },
      { yAxis: th.humWarnHigh, lineStyle: { color: '#06b6d4' }, label: { formatter: '{c}%', position: 'insideStartBottom', color: '#06b6d4' } },
      { yAxis: th.humWarnLow, lineStyle: { color: '#06b6d4' }, label: { formatter: '{c}%', position: 'insideStartTop', color: '#06b6d4' } },
      { yAxis: th.humCritLow, lineStyle: { color: '#3b82f6' }, label: { formatter: '{c}%', position: 'insideStartTop', color: '#3b82f6' } }
    ]
  } : undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: EChartsOption = {
    animation: true,
    animationDuration: 250,
    animationEasing: 'cubicOut',
    animationThreshold: 5000,
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        crossStyle: { color: 'rgba(148, 163, 184, 0.4)', type: 'dashed', width: 1 },
        lineStyle: { color: 'rgba(148, 163, 184, 0.3)', type: 'dashed' },
        label: { backgroundColor: '#1e293b', color: '#e2e8f0', fontSize: 10, borderColor: 'rgba(255,255,255,0.08)' }
      },
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(255, 255, 255, 0.06)',
      borderRadius: 8,
      padding: [10, 14],
      textStyle: { color: '#f1f5f9', fontSize: 11 },
      extraCssText: 'box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(8px);',
      formatter: (params: any) => {
        if (!params || !params.length) return ''
        const date = new Date(params[0].value[0])
        const timeStr = date.toLocaleString('es-ES', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
        let res = `<div style="font-size:10px;color:#64748b;margin-bottom:6px;letter-spacing:0.3px">${timeStr}</div>`
        params.forEach((p: any) => {
          const color = p.color
          const unit = p.seriesName === 'Temperatura' ? '°C' : '%'
          res += `<div style="display:flex;align-items:center;gap:8px;margin-top:3px;font-size:12px">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}80"></span>
            <span style="color:#94a3b8;min-width:82px">${p.seriesName}</span>
            <span style="font-weight:600;color:${color};font-variant-numeric:tabular-nums">${p.value[1].toFixed(1)}${unit}</span>
          </div>`
        })
        return res
      }
    },
    grid: {
      top: 24,
      right: chartMode === 'dual' ? 48 : 24,
      bottom: 52,
      left: 8,
      containLabel: true
    },
    xAxis: {
      type: 'time',
      splitLine: { show: false },
      axisTick: { show: true, lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        hideOverlap: true,
        margin: 12
      },
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } }
    },
    yAxis: [
      {
        type: 'value',
        name: showTemp ? '°C' : '',
        nameTextStyle: { color: '#f97316', fontSize: 10, align: 'right', padding: [0, 4, 0, 0] },
        position: 'left',
        splitLine: { show: true, lineStyle: { color: 'rgba(255, 255, 255, 0.04)', type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10, formatter: (v: number) => v.toFixed(1) },
        min: chartMode === 'temperature' && showThresholds ? (value: any) => Math.min(value.min, th.tempCritLow - 2) : 'dataMin',
        max: chartMode === 'temperature' && showThresholds ? (value: any) => Math.max(value.max, th.tempCritHigh + 2) : 'dataMax',
        show: showTemp
      },
      {
        type: 'value',
        name: showHum ? '%' : '',
        nameTextStyle: { color: '#06b6d4', fontSize: 10, align: 'left', padding: [0, 0, 0, 4] },
        position: 'right',
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10, formatter: (v: number) => v.toFixed(1) },
        min: chartMode === 'humidity' && showThresholds ? (value: any) => Math.min(value.min, th.humCritLow - 2) : 'dataMin',
        max: chartMode === 'humidity' && showThresholds ? (value: any) => Math.max(value.max, th.humCritHigh + 2) : 'dataMax',
        show: showHum
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: false,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'none',
        height: 28,
        bottom: 6,
        borderColor: 'transparent',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        fillerColor: 'rgba(99, 102, 241, 0.12)',
        handleSize: '80%',
        handleStyle: { color: '#475569', borderColor: '#64748b', borderWidth: 1 },
        textStyle: { color: '#64748b', fontSize: 10 },
        dataBackground: {
          lineStyle: { color: 'rgba(148, 163, 184, 0.25)', width: 1 },
          areaStyle: { color: 'rgba(148, 163, 184, 0.06)' }
        },
        selectedDataBackground: {
          lineStyle: { color: 'rgba(99, 102, 241, 0.6)', width: 1 },
          areaStyle: { color: 'rgba(99, 102, 241, 0.12)' }
        },
        brushSelect: false,
        emphasis: {
          handleStyle: { color: '#6366f1', borderColor: '#818cf8' }
        }
      } as any
    ] as any,
    series: [
      ...(showTemp ? [{
        name: 'Temperatura',
        type: 'line' as const,
        data: tempData,
        yAxisIndex: 0,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 4,
        smooth: 0.25,
        sampling: 'lttb',
        itemStyle: { color: '#f97316' },
        lineStyle: { width: 1.5 },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 2.5 },
          itemStyle: { borderWidth: 2, borderColor: '#f97316', color: '#fff' }
        },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(249, 115, 22, 0.20)' },
              { offset: 0.6, color: 'rgba(249, 115, 22, 0.05)' },
              { offset: 1, color: 'rgba(249, 115, 22, 0)' }
            ]
          }
        },
        ...(markAreaTemp ? { markArea: markAreaTemp } : {}),
        ...(markLineTemp ? { markLine: markLineTemp } : {})
      }] : []),
      ...(showHum ? [{
        name: 'Humedad',
        type: 'line' as const,
        data: humData,
        yAxisIndex: showTemp ? 1 : 0,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 4,
        smooth: 0.25,
        sampling: 'lttb',
        itemStyle: { color: '#06b6d4' },
        lineStyle: { width: 1.5 },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 2.5 },
          itemStyle: { borderWidth: 2, borderColor: '#06b6d4', color: '#fff' }
        },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(6, 182, 212, 0.15)' },
              { offset: 0.6, color: 'rgba(6, 182, 212, 0.03)' },
              { offset: 1, color: 'rgba(6, 182, 212, 0)' }
            ]
          }
        },
        ...(markAreaHum ? { markArea: markAreaHum } : {}),
        ...(markLineHum ? { markLine: markLineHum } : {})
      }] : [])
    ] as any
  }

  const lastTs = timeFilteredReadings[timeFilteredReadings.length - 1]?.timestamp
  const nextUpdateTs = sendIntervalSec && lastTs ? lastTs + sendIntervalSec * 1000 : undefined
  const remainingSec = nextUpdateTs ? Math.max(0, Math.ceil((nextUpdateTs - countdownMs) / 1000)) : undefined

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <h4 className="text-xs font-semibold text-foreground tracking-wide">Tendencia</h4>
          <select
            value={chartMode}
            onChange={(e) => setChartMode(e.target.value as ChartMode)}
            className="h-6 rounded-md border border-border/50 bg-background/60 px-1.5 text-[11px] text-muted-foreground"
          >
            <option value="dual">Temp + Humedad</option>
            <option value="temperature">Solo Temperatura</option>
            <option value="humidity">Solo Humedad</option>
          </select>
          {chartMode !== 'dual' && (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showThresholds}
                onChange={() => setShowThresholds(!showThresholds)}
                className="h-3 w-3 accent-primary rounded"
              />
              Umbrales
            </label>
          )}
          <select
            value={timeFilterPreset}
            onChange={(e) => setTimeFilterPreset(e.target.value as 'all' | '15' | '60' | '240' | '1440' | 'custom')}
            className="h-6 rounded-md border border-border/50 bg-background/60 px-1.5 text-[11px] text-muted-foreground"
            title="Filtrar por rango de tiempo"
          >
            <option value="all">Todo tiempo</option>
            <option value="15">Últ. 15 min</option>
            <option value="60">Últ. 1 h</option>
            <option value="240">Últ. 4 h</option>
            <option value="1440">Últ. 24 h</option>
            <option value="custom">Rango fecha/hora</option>
          </select>
          {timeFilterPreset === 'custom' && (
            <>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-6 rounded-md border border-border/50 bg-background/60 px-1.5 text-[11px] text-muted-foreground"
                title="Desde"
              />
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-6 rounded-md border border-border/50 bg-background/60 px-1.5 text-[11px] text-muted-foreground"
                title="Hasta"
              />
            </>
          )}
          {!isMobile && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(CHART_MIN_H, chartH - 24)
                  setChartH(next)
                  persistHeight(next)
                }}
                className="h-6 rounded border border-border/50 bg-background/60 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                Alto -
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(CHART_MAX_H, chartH + 24)
                  setChartH(next)
                  persistHeight(next)
                }}
                className="h-6 rounded border border-border/50 bg-background/60 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                Alto +
              </button>
              <button
                type="button"
                onClick={() => {
                  setChartH(CHART_DEFAULT_H)
                  persistHeight(CHART_DEFAULT_H)
                }}
                className="h-6 rounded border border-border/50 bg-background/60 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            </div>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {timeFilteredReadings.length} muestras
          {timeFilteredReadings.length < normalizedReadings.length && (
            <span className="text-primary/70"> · filtradas de {normalizedReadings.length}</span>
          )}
          {remainingSec != null && <span className="text-primary/70"> · Próx: {remainingSec}s</span>}
        </span>
      </div>

      <div
        ref={containerRef}
        className="w-full rounded-lg bg-gradient-to-b from-muted/30 to-muted/5 overflow-hidden border border-border/20 relative select-none"
        style={{ height: `${chartH}px`, transition: dragState.current.active ? 'none' : 'height 0.2s ease' }}
      >
        <ReactECharts
          key={`${chartMode}-${showThresholds}`}
          option={option}
          style={{ height: '100%', width: '100%' }}
          notMerge={false}
          lazyUpdate={true}
        />

        {!isMobile && (
          <div
            className="absolute bottom-0 left-0 right-0 h-3 flex items-center justify-center cursor-ns-resize bg-gradient-to-t from-muted/60 to-transparent hover:from-muted/90 transition-colors touch-none group"
            title="Arrastrar para redimensionar"
            onPointerDown={onHandleDown}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-muted-foreground/60 transition-colors" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        {showTemp && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> Temperatura
          </span>
        )}
        {showHum && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-500" /> Humedad
          </span>
        )}
        {chartMode !== 'dual' && showThresholds && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${chartMode === 'temperature' ? 'bg-amber-500/60' : 'bg-cyan-500/60'}`} /> Advertencia
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${chartMode === 'temperature' ? 'bg-red-500/60' : 'bg-blue-500/60'}`} /> Peligro
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Tarjeta de dispositivo (componente con estado propio) ── */
function DeviceCard({ device, equipmentById, readingsByEquipment, panelNowMs, navigate }: {
  device: DeviceRow
  equipmentById: Map<string, Equipment>
  readingsByEquipment: Record<string, SensorReading[]>
  panelNowMs: number
  navigate: ReturnType<typeof useNavigate>
}) {
  const isAdmin = useIsAdmin()
  const [showThresholdEditor, setShowThresholdEditor] = useState(false)

  const assignedEquipment = device.assignedEquipmentId ? equipmentById.get(device.assignedEquipmentId) : undefined
  const alert = getTelemetryAlert(device)
  const area = getAreaLabel(assignedEquipment)
  const trendReadings = device.assignedEquipmentId ? readingsByEquipment[device.assignedEquipmentId] : undefined
  const isFresh = isDeviceFresh(device, panelNowMs)
  const latestReading = trendReadings && trendReadings.length > 0 ? trendReadings[trendReadings.length - 1] : undefined
  const telemetryTempTs = device.telemetry?.temperatura?.timestamp ?? 0
  const telemetryHumTs = device.telemetry?.humedad?.timestamp ?? 0
  const readingTs = latestReading?.timestamp ?? 0
  const tempFromTelemetry = telemetryTempTs >= readingTs
  const humFromTelemetry = telemetryHumTs >= readingTs
  const currentTemp = tempFromTelemetry ? device.telemetry?.temperatura?.value : latestReading?.temperature
  const currentHum = humFromTelemetry ? device.telemetry?.humedad?.value : latestReading?.humidity
  const lastUpdateTs = Math.max(
    device.lastSeen ?? 0,
    telemetryTempTs,
    telemetryHumTs,
    readingTs,
  )

  return (
    <Card className={`border-l-4 ${
      alert === 'critical' ? 'border-l-red-500' :
      alert === 'warning' ? 'border-l-amber-500' :
      isFresh ? 'border-l-emerald-500' : 'border-l-muted-foreground/30'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              {device.deviceId}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {assignedEquipment ? `${assignedEquipment.nombre} (${assignedEquipment.codigo})` : 'Sin equipo asignado'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isFresh
                ? 'bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30'
                : 'bg-muted text-muted-foreground ring-1 ring-border'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
              {isFresh ? 'Online' : 'Offline'}
            </span>
            {alert === 'critical' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-500 ring-1 ring-red-500/30">
                <AlertTriangle className="h-3 w-3" /> Crítico
              </span>
            )}
            {alert === 'warning' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-500 ring-1 ring-amber-500/30">
                <AlertTriangle className="h-3 w-3" /> Warning
              </span>
            )}
            {alert === 'normal' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
                Normal
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Link2 className="h-4 w-4" />
          Área: {area}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
            <div className="text-xs text-orange-400/80 flex items-center gap-1.5 mb-1">
              <Thermometer className="h-3.5 w-3.5" />Temperatura
            </div>
            <div className="text-lg font-bold text-orange-400">
              {currentTemp?.toFixed(1) ?? '—'}
              <span className="text-sm font-normal ml-0.5">°C</span>
            </div>
          </div>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="text-xs text-cyan-400/80 flex items-center gap-1.5 mb-1">
              <Droplets className="h-3.5 w-3.5" />Humedad
            </div>
            <div className="text-lg font-bold text-cyan-400">
              {currentHum?.toFixed(1) ?? '—'}
              <span className="text-sm font-normal ml-0.5">%</span>
            </div>
          </div>
        </div>

        <TrendSparkline
          readings={trendReadings}
          sendIntervalSec={device.sendInterval}
          thresholds={device.thresholds}
          deviceId={device.deviceId}
        />

        {/* Editor de umbrales (solo admin) */}
        {isAdmin && (
          showThresholdEditor ? (
            <ThresholdEditor
              deviceId={device.deviceId}
              current={device.thresholds ?? {}}
              onClose={() => setShowThresholdEditor(false)}
            />
          ) : (
            <button
              onClick={() => setShowThresholdEditor(true)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configurar umbrales
            </button>
          )
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Última actualización</span>
          <span>{formatDateTime(lastUpdateTs || undefined)}</span>
        </div>

        {alert !== 'normal' && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Revisar condición anómala y evaluar creación de incidencia.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => navigate('/sensors')}>
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Detalle IoT
          </Button>
          <Button size="sm" className="flex-1 h-9 bg-primary hover:bg-primary/90" onClick={() => navigate('/incidents')}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Incidencias
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SensorsMonitorPage() {
  const canSeeSensors = useCanSee('sensores')
  const navigate = useNavigate()

  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [readingsByEquipment, setReadingsByEquipment] = useState<Record<string, SensorReading[]>>({})
  const [panelNowMs, setPanelNowMs] = useState(() => Date.now())

  useEffect(() => {
    let isMounted = true
    setLoading(true)

    getEquipments()
      .then((rows) => {
        if (!isMounted) return
        setEquipment(rows)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los equipos')
      })

    const unsub = subscribeDevices(
      (rows) => {
        if (!isMounted) return
        setDevices(rows)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'No se pudo leer RTDB de dispositivos')
        setLoading(false)
      }
    )

    return () => {
      isMounted = false
      unsub()
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setPanelNowMs(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  const assignedEquipmentIds = useMemo(() => {
    return [...new Set(devices.map((device) => device.assignedEquipmentId).filter(Boolean) as string[])].sort()
  }, [devices])

  const assignedEquipmentIdsKey = useMemo(
    () => assignedEquipmentIds.join('|'),
    [assignedEquipmentIds]
  )

  useEffect(() => {
    if (!assignedEquipmentIds.length) {
      setReadingsByEquipment({})
      return
    }

    setReadingsByEquipment((prev) => {
      const next: Record<string, SensorReading[]> = {}
      for (const equipmentId of assignedEquipmentIds) {
        if (prev[equipmentId]) next[equipmentId] = prev[equipmentId]
      }
      return next
    })

    const unsubs = assignedEquipmentIds.map((equipmentId) =>
      subscribeSensorReadings(
        equipmentId,
        CHART_HISTORY_LIMIT,
        (rows) => {
          setReadingsByEquipment((prev) => ({
            ...prev,
            [equipmentId]: rows,
          }))
        },
        () => {
          setReadingsByEquipment((prev) => ({
            ...prev,
            [equipmentId]: [],
          }))
        }
      )
    )

    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [assignedEquipmentIds, assignedEquipmentIdsKey])

  // Fallback anti-congelamiento: sondeo periódico por si la suscripción en tiempo real se atasca.
  useEffect(() => {
    if (!assignedEquipmentIds.length) return

    let cancelled = false

    const refreshReadings = async () => {
      const results = await Promise.all(
        assignedEquipmentIds.map(async (equipmentId) => {
          try {
            const rows = await fetchLastSensorReadings(equipmentId, CHART_HISTORY_LIMIT)
            return { equipmentId, rows }
          } catch {
            return { equipmentId, rows: null as SensorReading[] | null }
          }
        })
      )

      if (cancelled) return

      setReadingsByEquipment((prev) => {
        const next = { ...prev }

        for (const { equipmentId, rows } of results) {
          if (!rows || rows.length === 0) continue

          const prevRows = prev[equipmentId] ?? []
          const prevLastTs = prevRows[prevRows.length - 1]?.timestamp ?? 0
          const nextLastTs = rows[rows.length - 1]?.timestamp ?? 0

          if (nextLastTs > prevLastTs || rows.length !== prevRows.length) {
            next[equipmentId] = rows
          }
        }

        return next
      })
    }

    refreshReadings()
    const timer = window.setInterval(refreshReadings, 8000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [assignedEquipmentIds, assignedEquipmentIdsKey])

  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment]
  )

  const areaOptions = useMemo(() => {
    const areas = new Set<string>()
    for (const item of equipment) {
      const area = getAreaLabel(item)
      if (area !== 'Sin área') areas.add(area)
    }
    return [...areas].sort((a, b) => a.localeCompare(b))
  }, [equipment])

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase()

    return devices.filter((device) => {
      const assignedEquipment = device.assignedEquipmentId ? equipmentById.get(device.assignedEquipmentId) : undefined
      const area = getAreaLabel(assignedEquipment)
      const equipmentName = assignedEquipment?.nombre ?? ''
      const equipmentCode = assignedEquipment?.codigo ?? ''

      const passesArea = areaFilter === 'all' || area === areaFilter
      const passesQuery =
        query.length === 0 ||
        device.deviceId.toLowerCase().includes(query) ||
        equipmentName.toLowerCase().includes(query) ||
        equipmentCode.toLowerCase().includes(query) ||
        area.toLowerCase().includes(query)

      return passesArea && passesQuery
    })
  }, [devices, equipmentById, areaFilter, search])

  const metrics = useMemo(() => {
    let online = 0
    let warning = 0
    let critical = 0
    let unassigned = 0

    for (const device of devices) {
      if (isDeviceFresh(device, panelNowMs)) online += 1
      const alert = getTelemetryAlert(device)
      if (alert === 'warning') warning += 1
      if (alert === 'critical') critical += 1
      if (!device.assignedEquipmentId) unassigned += 1
    }

    return {
      total: devices.length,
      online,
      warning,
      critical,
      unassigned,
    }
  }, [devices, panelNowMs])

  if (!canSeeSensors) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Panel Técnico de Sensores
          </h1>
          <p className="text-sm text-muted-foreground">Monitoreo operativo en tiempo real para técnicos de planta.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/sensors')}>
          Ir a gestión IoT completa
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Dispositivos</p>
                <p className="text-2xl font-bold">{metrics.total}</p>
              </div>
              <Cpu className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Online</p>
                <p className="text-2xl font-bold text-emerald-500">{metrics.online}</p>
              </div>
              <Activity className="h-8 w-8 text-emerald-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Warning</p>
                <p className="text-2xl font-bold text-amber-500">{metrics.warning}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Crítico</p>
                <p className="text-2xl font-bold text-red-500">{metrics.critical}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sin asignar</p>
                <p className="text-2xl font-bold text-slate-500">{metrics.unassigned}</p>
              </div>
              <Link2 className="h-8 w-8 text-slate-500/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por deviceId, equipo o área"
          />
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Todas las áreas</option>
            {areaOptions.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {loading && <Card><CardContent className="py-8 text-sm text-muted-foreground">Cargando panel...</CardContent></Card>}

      {error && (
        <Card className="border-red-400">
          <CardContent className="py-4 text-sm text-red-600">Error de monitoreo: {error}</CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {filteredDevices.map((device) => (
          <DeviceCard
            key={device.deviceId}
            device={device}
            equipmentById={equipmentById}
            readingsByEquipment={readingsByEquipment}
            panelNowMs={panelNowMs}
            navigate={navigate}
          />
        ))}
      </div>

      {!loading && filteredDevices.length === 0 && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">No hay dispositivos para el filtro aplicado.</CardContent>
        </Card>
      )}
    </div>
  )
}
