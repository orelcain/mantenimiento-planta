/**
 * DevModulesPage — Visibilidad de los módulos del sidebar
 * Ruta: `/admin/dev-modules` (solo admin)
 *
 * Lista TODOS los items del sidebar agrupados en dos secciones:
 *   - "En desarrollo": ocultos por default, se activan para probarlos.
 *   - "En producción": visibles por default, se pueden ocultar a conveniencia.
 *
 * Cada toggle guarda un override en localStorage (`mant_dev_modules_visible`,
 * vía useDevModulesVisibility) y NO se sincroniza entre dispositivos a propósito.
 * `Panel Admin` está bloqueado (no ocultable): es la vía de vuelta a esta página.
 */
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, EyeOff, RotateCcw, Wrench, Lock } from 'lucide-react'
import { useDevModulesVisibility } from '@/hooks/useDevModulesVisibility'
import { ALL_NAV_ITEMS, type NavItemMeta } from '@/components/layout/MainLayout'

export function DevModulesPage() {
  const { isVisible, setVisible, reset } = useDevModulesVisibility()

  const devItems = ALL_NAV_ITEMS.filter((it) => it.inDevelopment)
  const prodItems = ALL_NAV_ITEMS.filter((it) => !it.inDevelopment)

  // Un item está "visible" si su default (producción=true / dev=false) sigue en
  // pie o el override del mapa lo dice. Los bloqueados siempre cuentan visibles.
  const itemVisible = (it: NavItemMeta) =>
    it.locked || isVisible(it.href, !it.inDevelopment)

  const visibleCount = ALL_NAV_ITEMS.filter(itemVisible).length

  const renderRow = (item: NavItemMeta) => {
    const visible = itemVisible(item)
    return (
      <div
        key={item.href}
        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium flex items-center gap-1.5">
            {item.name}
            {item.locked && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 font-normal">
                <Lock className="w-3 h-3" />
                fijo
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {item.group} · {item.href}
          </div>
        </div>
        <Switch
          checked={visible}
          disabled={item.locked}
          onCheckedChange={(next) => setVisible(item.href, next)}
          aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${item.name} en sidebar`}
        />
      </div>
    )
  }

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
          Módulos del sidebar
        </h1>
        <p className="text-sm text-muted-foreground">
          Mostrá u ocultá cualquier módulo del menú lateral a conveniencia. Los
          módulos en desarrollo vienen ocultos por default; los de producción,
          visibles. La preferencia se guarda en este dispositivo — no afecta a
          otros usuarios.
        </p>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-3 flex items-start gap-2 text-xs text-amber-300">
          <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Visibles ahora: <b>{visibleCount}</b> de {ALL_NAV_ITEMS.length}.
            <Button
              variant="link"
              size="sm"
              className="text-xs text-amber-300 underline ml-1 h-auto p-0"
              onClick={reset}
            >
              <RotateCcw className="w-3 h-3 mr-1 inline" />
              Restaurar visibilidad por defecto
            </Button>
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">En desarrollo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ocultos por default. Activá los que quieras probar.
          </p>
        </CardHeader>
        <CardContent className="divide-y divide-border/40">
          {devItems.map(renderRow)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">En producción</CardTitle>
          <p className="text-xs text-muted-foreground">
            Visibles por default. Ocultá los que no quieras ver en el menú.
          </p>
        </CardHeader>
        <CardContent className="divide-y divide-border/40">
          {prodItems.map(renderRow)}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground/70 px-1">
        Los cambios se aplican al instante. Si no ves un item después de
        activarlo, refrescá la página.
      </p>
    </div>
  )
}
