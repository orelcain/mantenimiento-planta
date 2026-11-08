/**
 * Skeleton — bloque de carga con la forma de lo que va a llegar.
 *
 * Reemplaza al spinner en las cargas de datos: el usuario ve dónde va a aparecer
 * cada cifra y no un giro que no dice nada. Es un rectángulo del token `muted`
 * con redondeo de la escala; el pulso se apaga con `prefers-reduced-motion`
 * (`motion-safe:` solo anima si el usuario no lo pidió).
 *
 * `SkeletonBloque` agrega el rótulo accesible (`role="status"`) para lectores de
 * pantalla. Los botones en envío NO usan esto: siguen con su propio indicador.
 */
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('rounded-ctl bg-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  )
}

export interface SkeletonBloqueProps {
  /** Qué se está cargando, para lectores de pantalla («Cargando turnos»). */
  label: string
  className?: string
  children: ReactNode
}

export function SkeletonBloque({ label, className, children }: SkeletonBloqueProps) {
  return (
    <div role="status" aria-label={label} className={className}>
      {children}
    </div>
  )
}
