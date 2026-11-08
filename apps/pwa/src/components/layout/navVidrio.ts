/**
 * Clases del Vidrio líquido en la navegación (PLAN_VIDRIO_LIQUIDO.md, Fase 1).
 *
 * Cada función recibe `apple` (piel Apple activa, `usePielApple`). Con `apple = false`
 * devuelve EXACTAMENTE las clases que tenía MainLayout antes: la piel anterior no
 * cambia. El material en sí vive en index.css (`.vidrio`, `.vidrio-lente`, ...).
 */
import type { IncidentStatus } from '@/types'
import { cn } from '@/lib/utils'

/** Estados que cuentan como incidencia activa (mismo criterio que DashboardPage). */
export const ESTADOS_INCIDENCIA_ACTIVA: ReadonlyArray<IncidentStatus> = ['pendiente', 'confirmada', 'en_proceso']

export function contarIncidenciasActivas(incidencias: ReadonlyArray<{ status: IncidentStatus }>): number {
  return incidencias.filter((i) => ESTADOS_INCIDENCIA_ACTIVA.includes(i.status)).length
}

/** Panel lateral de PC (≥ lg). Apple: flotante, 16 px del borde, radio 30. */
export function claseAsidePC(apple: boolean, oculto: boolean): string {
  if (apple) {
    return oculto
      ? 'hidden'
      : 'hidden lg:flex flex-col flex-shrink-0 fixed left-4 top-4 bottom-4 z-30 w-64 overflow-hidden rounded-[30px] vidrio'
  }
  return cn(
    'hidden lg:flex flex-col flex-shrink-0 bg-[var(--sidebar-surface)] border-r transition-[width] duration-200 overflow-hidden h-screen sticky top-0',
    oculto ? 'w-0' : 'w-64',
  )
}

/** Con el panel flotante, el contenido deja su franja: 16 + 256 + 16 px = 288 px (lg:pl-72). */
export function clasePaddingContenidoPC(apple: boolean, oculto: boolean): string {
  return apple && !oculto ? 'lg:pl-72' : ''
}

/** Ítem del menú de PC. Apple: el activo es `.vidrio-lente`. */
export function claseItemPC(apple: boolean, activo: boolean): string {
  if (apple) {
    return activo
      ? 'rounded-[14px] vidrio-lente focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
      : 'rounded-[14px] text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  }
  return cn(
    'rounded-ctl',
    activo
      ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-foreground)]'
      : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground',
  )
}

/** Barra inferior del celular (< lg). */
export function claseBarraInferior(apple: boolean): string {
  return apple
    ? 'lg:hidden fixed inset-x-3 z-40 rounded-full vidrio'
    : 'lg:hidden fixed inset-x-3 z-40 rounded-full glass-nav'
}

/** Pestaña de la barra inferior. Apple: la activa es una gota `.vidrio-lente`. */
export function claseTabBarra(apple: boolean, activo: boolean): string {
  if (apple) {
    return activo
      ? 'vidrio-lente rounded-[26px] py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
      : 'text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  }
  return activo ? 'text-primary' : 'text-muted-foreground'
}
