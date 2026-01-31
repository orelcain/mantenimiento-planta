import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from '@/components/ui'
import { signIn, signUpWithInviteCode, signInWithGoogle } from '@/services/auth'
import { useAuthStore } from '@/store'
import { loginSchema, signUpSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { APP_VERSION } from '@/constants/version'

type AuthMode = 'login' | 'register'

// Componente SVG del logo de Google
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  
  const [mode, setMode] = useState<AuthMode>('login')
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Form fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setValidationErrors({})
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
      navigate('/')
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error('Authentication error')
      logger.error('Auth error', errorObj)
      setError(getErrorMessage((err as any).code || (err as any).message))
    } finally {
      setIsLoading(false)
    }
  }

  // Login con Google (usa redirect)
  const handleGoogleLogin = async () => {
    setError(null)
    setIsGoogleLoading(true)
    
    try {
      logger.info('Redirecting to Google sign in')
      await signInWithGoogle()
      // El usuario será redirigido a Google, luego de vuelta a la app
      // El resultado se maneja en App.tsx con handleGoogleRedirect()
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error('Google auth error')
      logger.error('Google auth error', errorObj)
      setError(getErrorMessage((err as any).code || (err as any).message))
      setIsGoogleLoading(false)
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

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
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

          {/* Botón de Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
            disabled={isLoading || isGoogleLoading}
          >
            {isGoogleLoading ? (
              <Spinner size="sm" />
            ) : (
              <>
                <GoogleIcon className="h-5 w-5 mr-2" />
                Continuar con Google
              </>
            )}
          </Button>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError(null)
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              disabled={isLoading || isGoogleLoading}
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
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Credenciales inválidas',
    'auth/invalid-email': 'Correo electrónico inválido',
    'auth/user-disabled': 'Usuario desactivado',
    'auth/user-not-found': 'Usuario no encontrado',
    'auth/wrong-password': 'Contraseña incorrecta',
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
