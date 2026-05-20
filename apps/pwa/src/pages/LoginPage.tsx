import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Wrench, LogIn, UserPlus } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Spinner,
  Switch,
} from '@/components/ui'
import { 
  signIn, 
  signUpWithInviteCode, 
  initGoogleSignIn, 
  renderGoogleButton,
  setAuthPersistence
} from '@/services/auth'
import { useAuthStore } from '@/store'
import { loginSchema, signUpSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { RateLimiter } from '@/lib/rate-limit'
import { APP_VERSION } from '@/constants/version'

// Max 5 intentos de login/registro cada 2 minutos
const authRateLimiter = new RateLimiter(5, 2 * 60 * 1000)

type AuthMode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rawRedirect = searchParams.get('redirect') || '/'
  // Solo permitir rutas internas (empiezan con /) y no URLs externas (// o proto://)
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/'
  const setUser = useAuthStore((state) => state.setUser)
  
  const [mode, setMode] = useState<AuthMode>('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [googleReady, setGoogleReady] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // Form fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  // Manejar persistencia
  useEffect(() => {
    setAuthPersistence(rememberMe)
  }, [rememberMe])

  // Inicializar Google Sign-In
  useEffect(() => {
    const initGoogle = () => {
      initGoogleSignIn(
        (user) => {
          logger.info('Google sign in successful', { userId: user.id })
          setUser(user)
          navigate(redirectTo)
        },
        (err) => {
          logger.error('Google sign in error', err)
          setError(err.message)
        }
      )
      // Renderizar botón después de inicializar
      setTimeout(() => {
        renderGoogleButton('google-signin-button')
        setGoogleReady(true)
      }, 100)
    }

    // Esperar a que el script de Google cargue
    // @ts-expect-error google is loaded via external script
    if (typeof google !== 'undefined') {
      initGoogle()
    } else {
      const checkGoogle = setInterval(() => {
        // @ts-expect-error google is loaded via external script
        if (typeof google !== 'undefined') {
          clearInterval(checkGoogle)
          initGoogle()
        }
      }, 100)
      // Timeout después de 5 segundos
      setTimeout(() => clearInterval(checkGoogle), 5000)
    }
  }, [navigate, setUser, redirectTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setValidationErrors({})

    // Rate limit: max 5 intentos cada 2 min
    if (!authRateLimiter.canExecute()) {
      const waitSec = Math.ceil(authRateLimiter.timeUntilNext() / 1000)
      setError(`Demasiados intentos. Espera ${waitSec}s antes de intentar de nuevo.`)
      return
    }

    setIsLoading(true)

    try {
      // Validar con Zod
      if (mode === 'login') {
        const validation = loginSchema.safeParse({ email, password })
        if (!validation.success) {
          const errors: Record<string, string> = {}
          validation.error.issues.forEach((err) => {
            const path = err.path.map((p) => String(p)).join('.')
            errors[path] = err.message
          })
          setValidationErrors(errors)
          logger.warn('Login validation failed', { errors })
          return
        }
      } else {
        const validation = signUpSchema.safeParse({ 
          email, 
          password, 
          nombre, 
          apellido, 
          inviteCode 
        })
        if (!validation.success) {
          const errors: Record<string, string> = {}
          validation.error.issues.forEach((err) => {
            const path = err.path.map((p) => String(p)).join('.')
            errors[path] = err.message
          })
          setValidationErrors(errors)
          logger.warn('SignUp validation failed', { errors })
          return
        }
      }

      logger.info(`Attempting ${mode}`, { email })
      
      let user
      if (mode === 'login') {
        user = await signIn(email, password)
      } else {
        user = await signUpWithInviteCode(email, password, nombre, apellido, inviteCode)
      }
      
      setUser(user)
      logger.info(`${mode} successful`, { userId: user.id, email: user.email })
      navigate(redirectTo)
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error('Authentication error')
      logger.error('Auth error', errorObj)
      setError(getErrorMessage((err as any).code || (err as any).message))
    } finally {
      setIsLoading(false)
    }
  }



  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Wrench className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            Mantenimiento Industrial
          </CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Ingresa tus credenciales para continuar'
              : 'Registra tu cuenta con el código de invitación'}
          </CardDescription>
          <div className="mt-2">
            <span className="text-xs text-muted-foreground">v{APP_VERSION}</span>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre</Label>
                    <Input
                      id="nombre"
                      placeholder="Juan"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      required
                      disabled={isLoading}
                      autoComplete="given-name"
                    />
                    {validationErrors.nombre && (
                      <p className="text-sm text-destructive">{validationErrors.nombre}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apellido">Apellido</Label>
                    <Input
                      id="apellido"
                      placeholder="Pérez"
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                      required
                      disabled={isLoading}
                      autoComplete="family-name"
                    />
                    {validationErrors.apellido && (
                      <p className="text-sm text-destructive">{validationErrors.apellido}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Código de Invitación</Label>
                  <Input
                    id="inviteCode"
                    placeholder="XXXX-XXXX"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                    disabled={isLoading}
                    className="uppercase tracking-widest"
                  />
                  {validationErrors.inviteCode && (
                    <p className="text-sm text-destructive">{validationErrors.inviteCode}</p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
              />
              {validationErrors.email && (
                <p className="text-sm text-destructive">{validationErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
                autoComplete="current-password"
              />
              {validationErrors.password && (
                <p className="text-sm text-destructive">{validationErrors.password}</p>
              )}
            </div>

            {mode === 'login' && (
              <div className="flex items-center space-x-2 my-2">
                <Switch 
                  id="remember-me" 
                  checked={rememberMe} 
                  onCheckedChange={setRememberMe} 
                />
                <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                  Mantener sesión iniciada
                </Label>
              </div>
            )}

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Spinner size="sm" />
              ) : mode === 'login' ? (
                <>
                  <LogIn className="h-4 w-4" />
                  Iniciar Sesión
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Registrarse
                </>
              )}
            </Button>
          </form>

          {/* Separador */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                O continúa con
              </span>
            </div>
          </div>

          {/* Botón de Google Identity Services */}
          <div className="flex justify-center">
            {!googleReady && <Spinner size="sm" />}
            <div id="google-signin-button"></div>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError(null)
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              disabled={isLoading}
            >
              {mode === 'login'
                ? '¿Tienes un código de invitación? Regístrate'
                : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function getErrorMessage(code: string): string {
  // Mensajes deliberadamente genéricos para auth/user-not-found y auth/wrong-password
  // — diferenciar le revela a un atacante qué emails están registrados (email
  // enumeration), útil para password spraying y phishing dirigido.
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Credenciales inválidas',
    'auth/invalid-email': 'Correo electrónico inválido',
    'auth/user-disabled': 'Usuario desactivado',
    'auth/user-not-found': 'Credenciales inválidas',
    'auth/wrong-password': 'Credenciales inválidas',
    'auth/email-already-in-use': 'Este correo ya está registrado',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
    'auth/popup-closed-by-user': 'Inicio de sesión cancelado',
    'auth/popup-blocked': 'El navegador bloqueó la ventana emergente. Habilita los popups.',
    'auth/cancelled-popup-request': 'Operación cancelada',
    'auth/account-exists-with-different-credential': 'Ya existe una cuenta con este email usando otro método',
    'unavailable': 'Servicio no disponible. Verifica tu conexión a internet.',
    'Firebase no está configurado correctamente': 'Error de configuración. Contacta al administrador.',
  }
  
  // Buscar por código exacto
  if (messages[code]) return messages[code]
  
  // Buscar si el mensaje contiene alguna de las claves
  const matchedKey = Object.keys(messages).find(key => code?.includes(key))
  if (matchedKey) return messages[matchedKey] ?? `Error de autenticación: ${code || 'Desconocido'}`
  
  // Error genérico con código para debugging
  return `Error de autenticación: ${code || 'Desconocido'}`
}
