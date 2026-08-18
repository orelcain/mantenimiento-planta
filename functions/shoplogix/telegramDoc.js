/**
 * telegramDoc — enviar un ARCHIVO a Telegram.
 *
 * Vive fuera de index.js para que se pueda importar y ejercitar de verdad. La
 * primera versión quedó adentro y, al querer probar el envío contra la API
 * real, la única opción era copiar el código al script de prueba: eso verifica
 * una copia, no lo que corre en producción.
 *
 * `callTelegramApi` manda JSON y sirve para todo lo demás, pero sendDocument
 * necesita multipart/form-data con el binario adentro. FormData y Blob son
 * nativos desde Node 18, así que no hace falta dependencia.
 *
 * Límite de Telegram: 50 MB por archivo, y 1024 caracteres de caption. Los
 * informes de turno pesan ~50 KB.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org'

/**
 * @param {string} chatId
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} [caption]  HTML
 * @param {object} [opts]     {topicId, logger}
 * @returns {Promise<object|null>} la respuesta de Telegram, o null si no hay token
 */
async function sendTelegramDocument(chatId, buffer, filename, caption, opts = {}) {
  const logger = opts.logger || console
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  try {
    const form = new FormData()
    form.append('chat_id', String(chatId || process.env.TELEGRAM_CHAT_ID))
    form.append('document', new Blob([buffer], { type: 'application/pdf' }), filename)
    if (caption) {
      form.append('caption', caption)
      form.append('parse_mode', 'HTML')
    }
    if (opts.topicId) form.append('message_thread_id', String(opts.topicId))
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendDocument`, { method: 'POST', body: form })
    const result = await response.json()
    if (!result.ok) logger.error('Telegram sendDocument error', result)
    return result
  } catch (error) {
    logger.error('Telegram sendDocument fetch error', error)
    return null
  }
}

module.exports = { sendTelegramDocument }
