/**
 * Verificación en dos pasos (2FA) con app autenticadora (TOTP).
 *
 * Auditoría 10-11-2026: el único admin entraba solo con contraseña. Con TOTP,
 * quien adivine o robe la contraseña igual necesita el código de 6 dígitos que
 * genera la app del teléfono (Google Authenticator, Microsoft Authenticator…).
 *
 * Dónde se usa:
 *  - LoginPage: si la cuenta tiene 2FA, signIn lanza `auth/multi-factor-auth-required`
 *    y la página pide el código.
 *  - ReAuthConfirmDialog y RequireReAuth: re-autenticar a una cuenta con 2FA
 *    lanza el MISMO error; sin manejarlo, las acciones sensibles del admin se romperían.
 *  - SeguridadSettings: activar y desactivar el 2FA.
 *
 * Requiere el proveedor TOTP habilitado en Identity Platform (config del proyecto).
 * Si se pierde el teléfono, un admin lo quita con el Admin SDK:
 *   getAuth().updateUser(uid, { multiFactor: { enrolledFactors: null } })
 */
import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User as FirebaseUser,
  type UserCredential,
} from 'firebase/auth'
import { auth } from './firebase'

export const EMISOR_2FA = 'Mantención ANTARFOOD'

/** ¿El error es «falta el segundo paso»? (login o re-autenticación) */
export function pideSegundoPaso(err: unknown): err is MultiFactorError {
  return (err as { code?: string } | null)?.code === 'auth/multi-factor-auth-required'
}

export function resolverDe(err: MultiFactorError): MultiFactorResolver {
  return getMultiFactorResolver(auth, err)
}

/** Normaliza lo que escribe la persona: deja solo los dígitos. */
export function limpiarCodigo(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 6)
}

export function codigoCompleto(texto: string): boolean {
  return /^\d{6}$/.test(texto)
}

/** Completa el login o la re-autenticación con el código TOTP. */
export async function resolverConCodigo(resolver: MultiFactorResolver, codigo: string): Promise<UserCredential> {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)
  if (!hint) throw new Error('Tu cuenta pide un segundo paso que esta app no maneja. Avisa al administrador.')
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, limpiarCodigo(codigo))
  return resolver.resolveSignIn(assertion)
}

export function tiene2FA(user: FirebaseUser | null): boolean {
  return !!user && multiFactor(user).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID)
}

export interface Secreto2FA {
  secreto: TotpSecret
  /** otpauth://… para el QR */
  urlQr: string
  /** La clave en texto, por si la app no puede leer el QR */
  clave: string
}

/** Paso 1 de la activación. Puede lanzar `auth/requires-recent-login`. */
export async function generarSecreto2FA(user: FirebaseUser): Promise<Secreto2FA> {
  const sesion = await multiFactor(user).getSession()
  const secreto = await TotpMultiFactorGenerator.generateSecret(sesion)
  return {
    secreto,
    urlQr: secreto.generateQrCodeUrl(user.email ?? user.uid, EMISOR_2FA),
    clave: secreto.secretKey,
  }
}

/** Paso 2: confirma con el primer código que muestra la app. */
export async function activar2FA(user: FirebaseUser, secreto: TotpSecret, codigo: string): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secreto, limpiarCodigo(codigo))
  await multiFactor(user).enroll(assertion, 'App autenticadora')
}

/**
 * Firebase exige correo verificado para activar el 2FA (medido 11-11: el admin
 * no lo tenía). Manda el enlace; al volver, `recargarUsuario` refresca el estado.
 */
export async function enviarVerificacionCorreo(user: FirebaseUser): Promise<void> {
  const { sendEmailVerification } = await import('firebase/auth')
  await sendEmailVerification(user)
}

export async function recargarUsuario(user: FirebaseUser): Promise<boolean> {
  await user.reload()
  return auth.currentUser?.emailVerified ?? false
}

export async function desactivar2FA(user: FirebaseUser): Promise<void> {
  const factor = multiFactor(user).enrolledFactors.find((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID)
  if (factor) await multiFactor(user).unenroll(factor)
}

/** Mensaje en castellano para los errores del segundo paso. */
export function mensajeError2FA(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? ''
  if (code === 'auth/invalid-verification-code') return 'Código incorrecto. Revisa la app y escribe el código actual.'
  if (code === 'auth/code-expired' || code === 'auth/totp-challenge-timeout') return 'El código venció. Escribe el que muestra ahora la app.'
  if (code === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.'
  if (code === 'auth/requires-recent-login') return 'Por seguridad, vuelve a confirmar tu contraseña y repite el paso.'
  if (code === 'auth/operation-not-allowed') return 'El 2FA todavía no está habilitado en el proyecto. Avisa al administrador.'
  if (code === 'auth/unverified-email') return 'Tu correo no está verificado; Firebase lo exige para activar el 2FA.'
  return err instanceof Error ? err.message : 'No se pudo completar la verificación.'
}
