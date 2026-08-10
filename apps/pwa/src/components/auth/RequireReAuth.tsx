/**
 * RequireReAuth — gate de re-autenticación obligatoria.
 *
 * Bloquea el acceso a rutas sensibles (área admin) hasta que el usuario
 * confirme su identidad re-introduciendo email y contraseña, AÚN cuando
 * la sesión esté abierta. Esto evita modificaciones accidentales si la
 * sesión queda activa en planta y otra persona toca la app.
 *
 * Convención: NO se cachea la confirmación. Cada vez que se monta el
 * componente (cada navegación a una ruta protegida), se vuelve a pedir.
 * Si el usuario navega entre rutas admin sin volver al home, el estado
 * `authenticated` se mantiene mientras este componente sigue montado.
 *
 * Uso:
 *   <RequireReAuth>
 *     <PaginaSensible />
 *   </RequireReAuth>
 *
 * Implementación: usa `reauthenticateWithCredential` de Firebase Auth —
 * valida la pass sin tocar la sesión activa. Si OK, renderiza children.
 * Si KO, muestra error inline y permite reintentar.
 */

import { useState, useCallback, type ReactNode } from 'react'
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { auth } from '@/services/firebase'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Spinner,
} from '@/components/ui'
import { ShieldAlert, LogIn } from 'lucide-react'
import { logger } from '@/lib/logger'

interface RequireReAuthProps {
  children: ReactNode
  /** Texto opcional para personalizar el motivo del re-auth (ej: "antes de modificar credenciales"). */
  reason?: string
}

export function RequireReAuth({ children, reason }: RequireReAuthProps) {
  const [authenticated, setAuthenticated] = useState(false)
  const [email, setEmail] = useState(auth.currentUser?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  const handleSubmit = useCallback(async () => {
    setError(null)

    const currentUser = auth.currentUser
    if (!currentUser || !currentUser.email) {
      setError('No hay sesión activa. Vuelve a iniciar sesión.')
      return
    }

    if (!email.trim() || !password) {
      setError('Email y contraseña son requeridos')
      return
    }

    // Verificación adicional: el email tipado debe coincidir con el de la
    // sesión activa. Evita que alguien autentique con otra cuenta admin
    // diferente en una sesión que no le pertenece.
    if (email.trim().toLowerCase() !== currentUser.email.toLowerCase()) {
      setError(`Debes ingresar el email de la sesión activa (${currentUser.email})`)
      return
    }

    setLoading(true)
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password)
      await reauthenticateWithCredential(currentUser, credential)
      setAuthenticated(true)
      setPassword('')
    } catch (err) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      // Mensajes específicos para los códigos de Firebase Auth más comunes
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError(`Contraseña incorrecta${newAttempts >= 3 ? ' — varios intentos fallidos' : ''}`)
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Intenta más tarde.')
      } else {
        const msg = err instanceof Error ? err.message : 'Error de autenticación'
        setError(msg)
      }
      logger.error('[RequireReAuth] Re-auth failed', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [email, password, attempts])

  // Si el usuario ya pasó el gate, dejarlo pasar al contenido protegido
  if (authenticated) {
    return <>{children}</>
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-md">
      <Card className="border-amber-500/[0.25]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            Confirmación de identidad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {reason
              ? `Re-introduce tus credenciales ${reason}.`
              : 'Esta es un área sensible. Re-introduce tus credenciales para continuar.'}
          </p>
          <p className="text-xs text-muted-foreground">
            Aunque tu sesión esté activa, pedimos confirmación cada vez que entras al panel admin
            para evitar cambios accidentales si alguien más usa el dispositivo.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
            className="space-y-3 pt-1"
          >
            <div className="space-y-1.5">
              <Label htmlFor="reauth-email">Email</Label>
              <Input
                id="reauth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reauth-password">Contraseña</Label>
              <div className="flex gap-1.5">
                <Input
                  id="reauth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                >
                  {showPassword ? 'Ocultar' : 'Ver'}
                </Button>
              </div>
            </div>
            {error && (
              <p className="text-xs text-cat-5-ink">{error}</p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Spinner /> : <><LogIn className="w-4 h-4 mr-2" /> Confirmar y entrar</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
