import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, QrCode } from 'lucide-react'
import { Button } from '@/components/piel'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import { BITACORA_PLANTA } from '@/config/bitacora'
import {
  apiPaseReal,
  leerQrDeHash,
  mensajeDeError,
  type ApiPase,
  type DatosQr,
  type InfoPase,
} from '@/services/bitacora/paseBitacora'
import { cn } from '@/lib/utils'

/**
 * Entrada a la bitácora con el QR (mockup aprobado 16-09-2026): el técnico
 * elige su nombre (solo los que tienen PIN), escribe su PIN personal y el
 * teléfono queda dentro de la bitácora. Solo la primera vez.
 */
export function PaseBitacoraPage() {
  const location = useLocation()
  const qr = leerQrDeHash(location.hash)
  const usuario = useAuthStore((s) => s.user)
  const cargando = useAuthStore((s) => s.isLoading)

  if (usuario?.paseBitacora) return <Navigate to="/bitacora" replace />
  if (cargando && !usuario) return <Marco><Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Cargando" /></Marco>
  return <EntradaPase qr={qr} api={apiPaseReal} sesionActual={usuario ? [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') : null} />
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-4 text-foreground" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 32px)', paddingBottom: 32 }}>
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">{children}</div>
    </div>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'min-h-[44px] rounded-full px-4 text-footnote font-semibold transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        activo ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/10 text-foreground hover:bg-muted-foreground/15',
      )}
    >
      {children}
    </button>
  )
}

export function EntradaPase({ qr, api, sesionActual }: { qr: DatosQr | null; api: ApiPase; sesionActual: string | null }) {
  const { toast } = useToast()
  const [info, setInfo] = useState<InfoPase | null>(null)
  const [errorQr, setErrorQr] = useState<string | null>(qr ? null : 'Este enlace no trae un QR válido. Escanea el QR de la bitácora otra vez.')
  const [nombre, setNombre] = useState('')
  const [pin, setPin] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cerrandoOtra, setCerrandoOtra] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)
  const enviado = useRef('')

  useEffect(() => {
    if (!qr) return
    let vivo = true
    api
      .info(qr)
      .then((i) => vivo && setInfo(i))
      .catch((e: unknown) => vivo && setErrorQr(mensajeDeError(e)))
    return () => {
      vivo = false
    }
  }, [api, qr?.plantId, qr?.token]) // eslint-disable-line react-hooks/exhaustive-deps -- qr se recalcula en cada render

  const entrar = async (valor: string) => {
    if (!qr || !nombre || entrando || valor.length !== 4) return
    // Un mismo PIN no se manda dos veces seguidas (autoenvío + botón).
    if (enviado.current === `${nombre}|${valor}`) return
    enviado.current = `${nombre}|${valor}`
    setEntrando(true)
    setError(null)
    try {
      const r = await api.entrar(qr, nombre, valor)
      toast({ title: `Listo, ${r.nombre.split(' ')[0]}`, description: 'Ya puedes registrar eventos en la bitácora.', variant: 'success' })
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
      enviado.current = ''
      pinRef.current?.focus()
    } finally {
      setEntrando(false)
    }
  }

  const cerrarOtraSesion = async () => {
    setCerrandoOtra(true)
    try {
      const [{ signOut }, { auth }] = await Promise.all([import('firebase/auth'), import('@/services/firebase')])
      await signOut(auth)
    } finally {
      setCerrandoOtra(false)
    }
  }

  return (
    <Marco>
      <header className="flex flex-col gap-1">
        <span className="flex size-12 items-center justify-center rounded-ctl bg-muted-foreground/10 text-muted-foreground">
          <QrCode className="size-6" aria-hidden />
        </span>
        <h1 className="pt-2 text-title1 font-bold">Bitácora de Mantención</h1>
        <p className="text-footnote text-muted-foreground">{BITACORA_PLANTA.nombre} · acceso para el equipo de Mantención</p>
      </header>

      {sesionActual && (
        <div className="flex flex-col gap-3 rounded-card bg-card p-4">
          <p className="text-body">
            Este navegador ya tiene la sesión de <span className="font-semibold">{sesionActual}</span>. Para entrar con el pase, primero
            ciérrala.
          </p>
          <Button variant="tinted" onClick={() => void cerrarOtraSesion()} disabled={cerrandoOtra}>
            {cerrandoOtra ? <Loader2 className="animate-spin" /> : null} Cerrar esa sesión
          </Button>
        </div>
      )}

      {!sesionActual && errorQr && (
        <p role="alert" className="rounded-card bg-card p-4 text-body">
          {errorQr}
        </p>
      )}

      {!sesionActual && !errorQr && !info && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-full bg-muted-foreground/10 motion-reduce:animate-none" />
          ))}
        </div>
      )}

      {!sesionActual && info && (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="pase-quien">
            <h2 id="pase-quien" className="text-headline">¿Quién eres?</h2>
            {info.tecnicos.length ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Técnicos habilitados">
                {info.tecnicos.map((t) => (
                  <Chip
                    key={t}
                    activo={nombre === t}
                    onClick={() => {
                      setNombre(t)
                      setPin('')
                      setError(null)
                      enviado.current = ''
                      setTimeout(() => pinRef.current?.focus(), 0)
                    }}
                  >
                    {t}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-body text-muted-foreground">Todavía nadie tiene PIN. Pídele a un supervisor que te asigne uno.</p>
            )}
            <p className="text-footnote text-muted-foreground">¿No apareces? Pídele tu PIN a un supervisor.</p>
          </section>

          {nombre && (
            <section className="flex flex-col gap-3 rounded-card bg-card p-4" aria-labelledby="pase-pin">
              <label id="pase-pin" htmlFor="pase-pin-input" className="text-headline">
                Tu PIN, {nombre.split(' ')[0]}
              </label>
              <input
                ref={pinRef}
                id="pase-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                // readOnly y no disabled: un campo deshabilitado pierde el foco y
                // el teclado del teléfono se cierra justo cuando hay que reintentar.
                readOnly={entrando}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                  setPin(v)
                  if (v.length === 4) void entrar(v)
                }}
                className="h-14 w-full rounded-ctl border-0 bg-muted-foreground/10 text-center text-title1 tracking-[0.6em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary tabular-nums"
                aria-describedby="pase-pin-ayuda"
              />
              <p id="pase-pin-ayuda" className="text-footnote text-muted-foreground">
                4 dígitos. Con 5 intentos fallidos se bloquea 15 minutos.
              </p>
              {error && (
                <p role="alert" className="text-footnote font-semibold text-ink-crit">
                  {error}
                </p>
              )}
              <Button size="block" onClick={() => void entrar(pin)} disabled={entrando || pin.length !== 4}>
                {entrando ? <Loader2 className="animate-spin" /> : null} Entrar a la bitácora
              </Button>
            </section>
          )}

          <p className="text-footnote text-muted-foreground">
            Solo la primera vez. Después, agrega la página a la pantalla de inicio desde el menú del navegador y se abre directo en la
            bitácora.
          </p>
        </>
      )}
    </Marco>
  )
}
