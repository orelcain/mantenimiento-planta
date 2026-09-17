import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, LogOut, NotebookPen } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { LoadingScreen } from '@/components/ui'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import { apiPaseReal, mensajeDeError } from '@/services/bitacora/paseBitacora'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { cn } from '@/lib/utils'

/**
 * Marco de la app para un teléfono con PASE DE BITÁCORA (QR + PIN): solo la
 * bitácora del turno y su historial. Sin Inicio, menú ni los listeners
 * globales del MainLayout (incidencias, equipos…), que el pase no puede leer.
 *
 * La barra de abajo repite la geometría de la del MainLayout (60 px, flota a
 * 12 px): el botón fijo «Nuevo evento» de la bitácora cuenta con ella.
 */
const PESTANAS = [
  { to: '/bitacora', nombre: 'Turno', icono: NotebookPen, exacta: true },
  { to: '/bitacora/historial', nombre: 'Historial', icono: BarChart3, exacta: false },
] as const

export function PaseBitacoraLayout() {
  const pase = useAuthStore((s) => s.user?.paseBitacora)
  const uid = useAuthStore((s) => s.user?.id)
  const location = useLocation()
  const { toast } = useToast()

  // Si un supervisor quita este teléfono (o reinicia el PIN de su técnico), la
  // bitácora dejaría de cargar con errores de permiso: se cierra la sesión y
  // se dice por qué.
  useEffect(() => {
    if (!uid) return
    let quitar: (() => void) | undefined
    let vivo = true
    void Promise.all([import('firebase/firestore'), import('@/services/firebase')]).then(([{ doc, onSnapshot }, { db }]) => {
      if (!vivo) return
      quitar = onSnapshot(
        doc(db, 'bitacoraDispositivos', uid),
        (snap) => {
          if (snap.exists() && snap.data()?.activo !== false) return
          toast({
            title: 'Este teléfono ya no tiene acceso a la bitácora',
            description: 'Un supervisor lo quitó. Para volver a entrar, escanea el QR y escribe tu PIN.',
            variant: 'destructive',
          })
          void import('firebase/auth').then(({ signOut }) => import('@/services/firebase').then(({ auth }) => signOut(auth)))
        },
        () => undefined,
      )
    })
    return () => {
      vivo = false
      quitar?.()
    }
  }, [uid, toast])

  return (
    <MarcoPaseBitacora nombre={pase?.nombre ?? ''} ruta={location.pathname}>
      <Suspense fallback={<LoadingScreen />} key={location.pathname}>
        <Outlet />
      </Suspense>
    </MarcoPaseBitacora>
  )
}

/** El marco sin el router (la vitrina lo usa con la bitácora de ejemplo). */
export function MarcoPaseBitacora({ nombre, ruta, children }: { nombre: string; ruta: string; children: React.ReactNode }) {
  const { toast } = useToast()
  const [confirmarSalida, setConfirmarSalida] = useState(false)
  const [saliendo, setSaliendo] = useState(false)

  const salir = async () => {
    setSaliendo(true)
    try {
      await apiPaseReal.salir()
    } catch (e) {
      toast({ title: 'No se pudo cerrar la sesión', description: mensajeDeError(e), variant: 'destructive' })
      setSaliendo(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        className="sticky z-30 flex items-center justify-between gap-3 bg-background/80 px-4 py-1 backdrop-blur-xl"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <p className="min-w-0 truncate text-footnote text-muted-foreground">
          {BITACORA_PLANTA.nombre} · <span className="font-semibold text-foreground">{nombre}</span>
        </p>
        <Button variant="plain" className="-mr-3 shrink-0" onClick={() => setConfirmarSalida(true)}>
          <LogOut /> Salir
        </Button>
      </header>

      <main id="main-content" className="w-full max-w-[100vw] overflow-x-hidden p-3 pb-44 lg:p-6 lg:pb-24">
        {children}
      </main>

      <nav
        className="fixed inset-x-3 z-40 rounded-full glass-nav lg:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        aria-label="Bitácora"
      >
        <div className="flex h-[60px] items-center px-1.5 [@media(max-height:500px)]:h-10">
          {PESTANAS.map((p) => {
            const activa = p.exacta ? ruta === p.to : ruta.startsWith(p.to)
            return (
              <NavLink
                key={p.to}
                to={p.to}
                end={p.exacta}
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

      <Sheet
        open={confirmarSalida}
        onClose={() => setConfirmarSalida(false)}
        title="Salir de la bitácora"
        description="Para volver a entrar en este teléfono vas a necesitar el QR y tu PIN."
        actions={
          <>
            <Button variant="tinted" onClick={() => setConfirmarSalida(false)} disabled={saliendo}>
              Quedarme
            </Button>
            <Button variant="destructive" onClick={() => void salir()} disabled={saliendo}>
              Salir
            </Button>
          </>
        }
      >
        <span className="sr-only">Confirmar salida</span>
      </Sheet>
    </div>
  )
}
