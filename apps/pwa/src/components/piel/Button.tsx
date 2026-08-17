/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Botón de la NUEVA PIEL (docs/NUEVA_PIEL_APPLE_HIG.md §5.1).
 *
 * Cuatro niveles de énfasis, no ocho: en una vista puede haber COMO MÁXIMO UN
 * `filled` — es el que dice "la acción principal de esta pantalla es esta".
 * El resto baja de peso: `tinted` para secundarias, `plain` para navegación.
 *
 * Ojo con `destructive`: es tinted, nunca relleno sólido. Un botón rojo grande
 * invita a pulsarlo; el tinte pide confirmar antes (y la confirmación va en un
 * <Sheet>, no en un modal centrado).
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold',
    'rounded-full select-none',
    // Motion §7: solo transform/opacity, curva iOS, 180ms.
    'transition-[transform,opacity,background-color] duration-[180ms] [transition-timing-function:cubic-bezier(.32,.72,0,1)]',
    'active:scale-[.97] motion-reduce:active:scale-100 motion-reduce:transition-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card',
    'disabled:pointer-events-none disabled:opacity-40',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        filled: 'bg-primary text-primary-foreground hover:brightness-[1.06]',
        tinted: 'bg-primary/[0.13] text-primary hover:bg-primary/[0.18]',
        plain: 'bg-transparent text-primary font-medium hover:opacity-70',
        destructive: 'bg-red-500/[0.13] text-red-600 hover:bg-red-500/[0.18]',
      },
      size: {
        // Alturas ≥44px salvo `sm`, que es para barras densas de escritorio.
        // `md` usa el píxel literal (no `h-11`): el root global va al 87.5%
        // (85% en móvil, ver index.css), así que h-11 (2.75rem) rinde ~37-38px
        // y no los 44 que este comentario promete.
        sm: 'h-9 px-4 text-[0.8rem]',
        md: 'h-[44px] px-5 text-sm',
        lg: 'h-[3.25rem] px-6 text-[0.95rem] rounded-panel',
        block: 'h-[3.25rem] w-full px-6 text-[0.95rem] rounded-panel',
      },
    },
    defaultVariants: { variant: 'filled', size: 'md' },
  },
)

export interface PielButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tinted' | 'plain' | 'destructive'
  size?: 'sm' | 'md' | 'lg' | 'block'
}

export const Button = React.forwardRef<HTMLButtonElement, PielButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)
Button.displayName = 'PielButton'

export { buttonVariants }
