/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'success' | 'warning'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

// CAPSULA (`rounded-full`), no `rounded-ctl`: Apple lo documenta como default
// desde iOS 26 ("bordered buttons now have a capsule shape by default") y es lo
// que pide DESIGN.md §5. `rounded-ctl` (10px) sigue siendo el radio de inputs,
// chips y segmented — un boton y un campo de texto NO comparten forma en iOS.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        // TINTED, no un bloque de color solido: es el patron de iOS y es lo que
        // pide el propio contrato (HIG doc §5.1 y DESIGN.md §5: "destructive =
        // rojo tinted"). Un boton rojo relleno con texto blanco no existe en
        // iOS, y ademas daba 3.41:1. Medido con el tinte al 13%: 4.70:1 en
        // claro y 4.71:1 en oscuro sobre card.
        // El tinte va OPACO (`bg-destructive-tint`), no con alfa: con alfa se
        // apoyaba en lo que hubiera debajo y sobre el fondo gris caia a 4.25:1.
        // Se probo antes oscurecer el TEXTO y no era el camino: el systemRed
        // accessible de Apple (#D70015) da 4.08 ahi, PEOR que el actual. El
        // problema nunca fue la tinta sino la superficie, y subir el tinte lo
        // empeora (20% -> 3.88, 28% -> 3.49). Con base fija: 4.72 y 4.73.
        destructive:
          'bg-destructive-tint text-destructive hover:brightness-95',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-success text-success-foreground hover:bg-success/90',
        warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
      },
      // Alturas en `rem` A PROPOSITO, no en px: `index.css` devuelve el root a
      // 16px cuando el puntero es grueso (dedo/guante), asi que h-11 = 44px
      // exactos en tactil y ~38px con mouse, donde manda la precision y no el
      // dedo. Poner `h-[44px]` romperia esa decision y agrandaria escritorio.
      // 2026-09-15: el default estaba en h-10 (40px en tactil) y violaba el
      // minimo de 44 de la constitucion en TODA la app.
      size: {
        default: 'h-11 px-4 py-2',   // 44px tactil — el estandar
        sm: 'h-9 rounded-full px-3',  // 36px — solo donde el espacio aprieta; piso a11y 28
        lg: 'h-12 rounded-full px-8', // 48px — el "ideal" de la constitucion
        icon: 'h-11 w-11',           // 44x44
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
