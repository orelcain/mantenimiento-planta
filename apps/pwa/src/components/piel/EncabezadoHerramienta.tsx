import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Home, MessageCircle, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore, usePermissionsStore } from '@/store'
import { abrirAria } from '@/lib/pantallaCompletaMovil'
import { useVolver } from '@/hooks/useVolver'
import { Sheet } from './Sheet'
import { CellIcon, ListCell, ListGroup } from './GroupedList'

/**
 * EncabezadoHerramienta — el ÚNICO encabezado de las herramientas del Centro de Aprendizaje
 * (HMI Knuro, Grader y Bombeo, Perilla 5, Tarjeta A3C, planos, Variadores, fichas, terreno).
 *
 * Reemplaza los «volver» y las barras propias de cada una. Forma (mockup A aprobado, 2026-10-09):
 *  - Fila de 56 px en el celular y 64 en PC (+ safe-area superior): volver «‹» (48×48; en PC con el
 *    rótulo del destino), título + subtítulo, y dos acciones fijas de 48×48: «Preguntar a ARIA» y «Más».
 *  - El ÚNICO control de la herramienta (`control`, normalmente un SegmentedControl de tamaño
 *    `herramienta`) va debajo en el celular y dentro de la fila en PC.
 *  - Sin barra inferior ni botón flotante en estas rutas (MainLayout), así que desde aquí siempre
 *    se puede volver: con el «‹», con el atrás del sistema (mismo historial, `useVolver`) y con
 *    «Más → Ir al inicio».
 *
 * Es cromo de navegación: translúcido con desenfoque (§36), filete inferior de 1 px.
 */
export interface ItemMasHerramienta {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
  /** Texto gris bajo el rótulo. */
  subtitle?: string
  disabled?: boolean
}

export interface EncabezadoHerramientaProps {
  /** Destino del «‹» en palabras: «Aprendizaje», «Baader 142». Va como rótulo en PC y en el aria-label. */
  etiquetaVolver: string
  /** Ruta a la que se vuelve si no hay historial interno (enlace directo, QR, recarga). */
  volverA: string
  /** Para vistas internas que no son una ruta (p. ej. el detalle de Variadores): reemplaza al historial. */
  onVolver?: () => void
  titulo: string
  subtitulo?: string
  /** El único control de la herramienta. */
  control?: ReactNode
  /** Entradas propias del menú «Más» (pantalla completa, compartir, expediente…). */
  itemsMas?: readonly ItemMasHerramienta[]
  /** Texto con que se abre ARIA (queda escrito en el campo, no se envía): herramienta, preset, pantalla. */
  contextoAria?: string
  /**
   * Páginas de LECTURA (scroll de la ventana, no de un contenedor): el encabezado se queda pegado
   * arriba. En PC con sesión baja bajo la barra superior de la app (3.5 rem). Los lienzos no lo
   * necesitan: el encabezado es una fila fija y el cuerpo scrollea aparte.
   */
  pegajoso?: boolean
  /** Clases extra para el contenedor del encabezado. */
  className?: string
}

const BOTON_ICONO =
  'flex size-[48px] shrink-0 items-center justify-center rounded-full text-brand-ink ' +
  'transition-colors duration-150 hover:bg-muted active:bg-muted motion-reduce:transition-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function EncabezadoHerramienta({
  etiquetaVolver,
  volverA,
  onVolver,
  titulo,
  subtitulo,
  control,
  itemsMas = [],
  contextoAria,
  pegajoso = false,
  className,
}: EncabezadoHerramientaProps) {
  const navigate = useNavigate()
  const volverHistorial = useVolver(volverA)
  const volver = onVolver ?? volverHistorial
  const autenticado = useAuthStore((s) => s.isAuthenticated)
  const { canSee } = usePermissionsStore()
  const [masAbierto, setMasAbierto] = useState(false)

  // ARIA vive dentro del layout con sesión: sin sesión (QR, enlace público) no hay chat al que abrir.
  const conAria = autenticado && canSee('aria')
  const cerrarYHacer = (fn: () => void) => () => { setMasAbierto(false); fn() }

  return (
    <header
      className={cn(
        'z-30 shrink-0 border-b border-border bg-background/90 backdrop-blur-xl',
        'pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
        pegajoso && (autenticado ? 'sticky top-0 lg:top-14' : 'sticky top-0'),
        className,
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 px-1 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto] lg:gap-x-3 lg:px-3">
        <button
          type="button"
          onClick={volver}
          aria-label={`Volver a ${etiquetaVolver}`}
          className={cn(
            BOTON_ICONO,
            'col-start-1 row-start-1 lg:h-[64px] lg:w-auto lg:gap-0.5 lg:pl-1.5 lg:pr-4',
          )}
        >
          <ChevronLeft className="size-[26px] shrink-0" aria-hidden />
          <span className="hidden text-body font-medium lg:inline">{etiquetaVolver}</span>
        </button>

        <div className="col-start-2 row-start-1 flex h-[56px] min-w-0 flex-col justify-center lg:h-[64px]">
          <h1 className="truncate text-headline text-foreground">{titulo}</h1>
          {subtitulo && <p className="truncate text-footnote text-muted-foreground">{subtitulo}</p>}
        </div>

        {control && (
          <div className="col-span-3 col-start-1 row-start-2 px-3 pb-3 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:w-[22rem] lg:px-0 lg:pb-0">
            {control}
          </div>
        )}

        <div className="col-start-3 row-start-1 flex h-[56px] items-center lg:col-start-4 lg:h-[64px]">
          {conAria && (
            <button
              type="button"
              onClick={() => abrirAria(contextoAria)}
              aria-label="Preguntar a ARIA"
              className={BOTON_ICONO}
            >
              <MessageCircle className="size-[22px]" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMasAbierto(true)}
            aria-label="Más"
            aria-haspopup="dialog"
            className={BOTON_ICONO}
          >
            <MoreHorizontal className="size-[22px]" aria-hidden />
          </button>
        </div>
      </div>

      <Sheet open={masAbierto} onClose={() => setMasAbierto(false)} title="Más" surface="grouped">
        <ListGroup>
          {itemsMas.map((it) => (
            <ListCell
              key={it.key}
              leading={<CellIcon tone="neutral">{it.icon}</CellIcon>}
              title={it.label}
              subtitle={it.subtitle}
              onClick={it.disabled ? undefined : cerrarYHacer(it.onClick)}
              aria-disabled={it.disabled || undefined}
              className={cn('min-h-[52px]', it.disabled && 'opacity-50')}
            />
          ))}
          {conAria && (
            <ListCell
              leading={<CellIcon tone="neutral"><MessageCircle aria-hidden /></CellIcon>}
              title="Preguntar a ARIA"
              onClick={cerrarYHacer(() => abrirAria(contextoAria))}
              className="min-h-[52px]"
            />
          )}
          <ListCell
            leading={<CellIcon tone="neutral"><Home aria-hidden /></CellIcon>}
            title={autenticado ? 'Ir al inicio' : 'Ir al Centro de aprendizaje'}
            onClick={cerrarYHacer(() => navigate(autenticado ? '/' : '/aprendizaje'))}
            className="min-h-[52px]"
          />
        </ListGroup>
      </Sheet>
    </header>
  )
}
