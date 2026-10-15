/**
 * ReAuthConfirmDialog — modal de re-autenticación por acción.
 *
 * Diferente de <RequireReAuth> (que envuelve páginas completas).
 * Este dialog se usa POR ACCIÓN: cuando un admin quiere guardar un cambio
 * sensible, se le pide su contraseña en ese momento exacto — incluso si
 * ya pasó el gate de la página. Evita cambios accidentales si el dispositivo
 * queda desbloqueado con la sesión admin abierta.
 *
 * Uso:
 *   const [open, setOpen] = useState(false)
 *   <Button onClick={() => setOpen(true)}>Guardar</Button>
 *   <ReAuthConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     reason="para guardar la configuración de velocidad"
 *     onConfirmed={async () => { await writeToFirestore(...) }}
 *   />
 */

import { useState, useCallback, useEffect } from 'react'
import { reauthenticateWithCredential, reauthenticateWithPopup, EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/services/firebase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Spinner,
} from '@/components/ui'
import { ShieldAlert } from 'lucide-react'
import { logger } from '@/lib/logger'

interface ReAuthConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Frase que completa "Confirma tu identidad {reason}." Ej: "para guardar este cambio" */
  reason?: string
  /** Se llama DESPUÉS de que reauthenticate tenga éxito. Puede ser async. */
  onConfirmed: () => void | Promise<void>
  /** Para abrirlo encima de un <Sheet> de la piel nueva (z-100): sube el diálogo y su fondo por encima. */
  elevado?: boolean
}

export function ReAuthConfirmDialog({
  open,
  onOpenChange,
  reason = 'para confirmar este cambio',
  onConfirmed,
  elevado = false,
}: ReAuthConfirmDialogProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  // Limpiar estado al abrir
  useEffect(() => {
    if (open) {
      setPassword('')
      setError(null)
      setAttempts(0)
    }
  }, [open])

  // Quien entró con Google no tiene contraseña en esta app: se re-autentica con la ventana de Google.
  const esGoogle = auth.currentUser?.providerData[0]?.providerId === 'google.com'

  const handleConfirm = useCallback(async () => {
    const currentUser = auth.currentUser
    if (!currentUser?.email) {
      setError('No hay sesión activa. Vuelve a iniciar sesión.')
      return
    }
    const conGoogle = currentUser.providerData[0]?.providerId === 'google.com'
    if (!conGoogle && !password) {
      setError('Introduce tu contraseña para continuar.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (conGoogle) {
        await reauthenticateWithPopup(currentUser, new GoogleAuthProvider())
      } else {
        const credential = EmailAuthProvider.credential(currentUser.email, password)
        await reauthenticateWithCredential(currentUser, credential)
      }
      // Re-auth OK → ejecutar acción protegida
      onOpenChange(false)
      await onConfirmed()
    } catch (err) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError(`Contraseña incorrecta${newAttempts >= 3 ? ' — múltiples intentos fallidos' : ''}`)
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Cerraste la ventana de Google. Inténtalo de nuevo.')
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Espera unos minutos.')
      } else {
        setError(err instanceof Error ? err.message : 'Error de autenticación')
      }
      logger.error('[ReAuthConfirmDialog] Re-auth failed', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [password, attempts, onConfirmed, onOpenChange])

  const userEmail = auth.currentUser?.email ?? '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={elevado ? 'z-[130] max-w-sm' : 'max-w-sm'} overlayClassName={elevado ? 'z-[130]' : undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4 text-ink-warn" />
            Confirma tu identidad
          </DialogTitle>
          <DialogDescription className="text-xs">
            {esGoogle ? `Confirma con tu cuenta de Google ${reason}.` : `Introduce tu contraseña ${reason}.`}
            <span className="block mt-1 text-muted-foreground">
              Sesión activa: <span className="font-mono">{userEmail}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); handleConfirm() }}
          className="space-y-3"
        >
          {!esGoogle && (
            <div className="space-y-1.5">
              <Label htmlFor="reauth-dialog-pwd">Contraseña</Label>
              <Input
                id="reauth-dialog-pwd"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
                placeholder="••••••••"
              />
            </div>
          )}
          {error && <p className="text-xs text-cat-5-ink">{error}</p>}

          <DialogFooter className="gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={loading || (!esGoogle && !password)}>
              {loading ? <Spinner /> : esGoogle ? 'Confirmar con Google' : 'Confirmar y guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
