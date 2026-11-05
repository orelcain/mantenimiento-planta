import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, Eye, Home, Package } from 'lucide-react'
import { LoadingScreen } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Marco de la app para un teléfono con el PASE DE LECTURA de los nuevos: solo
 * el portal, el Centro de Aprendizaje y Repuestos. Sin menú ni los listeners
 * globales del MainLayout (incidencias, equipos…), que el pase no puede leer.
 *
 * La barra de abajo repite la geometría de la del pase de bitácora (60 px,
 * flota a 12 px); en PC queda centrada y angosta en vez de cruzar la pantalla.
 */
const PESTANAS = [
  { to: '/nuevos', nombre: 'Inicio', icono: Home },
  { to: '/aprendizaje', nombre: 'Aprendizaje', icono: BookOpen },
  { to: '/repuestos', nombre: 'Repuestos', icono: Package },
] as const

export function PaseLecturaLayout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        className="sticky z-30 flex items-center justify-center gap-1.5 bg-background/80 px-4 py-1.5 backdrop-blur-xl"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <Eye className="size-3.5 text-muted-foreground" aria-hidden />
        <p className="text-footnote text-muted-foreground">Modo lectura · Mantención ANTARFOOD</p>
      </header>
      <main id="main-content" className="w-full max-w-[100vw] overflow-x-hidden p-3 pb-32 lg:p-6 lg:pb-28">
        <Suspense fallback={<LoadingScreen />} key={pathname}>
          <Outlet />
        </Suspense>
      </main>
      <nav
        className="fixed inset-x-3 z-40 rounded-full glass-nav lg:inset-x-auto lg:left-1/2 lg:w-[26rem] lg:-translate-x-1/2"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        aria-label="Modo lectura"
      >
        <div className="flex h-[60px] items-center px-1.5 [@media(max-height:500px)]:h-10">
          {PESTANAS.map((p) => {
            const activa = pathname === p.to || pathname.startsWith(`${p.to}/`)
            return (
              <NavLink
                key={p.to}
                to={p.to}
                className={cn(
                  'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium transition-colors active:scale-[0.97]',
                  activa ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <p.icono className={cn('h-[22px] w-[22px] [@media(max-height:500px)]:h-4 [@media(max-height:500px)]:w-4', activa && 'stroke-[2.4px]')} />
                <span className="[@media(max-height:500px)]:hidden">{p.nombre}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
