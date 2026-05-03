import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Switch,
} from '@/components/ui'
import { Bell, Save, Loader2, RotateCcw } from 'lucide-react'
import { PLANT_LINES } from '@/config/plantLines'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import {
  loadShoplogixNotifConfig,
  saveShoplogixNotifConfig,
  SHOPLOGIX_NOTIF_CONFIG_DEFAULTS,
  type ShoplogixNotifConfig,
} from '@/services/shoplogix/shoplogixNotifConfig.service'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'

const ACTIVE_PLANTS = PLANT_LINES.filter((l) => l.shoplogixEnabled && !l.comingSoon)

function cloneDefaults(): ShoplogixNotifConfig {
  return structuredClone(SHOPLOGIX_NOTIF_CONFIG_DEFAULTS)
}

interface PlantPanelProps {
  plantSlug: PlantSlug
  plantLabel: string
}

function PlantPanel({ plantSlug, plantLabel }: PlantPanelProps) {
  const { toast } = useToast()
  const [config, setConfig]   = useState<ShoplogixNotifConfig>(cloneDefaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)

  useEffect(() => {
    setLoading(true)
    loadShoplogixNotifConfig(plantSlug)
      .then((c) => { setConfig(c); setDirty(false) })
      .catch((e) => logger.error('ShoplogixNotifConfig load error', e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false))
  }, [plantSlug])

  const patch = useCallback(<K extends keyof ShoplogixNotifConfig>(
    section: K,
    updates: Partial<ShoplogixNotifConfig[K]>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as object), ...updates },
    }))
    setDirty(true)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveShoplogixNotifConfig(plantSlug, config)
      setDirty(false)
      toast({ title: `Config ${plantLabel} guardada`, description: 'Los cambios entrarán en vigor en el próximo evento.' })
    } catch (e) {
      logger.error('ShoplogixNotifConfig save error', e instanceof Error ? e : new Error(String(e)))
      toast({ title: 'Error al guardar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Canales */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Canales de entrega</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Push (FCM)</Label>
              <p className="text-xs text-muted-foreground">Notificación push a todos los usuarios activos con la planta habilitada</p>
            </div>
            <Switch
              checked={config.channels.push}
              onCheckedChange={(v) => patch('channels', { push: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Telegram</Label>
              <p className="text-xs text-muted-foreground">Mensaje al grupo Telegram (topic General)</p>
            </div>
            <Switch
              checked={config.channels.telegram}
              onCheckedChange={(v) => patch('channels', { telegram: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Inicio de turno */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Inicio de turno</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Alerta de inicio demorado</Label>
              <p className="text-xs text-muted-foreground">Si el turno inició pero no hay piezas después del período de gracia</p>
            </div>
            <Switch
              checked={config.shiftStart.enabled}
              onCheckedChange={(v) => patch('shiftStart', { enabled: v })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor={`grace-${plantSlug}`} className="text-sm whitespace-nowrap">
              Período de gracia
            </Label>
            <Input
              id={`grace-${plantSlug}`}
              type="number"
              min={1}
              max={120}
              className="w-24 h-8 text-sm"
              value={config.shiftStart.gracePeriodMinutes}
              onChange={(e) => patch('shiftStart', { gracePeriodMinutes: Math.max(1, parseInt(e.target.value) || 20) })}
              disabled={!config.shiftStart.enabled}
            />
            <span className="text-sm text-muted-foreground">minutos</span>
          </div>
        </CardContent>
      </Card>

      {/* Primera pieza */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Primera pieza por Baader</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Notificar primera pieza</Label>
              <p className="text-xs text-muted-foreground">Una notificación cuando cada Baader registra su primera pieza del turno</p>
            </div>
            <Switch
              checked={config.firstPiece.enabled}
              onCheckedChange={(v) => patch('firstPiece', { enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Hitos de piezas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Hitos de piezas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Notificar por hito</Label>
              <p className="text-xs text-muted-foreground">Avisa cada vez que un Baader alcanza un múltiplo del intervalo</p>
            </div>
            <Switch
              checked={config.pieceInterval.enabled}
              onCheckedChange={(v) => patch('pieceInterval', { enabled: v })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor={`interval-${plantSlug}`} className="text-sm whitespace-nowrap">
              Cada
            </Label>
            <Input
              id={`interval-${plantSlug}`}
              type="number"
              min={100}
              max={50000}
              step={100}
              className="w-28 h-8 text-sm"
              value={config.pieceInterval.every}
              onChange={(e) => patch('pieceInterval', { every: Math.max(100, parseInt(e.target.value) || 1000) })}
              disabled={!config.pieceInterval.enabled}
            />
            <span className="text-sm text-muted-foreground">piezas</span>
          </div>
        </CardContent>
      </Card>

      {/* Eventos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Eventos de detención</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Detenciones</Label>
              <p className="text-xs text-muted-foreground">Avisa cuando Shoplogix registra una detención en cualquier Baader</p>
            </div>
            <Switch
              checked={config.events.stoppage}
              onCheckedChange={(v) => patch('events', { stoppage: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Micro-detenciones</Label>
              <p className="text-xs text-muted-foreground">Avisa en micro-paros cortos (puede ser ruidoso)</p>
            </div>
            <Switch
              checked={config.events.microStoppage}
              onCheckedChange={(v) => patch('events', { microStoppage: v })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => {
            loadShoplogixNotifConfig(plantSlug)
              .then((c) => { setConfig(c); setDirty(false) })
              .catch(() => {})
          }}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Descartar
        </Button>
      </div>
    </div>
  )
}

export function ShoplogixNotificationsConfigPage() {
  const [activeTab, setActiveTab] = useState<PlantSlug>(ACTIVE_PLANTS[0]!.plantSlug)

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bell className="w-6 h-6 text-orange-400" />
          Notificaciones Shoplogix
        </h1>
        <p className="text-sm text-muted-foreground">
          Configura por planta cuándo y cómo se envían alertas de eventos productivos.
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-border">
        {ACTIVE_PLANTS.map((pl) => (
          <button
            key={pl.plantSlug}
            onClick={() => setActiveTab(pl.plantSlug)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === pl.plantSlug
                ? 'border-orange-400 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {pl.label}
          </button>
        ))}
      </div>

      {ACTIVE_PLANTS.map((pl) =>
        activeTab === pl.plantSlug ? (
          <PlantPanel key={pl.plantSlug} plantSlug={pl.plantSlug} plantLabel={pl.label} />
        ) : null,
      )}
    </div>
  )
}
