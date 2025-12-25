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
import { signIn, signUpWithInviteCode } from '@/services/auth'
import { useAuthStore } from '@/store'
import { loginSchema, signUpSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { APP_VERSION } from '@/constants/version'

type AuthMode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  
  const [mode, setMode] = useState<AuthMode>('login')
  const [isLoading, setIsLoading] = useState(false)
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
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Credenciales inválidas',
    'auth/invalid-email': 'Correo electrónico inválido',
    'auth/user-disabled': 'Usuario desactivado',
    'auth/user-not-found': 'Usuario no encontrado',
    'auth/wrong-password': 'Contraseña incorrecta',
    'auth/email-already-in-use': 'Este correo ya está registrado',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
  }
  return messages[code] || code
}
