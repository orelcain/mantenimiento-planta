/**
 * canalCorreo — el punto donde se enchufa el envío de correo del informe.
 *
 * Hoy devuelve null: el informe por correo está construido (correoTurno.js) y
 * `enviarInformeDeTurno` sabe adjuntar el PDF, pero el canal todavía no está
 * decidido (SMTP con nodemailer o Microsoft Graph). Con null el correo no sale
 * aunque `notificationConfig` tenga destinatarios, y el envío lo dice en su
 * resultado (`motivo: 'sin-canal'`) y en el log.
 *
 * Para conectarlo, devolver una función con esta forma:
 *
 *   async ({ de, para, cc, asunto, html, adjuntos }) => ({ id })
 *     de       string|null       remitente (null = el del canal)
 *     para,cc  string[]          direcciones ya validadas
 *     adjuntos [{ nombre, contenido: Buffer, tipo }]
 *
 * y que LANCE si el correo no salió: un canal que devuelve error sin lanzar
 * deja el turno marcado como enviado sin que nadie lo haya recibido (pasó con
 * Telegram el 2026-08-19). Las credenciales van como secret de Firebase
 * (defineSecret), nunca en el repo.
 */
function canalCorreo() {
  return null
}

module.exports = { canalCorreo }
