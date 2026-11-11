/**
 * Configuración › Seguridad: verificación en dos pasos (2FA) con app autenticadora.
 *
 * Flujo de activación (services/mfa.ts):
 *  1. Correo verificado (Firebase lo exige). Si falta, se manda el enlace.
 *  2. Confirmar la contraseña (ReAuthConfirmDialog): generar el secreto pide un login reciente.
 *  3. Escanear el QR con la app y escribir el primer código → queda activo.
 * Desactivar también pide confirmar identidad (que ya incluye el código).
 */
import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck, ShieldAlert, Mail, Smartphone } from 'lucide-react'
import { Button, Card, CardContent, Spinner } from '@/components/ui'
import { ReAuthConfirmDialog } from '@/components/admin/ReAuthConfirmDialog'
import { Campo2FA } from '@/components/auth/Campo2FA'
import { auth } from '@/services/firebase'
import {
  activar2FA,
  codigoCompleto,
  desactivar2FA,
  enviarVerificacionCorreo,
  generarSecreto2FA,
  mensajeError2FA,
  recargarUsuario,
  tiene2FA,
  type Secreto2FA,
} from '@/services/mfa'

type Accion = 'activar' | 'desactivar' | null

export function SeguridadSettings() {
  const usuario = auth.currentUser
  const [, refrescar] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Accion>(null)
  const [secreto, setSecreto] = useState<Secreto2FA | null>(null)
  const [codigo, setCodigo] = useState('')

  if (!usuario) return null

  const conContrasena = usuario.providerData.some((p) => p.providerId === 'password')
  const activo = tiene2FA(usuario)

  const ejecutar = async (fn: () => Promise<void>) => {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await fn()
    } catch (err) {
      setError(mensajeError2FA(err))
    } finally {
      setOcupado(false)
      refrescar((n) => n + 1)
    }
  }

  const empezarActivacion = () => ejecutar(async () => { setSecreto(await generarSecreto2FA(usuario)) })

  const terminarActivacion = () =>
    ejecutar(async () => {
      if (!secreto) return
      await activar2FA(usuario, secreto.secreto, codigo)
      setSecreto(null)
      setCodigo('')
      setAviso('Listo: desde ahora, al entrar se pedirá el código de la app.')
    })

  const quitar = () =>
    ejecutar(async () => {
      await desactivar2FA(usuario)
      setAviso('Verificación en dos pasos desactivada.')
    })

  let cuerpo: React.ReactNode
  if (!conContrasena) {
    cuerpo = (
      <p className="text-sm text-muted-foreground">
        Tu cuenta entra con Google o Telegram. La verificación en dos pasos de esta app aplica a las cuentas con
        correo y contraseña.
      </p>
    )
  } else if (activo) {
    cuerpo = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-ink-ok" />
          Activada. Al entrar se pide el código de tu app autenticadora.
        </p>
        <Button variant="outline" onClick={() => setConfirmar('desactivar')} disabled={ocupado}>
          Desactivar
        </Button>
      </div>
    )
  } else if (!usuario.emailVerified) {
    cuerpo = (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ink-warn" />
          Antes hay que verificar tu correo ({usuario.email}). Te mandamos un enlace; ábrelo y vuelve aquí.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => ejecutar(async () => { await enviarVerificacionCorreo(usuario); setAviso('Enlace enviado. Revisa tu correo (y la carpeta de spam).') })} disabled={ocupado}>
            Enviar enlace
          </Button>
          <Button variant="outline" onClick={() => ejecutar(async () => { if (!(await recargarUsuario(usuario))) setAviso('Todavía figura sin verificar. Abre el enlace del correo e intenta de nuevo.') })} disabled={ocupado}>
            Ya lo verifiqué
          </Button>
        </div>
      </div>
    )
  } else if (secreto) {
    cuerpo = (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
          Escanea el código con Google Authenticator, Microsoft Authenticator u otra app autenticadora, y escribe el
          código de 6 dígitos que aparece.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-[22px] bg-white p-3">
            <QRCodeSVG value={secreto.urlQr} size={168} level="M" />
          </div>
          <div className="w-full min-w-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              ¿No puedes escanear? Escribe esta clave en la app:
              <span className="mt-1 block break-all font-mono text-sm text-foreground">{secreto.clave}</span>
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); void terminarActivacion() }}
              className="space-y-3"
            >
              <Campo2FA id="activar-2fa" valor={codigo} onCambio={setCodigo} deshabilitado={ocupado} />
              <div className="flex gap-2">
                <Button type="submit" disabled={ocupado || !codigoCompleto(codigo)}>
                  {ocupado ? <Spinner size="sm" /> : 'Activar'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setSecreto(null); setCodigo('') }} disabled={ocupado}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  } else {
    cuerpo = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-warn" />
          Desactivada. Hoy basta la contraseña para entrar a tu cuenta.
        </p>
        <Button onClick={() => setConfirmar('activar')} disabled={ocupado}>
          Activar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-title3 font-semibold">Verificación en dos pasos</h3>
        <p className="text-subhead text-muted-foreground">
          Además de la contraseña, se pide un código de 6 dígitos que genera una app en tu teléfono. Si alguien
          adivina o roba la contraseña, sin el teléfono no entra.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          {cuerpo}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}
        </CardContent>
      </Card>
      <ReAuthConfirmDialog
        open={confirmar !== null}
        onOpenChange={(abierto) => { if (!abierto) setConfirmar(null) }}
        reason={confirmar === 'desactivar' ? 'para desactivar la verificación en dos pasos' : 'para activar la verificación en dos pasos'}
        onConfirmed={async () => {
          const accion = confirmar
          setConfirmar(null)
          if (accion === 'activar') await empezarActivacion()
          if (accion === 'desactivar') await quitar()
        }}
      />
    </div>
  )
}
