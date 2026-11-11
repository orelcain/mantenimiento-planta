/**
 * Skeleton — bloque de carga con la forma de lo que va a llegar.
 *
 * Reemplaza al spinner en las cargas de datos: el usuario ve dónde va a aparecer
 * cada cifra y no un giro que no dice nada. Es un rectángulo de `muted-foreground` al 10 % (al 20 % en oscuro: medido 11-11, al 10 % el contraste con el fondo era 1,15:1 y no se veía; el `muted` de la piel oscura tampoco se distingue de la tarjeta)
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
      className={cn('rounded-ctl bg-muted-foreground/10 dark:bg-muted-foreground/20 motion-safe:animate-pulse', className)}
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

/* ── Formas ──────────────────────────────────────────────────────────────
 * La regla (mockup A, elegido el 11-11-2026): cada línea gris va donde irá
 * el texto, con el alto de su tamaño de letra y un largo creíble, y las filas
 * se separan con filete, no con cajas. Al llegar los datos no salta nada.
 */

/** Alto de la barra según el tamaño de letra que reemplaza (y su interlínea). */
const ALTO_LINEA = {
  titulo: 'my-1 h-[18px]',
  cuerpo: 'my-[5px] h-3',
  nota: 'my-1 h-2.5',
} as const
export type TamanoLineaSkeleton = keyof typeof ALTO_LINEA

/** Largos que se repiten sin parecer copia: los textos reales no miden igual. */
const LARGOS = ['62%', '48%', '70%', '55%', '66%', '44%', '58%']
const largo = (i: number, desfase = 0) => LARGOS[(i + desfase) % LARGOS.length]

export interface SkeletonLineaProps {
  /** Largo CSS («60%», «8rem»). */
  ancho?: string
  tamano?: TamanoLineaSkeleton
  className?: string
}

/** Una línea de texto que todavía no llega. */
export function SkeletonLinea({ ancho = '60%', tamano = 'cuerpo', className }: SkeletonLineaProps) {
  return (
    <div
      aria-hidden
      className={cn('rounded-full bg-muted-foreground/10 dark:bg-muted-foreground/20 motion-safe:animate-pulse', ALTO_LINEA[tamano], className)}
      style={{ width: ancho }}
    />
  )
}

export interface SkeletonFilasProps {
  label: string
  /** Cuántas filas dibujar (default 4). */
  filas?: number
  /** Líneas por fila: 1 = solo título, 2 = título y nota (default 2). */
  lineas?: 1 | 2 | 3
  /** Cifra corta a la derecha (stock, hora, %). Default true. */
  cola?: boolean
  className?: string
}

/** Lista: filas separadas por filete, con título, nota y una cifra a la derecha. */
export function SkeletonFilas({ label, filas = 4, lineas = 2, cola = true, className }: SkeletonFilasProps) {
  return (
    <SkeletonBloque label={label} className={cn('flex flex-col', className)}>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-start justify-between gap-3 border-b border-border py-2.5">
          <div className="min-w-0 flex-1">
            <SkeletonLinea ancho={largo(i)} />
            {lineas === 2 && <SkeletonLinea ancho={i % 2 ? '30%' : '36%'} tamano="nota" />}
            {lineas === 3 && <SkeletonLinea ancho={largo(i, 3)} />}
            {lineas === 3 && <SkeletonLinea ancho={largo(i, 5)} tamano="nota" />}
          </div>
          {cola && <SkeletonLinea ancho="2rem" tamano="nota" className="shrink-0" />}
        </div>
      ))}
    </SkeletonBloque>
  )
}

export interface SkeletonTablaProps {
  label: string
  filas?: number
  columnas?: number
  className?: string
}

/** Tabla: cabecera con filete fuerte y filas con filete fino; la primera columna es la ancha. */
export function SkeletonTabla({ label, filas = 5, columnas = 4, className }: SkeletonTablaProps) {
  const plantilla = { gridTemplateColumns: `minmax(0,2fr) repeat(${Math.max(columnas - 1, 0)}, minmax(0,1fr))` }
  return (
    <SkeletonBloque label={label} className={cn('w-full', className)}>
      <div className="grid gap-4 border-b border-foreground/30 pb-1.5" style={plantilla}>
        {Array.from({ length: columnas }, (_, c) => <SkeletonLinea key={c} ancho={c === 0 ? '40%' : '60%'} tamano="nota" />)}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="grid gap-4 border-b border-border py-2" style={plantilla}>
          {Array.from({ length: columnas }, (_, c) => <SkeletonLinea key={c} ancho={c === 0 ? largo(f) : '50%'} />)}
        </div>
      ))}
    </SkeletonBloque>
  )
}

export interface SkeletonPanelProps {
  label: string
  /** Cifras clave en una franja con filete arriba y abajo (0 = sin franja). */
  kpis?: number
  /** Líneas de texto bajo la franja (default 3). */
  lineas?: number
  /** Alto CSS de un gráfico o visor al final («12rem»); sin valor no se dibuja. */
  grafico?: string
  className?: string
}

/** Panel o página: título, franja de cifras, texto y, si corresponde, el gráfico. */
export function SkeletonPanel({ label, kpis = 0, lineas = 3, grafico, className }: SkeletonPanelProps) {
  return (
    <SkeletonBloque label={label} className={cn('flex flex-col gap-3', className)}>
      <SkeletonLinea ancho="55%" tamano="titulo" />
      {kpis > 0 && (
        <div className="flex flex-wrap gap-x-6 border-y border-border py-2">
          {Array.from({ length: kpis }, (_, i) => (
            <div key={i} className="flex flex-col">
              <SkeletonLinea ancho="2.75rem" />
              <SkeletonLinea ancho="3.5rem" tamano="nota" />
            </div>
          ))}
        </div>
      )}
      {lineas > 0 && (
        <div>
          {Array.from({ length: lineas }, (_, i) => <SkeletonLinea key={i} ancho={i === lineas - 1 ? '40%' : '92%'} />)}
        </div>
      )}
      {grafico && <SkeletonGrafico alto={grafico} />}
    </SkeletonBloque>
  )
}

export interface SkeletonGraficoProps {
  /** Alto CSS del área del gráfico, visor o imagen (default «12rem»). */
  alto?: string
  /** Si va suelto (sin SkeletonPanel), el rótulo para lectores de pantalla. */
  label?: string
  className?: string
}

/** Área de un gráfico, un visor 3D o una imagen: el único caso en que el esqueleto es un bloque. */
export function SkeletonGrafico({ alto = '12rem', label, className }: SkeletonGraficoProps) {
  const bloque = <Skeleton className={cn('w-full', className)} style={{ height: alto }} />
  return label ? <SkeletonBloque label={label}>{bloque}</SkeletonBloque> : bloque
}
