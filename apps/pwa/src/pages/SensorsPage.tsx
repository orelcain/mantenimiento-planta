import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Link2, Unlink2, AlertTriangle, Thermometer, Droplets, Activity, X, BarChart3, Wifi, Trash2, ChevronDown, ChevronUp, Eye, EyeOff, Copy, RefreshCw, Check, Usb, Lightbulb, MapPin, LineChart, Crosshair, Radar, Grid3x3, CandlestickChart, Clock, CalendarDays, Signal, Lock, Globe, ChevronsDown, AreaChart, ScatterChart, Gauge, Layers, Loader2, SearchX } from 'lucide-react'
import { Pill } from '@/components/piel'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import type { Equipment } from '@/types'
import type { DeviceRow } from '@/services/devicesRtdb'
import type { SensorSummaryNode } from '@/services/sensorsRtdb'
import { assignDeviceToEquipment, subscribeDevices, deleteDevice } from '@/services/devicesRtdb'
import { subscribeSensorSummary } from '@/services/sensorsRtdb'
import { saveApConfig } from '@/services/apConfigRtdb'
import { saveSendInterval, saveWifiConfig, requestWifiScan } from '@/services/deviceConfigRtdb'
import { useUsbDetection } from '@/hooks/useUsbDetection'
import { getEquipments } from '@/services/equipment'
import { TelemetryChart, type ChartType } from '@/components/telemetry/TelemetryChart'
import { TelemetryExportDialog } from '@/components/telemetry/TelemetryExportDialog'
import { useTelemetryHistory, type TimeRange } from '@/hooks/useTelemetryHistory'
import { logger } from '@/lib/logger'

function normalizeTs(ts: number | undefined): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  if (ts > 0 && ts < 1e12) return ts * 1000
  return ts
}

function isDeviceFresh(device: Pick<DeviceRow, 'online' | 'lastSeen' | 'sendInterval'> | null | undefined, nowMs: number): boolean {
  if (!device?.online) return false
  const lastSeen = normalizeTs(device.lastSeen)
  if (!lastSeen) return false
  const intervalSec = device.sendInterval && device.sendInterval > 0 ? device.sendInterval : 10
  const freshnessWindowMs = Math.max(30_000, intervalSec * 3_000)
  return nowMs - lastSeen <= freshnessWindowMs
}

function formatDateTime(timestamp: number | Date | undefined): string {
  if (!timestamp) return '—'
  
  try {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
    
    // Validar que la fecha sea válida
    if (isNaN(date.getTime())) return 'Fecha inválida'
    
    // Verificar que la fecha esté en un rango razonable (2020-2035)
    // Ampliado el rango para ser más permisivo
    const year = date.getFullYear()
    if (year < 2020 || year > 2035) {
      // En lugar de mostrar "Fecha inválida", intentar normalizar si parece timestamp en segundos
      if (typeof timestamp === 'number') {
        const normalizedDate = new Date(timestamp * 1000)
        if (!isNaN(normalizedDate.getTime()) && normalizedDate.getFullYear() >= 2020 && normalizedDate.getFullYear() <= 2035) {
          return normalizedDate.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        }
      }
      // Silencioso en producción - no inundar consola
      return '—'
    }
    
    // Formatear con zona horaria local del usuario
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch (err) {
    logger.error('Error formateando fecha', err instanceof Error ? err : new Error(String(err)))
    return '—'
  }
}

function toEquipmentSearchText(e: Equipment): string {
  return `${e.nombre} ${e.codigo} ${e.hierarchyPath ?? ''} ${e.zonePath?.join(' ') ?? ''}`
    .toLowerCase()
    .trim()
}

function onlineBadge(online: boolean | undefined) {
  if (online) return <Badge variant="default">Online</Badge>
  return <Badge variant="secondary">Sin datos recientes</Badge>
}

export function SensorsPage() {
  const navigate = useNavigate()
  const equipmentStore = useAppStore((s) => s.equipment)
  const user = useAuthStore((s) => s.user)

  // Estado local para equipment (cargar si store vacío)
  const [equipment, setEquipment] = useState<Equipment[]>(equipmentStore)
  const [loadingEquipment, setLoadingEquipment] = useState(false)
  const loadedRef = useRef(false) // Flag para evitar cargas repetidas

  // Cargar equipment si el store está vacío (solo una vez)
  useEffect(() => {
    // Si ya se cargó o está cargando, no hacer nada
    if (loadedRef.current || loadingEquipment) return

    if (equipmentStore.length > 0) {
      setEquipment(equipmentStore)
      loadedRef.current = true
    } else {
      setLoadingEquipment(true)
      loadedRef.current = true
      getEquipments()
        .then((data) => {
          setEquipment(data)
        })
        .catch((err) => {
          logger.error('SensorsPage: Error cargando equipment', err instanceof Error ? err : new Error(String(err)))
        })
        .finally(() => {
          setLoadingEquipment(false)
        })
    }
  }, [equipmentStore, loadingEquipment])

  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sensorData, setSensorData] = useState<SensorSummaryNode | null>(null)

  const [deviceSearch, setDeviceSearch] = useState('')

  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<Equipment['estado'] | 'todas'>('todas')
  const [filterCriticidad, setFilterCriticidad] = useState<Equipment['criticidad'] | 'todas'>('todas')
  const [filterPlanta, setFilterPlanta] = useState<string>('todas')
  const [filterSector, setFilterSector] = useState<string>('todas')
  const [filterArea, setFilterArea] = useState<string>('todas')
  const [filterNivel4, setFilterNivel4] = useState<string>('todas')
  const [filterNivel5, setFilterNivel5] = useState<string>('todas')
  const [filterNivel6, setFilterNivel6] = useState<string>('todas')
  const [filterNivel7, setFilterNivel7] = useState<string>('todas')
  const [filterSinSensor, setFilterSinSensor] = useState(false)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)

  // Estado para configuración AP
  const [apEnabled, setApEnabled] = useState(true)
  const [apSsid, setApSsid] = useState('')
  const [apPassword, setApPassword] = useState('')
  const [showApPassword, setShowApPassword] = useState(false)
  const [savingAp, setSavingAp] = useState(false)
  const [apSaveError, setApSaveError] = useState<string | null>(null)
  const [apSaveOk, setApSaveOk] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<'ssid' | 'password' | 'otaHost' | 'otaPassword' | null>(null)

  // Estado para intervalo de lectura
  const [sendInterval, setSendInterval] = useState(10) // por defecto 10 segundos
  const [savingInterval, setSavingInterval] = useState(false)
  const [intervalSaveError, setIntervalSaveError] = useState<string | null>(null)
  const [intervalSaveOk, setIntervalSaveOk] = useState<string | null>(null)
  const [isIntervalExpanded, setIsIntervalExpanded] = useState(false)

  // Estado para WiFi principal (STA)
  const [wifiStaSsid, setWifiStaSsid] = useState('')
  const [wifiStaPassword, setWifiStaPassword] = useState('')
  const [savingWifi, setSavingWifi] = useState(false)
  const [wifiSaveError, setWifiSaveError] = useState<string | null>(null)
  const [wifiSaveOk, setWifiSaveOk] = useState<string | null>(null)
  const [scanningWifi, setScanningWifi] = useState(false)
  const [wifiScanError, setWifiScanError] = useState<string | null>(null)
  const [lastScanTs, setLastScanTs] = useState<number | null>(null)

  // Estado para eliminar dispositivos
  const [deletingDevice, setDeletingDevice] = useState<string | null>(null)

  const [panelNowMs, setPanelNowMs] = useState<number>(() => Date.now())

  // Estado para colapsar/expandir sección de Emparejar
  const [isPairingExpanded, setIsPairingExpanded] = useState(true)
  
  // Estado para colapsar/expandir sección de WiFi AP
  const [isWifiApExpanded, setIsWifiApExpanded] = useState(false)

  // Estado para el gráfico de telemetría
  const [showChart, setShowChart] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('dual-axis')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')

  // Hook de detección USB
  const { connectedDevices: usbDevices, isSupported: usbSupported, error: usbError, requestDevice } = useUsbDetection()

  useEffect(() => {
    const unsub = subscribeDevices(
      (rows) => {
        setDevices(rows)
        setLoadError(null) // Limpiar error si la suscripción funciona
        // Auto seleccionar el primer dispositivo si no hay selección.
        if (!selectedDeviceId && rows[0]?.deviceId) {
          setSelectedDeviceId(rows[0].deviceId)
        }
      },
      (err) => {
        logger.error('SensorsPage: Error suscripción devices', err instanceof Error ? err : new Error(String(err)))
        const errorMsg = err instanceof Error ? err.message : 'Error leyendo dispositivos de Firebase RTDB'
        setLoadError(`${errorMsg}. Verifica que estés autenticado y que las reglas RTDB permitan lectura.`)
      }
    )

    return () => {
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setPanelNowMs(Date.now()), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const filteredDevices = useMemo(() => {
    const q = deviceSearch.trim().toLowerCase()
    if (!q) return devices
    return devices.filter((d) => d.deviceId.toLowerCase().includes(q))
  }, [deviceSearch, devices])

  const selectedDevice = useMemo(
    () => devices.find((d) => d.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  )

  const selectedDeviceIsFresh = useMemo(
    () => isDeviceFresh(selectedDevice, panelNowMs),
    [selectedDevice, panelNowMs]
  )

  const otaHostname = selectedDevice?.deviceId ? `esp32-${selectedDevice.deviceId.slice(-6)}` : ''
  const otaHostLabel = otaHostname ? `${otaHostname}.local` : ''
  // La password OTA de los ESP32 ya NO se embebe en el bundle (VITE_OTA_PASSWORD
  // horneaba la password real en el JS público, visible a cualquier usuario
  // autenticado en /sensors, sin ni siquiera exigir rol admin). Ahora se pide
  // bajo demanda a getOtaPasswordProxy, que verifica rol admin server-side.
  const [otaPassword, setOtaPassword] = useState('')
  const [otaPasswordState, setOtaPasswordState] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const fetchOtaPassword = async () => {
    setOtaPasswordState('loading')
    try {
      const { httpsCallable, getFunctions } = await import('firebase/functions')
      const { default: app } = await import('@/services/firebase')
      const proxy = httpsCallable(getFunctions(app), 'getOtaPasswordProxy')
      const result = await proxy({})
      const data = result.data as { password?: string }
      setOtaPassword(data.password || '')
      setOtaPasswordState('ok')
    } catch {
      setOtaPasswordState('error')
    }
  }

  const getRssiQuality = (rssi: number | undefined, online: boolean | undefined) => {
    if (!online) return 'Sin señal'
    if (typeof rssi !== 'number' || rssi === 0) return 'Sin señal'
    if (rssi >= -50) return 'Excelente'
    if (rssi >= -60) return 'Buena'
    if (rssi >= -70) return 'Regular'
    if (rssi >= -80) return 'Mala'
    return 'Sin señal'
  }

  const getRssiQualityClass = (rssi: number | undefined, online: boolean | undefined) => {
    const q = getRssiQuality(rssi, online)
    switch (q) {
      case 'Excelente':
        return 'text-ink-ok'
      case 'Buena':
        return 'text-ink-ok'
      case 'Regular':
        return 'text-ink-warn'
      case 'Mala':
        return 'text-cat-4-ink'
      default:
        return 'text-ink-crit'
    }
  }

  const getRssiBarClass = (rssi: number | undefined, online: boolean | undefined) => {
    const q = getRssiQuality(rssi, online)
    switch (q) {
      case 'Excelente':
        return 'bg-emerald-500'
      case 'Buena':
        return 'bg-green-500'
      case 'Regular':
        return 'bg-amber-500'
      case 'Mala':
        return 'bg-orange-500'
      default:
        return 'bg-red-500'
    }
  }

  const getRssiBarWidth = (rssi: number | undefined, online: boolean | undefined) => {
    const q = getRssiQuality(rssi, online)
    switch (q) {
      case 'Excelente':
        return 'w-full'
      case 'Buena':
        return 'w-4/5'
      case 'Regular':
        return 'w-3/5'
      case 'Mala':
        return 'w-2/5'
      default:
        return 'w-1/5'
    }
  }

  const getRssiRateEstimate = (rssi: number | undefined, online: boolean | undefined) => {
    if (!online) return 'Sin señal'
    if (typeof rssi !== 'number' || rssi === 0) return 'Sin señal'
    if (rssi >= -40) return 'R1 (≥150 Mbps)'
    if (rssi >= -43) return 'R2 (130–150 Mbps)'
    if (rssi >= -46) return 'R3 (110–130 Mbps)'
    if (rssi >= -49) return 'R4 (90–110 Mbps)'
    if (rssi >= -52) return 'R5 (75–90 Mbps)'
    if (rssi >= -55) return 'R6 (65–75 Mbps)'
    if (rssi >= -58) return 'R7 (55–65 Mbps)'
    if (rssi >= -61) return 'R8 (45–55 Mbps)'
    if (rssi >= -64) return 'R9 (38–45 Mbps)'
    if (rssi >= -67) return 'R10 (32–38 Mbps)'
    if (rssi >= -70) return 'R11 (26–32 Mbps)'
    if (rssi >= -73) return 'R12 (20–26 Mbps)'
    if (rssi >= -76) return 'R13 (15–20 Mbps)'
    if (rssi >= -79) return 'R14 (11–15 Mbps)'
    if (rssi >= -82) return 'R15 (8–11 Mbps)'
    if (rssi >= -85) return 'R16 (6–8 Mbps)'
    if (rssi >= -88) return 'R17 (4–6 Mbps)'
    if (rssi >= -91) return 'R18 (3–4 Mbps)'
    if (rssi >= -94) return 'R19 (2–3 Mbps)'
    if (rssi >= -97) return 'R20 (1–2 Mbps)'
    return 'Sin señal (<1 Mbps)'
  }

  // Cargar configuración AP actual del dispositivo seleccionado
  useEffect(() => {
    if (selectedDevice) {
      setApEnabled(selectedDevice.apEnabled ?? true)
      setApSsid(selectedDevice.apSsid || '')
      setApPassword(selectedDevice.apPassword || '')
    } else {
      setApSsid('')
      setApPassword('')
      setApEnabled(true)
    }
  }, [selectedDevice])

  // Cargar WiFi principal actual (solo SSID) al cambiar dispositivo
  useEffect(() => {
    if (selectedDevice) {
      setWifiStaSsid(selectedDevice.wifiSsid || '')
      setWifiStaPassword('')
    } else {
      setWifiStaSsid('')
      setWifiStaPassword('')
    }
  }, [selectedDevice])

  // Cargar intervalo de lectura del dispositivo seleccionado
  useEffect(() => {
    if (selectedDevice) {
      setSendInterval(selectedDevice.sendInterval ?? 10)
    } else {
      setSendInterval(10)
    }
  }, [selectedDevice])

  // Función para generar contraseña segura
  const generateSecurePassword = () => {
    const length = 12
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&'
    let password = ''
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    for (let i = 0; i < length; i++) {
      password += charset[array[i]! % charset.length]
    }
    setApPassword(password)
    setShowApPassword(true)
  }

  // Función para copiar al portapapeles
  const copyToClipboard = async (text: string, field: 'ssid' | 'password' | 'otaHost' | 'otaPassword') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      logger.error('Error copiando al portapapeles', err instanceof Error ? err : new Error(String(err)))
    }
  }

  // Auto-seleccionar dispositivo cuando se detecta por USB
  useEffect(() => {
    if (usbDevices.length > 0 && usbDevices[0]) {
      const detectedMac = usbDevices[0].deviceId
      const matchingDevice = devices.find(d => d.deviceId.toUpperCase() === detectedMac.toUpperCase())
      
      if (matchingDevice) {
        setSelectedDeviceId(matchingDevice.deviceId)
      }
    }
  }, [usbDevices, devices])

  const assignedEquipment = useMemo(() => {
    const id = selectedDevice?.assignedEquipmentId
    if (!id) return null
    return equipment.find((e) => e.id === id) ?? null
  }, [equipment, selectedDevice?.assignedEquipmentId])

  // Finalizar estado de escaneo cuando llegan nuevos resultados
  useEffect(() => {
    const ts = selectedDevice?.wifiScan?.ts ?? null
    if (ts && ts !== lastScanTs) {
      setLastScanTs(ts)
      setScanningWifi(false)
      setWifiScanError(null)
    }
  }, [selectedDevice?.wifiScan?.ts, lastScanTs])

  // Suscribirse a telemetría del sensor cuando hay equipo asignado
  useEffect(() => {
    if (!assignedEquipment?.id) {
      setSensorData(null)
      return
    }

    const unsub = subscribeSensorSummary(
      assignedEquipment.id,
      (data) => {
        setSensorData(data)
      },
      (err) => {
        logger.error('SensorsPage: Error telemetría equipo', err instanceof Error ? err : new Error(String(err)))
      }
    )

    return () => unsub()
  }, [assignedEquipment?.id])

  // Telemetría para mostrar: priorizar la del dispositivo (devices/{id}/telemetry) sobre sensors/{equipmentId}
  // useMemo con comparación profunda para evitar re-renders innecesarios
  const displayTelemetry = useMemo(() => {
    // Si el dispositivo tiene telemetría directa, usarla
    if (selectedDevice?.telemetry) {
      return {
        temperatura: selectedDevice.telemetry.temperatura,
        humedad: selectedDevice.telemetry.humedad,
        online: selectedDeviceIsFresh,
        lastSeen: selectedDevice.lastSeen,
        source: selectedDevice.telemetry.source || 'device'
      }
    }
    // Si no, usar la del equipo asignado (sensors/{equipmentId})
    if (sensorData) {
      return {
        ...sensorData,
        source: 'equipment'
      }
    }
    return null
  }, [
    // Solo depender de los valores que realmente importan
    selectedDevice?.telemetry,
    selectedDeviceIsFresh,
    selectedDevice?.lastSeen,
    sensorData
  ])

  // Hook para obtener historial de telemetría (datos simulados por ahora)
  const { data: historyData, loading: historyLoading } = useTelemetryHistory(
    assignedEquipment?.id ?? null,
    displayTelemetry?.temperatura?.value,
    displayTelemetry?.humedad?.value,
    timeRange
  )

  const filteredEquipment = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase()
    
    // Obtener equipos con sensores asignados
    const equiposConSensor = new Set(devices.filter(d => d.assignedEquipmentId).map(d => d.assignedEquipmentId))
    
    return equipment.filter((e) => {
      // Filtro de estado
      if (filterEstado !== 'todas' && e.estado !== filterEstado) return false
      
      // Filtro de criticidad
      if (filterCriticidad !== 'todas' && e.criticidad !== filterCriticidad) return false
      
      // Filtro "solo sin sensor"
      if (filterSinSensor && equiposConSensor.has(e.id)) return false
      
      // Filtros jerárquicos
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        
        if (filterPlanta !== 'todas') {
          const planta = parts[0]
          if (!planta || !planta.toLowerCase().includes(filterPlanta.toLowerCase())) return false
        }
        
        if (filterSector !== 'todas' && parts.length > 1) {
          const sector = parts[1]
          if (!sector || !sector.toLowerCase().includes(filterSector.toLowerCase())) return false
        }
        
        if (filterArea !== 'todas' && parts.length > 2) {
          const area = parts[2]
          if (!area || !area.toLowerCase().includes(filterArea.toLowerCase())) return false
        }
        
        if (filterNivel4 !== 'todas' && parts.length > 3) {
          const nivel4 = parts[3]
          if (!nivel4 || !nivel4.toLowerCase().includes(filterNivel4.toLowerCase())) return false
        }
        
        if (filterNivel5 !== 'todas' && parts.length > 4) {
          const nivel5 = parts[4]
          if (!nivel5 || !nivel5.toLowerCase().includes(filterNivel5.toLowerCase())) return false
        }
        
        if (filterNivel6 !== 'todas' && parts.length > 5) {
          const nivel6 = parts[5]
          if (!nivel6 || !nivel6.toLowerCase().includes(filterNivel6.toLowerCase())) return false
        }
        
        if (filterNivel7 !== 'todas' && parts.length > 6) {
          const nivel7 = parts[6]
          if (!nivel7 || !nivel7.toLowerCase().includes(filterNivel7.toLowerCase())) return false
        }
      } else if (filterPlanta !== 'todas' || filterSector !== 'todas' || filterArea !== 'todas' || filterNivel4 !== 'todas' || filterNivel5 !== 'todas' || filterNivel6 !== 'todas' || filterNivel7 !== 'todas') {
        // Si no tiene hierarchyPath y hay filtros jerárquicos activos, excluir
        return false
      }
      
      // Búsqueda por texto
      if (!q) return true
      return toEquipmentSearchText(e).includes(q)
    })
  }, [equipment, equipmentSearch, filterCriticidad, filterEstado, filterPlanta, filterSector, filterArea, filterNivel4, filterNivel5, filterNivel6, filterNivel7, filterSinSensor, devices])

  // Extraer opciones únicas de jerarquía (en cascada: padre → hijo)
  const plantasDisponibles = useMemo(() => {
    const plantas = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        if (parts[0]) plantas.add(parts[0])
      }
    })
    return Array.from(plantas).sort()
  }, [equipment])

  const sectoresDisponibles = useMemo(() => {
    const sectores = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        // Solo incluir sectores de la planta seleccionada
        if (filterPlanta !== 'todas') {
          if (parts[0] === filterPlanta && parts[1]) {
            sectores.add(parts[1])
          }
        } else {
          if (parts[1]) sectores.add(parts[1])
        }
      }
    })
    return Array.from(sectores).sort()
  }, [equipment, filterPlanta])

  const areasDisponibles = useMemo(() => {
    const areas = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        // Solo incluir áreas del sector seleccionado (y planta si aplica)
        if (filterSector !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          if (matchPlanta && parts[1] === filterSector && parts[2]) {
            areas.add(parts[2])
          }
        } else if (filterPlanta !== 'todas') {
          if (parts[0] === filterPlanta && parts[2]) {
            areas.add(parts[2])
          }
        } else {
          if (parts[2]) areas.add(parts[2])
        }
      }
    })
    return Array.from(areas).sort()
  }, [equipment, filterPlanta, filterSector])

  const nivel4Disponibles = useMemo(() => {
    const nivel4 = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        // Solo incluir nivel4 del área seleccionada (y niveles superiores si aplican)
        if (filterArea !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          if (matchPlanta && matchSector && parts[2] === filterArea && parts[3]) {
            nivel4.add(parts[3])
          }
        } else if (filterSector !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          if (matchPlanta && parts[1] === filterSector && parts[3]) {
            nivel4.add(parts[3])
          }
        } else if (filterPlanta !== 'todas') {
          if (parts[0] === filterPlanta && parts[3]) {
            nivel4.add(parts[3])
          }
        } else {
          if (parts[3]) nivel4.add(parts[3])
        }
      }
    })
    return Array.from(nivel4).sort()
  }, [equipment, filterPlanta, filterSector, filterArea])

  const nivel5Disponibles = useMemo(() => {
    const nivel5 = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        // Solo incluir nivel5 del nivel4 seleccionado (y niveles superiores)
        if (filterNivel4 !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          const matchArea = filterArea === 'todas' || parts[2] === filterArea
          if (matchPlanta && matchSector && matchArea && parts[3] === filterNivel4 && parts[4]) {
            nivel5.add(parts[4])
          }
        } else if (filterArea !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          if (matchPlanta && matchSector && parts[2] === filterArea && parts[4]) {
            nivel5.add(parts[4])
          }
        } else if (filterSector !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          if (matchPlanta && parts[1] === filterSector && parts[4]) {
            nivel5.add(parts[4])
          }
        } else if (filterPlanta !== 'todas') {
          if (parts[0] === filterPlanta && parts[4]) {
            nivel5.add(parts[4])
          }
        } else {
          if (parts[4]) nivel5.add(parts[4])
        }
      }
    })
    return Array.from(nivel5).sort()
  }, [equipment, filterPlanta, filterSector, filterArea, filterNivel4])

  const nivel6Disponibles = useMemo(() => {
    const nivel6 = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        // Solo incluir nivel6 del nivel5 seleccionado (y niveles superiores)
        if (filterNivel5 !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          const matchArea = filterArea === 'todas' || parts[2] === filterArea
          const matchNivel4 = filterNivel4 === 'todas' || parts[3] === filterNivel4
          if (matchPlanta && matchSector && matchArea && matchNivel4 && parts[4] === filterNivel5 && parts[5]) {
            nivel6.add(parts[5])
          }
        } else if (filterNivel4 !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          const matchArea = filterArea === 'todas' || parts[2] === filterArea
          if (matchPlanta && matchSector && matchArea && parts[3] === filterNivel4 && parts[5]) {
            nivel6.add(parts[5])
          }
        } else if (filterArea !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          if (matchPlanta && matchSector && parts[2] === filterArea && parts[5]) {
            nivel6.add(parts[5])
          }
        } else if (filterSector !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          if (matchPlanta && parts[1] === filterSector && parts[5]) {
            nivel6.add(parts[5])
          }
        } else if (filterPlanta !== 'todas') {
          if (parts[0] === filterPlanta && parts[5]) {
            nivel6.add(parts[5])
          }
        } else {
          if (parts[5]) nivel6.add(parts[5])
        }
      }
    })
    return Array.from(nivel6).sort()
  }, [equipment, filterPlanta, filterSector, filterArea, filterNivel4, filterNivel5])

  const nivel7Disponibles = useMemo(() => {
    const nivel7 = new Set<string>()
    equipment.forEach(e => {
      if (e.hierarchyPath) {
        const parts = e.hierarchyPath.split(' > ')
        // Solo incluir nivel7 del nivel6 seleccionado (y niveles superiores)
        if (filterNivel6 !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          const matchArea = filterArea === 'todas' || parts[2] === filterArea
          const matchNivel4 = filterNivel4 === 'todas' || parts[3] === filterNivel4
          const matchNivel5 = filterNivel5 === 'todas' || parts[4] === filterNivel5
          if (matchPlanta && matchSector && matchArea && matchNivel4 && matchNivel5 && parts[5] === filterNivel6 && parts[6]) {
            nivel7.add(parts[6])
          }
        } else if (filterNivel5 !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          const matchArea = filterArea === 'todas' || parts[2] === filterArea
          const matchNivel4 = filterNivel4 === 'todas' || parts[3] === filterNivel4
          if (matchPlanta && matchSector && matchArea && matchNivel4 && parts[4] === filterNivel5 && parts[6]) {
            nivel7.add(parts[6])
          }
        } else if (filterNivel4 !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          const matchArea = filterArea === 'todas' || parts[2] === filterArea
          if (matchPlanta && matchSector && matchArea && parts[3] === filterNivel4 && parts[6]) {
            nivel7.add(parts[6])
          }
        } else if (filterArea !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          const matchSector = filterSector === 'todas' || parts[1] === filterSector
          if (matchPlanta && matchSector && parts[2] === filterArea && parts[6]) {
            nivel7.add(parts[6])
          }
        } else if (filterSector !== 'todas') {
          const matchPlanta = filterPlanta === 'todas' || parts[0] === filterPlanta
          if (matchPlanta && parts[1] === filterSector && parts[6]) {
            nivel7.add(parts[6])
          }
        } else if (filterPlanta !== 'todas') {
          if (parts[0] === filterPlanta && parts[6]) {
            nivel7.add(parts[6])
          }
        } else {
          if (parts[6]) nivel7.add(parts[6])
        }
      }
    })
    return Array.from(nivel7).sort()
  }, [equipment, filterPlanta, filterSector, filterArea, filterNivel4, filterNivel5, filterNivel6])

  async function saveAssignment(equipmentId: string | null) {
    if (!user?.id) return
    if (!selectedDevice) return

    setSaveError(null)
    setSaveOk(null)
    setSaving(true)

    try {
      await assignDeviceToEquipment({ deviceId: selectedDevice.deviceId, equipmentId, userId: user.id })
      setSaveOk(equipmentId ? 'Asignación guardada.' : 'Asignación eliminada.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error guardando asignación (RTDB).')
    } finally {
      setSaving(false)
    }
  }

  async function saveApConfiguration() {
    if (!selectedDevice) return

    setApSaveError(null)
    setApSaveOk(null)
    setSavingAp(true)

    try {
      await saveApConfig(selectedDevice.deviceId, {
        enabled: apEnabled,
        ssid: apSsid.trim() || undefined,
        password: apPassword.trim() || undefined
      })
      setApSaveOk('✓ Configuración AP enviada al dispositivo')
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setApSaveOk(null), 3000)
    } catch (err) {
      setApSaveError(err instanceof Error ? err.message : 'Error guardando configuración AP')
    } finally {
      setSavingAp(false)
    }
  }

  async function saveWifiConfiguration() {
    if (!selectedDevice) return
    if (!wifiStaSsid.trim()) {
      setWifiSaveError('Debes ingresar un SSID válido')
      return
    }

    setWifiSaveError(null)
    setWifiSaveOk(null)
    setSavingWifi(true)

    try {
      await saveWifiConfig(selectedDevice.deviceId, {
        ssid: wifiStaSsid.trim(),
        password: wifiStaPassword.trim() || undefined,
        reconnect: true,
      })
      setWifiSaveOk('✓ WiFi enviada al dispositivo (intentará reconectar)')
      setTimeout(() => setWifiSaveOk(null), 3000)
    } catch (err) {
      setWifiSaveError(err instanceof Error ? err.message : 'Error guardando WiFi')
    } finally {
      setSavingWifi(false)
    }
  }

  async function handleWifiScan() {
    if (!selectedDevice) return
    setWifiScanError(null)
    setScanningWifi(true)
    try {
      await requestWifiScan(selectedDevice.deviceId)
    } catch (err) {
      setScanningWifi(false)
      setWifiScanError(err instanceof Error ? err.message : 'Error solicitando escaneo')
    }
  }

  async function saveIntervalConfiguration() {
    if (!selectedDevice) return

    setIntervalSaveError(null)
    setIntervalSaveOk(null)
    setSavingInterval(true)

    try {
      await saveSendInterval(selectedDevice.deviceId, sendInterval)
      setIntervalSaveOk(`✓ Intervalo configurado a ${sendInterval}s`)
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setIntervalSaveOk(null), 3000)
    } catch (err) {
      setIntervalSaveError(err instanceof Error ? err.message : 'Error guardando intervalo')
    } finally {
      setSavingInterval(false)
    }
  }

  async function handleDeleteDevice(deviceId: string) {
    if (!confirm(`¿Seguro que quieres eliminar el dispositivo ${deviceId}?\n\nEsta acción no se puede deshacer.`)) {
      return
    }

    setDeletingDevice(deviceId)
    try {
      await deleteDevice(deviceId)
      // Si era el dispositivo seleccionado, limpiar selección
      if (deviceId === selectedDeviceId) {
        setSelectedDeviceId('')
      }
    } catch (err) {
      logger.error('SensorsPage: Error eliminando dispositivo', err instanceof Error ? err : new Error(String(err)))
      alert(err instanceof Error ? err.message : 'Error eliminando dispositivo')
    } finally {
      setDeletingDevice(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Sensores IoT</h1>
          <p className="text-muted-foreground">
            Gestiona dispositivos ESP32, visualiza telemetría en tiempo real y configura WiFi local (AP).
          </p>
        </div>
        <Button className="hidden md:inline-flex" onClick={() => navigate('/sensors/monitor')}>
          Abrir panel técnico
        </Button>
      </div>

      <div className="md:hidden sticky top-16 z-20 bg-background/95 backdrop-blur border-b pb-3">
        <Button className="w-full" onClick={() => navigate('/sensors/monitor')}>
          Panel técnico
        </Button>
      </div>

      {loadError && (
        <div className="rounded-ctl border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-destructive">Error de conexión</div>
              <div className="text-sm text-destructive/90 mt-1">{loadError}</div>
              <div className="text-xs text-muted-foreground mt-2">
                • Verifica que estés autenticado en Firebase
                <br />
                • Revisa que el ESP32 esté encendido y conectado
                <br />• Comprueba las reglas de seguridad de Firebase RTDB
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info rápida de estado */}
      {!loadError && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Dispositivos</div>
                  <div className="text-2xl font-bold">{devices.length}</div>
                </div>
                <Cpu className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Online</div>
                  <div className="text-2xl font-bold text-ink-ok">
                    {devices.filter((d) => isDeviceFresh(d, panelNowMs)).length}
                  </div>
                </div>
                <Activity className="h-8 w-8 text-ink-ok" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Asignados</div>
                  <div className="text-2xl font-bold text-primary">
                    {devices.filter(d => d.assignedEquipmentId).length}
                  </div>
                </div>
                <Link2 className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Layout principal */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Columna izquierda: Lista de dispositivos */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                Dispositivos ESP32
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {devices.length === 0 ? (
                <div className="text-center py-8">
                  <Cpu className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <div className="text-sm font-medium">No hay dispositivos detectados</div>
                  <div className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">
                    Verifica que tu ESP32 esté encendido, conectado a WiFi y publicando en Firebase RTDB.
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label>Buscar dispositivo</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={deviceSearch}
                        onChange={(e) => setDeviceSearch(e.target.value)}
                        placeholder="Buscar por ID (MAC)…"
                        className="flex-1"
                        autoComplete="one-time-code"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        type="text"
                        name={`device-search-${Date.now()}`}
                        data-lpignore="true"
                        data-form-type="other"
                      />
                      {usbSupported && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={requestDevice}
                          className="gap-2 shrink-0"
                          title="Detectar dispositivo conectado por USB"
                        >
                          <Usb className="h-4 w-4" />
                          USB
                        </Button>
                      )}
                      {deviceSearch && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeviceSearch('')}
                          className="px-3"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {filteredDevices.length} de {devices.length} dispositivo(s)
                      {deviceSearch && filteredDevices.length === 0 && (
                        <span className="text-ink-warn ml-2">
                          • No hay resultados, limpia el filtro
                        </span>
                      )}
                      {usbDevices.length > 0 && (
                        <span className="text-ink-ok ml-2">
                          • {usbDevices.length} USB detectado(s)
                        </span>
                      )}
                      {usbError && (
                        <span className="text-ink-crit ml-2">
                          • {usbError}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-auto">
                    {filteredDevices.map((d) => {
                      const lastSeen = normalizeTs(d.lastSeen)
                      const isFresh = isDeviceFresh(d, panelNowMs)
                      const isSelected = d.deviceId === selectedDeviceId
                      const assignedEquip = d.assignedEquipmentId 
                        ? equipment.find((e) => e.id === d.assignedEquipmentId)
                        : null
                      const isDeleting = deletingDevice === d.deviceId
                      
                      return (
                        <div
                          key={d.deviceId}
                          className={`rounded-card border transition-all ${
                            isSelected 
                              ? 'border-primary bg-primary/5 shadow-sm' 
                              : 'hover:border-muted-foreground/20'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDeviceId(d.deviceId)}
                            disabled={isDeleting}
                            className="w-full text-left p-3"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-xs font-medium truncate text-muted-foreground mb-1">
                                  {d.deviceId}
                                </div>
                                {d.deviceName && (
                                  <div className="text-sm font-medium">{d.deviceName}</div>
                                )}
                                {d.apSsid && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    <Signal className="inline size-3.5" /> {d.apSsid}
                                  </div>
                                )}
                              </div>
                              {onlineBadge(isFresh)}
                            </div>

                            {assignedEquip && (
                              <div className="mt-2 p-2 bg-primary/[0.15] rounded-ctl text-xs">
                                <div className="font-medium text-primary">
                                  {assignedEquip.nombre}
                                </div>
                                <div className="text-primary mt-0.5">
                                  {assignedEquip.codigo}
                                </div>
                              </div>
                            )}

                            {!assignedEquip && (
                              <div className="mt-2 text-xs">
                                <Badge variant="secondary" className="text-ink-warn">
                                  Sin asignar
                                </Badge>
                              </div>
                            )}

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                {lastSeen ? formatDateTime(lastSeen) : 'Sin reporte'}
                              </div>
                              {d.ip && (
                                <div className="text-xs text-muted-foreground">
                                  {d.ip}
                                </div>
                              )}
                            </div>
                          </button>
                          
                          {/* Botón de eliminar */}
                          <div className="px-3 pb-3 pt-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteDevice(d.deviceId)
                              }}
                              disabled={isDeleting}
                              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {isDeleting ? (
                                <>Eliminando...</>
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3 mr-2" />
                                  Eliminar dispositivo
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: Detalles del dispositivo seleccionado */}
        <div className="space-y-4">
          {!selectedDevice ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Cpu className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <div className="text-lg font-medium mb-2">Selecciona un dispositivo</div>
                <div className="text-sm text-muted-foreground max-w-md mx-auto">
                  Elige un ESP32 de la lista para ver su telemetría en tiempo real, asignarlo a un equipo y configurar su WiFi local.
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Card de Telemetría */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Telemetría en tiempo real
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {assignedEquipment && (
                    <div className="space-y-2 pb-3 border-b">
                      <div className="text-sm font-medium">Equipo asociado</div>
                      <div className="text-xs">
                        <div className="font-medium">{assignedEquipment.nombre}</div>
                        <div className="text-muted-foreground">{assignedEquipment.codigo}</div>
                        {assignedEquipment.hierarchyPath && (
                          <div className="text-muted-foreground mt-1">{assignedEquipment.hierarchyPath}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Dispositivo sin asignar */}
                  {!assignedEquipment && (
                    <div className="pb-3 border-b">
                      <div className="text-sm font-medium">Dispositivo sin asignar</div>
                      <div className="text-xs text-muted-foreground">
                        Este sensor no está asignado a ningún equipo. Puedes ver su telemetría en tiempo real para verificar que funciona.
                      </div>
                    </div>
                  )}

                  {displayTelemetry ? (
                    <div className="space-y-3">
                    {/* Temperatura */}
                    {displayTelemetry.temperatura && (
                      <div className="rounded-ctl border p-3 bg-cat-4-tint/[0.15]">
                        <div className="flex items-center gap-2 mb-2">
                          <Thermometer className="h-4 w-4 text-cat-4-ink" />
                          <span className="text-sm font-medium">Temperatura</span>
                        </div>
                        <div className="text-2xl font-bold">
                          {displayTelemetry.temperatura.value?.toFixed(1) ?? '—'} {displayTelemetry.temperatura.unit ?? '°C'}
                        </div>
                        {displayTelemetry.temperatura.status && (
                          <Badge variant={displayTelemetry.temperatura.status === 'normal' ? 'default' : 'destructive'} className="mt-2">
                            {displayTelemetry.temperatura.status}
                          </Badge>
                        )}
                        {displayTelemetry.temperatura.timestamp && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {formatDateTime(displayTelemetry.temperatura.timestamp)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Humedad */}
                    {displayTelemetry.humedad && (
                      <div className="rounded-ctl border p-3 bg-primary/[0.15]">
                        <div className="flex items-center gap-2 mb-2">
                          <Droplets className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Humedad</span>
                        </div>
                        <div className="text-2xl font-bold">
                          {displayTelemetry.humedad.value?.toFixed(1) ?? '—'} {displayTelemetry.humedad.unit ?? '%'}
                        </div>
                        {displayTelemetry.humedad.status && (
                          <Badge variant={displayTelemetry.humedad.status === 'normal' ? 'default' : 'destructive'} className="mt-2">
                            {displayTelemetry.humedad.status}
                          </Badge>
                        )}
                        {displayTelemetry.humedad.timestamp && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {formatDateTime(displayTelemetry.humedad.timestamp)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Estado online */}
                    {displayTelemetry.online !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Estado del sensor:</span>
                        {onlineBadge(displayTelemetry.online)}
                      </div>
                    )}

                    {displayTelemetry.lastSeen && (
                      <div className="text-xs text-muted-foreground">
                        Última actualización: {formatDateTime(displayTelemetry.lastSeen)}
                      </div>
                    )}

                    {/* Botón para mostrar/ocultar gráfico histórico */}
                    <div className="pt-4 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowChart(!showChart)}
                        className="w-full gap-2"
                      >
                        <BarChart3 className="h-4 w-4" />
                        {showChart ? 'Ocultar' : 'Ver'} Gráfico Histórico
                      </Button>

                      {/* Gráfico histórico expandible */}
                      {showChart && (
                        <div className="mt-4 space-y-3">
                          {/* Controles: Tipo de gráfico y Rango temporal */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor="chart-type" className="text-sm">Tipo de gráfico</Label>
                              <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                                <SelectTrigger id="chart-type" className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="line"><LineChart className="mr-1.5 inline size-3.5" />Línea de tiempo</SelectItem>
                                  <SelectItem value="area"><AreaChart className="mr-1.5 inline size-3.5" />Área suavizada</SelectItem>
                                  <SelectItem value="dual-axis"><Crosshair className="mr-1.5 inline size-3.5" />Doble eje (recomendado)</SelectItem>
                                  <SelectItem value="scatter"><ScatterChart className="mr-1.5 inline size-3.5" />Scatter (correlación)</SelectItem>
                                  <SelectItem value="bar"><BarChart3 className="mr-1.5 inline size-3.5" />Barras por hora</SelectItem>
                                  <SelectItem value="radar"><Radar className="mr-1.5 inline size-3.5" />Radar de estado</SelectItem>
                                  <SelectItem value="gauge"><Gauge className="mr-1.5 inline size-3.5" />Gauge (temperatura)</SelectItem>
                                  <SelectItem value="heatmap"><Grid3x3 className="mr-1.5 inline size-3.5" />Heatmap (día vs hora)</SelectItem>
                                  <SelectItem value="candlestick"><CandlestickChart className="mr-1.5 inline size-3.5" />Candlestick (OHLC)</SelectItem>
                                  <SelectItem value="mixed"><Layers className="mr-1.5 inline size-3.5" />Mixed (combinado)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="time-range" className="text-sm">Rango temporal</Label>
                              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                                <SelectTrigger id="time-range" className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1h"><Clock className="mr-1.5 inline size-3.5" />Última hora</SelectItem>
                                  <SelectItem value="6h"><Clock className="mr-1.5 inline size-3.5" />Últimas 6 horas</SelectItem>
                                  <SelectItem value="12h"><Clock className="mr-1.5 inline size-3.5" />Últimas 12 horas</SelectItem>
                                  <SelectItem value="24h"><Clock className="mr-1.5 inline size-3.5" />Últimas 24 horas</SelectItem>
                                  <SelectItem value="48h"><CalendarDays className="mr-1.5 inline size-3.5" />Últimos 2 días</SelectItem>
                                  <SelectItem value="7d"><CalendarDays className="mr-1.5 inline size-3.5" />Última semana</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Gráfico */}
                          <div className="rounded-ctl border bg-card p-4">
                            {historyLoading ? (
                              <div className="text-sm text-muted-foreground text-center py-8">
                                <RefreshCw className="inline size-3.5 animate-spin" /> Cargando historial…
                              </div>
                            ) : historyData.length === 0 ? (
                              <div className="text-sm text-muted-foreground text-center py-8">
                                No hay datos históricos disponibles
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-xs text-muted-foreground">
                                    {timeRange === '1h' && 'Última hora'}
                                    {timeRange === '6h' && 'Últimas 6 horas'}
                                    {timeRange === '12h' && 'Últimas 12 horas'}
                                    {timeRange === '24h' && 'Últimas 24 horas'}
                                    {timeRange === '48h' && 'Últimos 2 días'}
                                    {timeRange === '7d' && 'Última semana'}
                                    {' · '}{historyData.length} puntos de datos
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <TelemetryExportDialog
                                      devices={devices}
                                      equipment={equipment}
                                      defaultDeviceId={selectedDeviceId}
                                      defaultPreset={timeRange}
                                    />
                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                      <Lightbulb className="inline size-3.5" /> Zoom: scroll · Pan: Ctrl+arrastrar
                                    </div>
                                  </div>
                                </div>
                                {/* Key estable para evitar re-montaje del gráfico */}
                                <TelemetryChart 
                                  key={`${selectedDeviceId}-${chartType}-${timeRange}`}
                                  data={historyData} 
                                  type={chartType} 
                                  height={450} 
                                />
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Esperando datos del sensor...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card de Conexiones WiFi */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5" />
                    <span>Conexiones WiFi</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* WiFi Principal (Station Mode) */}
                  {selectedDevice.wifiSsid && (
                    <div className={`rounded-ctl border p-3 ${selectedDeviceIsFresh
                      ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-emerald-500/[0.25]'
                      : 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-500/[0.25]'
                      }`}>
                      <div className={`text-xs font-semibold mb-2 flex items-center gap-1 ${selectedDeviceIsFresh
                        ? 'text-ink-ok'
                        : 'text-ink-warn'
                        }`}>
                        <Wifi className="h-3 w-3" />
                        {selectedDeviceIsFresh ? 'WiFi Principal (Conectado)' : 'WiFi Principal (Configurada)'}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">SSID:</div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm font-medium">{selectedDevice.wifiSsid}</span>
                            <button
                              onClick={() => copyToClipboard(selectedDevice.wifiSsid || '', 'ssid')}
                              className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                              title="Copiar SSID"
                            >
                              {copiedField === 'ssid' ? (
                                <Check className="h-3 w-3 text-ink-ok" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                          </div>
                        </div>
                        {selectedDevice.wifiPassword && (
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">Contraseña:</div>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-sm font-medium">
                                {showApPassword ? selectedDevice.wifiPassword : '••••••••'}
                              </span>
                              <button
                                onClick={() => setShowApPassword(!showApPassword)}
                                className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                                title={showApPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                              >
                                {showApPassword ? (
                                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                              <button
                                onClick={() => copyToClipboard(selectedDevice.wifiPassword || '', 'password')}
                                className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                                title="Copiar contraseña"
                              >
                                {copiedField === 'password' ? (
                                  <Check className="h-3 w-3 text-ink-ok" />
                                ) : (
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                        {selectedDevice.ip && (
                          <div className="text-xs text-muted-foreground">
                            IP: {selectedDevice.ip}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Estado: {selectedDeviceIsFresh ? 'En línea' : 'Sin datos recientes'}
                        </div>
                        {typeof selectedDevice.rssi === 'number' && (
                          <div className="text-xs text-muted-foreground">
                            Señal: {selectedDevice.rssi} dBm{' '}
                            <span className={getRssiQualityClass(selectedDevice.rssi, selectedDeviceIsFresh)}>
                              ({getRssiQuality(selectedDevice.rssi, selectedDeviceIsFresh)})
                            </span>
                          </div>
                        )}
                        {typeof selectedDevice.rssi === 'number' && (
                          <div className="text-xs text-muted-foreground">
                            Tasa est.: {getRssiRateEstimate(selectedDevice.rssi, selectedDeviceIsFresh)}
                          </div>
                        )}
                        {typeof selectedDevice.rssi === 'number' && (
                          <div className="mt-1">
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full transition-all ${getRssiBarClass(selectedDevice.rssi, selectedDeviceIsFresh)} ${getRssiBarWidth(selectedDevice.rssi, selectedDeviceIsFresh)}`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Configurar nueva WiFi principal */}
                  <div className="rounded-ctl border p-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-500/[0.25]">
                    <div className="text-xs font-semibold text-ink-warn mb-2 flex items-center gap-1">
                      <Wifi className="h-3 w-3" />
                      Cambiar WiFi Principal
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Redes disponibles{selectedDevice.wifiScan?.ts ? ` (último: ${formatDateTime(selectedDevice.wifiScan?.ts)})` : ''}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleWifiScan}
                          disabled={scanningWifi}
                          className="gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {scanningWifi ? 'Buscando…' : 'Buscar redes'}
                        </Button>
                      </div>
                      {wifiScanError && (
                        <div className="text-xs text-destructive flex items-center gap-2">
                          <AlertTriangle className="h-3 w-3" />
                          {wifiScanError}
                        </div>
                      )}
                      {selectedDevice.wifiScan?.networks?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedDevice.wifiScan.networks.map((n, idx) => (
                            <Button
                              key={`${n.ssid}-${idx}`}
                              variant={wifiStaSsid === (n.ssid || '') ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setWifiStaSsid(n.ssid || '')}
                              className="text-xs"
                            >
                              {n.ssid || '(oculta)'} {typeof n.rssi === 'number' ? `· ${n.rssi} dBm` : ''}{n.secure && <Lock className="ml-1 inline size-3" aria-label="Red protegida" />}
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {scanningWifi ? 'Escaneando...' : 'Sin resultados aún.'}
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label htmlFor="wifiStaSsid" className="text-xs text-muted-foreground">SSID</Label>
                        <Input
                          id="wifiStaSsid"
                          value={wifiStaSsid}
                          onChange={(e) => setWifiStaSsid(e.target.value)}
                          placeholder="Nombre de la red"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="wifiStaPassword" className="text-xs text-muted-foreground">Contraseña</Label>
                        <Input
                          id="wifiStaPassword"
                          type={showApPassword ? 'text' : 'password'}
                          value={wifiStaPassword}
                          onChange={(e) => setWifiStaPassword(e.target.value)}
                          placeholder="(opcional)"
                        />
                        <div className="text-caption text-muted-foreground">
                          Si la red es abierta, deja vacío.
                        </div>
                      </div>
                      <Button
                        onClick={saveWifiConfiguration}
                        disabled={savingWifi}
                        className="w-full gap-2"
                        variant="outline"
                      >
                        <RefreshCw className="h-4 w-4" />
                        {savingWifi ? 'Enviando…' : 'Conectar a esta WiFi'}
                      </Button>

                      {wifiSaveError && (
                        <div className="text-sm text-destructive flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {wifiSaveError}
                        </div>
                      )}

                      {wifiSaveOk && (
                        <div className="text-sm text-ink-ok font-medium">
                          {wifiSaveOk}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WiFi AP Local */}
                  {selectedDevice.apSsid && (
                    <div className="rounded-ctl border p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-500/[0.25]">
                      <div className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        WiFi Local (Access Point)
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">SSID:</div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm font-medium">{selectedDevice.apSsid}</span>
                            <button
                              onClick={() => copyToClipboard(selectedDevice.apSsid || '', 'ssid')}
                              className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                              title="Copiar SSID"
                            >
                              {copiedField === 'ssid' ? (
                                <Check className="h-3 w-3 text-ink-ok" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                          </div>
                        </div>
                        {selectedDevice.apPassword && (
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">Contraseña:</div>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-sm font-medium">
                                {showApPassword ? selectedDevice.apPassword : '••••••••'}
                              </span>
                              <button
                                onClick={() => setShowApPassword(!showApPassword)}
                                className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                                title={showApPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                              >
                                {showApPassword ? (
                                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                              <button
                                onClick={() => copyToClipboard(selectedDevice.apPassword || '', 'password')}
                                className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                                title="Copiar contraseña"
                              >
                                {copiedField === 'password' ? (
                                  <Check className="h-3 w-3 text-ink-ok" />
                                ) : (
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          IP Local: {selectedDevice.apIp || '192.168.4.1'}
                        </div>
                        {selectedDevice.apIp && (
                          <a
                            href={`http://${selectedDevice.apIp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Globe className="inline size-3.5" /> Abrir panel local
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {!selectedDevice.wifiSsid && !selectedDevice.apSsid && (
                    <div className="text-xs text-muted-foreground bg-amber-500/[0.15] p-2 rounded-ctl border border-amber-500/[0.25]">
                      <AlertTriangle className="inline size-3.5" /> Este dispositivo no ha reportado información de WiFi aún
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card de Emparejar - Colapsable */}
              <Card>
                <CardHeader className="pb-3">
                  <button
                    type="button"
                    onClick={() => setIsPairingExpanded(!isPairingExpanded)}
                    className="w-full"
                  >
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Link2 className="h-5 w-5" />
                        Emparejar
                      </span>
                      <div className="flex items-center gap-2">
                        {onlineBadge(selectedDeviceIsFresh)}
                        {isPairingExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </CardTitle>
                  </button>
                </CardHeader>
                {isPairingExpanded && (
                  <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Dispositivo</div>
                    <div className="font-mono text-sm">{selectedDevice.deviceId}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedDevice.ip ? `IP: ${selectedDevice.ip}` : ''}
                      {typeof selectedDevice.rssi === 'number' && (
                        <span>
                          {' '}· RSSI: {selectedDevice.rssi} dBm{' '}
                          <span className={getRssiQualityClass(selectedDevice.rssi, selectedDeviceIsFresh)}>
                            ({getRssiQuality(selectedDevice.rssi, selectedDeviceIsFresh)})
                          </span>
                          <span className="inline-flex items-center ml-2 align-middle">
                            <span className="h-1 w-20 rounded-full bg-muted overflow-hidden">
                              <span
                                className={`block h-full ${getRssiBarClass(selectedDevice.rssi, selectedDeviceIsFresh)} ${getRssiBarWidth(selectedDevice.rssi, selectedDeviceIsFresh)}`}
                              />
                            </span>
                          </span>
                        </span>
                      )}
                    </div>
                    {selectedDevice.firmwareVersion && (
                      <div className="text-xs text-muted-foreground">Firmware: {selectedDevice.firmwareVersion}</div>
                    )}
                  </div>

                <div className="rounded-ctl border p-3 bg-muted">
                  <div className="text-sm font-medium mb-1">Asignación actual</div>
                  <div className="text-xs">
                    {assignedEquipment ? (
                      <>
                        <div className="font-medium">{assignedEquipment.nombre}</div>
                        <div className="text-muted-foreground">{assignedEquipment.codigo}</div>
                      </>
                    ) : selectedDevice.assignedEquipmentId ? (
                      <div className="text-muted-foreground">ID: {selectedDevice.assignedEquipmentId}</div>
                    ) : (
                      <div className="text-ink-warn">Sin asignar</div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Asignar a equipo</div>
                    {selectedDevice?.assignedEquipmentId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEquipmentId('')}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cambiar equipo
                      </Button>
                    )}
                  </div>
                  
                  {/* Filtros jerárquicos en cascada (padre → hijo) */}
                  {loadingEquipment ? (
                    <div className="p-4 text-sm bg-primary/[0.15] border border-blue-500/[0.25] rounded-ctl">
                      <div className="font-medium text-primary mb-1">
                        <RefreshCw className="inline size-3.5 animate-spin" /> Cargando equipos…
                      </div>
                      <div className="text-xs text-primary">
                        Por favor espera un momento
                      </div>
                    </div>
                  ) : equipment.length === 0 ? (
                    <div className="p-4 text-sm bg-amber-500/[0.15] border border-amber-500/[0.25] rounded-ctl">
                      <div className="font-medium text-ink-warn mb-1">
                        <AlertTriangle className="inline size-3.5" /> No hay equipos disponibles
                      </div>
                      <div className="text-xs text-ink-warn">
                        Ve a la página de Equipos para agregar equipos a la jerarquía.
                      </div>
                    </div>
                  ) : (
                  <div className="space-y-2">
                    {/* Primera fila: Planta, Sector, Área */}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label>Planta</Label>
                        <Select value={filterPlanta} onValueChange={(v) => {
                          setFilterPlanta(v)
                          // Resetear niveles hijos al cambiar planta
                          setFilterSector('todas')
                          setFilterArea('todas')
                          setFilterNivel4('todas')
                          setFilterNivel5('todas')
                          setFilterNivel6('todas')
                          setFilterNivel7('todas')
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">Todas las plantas</SelectItem>
                            {plantasDisponibles.map(p => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Sector</Label>
                        <Select value={filterSector} onValueChange={(v) => {
                          setFilterSector(v)
                          // Resetear niveles hijos al cambiar sector
                          setFilterArea('todas')
                          setFilterNivel4('todas')
                          setFilterNivel5('todas')
                          setFilterNivel6('todas')
                          setFilterNivel7('todas')
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">Todos los sectores</SelectItem>
                            {sectoresDisponibles.map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Área</Label>
                        <Select value={filterArea} onValueChange={(v) => {
                          setFilterArea(v)
                          // Resetear niveles hijos al cambiar área
                          setFilterNivel4('todas')
                          setFilterNivel5('todas')
                          setFilterNivel6('todas')
                          setFilterNivel7('todas')
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">Todas las áreas</SelectItem>
                            {areasDisponibles.map(a => (
                              <SelectItem key={a} value={a}>{a}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Segunda fila: Niveles 4, 5, 6, 7 */}
                    {(nivel4Disponibles.length > 0 || nivel5Disponibles.length > 0 || nivel6Disponibles.length > 0 || nivel7Disponibles.length > 0) && (
                      <div className="grid gap-2 sm:grid-cols-4">
                        {nivel4Disponibles.length > 0 && (
                          <div>
                            <Label>Nivel 4</Label>
                            <Select value={filterNivel4} onValueChange={(v) => {
                              setFilterNivel4(v)
                              // Resetear niveles hijos al cambiar nivel 4
                              setFilterNivel5('todas')
                              setFilterNivel6('todas')
                              setFilterNivel7('todas')
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="Todos" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todas">Todos</SelectItem>
                                {nivel4Disponibles.map(n => (
                                  <SelectItem key={n} value={n}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {nivel5Disponibles.length > 0 && (
                          <div>
                            <Label>Nivel 5</Label>
                            <Select value={filterNivel5} onValueChange={(v) => {
                              setFilterNivel5(v)
                              // Resetear niveles hijos al cambiar nivel 5
                              setFilterNivel6('todas')
                              setFilterNivel7('todas')
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="Todos" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todas">Todos</SelectItem>
                                {nivel5Disponibles.map(n => (
                                  <SelectItem key={n} value={n}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {nivel6Disponibles.length > 0 && (
                          <div>
                            <Label>Nivel 6</Label>
                            <Select value={filterNivel6} onValueChange={(v) => {
                              setFilterNivel6(v)
                              // Resetear nivel hijo al cambiar nivel 6
                              setFilterNivel7('todas')
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="Todos" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todas">Todos</SelectItem>
                                {nivel6Disponibles.map(n => (
                                  <SelectItem key={n} value={n}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {nivel7Disponibles.length > 0 && (
                          <div>
                            <Label>Nivel 7</Label>
                            <Select value={filterNivel7} onValueChange={setFilterNivel7}>
                              <SelectTrigger>
                                <SelectValue placeholder="Todos" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todas">Todos</SelectItem>
                                {nivel7Disponibles.map(n => (
                                  <SelectItem key={n} value={n}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Filtros de estado y criticidad */}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <Label>Estado</Label>
                      <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v as any)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todos</SelectItem>
                          <SelectItem value="operativo">Operativo</SelectItem>
                          <SelectItem value="en_mantenimiento">En mantenimiento</SelectItem>
                          <SelectItem value="fuera_servicio">Fuera de servicio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Criticidad</Label>
                      <Select value={filterCriticidad} onValueChange={(v) => setFilterCriticidad(v as any)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Criticidad" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="media">Media</SelectItem>
                          <SelectItem value="baja">Baja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer h-10 px-3 rounded-ctl border bg-background hover:bg-muted/50 transition-colors w-full">
                        <input
                          type="checkbox"
                          checked={filterSinSensor}
                          onChange={(e) => setFilterSinSensor(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Sin sensor</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Buscar equipo (opcional)</Label>
                      {(equipmentSearch || filterPlanta !== 'todas' || filterSector !== 'todas' || filterArea !== 'todas' || filterNivel4 !== 'todas' || filterNivel5 !== 'todas' || filterNivel6 !== 'todas' || filterNivel7 !== 'todas' || filterEstado !== 'todas' || filterCriticidad !== 'todas' || filterSinSensor) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEquipmentSearch('')
                            setFilterPlanta('todas')
                            setFilterSector('todas')
                            setFilterArea('todas')
                            setFilterNivel4('todas')
                            setFilterNivel5('todas')
                            setFilterNivel6('todas')
                            setFilterNivel7('todas')
                            setFilterEstado('todas')
                            setFilterCriticidad('todas')
                            setFilterSinSensor(false)
                          }}
                          className="h-7 gap-1 text-xs"
                        >
                          <X className="h-3 w-3" />
                          Limpiar filtros
                        </Button>
                      )}
                    </div>
                    <Input
                      value={equipmentSearch}
                      onChange={(e) => setEquipmentSearch(e.target.value)}
                      placeholder="Escribe para filtrar por nombre o código..."
                      autoComplete="off"
                      type="search"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">
                        Selecciona un equipo
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({filteredEquipment.length} {filteredEquipment.length === 1 ? 'equipo' : 'equipos'} {filteredEquipment.length !== equipment.length && `de ${equipment.length} totales`})
                        </span>
                      </Label>
                      {selectedEquipmentId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEquipmentId('')}
                          className="h-7 text-xs"
                        >
                          Limpiar selección
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 max-h-[300px] overflow-y-auto border rounded-ctl bg-muted">
                      {equipment.length === 0 ? (
                        <div className="p-4 text-sm text-center space-y-2">
                          <div className="flex items-center justify-center gap-1.5 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Cargando equipos…</div>
                          <div className="text-xs text-muted-foreground">
                            Si esto tarda mucho, recarga la página
                          </div>
                        </div>
                      ) : filteredEquipment.length === 0 ? (
                        <div className="p-4 text-sm text-center space-y-2">
                          <div className="flex items-center justify-center gap-1.5 font-medium text-ink-warn"><SearchX className="size-3.5 shrink-0" />No se encontraron equipos con esos filtros</div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>• Verifica que la combinación de Planta/Sector/Área sea correcta</div>
                            <div>• Prueba cambiar los filtros de Estado o Criticidad</div>
                            <div>• O usa el botón "Limpiar filtros" arriba</div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {filteredEquipment.length > 5 && (
                            <div className="sticky top-0 z-10 p-2 text-xs text-center bg-primary/[0.15] border-b text-primary">
                              <ChevronsDown className="inline size-3.5" /> Desliza hacia abajo para ver todos los equipos ({filteredEquipment.length})
                            </div>
                          )}
                          <div className="divide-y">
                          {filteredEquipment.slice(0, 100).map((e) => {
                            const isSelected = e.id === selectedEquipmentId
                            return (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => setSelectedEquipmentId(e.id)}
                                className={`w-full text-left p-3 transition-colors hover:bg-muted/60 ${isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{e.nombre}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      Código: {e.codigo}
                                    </div>
                                    {e.hierarchyPath && (
                                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        <MapPin className="size-3 opacity-60" />
                                        <span className="truncate">{e.hierarchyPath}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1 items-end shrink-0">
                                    <Badge
                                      variant={
                                        e.estado === 'operativo'
                                          ? 'default'
                                          : e.estado === 'en_mantenimiento'
                                            ? 'secondary'
                                            : 'destructive'
                                      }
                                      className="text-xs"
                                    >
                                      {e.estado === 'operativo' ? 'Operativo' : e.estado === 'en_mantenimiento' ? 'Mantención' : 'Fuera'}
                                    </Badge>
                                    <Badge
                                      variant={
                                        e.criticidad === 'alta' ? 'destructive' : e.criticidad === 'media' ? 'default' : 'secondary'
                                      }
                                      className="text-xs"
                                    >
                                      <Pill tone={e.criticidad === 'alta' ? 'critical' : e.criticidad === 'media' ? 'warning' : 'ok'} dot>
                                        {e.criticidad === 'alta' ? 'Alta' : e.criticidad === 'media' ? 'Media' : 'Baja'}
                                      </Pill>
                                    </Badge>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                          </div>
                        </>
                      )}
                      {filteredEquipment.length > 100 && (
                        <div className="p-2 text-xs text-center text-muted-foreground bg-muted border-t">
                          Mostrando primeros 100 de {filteredEquipment.length}. Usa los filtros para refinar la búsqueda.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumen de selección y botones de acción */}
                  <div className="flex flex-col gap-3">
                    {selectedEquipmentId && equipment.find(e => e.id === selectedEquipmentId) && (
                      <div className="p-3 rounded-ctl bg-primary/10 border border-primary/30">
                        <div className="text-xs font-medium text-primary mb-1">✓ Equipo seleccionado:</div>
                        <div className="text-sm font-medium">
                          {equipment.find(e => e.id === selectedEquipmentId)?.nombre}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {equipment.find(e => e.id === selectedEquipmentId)?.codigo}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => saveAssignment(selectedEquipmentId || null)}
                        disabled={!selectedEquipmentId || saving}
                        className="gap-2 flex-1 min-w-[140px]"
                      >
                        <Link2 className="h-4 w-4" />
                        {saving ? 'Guardando…' : selectedDevice?.assignedEquipmentId ? 'Cambiar equipo' : 'Asignar equipo'}
                      </Button>
                      {selectedDevice?.assignedEquipmentId && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => saveAssignment(null)}
                          disabled={saving}
                          className="gap-2"
                        >
                          <Unlink2 className="h-4 w-4" />
                          Quitar asignación
                        </Button>
                      )}
                    </div>

                    {!selectedEquipmentId && !selectedDevice?.assignedEquipmentId && (
                      <div className="text-xs text-muted-foreground bg-primary/[0.15] p-2 rounded-ctl border border-blue-500/[0.25]">
                        <Lightbulb className="inline size-3.5" /> Selecciona un equipo de la lista arriba para asignarlo a este sensor
                      </div>
                    )}
                  </div>

                  {saveError && (
                    <div className="text-sm text-destructive flex items-center gap-2 bg-destructive/10 p-2 rounded-ctl">
                      <AlertTriangle className="h-4 w-4" />
                      {saveError}
                    </div>
                  )}

                  {saveOk && (
                    <div className="text-sm text-ink-ok bg-green-500/[0.15] p-2 rounded-ctl border border-emerald-500/[0.25]">
                      ✓ {saveOk}
                    </div>
                  )}
                </div>
                  </CardContent>
                )}
              </Card>

              {/* Card de Configuración AP - Colapsable */}
              <Card>
                <CardHeader className="pb-3">
                  <button
                    type="button"
                    onClick={() => setIsWifiApExpanded(!isWifiApExpanded)}
                    className="w-full"
                  >
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Wifi className="h-5 w-5" />
                        <span>WiFi Local (AP)</span>
                      </span>
                      {isWifiApExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </CardTitle>
                  </button>
                </CardHeader>
                {isWifiApExpanded && (
                  <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Configura el Access Point local del ESP32 para acceder a sus datos sin internet.
                </div>

                {selectedDevice.apSsid && (
                  <div className="rounded-ctl border p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-500/[0.25]">
                    <div className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                      <Wifi className="h-3 w-3" />
                      Configuración Actual del AP
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">SSID:</div>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm font-medium">{selectedDevice.apSsid}</span>
                          <button
                            onClick={() => copyToClipboard(selectedDevice.apSsid || '', 'ssid')}
                            className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                            title="Copiar SSID"
                          >
                            {copiedField === 'ssid' ? (
                              <Check className="h-3 w-3 text-ink-ok" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </div>
                      {selectedDevice.apPassword && (
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Contraseña:</div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm font-medium">
                              {showApPassword ? selectedDevice.apPassword : '••••••••'}
                            </span>
                            <button
                              onClick={() => setShowApPassword(!showApPassword)}
                              className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                              title={showApPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                              {showApPassword ? (
                                <EyeOff className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <Eye className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(selectedDevice.apPassword || '', 'password')}
                              className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                              title="Copiar contraseña"
                            >
                              {copiedField === 'password' ? (
                                <Check className="h-3 w-3 text-ink-ok" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        IP: {selectedDevice.apIp || '192.168.4.1'}
                      </div>
                    </div>
                  </div>
                )}

                {selectedDevice && (
                  <div className="rounded-ctl border p-3 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-500/[0.25]">
                    <div className="text-xs font-semibold text-ink-ok mb-2 flex items-center gap-1">
                      <Wifi className="h-3 w-3" />
                      Información OTA (WiFi)
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">Hostname:</div>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm font-medium">{otaHostLabel || '--'}</span>
                          <button
                            onClick={() => copyToClipboard(otaHostLabel || '', 'otaHost')}
                            className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                            title="Copiar hostname"
                          >
                            {copiedField === 'otaHost' ? (
                              <Check className="h-3 w-3 text-ink-ok" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">Contraseña OTA:</div>
                        {otaPasswordState === 'idle' && (
                          <button
                            onClick={fetchOtaPassword}
                            className="text-xs px-2 py-0.5 rounded-ctl border border-emerald-500/[0.25] hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
                          >
                            Mostrar (solo admin)
                          </button>
                        )}
                        {otaPasswordState === 'loading' && (
                          <span className="text-xs text-muted-foreground">Cargando…</span>
                        )}
                        {otaPasswordState === 'error' && (
                          <span className="text-xs text-ink-crit">Solo administradores</span>
                        )}
                        {otaPasswordState === 'ok' && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm font-medium">{otaPassword}</span>
                            <button
                              onClick={() => copyToClipboard(otaPassword, 'otaPassword')}
                              className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded-ctl transition-colors"
                              title="Copiar contraseña OTA"
                            >
                              {copiedField === 'otaPassword' ? (
                                <Check className="h-3 w-3 text-ink-ok" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Usa mDNS: {otaHostLabel || 'esp32-XXXXXX.local'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ap-enabled"
                      checked={apEnabled}
                      onChange={(e) => setApEnabled(e.target.checked)}
                      className="rounded-ctl border-border"
                    />
                    <Label htmlFor="ap-enabled" className="text-sm cursor-pointer">
                      AP siempre activo (AP+STA)
                    </Label>
                  </div>

                  <div>
                    <Label htmlFor="ap-ssid">SSID del AP</Label>
                    <Input
                      id="ap-ssid"
                      placeholder="Ej: Sensor-Horno-1"
                      value={apSsid}
                      onChange={(e) => setApSsid(e.target.value)}
                      className="mt-1"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Vacío = ESP32-{selectedDevice.deviceId.slice(-6)}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="ap-password" className="flex items-center justify-between">
                      <span>Contraseña WPA2</span>
                      <button
                        type="button"
                        onClick={generateSecurePassword}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Generar
                      </button>
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        id="ap-password"
                        type={showApPassword ? "text" : "password"}
                        placeholder="Mínimo 8 caracteres o vacío para red abierta"
                        value={apPassword}
                        onChange={(e) => setApPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApPassword(!showApPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-ctl transition-colors"
                        title={showApPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showApPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                    {apPassword && apPassword.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                apPassword.length < 8
                                  ? 'w-1/3 bg-red-500'
                                  : apPassword.length < 12
                                    ? 'w-2/3 bg-amber-500'
                                    : 'w-full bg-green-500'
                              }`}
                            />
                          </div>
                          <span className={`text-xs font-medium ${
                            apPassword.length < 8
                              ? 'text-ink-crit'
                              : apPassword.length < 12
                                ? 'text-ink-warn'
                                : 'text-ink-ok'
                          }`}>
                            {apPassword.length < 8 ? 'Débil' : apPassword.length < 12 ? 'Media' : 'Fuerte'}
                          </span>
                        </div>
                        {apPassword.length < 8 && (
                          <div className="text-xs text-ink-crit flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>WPA2 requiere mínimo 8 caracteres</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {apPassword.length === 0
                          ? <><AlertTriangle className="inline size-3" /> Vacío = red abierta (sin contraseña)</>
                          : `${apPassword.length} caracteres`}
                    </div>
                  </div>

                  <Button
                    onClick={saveApConfiguration}
                    disabled={savingAp}
                    className="w-full gap-2"
                  >
                    <Wifi className="h-4 w-4" />
                    {savingAp ? 'Enviando…' : 'Guardar Config AP'}
                  </Button>

                  {apSaveError && (
                    <div className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {apSaveError}
                    </div>
                  )}

                  {apSaveOk && (
                    <div className="text-sm text-ink-ok font-medium">
                      {apSaveOk}
                    </div>
                  )}
                  </div>
                  </CardContent>
                )}
              </Card>

              {/* Configuración Intervalo de Lectura */}
              <Card className="border-border dark:border-border">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setIsIntervalExpanded(!isIntervalExpanded)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-blue-500" />
                      <CardTitle className="text-base">Intervalo de Lectura</CardTitle>
                    </div>
                    {isIntervalExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Frecuencia de envío de datos del sensor
                  </p>
                </CardHeader>
                {isIntervalExpanded && (
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="sendInterval">Intervalo (segundos)</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            id="sendInterval"
                            type="number"
                            min={5}
                            max={300}
                            value={sendInterval}
                            onChange={(e) => setSendInterval(Math.max(5, Math.min(300, parseInt(e.target.value) || 10)))}
                            className="w-24"
                          />
                          <div className="flex gap-1">
                            {[5, 10, 30, 60, 120].map((val) => (
                              <Button
                                key={val}
                                variant={sendInterval === val ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSendInterval(val)}
                                className="px-2 py-1 h-8 text-xs"
                              >
                                {val}s
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>Mínimo: 5s · Máximo: 300s (5 min)</p>
                          <p className={sendInterval <= 10 ? 'text-ink-warn' : ''}>
                            {sendInterval <= 10 && <AlertTriangle className="inline size-3" />}{' '}{sendInterval}s = ~{Math.round(86400 / sendInterval).toLocaleString('es-CL')} lecturas/día
                            {sendInterval <= 10 && ' (alto consumo)'}
                          </p>
                        </div>
                      </div>

                      <Button
                        onClick={saveIntervalConfiguration}
                        disabled={savingInterval}
                        className="w-full gap-2"
                      >
                        <Activity className="h-4 w-4" />
                        {savingInterval ? 'Enviando…' : 'Guardar Intervalo'}
                      </Button>

                      {intervalSaveError && (
                        <div className="text-sm text-destructive flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {intervalSaveError}
                        </div>
                      )}

                      {intervalSaveOk && (
                        <div className="text-sm text-ink-ok font-medium">
                          {intervalSaveOk}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
