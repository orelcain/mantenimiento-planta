/**
 * DefaultRoutePage — Configura la página de inicio por defecto.
 * Ruta: `/admin/default-route` (solo admin)
 *
 * El admin elige qué módulo se carga al entrar a `/`. La selección se
 * guarda en Firestore (`appConfig/defaultRoute`) y aplica para TODOS los
 * usuarios — no es por dispositivo (a diferencia de `dev-modules`).
 *
 * Cuando un usuario navega a `/`, HomeRedirect lee este doc y redirige.
 * Si el doc no existe o es inválido, fallback a DEFAULT_HOME_PATH
 * (Análisis de Turno).
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { ArrowLeft, LayoutDashboard, Save, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import {
  DEFAULT_HOME_PATH,
  loadDefaultRouteConfig,
  saveDefaultRouteConfig,
} from '@/services/defaultRouteConfig'

interface RouteOption {
  path: string
  label: string
  description: string
}

/**
 * Opciones disponibles como página de inicio. Solo módulos production-ready.
 * Los items con `inDevelopment: true` se omiten porque podrían estar ocultos
 * para usuarios no-admin → caerían en Navigate fallido.
 */
const ROUTE_OPTIONS: readonly RouteOption[] = [
  { path: '/analisis-grader',    label: 'Análisis de Turno',     description: 'Detalle del turno + Grader + Shoplogix' },
  { path: '/dashboard',          label: 'Dashboard (legacy)',    description: 'Panel original de control' },
  { path: '/calendario-mantencion', label: 'Calendario Mantención', description: 'Programación de tareas preventivas' },
  { path: '/repuestos',          label: 'Repuestos',             description: 'Inventario y bodega' },
  { path: '/map',                label: 'Visor Planta 3D',       description: 'Mapa interactivo de la planta' },
  { path: '/aprendizaje',        label: 'Centro de Aprendizaje', description: 'Manuales y guías' },
] as const

export function DefaultRoutePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [selected, setSelected] = useState<string>(DEFAULT_HOME_PATH)
  const [savedPath, setSavedPath] = useState<string>(DEFAULT_HOME_PATH)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadDefaultRouteConfig()
      .then((cfg) => {
        const path = cfg?.path ?? DEFAULT_HOME_PATH
        setSelected(path)
        setSavedPath(path)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveDefaultRouteConfig(selected)
      setSavedPath(selected)
      toast({
        title: 'Página de inicio actualizada',
        description: 'La nueva ruta aplica al recargar la app.',
      })
    } catch (err) {
      toast({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'Intentá de nuevo.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const isDirty = selected !== savedPath
  const savedOption = ROUTE_OPTIONS.find((o) => o.path === savedPath)

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link to="/admin" className="gap-1 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs">Panel Admin</span>
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-emerald-400" />
          Página de inicio por defecto
        </h1>
        <p className="text-sm text-muted-foreground">
          Cuando un usuario navega a <code className="text-xs px-1 py-0.5 rounded bg-muted">/</code>,
          la app redirige automáticamente al módulo elegido acá. Aplica a TODOS
          los usuarios (no por dispositivo).
        </p>
      </div>

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-3 flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Actualmente: <b>{savedOption?.label ?? savedPath}</b>
            {savedPath === DEFAULT_HOME_PATH && (
              <span className="ml-1 text-muted-foreground">(default)</span>
            )}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Elegir módulo</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/40">
          {ROUTE_OPTIONS.map((opt) => {
            const checked = selected === opt.path
            return (
              <label
                key={opt.path}
                className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/30 rounded -mx-2 px-2 transition-colors"
              >
                <input
                  type="radio"
                  name="default-route"
                  value={opt.path}
                  checked={checked}
                  onChange={() => setSelected(opt.path)}
                  disabled={loading}
                  className="mt-1 accent-emerald-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{opt.path}</div>
                </div>
              </label>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(selected)}
          disabled={loading}
        >
          Probar ruta
        </Button>
        <Button
          onClick={handleSave}
          disabled={!isDirty || saving || loading}
          className="gap-1"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
