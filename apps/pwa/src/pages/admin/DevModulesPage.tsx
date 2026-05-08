/**
 * DevModulesPage — Visibilidad de módulos en desarrollo
 * Ruta: `/admin/dev-modules` (solo admin)
 *
 * Por default los módulos en desarrollo (Incidencias, Evidencias, Preventivo,
 * Predictivo, Planificador Gantt, Equipos, Sensores, Panel Sensores) están
 * ocultos del sidebar para mantener el menú limpio.
 *
 * Desde aquí el admin habilita los que quiera ver en SU dispositivo. La
 * configuración vive en localStorage (`mant_dev_modules_visible`) y NO se
 * sincroniza entre dispositivos a propósito — cada admin decide qué probar
 * en su PC.
 */
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, EyeOff, RotateCcw, Wrench } from 'lucide-react'
import { useDevModulesVisibility } from '@/hooks/useDevModulesVisibility'
import { DEV_NAV_ITEMS } from '@/components/layout/MainLayout'

export function DevModulesPage() {
  const { isVisible, setVisible, reset } = useDevModulesVisibility()
  const visibleCount = DEV_NAV_ITEMS.filter((it) => isVisible(it.href)).length

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
          <Wrench className="w-6 h-6 text-purple-400" />
          Módulos en desarrollo
        </h1>
        <p className="text-sm text-muted-foreground">
          Estos módulos están ocultos del menú lateral por default mientras
          siguen en desarrollo. Activá acá los que quieras ver mientras los
          probás. La preferencia se guarda en este dispositivo — no afecta a
          otros usuarios.
        </p>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-3 flex items-start gap-2 text-xs text-amber-300">
          <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Visibles ahora: <b>{visibleCount}</b> de {DEV_NAV_ITEMS.length}.
            {visibleCount > 0 && (
              <Button
                variant="link"
                size="sm"
                className="text-xs text-amber-300 underline ml-1 h-auto p-0"
                onClick={reset}
              >
                <RotateCcw className="w-3 h-3 mr-1 inline" />
                Ocultar todos
              </Button>
            )}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Items del sidebar</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/40">
          {DEV_NAV_ITEMS.map((item) => {
            const visible = isVisible(item.href)
            return (
              <div
                key={item.href}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {item.href}
                  </div>
                </div>
                <Switch
                  checked={visible}
                  onCheckedChange={(next) => setVisible(item.href, next)}
                  aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${item.name} en sidebar`}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground/70 px-1">
        Los cambios se aplican al instante. Si no ves un item después de
        activarlo, refrescá la página.
      </p>
    </div>
  )
}
