import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <Loader2 className={cn('animate-spin text-primary', sizeClasses[size], className)} />
  )
}

export function LoadingScreen({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
      <Spinner size="lg" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  )
}
