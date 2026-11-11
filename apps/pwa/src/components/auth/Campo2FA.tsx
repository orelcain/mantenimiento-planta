import { Input, Label } from '@/components/ui'
import { limpiarCodigo } from '@/services/mfa'

interface Campo2FAProps {
  valor: string
  onCambio: (valor: string) => void
  deshabilitado?: boolean
  id?: string
  autoFocus?: boolean
}

/**
 * Campo del código de 6 dígitos de la app autenticadora. Teclado numérico en el
 * teléfono y `one-time-code` para que iOS/Android ofrezcan pegarlo.
 */
export function Campo2FA({ valor, onCambio, deshabilitado, id = 'codigo-2fa', autoFocus = true }: Campo2FAProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Código de la app autenticadora</Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => onCambio(limpiarCodigo(e.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="123456"
        autoFocus={autoFocus}
        disabled={deshabilitado}
        className="text-center font-mono text-lg tracking-[0.4em]"
        required
      />
    </div>
  )
}
