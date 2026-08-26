/**
 * ¿El link se murió, o solo se cayó la conexión?
 *
 * POR QUÉ EXISTE
 * --------------
 * El monitor trataba CUALQUIER error del stream como link muerto:
 *
 *     () => setStatus('gone')
 *
 * y pintaba **«Este link ya no está disponible — pide uno nuevo a Mantención»**.
 * Con la señal caída en planta —que es donde se mira esta pantalla— eso manda a
 * un supervisor a hacer una gestión que no hace falta: el link está perfecto,
 * lo que falló fue la red. Y mientras tanto se pierde el turno de vista.
 *
 * Firestore distingue los dos casos en el código del error. Solo tres
 * significan de verdad «este link no sirve»: que no exista, que las reglas lo
 * corten (vencido o revocado) o que el token esté mal formado. Todo lo demás
 * —`unavailable`, `deadline-exceeded`, `internal`, `cancelled`, el offline del
 * navegador— es transitorio, y ante la duda se trata como transitorio: decir
 * «esperá, volvemos» y equivocarse cuesta una recarga; decir «tu link murió» y
 * equivocarse cuesta un llamado y un turno sin mirar.
 */

export type EstadoDelLink = 'gone' | 'sin-conexion'

/** Los únicos códigos que significan que el link REALMENTE no sirve. */
const MUERTO = new Set(['permission-denied', 'not-found', 'invalid-argument', 'unauthenticated'])

export function estadoDelLink(err: unknown): EstadoDelLink {
  const code = String(
    (err as { code?: unknown } | null)?.code ?? '',
  ).toLowerCase().replace(/^firestore\//, '')
  return MUERTO.has(code) ? 'gone' : 'sin-conexion'
}
